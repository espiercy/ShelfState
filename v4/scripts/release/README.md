# WP-006B proof-only release controls

Status: **accepted with nonblocking limitations** for exact implementation revision
`9acb1ac9a3c89d8383ddc9d228a7b5b9ce021b4b` (M2).

Authority: approved WP-006A checkpoint sections 9.2–9.11, approved local controls,
the subsequent human workflow-activation/local-synthesis adjudications, privacy
remediation and the final non-author WP-006B evidence adjudication recorded in
`docs/V4_OIDC_RELEASE_CHECKPOINT.md` §9.16. The two YAML definitions are installed
on protected main and remain manual-only. M2 exact-main validation and the accepted
development, rejection and deliberately approved production proofs established the
bounded hosted behavior. This does not establish bootstrap, application deployment,
resource-bearing release authority or a known-good V4 deployment. The V3-only
exception has terminated and does not apply here.

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
  is outside the payload it hashes. The hosted v2 envelope binds authenticated
  required-check provenance and the service-issued payload artifact ID. Its
  digest covers the body without recursively hashing itself. The separate runtime
  record binds controller-pinned account/role target identity to that immutable envelope.
  Supplying matching JSON twice proves no live provenance.
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
  Live settings/role readback is separate from the workflow's GitHub provenance
  adapter. Empty attached/inline policy lists are
  mandatory. No human permission set is changed.

Pure topology constants were extracted into `infrastructure/lib/capabilities.mjs`.
Existing topology exports and guard behavior are preserved. Security processing
and existing WP-006A design assertions no longer transitively import CDK.

## Executable proof-only workflow and controllers

`templates/v4-dev-release.mjs` and `templates/v4-production-release.mjs` expose
exactly two effective, typed source objects, validated against a strict baseline.
`workflow-source.mjs` lowers these objects to the exact two checked-in YAML files.
The static release validator is separate from the unchanged validation policy.
There are no placeholder controller operations or placeholder output values.

The sources specify manual main-only dispatch, separate candidate/controller
identity, immutable actions, explicit setup-node inputs, no package-manager
caches, audit-before-proof, run-bound artifact IDs, independent byte verification,
separate approval-gated OIDC jobs and identity-only proof. They contain no
deployment command, deployment switch, application permission, or rollback
execution. Effective-structure mutations are tested, not text searched.

Prepare has only `contents: read`, no environment, and no OIDC. It authenticates
public GitHub run/workflow/check metadata (no token fallback), pins recorded main
ancestry, and checks out the candidate separately, detached with full history.
Corepack selects npm 11.6.2. Root tests, credential tripwire, WP-001, npm ci,
unchanged high/critical audit, registry signatures and full V4 verify must pass.
The audit failure terminates this chain. Local controller and candidate syntheses
are credential-isolated with native CDK `--no-lookups`, and require six stacks/zero resources per
environment. The transition compares retained controller/candidate assemblies;
neither is a deployed baseline. Candidate execution is credential-free, not an
OS sandbox; only reviewed main ancestors are eligible.

The payload contains assemblies and exact Git-object configuration/lock bytes,
not executable candidate scripts. Upload returns the actual immutable artifact
ID before `seal` creates the candidate evidence. Real values use `GITHUB_OUTPUT`.
Candidate evidence is never rewritten after upload.

Proof has exactly `contents: read`, `actions: read`, `id-token: write`, depends on
successful prepare, and enters its fixed environment. Production's existing
native approval gates the whole job. `pre-oidc` uses only the job token for
authenticated metadata/artifact GETs; storage redirects receive no GitHub token.
It rechecks current run attempt, required-check producer 15368/current validation
attempt, artifact run/name/time/digest, candidate/controller/main ancestry, exact
inventory and offline transition. Public metadata availability failure stops;
there is no PAT/admin fallback. Pagination is bounded and must be complete.

The private account and role bindings are same-name GitHub Environment secrets,
not Actions variables. They are absent from job-wide state and injected only into
the `pre-oidc`, `cross-environment-denial` and `identity` controller steps, so
GitHub's secret masker applies before each runner preamble. The validated account
and role outputs may flow only to the pinned credentials action's
`allowed-account-ids` and `role-to-assume` inputs. No command, job output, artifact
field or other action input may reference the secrets or derived outputs. The
credentials action's account-mask input remains defense in depth rather than the
first masking boundary.

The transport reader accepts one fixed-name ZIP32 file (store or streaming
deflate), checks headers, CRC, expansion limits and rejects extra entries/links
before returning in-memory data. The canonical data bundle then validates every
raw byte/path before writing to a fresh private staging directory. ZIP64, extra
fields and other unsupported formats fail closed. Fixtures test protocol safety;
the accepted development and production runs exercised the hosted transport for
M2. A changed transport implementation requires new validation and evidence.

