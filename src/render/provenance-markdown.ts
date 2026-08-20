import type {
  CandidateManifest,
  RetainedRecord,
  SelectionReceipt,
} from "../domain/types.js";

const negativeSpace =
  "> This independent Zivtech collection artifact is not an accessibility evaluation or an ACR. It makes no WCAG, Section 508, remediation-effectiveness, Drupal-adoption, or conformance claim.";

export interface ProvenanceInput {
  readonly manifest: CandidateManifest;
  readonly receipt: SelectionReceipt;
  readonly records: readonly RetainedRecord[];
  readonly freshnessWindowMs: number;
}

export interface UnavailableProvenanceInput {
  readonly receipt: SelectionReceipt;
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

function link(label: string, value: string): string {
  let destination: URL;
  try {
    destination = new URL(value);
  } catch {
    return escapeMarkdown(label);
  }
  if (destination.protocol !== "https:" || destination.username !== "" || destination.password !== "") {
    return escapeMarkdown(label);
  }
  const safeDestination = destination.href.replaceAll("(", "%28").replaceAll(")", "%29");
  return `[${escapeMarkdown(label)}](${safeDestination})`;
}

function requestAndResponseLines(receipt: SelectionReceipt): readonly string[] {
  return [
    "## Request and response provenance",
    "",
    `- Requested URL: ${link(receipt.requested_url, receipt.requested_url)}`,
    `- Final URL: ${receipt.final_url === null ? "Not supplied" : link(receipt.final_url, receipt.final_url)}`,
    `- Exact User-Agent: ${escapeMarkdown(receipt.user_agent)}`,
    `- HTTP status: ${display(receipt.http.status)}`,
    `- Content-Encoding: ${display(receipt.http.content_encoding)}`,
    `- Transfer-Encoding: ${display(receipt.http.transfer_encoding)}`,
    `- Declared encoded Content-Length bytes: ${display(receipt.http.declared_content_length_bytes)}`,
    `- Decoded representation bytes: ${display(receipt.http.representation_bytes)}`,
    "",
    "The declared encoded Content-Length and decoded representation bytes are different byte domains and were recorded separately; they were not compared.",
    "",
    `- Server next link: ${receipt.pagination.next === null ? "Not supplied" : link(receipt.pagination.next, receipt.pagination.next)}`,
    "- Pagination rule: the server next link was retained but not followed; records beyond this chartered top-25 page are excluded.",
  ];
}

function integrityLines(receipt: SelectionReceipt, manifestSha256?: string): readonly string[] {
  return [
    "## Integrity hashes",
    "",
    `- Configuration digest: ${escapeMarkdown(receipt.config_digest)}`,
    `- Page representation SHA-256: ${display(receipt.page_representation_sha256)}`,
    `- Selection receipt SHA-256: ${escapeMarkdown(receipt.selection_receipt_sha256)}`,
    ...(manifestSha256 === undefined
      ? []
      : [`- Manifest SHA-256: ${escapeMarkdown(manifestSha256)}`]),
  ];
}

function excludedDataLines(): readonly string[] {
  return [
    "## Excluded data",
    "",
    "Issue bodies, comments, attachments, user profiles, and email addresses are excluded from retained projections. Source fields were allowlisted, Unicode-normalized, and canonicalized; no raw response body is part of this artifact.",
  ];
}

function freshnessWindow(value: number): string {
  const hours = value / 3_600_000;
  return `${value} milliseconds (${hours} ${hours === 1 ? "hour" : "hours"})`;
}

export function renderProvenanceMarkdown(input: ProvenanceInput): string {
  const lines = [
    "# Candidate Drupal 11 issue snapshot provenance",
    "",
    negativeSpace,
    "",
    "## Candidate state",
    "",
    "- Snapshot state: candidate",
    `- Snapshot ID: ${escapeMarkdown(input.manifest.snapshot_id)}`,
    `- Observation state: ${escapeMarkdown(input.receipt.observation_state)}`,
    `- Freshness: ${escapeMarkdown(input.manifest.freshness)}`,
    `- Fetched at: ${escapeMarkdown(input.receipt.fetched_at)}`,
    `- Fresh until: ${display(input.manifest.fresh_until)}`,
    `- Freshness policy window: ${freshnessWindow(input.freshnessWindowMs)}`,
    "",
    "Freshness labels only the current issue-traceability view. It cannot change an evaluation outcome or an OpenACR adherence term.",
    "",
    ...requestAndResponseLines(input.receipt),
    "",
    ...integrityLines(input.receipt, input.manifest.manifest_sha256),
    "",
    "## Ordered issue records and attribution",
    "",
  ];

  if (input.records.length === 0) {
    lines.push("No issue records were selected.");
  } else {
    for (const record of input.records) {
      const projection = record.projection;
      const licenseUri = projection.license_uri ?? "https://www.drupal.org/terms";
      lines.push(
        `- ${link(projection.title, projection.canonical_url)} — creator: ${escapeMarkdown(projection.creator_credit)}; issue ID: ${projection.issue_id_source}; license: ${link(projection.license_name, licenseUri)}; canonical SHA-256: ${record.canonical_sha256}`,
      );
    }
  }

  lines.push("", ...excludedDataLines(), "");
  return `${lines.join("\n")}\n`;
}

export function renderUnavailableProvenanceMarkdown(
  input: UnavailableProvenanceInput,
): string {
  const lines = [
    "# Unavailable Drupal 11 issue collection provenance",
    "",
    negativeSpace,
    "",
    "## Collection state",
    "",
    "- Snapshot state: no candidate created",
    `- Observation state: ${escapeMarkdown(input.receipt.observation_state)}`,
    "- Freshness: unavailable",
    `- Fetched at: ${escapeMarkdown(input.receipt.fetched_at)}`,
    `- Freshness policy window: ${freshnessWindow(input.freshnessWindowMs)}`,
    `- Termination reason: ${escapeMarkdown(input.receipt.termination_reason)}`,
    "",
    "Unavailable means the collector did not establish a current issue-traceability snapshot. It cannot change an evaluation outcome or an OpenACR adherence term.",
    "",
    ...requestAndResponseLines(input.receipt),
    "",
    ...integrityLines(input.receipt),
    "",
    ...excludedDataLines(),
    "",
  ];
  return `${lines.join("\n")}\n`;
}
