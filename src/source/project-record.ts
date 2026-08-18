import type { DrupalSourceIssue, RecordProjection, RetainedRecord } from "../domain/types.js";
import { hashCanonicalJson } from "../integrity/hash.js";
import { validateRecord } from "../validation/ajv.js";

const licenseName = "Creative Commons Attribution-ShareAlike 2.0 Generic";
const licenseUri = "https://creativecommons.org/licenses/by-sa/2.0/";
const canonicalizationNotice =
  "Source fields were allowlisted, Unicode-normalized, and canonicalized for this retained projection.";

export interface ProjectionContext {
  readonly fetchedAt: string;
  readonly sourcePageRepresentationSha256: string;
}

function parseSafeIssueId(sourceId: string): number {
  if (!/^(?:0|[1-9]\d*)$/u.test(sourceId)) {
    throw new TypeError(`issue ID is not a canonical decimal string: ${sourceId}`);
  }
  const numeric = Number(sourceId);
  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    throw new RangeError(`issue ID must be a safe non-negative integer: ${sourceId}`);
  }
  return numeric;
}

function compareDecimalStrings(first: string, second: string): number {
  if (first.length !== second.length) {
    return first.length - second.length;
  }
  if (first === second) {
    return 0;
  }
  return first < second ? -1 : 1;
}

function sortTagIds(tagIds: readonly string[]): readonly string[] {
  return Object.freeze([...tagIds].sort(compareDecimalStrings));
}

function formatValidationErrors(errors: readonly { readonly instancePath: string; readonly message: string | undefined }[]): string {
  return errors.map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`).join("; ");
}

export function projectRecord(
  source: DrupalSourceIssue,
  context: ProjectionContext,
): RetainedRecord {
  const issueId = parseSafeIssueId(source.nid);
  const expectedUrl = `https://www.drupal.org/project/drupal/issues/${source.nid}`;
  if (source.url !== expectedUrl) {
    throw new TypeError(`issue ID ${source.nid} does not match canonical URL ${source.url}`);
  }
  if (source.creator.name.trim().length === 0) {
    throw new TypeError(`issue ${source.nid} has no usable creator credit`);
  }

  const projection: RecordProjection = Object.freeze({
    projection_schema_version: "1.0.0",
    issue_id_source: source.nid,
    issue_id_numeric: issueId,
    title: source.title,
    canonical_url: source.url,
    creator_credit: source.creator.name,
    project_id: source.field_project,
    component: source.field_issue_component,
    version: source.field_issue_version,
    status: source.field_issue_status,
    category: source.field_issue_category,
    priority: source.field_issue_priority,
    tag_ids: sortTagIds(source.taxonomy_vocabulary_9),
    source_created_at: source.created,
    source_changed_at: source.changed,
    fetched_at: context.fetchedAt,
    observation_state: "retrieved",
    license_name: licenseName,
    license_uri: licenseUri,
    license_exception: null,
    canonicalization_notice: canonicalizationNotice,
    canonicalization_version: "drupal-issue-snapshot-jcs-v1",
    source_page_representation_sha256: context.sourcePageRepresentationSha256,
  });
  const record: RetainedRecord = Object.freeze({
    schema_version: "1.0.0",
    projection,
    canonical_sha256: hashCanonicalJson(projection).sha256,
  });
  const validation = validateRecord(record);
  if (!validation.ok) {
    throw new TypeError(`retained projection is invalid: ${formatValidationErrors(validation.errors)}`);
  }
  return record;
}