The version-2 runtime-binding record contains controller-pinned account/role, exact
environment, candidate/controller/run/attempt, candidate digest, payload ID/hash,
fixed role name, region/audience and its own digest. It cannot replace the
candidate evidence. The pinned credentials action consumes only validated
outputs, with `translate-env-variables: false`, `output-credentials: false` and
a requested duration of 900 seconds. It is followed only by STS GetCallerIdentity.
The redacted identity result reports **requested** duration, never actual expiry
or issued lifetime. Retained, independently reviewed CloudTrail evidence for the
accepted dev and production runs establishes the actual 900-second issued
lifetimes within bounded `us-west-2` windows. Inert roles gain no permissions.

### R1/R2 adjudicated boundaries

The protected environment gate is the exact job environment plus AWS OIDC subject
trust, not proof of configuration-secret scope. Account/role bindings are
untrusted runtime configuration. `approved-targets.mjs` pins SHA-256 digests of
canonical `shelfstate.approved-target/v1` records independently of those inputs:
repository, environment, account, exact role ARN/name, audience and region. The
two pins were calculated locally from the existing approved AccountAdmin profile
account binding using a separate canonicalization/hash calculation; no AWS API
was used. Raw live identifiers are not retained in source. A digest is a binding,
not encryption or a secret. Pin changes require controller-source review.

Before any credential action, reconstructed input must match the selected pin.
Runtime evidence and the redacted identity summary carry `approvedTargetDigest`.
The incoming evidence cannot provide/override the expected pin. Environment-level
secrets are the only supported operational location, and Actions-variable
references are rejected locally. GitHub's `secrets.NAME` expression does not encode
scope, so a same-name repository/organization fallback cannot be excluded by source
validation; later hosted metadata readback must require those names to be absent at
broader scopes. GitHub exposes only secret names/metadata for readback, so the
controller pin remains the value check. Wrong values fail regardless of claimed
scope. No administrative token, permission or configuration-provenance lookup is
introduced by the workflow.

For M2, the two exact bindings were migrated to Environment secrets independently
in `dev` and `production`; name/metadata scope, broader-scope absence, legacy-
variable absence and unchanged protections were read back before the accepted
fresh dev proof. Public preambles and artifacts were scanned, and the complete
post-run OIDC-provider inventory/metadata/audience/tag comparison was retained.
This does not prove stored-secret byte equality through GitHub metadata and does
not carry forward automatically to changed bindings or workflows. Existing exposed-
log deletion is a distinct cleanup action and must not delete the retained artifacts
without separate authority.

`offline-environment.mjs` removes AWS/CDK credential/default/profile/web-identity/
container inputs, disables EC2 metadata, points config/credentials at null devices,
and removes inherited `NODE_OPTIONS`. It does not modify the user's AWS files.
The obsolete networking preload was removed. There is **no general network or
process-tree sandbox claim**: native-child networking and caught-fetch behavior
are no longer security invariants. Native CDK `--no-lookups` must reject missing
context instead of resolving it. The controller checks exact lookup-disabled synth
commands, unchanged `cdk.context.json`, no assembly missing-context entries and
unresolved offline account metadata. A synthetic SSM lookup regression proves
native CLI failure. This is credential isolation/context-lookup prevention, not
protection against arbitrary malicious code accessing the user's filesystem.

Tests use independently precomputed synthetic target pins through test-only
in-memory module copies; no production entry point accepts caller-supplied pins.

No dependency caches are restored or saved. Workflow artifacts are not dependency
caches. Local source validation is not evidence of hosted approval/OIDC execution.
The GitHub adapter uses the documented [workflow-run](https://docs.github.com/en/rest/actions/workflow-runs)
and [artifact](https://docs.github.com/en/rest/actions/artifacts) GET APIs. Action
inputs follow the [approved credentials revision](https://github.com/aws-actions/configure-aws-credentials/blob/e1253824e5c10ff9df46874f81ed3ec929e19cfd/action.yml).

## Accepted evidence and remaining gates

Run `npm run test:release` using the pinned npm. Existing `test:design` retains
all prior negative assertions. `npm run verify` includes this suite but does not
include npm audit: report audit and signature verification independently. The
remediated dependency graph passed zero-vulnerability audit, signature checks,
exact-main validation and the accepted proof preparations without bypass,
allowlist, severity downgrade or exception. Direct-package provenance remains
unavailable and is not inferred from graph-wide attestations.

Tests use owned temporary fixtures beneath ignored `v4/cdk.out/` and remove only
those fixtures (transfer tests use owned OS temporary directories). Real synth verification must remain credential-free, use trusted
repository inputs, make no context lookups, and retain six stacks/zero resources
per environment. No CDK or dependency versions/lockfile are changed.

The approved remote stage ordering remains unchanged. For M2, GitHub controls,
provider/inert-role readback, reviewed activation, hosted exclusion, native
rejection/approval, cross-environment denial, positive identity, issued lifetime,
CloudTrail and independent review are complete. The accepted evidence is indexed
in `docs/V4_OIDC_RELEASE_CHECKPOINT.md` §9.16. Rejection satisfied the contract's
reject/cancel alternative; no additional cancellation or proof run is required for
this milestone. Permission-bearing release, bootstrap, WP-007 deployment,
publication, DNS and physical-provenance gates remain open. A future workflow,
controller, dependency or assembly-schema change requires its own review and
applicable evidence. Unsupported new assembly schemas fail closed at a narrow
adapter boundary.
