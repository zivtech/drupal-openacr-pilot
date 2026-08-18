# Phase 0 Threat and Provenance Review

> **Review status:** Draft. This is a design review of a proposed read-only pilot,
> not evidence that a collector is safe or complete.

## Source and observation boundary

The proposed source is Drupal.org's public, read-only RestWS endpoint. Drupal.org
asks API consumers to use an appropriate user agent, make requests from one
thread, cache results, and avoid abusive traffic.

The observation used:

```text
User-Agent: Zivtech-OpenACR-Phase0/0.1 (+https://github.com/AlexU-A)
Accept: application/json
```

No authentication, comments endpoint, form submission, issue write, or private
security issue was accessed.

## Observed API behavior on 2026-08-18

| Observation | Result |
|---|---|
| Exact Drupal 11 + `Accessibility` query, `page=0` | HTTP 200; JSON keys `self`, `first`, `last`, `next`, and `list`; 25 records; 187,657 response bytes; `next` present |
| Same query, `page=1` | HTTP 200; 25 different records; `prev` and `next` present |
| Page indexing | `page=0` acted as the first page; `page=1` acted as the second |
| Ordering | Returned issue IDs were in descending numeric order when using `sort=nid&direction=DESC` |
| `Accessibility` tag identity | Taxonomy term `1101` returned name `Accessibility` in vocabulary `9` |
| `ACR` tag identity | Taxonomy term `199458` returned name `ACR` in vocabulary `9` |
| Drupal 11 + `ACR` tag query | HTTP 200 with zero records and no `next` link |
| Drupal 11.4 point/minor filters | `11.4.4` and `11.4.x-dev` each returned zero `Accessibility`-tagged records in the observed query |
| Rate-limit signal | No `Retry-After` header appeared on the observed successful requests |

The documentation currently contains an internal inconsistency: it says query
endpoints return up to 100 resources, then states that the hard-coded limit is 50.
The pilot does not resolve that discrepancy. It requests 25 and validates the
actual response.

The full page 0 ordered IDs observed at 2026-08-18T12:10:55.701Z were:

```text
3604071, 3584694, 3572628, 3570505, 3543541,
3530862, 3513439, 3506743, 3504913, 3501457,
3485202, 3475979, 3469774, 3467181, 3413938,
3399676, 3397278, 3375394, 3335411, 3333401,
3331158, 3327960, 3303777, 3300835, 3290899
```

These IDs are an observation receipt, not a frozen snapshot. Phase 1 remains
blocked and no canonical projections or raw responses were retained by this
repository.

## Threat register

