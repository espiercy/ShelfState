# ShelfState V4 package boundary

This directory is the independently built and deployed ShelfState V4 project.
It is deliberately isolated from the frozen V3 runtime and Netlify publish
artifact.

WP-002 establishes only a deterministic, dependency-free package skeleton. It
does not implement application behavior, AWS infrastructure, deployment, or
the contracts reserved for later work packages.

## Runtime baseline

- Node.js 24 LTS (`.nvmrc`; package engine requires 24.11 or newer in the 24.x line)
- npm 11.6.2 (`packageManager` and lockfile)
- no runtime or development dependencies

## Commands

- `npm ci` installs exactly the committed lockfile state.
- `npm test` runs package-boundary and isolation tests.
- `npm run test:contract` verifies that the contract area remains reserved.
- `npm run build` writes the inert, deterministic boundary marker under `dist/`.
- `npm run verify` runs all V4 checks and the build.

Generated `dist/` and `node_modules/` content is V4-owned and ignored. The
future V4 application must use its own origin; it is never a V3 Netlify publish
input and is not controlled by the root-scoped V3 service worker.

## Reserved structure

- `frontend/` — future PWA client
- `backend/` — future BFF and workers
- `infrastructure/` — future AWS CDK application
- `contracts/` — future OpenAPI and shared contracts
- `checks/` — explicit V4 package-boundary verification
- `scripts/` — V4-local tooling
- `test/` — reserved V4 test organization for later work packages

The placeholder directories are not permission to begin later work packages.
