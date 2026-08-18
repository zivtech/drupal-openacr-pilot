import assert from "node:assert/strict";
import test from "node:test";

import {
  hashCanonicalJson,
  hashResponseRepresentation,
  ResponseRepresentationTooLargeError,
  sha256Bytes,
} from "../../src/integrity/hash.js";

test("matches the standard SHA-256 response-representation vectors", () => {
  assert.equal(
    sha256Bytes(Buffer.from("abc", "utf8")),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.equal(
    sha256Bytes(new Uint8Array()),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});

test("hashes a response representation only within the decoded-byte cap", () => {
  const result = hashResponseRepresentation(Buffer.from("abc", "utf8"), 3);

  assert.deepEqual(result, {
    representationBytes: 3,
    sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  });
  assert.throws(
    () => hashResponseRepresentation(new Uint8Array(2_097_153), 2_097_152),
    ResponseRepresentationTooLargeError,
  );
  assert.equal(
    hashResponseRepresentation(new Uint8Array(2_097_152), 2_097_152).representationBytes,
    2_097_152,
  );
  assert.throws(() => hashResponseRepresentation(new Uint8Array(), -1), /non-negative safe integer/u);
});

test("matches the plan's NFC and JCS projection vector", () => {
  const result = hashCanonicalJson({ b: 1, a: "é" });

  assert.equal(result.text, '{"a":"é","b":1}');
  assert.equal(result.byteLength, 16);
  assert.equal(result.sha256, "aa58fba8483623bed37c1b02edfccbdd9a53123837c20bfa4cb4049993a2872e");
});

test("produces the empty-object vector and changes when evidence changes", () => {
  const empty = hashCanonicalJson({});
  const first = hashCanonicalJson({ evidence: "first" });
  const changed = hashCanonicalJson({ evidence: "changed" });

  assert.equal(empty.text, "{}");
  assert.equal(empty.sha256, "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a");
  assert.notEqual(first.sha256, changed.sha256);
});
