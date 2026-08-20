# Phase 0 Charter Critic Review and Dispositions

> **Review date:** 2026-08-18
>
> **Reviewer:** Independent `a11y-critic` scope/claim-boundary checkpoint
>
> **Initial verdict:** `REVISE`
>
> **Focused re-review:** `ACCEPT-WITH-RESERVATIONS`

## Review scope

This review covers process, evidence, provenance, privacy, licensing, and human
authority. No collector or user interface exists. The review is not an automated
accessibility test, WCAG conformance review, legal opinion, API certification, or
ACR approval.

## Findings and dispositions

### 1. A short page could be declared complete — major

**Finding:** The top-25 rule permitted any response with no more than 25 records,
even when `next` showed that the selected page should contain more records.

**Disposition:** Revised. When `next` exists, the selected page must contain exactly
25 valid, unique, ordered records. Fewer records are accepted only when pagination
metadata consistently proves that page 0 is also the final page. A short page with
`next` or inconsistent links is `unavailable`.

### 2. Raw-response custody and deletion were not auditable — minor

**Finding:** The 30-day deadline did not name storage, custody, backup/cache
treatment, deletion method, or receipt.

**Disposition:** Revised. Immediate deletion after validation is now the default.
A dedicated retention record must identify custody and deletion controls before
implementation. A human-approved debugging exception may last no more than 30
days.

### 3. Attribution fields were incomplete — minor

**Finding:** Canonical URL, issue ID, and retrieval time alone may not satisfy
reasonable Creative Commons attribution or source-specific exceptions.

**Disposition:** Revised. The projection or manifest must retain title, creator
credit as supplied, canonical URL, issue ID, retrieval time, license URI or
exception, and a canonicalization/modification notice. Missing creator credit stops
collection until a human approves a collective-credit method.

### 4. Wording could imply endorsement or accepted authority — minor

**Finding:** “Decision date,” “human owner,” the release-owner title, and the bare
repository title could imply approval by Mike Gifford, Drupal, or GSA/OpenACR.

**Disposition:** Revised. The package now calls itself an independent proposal,
names the source of proposal inputs, describes Mike Gifford as the proposed pilot
release-scope owner, and explicitly disclaims endorsement.

### 5. Raw cleanup did not cover every exit path — minor reservation on re-review

**Finding:** The first focused re-review found that the cleanup deadline began
after successful validation and did not expressly cover cancellation or crash
recovery.

**Disposition:** Revised and accepted. Cleanup now covers success, parsing or
validation failure, cancellation, and exceptions; a startup recovery sweep handles
crash remnants. Without a recorded exception, deletion must finish before normal
process exit and no later than one hour after temporary-file creation. The
environment-specific retention record requires deletion verification and a
receipt.

## Pending human gates

The critic did not treat these as drafting defects:

- Mike Gifford must accept the proposed role, release-line interpretation, query,
  termination rule, and retention policy.
- Collector, repository maintainer, and evidence reviewer roles remain unassigned.
- Any raw-retention exception needs a human approver.
- A release evaluation requires a separate commission and exact evaluation scope.
- Repository transfer or community ownership remains undecided.

## Claim boundary

- The package defines an issue-traceability sample, not a complete queue.
- It defines no Drupal accessibility outcome or ACR term.
- `no issuer` blocks public ACR drafts and publication handoff.
- A future collector would require a separate implementation plan and approval.

The final focused re-review found no remaining document defect or claim-boundary
regression. Its `ACCEPT-WITH-RESERVATIONS` verdict records the pending human and
operational gates above; it does not authorize collection, evaluation, an ACR
draft, or publication.

---

## Independent-pilot authorization and Phase 1 data-plan review

> **Review date:** 2026-08-18
>
> **Reviewer:** The same independent `a11y-critic` scope/claim-boundary reviewer,
> re-engaged after sponsor authorization
>
> **Initial verdict:** `REVISE`
>
> **First focused re-review:** `ACCEPT-WITH-RESERVATIONS`
>
> **Final disposition check:** `ACCEPT`

This is a later review. The Phase 0 `ACCEPT-WITH-RESERVATIONS` verdict above is
preserved as history and does not approve the sponsor authorization, the
independent repository, or the Phase 1 implementation plan.

### Current authority and repository boundary

