# WP-006B local release controls

Status: local implementation / offline proof only / uncommitted review candidate.

Authority: approved WP-006A checkpoint sections 9.2–9.11 and the subsequent
human authorization for implementation exclusively beneath `v4/`. No active
workflow, GitHub protection, AWS provider/role, bootstrap, or deployment is
established by these files. The V3-only security exception has terminated and
does not apply here. The unchanged dependency audit must remain visibly failing.

## Implemented boundaries

- `schema.mjs`: strict versioned object shapes, exact SHA/digest checks,
  deterministic JSON and bounded UTF-8 JSON ingress with duplicate-key rejection.
- `revisions.mjs`: local-only complete Git history, exact detached/clean checkout,
  candidate/controller ancestry to the explicitly recorded local main tip.
  No fetch, checkout, shell execution, lazy fetch, or candidate code execution.
  This is not proof of remote repository identity or main protection.
- `artifacts.mjs`: sorted raw-byte inventories, bounded file counts/sizes/depth,
  complete expected-versus-actual comparison, and rejection of traversal,
  device/alternate-stream paths, symlinks, junctions, hard links and special files.
  Use private quiescent staging directories; this is not an archive extractor or
  an OS sandbox against concurrent hostile filesystem mutation. No input path is
  interpreted as a glob or passed to CDK.
- `evidence.mjs`: candidate/controller/workflow/run/attempt/environment/config,
  lockfile, action pin, artifact ID, baseline and preview binding. The manifest
  is outside the payload it hashes. Service-issued artifact identity is supplied
  after payload upload; the separately retained evidence manifest does not hash
  itself. A future collector must authenticate service metadata and expected
  values independently. Supplying matching JSON twice proves no live provenance.
- `assemblies.mjs`: reads schema `54.0.0` without loading CDK; inventories both
  assemblies, validates file bytes, and produces deterministic offline previews.
  Only the unresolved-account six-stack, zero-resource foundation is supported
  for an allowed result. No deployed baseline or account absence is invented.
  Non-empty resources, unknown replacement semantics, macro/nested effects,
  removed stacks, incomplete evidence and protection changes fail closed.
  Synthetic non-empty fixtures test rejection, not CloudFormation semantics.
  Transition assessment accepts only deeply frozen, reader-issued snapshots.
  Parsed templates, canonical digests, stack mapping and raw inventory all come
  from the same verified bytes; copied/deserialized objects are not accepted.
  Reload retained bytes through `readAssembly` in each process. Snapshots describe
  bytes observed at ingestion, not a promise that a directory stays unchanged;
  consumers must still verify retained bytes before use.
  The supported schema subset explicitly checks artifact/property fields and
  retains full artifact and file-asset configuration. Current file destinations
  require bucket, object key, region and publishing role; destination IDs and
  account placeholders are preserved. Any asset/configuration change blocks the
  transition. External IDs, additional STS options, executable/zip/Docker assets
  and unknown fields are unsupported. Asset manifests are root-level only.
  Creation traces, logical IDs and CDK-v2 informational metadata tags are the
  only accepted stack metadata types; deployment tags remain in stack properties.
  Construct-tree JSON is diagnostic and never interpreted as execution input.
  Feature-report fields are enumerated; artifact display names are preserved
  because CDK can use them for stack selection. No publishing is implemented.
- `rollback.mjs`: exact-record selection dry run; successful application/smoke/
  acceptance evidence, original build and current rollback controller identity,
  run/artifact binding, retained bytes, expiry (at most 90 days), and recomputed
  current safety gates. Proof-only records cannot become known-good deployments.
  There is no real known-good V4 deployment. Positive test records are synthetic.
- `security/oidc-release-policies.mjs`: exact inert role/trust materialization
  and strict fully enumerated readback projections for role/ruleset/environments.
  Projection adapters and live pagination/completeness proof remain unimplemented;
  no AWS or GitHub client is included. Empty attached/inline policy lists are
  mandatory. No human permission set is changed.

Pure topology constants were extracted into `infrastructure/lib/capabilities.mjs`.
Existing topology exports and guard behavior are preserved. Security processing
and existing WP-006A design assertions no longer transitively import CDK.

## Inactive workflow source format

`templates/v4-dev-release.mjs` and `templates/v4-production-release.mjs` expose
exactly two effective, typed source objects, validated against a strict baseline.
They are deliberately **not executable GitHub YAML**. `controller` steps are
explicit operation/input contracts; `controller-bound-output` is an unresolved
output binding, not a value that may be shipped as-is. They cannot be activated
merely by copying these files into `.github/workflows/`.

The sources specify manual main-only dispatch, separate candidate/controller
identity, immutable actions, explicit setup-node inputs, no package-manager
caches, audit-before-proof, run-bound artifact IDs, independent byte verification,
separate approval-gated OIDC jobs and identity-only proof. They contain no
deployment command, deployment switch, application permission, or rollback
execution. Effective-structure mutations are tested, not text searched.

Later reviewed activation must implement/lower controller contracts, authentic
GitHub run/check/artifact collectors and approval evidence, final extraction
handling, session/CloudTrail proof, and the two real workflow files. It must
verify pinned action source/inputs again and update the existing exact workflow
inventory tests in the same reviewed PR. Local source validation is not evidence
that the GitHub service accepted or executed a workflow.

## Verification and remaining gates

Run `npm run test:release` using the pinned npm. Existing `test:design` retains
all prior negative assertions. `npm run verify` includes this suite but does not
include npm audit: report its result independently from the still-failing
`npm audit --audit-level=high`. Signature verification is likewise separate.
Hosted CI still stops at audit; local results do not make the hosted aggregate
green. No bypass, allowlist, severity downgrade or old exception is introduced.

Tests use owned temporary fixtures beneath ignored `v4/cdk.out/` and remove only
those fixtures. Real synth verification must remain credential-free, use trusted
repository inputs, make no context lookups, and retain six stacks/zero resources
per environment. No CDK or dependency versions/lockfile are changed.

The approved remote stage ordering remains unchanged: GitHub controls/readback,
separately authorized provider establishment, inert roles/readback, reviewed
workflow activation with passing required checks, hosted exclusion/approval/STS
proofs, redacted evidence, independent review. This local slice completes none
of those live checkpoints. WP-007 remains unstarted. A future dependency upgrade
requires separate authorization and audit/signature/regression/synth verification.
Unsupported new assembly schemas fail closed at a narrow adapter boundary.
