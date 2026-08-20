import assert from "node:assert/strict";
import test from "node:test";

import { calculateRetry, parseRetryAfter } from "../../src/transport/retry.js";

const nowMs = Date.parse("2026-08-18T13:09:16Z");
const base = {
  attempt: 1,
  maximumAttempts: 3,
  retryAfterValue: null,
  nowMs,
  baseBackoffMs: 1_000,
  maximumBackoffMs: 30_000,
  maximumJitterMs: 250,
  randomValue: 0,
} as const;

test("parses exactly one delta-seconds or IMF-fixdate Retry-After value", () => {
  assert.deepEqual(parseRetryAfter(null, nowMs), { state: "absent", milliseconds: null });
  assert.deepEqual(parseRetryAfter("5", nowMs), {
    state: "valid_delta_seconds",
    milliseconds: 5_000,
  });
  assert.deepEqual(parseRetryAfter("Tue, 18 Aug 2026 13:09:21 GMT", nowMs), {
    state: "valid_http_date",
    milliseconds: 5_000,
  });
  assert.deepEqual(parseRetryAfter("Tue, 18 Aug 2020 13:09:21 GMT", nowMs), {
    state: "valid_http_date",
    milliseconds: 0,
  });
});

test("classifies malformed and combined values without splitting an HTTP-date comma", () => {
  assert.deepEqual(parseRetryAfter("not-a-date", nowMs), {
    state: "malformed",
    milliseconds: null,
  });
  assert.deepEqual(parseRetryAfter("5, 10", nowMs), {
    state: "multiple",
    milliseconds: null,
  });
  assert.deepEqual(parseRetryAfter("Tuesday, 18-Aug-26 13:09:21 GMT", nowMs), {
    state: "multiple",
    milliseconds: null,
  });
  assert.throws(
    () => parseRetryAfter("Tue, 18 Aug 2026 13:09:21 GMT", nowMs + 0.5),
    /retry clock/u,
  );
});

test("uses bounded exponential backoff plus floor jitter when no valid header exists", () => {
  assert.deepEqual(calculateRetry(base), {
    parseState: "absent",
    retryAfterMs: null,
    retryDelayMs: 1_000,
    shouldRetry: true,
    terminationReason: null,
  });
  assert.equal(
    calculateRetry({ ...base, attempt: 2, randomValue: 250 / 251 }).retryDelayMs,
    2_250,
  );
  assert.equal(
    calculateRetry({
      ...base,
      baseBackoffMs: 30_000,
      randomValue: 250 / 251,
    }).retryDelayMs,
    30_000,
  );
});

test("lets a valid bounded Retry-After win but keeps past dates above exponential", () => {
  assert.equal(calculateRetry({ ...base, retryAfterValue: "5" }).retryDelayMs, 5_000);
  assert.equal(
    calculateRetry({ ...base, retryAfterValue: "Tue, 18 Aug 2020 13:09:21 GMT" })
      .retryDelayMs,
    1_000,
  );
});

test("records excessive waits without sleeping and never schedules a fourth request", () => {
  assert.deepEqual(calculateRetry({ ...base, retryAfterValue: "120" }), {
    parseState: "valid_delta_seconds",
    retryAfterMs: 120_000,
    retryDelayMs: null,
    shouldRetry: false,
    terminationReason: "retry_after_exceeds_maximum",
  });
  assert.deepEqual(calculateRetry({ ...base, attempt: 3, retryAfterValue: "5" }), {
    parseState: "valid_delta_seconds",
    retryAfterMs: 5_000,
    retryDelayMs: null,
    shouldRetry: false,
    terminationReason: "attempt_limit",
  });
});

test("rejects invalid unit and random domains", () => {
  assert.throws(() => calculateRetry({ ...base, attempt: 0 }), /attempt/u);
  assert.throws(() => calculateRetry({ ...base, randomValue: 1 }), /random/u);
  assert.throws(() => calculateRetry({ ...base, baseBackoffMs: -1 }), /backoff/u);
  assert.throws(() => calculateRetry({ ...base, nowMs: nowMs + 0.5 }), /retry clock/u);
});
