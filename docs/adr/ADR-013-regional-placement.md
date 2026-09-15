# ADR-013: Regional placement

- **Status:** Closed / approved
- **Current authority:** [`V4_ARCHITECTURE.md`](../V4_ARCHITECTURE.md) §17.1

## Context

ShelfState needs a simple initial regional topology compatible with the operator's location and global edge-service constraints.

## Decision

Place primary runtime and state in `us-west-2` for separate development and production resource sets. CloudFront and Route 53 remain global; the CloudFront ACM certificate resides in `us-east-1`.

## Rationale

A single primary region satisfies current availability, latency, cost, and operational requirements without active-multi-region complexity.

## Consequences

No active multi-region DynamoDB replication. Service-specific global/edge placement is documented rather than treated as an exception discovered during delivery.

## Deferred / reconsideration triggers

Reconsider only if availability, latency, residency, or recovery requirements materially exceed the accepted posture.

## Amendments

None.
