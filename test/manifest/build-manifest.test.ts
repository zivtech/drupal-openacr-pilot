import assert from "node:assert/strict";
import test from "node:test";

import {
  buildManifest,
  hashManifestPayload,
  type ManifestHashPayload,
} from "../../src/manifest/build-manifest.js";

const vector: ManifestHashPayload = {
  schema_version: "1.0.0",
  config_digest: "cfg",
  selection_receipt_sha256: "receipt",
  ordered_records: [{ issue_id: 1, canonical_sha256: "aaa" }],
};

test("matches the pinned manifest hash and snapshot ID vector", () => {
  const result = hashManifestPayload(vector);

  assert.equal(result.sha256, "1795350dd3a6f00a164fc5659d9618aaeaa4a9bf45609387e1b6af5c0978bc6b");
  assert.equal(result.snapshotId, "drupal11-issue-snapshot-1795350dd3a6f00a");
});

test("builds a deterministic schema-valid manifest", () => {
  const input = {
    configDigest: "a".repeat(64),
    selectionReceiptSha256: "b".repeat(64),
    orderedRecords: [{ issue_id: 2, canonical_sha256: "c".repeat(64) }],
    createdAt: "2026-08-18T13:09:16Z",
    freshness: "fresh" as const,
    freshUntil: "2026-08-19T13:09:16Z",
    priorSnapshotId: null,
  };

  assert.deepEqual(buildManifest(input), buildManifest(input));
});

test("binds receipt evidence into the manifest even when membership is unchanged", () => {
  const common = {
    configDigest: "a".repeat(64),
    orderedRecords: [{ issue_id: 2, canonical_sha256: "c".repeat(64) }],
    createdAt: "2026-08-18T13:09:16Z",
    freshness: "fresh" as const,
    freshUntil: "2026-08-19T13:09:16Z",
    priorSnapshotId: null,
  };
  const first = buildManifest({ ...common, selectionReceiptSha256: "b".repeat(64) });
  const changed = buildManifest({ ...common, selectionReceiptSha256: "d".repeat(64) });

  assert.notEqual(first.manifest_sha256, changed.manifest_sha256);
  assert.notEqual(first.snapshot_id, changed.snapshot_id);
});

test("rejects duplicate, unsafe, or non-descending ordered membership", () => {
  const common = {
    configDigest: "a".repeat(64),
    selectionReceiptSha256: "b".repeat(64),
    createdAt: "2026-08-18T13:09:16Z",
    freshness: "fresh" as const,
    freshUntil: "2026-08-19T13:09:16Z",
    priorSnapshotId: null,
  };
  assert.throws(
    () =>
      buildManifest({
        ...common,
        orderedRecords: [
          { issue_id: 2, canonical_sha256: "c".repeat(64) },
          { issue_id: 2, canonical_sha256: "d".repeat(64) },
        ],
      }),
    /strictly descending/u,
  );
  assert.throws(
    () =>
      buildManifest({
        ...common,
        orderedRecords: [
          { issue_id: 1, canonical_sha256: "c".repeat(64) },
          { issue_id: 2, canonical_sha256: "d".repeat(64) },
        ],
      }),
    /strictly descending/u,
  );
  assert.throws(
    () =>
      buildManifest({
        ...common,
        orderedRecords: [
          { issue_id: Number.MAX_SAFE_INTEGER + 1, canonical_sha256: "c".repeat(64) },
        ],
      }),
    /safe non-negative integer/u,
  );
});
