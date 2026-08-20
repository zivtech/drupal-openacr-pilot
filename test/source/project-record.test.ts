import assert from "node:assert/strict";
import test from "node:test";

import { projectRecord } from "../../src/source/project-record.js";
import type { DrupalSourceIssue } from "../../src/domain/types.js";
import { buildSyntheticIssue } from "../fixtures/selection/synthetic-pages.js";

const pageSha = "a".repeat(64);
const fetchedAt = "2026-08-18T13:09:16Z";

function sourceIssue(
  issueId = 3_500_001,
  overrides: Readonly<Record<string, unknown>> = {},
): DrupalSourceIssue {
  return buildSyntheticIssue(issueId, overrides) as unknown as DrupalSourceIssue;
}

test("constructs a new allowlisted immutable record without excluded source fields", () => {
  const source = sourceIssue(3_500_001, { taxonomy_vocabulary_9: ["1101", "10", "2"] });
  const original = structuredClone(source);

  const record = projectRecord(source, { fetchedAt, sourcePageRepresentationSha256: pageSha });

  assert.notEqual(record.projection, source);
  assert.deepEqual(source, original);
  assert.deepEqual(record.projection.tag_ids, ["2", "10", "1101"]);
  assert.equal(Object.isFrozen(record), true);
  assert.equal(Object.isFrozen(record.projection), true);
  assert.equal(Object.isFrozen(record.projection.tag_ids), true);
  assert.equal("body" in record.projection, false);
  assert.equal("comments" in record.projection, false);
  assert.equal("profile" in record.projection, false);
  assert.match(record.canonical_sha256, /^[0-9a-f]{64}$/u);
});

test("is deterministic across excluded-field and source-key ordering changes", () => {
  const first = projectRecord(sourceIssue(), {
    fetchedAt,
    sourcePageRepresentationSha256: pageSha,
  });
  const secondSource = {
    ignored: "different excluded value",
    ...sourceIssue(),
    body: "different excluded narrative",
  } as DrupalSourceIssue;
  const second = projectRecord(secondSource, {
    fetchedAt,
    sourcePageRepresentationSha256: pageSha,
  });

  assert.equal(first.canonical_sha256, second.canonical_sha256);
  assert.deepEqual(first.projection, second.projection);
});

test("changes the canonical hash when retained evidence changes", () => {
  const first = projectRecord(sourceIssue(), {
    fetchedAt,
    sourcePageRepresentationSha256: pageSha,
  });
  const changed = projectRecord(sourceIssue(3_500_001, { title: "Changed retained title" }), {
    fetchedAt,
    sourcePageRepresentationSha256: pageSha,
  });

  assert.notEqual(first.canonical_sha256, changed.canonical_sha256);
});

test("rejects unsafe identity, identity mismatch, and missing creator credit", () => {
  assert.throws(
    () =>
      projectRecord(sourceIssue(3_500_001, { nid: "9007199254740992" }), {
        fetchedAt,
        sourcePageRepresentationSha256: pageSha,
      }),
    /safe non-negative integer/u,
  );
  assert.throws(
    () =>
      projectRecord(sourceIssue(3_500_001, { url: "https://www.drupal.org/project/drupal/issues/1" }), {
        fetchedAt,
        sourcePageRepresentationSha256: pageSha,
      }),
    /does not match canonical URL/u,
  );
  assert.throws(
    () =>
      projectRecord(sourceIssue(3_500_001, { creator: { id: "42", name: "" } }), {
        fetchedAt,
        sourcePageRepresentationSha256: pageSha,
      }),
    /creator credit/u,
  );
});
