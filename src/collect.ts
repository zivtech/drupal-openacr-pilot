import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type {
  DeletionReceipt,
  PilotConfig,
  RetainedRecord,
} from "./domain/types.js";
import { classifyFreshness } from "./freshness/classify.js";
import { hashCanonicalJson } from "./integrity/hash.js";
import { buildManifest } from "./manifest/build-manifest.js";
import {
  buildSelectionReceipt,
  type SelectionReceiptPayload,
} from "./receipt/build-receipt.js";
import {
  renderProvenanceMarkdown,
  renderUnavailableProvenanceMarkdown,
} from "./render/provenance-markdown.js";
import { validateSelection, type SelectionResult } from "./selection/validate-selection.js";
import { projectRecord } from "./source/project-record.js";
import { sweepResponseRepresentations } from "./storage/recovery-sweep.js";
import { ensureRealDirectory } from "./storage/safe-directory.js";
import { prepareCandidateRoot, writeCandidate } from "./storage/write-candidate.js";
import { fetchPage, type FetchPageDependencies, type FetchPageResult } from "./transport/fetch-page.js";
import { validateConfig, validateDeletionReceipt } from "./validation/ajv.js";

export type CollectorDependencies = FetchPageDependencies;

export interface CollectCandidateOptions {
  readonly repositoryRoot: string;
  readonly configPath: string;
  readonly candidateRoot: string;
  readonly runId: string;
  readonly dependencies: CollectorDependencies;
}

export type CollectCandidateResult =
  | {
      readonly status: "candidate";
      readonly disposition: "created" | "existing";
      readonly snapshotId: string;
      readonly candidatePath: string;
      readonly recordCount: number;
    }
  | {
      readonly status: "unavailable";
      readonly receiptPath: string;
      readonly provenancePath: string;
      readonly deletionReceiptPath: string | null;
      readonly terminationReason: string;
    };

