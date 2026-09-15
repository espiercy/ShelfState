# ADR-003: Identity, authentication, and application sessions

- **Status:** Closed / approved; amended 2026-09-14
- **Current authority:** [`V4_ARCHITECTURE.md`](../V4_ARCHITECTURE.md) §9 and TB-09

## Context

V4 needs managed secure authentication, invite-only onboarding, revocable browser sessions, and ownership identity that survives a future identity-provider change.

## Decision

Use Cognito User Pools Plus and Managed Login with Authorization Code + PKCE. ShelfState owns an immutable internal `userId`; Cognito `sub` maps to it and email never authorizes automatic linking. The backend holds Cognito tokens and gives the browser only an opaque Secure/HttpOnly application session.

Each login uses a server-side roughly ten-minute, single-use transaction containing unpredictable state, PKCE verifier/S256 challenge, nonce, hashed transient browser binding, allowlisted return path, timestamps, and status. The callback validates transaction existence, expiry, unused state, browser binding, code exchange, issuer/client/lifetime, nonce, and redirect, then atomically consumes it. Tokens and verifier are not browser-accessible.

## Rationale

Managed identity protection reduces custom credential risk, while internal identity decouples data ownership. A BFF session and bound transaction keep OAuth/token material out of JavaScript and resist login CSRF/replay.

## Consequences

Session storage and identity mapping are authoritative backend state. TTL only cleans expired records. Future federation must explicitly and securely link identities.

## Deferred / reconsideration triggers

Federated providers are deferred until product demand justifies explicit linking design.

## Amendments

The 2026-09-14 adjudication made the login-transaction and TB-09 binding contract explicit.
