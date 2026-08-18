import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";

import type {
  CandidateManifest,
  DeletionReceipt,
  PilotConfig,
  RetainedRecord,
  SelectionReceipt,
} from "../domain/types.js";
import { hashCanonicalJson } from "../integrity/hash.js";
import { hashManifestPayload } from "../manifest/build-manifest.js";
import {
  hashSelectionReceiptPayload,
  selectionReceiptPayload,
} from "../receipt/build-receipt.js";
import {
  validateConfig,
  validateDeletionReceipt,
  validateManifest,
  validateReceipt,
  validateRecord,
} from "../validation/ajv.js";
import { ensureRealDirectory } from "./safe-directory.js";

export class CandidateCollisionError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CandidateCollisionError";
  }
}

export interface CandidateWriteHooks {
  readonly beforeFinalize?: (stagingPath: string) => void | Promise<void>;
}

export interface WriteCandidateInput {
  readonly repositoryRoot: string;
  readonly candidateRoot: string;
  readonly runId: string;
  readonly config: PilotConfig;
  readonly manifest: CandidateManifest;
  readonly receipt: SelectionReceipt;
  readonly deletionReceipt: DeletionReceipt;
  readonly records: readonly RetainedRecord[];
  readonly provenanceMarkdown: string;
  readonly hooks?: CandidateWriteHooks;
}

export interface CandidateWriteResult {
  readonly disposition: "created" | "existing";
  readonly finalPath: string;
}

