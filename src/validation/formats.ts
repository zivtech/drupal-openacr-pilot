export function isStrictHttpsUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return (
    parsed.protocol === "https:" &&
    parsed.hostname.length > 0 &&
    parsed.username === "" &&
    parsed.password === ""
  );
}
