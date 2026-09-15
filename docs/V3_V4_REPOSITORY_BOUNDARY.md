# ShelfState V3/V4 repository and deployment boundary

Status: WP-001 IMPLEMENTATION EVIDENCE

## Ownership boundary

- ShelfState V3 owns the existing root runtime: `_headers`, `icons/`,
  `index.html`, `manifest.webmanifest`, `service-worker.js`, and `src/`.
- `v4/` is reserved for the independent ShelfState V4 project. WP-001 adds only
  its ownership marker; WP-002 or later authorization is required before a V4
  package, source tree, toolchain, or infrastructure can be created.
- The trigger classifier also treats only these unambiguous governance paths as
  V4-owned: top-level `docs/V4_*.md`, `docs/adr/**`,
  `docs/V3_EXPORT_COMPATIBILITY.md`, and
  `docs/V3_V4_REPOSITORY_BOUNDARY.md`. Other `docs/**` paths remain shared and
  require a V3 build.
- `scripts/v3-deployment-boundary.mjs` copies only the explicit V3 allowlist to
  `v3-dist/`. Netlify publishes that generated directory, never the repository
  root, so files or generated output beneath `v4/` cannot enter the V3 deploy.
- The same script records a normalized digest of every frozen V3 runtime file.
  The build and automated test fail if any such file changes.

## Netlify trigger boundary

The repository-owned `netlify.toml` uses Netlify's documented custom `ignore`
command. The command compares `CACHED_COMMIT_REF` with `COMMIT_REF` using
NUL-delimited names with Git rename detection disabled. A rename is therefore
classified as deletion of its source plus addition of its destination; neither
side can be hidden by destination-only rename output. Netlify's skip code is
returned only when the nonempty change set consists entirely of `v4/**` and/or
the explicitly listed V4 governance paths. Missing or unusable comparison data
fails open: V3 builds rather than silently skipping a possibly relevant change.
Build hooks are not treated as path-filtered because Netlify documents that
custom ignore commands do not cancel hook-triggered builds.

| Changed repository paths | V3 build decision |
|---|---|
| Only `v4/**` | Skip |
| Only the explicitly listed V4 governance paths | Skip |
| `v4/**` plus explicitly listed V4 governance paths | Skip |
| Any other `docs/**`, root, V3 runtime, build, test, or shared path | Build |
| Rename touching any V3/shared path on either side | Build |
| Missing, equal, invalid, or otherwise unusable Git comparison | Build |

## Inspected live configuration (2026-09-15)

Before WP-001 repository configuration was applied, the authenticated Netlify
project showed:

- linked repository: `github.com/espiercy/ShelfState`;
- production branch: `main`;
- base directory: `/`;
- package directory: not set;
- build command: not set;
- publish directory: not set;
- functions directory: the default `netlify/functions`;
- build status: active;
- branch deploys: production branch only;
- Deploy Previews: pull requests against the production/branch-deploy branches;
- build hooks: none listed;
- all deployment methods allowed to deploy to production.

The root `netlify.toml` now overrides the build command and publish directory
with the guarded V3 build and `v3-dist/` artifact. Base and package-directory
behavior remain unchanged.

## Service-worker and origin boundary

V3 continues to register `/service-worker.js` with root scope on the existing
Netlify origin. No V4 file is published there. V4 remains assigned to a distinct
future AWS-hosted hostname/origin; WP-001 creates no hostname or AWS resource.

## Operational evidence

On 2026-09-15, WP-001 was exercised on the temporary non-production branch
`codex/wp001-netlify-proof` before the permanent commits were pushed to `main`:

1. Candidate commit `ca1cd9a` produced branch deploy
   `6aa98ab07c59ee0007d9df53`. The log resolved `/opt/build/repo/netlify.toml`,
   the `v3-dist` publish path, the boundary build command, and the custom ignore
   command. The build reported 42 prepared frozen V3 files and completed.
2. Synthetic commit `bcf1816` added only
   `v4/netlify-isolation-proof.txt`. Netlify deploy record
   `6aa98b08c7c49000081c13b3` was canceled before build/deploy. Its log recorded
   `V3 build skipped: all 1 changed paths are owned by v4/.`, exit code `0`, and
   skipped deploying, cleanup, and post-processing stages.
3. Throughout the proof, the production site remained published from `main` at
   `c70f6ff`; the synthetic change produced no V3 production deployment.
4. After capture, Netlify branch deploys were restored to production-branch
   only and the temporary local and remote proof branch was removed. The
   canceled Netlify deploy record remains the operational audit evidence.

The independent-review corrections were then exercised on 2026-09-15 using
the temporary non-production branch `codex/wp001-rereview-proof`:

1. Candidate follow-up commit `b2d055a` produced branch deploy
   `6aa98e577495ef0008bcf30f`. The build used `v3-dist/`, reported 42 prepared
   frozen V3 files, and completed successfully.
2. Synthetic commit `3d33a7f` added only the temporary top-level
   `docs/V4_NETLIFY_ISOLATION_PROOF.md`. Netlify deploy record
   `6aa9f2750b27f70008e07d5e` ran the custom ignore command, reported
   `V3 build skipped: all 1 changed paths are V4-owned.`, returned exit code
   `0`, and skipped deploying, cleanup, and post-processing. The proof file was
   branch-only and is not part of the WP-001 deliverable.
3. The production site remained published from `main` at `be82d6e` throughout
   the synthetic proof; the V4-documentation-only commit created no V3
   production deployment.
4. After capture, branch deploys were visibly restored to production-branch
   only and the temporary local and remote proof branch was removed. The
   canceled deploy record remains the audit evidence.

No credentials, tokens, hook URLs, or other secrets are recorded here.
