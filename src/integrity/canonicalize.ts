import canonicalize from "canonicalize";

import { normalizeForCanonicalization, type JsonValue } from "./normalize.js";

export interface CanonicalJson {
  readonly normalized: JsonValue;
  readonly text: string;
  readonly bytes: Uint8Array;
}

export function canonicalizeJson(value: unknown): CanonicalJson {
  const normalized = normalizeForCanonicalization(value);
  const text = canonicalize(normalized);
  if (text === undefined) {
    throw new TypeError("canonicalize returned no serialization for the JSON value");
  }

  return Object.freeze({
    normalized,
    text,
    bytes: new TextEncoder().encode(text),
  });
}
