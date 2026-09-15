# ADR-001: Primary datastore and library concurrency

- **Status:** Closed / approved; amended 2026-09-14
- **Current authority:** [`V4_ARCHITECTURE.md`](../V4_ARCHITECTURE.md) §§11–12

## Context

V4 needs cloud-authoritative, owner-scoped Book and Bookshelf persistence with low idle cost, conditional concurrency, bounded full-library replacement, and a later path to multi-device evolution. A full library can exceed one DynamoDB transaction.

## Decision

Use DynamoDB Standard, On-Demand, with one user partition and generation-prefixed Book/Shelf items. `Book.bookshelfId` is the only membership relation. CONTROL holds `activeGeneration`, monotonically increasing `libraryRevision`, and optional recoverable `activeOperation` writer-fence metadata.

Every ordinary mutation atomically checks expected generation, incompatible-fence absence, and expected entity revision where applicable, changes domain state, and increments library revision. Whole-generation work conditionally leases CONTROL, stages and validates a generation, and activates only while fence ownership and source generation/revision still match. Coherent whole reads double-read CONTROL around all generation pages.

Every active library has exactly one nondeletable explicit default shelf; shelf names are trimmed and case-insensitively unique. Shelf deletion reassigns Books before removal, in one in-place transaction when bounded or through generation activation otherwise.

## Rationale

DynamoDB meets the approved usage-driven cost and owner-partition access model. Generations avoid partial full-library replacement; revision plus fencing closes races between CRUD, rebuilds, and multi-page reads.

## Consequences

No item-level strongly consistent read is described as multi-item snapshot isolation. Dead leases require safe expiry/recovery. No GSI exists merely for shelf-name uniqueness. Prior generations remain briefly for rollback and are cleaned outside correctness logic.

## Deferred / reconsideration triggers

Reconsider a GSI or other datastore only for a demonstrated query/scale requirement. Streams, tombstones, and a sync engine remain deferred.

## Amendments

The 2026-09-14 adjudication added library-wide revision, recoverable writer fencing, double-CONTROL reads, and explicit shelf invariants.
