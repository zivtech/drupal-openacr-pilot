import type { DrupalPage, DrupalSourceIssue, PilotConfig } from "../domain/types.js";
import { validateDrupalPage } from "../validation/ajv.js";

export type SelectionIssueCode =
  | "schema_invalid"
  | "unexpected_selection_page"
  | "wrong_project"
  | "wrong_version"
  | "missing_accessibility_tag"
  | "unsafe_issue_id"
  | "identity_url_mismatch"
  | "duplicate_issue_id"
  | "issue_ids_not_descending"
  | "short_page_with_next"
  | "inconsistent_final_pagination";

export interface SelectionIssue {
  readonly code: SelectionIssueCode;
  readonly message: string;
  readonly issueId?: string;
}

export interface CompleteSelection {
  readonly complete: true;
  readonly orderedIds: readonly string[];
  readonly records: readonly DrupalSourceIssue[];
  readonly self: string;
  readonly first: string;
  readonly last: string;
  readonly next: string | null;
}

export interface UnavailableSelection {
  readonly complete: false;
  readonly observationState: "unavailable";
  readonly issues: readonly SelectionIssue[];
}

export type SelectionResult = CompleteSelection | UnavailableSelection;

function unavailable(issues: readonly SelectionIssue[]): UnavailableSelection {
  return Object.freeze({
    complete: false,
    observationState: "unavailable",
    issues: Object.freeze([...issues]),
  });
}

function issue(code: SelectionIssueCode, message: string, issueId?: string): SelectionIssue {
  return issueId === undefined
    ? Object.freeze({ code, message })
    : Object.freeze({ code, message, issueId });
}

function inspectRecord(
  record: DrupalSourceIssue,
  index: number,
  priorId: number | undefined,
  seenIds: Set<string>,
): { readonly issues: readonly SelectionIssue[]; readonly numericId: number | undefined } {
  const issues: SelectionIssue[] = [];
  const numericId = Number(record.nid);
  const safeId = Number.isSafeInteger(numericId) && numericId >= 0;

  if (!safeId) {
    issues.push(issue("unsafe_issue_id", `record ${index} has unsafe issue ID ${record.nid}`, record.nid));
  }
  if (seenIds.has(record.nid)) {
    issues.push(issue("duplicate_issue_id", `issue ID ${record.nid} appears more than once`, record.nid));
  }
  seenIds.add(record.nid);
  if (safeId && priorId !== undefined && priorId <= numericId) {
    issues.push(
      issue(
        "issue_ids_not_descending",
        `issue ID ${record.nid} is not strictly below prior ID ${priorId}`,
        record.nid,
      ),
    );
  }
  if (record.field_project !== "3060") {
    issues.push(issue("wrong_project", `issue ${record.nid} has project ${record.field_project}`, record.nid));
  }
  if (record.field_issue_version !== "11.x-dev") {
    issues.push(
      issue("wrong_version", `issue ${record.nid} has version ${record.field_issue_version}`, record.nid),
    );
  }
  if (!record.taxonomy_vocabulary_9.includes("1101")) {
    issues.push(
      issue("missing_accessibility_tag", `issue ${record.nid} lacks tag 1101`, record.nid),
    );
  }
  const expectedUrl = `https://www.drupal.org/project/drupal/issues/${record.nid}`;
  if (record.url !== expectedUrl) {
    issues.push(
      issue(
        "identity_url_mismatch",
        `issue ${record.nid} URL does not match its identity: ${record.url}`,
        record.nid,
      ),
    );
  }

  return Object.freeze({ issues: Object.freeze(issues), numericId: safeId ? numericId : undefined });
}

function inspectPagination(page: DrupalPage, config: PilotConfig): readonly SelectionIssue[] {
  const issues: SelectionIssue[] = [];
  if (page.self !== config.selection_url || page.first !== config.selection_url) {
    issues.push(
      issue(
        "unexpected_selection_page",
        "selection self and first links must equal the exact reviewed page-zero URL",
      ),
    );
  }
  if (page.next !== null && page.list.length !== config.max_records) {
    issues.push(
      issue(
        "short_page_with_next",
        `page advertises next but returned ${page.list.length}; expected ${config.max_records}`,
      ),
    );
  }
  if (
    page.next === null &&
    (page.self !== config.selection_url ||
      page.first !== config.selection_url ||
      page.last !== config.selection_url)
  ) {
    issues.push(
      issue(
        "inconsistent_final_pagination",
        "a final page must have identical self, first, and last page-zero links",
      ),
    );
  }
  return Object.freeze(issues);
}

export function validateSelection(value: unknown, config: PilotConfig): SelectionResult {
  const pageValidation = validateDrupalPage(value);
  if (!pageValidation.ok) {
    return unavailable([
      issue(
        "schema_invalid",
        pageValidation.errors
          .map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`)
          .join("; "),
      ),
    ]);
  }

  const page = pageValidation.value;
  const issues: SelectionIssue[] = [...inspectPagination(page, config)];
  const orderedIds: string[] = [];
  const seenIds = new Set<string>();
  let priorId: number | undefined;

  page.list.forEach((record, index) => {
    orderedIds.push(record.nid);
    const inspection = inspectRecord(record, index, priorId, seenIds);
    issues.push(...inspection.issues);
    if (inspection.numericId !== undefined) {
      priorId = inspection.numericId;
    }
  });

  if (issues.length > 0) {
    return unavailable(issues);
  }

  return Object.freeze({
    complete: true,
    orderedIds: Object.freeze(orderedIds),
    records: Object.freeze([...page.list]),
    self: page.self,
    first: page.first,
    last: page.last,
    next: page.next,
  });
}
