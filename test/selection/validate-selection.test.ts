import assert from "node:assert/strict";
import test from "node:test";

import { validateSelection } from "../../src/selection/validate-selection.js";
import type { PilotConfig } from "../../src/domain/types.js";
import {
  buildSyntheticPage,
  descendingIssueIds,
  selectionUrl,
} from "../fixtures/selection/synthetic-pages.js";

const config: PilotConfig = {
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

function assertUnavailable(
  page: Record<string, unknown>,
  expectedCode: string,
): void {
  const result = validateSelection(page, config);
  assert.equal(result.complete, false);
  if (result.complete) {
    return;
  }
  assert.equal(result.observationState, "unavailable");
  assert.ok(
    result.issues.some((issue) => issue.code === expectedCode),
    `expected ${expectedCode}, got ${JSON.stringify(result.issues)}`,
  );
}

test("accepts a complete top-25 page with a retained but unfollowed next link", () => {
  const page = buildSyntheticPage();
  const result = validateSelection(page, config);

  assert.equal(result.complete, true);
  if (!result.complete) {
    return;
  }
  assert.deepEqual(result.orderedIds, descendingIssueIds().map(String));
  assert.equal(result.next, `${selectionUrl.slice(0, -1)}1`);
  assert.equal(result.records.length, 25);
});

test("accepts an empty final universe only with consistent page-zero links", () => {
  const page = buildSyntheticPage({ ids: [], next: null, last: selectionUrl });
  const result = validateSelection(page, config);

  assert.equal(result.complete, true);
  if (result.complete) {
    assert.deepEqual(result.orderedIds, []);
  }
});

test("rejects wrong project, wrong version, and a missing required tag", () => {
  assertUnavailable(buildSyntheticPage({ recordOverrides: { field_project: "9999" } }), "wrong_project");
  assertUnavailable(
    buildSyntheticPage({ recordOverrides: { field_issue_version: "10.x-dev" } }),
    "wrong_version",
  );
  assertUnavailable(
    buildSyntheticPage({ recordOverrides: { taxonomy_vocabulary_9: ["9999"] } }),
    "missing_accessibility_tag",
  );
});

test("rejects duplicate, out-of-order, and unsafe issue IDs", () => {
  const ids = [...descendingIssueIds()];
  ids[1] = ids[0] as number;
  assertUnavailable(buildSyntheticPage({ ids }), "duplicate_issue_id");

  const unordered = [...descendingIssueIds()];
  [unordered[1], unordered[2]] = [unordered[2] as number, unordered[1] as number];
  assertUnavailable(buildSyntheticPage({ ids: unordered }), "issue_ids_not_descending");

  const unsafe = buildSyntheticPage();
  const list = unsafe.list as Array<Record<string, unknown>>;
  assert.ok(list[0]);
  (list[0] as Record<string, unknown>).nid = "9007199254740992";
  assertUnavailable(unsafe, "unsafe_issue_id");
});

test("rejects a short non-final page and inconsistent final pagination", () => {
  assertUnavailable(buildSyntheticPage({ ids: descendingIssueIds(24) }), "short_page_with_next");
  assertUnavailable(
    buildSyntheticPage({ ids: descendingIssueIds(1), next: null }),
    "inconsistent_final_pagination",
  );
});

test("rejects source schema drift and identity URL mismatch", () => {
  const drifted = buildSyntheticPage();
  delete drifted.list;
  assertUnavailable(drifted, "schema_invalid");

  const mismatch = buildSyntheticPage({
    recordOverrides: { url: "https://www.drupal.org/project/drupal/issues/1" },
  });
  assertUnavailable(mismatch, "identity_url_mismatch");
});
