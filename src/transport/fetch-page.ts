import type {
  DrupalPage,
  NetworkRunStart,
  PilotConfig,
  RetryAfterParseState,
} from "../domain/types.js";
import {
  captureResponseRepresentation,
  type DeletionEvidence,
  ResponseRepresentationCaptureError,
} from "../storage/response-representation.js";
import { admitNetworkRun } from "../storage/network-run-start.js";
import { validateDrupalPage } from "../validation/ajv.js";
import { classifyHttpStatus, classifyTransportError } from "./classify.js";
import { calculateRetry, parseRetryAfter } from "./retry.js";

export type FetchImplementation = (url: string, init: RequestInit) => Promise<Response>;

export interface FetchPageDependencies {
  readonly fetch: FetchImplementation;
  readonly now: () => number;
  readonly random: () => number;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly setTimer: (callback: () => void, milliseconds: number) => unknown;
  readonly clearTimer: (handle: unknown) => void;
  readonly captureResponseRepresentation?: typeof captureResponseRepresentation;
}

export interface FetchPageOptions {
  readonly config: PilotConfig;
  readonly configDigest: string;
  readonly repositoryRoot: string;
  readonly temporaryRoot: string;
  readonly runId: string;
  readonly dependencies: FetchPageDependencies;
  readonly signal?: AbortSignal;
}

export interface FetchAttemptEvidence {
  readonly attempt: number;
  readonly startedAt: string;
  readonly responseStatus: number | null;
  readonly retryAfterValue: string | null;
  readonly retryAfterParseState: RetryAfterParseState;
  readonly retryAfterMs: number | null;
  readonly retryDelayMs: number | null;
}

export interface FetchHttpEvidence {
  readonly status: number | null;
  readonly contentEncoding: string | null;
  readonly transferEncoding: string | null;
  readonly declaredContentLengthBytes: number | null;
  readonly representationBytes: number | null;
}

export interface FetchPageResult {
  readonly observationState: "retrieved" | "unavailable";
  readonly requestedUrl: string;
  readonly finalUrl: string | null;
  readonly fetchedAt: string;
  readonly http: FetchHttpEvidence;
  readonly attempts: readonly FetchAttemptEvidence[];
  readonly redirectCount: number;
  readonly page: DrupalPage | null;
  readonly pageRepresentationSha256: string | null;
  readonly deletionEvidence: DeletionEvidence | null;
  readonly terminationReason: string;
  readonly networkRunStart: NetworkRunStart;
}

interface RedirectSuccess {
  readonly ok: true;
  readonly response: Response;
  readonly finalUrl: string;
  readonly redirectCount: number;
}

interface RedirectFailure {
  readonly ok: false;
  readonly responseStatus: number | null;
  readonly finalUrl: string;
  readonly redirectCount: number;
  readonly reason: string;
}

type RedirectResult = RedirectSuccess | RedirectFailure;

const emptyHttp: FetchHttpEvidence = Object.freeze({
  status: null,
  contentEncoding: null,
  transferEncoding: null,
  declaredContentLengthBytes: null,
  representationBytes: null,
});

function timestamp(now: () => number): string {
  return new Date(now()).toISOString();
}

function attemptEvidence(
  attempt: number,
  startedAt: string,
  responseStatus: number | null,
  retryAfterValue: string | null,
  retryAfterParseState: RetryAfterParseState,
  retryAfterMs: number | null,
  retryDelayMs: number | null,
): FetchAttemptEvidence {
  return Object.freeze({
    attempt,
    startedAt,
    responseStatus,
    retryAfterValue,
    retryAfterParseState,
    retryAfterMs,
    retryDelayMs,
  });
}

function unavailableResult(
  options: FetchPageOptions,
  networkRunStart: NetworkRunStart,
  attempts: readonly FetchAttemptEvidence[],
  reason: string,
  overrides: Partial<FetchPageResult> = {},
): FetchPageResult {
  return Object.freeze({
    observationState: "unavailable",
    requestedUrl: options.config.selection_url,
    finalUrl: null,
    fetchedAt: timestamp(options.dependencies.now),
    http: emptyHttp,
    attempts: Object.freeze([...attempts]),
    redirectCount: 0,
    page: null,
    pageRepresentationSha256: null,
    deletionEvidence: null,
    terminationReason: reason,
    networkRunStart,
    ...overrides,
  });
}

async function cancelBody(response: Response): Promise<void> {
  if (response.body !== null) {
    await response.body.cancel().catch(() => undefined);
  }
}

