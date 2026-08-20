# Drupal Issue Snapshot Phase 1 Data Implementation Plan

> **Execution contract:** Use the data-planner protocol. Invoke `data-critic` at
> every checkpoint marked with 🔍. Implement with tests first. This plan authorizes
> no live Drupal.org collection, snapshot promotion, evaluation, ACR draft, issue
> write, or publication.
>
> **Authority:** The current workflow sponsor authorized planning and collector
> implementation for an independent Zivtech pilot on 2026-08-18. Mike Gifford,
> Drupal core, the Drupal Association, and the Drupal Core Leadership Team have not
> approved it.

**Goal:** Build a single-worker, read-only collector that can turn one exact public
Drupal.org page into an immutable candidate snapshot of at most 25 Drupal 11
accessibility issues with reproducible provenance and fail-closed observation
states.

**Consequence of wrong data:** A malformed or incomplete snapshot could look like
evidence of current remediation or accessibility status and could later contaminate
a procurement-facing claim. The collector must therefore prefer `unavailable` to
an apparently complete but unsupported result.

**Error tolerance:** Hashes, counts, ordered membership, timestamps, and status
classification are exact. No statistical error is accepted. Freshness is a policy
classification, not a measured accessibility result.

**Implementation surface:** `zivtech/drupal-openacr-pilot` only. The community
review in `mgifford/drupal-core#57` remains documentation-only.

---

## Scope and consumers

The collector produces no score, rate of conformance, WCAG outcome, OpenACR term,
or issue-progress metric. Its numerical outputs are limited to identifiers,
counts, byte sizes, attempt/delay measurements, timestamps, and cryptographic
digests.

Consumers are:

1. a human evidence reviewer deciding whether a candidate snapshot is complete;
2. a future linkage ledger that may reference immutable issue IDs and hashes; and
3. repository maintainers reviewing provenance and deletion receipts.

The first implementation stops after producing a local candidate bundle and a
human-readable Markdown provenance view. It contains no Git commit, GitHub API,
Drupal.org write, ACR editor, import, signing, or publishing integration.

## Runtime and dependency decision

- Runtime: Node.js `24.18.0` LTS, pinned in `.nvmrc` and CI. Node 24 was the current
  LTS line verified on 2026-08-18.
- Language: TypeScript `7.0.2`, compiled before execution.
- Runtime validation: `ajv@8.20.0`, explicitly using JSON Schema 2020-12.
- Canonicalization: `canonicalize@4.0.0`, the JavaScript RFC 8785 implementation
  listed by the RFC.
- Test runner and hashing: Node's built-in `node:test` and `node:crypto`.
- Code license: GPL-2.0-or-later. Phase 0 prose remains CC BY-SA 2.0 under the
  existing attribution policy.
- Dependency control: exact versions and integrity values live in the committed
  `package-lock.json`; CI uses `npm ci`.

No dependency may coerce values, remove unknown fields, or assign defaults during
validation. Ajv options must disable type coercion, default insertion, and
additional-property removal.

## Exact pilot configuration

`config/pilot.drupal11.json` will contain:

```json
{
  "config_version": "1.0.0",
  "release_identity": "Drupal 11 release line / 11.x-dev",
  "selection_url": "https://www.drupal.org/api-d7/node.json?type=project_issue&field_project=3060&field_issue_version=11.x-dev&taxonomy_vocabulary_9=1101&limit=25&sort=nid&direction=DESC&page=0",
  "user_agent": "Zivtech-Drupal-OpenACR-Pilot/0.1 (+https://github.com/zivtech/drupal-openacr-pilot)",
  "allowed_hosts": ["www.drupal.org"],
  "max_records": 25,
  "max_response_bytes": 2097152,
  "request_timeout_ms": 30000,
  "max_attempts": 3,
  "max_redirects": 3,
  "base_backoff_ms": 1000,
  "max_backoff_ms": 30000,
  "max_jitter_ms": 250,
  "freshness_window_ms": 86400000,
  "minimum_live_run_interval_ms": 3600000,
  "canonicalization_version": "drupal-issue-snapshot-jcs-v1",
  "projection_schema_version": "1.0.0"
}
```

The 24-hour freshness window affects only whether the traceability view is labeled
current. The one-hour minimum live-run interval is a respectful-traffic guard. A
fresh or stale label can never change an evaluation outcome or ACR term.

`observation_state` uses the chartered source states `retrieved`, `unavailable`,
`resource_gone`, `redirected_or_migrated`, and `not_in_selection`. It is distinct
from the derived `freshness` value `fresh`, `stale`, or `unavailable`; the initial
selection collector normally emits only `retrieved` or `unavailable`.

The reviewed configuration digest is
`hex(SHA-256(UTF8(JCS(NFC(validated_config)))))`. The exact `user_agent` value is
schema-required, appears on every request attempt, and is copied into the hashed
selection receipt and human-readable provenance view.

## Data Assumption Register