function invalid(
  label: string,
  errors: readonly { readonly instancePath: string; readonly message: string | undefined }[],
): never {
  const details = errors
    .map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`)
    .join("; ");
  throw new TypeError(`${label} is invalid: ${details}`);
}

function validateArtifacts(input: WriteCandidateInput): void {
  const configValidation = validateConfig(input.config);
  if (!configValidation.ok) invalid("config", configValidation.errors);
  const manifestValidation = validateManifest(input.manifest);
  if (!manifestValidation.ok) invalid("manifest", manifestValidation.errors);
  const receiptValidation = validateReceipt(input.receipt);
  if (!receiptValidation.ok) invalid("receipt", receiptValidation.errors);
  const deletionValidation = validateDeletionReceipt(input.deletionReceipt);
  if (!deletionValidation.ok) invalid("deletion receipt", deletionValidation.errors);
  for (const record of input.records) {
    const recordValidation = validateRecord(record);
    if (!recordValidation.ok) invalid("record", recordValidation.errors);
  }
}

function verifyContentHashes(input: WriteCandidateInput): void {
  const configDigest = hashCanonicalJson(input.config).sha256;
  if (
    input.receipt.config_digest !== configDigest ||
    input.manifest.config_digest !== configDigest
  ) {
    throw new TypeError("config digest does not match the exact reviewed configuration");
  }
  const receiptHash = hashSelectionReceiptPayload(selectionReceiptPayload(input.receipt)).sha256;
  if (receiptHash !== input.receipt.selection_receipt_sha256) {
    throw new TypeError("selection receipt hash does not match its payload");
  }
  const manifestHash = hashManifestPayload({
    schema_version: input.manifest.schema_version,
    config_digest: input.manifest.config_digest,
    selection_receipt_sha256: input.manifest.selection_receipt_sha256,
    ordered_records: input.manifest.ordered_records,
  });
  if (
    manifestHash.sha256 !== input.manifest.manifest_sha256 ||
    manifestHash.snapshotId !== input.manifest.snapshot_id
  ) {
    throw new TypeError("manifest hash does not match its payload and snapshot ID");
  }
  for (const record of input.records) {
    if (hashCanonicalJson(record.projection).sha256 !== record.canonical_sha256) {
      throw new TypeError(
        `record canonical hash does not match issue ${record.projection.issue_id_source}`,
      );
    }
  }
}

function reconcileArtifacts(input: WriteCandidateInput): void {
  if (input.receipt.observation_state !== "retrieved" || input.receipt.termination_reason !== "complete") {
    throw new TypeError("only a complete retrieved receipt may create a candidate");
  }
  if (input.manifest.selection_receipt_sha256 !== input.receipt.selection_receipt_sha256) {
    throw new TypeError("manifest receipt hash does not match the selection receipt");
  }
  if (input.manifest.record_count !== input.records.length) {
    throw new TypeError("manifest record count does not match supplied records");
  }
  input.manifest.ordered_records.forEach((entry, index) => {
    const record = input.records[index];
    if (
      record === undefined ||
      record.projection.issue_id_numeric !== entry.issue_id ||
      record.canonical_sha256 !== entry.canonical_sha256 ||
      input.receipt.ordered_ids[index] !== record.projection.issue_id_source
    ) {
      throw new TypeError(`record ${index} does not reconcile with ordered manifest membership`);
    }
  });
  if (input.receipt.ordered_ids.length !== input.records.length) {
    throw new TypeError("receipt membership count does not match supplied records");
  }
}

function reconcileDeletion(input: WriteCandidateInput): void {
  if (input.deletionReceipt.snapshot_candidate_id !== input.manifest.snapshot_id) {
    throw new TypeError("deletion receipt candidate ID does not match manifest");
  }
  if (input.deletionReceipt.representation_sha256 !== input.receipt.page_representation_sha256) {
    throw new TypeError("deletion receipt hash does not match page representation evidence");
  }
  if (input.deletionReceipt.representation_bytes !== input.receipt.http.representation_bytes) {
    throw new TypeError("deletion receipt byte count does not match page representation evidence");
  }
  const createdMs = Date.parse(input.deletionReceipt.representation_created_at);
  const deletedMs = Date.parse(input.deletionReceipt.deleted_at);
  const deadlineMs = Date.parse(input.deletionReceipt.cleanup_deadline);
  if (
    !Number.isFinite(createdMs) ||
    !Number.isFinite(deletedMs) ||
    !Number.isFinite(deadlineMs) ||
    deadlineMs - createdMs !== 3_600_000 ||
    deletedMs < createdMs ||
    deletedMs > deadlineMs
  ) {
    throw new TypeError("deletion receipt has invalid response-cleanup chronology");
  }
}

async function assertDirectoryNotSymlink(path: string): Promise<void> {
  const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new TypeError(`candidate storage path is not a real directory: ${path}`);
  }
}

export async function prepareCandidateRoot(
  repositoryRoot: string,
  candidateRoot: string,
): Promise<string> {
  const expected = resolve(repositoryRoot, "var", "candidates");
  if (resolve(candidateRoot) !== expected) {
    throw new TypeError(`candidate root must be ${expected}`);
  }
  const varPath = resolve(repositoryRoot, "var");
  const repositoryRealPath = await realpath(resolve(repositoryRoot));
  await ensureRealDirectory(varPath);
  await ensureRealDirectory(expected);
  const expectedRealPath = await realpath(expected);
  if (!expectedRealPath.startsWith(`${repositoryRealPath}/`)) {
    throw new TypeError("candidate root resolves outside the repository");
  }
  return expected;
}

function jsonBytes(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function writeStaging(input: WriteCandidateInput, stagingPath: string): Promise<void> {
  const recordsPath = join(stagingPath, "records");
  await mkdir(recordsPath, { mode: 0o700 });
  await Promise.all([
    writeFile(join(stagingPath, "manifest.json"), jsonBytes(input.manifest), { flag: "wx", mode: 0o600 }),
    writeFile(join(stagingPath, "receipt.json"), jsonBytes(input.receipt), { flag: "wx", mode: 0o600 }),
    writeFile(join(stagingPath, "deletion-receipt.json"), jsonBytes(input.deletionReceipt), {
      flag: "wx",
      mode: 0o600,
    }),
    writeFile(join(stagingPath, "provenance.md"), input.provenanceMarkdown, {
      flag: "wx",
      mode: 0o600,
    }),
    ...input.records.map((record) =>
      writeFile(
        join(recordsPath, `${record.projection.issue_id_source}.json`),
        jsonBytes(record),
        { flag: "wx", mode: 0o600 },
      ),
    ),
  ]);
}

async function compareBundleBytes(firstRoot: string, secondRoot: string): Promise<boolean> {
  const firstEntries = (await readdir(firstRoot, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const secondEntries = (await readdir(secondRoot, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  if (
    firstEntries.length !== secondEntries.length ||
    firstEntries.some((entry, index) => entry.name !== secondEntries[index]?.name)
  ) {
    return false;
  }
  for (const entry of firstEntries) {
    const firstPath = join(firstRoot, entry.name);
    const secondPath = join(secondRoot, entry.name);
    const secondEntry = secondEntries.find((candidate) => candidate.name === entry.name);
    if (secondEntry === undefined || entry.isDirectory() !== secondEntry.isDirectory()) return false;
    if (entry.isSymbolicLink() || secondEntry.isSymbolicLink()) return false;
    if (entry.isDirectory()) {
      if (!(await compareBundleBytes(firstPath, secondPath))) return false;
    } else if (!Buffer.from(await readFile(firstPath)).equals(await readFile(secondPath))) {
      return false;
    }
  }
  return true;
}

async function recordCollision(
  candidateRoot: string,
  input: WriteCandidateInput,
  existingHash: string | null,
): Promise<void> {
  const collisionRoot = join(candidateRoot, "collisions");
  await mkdir(collisionRoot, { recursive: true, mode: 0o700 });
  await assertDirectoryNotSymlink(collisionRoot);
  await writeFile(
    join(collisionRoot, `${input.runId}.json`),
    jsonBytes({
      snapshot_id: input.manifest.snapshot_id,
      expected_manifest_sha256: input.manifest.manifest_sha256,
      existing_manifest_sha256: existingHash,
    }),
    { flag: "wx", mode: 0o600 },
  );
}

async function existingManifestHash(finalPath: string): Promise<string | null> {
  try {
    const parsed = JSON.parse(await readFile(join(finalPath, "manifest.json"), "utf8")) as unknown;
    const validation = validateManifest(parsed);
    return validation.ok ? validation.value.manifest_sha256 : null;
  } catch {
    return null;
  }
}

export async function writeCandidate(input: WriteCandidateInput): Promise<CandidateWriteResult> {
  if (!/^[A-Za-z0-9._-]+$/u.test(input.runId)) {
    throw new TypeError("candidate run ID contains unsafe path characters");
  }
  validateArtifacts(input);
  verifyContentHashes(input);
  reconcileArtifacts(input);
  reconcileDeletion(input);
  const candidateRoot = await prepareCandidateRoot(input.repositoryRoot, input.candidateRoot);
  const stagingRoot = join(candidateRoot, ".staging");
  await mkdir(stagingRoot, { recursive: true, mode: 0o700 });
  await assertDirectoryNotSymlink(stagingRoot);
  const stagingPath = join(stagingRoot, input.runId);
  await mkdir(stagingPath, { mode: 0o700 });
  await writeStaging(input, stagingPath);
  await input.hooks?.beforeFinalize?.(stagingPath);

  const finalPath = join(candidateRoot, input.manifest.snapshot_id);
  try {
    await assertDirectoryNotSymlink(finalPath);
    const existingHash = await existingManifestHash(finalPath);
    if (
      existingHash === input.manifest.manifest_sha256 &&
      (await compareBundleBytes(stagingPath, finalPath))
    ) {
      await rm(stagingPath, { recursive: true });
      return Object.freeze({ disposition: "existing", finalPath });
    }
    await recordCollision(candidateRoot, input, existingHash);
    throw new CandidateCollisionError(`candidate path already exists with different bytes: ${finalPath}`);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }

  await rename(stagingPath, finalPath);
  return Object.freeze({ disposition: "created", finalPath });
}
