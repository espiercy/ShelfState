# ADR-006: Frontend, edge hosting, and browser boundaries

- **Status:** Closed / approved; amended 2026-09-14 and 2026-11-04
- **Current authority:** [`V4_ARCHITECTURE.md`](../V4_ARCHITECTURE.md) §§6, 16–17

## Context

V4 needs private static hosting, TLS, deliberate caching, safe PWA releases, and explicit browser flows without coupling to the frozen Netlify V3 application.

## Decision

Host V4 static assets in private S3 behind CloudFront OAC, Route 53, and ACM. CloudFront is the single V4 origin for ordinary static and `/api/*` traffic. TB-09 permits bounded HTTPS Cognito navigation; TB-10 permits operation-specific short-lived presigned S3 transfer access with restrictive CORS and no browser AWS credentials/session-cookie authority.

V4 has a distinct hostname and service worker from V3. V4-only work cannot trigger or alter V3 Netlify production. Carry forward controlled worker lifecycle, cache ownership, no forced reload, release coherence, API/auth cache bypass, and safe update behavior; do not copy Netlify canonicalization or V3-specific inventories/policy.

Before the V4 development CloudFront distribution is publicly deployed, attach one minimal CloudFront-scope AWS WAF Web ACL created in `us-east-1`. The distribution must be created with the independently authenticated Web ACL ARN already bound. The required Web ACL defaults to `ALLOW` and has one source-IP rate-based `BLOCK` rule at 120 requests per 60-second evaluation window.

## Rationale

CloudFront/private S3 provides managed hosting and one ordinary application origin. Separate origins make V3 service-worker control of V4 impossible. The bounded development WAF rule adds an edge abuse and cost-protection layer before public exposure without replacing API Gateway throttling, Lambda concurrency, backend authorization, or response-header controls.

## Consequences

Hashed assets publish before mutable entry points; authenticated API responses are not cached. CSP must allow only necessary navigation/connect targets. Exact repository/deploy layout is deferred to authorized planning. WAF adds recurring base and request charges and cannot guarantee an absolute traffic or spending limit.

## Deferred / reconsideration triggers

The minimal WP-007 development Web ACL is no longer deferred. Additional rules, managed rule groups, logging/inspection features, production or V3 WAF coverage, and a general WAF governance framework remain deferred to a separately approved need. Edge code still requires a concrete unmet need.

## Amendments

The 2026-09-14 adjudication added TB-09/TB-10 and explicit V3/V4 origin, deployment, and service-worker isolation.

The 2026-11-04 amendment approved one minimal, separately deployed development Web ACL and made its authenticated CloudFront binding a prerequisite to public deployment. It did not authorize AWS changes or extend the decision to production V3.