| Assumption | Rating | Evidence | Risk if wrong |
|---|---|---|---|
| The exact page 0 query returns a JSON object with `list` and pagination links. | VERIFIED | Two Phase 0 observations on 2026-08-18 returned HTTP 200 with `self`, `first`, `last`, `next`, and 25 records. | Collection cannot be validated; result becomes `unavailable`. |
| Page 0 is the complete selected top-25 sample even when `next` exists. | VERIFIED | The charter deliberately selects only page 0 and preserves `next` as evidence of out-of-charter records. | Following `next` would violate the 25-record ceiling. |
| Drupal.org issue field shapes are stable enough for an allowlisted projection. | FRAGILE | Field identity has been observed, but nullability and nested shapes have not yet been profiled into reviewed fixtures. | A schema could silently drop or mislabel source values. Task 1 must use synthetic fixtures only; any source profiling waits for the full Task 8 live-action gate and stops on unexplained shapes. |
| Numeric issue IDs fit JavaScript safe integers. | REASONABLE | Observed IDs are seven digits; Drupal node IDs are far below `Number.MAX_SAFE_INTEGER`. | Precision loss could corrupt ordering or identity. Schema also retains the source string and rejects unsafe conversion. |
| RFC 8785 plus NFC normalization is stable for the allowlisted projection. | VERIFIED | RFC 8785 defines deterministic property ordering and ECMAScript primitive serialization; the plan adds an explicit pre-canonicalization NFC pass. | Cross-runtime hashes could diverge. Conformance vectors block release. |
| A 2 MiB response cap accommodates the selected page. | REASONABLE | Observed response size was 187,657 bytes, about 9% of the cap. | Legitimate source growth could cause `unavailable`; the cap must not be raised silently. |
| A 24-hour traceability freshness window is useful for the pilot. | REASONABLE | Team decision for an experimental operational view, not a Drupal or ACR requirement. | A reviewer may read the label as a guarantee of current remediation state; the UI must show the timestamp and policy. |
| The API can be used without authentication and with normal TLS verification. | VERIFIED | Phase 0 requests succeeded without credentials and with standard certificate verification. | Any required authentication or TLS bypass stops the pilot. |
| Creator credit is available in the collection response. | FRAGILE | Required by the attribution policy but not yet profiled across all selected records. | Missing credit stops candidate creation until a human approves a collective-credit method. |
| A page-level representation hash plus each record's page reference preserves source provenance without 25 extra entity requests. | REASONABLE | The collector hashes the exact content-decoded representation bytes exposed by the HTTP client before text decoding; per-record projections are independently canonicalized and hashed. | Reviewers could mistake the page hash for compressed wire bytes or an exact byte slice of one record. Field names must say `source_page_representation_sha256`, never `record_raw_sha256`, and receipts must preserve the encoding-domain distinction. |

### Adversarial falsification pass

- Reordered object keys do not falsify canonical stability; the hashes remain
  equal.
- Reordered issue records do falsify ordered membership and must change the
  manifest hash or fail descending-order validation.
- A short page with `next` falsifies completeness even if every record validates.
- A `403`, `429`, parsing error, or TLS error falsifies current availability but
  does not falsify a retained historical snapshot.
- A closed issue does not falsify or prove any accessibility outcome because no
  outcome exists in this collector's schema.
- If source profiling disproves creator availability or field shape assumptions,
  implementation pauses for a charter/schema amendment; it does not add guessed
  defaults.

## Unit Convention Registry

| Field | Unit | Canonical form | Conversion point |
|---|---|---|---|
| `issue_id_source` | identifier string | Decimal ASCII string | Never converted for storage. |
| `issue_id_numeric` | integer identifier | Safe non-negative integer | Parsed once for ordering after safe-integer validation. |
| `page_index` | zero-based page | Integer; pilot requires `0` | Parsed from the requested URL. |
| `max_records`, `record_count` | records | Non-negative integer | No conversion. |
| `response_status` | HTTP status code | Integer 100–599 | From transport response. |
| `representation_bytes`, `max_response_bytes` | content-decoded representation bytes | Non-negative integer bytes | Count the exact `Uint8Array` exposed by the HTTP client after HTTP content decoding; never KB/MB internally. |
| `declared_content_length_bytes` | encoded HTTP message-body bytes | Non-negative integer or absent | Parse one valid `Content-Length`; record only and never reconcile against `representation_bytes`. |
| `attempt_count`, `max_attempts` | attempts | Positive integer | Increment before each request. |
| `redirect_count`, `max_redirects` | redirects | Non-negative integer | Increment only after an allowed manual redirect. |
| `request_timeout_ms` | milliseconds | Integer | Passed to an injected abort timer. |
| `retry_after_ms` | milliseconds | Integer or absent | Convert delta-seconds × 1000 or HTTP-date minus injected clock. |
| `base_backoff_ms`, `max_backoff_ms`, `max_jitter_ms`, `retry_delay_ms` | milliseconds | Integer | Calculated before waiting; receipt records exact value. |
| `freshness_window_ms`, `minimum_live_run_interval_ms` | milliseconds | Integer | Added to UTC epoch milliseconds. |
| `fetched_at`, `fresh_until`, source timestamps | UTC instant | RFC 3339 string with `Z` | Parse to epoch milliseconds only for comparison, serialize to UTC. |
| `representation_cleanup_deadline_ms` | milliseconds since temporary-file creation | Integer ≤ 3,600,000 | Calculated by the storage controller; this body remains governed by the charter's raw-response retention policy. |
| SHA-256 values | 256 bits | 64 lowercase hexadecimal characters | Hash exact bytes; never reinterpret as a number. |
| `snapshot_id_suffix` | 64 bits displayed | First 16 hex characters of full manifest hash | Display/filename only; full 256-bit hash remains authoritative. |
| coverage thresholds | percent | Integer percent | Test command only: 80 line, branch, and function coverage. |

