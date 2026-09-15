# ADR-005: API and backend compute

- **Status:** Closed / approved; amended 2026-09-14
- **Current authority:** [`V4_ARCHITECTURE.md`](../V4_ARCHITECTURE.md) §13

## Context

V4 needs low-idle-cost HTTP compute, capability isolation, replay-safe mutation, and bounded handling for work that may outlive an API request.

## Decision

Use API Gateway HTTP API and Node.js/JavaScript Lambda functions divided into Auth/Session, Library API, Library Operations, Admin/Account, and Account Lifecycle capabilities. Ordinary CRUD is synchronous.

Duplicate-side-effect operations require a user/operation/key-scoped idempotency record with request fingerprint, result/status, and authoritative expiry. Long-running commands create an owned `QUEUED` Operation, directly invoke Library Operations asynchronously using only a bounded non-secret operation reference, return `202` plus status URL, and expose owned status polling. The worker is idempotent, bounded, and records terminal state. Configure an access-controlled, bounded-retention SQS on-failure destination; SQS is not the primary dispatcher.

## Rationale

HTTP API and Lambda meet the workload and cost posture. Explicit Operation resources avoid API Gateway timeout coupling while retaining a simpler design than Step Functions or a primary job queue.

## Consequences

Async Lambda can deliver duplicates, so worker transitions and side effects must be retry-safe. Maximum workloads are benchmarked in real non-production AWS; inadequate Lambda execution margin returns to architecture review.

## Deferred / reconsideration triggers

No Step Functions, ECS, App Runner, or primary SQS dispatcher unless measured workloads cannot meet approved bounds and a new ADR is approved.

## Amendments

The 2026-09-14 adjudication added generalized idempotency and the asynchronous Operation-resource architecture.