function validationMessage(
  errors: readonly { readonly instancePath: string; readonly message: string | undefined }[],
): string {
  return errors.map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`).join("; ");
}

async function loadConfig(path: string): Promise<PilotConfig> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  const validation = validateConfig(parsed);
  if (!validation.ok) {
    throw new TypeError(`pilot config is invalid: ${validationMessage(validation.errors)}`);
  }
  return validation.value;
}

function receiptPayload(
  fetchResult: FetchPageResult,
  config: PilotConfig,
  configDigest: string,
  selection: SelectionResult | null,
): SelectionReceiptPayload {
  const complete = selection?.complete === true;
  return Object.freeze({
    schema_version: "1.0.0",
    config_digest: configDigest,
    requested_url: fetchResult.requestedUrl,
    final_url: fetchResult.finalUrl,
    user_agent: config.user_agent,
    fetched_at: fetchResult.fetchedAt,
    observation_state: complete ? "retrieved" : "unavailable",
    http: Object.freeze({
      status: fetchResult.http.status,
      content_encoding: fetchResult.http.contentEncoding,
      transfer_encoding: fetchResult.http.transferEncoding,
      declared_content_length_bytes: fetchResult.http.declaredContentLengthBytes,
      representation_bytes: fetchResult.http.representationBytes,
    }),
    attempts: Object.freeze(
      fetchResult.attempts.map((attempt) =>
        Object.freeze({
          attempt: attempt.attempt,
          started_at: attempt.startedAt,
          response_status: attempt.responseStatus,
          retry_after_value: attempt.retryAfterValue,
          retry_after_parse_state: attempt.retryAfterParseState,
          retry_after_ms: attempt.retryAfterMs,
          retry_delay_ms: attempt.retryDelayMs,
        }),
      ),
    ),
    pagination: Object.freeze({
      self: fetchResult.page?.self ?? null,
      first: fetchResult.page?.first ?? null,
      last: fetchResult.page?.last ?? null,
      next: fetchResult.page?.next ?? null,
    }),
    ordered_ids: complete ? selection.orderedIds : Object.freeze([]),
    page_representation_sha256: fetchResult.pageRepresentationSha256,
    termination_reason: complete
      ? "complete"
      : selection !== null && !selection.complete
        ? (selection.issues[0]?.code ?? "selection_unavailable")
        : fetchResult.terminationReason,
  });
}

function deletionReceipt(
  fetchResult: FetchPageResult,
  runId: string,
  snapshotCandidateId: string | null,
): DeletionReceipt | null {
  const evidence = fetchResult.deletionEvidence;
  if (evidence === null) return null;
  const createdMs = Date.parse(evidence.representationCreatedAt);
  const receipt: DeletionReceipt = Object.freeze({
    schema_version: "1.0.0",
    record_id: `delete-${runId}`,
    run_id: runId,
    snapshot_candidate_id: snapshotCandidateId,
    representation_created_at: evidence.representationCreatedAt,
    deleted_at: evidence.deletedAt,
    cleanup_deadline: new Date(createdMs + 3_600_000).toISOString(),
    method: evidence.method,
    verification: evidence.verification,
    backup_cache_disposition: "not_backed_up_or_cached",
    exception_status: "none",
    representation_sha256: evidence.representationSha256,
    representation_bytes: evidence.representationBytes,
    recovery: evidence.recovery,
  });
  const validation = validateDeletionReceipt(receipt);
  if (!validation.ok) {
    throw new TypeError(`deletion receipt is invalid: ${validationMessage(validation.errors)}`);
  }
  return receipt;
}

async function writeUnavailableArtifacts(
  repositoryRoot: string,
  runId: string,
  receipt: ReturnType<typeof buildSelectionReceipt>,
  provenanceMarkdown: string,
  deletion: DeletionReceipt | null,
): Promise<{
  readonly receiptPath: string;
  readonly provenancePath: string;
  readonly deletionReceiptPath: string | null;
}> {
  const root = resolve(repositoryRoot, "var", "receipts");
  await ensureRealDirectory(root);
  const receiptPath = join(root, `${runId}.json`);
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  const provenancePath = join(root, `${runId}.provenance.md`);
  await writeFile(provenancePath, provenanceMarkdown, { flag: "wx", mode: 0o600 });
  if (deletion === null) {
    return Object.freeze({ receiptPath, provenancePath, deletionReceiptPath: null });
  }
  const deletionReceiptPath = join(root, `${runId}.deletion.json`);
  await writeFile(deletionReceiptPath, `${JSON.stringify(deletion, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  return Object.freeze({ receiptPath, provenancePath, deletionReceiptPath });
}

async function prepareTemporaryRoot(repositoryRoot: string): Promise<string> {
  const temporaryParent = resolve(repositoryRoot, "var", "tmp");
  const temporaryRoot = resolve(temporaryParent, "responses");
  await ensureRealDirectory(temporaryParent);
  await ensureRealDirectory(temporaryRoot);
  return temporaryRoot;
}

async function writeRecoveryEvidence(
  repositoryRoot: string,
  runId: string,
  recordedAt: string,
  evidence: Awaited<ReturnType<typeof sweepResponseRepresentations>>,
): Promise<void> {
  if (evidence.length === 0) return;
  const receiptRoot = resolve(repositoryRoot, "var", "receipts");
  await ensureRealDirectory(receiptRoot);
  await writeFile(
    join(receiptRoot, `${runId}.recovery.json`),
    `${JSON.stringify(
      {
        schema_version: "1.0.0",
        recovery_run_id: runId,
        recorded_at: recordedAt,
        recovered_representations: evidence.map((entry) => ({
          representation_created_at: entry.representationCreatedAt,
          deleted_at: entry.deletedAt,
          method: entry.method,
          verification: entry.verification,
          representation_sha256: entry.representationSha256,
          representation_bytes: entry.representationBytes,
          recovery: entry.recovery,
        })),
      },
      null,
      2,
    )}\n`,
    { flag: "wx", mode: 0o600 },
  );
}

function projectRecords(
  selection: Extract<SelectionResult, { readonly complete: true }>,
  fetchResult: FetchPageResult,
): readonly RetainedRecord[] {
  const pageSha = fetchResult.pageRepresentationSha256;
  if (pageSha === null) throw new TypeError("complete selection has no page representation hash");
  return Object.freeze(
    selection.records.map((record) =>
      projectRecord(record, {
        fetchedAt: fetchResult.fetchedAt,
        sourcePageRepresentationSha256: pageSha,
      }),
    ),
  );
}

export async function collectCandidate(
  options: CollectCandidateOptions,
): Promise<CollectCandidateResult> {
  if (!/^[A-Za-z0-9._-]+$/u.test(options.runId)) {
    throw new TypeError("collector run ID contains unsafe path characters");
  }
  const config = await loadConfig(options.configPath);
  const configDigest = hashCanonicalJson(config).sha256;
  await prepareCandidateRoot(options.repositoryRoot, options.candidateRoot);
  await ensureRealDirectory(resolve(options.repositoryRoot, "var", "receipts"));
  const temporaryRoot = await prepareTemporaryRoot(options.repositoryRoot);
  const recoveryAt = new Date(options.dependencies.now()).toISOString();
  const recovered = await sweepResponseRepresentations(temporaryRoot, recoveryAt);
  await writeRecoveryEvidence(options.repositoryRoot, options.runId, recoveryAt, recovered);
  const fetchResult = await fetchPage({
    config,
    configDigest,
    repositoryRoot: options.repositoryRoot,
    temporaryRoot,
    runId: options.runId,
    dependencies: options.dependencies,
  });
  const selection =
    fetchResult.observationState === "retrieved" && fetchResult.page !== null
      ? validateSelection(fetchResult.page, config)
      : null;
  const receipt = buildSelectionReceipt(receiptPayload(fetchResult, config, configDigest, selection));

  if (selection === null || !selection.complete) {
    const deletion = deletionReceipt(fetchResult, options.runId, null);
    const provenanceMarkdown = renderUnavailableProvenanceMarkdown({
      receipt,
      freshnessWindowMs: config.freshness_window_ms,
    });
    const paths = await writeUnavailableArtifacts(
      options.repositoryRoot,
      options.runId,
      receipt,
      provenanceMarkdown,
      deletion,
    );
    return Object.freeze({
      status: "unavailable",
      ...paths,
      terminationReason: receipt.termination_reason,
    });
  }

  const records = projectRecords(selection, fetchResult);
  const freshness = classifyFreshness(
    "retrieved",
    fetchResult.fetchedAt,
    config.freshness_window_ms,
    options.dependencies.now(),
  );
  if (!freshness.valid || freshness.freshUntil === null) {
    throw new TypeError("retrieved selection has an invalid freshness timestamp");
  }
  const manifest = buildManifest({
    configDigest,
    selectionReceiptSha256: receipt.selection_receipt_sha256,
    orderedRecords: records.map((record) => ({
      issue_id: record.projection.issue_id_numeric,
      canonical_sha256: record.canonical_sha256,
    })),
    createdAt: fetchResult.fetchedAt,
    freshness: freshness.freshness,
    freshUntil: freshness.freshUntil,
    priorSnapshotId: null,
  });
  const deletion = deletionReceipt(fetchResult, options.runId, manifest.snapshot_id);
  if (deletion === null) throw new TypeError("retrieved selection has no deletion evidence");
  const provenanceMarkdown = renderProvenanceMarkdown({
    manifest,
    receipt,
    records,
    freshnessWindowMs: config.freshness_window_ms,
  });
  const writeResult = await writeCandidate({
    repositoryRoot: options.repositoryRoot,
    candidateRoot: options.candidateRoot,
    runId: options.runId,
    config,
    manifest,
    receipt,
    deletionReceipt: deletion,
    records,
    provenanceMarkdown,
  });
  return Object.freeze({
    status: "candidate",
    disposition: writeResult.disposition,
    snapshotId: manifest.snapshot_id,
    candidatePath: writeResult.finalPath,
    recordCount: records.length,
  });
}