No money, percentages, means, scores, or statistical aggregations are produced.

## Formula Specifications

### Formula 1: Exact response-representation hash

**Rule:** Workflow plan observation protocol and Node `crypto.createHash('sha256')`.

**Formula:**

`page_representation_sha256 = hex(SHA-256(content_decoded_representation_bytes))`

**Domain:** The exact byte sequence exposed by the Fetch-compatible HTTP client
after HTTP content decoding and before UTF-8 decoding or JSON parsing, bounded to
`0..2,097,152` bytes. This is not a hash of compressed wire bytes. Receipts record
`Content-Encoding`, `Transfer-Encoding`, declared `Content-Length`, and actual
`representation_bytes` separately. Because `Content-Length` describes a different
byte domain when content coding is used, it is never compared with the decoded
representation length. A representation exceeding the cap aborts during streaming
and produces no trusted hash or candidate.

| Test case | Input | Expected output | Type |
|---|---|---|---|
| Standard SHA vector | UTF-8 bytes for `abc` | `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad` | Normal |
| Empty bytes | Zero bytes | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | Boundary |
| Oversized body | 2,097,153 bytes | `unavailable`; no candidate hash accepted | Edge |

### Formula 2: Canonical projection hash

**Rule:** RFC 8785 JCS, preceded by recursive Unicode NFC normalization. Arrays
preserve source order except `tag_ids`, which the projection schema declares a set
and sorts numerically as decimal strings.

**Formula:**

`canonical_sha256 = hex(SHA-256(UTF8(JCS(NFC(projection)))))`

**Domain:** I-JSON values only. `NaN`, infinity, duplicate semantic keys, invalid
Unicode, unsupported values, or schema-invalid projections fail without a hash.

| Test case | Input | Expected output | Type |
|---|---|---|---|
| Reordered/NFC object | `{ "b": 1, "a": "e\u0301" }` | Canonical text `{"a":"é","b":1}`; 16 UTF-8 bytes; SHA-256 `aa58fba8483623bed37c1b02edfccbdd9a53123837c20bfa4cb4049993a2872e` | Normal |
| Empty object | `{}` | Canonical text `{}`; SHA-256 `44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a` | Boundary |
| Non-I-JSON number | `{ "value": NaN }` | Validation/canonicalization error; no hash | Edge |
| Evidence change | Same object with `b: 2` | Hash differs from the normal case | Negative control |

### Formula 3: Freshness classification

**Rule:** Pilot team decision on 2026-08-18. This label governs traceability only.

**Formula:**

`freshness = unavailable and fresh_until = null when observation_state != retrieved`

Otherwise, `fresh_until_ms = fetched_at_ms + freshness_window_ms`

`freshness = fresh if now_ms < fresh_until_ms; otherwise stale`

**Domain:** A `retrieved` observation, valid UTC instants, and a non-negative
integer window. Equality is stale. Every other observation state fails closed to
unavailable freshness even when an attempt timestamp is valid.

| Test case | Inputs | Expected output | Type |
|---|---|---|---|
| Within window | fetched `2026-08-18T13:09:16Z`, window 86,400,000 ms, now `2026-08-19T13:09:15Z` | `fresh`; `fresh_until=2026-08-19T13:09:16Z` | Normal |
| Exact boundary | Same fetched/window, now `2026-08-19T13:09:16Z` | `stale` | Boundary |
| Unavailable with valid time | state `unavailable`, valid attempt time | `unavailable`; `fresh_until=null` | Edge |
| Invalid retrieval time | state `retrieved`, fetched time cannot be parsed | Run becomes `unavailable`; `fresh_until=null` | Edge |

### Formula 4: Retry delay

**Rule:** Respect valid `Retry-After`; otherwise bounded exponential backoff with
injected jitter. At most three total attempts. A requested wait over 30 seconds is
recorded but not slept; the run ends `unavailable` for human retry later.

**Formula:**

`exponential_ms = base_backoff_ms × 2^(attempt_count - 1)`

`retry_delay_ms = max(exponential_ms, retry_after_ms)` when exactly one valid
header value is present and no greater than `max_backoff_ms`

`retry_delay_ms = min(max_backoff_ms, exponential_ms + floor(random_0_to_1 × (max_jitter_ms + 1)))`
when the header is absent, malformed, or multiple

When a valid `retry_after_ms > max_backoff_ms`, no retry delay is scheduled: the
value is recorded and the run terminates `unavailable`.

**Domain:** `attempt_count >= 1`; injected random value is `0 <= r < 1`. A valid
header is exactly one non-negative decimal delta-seconds value or one parseable
HTTP-date. A past HTTP-date parses to `0`, but the actual retry delay is at least
the calculated exponential backoff. Multiple or malformed values are invalid,
record a parse error, and use exponential backoff with jitter. A valid header over
30 seconds is recorded but not slept. The final allowed attempt records
`retry_delay_ms: null`, performs no delay calculation or sleep, and terminates with
the attempt-limit reason; no fourth request exists.

The parser first matches the complete header against decimal delta-seconds, then
against one strict IMF-fixdate value. It never splits blindly on commas because a
valid HTTP-date itself contains a comma. A combined or otherwise non-matching
value is invalid.

