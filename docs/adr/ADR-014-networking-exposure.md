# ADR-014: Networking and public exposure

- **Status:** Closed / approved
- **Current authority:** [`V4_ARCHITECTURE.md`](../V4_ARCHITECTURE.md) §17

## Context

The serverless workload has no private network dependency. A customer-managed VPC/NAT would add fixed cost and complexity without itself providing application authorization.

## Decision

Do not attach V4.0 Lambdas to a customer-managed VPC. CloudFront is the normal application entry; API Gateway's default endpoint may remain enabled, and the backend remains fully secure when reached directly. Do not issue browser DynamoDB/Lambda credentials or general S3 access. Only TB-10 presigned transfers are allowed.

## Rationale

Managed public service endpoints plus server-side authentication/authorization meet current controls with less cost and operational surface.

## Consequences

There is no NAT Gateway, private application subnet, or VPC endpoint architecture. CloudFront traversal is not an authorization boundary.

## Deferred / reconsideration triggers

Add private networking only for a concrete private dependency or egress-control requirement. Origin-bypass prevention is reconsidered if edge controls become security-critical.

## Amendments

None.