The current workflow sponsor authorized fixture-based planning and collector
implementation in `zivtech/drupal-openacr-pilot`. No live Drupal.org request,
source profiling, or snapshot promotion is authorized until the operational roles,
retention record, reviewed configuration/deletion evidence, and a separate
live-action authorization are recorded. Mike Gifford's acceptance gates only
upstream/community characterization and adoption. The issuer remains `no issuer`;
no evaluation, ACR draft, import, signature, or publication is authorized.

### Phase 1 finding 1: Implementation and live-run gates conflicted — major

**Finding:** Residual language required retention controls before implementation,
while Task 1 could be read as permitting live response profiling before all
operational roles and controls existed.

**Disposition:** Revised. Fixture-only implementation creates no source-response
custody. Every live request, source-profiling action, and snapshot promotion waits
for the named collector, repository maintainer, evidence reviewer, custodian,
completed retention record, reviewed config digest, deletion evidence, exact
User-Agent review, and separate live-action authorization. Source profiling moved
from Task 1 to the final live-run gate.

### Phase 1 finding 2: The earlier critic verdict appeared current — major

**Finding:** The earlier review still described pre-authorization gates and could
be mistaken for approval of the later plan.

**Disposition:** Revised by this dated addendum. The historical verdict remains
unchanged and explicitly does not cover the new authority, repository, or plan.

### Phase 1 finding 3: Hash byte domains and receipt hashing were incomplete — major

**Finding:** “Raw” did not distinguish compressed wire bytes from the
content-decoded representation exposed by the HTTP client, and the plan did not
define the selection-receipt hash payload.

**Disposition:** Revised. The plan now hashes and names exact content-decoded
response-representation bytes before UTF-8 decoding. It records content coding,
transfer framing, declared encoded length, and decoded representation length as
separate fields without comparing their distinct byte domains. Formula 6 defines
the exact receipt payload, exclusions, NFC/JCS process, a pinned known vector, and
sensitivity tests; Formula 7 binds the receipt hash into the manifest.

### Phase 1 finding 4: Traffic and retry edge cases were incomplete — minor

**Finding:** The one-hour guard covered only successful runs, while past,
malformed, multiple, excessive, and final-attempt `Retry-After` behavior was not
fully specified.

**Disposition:** Revised. An atomic durable network-run start is written before
the first request and gates later runs regardless of success. Retries remain
inside that run. Formula 4 now defines strict single-value parsing, past-date
behavior, parse-error fallback, post-jitter clamping, excessive-delay termination,
and final-attempt no-sleep/no-fourth-request tests.

### Phase 1 finding 5: Future User-Agent was not implementable — minor

**Finding:** Only the historical Phase 0 request identity was exact.

**Disposition:** Revised. The future configuration requires
`Zivtech-Drupal-OpenACR-Pilot/0.1 (+https://github.com/zivtech/drupal-openacr-pilot)`;
the plan carries it through config validation, every transport attempt, the hashed
receipt, tests, and provenance output. The earlier value remains labeled as
historical observation evidence.

### Focused re-review reservations and final dispositions

The first focused re-review found the five initial findings resolved and returned
`ACCEPT-WITH-RESERVATIONS` for three minor specification seams:

1. freshness could be `fresh` when the observation was `unavailable`;
2. a final-named candidate could exist before deletion evidence was written; and
3. two summaries abbreviated the separate live-action gate and retained stale
   repository/role wording.

All three were revised. Formula 3 now makes every non-`retrieved` observation's
freshness `unavailable` with `fresh_until=null`. Candidate construction now uses a
unique staging directory, completes response cleanup and its deletion receipt,
and atomically renames only a complete bundle; interruption and collision tests
protect final-directory immutability. The charter and threat-review summaries now
repeat the separate live-action gate, all four operational roles, and the exact
Zivtech repository/community-PR boundary.

The independent reviewer verified these final dispositions and returned `ACCEPT`.
No remaining document defect blocks fixture-based implementation under the sponsor
authority recorded here.

### Current pending human gates

These are operational or authority gates, not drafting defects:

- name the collector, repository maintainer, evidence reviewer, and raw-response
  custodian;
- complete the environment-specific retention record and review deletion evidence;
- separately authorize a specific live request or snapshot-promotion action;
- obtain Mike Gifford's acceptance before upstream/community characterization;
- separately commission an evaluation;
- obtain Drupal Association issuer acceptance and a named representative before
  an official ACR; and
- obtain Drupal Core Leadership Team technical-scope approval for an official ACR.

The `ACCEPT` verdict closes the document review only. It does not authorize any
live request, snapshot promotion, community adoption, evaluation, ACR drafting,
or publication.
