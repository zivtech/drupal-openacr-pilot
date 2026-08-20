# Drupal 11 Issue-Driven OpenACR Pilot Charter

> **Charter status:** Authorized by the current workflow sponsor for independent
> Zivtech Phase 1 planning and collector implementation; operational and community
> adoption gates remain pending
>
> **Charter ID:** `drupal11-issue-traceability-pilot-v0`
>
> **Drafted on:** 2026-08-18
>
> **Authority:** Independent pilot only. This charter authorizes a Phase 1 data
> plan and implementation of a read-only collector in the Zivtech pilot repository.
> It does not authorize a live collection run until the operational gates below
> are satisfied, nor any evaluation, ACR draft, issue write, import, signature, or
> publication.

## What is this pilot for?

This pilot asks one bounded question: Can a frozen set of public Drupal.org issues
help reviewers trace accessibility remediation work for the Drupal 11 release line
without treating the issue queue as an accessibility evaluation?

The issue snapshot would be a control-plane artifact. It may organize public issue
identifiers, source state, and later links to evaluator-authored findings. It must
never create or change a WCAG outcome, an OpenACR adherence term, or a statement
about Drupal core conformance.

The evaluation report remains the evidence spine. No evaluation report is
commissioned or included in this charter.

This is an independent proposal. It is not endorsed by Drupal core, the Drupal
Association, GSA/OpenACR, or Mike Gifford. Repository publication of this draft
does not establish their approval.

## Proposal inputs and approval state

| Decision | Charter value | Input source | Approval state |
|---|---|---|---|
| Product family | Drupal core | Current workflow sponsor | Provided for proposal |
| Pilot release identity | Drupal 11 release line, represented in the issue API by `field_issue_version=11.x-dev` | Current workflow sponsor selected “Drupal 11”; Codex mapped the observed API field | Mike Gifford must confirm this release-line interpretation |
| Proposed pilot release-scope owner | Mike Gifford | Current workflow sponsor | Role acceptance pending |
| Independent pilot implementation authority | Zivtech pilot, authorized by the current workflow sponsor on 2026-08-18 | Current workflow sponsor | Phase 1 planning and collector implementation authorized; live collection and snapshot promotion gates remain pending |
| Authorized issuer | `no issuer` | Current workflow sponsor | Effective state until an organization accepts publication authority and names a representative |
| Proposed future issuer | Drupal Association, acting on behalf of the Drupal core project | Current workflow sponsor's follow-up plus Drupal governance review | Association acceptance, a named representative, and Drupal Core Leadership Team technical-scope approval are pending |
| Evidence and implementation repository | Public GitHub repository `zivtech/drupal-openacr-pilot` | Current workflow sponsor corrected the repository preference | Authorized for the independent pilot; not an official Drupal repository |
| Community review path | `mgifford/drupal-core` pull request 57, submitted from the Zivtech-owned fork | Current workflow sponsor | Pending upstream review; fork creation, review, or merge does not confer issuer or Drupal project authority |
| Release evaluation | Must be commissioned separately | Current workflow sponsor | Confirmed for this proposal |

Drupal.org listed Drupal 11.4.4 as the newest Drupal 11 release observed on
2026-08-18. The issue API returned no matching `Accessibility`-tagged records for
`field_issue_version=11.4.4` or `11.4.x-dev`. It did return records for
`11.x-dev`. This charter therefore defines a Drupal 11 **release-line traceability
pilot**, not a Drupal 11.4.4 evaluation or point-release ACR.

## Who has authority?

