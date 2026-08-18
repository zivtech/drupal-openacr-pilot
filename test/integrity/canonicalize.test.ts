import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { canonicalizeJson } from "../../src/integrity/canonicalize.js";
import { normalizeForCanonicalization } from "../../src/integrity/normalize.js";

async function loadFixture(name: string): Promise<unknown> {
  const path = join(process.cwd(), "test", "fixtures", "canonicalization", name);
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

test("canonicalizes reordered nested objects and NFC-equivalent strings identically", async () => {
  const first = canonicalizeJson(await loadFixture("reordered-a.json"));
  const second = canonicalizeJson(await loadFixture("reordered-b.json"));

  assert.equal(first.text, second.text);
  assert.deepEqual(first.bytes, second.bytes);
  assert.match(first.text, /"a":"é"/u);
});

test("matches the RFC 8785 ECMAScript primitive-number representation", async () => {
  const fixture = await loadFixture("rfc8785-primitives.json");
  const canonical = canonicalizeJson(fixture);

  assert.equal(
    canonical.text,
    '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27]}',
  );
});

test("preserves ordinary array order and numerically sorts only declared tag ID sets", () => {
  const input = {
    evidence: ["second", "first"],
    tag_ids: ["1101", "2", "10"],
  };

  const normalized = normalizeForCanonicalization(input);

  assert.deepEqual(normalized, {
    evidence: ["second", "first"],
    tag_ids: ["2", "10", "1101"],
  });
  assert.deepEqual(input.tag_ids, ["1101", "2", "10"]);
});

test("rejects non-I-JSON numbers, unsupported values, and invalid Unicode", () => {
  assert.throws(() => canonicalizeJson({ value: Number.NaN }), /finite JSON number/u);
  assert.throws(() => canonicalizeJson({ value: Number.POSITIVE_INFINITY }), /finite JSON number/u);
  assert.throws(() => canonicalizeJson({ value: undefined }), /unsupported JSON value/u);
  assert.throws(() => canonicalizeJson({ value: 1n }), /unsupported JSON value/u);
  assert.throws(() => canonicalizeJson({ value: "\ud800" }), /unpaired high surrogate/u);
});

test("rejects object keys that collide after Unicode normalization", () => {
  const input = { "é": 1, "é": 2 };

  assert.throws(() => canonicalizeJson(input), /duplicate key after NFC normalization/u);
});

test("rejects cyclic and non-plain-object inputs", () => {
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;

  assert.throws(() => canonicalizeJson(cyclic), /cyclic JSON value/u);
  assert.throws(() => canonicalizeJson(new Date()), /plain objects/u);
});

test("rejects non-JSON own properties and sparse arrays instead of erasing evidence", () => {
  const symbolEvidence: Record<PropertyKey, unknown> = { a: 1 };
  symbolEvidence[Symbol("evidence")] = 2;
  assert.throws(() => canonicalizeJson(symbolEvidence), /symbol-keyed properties/u);

  const sparse = new Array<unknown>(2);
  sparse[1] = "retained";
  assert.throws(() => canonicalizeJson(sparse), /sparse arrays/u);

  const accessor = {} as Record<string, unknown>;
  Object.defineProperty(accessor, "evidence", {
    enumerable: true,
    get: () => "hidden transformation",
  });
  assert.throws(() => canonicalizeJson(accessor), /data properties/u);
});
