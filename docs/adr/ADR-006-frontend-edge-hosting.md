# ADR-006: Frontend, edge hosting, and browser boundaries

- **Status:** Closed / approved; amended 2026-09-14
- **Current authority:** [`V4_ARCHITECTURE.md`](../V4_ARCHITECTURE.md) §§6, 16–17

## Context

V4 needs private static hosting, TLS, deliberate caching, safe PWA releases, and explicit browser flows without coupling to the frozen Netlify V3 application.

## Decision

Host V4 static assets in private S3 behind CloudFront OAC, Route 53, and ACM. CloudFront is the single V4 origin for ordinary static and `/api/*` traffic. TB-09 permits bounded HTTPS Cognito navigation; TB-10 permits operation-specific short-lived presigned S3 transfer access with restrictive CORS and no browser AWS credentials/session-cookie authority.

V4 has a distinct hostname and service worker from V3. V4-only work cannot trigger or alter V3 Netlify production. Carry forward controlled worker lifecycle, cache ownership, no forced reload, release coherence, API/auth cache bypass, and safe update behavior; do not copy Netlify canonicalization or V3-specific inventories/policy.

## Rationale

CloudFront/private S3 provides managed low-idle-cost hosting and one ordinary application origin. Separate origins make V3 service-worker control of V4 impossible.

## Consequences

Hashed assets publish before mutable entry points; authenticated API responses are not cached. CSP must allow only necessary navigation/connect targets. Exact repository/deploy layout is deferred to authorized planning.

## Deferred / reconsideration triggers

WAF remains deferred to public-signup review or demonstrated abuse. Edge code requires a concrete unmet need.

## Amendments

The 2026-09-14 adjudication added TB-09/TB-10 and explicit V3/V4 origin, deployment, and service-worker isolation.