| Test case | Inputs | Expected output | Type |
|---|---|---|---|
| First retry | attempt 1, no header, `r=0`, base 1000 | 1000 ms | Normal |
| Second retry max jitter | attempt 2, no header, `r` chosen so floor term is 250 | 2250 ms | Boundary |
| Header wins | attempt 1, `Retry-After: 5` | 5000 ms | Normal |
| Past HTTP-date | attempt 1, date before injected clock | Parsed as 0; actual delay 1000 ms | Edge |
| Multiple or malformed values | attempt 1, invalid header | Record parse error; use exponential plus jitter | Edge |
| Jitter clamp | exponential 30,000 ms and jitter 250 ms | 30,000 ms | Boundary |
| Excessive header | `Retry-After: 120` | record 120,000 ms; do not sleep; terminate `unavailable` | Edge |
| Final attempt | attempt 3, retryable response | `retry_delay_ms: null`; no sleep and no fourth request | Boundary |

### Formula 5: Selection completeness

**Rule:** Phase 0 charter termination rule.

**Formula:**

`complete = transport_ok ∧ schema_ok ∧ filters_ok ∧ unique_ids ∧ descending_ids ∧ pagination_ok`

where:

- `pagination_ok = (next_present ∧ record_count = 25) ∨`
  `(¬next_present ∧ record_count <= 25 ∧ self = first = last = page_0)`; and
- `filters_ok` means every record matches project `3060`, version `11.x-dev`, and
  tag `1101`.

**Domain:** One exact page 0 response. The server `next` URL is retained and never
followed by the production collector.

| Test case | Inputs | Expected output | Type |
|---|---|---|---|
| Full selected page | 25 valid unique descending IDs; `next` present | `complete` | Normal |
| Empty final universe | 0 records; no `next`; `self=first=last=page0` | `complete` candidate with zero records | Boundary |
| Short non-final page | 24 valid records; `next` present | `unavailable` | Edge |
| Duplicate ID | 25 records with one duplicate | `unavailable` | Edge |
| Wrong order | 25 unique records with one ascending pair | `unavailable` | Edge |

### Formula 6: Selection receipt hash

**Rule:** The receipt hash covers the deterministic evidence contract and excludes
self-reference, local implementation details, and prose rendering.

**Formula:**

`selection_receipt_hash_payload = {schema_version, config_digest, requested_url, final_url, user_agent, fetched_at, observation_state, http:{status, content_encoding, transfer_encoding, declared_content_length_bytes, representation_bytes}, attempts:[{attempt, started_at, response_status, retry_after_value, retry_after_parse_state, retry_after_ms, retry_delay_ms}], pagination:{self, first, last, next}, ordered_ids, page_representation_sha256, termination_reason}`

`selection_receipt_sha256 = hex(SHA-256(UTF8(JCS(NFC(selection_receipt_hash_payload)))))`

The payload excludes `selection_receipt_sha256`, filesystem and temporary paths,
deletion receipts, rendered prose, wall-clock durations, and other nondeterministic
implementation details. Nullable fields are explicit JSON `null`; they are not
silently omitted.

**Domain:** One schema-valid receipt payload. Attempt entries remain chronological;
ordered IDs remain in validated selection order. NFC is recursive and JCS applies
to the complete payload. An `unavailable` receipt remains hashable by using the
schema's explicit `null` values and empty arrays; required keys are never omitted.

**Known vector:** The fixture payload is:

```json
{"schema_version":"1.0.0","config_digest":"cfg","requested_url":"https://example.test/page=0","final_url":"https://example.test/page=0","user_agent":"test-agent","fetched_at":"2026-08-18T13:09:16Z","observation_state":"retrieved","http":{"status":200,"content_encoding":null,"transfer_encoding":"chunked","declared_content_length_bytes":null,"representation_bytes":3},"attempts":[{"attempt":1,"started_at":"2026-08-18T13:09:15Z","response_status":200,"retry_after_value":null,"retry_after_parse_state":"absent","retry_after_ms":null,"retry_delay_ms":null}],"pagination":{"self":"p0","first":"p0","last":"p0","next":null},"ordered_ids":["1"],"page_representation_sha256":"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad","termination_reason":"complete"}
```

Its JCS serialization is 769 UTF-8 bytes with SHA-256
`dcd77e3d7d9aea0bb0549e1fdaeb26daaed19f6288bc2b2652dd774ff8f5a188`.

| Test case | Input | Expected output | Type |
|---|---|---|---|
| Known vector | Fixture payload above | Pinned 769 canonical bytes and SHA-256 above | Normal |
| Repeated same input | Same payload twice, including explicit nulls | Byte-identical canonical payload and hash | Boundary |
| Changed page evidence | Only `page_representation_sha256` changes | Receipt hash changes | Negative control |
| Unavailable shape | Required fields present with permitted nulls and empty ordered IDs | Stable, hashable failure receipt | Edge |
| Missing required shape | Required attempt or HTTP field omitted | Schema failure; no receipt hash | Edge |

### Formula 7: Candidate manifest hash and snapshot ID

**Rule:** Workflow plan immutable snapshot requirement. The hash payload excludes
the snapshot ID and output path to avoid circularity.

**Formula:**

