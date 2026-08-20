import assert from "node:assert/strict";
import test from "node:test";

import { classifyFreshness } from "../../src/freshness/classify.js";

const fetchedAt = "2026-08-18T13:09:16Z";
const windowMs = 86_400_000;

test("classifies a retrieved observation as fresh strictly before the boundary", () => {
  assert.deepEqual(
    classifyFreshness("retrieved", fetchedAt, windowMs, Date.parse("2026-08-19T13:09:15Z")),
    {
      valid: true,
      observationState: "retrieved",
      freshness: "fresh",
      freshUntil: "2026-08-19T13:09:16.000Z",
      reason: null,
    },
  );
});

test("classifies equality and later times as stale", () => {
  assert.equal(
    classifyFreshness("retrieved", fetchedAt, windowMs, Date.parse("2026-08-19T13:09:16Z"))
      .freshness,
    "stale",
  );
  assert.equal(
    classifyFreshness("retrieved", fetchedAt, windowMs, Date.parse("2026-08-20T13:09:16Z"))
      .freshness,
    "stale",
  );
});

test("makes every non-retrieved observation unavailable regardless of timestamps", () => {
  for (const state of [
    "unavailable",
    "resource_gone",
    "redirected_or_migrated",
    "not_in_selection",
  ] as const) {
    const result = classifyFreshness(state, fetchedAt, windowMs, Date.parse(fetchedAt));
    assert.equal(result.freshness, "unavailable");
    assert.equal(result.freshUntil, null);
    assert.equal(result.observationState, state);
  }
});

test("turns invalid retrieval times and invalid millisecond domains into unavailable", () => {
  assert.deepEqual(classifyFreshness("retrieved", "not-a-time", windowMs, Date.parse(fetchedAt)), {
    valid: false,
    observationState: "unavailable",
    freshness: "unavailable",
    freshUntil: null,
    reason: "invalid_fetched_at",
  });
  assert.equal(
    classifyFreshness("retrieved", "2026-02-30T13:09:16Z", windowMs, Date.parse(fetchedAt)).valid,
    false,
  );
  assert.throws(() => classifyFreshness("retrieved", fetchedAt, -1, Date.parse(fetchedAt)), /window/u);
  assert.throws(() => classifyFreshness("retrieved", fetchedAt, windowMs, Number.NaN), /current time/u);
  assert.throws(
    () => classifyFreshness("retrieved", fetchedAt, windowMs, Date.parse(fetchedAt) + 0.5),
    /current time/u,
  );
});
