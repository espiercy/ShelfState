# ADR-004: Authorization, ownership, and workload authority

- **Status:** Closed / approved; clarified 2026-09-14
- **Current authority:** [`V4_ARCHITECTURE.md`](../V4_ARCHITECTURE.md) §10

## Context

The hostile client model requires BOLA/BFLA prevention without introducing a policy engine disproportionate to USER/ADMIN roles.

## Decision

Centralize server-side authorization and construct every user-data access from the authenticated internal `userId`. USER and ADMIN are the only initial roles; ADMIN is functional authority and never general cross-user library-browsing authority. Out-of-owner-scope resources are indistinguishable from missing resources.

Server code enforces all shelf invariants. Lifecycle/recovery workloads may have narrowly scoped technical authority to execute an already-authorized, target-bound, status/version/due-checked workflow. Service authority is not human ownership.

## Rationale

Owner-scoped persistence makes isolation structural. The small role model does not justify Amazon Verified Permissions.

## Consequences

Handlers cannot trust owner IDs, roles, or domain invariants supplied by clients. Privileged actions and meaningful authorization failures are audited without logging routine private data.

## Deferred / reconsideration triggers

Reconsider a policy engine only if sharing, organizations, or materially richer ACLs become approved requirements.

## Amendments

The 2026-09-14 clarification separated ADMIN privilege from narrowly scoped lifecycle/recovery workload IAM authority and added explicit shelf invariants.
