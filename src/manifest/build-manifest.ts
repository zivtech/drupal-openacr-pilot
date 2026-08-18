import type { CandidateManifest, Freshness } from "../domain/types.js";
import { hashCanonicalJson, type CanonicalJsonHash } from "../integrity/hash.js";
import { validateManifest } from "../validation/ajv.js";

export interface ManifestRecordHash {
  readonly issue_id: number;
  readonly canonical_sha256: string;
}

export interface ManifestHashPayload {
  readonly schema_version: "1.0.0";
  readonly config_digest: string;
  readonly selection_receipt_sha256: string;
  readonly ordered_records: readonly ManifestRecordHash[];
}

export interface ManifestHashResult extends CanonicalJsonHash {
  readonly snapshotId: string;
}

export interface BuildManifestInput {
  readonly configDigest: string;
  readonly selectionReceiptSha256: string;
  readonly orderedRecords: readonly ManifestRecordHash[];
  readonly createdAt: string;
  readonly freshness: Freshness;
  readonly freshUntil: string | null;
  readonly priorSnapshotId: string | null;
}

function validationMessage(
  errors: readonly { readonly instancePath: string; readonly message: string | undefined }[],
): string {
  return errors.map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`).join("; ");
}

function validateMembership(records: readonly ManifestRecordHash[]): void {
  let priorId: number | undefined;
  for (const record of records) {
    if (!Number.isSafeInteger(record.issue_id) || record.issue_id < 0) {
      throw new RangeError(`manifest issue ID must be a safe non-negative integer: ${record.issue_id}`);
    }
    if (priorId !== undefined && priorId <= record.issue_id) {
      throw new TypeError("manifest issue IDs must be unique and strictly descending");
    }
    priorId = record.issue_id;
  }
}

export function hashManifestPayload(payload: ManifestHashPayload): ManifestHashResult {
  const hash = hashCanonicalJson(payload);
  return Object.freeze({
    ...hash,
    snapshotId: `drupal11-issue-snapshot-${hash.sha256.slice(0, 16)}`,
  });
}

export function buildManifest(input: BuildManifestInput): CandidateManifest {
  validateMembership(input.orderedRecords);
  const orderedRecords = Object.freeze(
    input.orderedRecords.map((record) => Object.freeze({ ...record })),
  );
  const payload: ManifestHashPayload = Object.freeze({
    schema_version: "1.0.0",
    config_digest: input.configDigest,
    selection_receipt_sha256: input.selectionReceiptSha256,
    ordered_records: orderedRecords,
  });
  const hash = hashManifestPayload(payload);
  const manifest: CandidateManifest = Object.freeze({
    schema_version: "1.0.0",
    snapshot_id: hash.snapshotId,
    manifest_sha256: hash.sha256,
    config_digest: input.configDigest,
    selection_receipt_sha256: input.selectionReceiptSha256,
    release_identity: "Drupal 11 release line / 11.x-dev",
    created_at: input.createdAt,
    freshness: input.freshness,
    fresh_until: input.freshUntil,
    prior_snapshot_id: input.priorSnapshotId,
    record_count: orderedRecords.length,
    ordered_records: orderedRecords,
  });
  const validation = validateManifest(manifest);
  if (!validation.ok) {
    throw new TypeError(`built manifest is invalid: ${validationMessage(validation.errors)}`);
  }
  return manifest;
}
