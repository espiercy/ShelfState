# ADR-020: Browser session, login binding, CSRF, and fresh authentication

- **Status:** Closed / approved; amended 2026-09-14
- **Current authority:** [`V4_ARCHITECTURE.md`](../V4_ARCHITECTURE.md) §§9.3, 9.5–9.9 and TB-09

## Context

Cookie-authenticated browser sessions must resist fixation, callback/login replay, CSRF, theft impact, and stale privilege/account state.

## Decision

Use a random opaque Secure/HttpOnly host-only BFF cookie, initial SameSite=Lax, approximately seven-day idle and 30-day absolute bounds, session rotation at login/security transitions, and account `sessionVersion` revocation. State changes also require a session-bound anti-CSRF token in a custom header plus origin/method controls. Sensitive account/identity/admin operations require fresh authentication.

Each OAuth attempt uses the ADR-003 short-lived single-use transaction: unpredictable state, PKCE S256, nonce, and a transient Secure/HttpOnly browser-binding cookie. Callback validation is exact and consumption atomic. Cognito tokens and PKCE verifier remain outside browser JavaScript.

## Rationale

Session-bound layered controls address both ambient-cookie CSRF and OAuth callback substitution/replay while bounding stolen-session lifetime.

## Consequences

DynamoDB TTL never decides validity. Normal logout deletes the current session; global logout/disablement increments session version. CSP allows only required identity navigation/connect endpoints.

## Deferred / reconsideration triggers

Cookie attributes may change only if tested auth behavior requires it without weakening the control model.

## Amendments

The 2026-09-14 adjudication specified login-transaction creation, storage, binding, token checks, atomic consumption, and replay failure.
