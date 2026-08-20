const maximumDateEpochMilliseconds = 8_640_000_000_000_000;

export function isValidEpochMilliseconds(value: number): boolean {
  return Number.isSafeInteger(value) && Math.abs(value) <= maximumDateEpochMilliseconds;
}

export function parseStrictUtcTimestamp(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/u.exec(
    value,
  );
  if (match === null) return null;

  const parsed = Date.parse(value);
  if (!isValidEpochMilliseconds(parsed)) return null;

  const milliseconds = Number((match[7] ?? "0").padEnd(3, "0"));
  const parts = match.slice(1, 7).map(Number);
  const date = new Date(parsed);
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

export function isStrictUtcTimestamp(value: string): boolean {
  return parseStrictUtcTimestamp(value) !== null;
}
