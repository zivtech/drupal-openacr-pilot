# Raw-Response Retention Record Template

> **Status:** Required before any live request, source profiling, or snapshot
> promotion. Fixture-only Phase 1 implementation creates no source-response
> custody. The default is guaranteed cleanup on success, failure, cancellation,
> and exception.

Complete one record for the approved collector environment. Do not place secrets,
credentials, raw response bodies, or private infrastructure details in the public
record.

## Custody

- Record ID:
- Collector version or commit:
- Named collector:
- Named custodian:
- Repository maintainer:
- Evidence reviewer:
- Authorized users:
- Approval date:

## Storage

- Storage class: ephemeral collector-local temporary storage
- Public-safe location identifier:
- Encryption-at-rest behavior:
- File-permission policy:
- Operating-system temporary-file behavior:
- Synchronization policy: must be disabled
- Backup policy: must be disabled
- Cache policy: must not retain raw bodies
- Log policy: must not contain raw bodies, cookies, tokens, or credentials

## Retention and deletion

- Default deletion event: guaranteed cleanup after representation hashing,
  projection, or any
  parsing/validation failure, cancellation, or exception
- Crash recovery: startup sweep deletes any unapproved raw file left by a prior run
- Deletion method:
- Maximum completion time: before normal process exit and no later than one hour
  after temporary-file creation
- Deletion verification method:
- Deletion receipt location:
- Deletion receipt fields: record ID, snapshot candidate ID, timestamp, method,
  custodian, result, and exception ID if applicable

## Optional debugging exception

Leave this section blank when no exception exists.

- Exception ID:
- Human approver:
- Specific debugging need:
- Fields and responses retained:
- Access list:
- Start timestamp:
- Mandatory deletion timestamp, no later than 30 days after retrieval:
- Backup and cache confirmation:
- Final deletion receipt:

An exception cannot place raw bytes in public Git history, expand the selected
fields, add comments, or change evaluation outcomes.

## Approval gate

- [ ] Collector, custodian, repository maintainer, evidence reviewer, and
      authorized users are named.
- [ ] Public-safe storage identifier is recorded.
- [ ] Backups, sync, caches, logs, and temporary files are addressed.
- [ ] Success, failure, cancellation, exception, and crash-recovery deletion paths
      are recorded.
- [ ] Deletion method, one-hour default deadline, and receipt location are recorded.
- [ ] Any exception has a named human approver and deadline of 30 days or less.
- [ ] The independent provenance reviewer accepted the record.
- [ ] The exact config digest, deletion test receipt, and Phase 1 User-Agent were
      reviewed.
- [ ] A separate authorization identifies the specific live request, profiling,
      or snapshot-promotion action.

Any unchecked item blocks live requests, source profiling, and snapshot promotion;
it does not block synthetic-fixture implementation.
