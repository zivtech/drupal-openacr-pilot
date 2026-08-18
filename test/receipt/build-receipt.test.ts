import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSelectionReceipt,
  hashSelectionReceiptPayload,
  type SelectionReceiptPayload,
} from "../../src/receipt/build-receipt.js";

const abcSha = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const selectionUrl =
  "https://www.drupal.org/api-d7/node.json?type=project_issue&field_project=3060&field_issue_version=11.x-dev&taxonomy_vocabulary_9=1101&limit=25&sort=nid&direction=DESC&page=0";
const userAgent =
  "Zivtech-Drupal-OpenACR-Pilot/0.1 (+https://github.com/zivtech/drupal-openacr-pilot)";
const knownPayload: SelectionReceiptPayload = {
  schema_version: "1.0.0",
  config_digest: "cfg",
  requested_url: "https://example.test/page=0",
  final_url: "https://example.test/page=0",
  user_agent: "test-agent",
  fetched_at: "2026-08-18T13:09:16Z",
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
      started_at: "2026-08-18T13:09:15Z",
      response_status: 200,
      retry_after_value: null,
      retry_after_parse_state: "absent",
      retry_after_ms: null,
      retry_delay_ms: null,
    },
  ],
  pagination: { self: "p0", first: "p0", last: "p0", next: null },
  ordered_ids: ["1"],
  page_representation_sha256: abcSha,
  termination_reason: "complete",
};

function productionPayload(): SelectionReceiptPayload {
  return {
    ...knownPayload,
    config_digest: "a".repeat(64),
    requested_url: selectionUrl,
    final_url: selectionUrl,
    user_agent: userAgent,
    pagination: {
      self: selectionUrl,
      first: selectionUrl,
      last: selectionUrl,
      next: null,
    },
  };
}

test("matches the pinned 769-byte selection-receipt vector", () => {
  const result = hashSelectionReceiptPayload(knownPayload);

  assert.equal(result.byteLength, 769);
  assert.equal(result.sha256, "dcd77e3d7d9aea0bb0549e1fdaeb26daaed19f6288bc2b2652dd774ff8f5a188");
});

test("builds a schema-valid receipt and repeats byte-identically", () => {
  const first = buildSelectionReceipt(productionPayload());
  const second = buildSelectionReceipt(productionPayload());

  assert.deepEqual(first, second);
  assert.match(first.selection_receipt_sha256, /^[0-9a-f]{64}$/u);
});

test("changes the receipt hash when only page evidence changes", () => {
  const first = buildSelectionReceipt(productionPayload());
  const changed = buildSelectionReceipt({
    ...productionPayload(),
    page_representation_sha256: "b".repeat(64),
  });

  assert.notEqual(first.selection_receipt_sha256, changed.selection_receipt_sha256);
});

test("builds an explicit stable unavailable receipt and rejects missing shape", () => {
  const unavailable = buildSelectionReceipt({
    ...productionPayload(),
    final_url: null,
    observation_state: "unavailable",
    http: {
      status: null,
      content_encoding: null,
      transfer_encoding: null,
      declared_content_length_bytes: null,
      representation_bytes: null,
    },
    attempts: [],
    pagination: { self: null, first: null, last: null, next: null },
    ordered_ids: [],
    page_representation_sha256: null,
    termination_reason: "transport_unavailable",
  });
  assert.match(unavailable.selection_receipt_sha256, /^[0-9a-f]{64}$/u);

  const missing = productionPayload() as unknown as Record<string, unknown>;
  delete missing.http;
  assert.throws(() => buildSelectionReceipt(missing), /receipt payload is invalid/u);
});

test("rejects an unreviewed query or request identity in a production receipt", () => {
  assert.throws(
    () => buildSelectionReceipt({ ...productionPayload(), requested_url: "https://example.test/" }),
    /receipt payload is invalid/u,
  );
  assert.throws(
    () => buildSelectionReceipt({ ...productionPayload(), user_agent: "unreviewed-agent" }),
    /receipt payload is invalid/u,
  );
});
