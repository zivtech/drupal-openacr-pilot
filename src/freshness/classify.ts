import type { Freshness, ObservationState } from "../domain/types.js";
import { isValidEpochMilliseconds, parseStrictUtcTimestamp } from "../time/strict-utc.js";

export interface FreshnessResult {
  readonly valid: boolean;
  readonly observationState: ObservationState;
  readonly freshness: Freshness;
  readonly freshUntil: string | null;
  readonly reason: "invalid_fetched_at" | null;
}

function unavailable(
  observationState: ObservationState,
  valid: boolean,
  reason: "invalid_fetched_at" | null,
): FreshnessResult {
  return Object.freeze({
    valid,
    observationState,
    freshness: "unavailable",
    freshUntil: null,
    reason,
  });
}

export function classifyFreshness(
  observationState: ObservationState,
  fetchedAt: string,
  freshnessWindowMs: number,
  nowMs: number,
): FreshnessResult {
  if (!Number.isSafeInteger(freshnessWindowMs) || freshnessWindowMs < 0) {
    throw new RangeError("freshness window must be a non-negative safe integer in milliseconds");
  }
  if (!isValidEpochMilliseconds(nowMs)) {
    throw new RangeError("current time must be a valid integer epoch-millisecond value");
  }
  if (observationState !== "retrieved") {
    return unavailable(observationState, true, null);
  }

  const fetchedAtMs = parseStrictUtcTimestamp(fetchedAt);
  if (fetchedAtMs === null) {
    return unavailable("unavailable", false, "invalid_fetched_at");
  }
  const freshUntilMs = fetchedAtMs + freshnessWindowMs;
  if (!isValidEpochMilliseconds(freshUntilMs)) {
    return unavailable("unavailable", false, "invalid_fetched_at");
  }

  return Object.freeze({
    valid: true,
    observationState: "retrieved",
    freshness: nowMs < freshUntilMs ? "fresh" : "stale",
    freshUntil: new Date(freshUntilMs).toISOString(),
    reason: null,
  });
}