| Threat | Likely harm | Required control | Stop condition |
|---|---|---|---|
| Issue status becomes a conformance signal | False or inflated ACR terms | Keep issue metadata outside the evaluation outcome map; negative-test byte-identical outcomes during source failure | Any status field influences an outcome or term |
| The top-25 rule is described as a complete queue | Misleading scope and progress claims | Label it as a bounded sample and retain the server `next` link | Any text implies completeness beyond the selected page |
| API drift, throttling, or partial response | Silent omissions or rewritten history | Immutable receipts, schema validation, retry limits, and `unavailable` state | Missing page data is labeled complete or stale data is labeled current |
| A short page is accepted as the newest 25 | Incomplete bounded selection | Require exactly 25 records whenever `next` exists; accept fewer only when pagination metadata consistently proves page 0 is final | A short page with `next` or inconsistent links is labeled complete |
| Permission or transport failure becomes deletion | False tombstones | Only canonical HTTP 404 or 410 may produce `resource_gone` | Any 401, 403, 429, 5xx, TLS, DNS, parsing, or transport failure becomes a tombstone |
| Public issue text contains personal or unsafe content | Privacy harm, injection, or unwanted republication | Exclude bodies, comments, profiles, and attachments; escape retained text in any viewer | The pilot requires excluded narrative fields |
| Raw responses are committed or persist without custody | Unnecessary duplication of personal and narrative data | Use ephemeral collector-local storage, guaranteed cleanup on success/failure/cancellation/exception, a crash-recovery sweep, a one-hour default deadline, a deletion receipt, and a named exception record for any retention up to 30 days | Raw bodies enter Git history or survive without a custody/deletion record |
| License attribution is lost | License breach and unverifiable source | Preserve title, creator credit as supplied, issue ID, canonical URL, retrieval time, license URI/exception, and canonicalization notice | Projection lacks record- or manifest-level attribution |
| Query order changes between requests | Non-reproducible membership | Validate descending numeric IDs and freeze ordered membership with a manifest hash | Order cannot be explained or validated |
| Redirects cross an unapproved host | Source spoofing or data leakage | Allow only documented Drupal.org or approved migration hosts and record final URL | Redirect target is outside the allowlist |
| Untrusted source markup is rendered | Cross-site scripting or reviewer deception | Retain plain text only and escape it in future views | Source HTML is executed |
| Secrets enter receipts or logs | Account compromise | Use public unauthenticated requests; scan diffs; never log tokens or cookies | Credentials appear in any artifact |
| A model or automation performs external writes | Unauthorized community or procurement action | Read-only source client; no issue, ACR editor, importer, or publisher credentials | Any automated issue or publication write is proposed |
| Pilot authority or endorsement is assumed | Fabricated Drupal, GSA, or personal authority | Label the repository as an independent proposal and require Mike Gifford's recorded acceptance of the proposed role | Phase 1 is planned before acceptance or the draft implies endorsement |

## Data minimization and retention

The retained projection must include enough source data to inspect every selection,
freshness, redirect, and linkage decision. It must not mirror the complete issue
node.

Public Git history retains validated projections and receipts for the life of the
pilot. Raw response bytes are temporary validation material in ephemeral,
collector-local storage. Guaranteed cleanup covers success, failure, cancellation,
and exception; a startup sweep removes crash remnants. Without an approved
exception, deletion completes before normal process exit and no later than one
hour after file creation. A named human may approve a recorded debugging exception
for no more than 30 days. The custody and deletion template must be complete before
implementation. A raw hash never replaces the inspectable projection.

Drupal.org states that public contributions are visible to others and licenses
non-code content under Creative Commons Attribution-ShareAlike 2.0. Public status
does not remove the duty to minimize republished personal information.

## Failure semantics required for Phase 1

- `retrieved`: a successful response with valid required identity fields.
- `unavailable`: permission, throttling, server, TLS, DNS, transport, parsing,
  schema, or completeness failure.
- `resource_gone`: confirmed canonical HTTP 404 or 410 only.
- `redirected_or_migrated`: an allowed redirect or explicit migration mapping.
- `not_in_selection`: a complete later selection no longer contains a prior ID.

These states govern only current issue traceability. They cannot block or change a
completed evaluation outcome or OpenACR adherence term.

## Open review questions

1. Will Mike Gifford accept the proposed pilot release-scope-owner role and the
   release-line scope?
2. Who will serve as collector, repository maintainer, and evidence reviewer?
3. Who will approve any exceptional raw-response retention beyond immediate
   deletion?
4. Should the repository transfer to Mike Gifford or another community owner after
   charter approval?
5. Does the independent reviewer accept a deliberately bounded top-25 termination
   rule while the server advertises additional pages?

## Phase 0 recommendation

Proceed to human and independent review of the charter. Do not build a collector
until the role, release-line, retention, and top-25 termination questions are
resolved in the approval record.

## References

- [Drupal.org REST and other APIs](https://www.drupal.org/drupalorg/docs/apis/rest-and-other-apis)
- [Drupal.org Terms of Service](https://www.drupal.org/terms)
- [Drupal.org Privacy Policy](https://www.drupal.org/privacy)
- [GSA OpenACR](https://github.com/GSA/openacr)