`manifest_hash_payload = {schema_version, config_digest, selection_receipt_sha256, ordered_records:[{issue_id, canonical_sha256}]}`

`manifest_sha256 = hex(SHA-256(UTF8(JCS(manifest_hash_payload))))`

`snapshot_id = "drupal11-issue-snapshot-" + first16(manifest_sha256)`

**Domain:** A complete selection only. Record tuples remain in validated selection
order. The full hash, not the 16-character suffix, is authoritative.

| Test case | Input | Expected output | Type |
|---|---|---|---|
| One-record vector | Canonical payload `{"config_digest":"cfg","ordered_records":[{"canonical_sha256":"aaa","issue_id":1}],"schema_version":"1.0.0","selection_receipt_sha256":"receipt"}` | Hash `1795350dd3a6f00a164fc5659d9618aaeaa4a9bf45609387e1b6af5c0978bc6b`; ID `drupal11-issue-snapshot-1795350dd3a6f00a` | Normal |
| Repeated same input | Same payload twice | Byte-identical canonical payload, hash, and ID | Boundary |
| Reordered membership | Same two records in opposite order | Different hash; if order is not descending, candidate fails before hashing | Edge |
| Incomplete selection | Any `unavailable` receipt | No manifest or snapshot ID promoted | Edge |
| Receipt sensitivity | Same membership but changed `selection_receipt_sha256` | Different manifest hash and snapshot ID | Negative control |

## Fallback and Default Strategy

| Data access point | Missing/failure condition | Strategy | Rationale | Risk |
|---|---|---|---|---|
| Pilot config | Missing key, wrong URL, or unknown key | Surface schema error and exit non-zero | Defaults could change the selected universe. | No candidate is produced. |
| Prior run metadata | Missing | Allow first candidate build; record `prior_snapshot_id: null` | Absence is legitimate on first run. | Must not be described as a change or deletion. |
| Live-run interval receipt | Last network-run start is <1 hour old, whether that run succeeded or failed | Refuse every network request and report the next eligible time; retries within the already-started run are exempt | A durable run-start receipt is written before the first request, so failed runs cannot bypass respectful spacing. | Clock errors could delay a run; injected UTC clock is recorded. |
| DNS/TLS/connection/timeout | Any failure | `unavailable`; no stale-as-current fallback | Source state is unknown. | Reviewer must retry later. |
| HTTP 401/403 | Permission response | `unavailable` | Permission is not deletion. | Could conceal a server policy change, which requires human review. |
| HTTP 429/5xx | Retry budget exhausted, malformed/multiple `Retry-After`, or valid delay over 30 seconds | Use the exact bounded Formula 4 behavior; end `unavailable` after the final attempt or excessive valid delay and retain parse results/delays | Avoids abusive, immediate, fourth-attempt, or long-blocking retries. | No current snapshot. |
| Selection endpoint 404/410 | Query endpoint missing | `unavailable`, not `resource_gone` | The selection endpoint is not an individual issue identity. | Endpoint migration needs a chartered config change. |
| Future canonical issue observation 404/410 | Confirmed after allowed redirects | `resource_gone` observation | Only individual canonical resources can be tombstoned. | Not exercised by the initial live collector; classifier is fixture-tested. |
| Redirect | Missing/invalid location or host outside allowlist | `unavailable` | Prevents source spoofing and credential leakage. | Legitimate migrations need an allowlist amendment. |
| Response body | Missing, oversized, invalid UTF-8, invalid JSON | `unavailable`; guaranteed temporary cleanup | Partial or malformed data cannot be current evidence. | Failure receipt contains no body. |
| Required page/list field | Missing or wrong type | `unavailable` | Schema drift must surface. | Human must inspect safe error paths. |
| Optional projected source field | Missing | Preserve explicit `null` only when schema permits; otherwise stop | Empty strings/defaults could invent data. | Schema amendment may be required. |
| Creator credit | Missing/unusable | Stop candidate creation pending approved collective attribution | License requirement cannot be guessed. | Phase 1 may remain fixture-only. |
| `next` | Present | Retain URL but do not follow | The charter selects page 0 only. | Universe remains intentionally incomplete beyond the top 25. |
| Deletion receipt write | Failure | Mark run failed; startup sweep retries cleanup and records recovery | Raw-byte custody is part of validity. | No candidate is promotable without deletion evidence. |
| Human-readable provenance rendering | Failure | Keep structured candidate local but mark review view unavailable; no promotion | Reviewability is required. | Does not change structured hashes. |

No missing value defaults to zero, empty string, current time, a prior status, or
the last known value.

## Data Provenance Map

```text
Exact chartered page-0 URL + validated config
    -> minimum-interval check against last durable network-run start
    -> persist this network-run start before the first request
    -> single-worker HTTPS request with exact User-Agent
       (normal TLS, manual redirects, decoded-representation byte cap)
    -> ephemeral content-decoded response-representation file
         -> SHA-256 over exact representation bytes
         -> strict UTF-8 decode and JSON parse
         -> page schema validation
         -> allowlisted record projection (excluded fields discarded)
         -> NFC normalization + declared tag-set ordering
         -> RFC 8785 canonical record bytes
         -> record SHA-256
    -> selection invariants (filters, uniqueness, descending order, pagination)
    -> receipt canonicalization + SHA-256
    -> manifest hash payload in ordered membership
    -> candidate manifest SHA-256 + snapshot ID
    -> structured bundle + Markdown provenance view in unique staging directory
    -> representation-file deletion + deletion receipt
    -> atomically rename complete staging directory to `<snapshot_id>`
    -> human review gate
    -> optional later manual promotion to versioned `snapshots/` (not automated)
```

