import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { fetchPage, type FetchPageDependencies } from "../../src/transport/fetch-page.js";
import { NetworkRunTooSoonError } from "../../src/storage/network-run-start.js";
import type { PilotConfig } from "../../src/domain/types.js";
import {
  buildSyntheticPage,
  selectionUrl,
} from "../fixtures/selection/synthetic-pages.js";

const userAgent =
  "Zivtech-Drupal-OpenACR-Pilot/0.1 (+https://github.com/zivtech/drupal-openacr-pilot)";
const digest = "a".repeat(64);
const startMs = Date.parse("2026-08-18T13:09:16Z");
const config: PilotConfig = {
  config_version: "1.0.0",
  release_identity: "Drupal 11 release line / 11.x-dev",
  selection_url: selectionUrl,
  user_agent: userAgent,
  allowed_hosts: ["www.drupal.org"],
  max_records: 25,
  max_response_bytes: 2_097_152,
  request_timeout_ms: 30_000,
  max_attempts: 3,
  max_redirects: 3,
  base_backoff_ms: 1_000,
  max_backoff_ms: 30_000,
  max_jitter_ms: 250,
  freshness_window_ms: 86_400_000,
  minimum_live_run_interval_ms: 3_600_000,
  canonicalization_version: "drupal-issue-snapshot-jcs-v1",
  projection_schema_version: "1.0.0",
};

interface Harness {
  readonly repositoryRoot: string;
  readonly temporaryRoot: string;
  readonly calls: Array<{ readonly url: string; readonly init: RequestInit }>;
  readonly delays: number[];
  readonly dependencies: FetchPageDependencies;
}

