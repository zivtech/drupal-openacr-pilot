# Release Evaluation Engagement Record Template

> **Status:** Empty template. Completing this record requires a separate human
> commission. The Drupal 11 issue pilot does not complete or authorize it.

Use this record before collecting evaluation outcomes or drafting an
Accessibility Conformance Report (ACR). Do not infer answers from the issue
snapshot.

## Authority and identity

- Engagement ID:
- Commissioner:
- Evaluator or evaluation team:
- Independent reviewer:
- Authorized issuer, or `no issuer`:
- Product owner:
- Report correction contact:
- Commission date:
- Evaluation start and end dates:
- Evidence cutoff date and time zone:

**Gate:** Stop if the commissioner, evaluator, product owner, or issuer state is
missing or ambiguous.

## Exact product and release

- Product name:
- Exact version, release tag, or commit:
- Release source URL:
- Installation profile:
- Enabled core modules:
- Included themes:
- Configuration and sample content:
- User roles and permissions:
- Languages:
- Third-party components and services:

The issue pilot's `11.x-dev` filter is not an acceptable substitute for this exact
evaluation identity.

## Scope and complete processes

- Included interfaces:
- Excluded interfaces and reasons:
- Front-end scope:
- Administrative and authoring scope:
- Documents and media scope:
- Complete processes:
- Essential functionality:
- Known environment constraints:

**Gate:** Stop if exclusions manipulate the scope or if an essential complete
process is only partially represented.

## Standards and report target

- Conformance target:
- Procurement or contractual requirements:
- Required Voluntary Product Accessibility Template (VPAT) edition:
- Required OpenACR catalog and toolchain, if any:
- Additional standards, such as Authoring Tool Accessibility Guidelines (ATAG):
- Out-of-catalog annex requirements:

Do not select a catalog because the tool supports it. Follow the engagement's
actual procurement and reporting requirements.

## Accessibility-support baseline

Record exact versions and relevant settings.

- Operating systems:
- Browsers:
- Screen readers:
- Other assistive technologies:
- Keyboard and alternative input methods:
- Zoom, reflow, contrast, and motion settings:
- Supported combinations and rationale:
- Known unsupported combinations and rationale:

## Exploration and sampling plan

- Exploration method:
- Structured sample and rationale:
- Random sample method:
- Complete-process sample:
- Repeated components and templates:
- Required states, including loading, empty, validation, error, and success:
- Authentication and permission states:
- Sample expansion rule:
- Representativeness review method:

## Evaluation methods

- Manual criterion review:
- Keyboard testing:
- Screen reader and assistive-technology testing:
- Zoom, reflow, contrast, and motion testing:
- Cognitive and plain-language review:
- Automated tools and exact versions:
- Code or component review:
- Testing with people with disabilities, if commissioned:

Automated output is evidence input, not a conformance decision.

## Evidence and outcome contract

- Evaluation report location:
- Evidence store:
- Finding identifier format:
- Sample and state identifier format:
- Per-success-criterion outcome format:
- Coverage-boundary format:
- Contradictory-evidence handling:
- Retention and correction policy:

Each unmet or uncertain outcome must trace to evaluator-authored evidence and
named samples. An issue URL may add remediation traceability but cannot replace a
finding.

## Issue-snapshot relationship

- Snapshot ID, if used:
- Snapshot timestamp:
- Linkage-ledger location:
- Permitted relationship types:
- Current-source freshness state:

Confirm all statements:

- [ ] Issue presence does not prove a barrier.
- [ ] Issue absence does not prove support.
- [ ] Issue closure does not prove resolution.
- [ ] A stale or unavailable snapshot cannot change an evaluated outcome.
- [ ] Re-evaluation evidence is required before marking a finding resolved.

## Draft and publication boundary

- Draft disclaimer:
- Human metadata review:
- Schema and catalog validation commands:
- Rendered artifact review method:
- Authorized issuer decision:
- Publication destination:
- Correction and version-retention process:

If the issuer state is `no issuer`, an internal draft may be prepared only after
all evaluation gates pass. Publication handoff remains blocked.

## Engagement approval

- Commissioner approval, name and date:
- Evaluator acceptance, name and date:
- Product owner approval, name and date:
- Issuer state confirmation, name and date:
- Independent scope review, name and date:

No outcome collection begins until this record is complete and approved.