Meaning-changing transformations are limited to the explicit allowlist, NFC
normalization, declared set ordering for tag IDs, UTC timestamp serialization, and
JCS object ordering. Issue order is never normalized because order is part of the
selection rule.

### Response-representation provenance clarification

The exact content-decoded selection representation receives one page-level
`page_representation_sha256`. Each record stores
`source_page_representation_sha256` and its own `canonical_sha256`. The receipt
also preserves `Content-Encoding`, `Transfer-Encoding`, declared `Content-Length`,
and decoded `representation_bytes`; it never claims these are one byte domain. The
design does not claim compressed wire-byte custody or that a parsed record has an
independently received byte stream, and it avoids 25 extra entity requests that
would increase traffic and expose excluded fields again.

## Candidate bundle contract

The collector writes only beneath a caller-supplied, repository-local candidate
root that resolves inside `var/candidates/`. It rejects symlinks and path traversal.
The traffic guard uses the fixed repository-local state file
`var/state/drupal11-network-run.json` plus an exclusive lock; changing the
candidate root cannot bypass it. A stale or ambiguous lock fails closed for human
review rather than being deleted automatically.

```text
var/candidates/.staging/<run_id>/
  # same complete layout while being assembled

var/candidates/<snapshot_id>/
  manifest.json
  receipt.json
  deletion-receipt.json
  provenance.md
  records/<issue_id>.json
```

The collector writes every artifact to one newly created staging directory. It
deletes the response representation and writes the deletion receipt before
finalization. Only a complete, schema-valid bundle with verified deletion evidence
may be atomically renamed to the final `<snapshot_id>` path. A crash before rename
leaves a non-candidate staging directory for recovery; it never creates or mutates
a final-named candidate. If the final path exists, the collector verifies the full
manifest hash. An identical bundle discards staging and reports the existing
candidate; a differing full hash writes collision evidence outside the final path
and fails. In both cases the existing candidate remains byte-identical. The
collector never overwrites or adds a deletion receipt after finalization.

`var/` is gitignored. The first implementation contains no promotion command.
After human review, a later separately approved step may copy a candidate into
`snapshots/<snapshot_id>/`; it must not rewrite an existing path.

## Validation and Reconciliation Checkpoints

| Check | Location | Expected | Fail when |
|---|---|---|---|
| Config digest | Startup | Matches JCS hash of reviewed config | Config schema, URL, or digest differs. |
| Host and TLS | Before/during request | `https`, allowed host, default verification | Any insecure option, cross-host redirect, or certificate failure. |
| Byte count | Transport stream | `representation_bytes` is `0..2,097,152`; declared encoded length is recorded separately | Decoded representation cap exceeded, or either field is malformed; the two byte domains are never compared. |
| HTTP classification | Transport | Exactly one normative observation class | Status maps ambiguously or permission maps to deletion. |
| Page schema | Parse boundary | Valid 2020-12 schema | Missing/invalid required values. |
| Projection allowlist | Per record | No excluded body/comment/profile/attachment fields | An unknown field enters output. |
| Record count | Selection | `0..25`, and exactly 25 when `next` exists | More than 25 or short-with-next. |
| Membership | Selection | Unique, numeric-safe, descending IDs | Duplicate, unsafe, or out-of-order ID. |
| Filter reconciliation | Per record | Project 3060, version 11.x-dev, tag 1101 | Any mismatch. |
| Hash repeatability | Unit/integration | Same fixtures produce byte-identical hashes | Reordering object keys changes hash. |
| Evidence sensitivity | Unit/integration | Evidence-bearing value change changes record, receipt where applicable, and manifest hash | Changed page or projected value leaves the relevant downstream hash unchanged. |
| Response cleanup | Every exit path | Temporary representation file absent; deletion receipt present | Success, error, cancellation, or recovery leaves unapproved source-response bytes. |
| Evaluation isolation | End-to-end negative fixture | Fixed evaluation/outcome/term fixture remains byte-identical across `429`, stale, or changed issue snapshots | Collector imports or changes evaluation data. |
| Candidate immutability | Storage | Complete staging bundle is atomically renamed once; existing final directory unchanged | A partial final path exists, a receipt is added after finalization, or an existing snapshot path would be overwritten. |

Monitoring is receipt-based rather than a service dashboard. A live attempt records
time, status class, attempts, delays, response bytes, record count, and termination
reason. No telemetry sends issue content to another system.

## Precision and Rounding

- Counts, IDs, bytes, attempts, redirects, and milliseconds use integers.
- HTTP-date conversion truncates no source precision beyond JavaScript epoch
  milliseconds; serialized output is UTC RFC 3339.
- Jitter uses `floor` exactly once after multiplication.
- No intermediate time or delay is rounded to seconds.
- Hashes operate on exact bytes and are displayed as lowercase hexadecimal.
- Snapshot IDs truncate only the displayed suffix; collision checks compare the
  full 256-bit hash and fail if a directory suffix exists with a different hash.
