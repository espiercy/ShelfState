# ADR-012: Invitations and account lifecycle

- **Status:** Closed / approved; clarified 2026-09-14
- **Current authority:** [`V4_ARCHITECTURE.md`](../V4_ARCHITECTURE.md) §19

## Context

V4 launches invite-only and needs reversible disablement plus safe delayed permanent deletion.

## Decision

Registration mode is server-authoritative and initially `INVITE_ONLY`. Invitations are expiring, revocable, single-use, audited, verified-email-conditioned, and idempotently created. Disablement preserves data, changes state, and increments session version.

Deletion requires fresh authentication or audited privileged action, immediately revokes access, enters versioned `PENDING_DELETION`, permits cancellation for about seven days, and uses one-time EventBridge Scheduler only as a trigger. The lifecycle worker rereads authoritative status, deletion request/version, and due time; targets only that user's resources; executes idempotently; and audits the result.

## Rationale

A grace period protects against accidental deletion while immediate revocation meets account-control needs. Authoritative worker checks make stale schedules harmless.

## Consequences

Old internal user IDs are retired forever after deletion. ADMIN may authorize lifecycle functions but cannot browse libraries; technical worker delete authority is narrow and not human ownership.

## Deferred / reconsideration triggers

Public registration remains behind ADR-023.

## Amendments

The 2026-09-14 clarification distinguished application ADMIN from workload IAM authority and specified target/status/version/due checks.
