# ADR-018: HTTP/API error contract

- **Status:** Closed / approved; amended 2026-09-14
- **Current authority:** [`V4_ARCHITECTURE.md`](../V4_ARCHITECTURE.md) §14

## Context

Clients need stable actionable failures without exposure of AWS internals, private records, authorization boundaries, or secrets.

## Decision

Application failures use correct HTTP status plus a small sanitized envelope with stable ShelfState code, safe message, optional correlation ID, and bounded field issues. User resources outside owner scope return the same 404 form as absent resources. Stale generation/revision or writer fence and incompatible state return 409-class errors. Reusing an idempotency key for a materially different request returns `IDEMPOTENCY_CONFLICT`; same request returns/resumes the original result.

## Rationale

Stable codes support safe clients while sanitization resists information disclosure and coupling to provider errors.

## Consequences

No stack traces, raw AWS exceptions, table keys, tokens, configuration, or private bodies in responses. Clients tolerate infrastructure-generated non-envelope errors by status.

## Deferred / reconsideration triggers

None; future codes must preserve compatibility or use the API-version policy.

## Amendments

The 2026-09-14 adjudication added explicit idempotency conflict/replay semantics.
