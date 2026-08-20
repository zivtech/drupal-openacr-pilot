import type { RetryAfterParseState } from "../domain/types.js";
import { isValidEpochMilliseconds } from "../time/strict-utc.js";

const imfFixdate =
  /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/u;

export interface ParsedRetryAfter {
  readonly state: RetryAfterParseState;
  readonly milliseconds: number | null;
}

export interface RetryInput {
  readonly attempt: number;
  readonly maximumAttempts: number;
  readonly retryAfterValue: string | null;
  readonly nowMs: number;
  readonly baseBackoffMs: number;
  readonly maximumBackoffMs: number;
  readonly maximumJitterMs: number;
  readonly randomValue: number;
}

export interface RetryDecision {
  readonly parseState: RetryAfterParseState;
  readonly retryAfterMs: number | null;
  readonly retryDelayMs: number | null;
  readonly shouldRetry: boolean;
  readonly terminationReason: "attempt_limit" | "retry_after_exceeds_maximum" | null;
}

function validInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function parseRetryAfter(value: string | null, nowMs: number): ParsedRetryAfter {
  if (!isValidEpochMilliseconds(nowMs)) {
    throw new RangeError("retry clock must be a valid integer epoch-millisecond value");
  }
  if (value === null) {
    return Object.freeze({ state: "absent", milliseconds: null });
  }
  if (/^\d+$/u.test(value)) {
    const seconds = Number(value);
    if (!Number.isSafeInteger(seconds) || seconds > Math.floor(Number.MAX_SAFE_INTEGER / 1_000)) {
      return Object.freeze({ state: "malformed", milliseconds: null });
    }
    return Object.freeze({ state: "valid_delta_seconds", milliseconds: seconds * 1_000 });
  }
  if (imfFixdate.test(value)) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && new Date(parsed).toUTCString() === value) {
      return Object.freeze({
        state: "valid_http_date",
        milliseconds: Math.max(0, parsed - nowMs),
      });
    }
  }
  return Object.freeze({
    state: value.includes(",") ? "multiple" : "malformed",
    milliseconds: null,
  });
}

function assertRetryInput(input: RetryInput): void {
  if (!validInteger(input.attempt) || input.attempt < 1 || input.attempt > input.maximumAttempts) {
    throw new RangeError("attempt must be within 1..maximumAttempts");
  }
  if (!validInteger(input.maximumAttempts) || input.maximumAttempts < 1) {
    throw new RangeError("maximum attempts must be a positive safe integer");
  }
  if (
    !validInteger(input.baseBackoffMs) ||
    !validInteger(input.maximumBackoffMs) ||
    !validInteger(input.maximumJitterMs)
  ) {
    throw new RangeError("backoff and jitter units must be non-negative safe integer milliseconds");
  }
  if (!isValidEpochMilliseconds(input.nowMs)) {
    throw new RangeError("retry clock must be a valid integer epoch-millisecond value");
  }
  if (!(input.randomValue >= 0 && input.randomValue < 1)) {
    throw new RangeError("random value must satisfy 0 <= value < 1");
  }
}

export function calculateRetry(input: RetryInput): RetryDecision {
  assertRetryInput(input);
  const parsed = parseRetryAfter(input.retryAfterValue, input.nowMs);
  if (input.attempt === input.maximumAttempts) {
    return Object.freeze({
      parseState: parsed.state,
      retryAfterMs: parsed.milliseconds,
      retryDelayMs: null,
      shouldRetry: false,
      terminationReason: "attempt_limit",
    });
  }
  if (parsed.milliseconds !== null && parsed.milliseconds > input.maximumBackoffMs) {
    return Object.freeze({
      parseState: parsed.state,
      retryAfterMs: parsed.milliseconds,
      retryDelayMs: null,
      shouldRetry: false,
      terminationReason: "retry_after_exceeds_maximum",
    });
  }

  const exponentialMs = Math.min(
    input.maximumBackoffMs,
    input.baseBackoffMs * 2 ** (input.attempt - 1),
  );
  const retryDelayMs =
    parsed.milliseconds === null
      ? Math.min(
          input.maximumBackoffMs,
          exponentialMs + Math.floor(input.randomValue * (input.maximumJitterMs + 1)),
        )
      : Math.min(input.maximumBackoffMs, Math.max(exponentialMs, parsed.milliseconds));

  return Object.freeze({
    parseState: parsed.state,
    retryAfterMs: parsed.milliseconds,
    retryDelayMs,
    shouldRetry: true,
    terminationReason: null,
  });
}
