# ADR-019: Validation and resource bounds

- **Status:** Closed / approved
- **Current authority:** [`V4_ARCHITECTURE.md`](../V4_ARCHITECTURE.md) §15

## Context

An authenticated client remains hostile, and unbounded bodies, collections, imports, or compute can cause corruption or cost exhaustion.

## Decision

Validate every request against an explicit server-side schema before domain/persistence work, rejecting unexpected properties by default. Enforce required/optional fields, strict types/enums, lengths/ranges, identifier syntax, shallow structure, supported media type, and bounds for every collection/body/issue list. Treat user text as plain text and render through safe text APIs.

## Rationale

Boundary validation and application-level limits make trust and cost controls explicit; AWS quotas are only outer guardrails.

## Consequences

Client validation is UX only. Imports receive complete bounded structural/domain validation before activation. Rich text is not supported.

## Deferred / reconsideration triggers

Rich text/Markdown requires a separate rendering and sanitization security design. Exact numerical limits are established and verified before production.

## Amendments

None.
