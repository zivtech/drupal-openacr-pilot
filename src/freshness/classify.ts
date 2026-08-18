import type { Freshness, ObservationState } from "../domain/types.js";

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

function parseUtcTimestamp(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/u.exec(
    value,
  );
  if (match === null) {
    return null;
  }
  const milliseconds = Number((match[7] ?? "0").padEnd(3, "0"));
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const date = new Date(parsed);
  const parts = match.slice(1, 7).map(Number);
  if (
    date.getUTCFullYear() !== parts[0] ||
    date.getUTCMonth() + 1 !== parts[1] ||
    date.getUTCDate() !== parts[2] ||
    date.getUTCHours() !== parts[3] ||
    date.getUTCMinutes() !== parts[4] ||
    date.getUTCSeconds() !== parts[5] ||
    date.getUTCMilliseconds() !== milliseconds
  ) {
    return null;
  }
  return parsed;
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
  if (!Number.isFinite(nowMs)) {
    throw new RangeError("current time must be a finite epoch-millisecond value");
  }
  if (observationState !== "retrieved") {
    return unavailable(observationState, true, null);
  }

  const fetchedAtMs = parseUtcTimestamp(fetchedAt);
  if (fetchedAtMs === null) {
    return unavailable("unavailable", false, "invalid_fetched_at");
  }
  const freshUntilMs = fetchedAtMs + freshnessWindowMs;
  if (!Number.isFinite(freshUntilMs)) {
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
