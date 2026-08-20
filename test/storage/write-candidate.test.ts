import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildManifest } from "../../src/manifest/build-manifest.js";
import { buildSelectionReceipt } from "../../src/receipt/build-receipt.js";
import { hashCanonicalJson } from "../../src/integrity/hash.js";
import { projectRecord } from "../../src/source/project-record.js";
import { writeCandidate, CandidateCollisionError } from "../../src/storage/write-candidate.js";
import type {
  DeletionReceipt,
  DrupalSourceIssue,
  PilotConfig,
  RetainedRecord,
  SelectionReceipt,
} from "../../src/domain/types.js";
import { buildSyntheticIssue, selectionUrl } from "../fixtures/selection/synthetic-pages.js";

const pageDigest = "a".repeat(64);
const timestamp = "2026-08-18T13:09:16Z";
const pilotConfig: PilotConfig = {
  config_version: "1.0.0",
  release_identity: "Drupal 11 release line / 11.x-dev",
  selection_url: selectionUrl,
  user_agent: "Zivtech-Drupal-OpenACR-Pilot/0.1 (+https://github.com/zivtech/drupal-openacr-pilot)",
  allowed_hosts: ["www.drupal.org"],
  max_records: 25,
  max_response_bytes: 2_097_152,
  request_timeout_ms: 30_000,
  max_attempts: 3,
  max_redirects: 3,
  base_backoff_ms: 1_000,
  max_backoff_ms: 30_000,
  max_jitter_ms: 250,
  freshness_window_ms: 86_400_000,
  minimum_live_run_interval_ms: 3_600_000,
  canonicalization_version: "drupal-issue-snapshot-jcs-v1",
  projection_schema_version: "1.0.0",
};
const configDigest = hashCanonicalJson(pilotConfig).sha256;

function candidateFixture() {
  const record = projectRecord(
    buildSyntheticIssue(3_500_001) as unknown as DrupalSourceIssue,
    { fetchedAt: timestamp, sourcePageRepresentationSha256: pageDigest },
  );
  const receipt = buildSelectionReceipt({
    schema_version: "1.0.0",
    config_digest: configDigest,
    requested_url: selectionUrl,
    final_url: selectionUrl,
    user_agent: "Zivtech-Drupal-OpenACR-Pilot/0.1 (+https://github.com/zivtech/drupal-openacr-pilot)",
    fetched_at: timestamp,
    observation_state: "retrieved",
    http: {
      status: 200,
      content_encoding: null,
      transfer_encoding: "chunked",
      declared_content_length_bytes: null,
      representation_bytes: 3,
    },
    attempts: [
      {
        attempt: 1,
        started_at: timestamp,
        response_status: 200,
        retry_after_value: null,
        retry_after_parse_state: "absent",
        retry_after_ms: null,
        retry_delay_ms: null,
      },
    ],
    pagination: { self: selectionUrl, first: selectionUrl, last: selectionUrl, next: null },
    ordered_ids: ["3500001"],
    page_representation_sha256: pageDigest,
    termination_reason: "complete",
  });
  const manifest = buildManifest({
    configDigest,
    selectionReceiptSha256: receipt.selection_receipt_sha256,
    orderedRecords: [{ issue_id: 3_500_001, canonical_sha256: record.canonical_sha256 }],
    createdAt: timestamp,
    freshness: "fresh",
    freshUntil: "2026-08-19T13:09:16Z",
    priorSnapshotId: null,
  });
  const deletionReceipt: DeletionReceipt = {
    schema_version: "1.0.0",
    record_id: "delete-synthetic-run-1",
    run_id: "synthetic-run-1",
    snapshot_candidate_id: manifest.snapshot_id,
    representation_created_at: "2026-08-18T13:09:14Z",
    deleted_at: timestamp,
    cleanup_deadline: "2026-08-18T14:09:14Z",
    method: "unlink",
    verification: "path_absent",
    backup_cache_disposition: "not_backed_up_or_cached",
    exception_status: "none",
    representation_sha256: pageDigest,
    representation_bytes: 3,
    recovery: false,
  };
  return { config: pilotConfig, record, receipt, manifest, deletionReceipt };
}

async function withRepository(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "openacr-candidate-test-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("writes a complete candidate in staging and atomically finalizes it", async () => {
  await withRepository(async (root) => {
    const fixture = candidateFixture();
    const result = await writeCandidate({
      repositoryRoot: root,
      candidateRoot: join(root, "var", "candidates"),
      runId: "synthetic-run-1",
      ...fixture,
      records: [fixture.record],
      provenanceMarkdown: "# Synthetic provenance\n\nNot an evaluation or ACR.\n",
    });

    assert.equal(result.disposition, "created");
    assert.equal(result.finalPath, join(root, "var", "candidates", fixture.manifest.snapshot_id));
    assert.deepEqual((await readdir(result.finalPath)).sort(), [
      "deletion-receipt.json",
      "manifest.json",
      "provenance.md",
      "receipt.json",
      "records",
    ]);
    assert.deepEqual(await readdir(join(root, "var", "candidates", ".staging")), []);
  });
});

test("reports an identical existing candidate without changing its bytes", async () => {
  await withRepository(async (root) => {
    const fixture = candidateFixture();
    const common = {
      repositoryRoot: root,
      candidateRoot: join(root, "var", "candidates"),
      ...fixture,
      records: [fixture.record],
      provenanceMarkdown: "# Synthetic provenance\n",
    };
    const first = await writeCandidate({ ...common, runId: "synthetic-run-1" });
    const before = await readFile(join(first.finalPath, "manifest.json"));
    const second = await writeCandidate({ ...common, runId: "synthetic-run-2" });
    const after = await readFile(join(first.finalPath, "manifest.json"));

    assert.equal(second.disposition, "existing");
    assert.deepEqual(after, before);
  });
});

