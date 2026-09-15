# ADR-023: Public-signup readiness gate

- **Status:** Closed / approved
- **Current authority:** [`V4_ARCHITECTURE.md`](../V4_ARCHITECTURE.md) §28

## Context

Invite-only controls and cost assumptions do not automatically suffice for anonymous public registration and recovery abuse.

## Decision

Launch invite-only. Public self-service registration remains off until an explicit review approves edge-abuse/WAF posture, Cognito threat-protection state, signup/recovery/verification abuse controls, public growth/cost model, email capacity/deliverability, privacy/legal readiness, monitoring, export/deletion verification, and incident readiness. Missing evidence keeps it disabled. Registration can be switched to CLOSED without disrupting existing-user sign-in.

## Rationale

Public registration changes threat, cost, legal, and operating assumptions and therefore requires evidence rather than a UI toggle.

## Consequences

The server, never the client, enforces registration mode. Cognito Plus protection begins in observation/audit mode as appropriate before enforcement.

## Deferred / reconsideration triggers

The full readiness checklist is the trigger. Public signup is not a V4.0 launch requirement.

## Amendments

None.
