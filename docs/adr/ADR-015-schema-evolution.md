# ADR-015: Schema evolution and whole-library structural change

- **Status:** Closed / approved; amended 2026-09-14
- **Current authority:** [`V4_ARCHITECTURE.md`](../V4_ARCHITECTURE.md) §§11, 18.8

## Context

Persisted data will evolve, and some migrations or shelf operations affect more items than one DynamoDB transaction while concurrent clients may mutate the source.

## Decision

Use explicit server-controlled logical schema versions, prefer backward-compatible expand–migrate–contract changes, and use generation rebuilds for incompatible/whole-library changes. Every rebuild is an idempotent owned async operation that acquires a recoverable fence bound to operation/source generation/source library revision, stages and validates, and conditionally activates only if all bindings still match, advancing library revision.

Ordinary writes check expected generation plus entity revision and fence absence. Whole reads use the double-CONTROL protocol. Every activation enforces exactly one default shelf, canonical `Book.bookshelfId`, no reverse mirrors, valid relationships, and unique normalized shelf names. Oversized shelf deletion uses the same generation protocol.

## Rationale

Explicit versions and atomic generation switching prevent partial incompatible migration. Source binding prevents stale transformations from overwriting newer state.

## Consequences

Workers that lose a lease cannot activate, and expired leases are safely recoverable. Prior generation retention supports bounded rollback. Migration workload limits require real-stack benchmarks.

## Deferred / reconsideration triggers

If bounded Lambda cannot process approved maximum libraries with substantial margin, return to architecture review before selecting another execution platform.

## Amendments

The 2026-09-14 adjudication added library revision/fencing/double reads, async operations, idempotency, V3 compatibility, and shelf invariants.
