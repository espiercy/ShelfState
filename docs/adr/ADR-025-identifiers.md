# ADR-025: Resource identifiers

- **Status:** Closed / approved
- **Current authority:** [`V4_ARCHITECTURE.md`](../V4_ARCHITECTURE.md) §12

## Context

Book and Bookshelf identity must be stable, non-authoritative, owner-independent, compatible with imports, and suitable for a later offline path.

## Decision

IDs are opaque, immutable, non-semantic, globally unique values. New online V4 resources use backend-generated UUID v4 IDs. IDs encode no user, email, name, time/order, or privilege. Valid supported V3 IDs are preserved during migration even if later V4 creation rules are stricter. Knowing an ID conveys no authority.

## Rationale

Opaque immutable IDs prevent business meaning/authorization coupling, preserve historical identity, and allow future independent generation.

## Consequences

Ownership always comes from authenticated partition scope. Idempotent creates return the originally server-generated ID. Compatibility validation distinguishes legitimate historical identifiers from corrupt input.

## Deferred / reconsideration triggers

A future offline architecture may select a different globally unique generation mechanism only through compatibility-preserving review.

## Amendments

The 2026-09-14 migration clarification explicitly preserves valid historical V3 identifiers rather than applying stricter new-creation rules retroactively.
