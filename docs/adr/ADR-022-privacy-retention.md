# ADR-022: Privacy, minimization, and retention

- **Status:** Closed / approved
- **Current authority:** [`V4_ARCHITECTURE.md`](../V4_ARCHITECTURE.md) §25

## Context

Libraries, notes, identity data, logs, transfers, sessions, and recovery copies have different purposes and retention needs.

## Decision

Collect/store only data needed for application, security, or operations. Classify data and apply purpose-specific retention: sessions/login/idempotency validity is server-enforced; temporary transfers expire around 24 hours; routine logs retain about 30 days production and 7–14 non-production; old generations retain around 24 hours; account deletion removes active state after grace while backups age out normally. Never log sensitive tokens, cookies, URLs, bodies, or routine private content.

## Rationale

Minimization reduces breach impact and clarifies lifecycle behavior without defeating recovery.

## Consequences

TTL is eventual cleanup, not authorization/correctness. Export and deletion remain ordinary-user capabilities. Public signup awaits privacy/legal readiness review.

## Deferred / reconsideration triggers

Longer audit retention requires a specific justified need. Public legal/privacy posture is reviewed under ADR-023.

## Amendments

None.