async function withHarness(
  responses: readonly (Response | Error)[],
  run: (harness: Harness) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "openacr-fetch-test-"));
  const repositoryRoot = join(root, "repo");
  const temporaryRoot = join(root, "responses");
  const calls: Array<{ readonly url: string; readonly init: RequestInit }> = [];
  const delays: number[] = [];
  let responseIndex = 0;
  const dependencies: FetchPageDependencies = {
    fetch: async (url, init) => {
      calls.push({ url, init });
      const response = responses[responseIndex];
      responseIndex += 1;
      if (response instanceof Error) {
        throw response;
      }
      if (response === undefined) {
        throw new Error("synthetic fetch received an unexpected request");
      }
      return response;
    },
    now: () => startMs,
    random: () => 0,
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
    },
    setTimer: () => ({ synthetic: true }),
    clearTimer: () => undefined,
  };
  try {
    await mkdir(repositoryRoot);
    await run({ repositoryRoot, temporaryRoot, calls, delays, dependencies });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function successfulResponse(headers: Readonly<Record<string, string>> = {}): Response {
  return new Response(JSON.stringify(buildSyntheticPage()), {
    status: 200,
    headers,
  });
}

async function runFetch(harness: Harness, runId = "synthetic-run-1") {
  return fetchPage({
    config,
    configDigest: digest,
    repositoryRoot: harness.repositoryRoot,
    temporaryRoot: harness.temporaryRoot,
    runId,
    dependencies: harness.dependencies,
  });
}

test("collects one synthetic page, sends exact identity, retains next, and cleans source bytes", async () => {
  await withHarness(
    [
      successfulResponse({
        "content-length": "999999",
        "content-encoding": "gzip",
        "transfer-encoding": "chunked",
      }),
    ],
    async (harness) => {
      const result = await runFetch(harness);

      assert.equal(result.observationState, "retrieved");
      assert.equal(harness.calls.length, 1);
      assert.equal(harness.calls[0]?.url, selectionUrl);
      assert.equal(new Headers(harness.calls[0]?.init.headers).get("user-agent"), userAgent);
      assert.equal(harness.calls[0]?.init.redirect, "manual");
      assert.equal(result.page?.next, `${selectionUrl.slice(0, -1)}1`);
      assert.match(result.pageRepresentationSha256 ?? "", /^[0-9a-f]{64}$/u);
      assert.equal(result.http.declaredContentLengthBytes, 999999);
      assert.notEqual(result.http.representationBytes, 999999);
      assert.equal(result.http.contentEncoding, "gzip");
      assert.equal(result.http.transferEncoding, "chunked");
      assert.equal(result.deletionEvidence?.verification, "path_absent");
      assert.deepEqual(await readdir(harness.temporaryRoot), []);
    },
  );
});

test("retries 429 with exact delays and never retries permission responses", async () => {
  await withHarness(
    [new Response(null, { status: 429, headers: { "retry-after": "5" } }), successfulResponse()],
    async (harness) => {
      const result = await runFetch(harness);
      assert.equal(result.observationState, "retrieved");
      assert.equal(harness.calls.length, 2);
      assert.deepEqual(harness.delays, [5_000]);
      assert.equal(result.attempts[0]?.retryAfterMs, 5_000);
      assert.equal(result.attempts[0]?.retryDelayMs, 5_000);
      for (const call of harness.calls) {
        assert.equal(new Headers(call.init.headers).get("user-agent"), userAgent);
      }
    },
  );

  await withHarness([new Response(null, { status: 403 })], async (harness) => {
    const result = await runFetch(harness);
    assert.equal(result.observationState, "unavailable");
    assert.equal(result.terminationReason, "permission_unavailable");
    assert.equal(harness.calls.length, 1);
    assert.deepEqual(harness.delays, []);
  });
});

test("does not sleep an excessive Retry-After or issue a fourth request", async () => {
  await withHarness(
    [new Response(null, { status: 429, headers: { "retry-after": "120" } })],
    async (harness) => {
      const result = await runFetch(harness);
      assert.equal(result.terminationReason, "retry_after_exceeds_maximum");
      assert.deepEqual(harness.delays, []);
      assert.equal(harness.calls.length, 1);
    },
  );

  await withHarness(
    [
      new Response(null, { status: 503 }),
      new Response(null, { status: 503 }),
      new Response(null, { status: 503 }),
    ],
    async (harness) => {
      const result = await runFetch(harness);
      assert.equal(result.terminationReason, "attempt_limit");
      assert.deepEqual(harness.delays, [1_000, 2_000]);
      assert.equal(harness.calls.length, 3);
    },
  );
});

test("follows only bounded allowed-host HTTPS redirects with identity on every request", async () => {
  const allowedTarget = "https://www.drupal.org/api-d7/migrated-node.json";
  await withHarness(
    [new Response(null, { status: 302, headers: { location: allowedTarget } }), successfulResponse()],
    async (harness) => {
      const result = await runFetch(harness);
      assert.equal(result.observationState, "retrieved");
      assert.equal(result.finalUrl, allowedTarget);
      assert.equal(result.redirectCount, 1);
      assert.equal(harness.calls.length, 2);
      for (const call of harness.calls) {
        assert.equal(new Headers(call.init.headers).get("user-agent"), userAgent);
      }
    },
  );

  await withHarness(
    [new Response(null, { status: 302, headers: { location: "https://example.test/spoof" } })],
    async (harness) => {
      const result = await runFetch(harness);
      assert.equal(result.observationState, "unavailable");
      assert.equal(result.terminationReason, "redirect_not_allowed");
      assert.equal(harness.calls.length, 1);
    },
  );
});

test("fails closed and cleans bytes for invalid JSON, schema drift, invalid UTF-8, and oversize", async () => {
  const cases = [
    { response: new Response("{"), reason: "invalid_json" },
    { response: new Response(JSON.stringify({ self: selectionUrl })), reason: "schema_invalid" },
    { response: new Response(new Uint8Array([0xff])), reason: "invalid_utf8" },
    {
      response: new Response(new Uint8Array(config.max_response_bytes + 1)),
      reason: "response_too_large",
    },
  ] as const;

  for (const scenario of cases) {
    await withHarness([scenario.response], async (harness) => {
      const result = await runFetch(harness);
      assert.equal(result.observationState, "unavailable");
      assert.equal(result.terminationReason, scenario.reason);
      assert.deepEqual(await readdir(harness.temporaryRoot), []);
    });
  }
});

test("records timeout, DNS, TLS, and cancellation as unavailable without fallback data", async () => {
  for (const error of [
    Object.assign(new Error("timeout"), { name: "TimeoutError" }),
    Object.assign(new Error("dns"), { code: "ENOTFOUND" }),
    Object.assign(new Error("tls"), { code: "CERT_HAS_EXPIRED" }),
    Object.assign(new Error("cancel"), { name: "AbortError" }),
  ]) {
    await withHarness([error], async (harness) => {
      const result = await runFetch(harness);
      assert.equal(result.observationState, "unavailable");
      assert.equal(result.page, null);
      assert.equal(result.pageRepresentationSha256, null);
    });
  }
});

test("writes the durable traffic guard before fetch and blocks a second network run", async () => {
  await withHarness([successfulResponse()], async (harness) => {
    const first = await runFetch(harness, "synthetic-run-1");
    assert.equal(first.observationState, "retrieved");

    await assert.rejects(runFetch(harness, "synthetic-run-2"), NetworkRunTooSoonError);
    assert.equal(harness.calls.length, 1);
  });
});

test("cleans captured bytes and reports an unexpected processing failure without saying complete", async () => {
  await withHarness([successfulResponse()], async (harness) => {
    let cleaned = false;
    const dependencies: FetchPageDependencies = {
      ...harness.dependencies,
      captureResponseRepresentation: async () => ({
        filePath: "/synthetic/not-written",
        representationBytes: 3,
        sha256: digest,
        createdAt: "2026-08-18T13:09:16Z",
        readBytes: async () => {
          throw new Error("synthetic EIO");
        },
        cleanup: async () => {
          cleaned = true;
          return {
            representationCreatedAt: "2026-08-18T13:09:16Z",
            deletedAt: "2026-08-18T13:09:16Z",
            method: "unlink",
            verification: "path_absent",
            representationSha256: digest,
            representationBytes: 3,
            recovery: false,
          };
        },
      }),
    };
    const result = await fetchPage({
      config,
      configDigest: digest,
      repositoryRoot: harness.repositoryRoot,
      temporaryRoot: harness.temporaryRoot,
      runId: "synthetic-processing-failure",
      dependencies,
    });

    assert.equal(result.observationState, "unavailable");
    assert.equal(result.terminationReason, "response_processing_error");
    assert.equal(cleaned, true);
  });
});

test("uses and clears the injected 30000 ms abort timer", async () => {
  await withHarness([], async (harness) => {
    let scheduledMilliseconds: number | null = null;
    let cleared = false;
    const dependencies: FetchPageDependencies = {
      ...harness.dependencies,
      fetch: async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init.signal;
          assert.ok(signal);
          const rejectFromSignal = () => reject(signal.reason);
          if (signal.aborted) {
            rejectFromSignal();
          } else {
            signal.addEventListener("abort", rejectFromSignal, { once: true });
          }
        }),
      setTimer: (callback, milliseconds) => {
        scheduledMilliseconds = milliseconds;
        queueMicrotask(callback);
        return { synthetic: true };
      },
      clearTimer: () => {
        cleared = true;
      },
    };
    const result = await fetchPage({
      config,
      configDigest: digest,
      repositoryRoot: harness.repositoryRoot,
      temporaryRoot: harness.temporaryRoot,
      runId: "synthetic-timeout",
      dependencies,
    });

    assert.equal(result.terminationReason, "timeout");
    assert.equal(scheduledMilliseconds, 30_000);
    assert.equal(cleared, true);
  });
});
