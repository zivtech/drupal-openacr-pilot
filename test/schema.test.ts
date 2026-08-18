import assert from "node:assert/strict";
import test from "node:test";

import {
  validateDeletionReceipt,
  validateDrupalPage,
  validateManifest,
  validateNetworkRunStart,
  validateRecord,
  validateReceipt,
  type ValidationResult,
} from "../src/validation/ajv.js";

const selectionUrl =
  "https://www.drupal.org/api-d7/node.json?type=project_issue&field_project=3060&field_issue_version=11.x-dev&taxonomy_vocabulary_9=1101&limit=25&sort=nid&direction=DESC&page=0";
const userAgent =
  "Zivtech-Drupal-OpenACR-Pilot/0.1 (+https://github.com/zivtech/drupal-openacr-pilot)";
const digest = "a".repeat(64);
const secondDigest = "b".repeat(64);
const timestamp = "2026-08-18T13:09:16Z";

function assertInvalid(result: ValidationResult<unknown>, keyword: string): void {
  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.ok(
    result.errors.some((error) => error.keyword === keyword),
    `expected ${keyword} error, got ${JSON.stringify(result.errors)}`,
  );
}

function syntheticPage(): Record<string, unknown> {
  return {
    self: selectionUrl,
    first: selectionUrl,
    last: selectionUrl,
    next: null,
    list: [
      {
        nid: "3500001",
        title: "Synthetic keyboard focus issue",
        url: "https://www.drupal.org/project/drupal/issues/3500001",
        creator: { id: "42", name: "Synthetic Contributor" },
        field_project: "3060",
        field_issue_component: null,
        field_issue_version: "11.x-dev",
        field_issue_status: "1",
        field_issue_category: "1",
        field_issue_priority: "2",
        taxonomy_vocabulary_9: ["1101"],
        created: "2026-08-17T12:00:00Z",
        changed: "2026-08-18T12:00:00Z",
        body: "Excluded synthetic narrative",
        comments: [{ text: "Excluded synthetic comment" }],
        profile: { email: "excluded@example.test" },
      },
    ],
  };
}

function retainedRecord(): Record<string, unknown> {
  return {
    schema_version: "1.0.0",
    projection: {
      projection_schema_version: "1.0.0",
      issue_id_source: "3500001",
      issue_id_numeric: 3500001,
      title: "Synthetic keyboard focus issue",
      canonical_url: "https://www.drupal.org/project/drupal/issues/3500001",
      creator_credit: "Synthetic Contributor",
      project_id: "3060",
      component: null,
      version: "11.x-dev",
      status: "1",
      category: "1",
      priority: "2",
      tag_ids: ["1101"],
      source_created_at: "2026-08-17T12:00:00Z",
      source_changed_at: "2026-08-18T12:00:00Z",
      fetched_at: timestamp,
      observation_state: "retrieved",
      license_name: "Creative Commons Attribution-ShareAlike 2.0 Generic",
      license_uri: "https://creativecommons.org/licenses/by-sa/2.0/",
      license_exception: null,
      canonicalization_notice:
        "Source fields were allowlisted, Unicode-normalized, and canonicalized for this retained projection.",
      canonicalization_version: "drupal-issue-snapshot-jcs-v1",
      source_page_representation_sha256: digest,
    },
    canonical_sha256: secondDigest,
  };
}

function selectionReceipt(): Record<string, unknown> {
  return {
    schema_version: "1.0.0",
    config_digest: digest,
    requested_url: selectionUrl,
    final_url: selectionUrl,
    user_agent: userAgent,
    fetched_at: timestamp,
    observation_state: "retrieved",
    http: {
      status: 200,
      content_encoding: null,
      transfer_encoding: "chunked",
      declared_content_length_bytes: null,
      representation_bytes: 187657,
    },
    attempts: [
      {
        attempt: 1,
        started_at: "2026-08-18T13:09:15Z",
        response_status: 200,
        retry_after_value: null,
        retry_after_parse_state: "absent",
        retry_after_ms: null,
        retry_delay_ms: null,
      },
    ],
    pagination: {
      self: selectionUrl,
      first: selectionUrl,
      last: selectionUrl,
      next: null,
    },
    ordered_ids: ["3500001"],
    page_representation_sha256: digest,
    termination_reason: "complete",
    selection_receipt_sha256: secondDigest,
  };
}

