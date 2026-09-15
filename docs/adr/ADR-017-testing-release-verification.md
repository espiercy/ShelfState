# ADR-017: Testing and release verification

- **Status:** Closed / approved
- **Current authority:** [`V4_ARCHITECTURE.md`](../V4_ARCHITECTURE.md) §27

## Context

Security and data-integrity properties span client, Lambda, DynamoDB, Cognito, S3, CloudFront, and deployment behavior and cannot be established by unit tests alone.

## Decision

Use layered unit, contract, integration, and end-to-end tests. Exercise security/integrity-critical paths comprehensively, including sessions, ownership, revisions, generation fencing/activation, idempotency, imports/migrations, and lifecycle. Validate the OpenAPI contract and run focused production smoke tests after deliberate releases. Real AWS integration uses isolated synthetic non-production data.

## Rationale

Layered verification places fast checks near logic while retaining evidence for real managed-service behavior and release wiring.

## Consequences

Coverage is risk-based, not a universal percentage. Production data never enters tests. A failed smoke test means the release is not accepted.

## Deferred / reconsideration triggers

Add specialized performance/chaos tooling only where approved workload or reliability evidence requires it; required maximum-operation benchmarks are not deferred.

## Amendments

The 2026-09-14 review makes concurrency/idempotency/async state-machine and maximum-workload verification explicit.