test("leaves interruption evidence only in staging and never creates a final candidate", async () => {
  await withRepository(async (root) => {
    const fixture = candidateFixture();
    await assert.rejects(
      writeCandidate({
        repositoryRoot: root,
        candidateRoot: join(root, "var", "candidates"),
        runId: "synthetic-interrupted-run",
        ...fixture,
        records: [fixture.record],
        provenanceMarkdown: "# Synthetic provenance\n",
        hooks: {
          beforeFinalize: () => {
            throw new Error("synthetic interruption");
          },
        },
      }),
      /synthetic interruption/u,
    );
    await assert.rejects(
      access(join(root, "var", "candidates", fixture.manifest.snapshot_id)),
    );
    assert.deepEqual(
      await readdir(join(root, "var", "candidates", ".staging")),
      ["synthetic-interrupted-run"],
    );
  });
});

test("preserves an existing suffix collision byte-for-byte and writes separate evidence", async () => {
  await withRepository(async (root) => {
    const fixture = candidateFixture();
    const candidateRoot = join(root, "var", "candidates");
    const finalPath = join(candidateRoot, fixture.manifest.snapshot_id);
    await mkdir(finalPath, { recursive: true });
    const conflicting = { ...fixture.manifest, manifest_sha256: "b".repeat(64) };
    const conflictingBytes = Buffer.from(`${JSON.stringify(conflicting, null, 2)}\n`);
    await writeFile(join(finalPath, "manifest.json"), conflictingBytes);

    await assert.rejects(
      writeCandidate({
        repositoryRoot: root,
        candidateRoot,
        runId: "synthetic-collision-run",
        ...fixture,
        records: [fixture.record],
        provenanceMarkdown: "# Synthetic provenance\n",
      }),
      CandidateCollisionError,
    );
    assert.deepEqual(await readFile(join(finalPath, "manifest.json")), conflictingBytes);
    assert.equal((await readdir(join(candidateRoot, "collisions"))).length, 1);
  });
});

test("rejects reconciliation errors and candidate roots outside repository var", async () => {
  await withRepository(async (root) => {
    const fixture = candidateFixture();
    await assert.rejects(
      writeCandidate({
        repositoryRoot: root,
        candidateRoot: join(root, "var", "candidates"),
        runId: "synthetic-bad-deletion",
        ...fixture,
        deletionReceipt: { ...fixture.deletionReceipt, representation_sha256: "b".repeat(64) },
        records: [fixture.record],
        provenanceMarkdown: "# Synthetic provenance\n",
      }),
      /deletion receipt hash does not match/u,
    );
    await assert.rejects(
      writeCandidate({
        repositoryRoot: root,
        candidateRoot: join(root, "outside"),
        runId: "synthetic-outside",
        ...fixture,
        records: [fixture.record],
        provenanceMarkdown: "# Synthetic provenance\n",
      }),
      /candidate root must be/u,
    );
  });
});

test("re-derives every content hash before accepting candidate bytes", async () => {
  await withRepository(async (root) => {
    const fixture = candidateFixture();
    const base = {
      repositoryRoot: root,
      candidateRoot: join(root, "var", "candidates"),
      config: fixture.config,
      deletionReceipt: fixture.deletionReceipt,
      provenanceMarkdown: "# Synthetic provenance\n",
    };
    const tamperedRecord = {
      ...fixture.record,
      projection: { ...fixture.record.projection, title: "Tampered after hashing" },
    } as RetainedRecord;
    await assert.rejects(
      writeCandidate({
        ...base,
        runId: "synthetic-record-hash-mismatch",
        manifest: fixture.manifest,
        receipt: fixture.receipt,
        records: [tamperedRecord],
      }),
      /record canonical hash does not match/u,
    );

    const tamperedReceipt = {
      ...fixture.receipt,
      fetched_at: "2026-08-18T13:10:16Z",
    } as SelectionReceipt;
    await assert.rejects(
      writeCandidate({
        ...base,
        runId: "synthetic-receipt-hash-mismatch",
        manifest: fixture.manifest,
        receipt: tamperedReceipt,
        records: [fixture.record],
      }),
      /selection receipt hash does not match/u,
    );

    await assert.rejects(
      writeCandidate({
        ...base,
        runId: "synthetic-manifest-hash-mismatch",
        manifest: { ...fixture.manifest, manifest_sha256: "e".repeat(64) },
        receipt: fixture.receipt,
        records: [fixture.record],
      }),
      /manifest hash does not match/u,
    );
  });
});

test("rejects impossible or altered response-cleanup chronology", async () => {
  await withRepository(async (root) => {
    const fixture = candidateFixture();
    const invalidReceipts: readonly DeletionReceipt[] = [
      {
        ...fixture.deletionReceipt,
        deleted_at: "2026-08-18T13:09:13Z",
      },
      {
        ...fixture.deletionReceipt,
        cleanup_deadline: "2026-08-18T13:09:13Z",
      },
      {
        ...fixture.deletionReceipt,
        cleanup_deadline: "2026-08-18T14:09:15Z",
      },
    ];

    for (const [index, deletionReceipt] of invalidReceipts.entries()) {
      await assert.rejects(
        writeCandidate({
          repositoryRoot: root,
          candidateRoot: join(root, "var", "candidates"),
          runId: `synthetic-invalid-cleanup-${index}`,
          ...fixture,
          deletionReceipt,
          records: [fixture.record],
          provenanceMarkdown: "# Synthetic provenance\n",
        }),
        /cleanup chronology/u,
      );
    }
  });
});