test("accepts a reviewed synthetic page while allowing excluded source fields", () => {
  assert.equal(validateDrupalPage(syntheticPage()).ok, true);
});

test("rejects synthetic source schema drift in required page fields", () => {
  const missingList = syntheticPage();
  delete missingList.list;
  assertInvalid(validateDrupalPage(missingList), "required");

  const wrongList = syntheticPage();
  wrongList.list = {};
  assertInvalid(validateDrupalPage(wrongList), "type");
});

test("accepts the allowlisted retained record schema", () => {
  assert.equal(validateRecord(retainedRecord()).ok, true);
});

test("rejects unsafe numeric identity and excluded retained fields", () => {
  const unsafe = retainedRecord();
  const unsafeProjection = unsafe.projection as Record<string, unknown>;
  unsafeProjection.issue_id_numeric = Number.MAX_SAFE_INTEGER + 1;
  assertInvalid(validateRecord(unsafe), "maximum");

  const excluded = retainedRecord();
  const excludedProjection = excluded.projection as Record<string, unknown>;
  excludedProjection.body = "Narrative must not enter a retained projection";
  assertInvalid(validateRecord(excluded), "additionalProperties");
  assert.equal(excludedProjection.body, "Narrative must not enter a retained projection");
});

test("validates complete and unavailable receipt shapes without implicit values", () => {
  assert.equal(validateReceipt(selectionReceipt()).ok, true);

  const unavailable = selectionReceipt();
  unavailable.final_url = null;
  unavailable.observation_state = "unavailable";
  unavailable.http = {
    status: null,
    content_encoding: null,
    transfer_encoding: null,
    declared_content_length_bytes: null,
    representation_bytes: null,
  };
  unavailable.pagination = { self: null, first: null, last: null, next: null };
  unavailable.ordered_ids = [];
  unavailable.page_representation_sha256 = null;
  unavailable.termination_reason = "transport_unavailable";
  assert.equal(validateReceipt(unavailable).ok, true);

  const missingAttemptField = selectionReceipt();
  const [attempt] = missingAttemptField.attempts as Array<Record<string, unknown>>;
  assert.ok(attempt);
  if (attempt === undefined) {
    throw new Error("synthetic attempt fixture is missing");
  }
  delete attempt.retry_delay_ms;
  assertInvalid(validateReceipt(missingAttemptField), "required");
});

test("validates manifest, deletion receipt, and network-run-start contracts", () => {
  const manifest = {
    schema_version: "1.0.0",
    snapshot_id: `drupal11-issue-snapshot-${digest.slice(0, 16)}`,
    manifest_sha256: digest,
    config_digest: secondDigest,
    selection_receipt_sha256: digest,
    release_identity: "Drupal 11 release line / 11.x-dev",
    created_at: timestamp,
    freshness: "fresh",
    fresh_until: "2026-08-19T13:09:16Z",
    prior_snapshot_id: null,
    record_count: 1,
    ordered_records: [{ issue_id: 3500001, canonical_sha256: secondDigest }],
  };
  assert.equal(validateManifest(manifest).ok, true);

  const deletionReceipt = {
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
    representation_sha256: digest,
    representation_bytes: 187657,
    recovery: false,
  };
  assert.equal(validateDeletionReceipt(deletionReceipt).ok, true);

  const networkRunStart = {
    schema_version: "1.0.0",
    run_id: "synthetic-run-1",
    started_at: timestamp,
    next_eligible_at: "2026-08-18T14:09:16Z",
    selection_url: selectionUrl,
    user_agent: userAgent,
    config_digest: digest,
    minimum_live_run_interval_ms: 3600000,
  };
  assert.equal(validateNetworkRunStart(networkRunStart).ok, true);

  const driftedManifest = structuredClone(manifest) as Record<string, unknown>;
  driftedManifest.extra = "not allowed";
  assertInvalid(validateManifest(driftedManifest), "additionalProperties");
});
