# ShelfState V4 package boundary

This directory is the independently built and deployed ShelfState V4 project.
It is deliberately isolated from the frozen V3 runtime and Netlify publish
artifact.

WP-002 established the deterministic package skeleton. WP-003 adds a local-only
AWS CDK v2 environment model. WP-008 adds repository-only identity/account and
session/auth-transaction contracts, adapters, tests, and an explicit CDK
inspection path. None of these commands deploys AWS resources or bootstraps an
account.

## Runtime baseline

- Node.js 24 LTS (`.nvmrc`; package engine requires 24.11 or newer in the 24.x line)
- npm 11.6.2 (`packageManager` and lockfile)
- exactly pinned CDK v2 library, constructs peer, and CDK CLI dependencies

## Commands

- `npm ci` installs exactly the committed lockfile state.
- `npm test` runs package-boundary and isolation tests.
- `npm run test:contract` verifies that the contract area remains reserved.
- `npm run test:security` verifies the secret-free WP-005C1 human-access policy
  model and its content, identity, deployment, and recovery boundaries.
- `npm run test:persistence` verifies the WP-008 contracts, repositories,
  simulated IAM denials, and exact table configuration.
- `npm run infra:test` verifies the environment, topology, exclusions, and
  stateful-resource guardrails.
- `npm run infra:synth` synthesizes isolated dev and prod assemblies locally.
- `npm run infra:synth:wp008` synthesizes the explicit repository-only WP-008
  dev and prod inspection assemblies.
- `npm run infra:preview` summarizes the synthesized templates and hashes
  without contacting AWS.
- `npm run build` writes the inert, deterministic boundary marker under `dist/`.
- `npm run verify` runs all V4 checks, syntheses, preview, and the inert build.

Generated `dist/` and `node_modules/` content is V4-owned and ignored. The
future V4 application must use its own origin; it is never a V3 Netlify publish
input and is not controlled by the root-scoped V3 service worker.

## Reserved structure

- `frontend/` — future PWA client
- `backend/` — BFF persistence ports and future handlers/workers
- `infrastructure/` — synth-only AWS CDK environment foundation
- `contracts/` — versioned persistence contracts and future OpenAPI contracts
- `checks/` — explicit V4 package-boundary verification
- `scripts/` — V4-local tooling
- `security/` — reviewed, secret-free human-access policy models
- `test/` — reserved V4 test organization for later work packages

The placeholder directories are not permission to begin later work packages.