| Role | Named person or state | May do | May not do |
|---|---|---|---|
| Proposed pilot release-scope owner | Mike Gifford, pending his acceptance | Approve or reject the release-line identity and pilot relevance | Act as an official Drupal release owner through this proposal or treat the snapshot as conformance evidence |
| Independent pilot operator and submitter | Zivtech | Plan and implement the bounded read-only pilot in its repository and submit it for review | Represent the pilot, pull request, or a merge as official Drupal approval or issue an official Drupal core ACR |
| Charter drafter | OpenAI Codex, working for the current workflow sponsor | Draft and revise pilot documents and implementation under the recorded authorization | Approve human authority or make product claims |
| Phase 0 reviewer | Independent accessibility scope reviewer, to be recorded in the review disposition | Review scope, claims, privacy, and provenance | Replace missing human ownership or evaluation evidence |
| Collector | Unassigned | Implementation may proceed, but no live fetch or snapshot promotion until the collector and raw-response custodian are recorded and live action is separately authorized | Fetch or retain a live pilot snapshot before every operational and live-action gate is complete |
| Evaluator | Unassigned; a separate commission is required | Nothing under this charter | Infer outcomes from issues or draft an ACR |
| Proposed future issuer | Drupal Association, pending institutional acceptance and a named representative | If it accepts the role, own human sign-off, corrections, and publication for an evidence-backed Drupal core ACR | Acquire authority merely because this proposal names it or replace Drupal core technical-scope approval |
| Authorized issuer | `no issuer` | No publication authority exists | Sign, import, submit, or publish an ACR |

The collector and evaluator belong to different lanes. The current workflow
sponsor has authorized Phase 1 planning and implementation in the Zivtech pilot
repository. A live collection run and snapshot promotion remain blocked until a
collector, repository maintainer, evidence reviewer, and raw-response custodian are
recorded, the retention record is complete, and a separate live-action
authorization is recorded. An evaluator remains unassigned
until a separate evaluation engagement is approved; evaluation staffing is not a
prerequisite for collector implementation. Mike Gifford's acceptance remains a
gate for describing the work as an upstream or community pilot, not for the
independent Zivtech prototype.

## Which issues would the pilot select?

The proposed selection is the newest 25 public Drupal core project issues that:

1. have issue version `11.x-dev`;
2. carry the Drupal.org `Accessibility` issue tag (taxonomy term ID `1101`); and
3. appear on the first API page when sorted by numeric issue ID descending.

The exact public query is:

```text
https://www.drupal.org/api-d7/node.json?type=project_issue&field_project=3060&field_issue_version=11.x-dev&taxonomy_vocabulary_9=1101&limit=25&sort=nid&direction=DESC&page=0
```

Every future Phase 1 attempt must send the exact reviewed contact header
`User-Agent: Zivtech-Drupal-OpenACR-Pilot/0.1 (+https://github.com/zivtech/drupal-openacr-pilot)`.
Changing that value requires configuration review and a new configuration digest.

The selection includes every issue status, category, priority, and component that
meets those mechanical filters. The charter does not privilege closed, active,
high-priority, or recently changed issues. It does not use issue text, AI
classification, philosophy tags, or unpublished tools to decide relevance.

### Why this query?

- `field_project=3060` identifies Drupal core.
- `field_issue_version=11.x-dev` is the API value observed for the user-selected
  Drupal 11 release line.
- `taxonomy_vocabulary_9=1101` is the public `Accessibility` tag.
- Sorting by `nid` descending gives an inspectable “newest created issues” rule.
- `limit=25&page=0` enforces the charter ceiling.

This is a purposeful top-25 sample, not a complete query universe. During the
2026-08-18 observation, page 0 returned 25 records and advertised a `next` link;
page 1 returned another 25 non-overlapping records and also advertised a `next`
link. That proves the matching universe is larger than the pilot.

### Termination rule

The Phase 1 collector, if separately approved, would request only the exact page 0
URL above. The collection is complete **for this top-25 selection rule** when all
of these conditions hold:

1. the response is HTTP 200 JSON with a `list` array;
2. when the response advertises `next`, the array contains exactly 25 records;
3. when the response does not advertise `next`, the array may contain fewer than
   25 records only when `self`, `first`, and `last` consistently show page 0 as
   the first and final page;
