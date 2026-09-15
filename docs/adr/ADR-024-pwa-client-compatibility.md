# ADR-024: PWA release and API-client compatibility

- **Status:** Closed / approved; amended 2026-09-14
- **Current authority:** [`V4_ARCHITECTURE.md`](../V4_ARCHITECTURE.md) §§16.5–16.7

## Context

Installed PWAs may remain open across deployments, and the frozen V3 root service worker must never control or be coupled to V4.

## Decision

Within API v1, support at least the immediately preceding production client during rollout. Clients send a non-sensitive build identifier; an unsupported client receives stable `CLIENT_UPDATE_REQUIRED` and stops unsafe mutations. Do not force active-session reloads. Publish immutable assets first, mutable entry shell last, and retain prior assets for a bounded rollback window.

V4 has a distinct origin and its own service-worker scope. V3 remains root-scoped only on its Netlify origin; no in-place migration is required. V4 carries controlled lifecycle, release coherence, explicit cache ownership, API/auth precache bypass, and safe update lessons but not Netlify canonicalization, unversioned V3 inventory, or V3-specific cache rules. V4-only changes cannot trigger/alter V3 production.

## Rationale

Rolling compatibility prevents stale installed clients from corrupting newer contracts. Origin isolation is the simplest reliable service-worker boundary.

## Consequences

API changes require compatibility tests. Exact monorepo/package/deploy layout awaits approved implementation planning.

## Deferred / reconsideration triggers

Offline writes and a sync protocol remain deferred to a separately approved phase.

## Amendments

The 2026-09-14 adjudication added V3/V4 deployment/origin/service-worker isolation and clarified which V3 lessons carry forward.