- No floating-point source value is retained unless the schema expressly permits
  it; non-finite values are always rejected.

## Statistical Methodology

Not applicable. The top-25 set is a mechanically selected pilot sample, not a
statistical sample and not evidence from which population estimates may be made.
The collector calculates no confidence interval, rate, score, mean, trend, or
conformance statistic.

## Implementation Tasks

### Task 1: Establish the repository, configuration, and schemas

**Files:**

- Create: `.nvmrc`, `package.json`, `package-lock.json`, `tsconfig.json`,
  `LICENSE-CODE.txt`, `.gitignore`
- Create: `config/pilot.drupal11.json`
- Create: `schemas/config.schema.json`, `schemas/drupal-page.schema.json`,
  `schemas/record.schema.json`, `schemas/receipt.schema.json`,
  `schemas/manifest.schema.json`, `schemas/deletion-receipt.schema.json`,
  `schemas/network-run-start.schema.json`
- Create: `src/validation/ajv.ts`, `src/domain/types.ts`
- Test: `test/config.test.ts`, `test/schema.test.ts`

**TDD sequence:** Write invalid-config and schema-drift tests first; confirm they
fail because validators do not exist; implement strict Ajv 2020-12 validation;
then cover missing, extra, null, unsafe-integer, and excluded-field cases.

**Fixture-only boundary:** Task 1 uses reviewed synthetic fixtures only. It makes
no Drupal.org request and creates no source-response custody. Source profiling is
not an implementation prerequisite and is deferred to Task 8 after every live-run
gate and the separate live-action authorization are complete.

### Task 2: Implement canonicalization and hash formulas

🔍 **Data-critic checkpoint 1: formula correctness and canonical-byte contract.**

**Files:**

- Create: `src/integrity/normalize.ts`, `src/integrity/canonicalize.ts`,
  `src/integrity/hash.ts`
- Test: `test/integrity/canonicalize.test.ts`, `test/integrity/hash.test.ts`
- Fixtures: `test/fixtures/canonicalization/*.json`

Implement Formula 1 and Formula 2 from the exact vectors above. Add RFC 8785
reference vectors, decomposed/composed Unicode, nested key reordering, array-order
preservation, tag-set ordering, invalid numbers, and evidence-change controls.

### Task 3: Implement allowlisted projection and selection validation

**Files:**

- Create: `src/source/project-record.ts`, `src/selection/validate-selection.ts`
- Test: `test/source/project-record.test.ts`,
  `test/selection/validate-selection.test.ts`
- Fixtures: synthetic valid, wrong-project, wrong-version, missing-tag,
  duplicate-ID, wrong-order, empty-final, and short-with-next pages

Write Formula 5 tests first. Projection must construct a new immutable object from
the allowlist; it must never delete forbidden fields from a mutable source object
and then reuse that object.

### Task 4: Implement transport, retry classification, and response cleanup

🔍 **Data-critic checkpoint 2: fallback semantics, time units, retry math, and
source-response custody.**

**Files:**

- Create: `src/transport/fetch-page.ts`, `src/transport/retry.ts`,
  `src/transport/classify.ts`, `src/storage/response-representation.ts`,
  `src/storage/recovery-sweep.ts`, `src/storage/network-run-start.ts`
- Test: `test/transport/*.test.ts`, `test/storage/*.test.ts`
- Fixtures: `401`, `403`, `404`, `410`, `429` with valid, absent, past-date,
  malformed, multiple, and excessive `Retry-After`; `5xx`; identity, compressed,
  chunked, and absent-`Content-Length` bodies; timeout; DNS/TLS surrogate errors;
  malformed JSON; oversized decoded representation; allowed and rejected
  redirects; cancellation; exception; and crash-remnant recovery

Write Formula 4 tests first. Inject fetch, clock, timer, random source, and
temporary-root interfaces. Never alter global TLS environment variables. Verify
cleanup on success, parse failure, validation failure, timeout, abort signal,
exception, and startup recovery. Persist a durable network-run start before the
first request; a failed run blocks another network run for one hour, while retries
inside that started run remain allowed. The check-and-persist operation uses an
exclusive repository-local lock and atomic replacement; lock or persistence
failure stops before network access. Test concurrent admission, failed-run spacing, past dates,
malformed/multiple headers, jitter clamping,
final-attempt no-sleep/no-fourth-request,
the exact configured User-Agent on every attempt, encoding headers, and the rule
that decoded representation length is never reconciled with encoded
`Content-Length`.

### Task 5: Build receipts, freshness, manifests, and immutable candidate storage

🔍 **Data-critic checkpoint 3: ordered membership, content addressing,
reconciliation, and immutability.**

**Files:**

- Create: `src/receipt/build-receipt.ts`, `src/freshness/classify.ts`,
  `src/manifest/build-manifest.ts`, `src/storage/write-candidate.ts`
- Test: `test/receipt/*.test.ts`, `test/freshness/*.test.ts`,
  `test/manifest/*.test.ts`, `test/storage/write-candidate.test.ts`

Implement Formula 3, Formula 6, and Formula 7 from the exact vectors above. Tests
must prove that changing page-representation evidence changes the receipt hash and
therefore the manifest hash even when ordered membership is unchanged. A receipt
for an unavailable run may be written outside a snapshot directory, but it must
never be called a complete snapshot. Existing candidate directories are read-only.
Interruption tests must prove that a crash before atomic rename leaves only a
recoverable staging directory, never a final candidate; collision tests must prove
that an existing final directory is byte-identical after the run.

