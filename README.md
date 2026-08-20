# Independent Drupal 11 OpenACR Traceability Pilot Proposal

> **Status:** The current workflow sponsor has authorized Phase 1 planning and
> collector implementation for an independent Zivtech pilot. No live collection,
> evaluation, Accessibility Conformance Report (ACR), or publication workflow is
> authorized yet.
>
> **No endorsement:** This is an independent proposal. Drupal core, the Drupal
> Association, GSA/OpenACR, and Mike Gifford have not endorsed or approved it.

Zivtech operates this repository as an independent Drupal 11 issue-traceability
pilot. The Phase 0 package is also under community review in
[mgifford/drupal-core PR #57](https://github.com/mgifford/drupal-core/pull/57).
Neither the Zivtech repository nor that pull request is an official Drupal project
artifact. The pilot tests whether a frozen set of public Drupal.org issues can
support remediation traceability without becoming evidence of conformance.

The short version:

- Drupal.org issues are remediation records and an evidence index. They do not
  determine Web Content Accessibility Guidelines (WCAG) outcomes or OpenACR terms.
- The proposed selection is limited to 25 public Drupal core issues. Comments are
  excluded.
- Mike Gifford is the proposed pilot release-scope owner. His acceptance of that
  role is still required.
- The current issuer state is `no issuer`. The Drupal Association is the proposed
  future issuer, acting on behalf of the Drupal core project, but it has not
  accepted that role or named an authorized representative. No ACR publication
  handoff is allowed.
- Any release evaluation must be commissioned separately and must define its own
  exact version, scope, baseline, sample, methods, and conformance target.

## Phase 0 documents

- [Pilot charter](docs/pilot-charter.md)
- [Engagement record template](docs/engagement-record-template.md)
- [Threat and provenance review](docs/threat-provenance-review.md)
- [Raw-response retention record template](docs/raw-response-retention-record-template.md)
- [Independent critic review](docs/critic-review.md)
- [License and attribution policy](LICENSE.md)

## Phase 1 planning

- [Read-only issue-snapshot data implementation plan](docs/plans/2026-08-18-drupal-issue-snapshot-phase1-data-plan.md)

## What happens next?

The sponsor's authorization permits a Phase 1 data plan and implementation of a
read-only collector in this repository. A live collection run and promotion of a
snapshot remain blocked until the collector, repository maintainer, evidence
reviewer, and raw-response custodian are recorded, the retention controls are
reviewed, and the specific live action is separately authorized. Mike Gifford's
acceptance is still required before the work is described as an upstream or
community pilot.

An official Drupal core ACR would additionally require the Drupal Association to
accept the issuer role and name a representative, plus technical-scope approval
from the Drupal Core Leadership Team and a separately commissioned evaluation.

Related guidance:

- [Drupal core ACR process guidance](https://mgifford.github.io/drupal-core/docs/acr-process.html)
- [Drupal.org REST and other APIs](https://www.drupal.org/drupalorg/docs/apis/rest-and-other-apis)
- [GSA OpenACR](https://github.com/GSA/openacr)
- [Community-review pull request](https://github.com/mgifford/drupal-core/pull/57)

## AI use

OpenAI Codex materially assisted with research and drafting. Humans remain
responsible for the scope, source licensing, release ownership, evaluation, and
any public claim.
