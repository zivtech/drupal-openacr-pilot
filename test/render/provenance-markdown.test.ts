import assert from "node:assert/strict";
import test from "node:test";

import { buildManifest } from "../../src/manifest/build-manifest.js";
import { buildSelectionReceipt } from "../../src/receipt/build-receipt.js";
import { renderProvenanceMarkdown } from "../../src/render/provenance-markdown.js";
import { projectRecord } from "../../src/source/project-record.js";
import type { DrupalSourceIssue } from "../../src/domain/types.js";
import { buildSyntheticIssue, selectionUrl } from "../fixtures/selection/synthetic-pages.js";

const pageDigest = "a".repeat(64);
const configDigest = "b".repeat(64);
const timestamp = "2026-08-18T13:09:16Z";

test("renders provenance, byte domains, exclusions, negative space, and escaped issue text", () => {
  const record = projectRecord(
    buildSyntheticIssue(3_500_001, {
      title: "<script>alert(1)</script> [focus]",
      creator: { id: "42", name: "[Synthetic] <Contributor>" },
    }) as unknown as DrupalSourceIssue,
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
      content_encoding: "gzip",
      transfer_encoding: "chunked",
      declared_content_length_bytes: 100,
      representation_bytes: 200,
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
    pagination: {
      self: selectionUrl,
      first: selectionUrl,
      last: selectionUrl,
      next: `${selectionUrl.slice(0, -1)}1`,
    },
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

  const markdown = renderProvenanceMarkdown({
    manifest,
    receipt,
    records: [record],
    freshnessWindowMs: 86_400_000,
  });

  assert.match(markdown, /not an accessibility evaluation or an ACR/iu);
  assert.match(markdown, /candidate/iu);
  assert.match(markdown, /fresh until/iu);
  assert.match(markdown, /User-Agent/iu);
  assert.match(markdown, /declared encoded Content-Length.*100/iu);
  assert.match(markdown, /decoded representation bytes.*200/iu);
  assert.match(markdown, /not compared/iu);
  assert.match(markdown, /server next link/iu);
  assert.match(markdown, /not followed/iu);
  assert.match(markdown, /issue bodies, comments, attachments, user profiles, and email addresses/iu);
  assert.doesNotMatch(markdown, /<script>/u);
  assert.match(markdown, /\\\[focus\\\]/u);
  assert.match(markdown, /Creative Commons Attribution-ShareAlike 2\.0 Generic/u);
});
