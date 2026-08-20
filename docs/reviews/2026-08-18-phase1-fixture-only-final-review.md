# Phase 1 fixture-only collector final review

> **Review date:** 2026-08-18
>
> **Implementation reviewed:** local commit `c61d211` plus the uncommitted
> review remediations listed below
>
> **Combined verdict:** `ACCEPT-WITH-RESERVATIONS` for fixture-only implementation
>
> **Live-action verdict:** `BLOCKED`

## Scope and evidence boundary

This review covers the fixture-only Phase 1 collector implementation against the
accepted data plan and critic dispositions. It includes static inspection,
synthetic tests, schema validation, provenance rendering tests, and coverage.

This review did not make a live Drupal.org request, profile source data, promote a
snapshot, evaluate Drupal, or draft or publish an ACR. It is not a WCAG conformance
review, an assistive-technology test of a rendered interface, an API certification,
or live-run authorization.

## Final data-critic review

### Verdict

`ACCEPT` for the fixture-only data contract. The implementation reproduces the
plan's formulas and pinned vectors, rejects unexplained input, and creates no
candidate on transport, parse, schema, completeness, provenance, or cleanup
failure. No fallback substitutes old, partial, defaulted, or fabricated data.

### Formula and unit audit

| Contract | Evidence | Disposition |
|---|---|---|
| Exact response-representation SHA-256 | Standard `abc` vector, empty/cap boundary tests, content-decoded byte count, explicit cleanup receipt | Pass |
| NFC plus RFC 8785 canonical projection | Reordered/NFC fixtures, primitive-number vector, unsafe Unicode/number/object rejection, numeric tag-ID ordering | Pass |
| Freshness | Strict UTC parsing, integer epoch milliseconds, `now < fresh_until`, equality is stale, every non-retrieved state is unavailable | Pass |
| Retry delay | Integer milliseconds, strict single `Retry-After`, bounded exponential backoff and jitter, excessive delay and final-attempt no-sleep controls | Pass |
| Selection completeness | At most 25, exactly 25 with `next`, consistent final-page links without `next`, unique safe descending IDs | Pass |
| Selection-receipt hash | Exact Formula 6 payload, pinned 769-byte vector, evidence-sensitivity test | Pass |
| Manifest hash and snapshot ID | Exact Formula 7 payload, first 16 lowercase hash characters, receipt-sensitivity and membership reconciliation | Pass |

Counts, identifiers, decoded and declared byte domains, attempts, redirects, and
millisecond values remain integers. UTC strings are validated as real calendar
instants with no more than millisecond precision. Hashes remain 64-character
lowercase hexadecimal strings and are never converted to numbers.

### Fallback, provenance, and failure-state audit

- Missing or drifted configuration fails without defaults.
- DNS, TLS, timeout, permission, throttling, server, body, parsing, and schema
  failures become `unavailable`; they do not reuse a prior snapshot.
- A selection-endpoint `404` or `410` does not become `resource_gone`.
- Encoded `Content-Length` and decoded representation bytes are separately named
  and are not reconciled as if they were the same byte domain.
- Candidate creation requires a complete retrieved receipt, matching record order
  and counts, recomputed record/receipt/manifest hashes, and matching deletion
  evidence before atomic finalization.
- Crash remnants remain outside candidate directories and recovery evidence does
  not claim a representation hash when no representation file existed.
- Fixed synthetic evaluation-outcome and ACR-term bytes are invariant under `429`,
  stale, unavailable, issue-status change, and issue closure scenarios.

### Review findings remediated

1. **Persisted timestamp schemas accepted impossible dates.** Added one shared,
   strict UTC calendar validator and applied it to page, record, receipt, manifest,
   deletion, and network-run schemas.
2. **Crash recovery could report SHA-256 of empty bytes when no representation
   file had ever existed.** Recovery evidence now records a nullable hash and
   hashes only an observed file.
3. **Clock inputs allowed fractional epoch milliseconds.** Freshness, retry, and
   network-run admission now require Date-valid safe integers.
4. **The HTTPS regex accepted malformed or credential-bearing URLs.** Persisted
   generic HTTPS URLs now also pass a parser-backed, credential-free format.
5. **A filesystem write could theoretically complete only part of a response
   chunk.** Capture now writes each chunk to completion or fails closed.

## Accessibility scope critic

### Verdict

`ACCEPT-WITH-RESERVATIONS` for the Markdown source contract. No collector field or
collector state is connected to an accessibility outcome or OpenACR adherence
term. The source-level provenance views use headings, lists, descriptive labels,
and textual states; neither color nor position is required to understand status.

The successful-candidate view communicates candidate state, observation state,
fresh/stale status, fetched and freshness timestamps, policy duration, request and
response provenance, integrity hashes, ordered issue links, exclusions, and claim
negative space. The unavailable path now writes a separate Markdown view that
states `no candidate created`, `Observation state: unavailable`, `Freshness:
unavailable`, the fetched time, the termination reason, and the same claim
boundary.

### Access-perspective check

| Perspective | Source-level result | Evidence boundary |
|---|---|---|
| Keyboard | No custom interactive control is introduced; links use ordinary Markdown link syntax | Renderer focus order and focus visibility were not tested |
| Screen reader | Heading hierarchy, list structure, link labels, and status words are present in source | No Markdown renderer or screen reader was exercised |
| Low vision | Status is textual and freshness duration includes both exact milliseconds and readable hours | Wrapping of long URLs and hashes depends on renderer CSS |
| Cognitive | Candidate versus unavailable state and `Not supplied` values are explicit; no unexplained color key or score exists | No user study was performed |
| Voice control | Issue links use issue titles; provenance URL links retain their exact visible URL | Renderer-specific generated accessible names were not inspected |
| Reduced motion | The artifact defines no motion or animation | A downstream renderer is outside this repository |
| Deaf or hard of hearing | The artifact contains no audio or video content | Captions and transcripts are not applicable |

### Review finding remediated

**Unavailable runs had structured JSON but no human-readable provenance view.**
The collector now writes `<run-id>.provenance.md` beside the unavailable receipt,
and integration tests prove that it communicates the failure state without
calling it a snapshot, evaluation, or ACR.

### Reservation

The repository produces Markdown, not a specified rendered interface. Reflow of
long hashes and URLs, renderer-generated semantics, keyboard focus, and actual
assistive-technology output cannot be established from source alone. This is not
a finding against the fixture collector and does not imply WCAG conformance.

## Verification evidence

Executed with the exact `.nvmrc` runtime, Node `24.18.0`:

- `npm ci`: pass; 11 packages audited, 0 vulnerabilities reported
- `npm run typecheck`: pass
- `npm test`: 106 passed, 0 failed
- `npm run test:coverage`: pass
  - lines: 90.15%
  - branches: 85.00%
  - functions: 88.44%
- `git diff --check`: pass
- review-diff secret-pattern scan: no match

All HTTP behavior in these tests used injected synthetic responses. No test made a
live Drupal.org request.

## Live-action gate

The live-action gate remains blocked. The raw-response retention record still has
unnamed operational roles and unchecked controls. Before any live request, source
profiling, or snapshot promotion, a human must complete the plan's role,
retention, config-digest, deletion-evidence, exact User-Agent, traffic-interval,
and separate live-action authorization gates.
