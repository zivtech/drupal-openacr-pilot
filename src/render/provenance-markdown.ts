import type { CandidateManifest, RetainedRecord, SelectionReceipt } from "../domain/types.js";

export interface ProvenanceInput {
  readonly manifest: CandidateManifest;
  readonly receipt: SelectionReceipt;
  readonly records: readonly RetainedRecord[];
  readonly freshnessWindowMs: number;
}

function escapeMarkdown(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/([\\`*_[\]{}()])/gu, "\\$1");
}

function display(value: string | number | null): string {
  return value === null ? "Not supplied" : escapeMarkdown(String(value));
}

export function renderProvenanceMarkdown(input: ProvenanceInput): string {
  const lines = [
    "# Candidate Drupal 11 issue snapshot provenance",
    "",
    "> This independent Zivtech candidate is not an accessibility evaluation or an ACR. It makes no WCAG, Section 508, remediation-effectiveness, Drupal-adoption, or conformance claim.",
    "",
    "## Candidate state",
    "",
    `- Snapshot state: candidate`,
    `- Snapshot ID: ${escapeMarkdown(input.manifest.snapshot_id)}`,
    `- Observation state: ${escapeMarkdown(input.receipt.observation_state)}`,
    `- Freshness: ${escapeMarkdown(input.manifest.freshness)}`,
    `- Fetched at: ${escapeMarkdown(input.receipt.fetched_at)}`,
    `- Fresh until: ${display(input.manifest.fresh_until)}`,
    `- Freshness policy window: ${input.freshnessWindowMs} milliseconds`,
    "",
    "Freshness labels only the current issue-traceability view. It cannot change an evaluation outcome or an OpenACR adherence term.",
    "",
    "## Request and response provenance",
    "",
    `- Requested URL: [${escapeMarkdown(input.receipt.requested_url)}](${input.receipt.requested_url})`,
    `- Final URL: ${input.receipt.final_url === null ? "Not supplied" : `[${escapeMarkdown(input.receipt.final_url)}](${input.receipt.final_url})`}`,
    `- Exact User-Agent: ${escapeMarkdown(input.receipt.user_agent)}`,
    `- HTTP status: ${display(input.receipt.http.status)}`,
    `- Content-Encoding: ${display(input.receipt.http.content_encoding)}`,
    `- Transfer-Encoding: ${display(input.receipt.http.transfer_encoding)}`,
    `- Declared encoded Content-Length bytes: ${display(input.receipt.http.declared_content_length_bytes)}`,
    `- Decoded representation bytes: ${display(input.receipt.http.representation_bytes)}`,
    "",
    "The declared encoded Content-Length and decoded representation bytes are different byte domains and were recorded separately; they were not compared.",
    "",
    `- Server next link: ${input.receipt.pagination.next === null ? "Not supplied" : `[${escapeMarkdown(input.receipt.pagination.next)}](${input.receipt.pagination.next})`}`,
    "- Pagination rule: the server next link was retained but not followed; records beyond this chartered top-25 page are excluded.",
    "",
    "## Integrity hashes",
    "",
    `- Configuration digest: ${escapeMarkdown(input.receipt.config_digest)}`,
    `- Page representation SHA-256: ${display(input.receipt.page_representation_sha256)}`,
    `- Selection receipt SHA-256: ${escapeMarkdown(input.receipt.selection_receipt_sha256)}`,
    `- Manifest SHA-256: ${escapeMarkdown(input.manifest.manifest_sha256)}`,
    "",
    "## Ordered issue records and attribution",
    "",
  ];

  if (input.records.length === 0) {
    lines.push("No issue records were selected.");
  } else {
    for (const record of input.records) {
      const projection = record.projection;
      lines.push(
        `- [${escapeMarkdown(projection.title)}](${projection.canonical_url}) — creator: ${escapeMarkdown(projection.creator_credit)}; issue ID: ${projection.issue_id_source}; license: [${escapeMarkdown(projection.license_name)}](${projection.license_uri ?? "https://www.drupal.org/terms"}); canonical SHA-256: ${record.canonical_sha256}`,
      );
    }
  }

  lines.push(
    "",
    "## Excluded data",
    "",
    "Issue bodies, comments, attachments, user profiles, and email addresses are excluded from retained projections. Source fields were allowlisted, Unicode-normalized, and canonicalized; no raw response body is part of this candidate.",
    "",
  );
  return `${lines.join("\n")}\n`;
}