async function requestOnce(
  url: string,
  options: FetchPageOptions,
): Promise<Response> {
  const controller = new AbortController();
  const onExternalAbort = () => {
    controller.abort(options.signal?.reason ?? new DOMException("request aborted", "AbortError"));
  };
  if (options.signal !== undefined) {
    if (options.signal.aborted) {
      onExternalAbort();
    } else {
      options.signal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }
  const timer = options.dependencies.setTimer(() => {
    controller.abort(new DOMException("request timed out", "TimeoutError"));
  }, options.config.request_timeout_ms);
  try {
    return await options.dependencies.fetch(url, {
      headers: { "user-agent": options.config.user_agent },
      redirect: "manual",
      signal: controller.signal,
    });
  } finally {
    options.dependencies.clearTimer(timer);
    options.signal?.removeEventListener("abort", onExternalAbort);
  }
}

function allowedRedirect(location: string, currentUrl: string, config: PilotConfig): string | null {
  let target;
  try {
    target = new URL(location, currentUrl);
  } catch {
    return null;
  }
  if (
    target.protocol !== "https:" ||
    target.username !== "" ||
    target.password !== "" ||
    (target.port !== "" && target.port !== "443") ||
    !(config.allowed_hosts as readonly string[]).includes(target.hostname)
  ) {
    return null;
  }
  return target.toString();
}

async function fetchWithRedirects(options: FetchPageOptions): Promise<RedirectResult> {
  let currentUrl = options.config.selection_url;
  let redirectCount = 0;
  while (true) {
    const response = await requestOnce(currentUrl, options);
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return Object.freeze({ ok: true, response, finalUrl: currentUrl, redirectCount });
    }
    const location = response.headers.get("location");
    await cancelBody(response);
    if (location === null) {
      return Object.freeze({
        ok: false,
        responseStatus: response.status,
        finalUrl: currentUrl,
        redirectCount,
        reason: "redirect_missing_location",
      });
    }
    if (redirectCount >= options.config.max_redirects) {
      return Object.freeze({
        ok: false,
        responseStatus: response.status,
        finalUrl: currentUrl,
        redirectCount,
        reason: "redirect_limit",
      });
    }
    const target = allowedRedirect(location, currentUrl, options.config);
    if (target === null) {
      return Object.freeze({
        ok: false,
        responseStatus: response.status,
        finalUrl: currentUrl,
        redirectCount,
        reason: "redirect_not_allowed",
      });
    }
    redirectCount += 1;
    currentUrl = target;
  }
}

function parseContentLength(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  if (!/^(?:0|[1-9]\d*)$/u.test(value)) {
    throw new TypeError("Content-Length must be one non-negative decimal integer");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new RangeError("Content-Length exceeds the safe integer range");
  }
  return parsed;
}

async function processRetrievedResponse(
  response: Response,
  finalUrl: string,
  redirectCount: number,
  options: FetchPageOptions,
  networkRunStart: NetworkRunStart,
  attempts: readonly FetchAttemptEvidence[],
): Promise<FetchPageResult> {
  const contentEncoding = response.headers.get("content-encoding");
  const transferEncoding = response.headers.get("transfer-encoding");
  let declaredContentLengthBytes;
  try {
    declaredContentLengthBytes = parseContentLength(response.headers.get("content-length"));
  } catch {
    await cancelBody(response);
    return unavailableResult(options, networkRunStart, attempts, "invalid_content_length", {
      finalUrl,
      redirectCount,
      http: Object.freeze({
        status: response.status,
        contentEncoding,
        transferEncoding,
        declaredContentLengthBytes: null,
        representationBytes: null,
      }),
    });
  }
  if (response.body === null) {
    return unavailableResult(options, networkRunStart, attempts, "missing_response_body", {
      finalUrl,
      redirectCount,
      http: Object.freeze({
        status: response.status,
        contentEncoding,
        transferEncoding,
        declaredContentLengthBytes,
        representationBytes: null,
      }),
    });
  }

  let capture;
  try {
    const captureImplementation =
      options.dependencies.captureResponseRepresentation ?? captureResponseRepresentation;
    capture = await captureImplementation({
      body: response.body,
      temporaryRoot: options.temporaryRoot,
      runId: options.runId,
      maximumBytes: options.config.max_response_bytes,
      createdAt: timestamp(options.dependencies.now),
    });
  } catch (error) {
    return unavailableResult(
      options,
      networkRunStart,
      attempts,
      error instanceof ResponseRepresentationCaptureError
        ? "response_too_large"
        : "response_stream_error",
      {
        finalUrl,
        redirectCount,
        http: Object.freeze({
          status: response.status,
          contentEncoding,
          transferEncoding,
          declaredContentLengthBytes,
          representationBytes: null,
        }),
      },
    );
  }

  let page: DrupalPage | null = null;
  let terminationReason = "complete";
  try {
    const bytes = await capture.readBytes();
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      terminationReason = "invalid_utf8";
    }
    if (terminationReason === "complete") {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text as string) as unknown;
      } catch {
        terminationReason = "invalid_json";
      }
      if (terminationReason === "complete") {
        const validation = validateDrupalPage(parsed);
        if (validation.ok) {
          page = validation.value;
        } else {
          terminationReason = "schema_invalid";
        }
      }
    }
  } catch {
    terminationReason = "response_processing_error";
  }
  const deletionEvidence = await capture.cleanup(timestamp(options.dependencies.now));
  const http = Object.freeze({
    status: response.status,
    contentEncoding,
    transferEncoding,
    declaredContentLengthBytes,
    representationBytes: capture.representationBytes,
  });
  if (page !== null) {
    return Object.freeze({
      observationState: "retrieved",
      requestedUrl: options.config.selection_url,
      finalUrl,
      fetchedAt: timestamp(options.dependencies.now),
      http,
      attempts: Object.freeze([...attempts]),
      redirectCount,
      page,
      pageRepresentationSha256: capture.sha256,
      deletionEvidence,
      terminationReason: "complete",
      networkRunStart,
    });
  }
  return unavailableResult(options, networkRunStart, attempts, terminationReason, {
    finalUrl,
    redirectCount,
    http,
    pageRepresentationSha256: capture.sha256,
    deletionEvidence,
  });
}

