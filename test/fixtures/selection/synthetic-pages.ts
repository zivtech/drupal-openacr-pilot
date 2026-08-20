const selectionUrl =
  "https://www.drupal.org/api-d7/node.json?type=project_issue&field_project=3060&field_issue_version=11.x-dev&taxonomy_vocabulary_9=1101&limit=25&sort=nid&direction=DESC&page=0";

export interface SyntheticPageOptions {
  readonly ids?: readonly number[];
  readonly next?: string | null;
  readonly first?: string;
  readonly last?: string;
  readonly self?: string;
  readonly recordOverrides?: Readonly<Record<string, unknown>>;
}

export function buildSyntheticIssue(
  issueId: number,
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    nid: String(issueId),
    title: `Synthetic issue ${issueId}`,
    url: `https://www.drupal.org/project/drupal/issues/${issueId}`,
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
    ...overrides,
  };
}

export function descendingIssueIds(count = 25, first = 3_500_025): readonly number[] {
  return Array.from({ length: count }, (_, index) => first - index);
}

export function buildSyntheticPage(
  options: SyntheticPageOptions = {},
): Record<string, unknown> {
  const ids = options.ids ?? descendingIssueIds();
  const next = options.next === undefined ? `${selectionUrl.slice(0, -1)}1` : options.next;
  const last = options.last ?? `${selectionUrl.slice(0, -1)}4`;

  return {
    self: options.self ?? selectionUrl,
    first: options.first ?? selectionUrl,
    last,
    next,
    list: ids.map((issueId) => buildSyntheticIssue(issueId, options.recordOverrides)),
  };
}

export { selectionUrl };
