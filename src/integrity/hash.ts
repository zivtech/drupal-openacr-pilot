import { createHash } from "node:crypto";

import { canonicalizeJson } from "./canonicalize.js";

export class ResponseRepresentationTooLargeError extends RangeError {
  public readonly actualBytes: number;
  public readonly maximumBytes: number;

  public constructor(actualBytes: number, maximumBytes: number) {
    super(`response representation is ${actualBytes} bytes; maximum is ${maximumBytes} bytes`);
    this.name = "ResponseRepresentationTooLargeError";
    this.actualBytes = actualBytes;
    this.maximumBytes = maximumBytes;
  }
}

export interface ResponseRepresentationHash {
  readonly representationBytes: number;
  readonly sha256: string;
}

export interface CanonicalJsonHash {
  readonly text: string;
  readonly bytes: Uint8Array;
  readonly byteLength: number;
  readonly sha256: string;
}

export function sha256Bytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashResponseRepresentation(
  value: Uint8Array,
  maximumBytes = 2_097_152,
): ResponseRepresentationHash {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) {
    throw new RangeError("maximum response-representation bytes must be a non-negative safe integer");
  }
  if (value.byteLength > maximumBytes) {
    throw new ResponseRepresentationTooLargeError(value.byteLength, maximumBytes);
  }

  return Object.freeze({
    representationBytes: value.byteLength,
    sha256: sha256Bytes(value),
  });
}

export function hashCanonicalJson(value: unknown): CanonicalJsonHash {
  const canonical = canonicalizeJson(value);
  return Object.freeze({
    text: canonical.text,
    bytes: canonical.bytes,
    byteLength: canonical.bytes.byteLength,
    sha256: sha256Bytes(canonical.bytes),
  });
}