export async function fetchPage(options: FetchPageOptions): Promise<FetchPageResult> {
  const networkRunStart = await admitNetworkRun({
    repositoryRoot: options.repositoryRoot,
    runId: options.runId,
    nowMs: options.dependencies.now(),
    configDigest: options.configDigest,
    config: options.config,
  });
  const attempts: FetchAttemptEvidence[] = [];

  for (let attempt = 1; attempt <= options.config.max_attempts; attempt += 1) {
    const startedAt = timestamp(options.dependencies.now);
    let redirected;
    try {
      redirected = await fetchWithRedirects(options);
    } catch (error) {
      const classification = classifyTransportError(error);
      attempts.push(attemptEvidence(attempt, startedAt, null, null, "absent", null, null));
      return unavailableResult(options, networkRunStart, attempts, classification.reason);
    }
    if (!redirected.ok) {
      attempts.push(
        attemptEvidence(
          attempt,
          startedAt,
          redirected.responseStatus,
          null,
          "absent",
          null,
          null,
        ),
      );
      return unavailableResult(options, networkRunStart, attempts, redirected.reason, {
        finalUrl: redirected.finalUrl,
        redirectCount: redirected.redirectCount,
      });
    }

    const { response, finalUrl, redirectCount } = redirected;
    const classification = classifyHttpStatus(response.status, "selection");
    const retryAfterValue = response.headers.get("retry-after");
    if (classification.retryable) {
      const retry = calculateRetry({
        attempt,
        maximumAttempts: options.config.max_attempts,
        retryAfterValue,
        nowMs: options.dependencies.now(),
        baseBackoffMs: options.config.base_backoff_ms,
        maximumBackoffMs: options.config.max_backoff_ms,
        maximumJitterMs: options.config.max_jitter_ms,
        randomValue: options.dependencies.random(),
      });
      attempts.push(
        attemptEvidence(
          attempt,
          startedAt,
          response.status,
          retryAfterValue,
          retry.parseState,
          retry.retryAfterMs,
          retry.retryDelayMs,
        ),
      );
      await cancelBody(response);
      if (retry.shouldRetry && retry.retryDelayMs !== null) {
        await options.dependencies.sleep(retry.retryDelayMs);
        continue;
      }
      return unavailableResult(
        options,
        networkRunStart,
        attempts,
        retry.terminationReason ?? classification.reason,
        { finalUrl, redirectCount },
      );
    }

    const parsedRetryAfter = parseRetryAfter(retryAfterValue, options.dependencies.now());
    attempts.push(
      attemptEvidence(
        attempt,
        startedAt,
        response.status,
        retryAfterValue,
        parsedRetryAfter.state,
        parsedRetryAfter.milliseconds,
        null,
      ),
    );
    if (classification.observationState !== "retrieved") {
      await cancelBody(response);
      return unavailableResult(options, networkRunStart, attempts, classification.reason, {
        finalUrl,
        redirectCount,
        http: Object.freeze({
          status: response.status,
          contentEncoding: response.headers.get("content-encoding"),
          transferEncoding: response.headers.get("transfer-encoding"),
          declaredContentLengthBytes: null,
          representationBytes: null,
        }),
      });
    }
    return processRetrievedResponse(
      response,
      finalUrl,
      redirectCount,
      options,
      networkRunStart,
      attempts,
    );
  }

  throw new Error("unreachable retry loop termination");
}