4. every record matches project `3060`, version `11.x-dev`, and tag `1101`;
5. issue IDs are unique and in descending numeric order;
6. the complete requested URL and every server pagination link are retained in
   the receipt; and
7. the run has no transport, parsing, schema, pagination, or validation failure.

A server `next` link is retained as evidence that out-of-charter records exist. It
is not followed because doing so would exceed the selected top-25 sample. Any
proposal to select page 1, use a different sort, add comments, or exceed 25 records
requires a new charter and review.

A short page with `next`, inconsistent pagination links, duplicate or out-of-order
IDs, or an unexplained count mismatch is `unavailable`. It must never be labeled a
complete current selection.

## What data may be retained?

Comments, attachments, issue bodies, user profiles, email addresses, and private
or authenticated data are excluded.

A future retained public projection may include only fields needed for selection,
source integrity, traceability, and human review:

- issue ID, title, canonical URL, project, component, issue version, status,
  category, priority, and public tag IDs;
- creator name or pseudonym supplied for issue authorship, when available, without
  importing broader profile fields;
- source creation and changed timestamps supplied by Drupal.org;
- retrieval time, observation state, exact requested URL, page identifier, and
  returned pagination links;
- page-representation SHA-256 over the exact content-decoded bytes exposed by the
  HTTP client, canonical-projection SHA-256, canonicalization version, and
  collector/configuration digest; and
- later typed linkage identifiers, only after a separately approved evidence
  linkage phase.

Issue status remains operational metadata. It must not select an evaluation
outcome or OpenACR term.

## What is the license, privacy, and retention policy?

Drupal.org licenses non-code issue content under Creative Commons
Attribution-ShareAlike 2.0 except where the source identifies another license.
Every retained record or manifest must preserve the issue title, canonical URL,
creator credit supplied by the source, issue ID, retrieval time, applicable license
URI or exception, and a notice that canonicalization changed the presentation.
If source-supplied creator credit is absent, collection stops until a human approves
a reasonable collective-credit method.

The public GitHub repository must retain canonical projections and receipts for
the life of the pilot so that released snapshot interpretations remain inspectable.
It must not contain raw response bodies. By default, the exact content-decoded
response-representation bytes exposed by the HTTP client may exist only in an
ephemeral collector-local temporary directory for the duration of hashing,
projection, and validation. They are sensitive raw-response material under this
policy even though they are not compressed wire bytes. The collector must delete them through a
guaranteed cleanup path on success, parsing or validation failure, cancellation,
and exception, then record a deletion receipt. A startup recovery sweep must
delete unapproved raw files left by a crash. Without a recorded debugging
exception, cleanup must finish before normal process exit and no later than one
hour after temporary-file creation.

A named human may approve a debugging exception for no more than 30 days. Before
any live request, source profiling, or snapshot promotion, the
[raw-response retention record](raw-response-retention-record-template.md) must
name the storage class and location identifier, custodian, authorized users,
backup/cache/temp-file treatment, deletion method, deadline, and deletion-receipt
location. Fixture-only implementation does not create source-response custody.
Unrecorded or automatically backed-up response storage is prohibited. The public
record retains the page-representation hash and inspectable minimal projection.

If a privacy, licensing, security, or takedown concern arises, collection stops.
The release owner and repository maintainer review whether text must be removed.
When lawful and appropriate, the repository retains a tombstone, source URL,
hashes, and disposition instead of silently rewriting history.

This is a proposed operational policy, not legal advice. The current workflow
sponsor has accepted it for independent Zivtech planning and implementation. Mike
Gifford must accept it before upstream or community adoption.

## What are the stop conditions?

Stop collector implementation or any live run, as indicated, if any of these
conditions applies:

- Stop upstream/community adoption if Mike Gifford does not accept the proposed
  pilot release-scope-owner role or the Drupal 11 release-line interpretation;
  this does not prevent the clearly labeled independent prototype.