### Task 6: Add CLI orchestration and human-readable provenance

**Files:**

- Create: `src/cli.ts`, `src/collect.ts`, `src/render/provenance-markdown.ts`
- Test: `test/cli.test.ts`, `test/collect.integration.test.ts`,
  `test/render/provenance-markdown.test.ts`

The CLI accepts only a reviewed config path and candidate-root path. It has no
arbitrary URL option and no publishing option. The provenance view presents:
snapshot state, requested URL, fetched time, freshness policy, ordered issue links,
hashes, exact User-Agent, content/transfer encodings, declared encoded length,
decoded representation length, excluded-data statement, server `next` link, and
explicit “not an evaluation or ACR” language.

### Task 7: Add end-to-end negative controls and CI

🔍 **Data-critic checkpoint 4: end-to-end provenance, error isolation, units, and
claim boundaries.**

**Files:**

- Create: `.github/workflows/check.yml`
- Create: `test/fixtures/evaluation-invariance/` with a fixed synthetic evaluation
  outcome map and ACR-term map that the collector treats as opaque bytes only
- Test: `test/end-to-end.test.ts`, `test/evaluation-invariance.test.ts`

Required commands:

```text
npm ci
npm run typecheck
npm test
npm run test:coverage
```

Coverage must be at least 80% for lines, branches, and functions. CI contains no
live Drupal.org request and no credentials. Negative tests prove that `429`, stale,
unavailable, changed issue status, and issue closure cannot modify the fixed
evaluation/outcome/term bytes.

### Task 8: Final review and live-run readiness gate

🔍 **Final data-critic review:** Complete numerical, schema, fallback, provenance,
and failure-state review.

🔍 **Accessibility scope critic:** Confirm that no issue field or collector state
can become an accessibility outcome or ACR term and that the Markdown provenance
view communicates timestamps, observation state, fresh/stale/unavailable status,
and negative space.

Before any live request, source profiling, or snapshot promotion, complete the
raw-response retention record with a named collector, repository maintainer,
evidence reviewer, and custodian. The human must also review the exact config
digest, temporary storage behavior, deletion test receipt, and exact User-Agent
contact. Record a separate live-action authorization after those gates pass. Only
then may one approved response be profiled into aggregate field names, types, and
null counts after the one-hour traffic check. The profiler deletes the
representation body under the reviewed retention policy and stops on unexplained
shapes. A profiling response is never promoted as a candidate. If profiling
requires a schema or projection change, return to Task 1 and repeat the affected
tests and critic checkpoints. Any later collection is a distinct, separately
authorized network run after the traffic interval. Neither profiling nor a live
run is part of implementation completion.

## Review Checkpoint Plan

| Checkpoint | After task | Reviewer focus |
|---|---|---|
| 🔍 1 | Task 2 | RFC 8785/NFC ordering, exact bytes, known SHA vectors, unsafe values |
| 🔍 2 | Task 4 | Backoff units, `Retry-After`, no masked fallback, TLS/redirect controls, cleanup paths |
| 🔍 3 | Task 5 | Ordered membership, hash payload boundaries, freshness semantics, immutable storage |
| 🔍 4 | Task 7 | End-to-end failure isolation, no averaging/scoring, evaluation-byte invariance |
| 🔍 Final | Task 8 | Full data contract and claim-boundary review before live-run authorization |

## Failure Modes

- API schema drift produces `unavailable`, never a partial snapshot.
- Short-with-next, duplicates, unsafe IDs, wrong filters, or order changes fail the
  completeness gate.
- Permission, rate limiting, server, TLS, DNS, transport, parse, and validation
  failures never become `resource_gone`.
- Selection-endpoint `404`/`410` is unavailable; only a future confirmed individual
  canonical issue observation may be `resource_gone`.
- Raw cleanup failure invalidates the run and triggers startup recovery.
- Missing creator credit blocks candidate creation rather than fabricating
  attribution.
- A stale candidate remains historical and can never be relabeled current by
  reusing a timestamp.
- Any attempt to follow `next`, exceed 25 records, accept an arbitrary host,
  disable TLS, write to Drupal.org, commit automatically, or publish an ACR stops
  execution.

## What completion means

Phase 1 implementation is complete only when all fixture-based acceptance tests,
coverage gates, and critic checkpoints pass. Completion does not mean that a live
snapshot exists, that Mike Gifford accepted the pilot, that Drupal adopted it, that
an accessibility evaluation occurred, or that an ACR may be drafted or published.

## References

- [Phase 0 pilot charter](../pilot-charter.md)
- [Threat and provenance review](../threat-provenance-review.md)
- [Drupal.org API guidance](https://www.drupal.org/drupalorg/docs/apis/rest-and-other-apis)
- [RFC 8785 JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785.html)
- [Node.js release schedule](https://nodejs.org/en/about/previous-releases)
- [Node.js test runner](https://nodejs.org/download/release/v24.18.0/docs/api/test.html)
- [Ajv JSON Schema validator](https://ajv.js.org/)
- [Community-review pull request](https://github.com/mgifford/drupal-core/pull/57)