- Stop before a live collection run or snapshot promotion if the collector,
  evidence reviewer, repository maintainer, and raw-response custodian are not
  recorded, the retention record is incomplete, or separate live-action
  authorization has not been recorded.
- A release evaluation is treated as included rather than separately commissioned.
- The exact query cannot be reproduced, returns more than 25 records in its `list`,
  or stops producing an ordered top-25 response.
- The API cannot be used with normal TLS verification, a clear user agent, one
  request worker, caching, and fail-closed error handling.
- The pilot requires comments, issue bodies, authenticated data, private security
  issues, or broader user-profile fields.
- Raw bytes cannot be kept out of the public repository or deleted within the
  stated retention period.
- The raw-response retention record does not name custody, storage, access,
  backup/cache treatment, deletion method, deadline, and receipt location.
- An issue, issue status, patch, comment, or closure is used to fill missing
  finding, sample, outcome, or ACR evidence.
- Someone asks the collector or model to file, sign, import, submit, or publish an
  ACR.
- Someone proposes committing an ACR draft to a public repository while the issuer
  state remains `no issuer`; public Git history is a publication surface.
- Someone describes the Zivtech repository, its pilot outputs, the community-review
  pull request, or an upstream merge as Drupal Association or Drupal Core
  Leadership Team approval.

## What does approval authorize?

The current workflow sponsor's approval authorizes a Phase 1 data plan and
implementation of a read-only frozen-snapshot collector in
`zivtech/drupal-openacr-pilot`. It does not authorize a live collection run or
snapshot promotion until the operational roles and raw-response retention record
are complete and a human separately authorizes the specific live request or
promotion action.

Approval does not establish a product evaluation scope, accessibility-support
baseline, conformance target, sample, outcome, legal position, completed ACR, or
publication authority.

## Human approval record

- [x] The current workflow sponsor authorizes independent Zivtech Phase 1 planning
      and collector implementation and confirms that this is a pilot, not an
      official release.
- [ ] Mike Gifford accepts the proposed pilot release-scope-owner role.
- [ ] Mike Gifford accepts “Drupal 11 release line / `11.x-dev`” as the pilot
      traceability identity.
- [ ] Mike Gifford accepts the exact top-25 query and its termination rule.
- [ ] Mike Gifford accepts the public projection, immediate raw deletion default,
      and maximum 30-day human-approved exception.
- [ ] The raw-response retention record names custody, storage, access,
      backup/cache treatment, deletion, and receipt details.
- [ ] A collector, repository maintainer, evidence reviewer, and raw-response
      custodian are recorded before a live collection run.
- [ ] After the operational controls above are reviewed, a human records separate
      authorization for the specific live request or snapshot-promotion action.
- [ ] The scope/claim-boundary review is attached and all blocking findings are
      resolved.

Planning and implementation may proceed under the checked sponsor authorization.
A live collection run and snapshot promotion remain blocked until the operational
boxes are checked. Upstream/community adoption remains blocked until Mike Gifford
records the applicable acceptances.

Publication remains separately blocked unless the Drupal Association accepts the
issuer role, names an authorized representative, and obtains the applicable
Drupal Core Leadership Team technical-scope approval. Those publication approvals
do not substitute for the separately commissioned evaluation.

## References

- [Drupal.org REST and other APIs](https://www.drupal.org/drupalorg/docs/apis/rest-and-other-apis)
- [Drupal.org Terms of Service](https://www.drupal.org/terms)
- [Drupal.org Privacy Policy](https://www.drupal.org/privacy)
- [Drupal core releases](https://www.drupal.org/project/drupal/releases?version=11)
- [Drupal core ACR process guidance](https://mgifford.github.io/drupal-core/docs/acr-process.html)
- [GSA OpenACR](https://github.com/GSA/openacr)
- [WCAG Evaluation Methodology 2.0](https://www.w3.org/TR/wcag-em-2/)
- [Community-review pull request](https://github.com/mgifford/drupal-core/pull/57)
