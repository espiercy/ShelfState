# ShelfState V4 CDK environment foundation

WP-003 models the V4 infrastructure topology without creating AWS resources.
Default dev/prod proof synthesis remains six stacks / zero resources. The
explicitly selected local-only WP-007 API, certificate and static-edge phases
below are resource-bearing synthesis exceptions. They do not enable deployment:
the ordinary proof/release path remains non-deploying and rejects unauthorized
resource-bearing assemblies.

## Environments and accounts

Every synth must explicitly select `dev` or `prod`; missing or other values
fail. Both environments use `us-west-2` for ordinary runtime boundaries. The
separate CloudFront certificate boundary uses `us-east-1`.

Local synth does not require an AWS account or credentials. If a concrete
account-qualified assembly is needed later, supply the non-secret, environment-
specific `SHELFSTATE_DEV_AWS_ACCOUNT_ID` or `SHELFSTATE_PROD_AWS_ACCOUNT_ID`.
Each must be a 12-digit account ID. When omitted, the synthesized assembly
records `unknown-account` while retaining the explicit region for local review.
The model deliberately ignores default profiles,
`CDK_DEFAULT_ACCOUNT`, branch names, host names, and deployment order.

Names use `shelfstate-v4-<environment>-<capability>`. Managed resources inherit
the minimal tags `Project=ShelfState`, `Environment=<environment>`, and
`ManagedBy=AWS-CDK`. Production stacks have termination protection enabled.

## Capability stacks

- `edge-certificate` (`us-east-1`) — future CloudFront certificate ownership.
- `edge-delivery` (`us-west-2`) — future private static delivery and edge path;
  it has the topology's only dependency, on `edge-certificate`.
- `identity-session` — future identity, account, session, and auth-transaction
  persistence and authentication infrastructure.
- `library-api` — future library persistence, HTTP API, and synchronous library
  capability.
- `operations-lifecycle` — future asynchronous library operations and account
  lifecycle capability.
- `recovery-observability` — future backup, recovery, logging, alarm, and cost
  controls.

No stack contains a resource in WP-003.

## Local commands

- `npm run infra:test` validates environment selection, topology, synthesized
  templates, exclusions, and stateful-resource safeguards.
- `npm run infra:synth:dev` writes `cdk.out/dev/`.
- `npm run infra:synth:prod` writes `cdk.out/prod/`.
- `npm run infra:synth` performs both syntheses.
- `npm run infra:preview` prints an offline inventory and SHA-256 for every
  synthesized template.

`cdk.out/` is ignored and remains beneath the V4 package. No command invokes
`cdk deploy` or `cdk bootstrap`. A meaningful `cdk diff` compares against live
deployed state and may require account/bootstrap access, so an operational diff
wrapper is intentionally reserved for the later authorized deployment package.
The offline preview is the review surface for WP-003.

## Stateful-resource guardrail

Synth validation inspects future DynamoDB tables, Cognito pools, data-bearing
S3 buckets, backup configuration, and production DNS/certificate bindings.
Each must declare `Metadata.ShelfStateStatefulPolicy`:

- `retained` requires both deletion and update-replacement retention; production
  DynamoDB/Cognito/backup resources also require their service-specific
  deletion/lock protection.
- `ephemeral` is limited to S3 buckets with an enabled expiration rule.
- `destroy-approved` is allowed only in development and remains an explicit
  review signal.

The guardrail proves a convention and failure mechanism, not the final policy
for resources that later packages have not yet designed.

## Dependencies and cost

- `aws-cdk-lib` (runtime): CDK v2 constructs, stacks, synthesis, and assertions;
  native Node.js cannot model or synthesize CloudFormation constructs.
- `constructs` (runtime): required CDK construct-tree peer used by
  `aws-cdk-lib`; native Node.js has no construct model.
- `aws-cdk` (development): local CDK CLI for deterministic synth commands;
  native Node.js has no CDK cloud-assembly CLI.

WP-003 performs no AWS calls, creates no resources, and costs `$0`. A future
authorized bootstrap may create usage-driven S3/ECR support storage; bootstrap
is not part of this work package.

## Dependency remediation local candidate — 2026-10-09

Starting checkpoint: branch `codex/wp-006b-workflow-activation`, HEAD
`904cd4715862661ed7afba806c88e138d5996e3a`, clean worktree and empty index.
This separately authorized local-only slice changes no resource, policy, trust,
workflow, API-routing, V3 or live state. At this dated freeze the candidate was
unstaged and uncommitted, and independent review/hosted acceptance were separate
gates. The remediation was later committed, hosted and exercised by M2 validation
and the accepted WP-006B proof preparations; the historical freeze claim remains
limited to 2026-10-09.

- The direct `aws-cdk-lib` pin is `2.273.0`; `constructs@10.8.1` and the
  `aws-cdk@2.1141.0` CLI pin are unchanged. Required lock resolution advances
  `@aws-cdk/cloud-assembly-schema` `54.23.0 → 54.26.0` and the library's bundled
  `@aws/cloudformation-validate` `1.9.0-beta → 1.12.1`. The bundled
  `minimatch@10.2.5` resolves its embedded `brace-expansion` from `5.0.9` to
  `5.0.12`; no suppression, allowlist or unrelated upgrade is present.
- Official npm metadata and a fresh isolated tarball agree on SHA-1
  `8538bfa847dccb6668260cf5684d6c29bad7fce1` and SRI
  `sha512-H7hBQHnKn0ZBbpnWRL1Hn0GunSQUsYaLqOk2xIqV0HWr3qbYMwTEZT0HbJBUSxeUdzp1nz0AE2LN3K6qvYr4Zg==`.
  The tarball declares `aws-cdk-lib@2.273.0` and contains the bundled
  `brace-expansion@5.0.12`. Registry metadata exposes two signature records
  under key ID `SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`.
  It exposes no `dist.attestations` or `gitHead`; the repository URL is a source
  pointer, not package provenance.
- Clean `npm@11.6.2 ci` succeeded. `npm audit --audit-level=low --json` reports
  zero vulnerabilities at every severity. `npm audit signatures` verifies
  registry signatures for all 26 audited packages and nine graph-wide
  attestations, with no verification failures. Those nine attestations are
  not attributable to the direct CDK release by the command output and do not
  replace its absent registry provenance attestation.
- Full `npm run verify` passes: **549 passed / 2 existing Windows real-symlink
  skips**, with synth, preview and inert build successful. The mocked mandatory
  filesystem classifications pass. V3's 42-file build isolation, tracked
  credential/personal-identifier checks, release/foundation guards and all five
  6,144-character policy-size assertions pass.
- Equivalent pre/post synth captured dev, prod, `api-parent`, `api-children`,
  `certificate` and `edge-static`: all **36 templates are byte-identical** and
  assembly schema remains `54.0.0`. `minimumCliVersion` changes exactly
  `2.1141.0 → 2.1144.0`; the exact reader/fixture guards now require that value.
  The pinned CLI successfully synthesizes both normal environments with the
  resolved schema consumer `54.26.0`. Other assembly differences are diagnostic:
  one new recommended CloudFront feature flag, construct/plugin version labels
  and validation stack-trace formatting. No resource, behavior, privilege or
  trust-boundary difference exists. Deployment compatibility/live behavior was
  not exercised and remains separately gated.

### Dependency remediation revalidation — 2026-10-13

Resumed the existing eight unstaged paths at the same baseline HEAD, rather than
reapplying the upgrade. All eight raw-byte hashes matched the retained candidate
before this documentation refresh. No additional dependency or executable change
was made during revalidation. The prior reliability assessment was not acceptance
of this dependency candidate; a separate genuine independent review is required.

- Fresh official registry/tarball read (2026-10-14 00:50 UTC; October 13 Phoenix)
  reproduced the SHA-1/SRI above and verified both registry signature records
  cryptographically using the published npm signing key. The installed bundle
  is also `brace-expansion@5.0.12`. Direct-package `dist.attestations` and `gitHead`
  remain absent: integrity and registry authentication are proven, not direct
  source/build provenance. Graph-wide attestation totals do not fill that gap.
- A new `npm@11.6.2 ci`, all-severity vulnerability audit and signature audit
  pass: **0 vulnerabilities**, **26 signatures**, **9 available attestations**.
  Full V4 verification repeats **549 passed, 0 failed, 2 existing Windows symlink
  skips**. Root tests: **197/197**; CI/WP-001: **22/22**. Credential tripwire,
  five managed-policy size checks and whitespace checks pass. This is local
  security evidence, not hosted aggregate-CI acceptance or a security exception.
- Exported committed V4 source and its original lockfile to an isolated directory,
  installed that lock without lifecycle scripts, and synthesized both dependency
  states with the same local harness/inputs. Dev/prod and all four resource phases
  reproduce **36 raw-byte-identical templates**. Each has six stacks; aggregate
  resource counts are respectively **0, 0, 1, 8, 1, 5**. No expectation, resource,
  IAM policy or bootstrap-template pin was regenerated.
- Non-template differences were inspected exhaustively: the new recommended
  CloudFront HTTPS flag (not activated by this change), manifest minimum CLI,
  library/plugin version labels, source-location paths and validation trace
  formatting. Existing validation findings/acknowledgments are otherwise equal;
  no new suppression was added. Assembly schema remains `54.0.0`.
- Explicit schema validation passes for all six candidate assemblies, and the
  unchanged CLI `2.1141.0` reads each prebuilt assembly with credential-free
  `cdk list --app <local-assembly> --no-lookups`. Its installed manifest loader
  gates on supported schema major; `minimumCliVersion` is used in the schema-
  mismatch diagnostic, not a separate semantic-version rejection. This explains
  the observed local compatibility despite the emitted `2.1144.0` minimum. The
  release reader's exact value changed only after inspecting that emitted delta;
  unknown schema/fields, nonempty release templates and lookup evidence remain
  rejected. This does not prove live deployment or general forward compatibility;
  those remain separately gated. No CLI or bootstrap provenance pin was changed.
- V3 source/publication remain **42 files**, SHA-256
  `a4b25c4da79431dedb37a1213d74bac55d8df42e86eecac296a7d88c06cd8caa`.
  WP-001 classifies the exact candidate as V4-only. Workflows, live configuration,
  direct CLI/constructs pins and API routing remain unchanged. No staging, commit,
  push, AWS authentication, hosted run, bootstrap, deployment or publication.

## WP-007 library-api local slice

Snapshot notice: this slice's local verification record below predates its
human-accepted independent **B — APPROVE WITH NONBLOCKING NOTES** and commit
`1e1cf8a1f98423fc2bd34827f7b8160cfad1cee6`. Its source/template provenance,
physical-ID and provider/rollback/propagation proof boundaries remain live gates.
The certificate slice below does not modify the reviewed API semantics.

Local preparation only, **NOT DEPLOYMENT READY**. This implements the authorized
public `GET /api/v1/health` route, not library features or another capability.
Traceability: WP-007; ADR-005/007/014; API-001/002 and the WP-007 health contract.

The existing `api-parent` and `api-children` phases from bounded initialization
are selected explicitly via `createEnvironmentTopology(app, config,
{ initializationPhase })` or the existing app's `shelfstateInitializationPhase`
context. Selection requires dev, west region and an explicit account binding.
No account/SSM/context lookup occurs during synthesis. Tests supply only the AWS
documentation account through local configuration. Real bindings remain outside
Git; a future live adapter must independently verify them.

| Selection | library-api resources | Other five stacks |
|---|---|---|
| Unselected dev/prod (normal proof path) | 0 | 0 each |
| `api-parent` (dev only) | `Api` — 1 HTTP API | Unchanged/empty |
| `api-children` (dev only) | `Api`, `HealthLogGroup`, `HealthRole`, `HealthFunction`, `Integration`, `Route`, `InvokePermission`, `DefaultStage` — 8 total | Unchanged/empty |

Both templates retain the **identical native `Api` resource** with stable logical
ID, exact name and ownership tags. There is no quick-create target, OpenAPI body,
imported API or alternate phasing mechanism. Future child execution requires the
captured physical API ID to match reviewed evidence and cannot modify/replace the
parent. Seven additions are permitted; no API parent change is permitted.

### Runtime and least privilege

`backend/health.cjs` ignores input/context/environment and returns HTTP 200,
`Content-Type: application/json`, `Cache-Control: no-store`, and exactly
`{"status":"ok"}`. The tiny CommonJS source is inlined into the template, with
`index.handler`, Node.js 24, ARM64, 128 MB and a three-second timeout. No SDK,
external code asset, database, authentication or application dependency is added.
The template pin covers the inline code bytes (LF-normalized across platforms).

The dedicated named role trusts only Lambda and grants only CreateLogStream and
PutLogEvents on the dedicated health log group's streams. It references the
existing independently managed `ShelfStateV4DevHealthBoundary`; it does **not**
create or change that boundary. The log group is explicitly precreated with
seven-day nonproduction retention. Function dependencies/log configuration bind
that group; the runtime cannot create log groups. Deployment/rollback defaults for
these non-data dev resources remain native CloudFormation behavior, not an
authorization to destroy resources.

The integration is AWS_PROXY payload 2.0, bound by GetAtt to the exact function.
Only `GET /api/v1/health` is declared, with explicit `NONE` authorization and
`$default` auto-deploy stage. No CORS, authorizer, caching feature or response
mapping is added. The Lambda resource permission binds the exact function,
API service principal, account, API Ref, `$default` stage, GET method and health
path; no wildcard invoke grant is used. The stage depends on route and permission.

### Explicit synthesized contract additions

`bootstrap/library-api-contract.mjs` independently specifies the complete emitted
template; constructs do not synthesize from their own validator. The existing
bundle validator selects this contract only with
`shelfstate.wp007-library-api-review/v1` and an existing API phase. Parent bindings
are empty; child bindings contain only the exact prior `apiId`. External assets
and parameter overrides remain forbidden. Assembly/change-set projections are
still local review data, not authenticated AWS evidence or an executor.

| Newly accepted structure | Required purpose / closed boundary |
|---|---|
| Exact stack description/metadata and phase | Identifies this dev west capability, not arbitrary metadata |
| Fixed BootstrapVersion SSM parameter and unchanged CDK version rule | Preserves pinned synthesizer's version check; only the exact bootstrap path is accepted; no synth lookup or parameter override |
| Ownership Tags on API/stage and log/role/function | Required ownership labels, exact key/value sets and emitted array order |
| Named log group/retention | Precreation and bounded nonproduction log storage |
| Role trust, boundary ARN and one inline policy | Exact Lambda trust and stream-write-only identity policy; no managed policy, extra statement or boundary creation |
| Function inline Code/runtime/handler/memory/timeout/architecture | Deterministic minimal health execution, no image/S3/layers/environment/VPC/URL extension |
| Function Role GetAtt, LoggingConfig Ref and DependsOn | Binds exact role/group and precreation ordering |
| Integration GetAtt/payload 2.0/timeout | Binds health code and explicit HTTP proxy event format/three-second budget |
| Route path/authorization/Ref and Join | Exact approved public health route; no catch-all, authorizer or alternate API |
| Permission GetAtt/account/exact SourceArn Join | Exact caller service, API, stage, method, path and function |
| Fixed stage/tags/dependencies | Auto-deploy only after reviewed route/invoke permission; no extra stage or variables |

Every resource envelope and nested property tree is compared exactly, normalizing
object-key order only. Unknown fields, macros, alternate intrinsics, extra
resources, code changes and relationship changes reject even under newly
consistent pins. The old synthetic edge/certificate contracts remain unchanged;
their placeholders still do not establish real configuration support.

`validateLocalApiAssembly` is a separate local inspection entry point; the normal
foundation and release-transition guards still reject nonempty assemblies.
Default scripts, workflow sources, controller, hosted settings and runtime
bindings remain unchanged. Passing local inspection cannot authorize deployment.

### Evidence and remaining gates

Run the new `checks/library-api.case.mjs` through `infra:test` or the existing
credential-free test launcher. It synthesizes both phases, checks the emitted
JSON, executes the actual inline handler in a capability-free VM, repins malicious
candidates, checks IAM denial and confirms the release gate still rejects them.
Adversarial tests include quick-create/OpenAPI, extra API/route/integration/stage,
authorizers, credentials/targets, code/role/boundary/log substitution, missing
dependencies, unknown nested keys, parent replacement and input/asset substitution.

No AWS resources have been created. Eventual API/Lambda/log charges are usage-driven
with no new fixed service charge expected; they are covered by the existing
Personal component model, but dev usage/retention/cost must be revalidated before
live deployment. No new execution-policy authority or composition is introduced.

At this dated slice, independent review, dependency-security resolution and WP-006
hosted acceptance were still required. Those three gates later closed for M2 with
no waiver. Still required: bootstrap/live authorization; boundary policy
installation/readback; narrower-principal/stale-stack closure; actual handler/tag
calls, permissions/propagation/rollback; parent ID and change-set authenticity;
artifact/template correspondence; direct HTTP/invocation/logging/no-store smoke;
CloudTrail and exact-ID closure. This historical paragraph does not claim those
WP-007 live gates were closed by later dependency or WP-006 acceptance.

Primary service references: [HTTP API quick-create semantics](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-apigatewayv2-api.html),
[Lambda proxy payload configuration](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-apigatewayv2-integration.html),
[inline CommonJS Lambda source](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-lambda-function-code.html).

### Local verification record — 2026-10-07

Baseline: `dd1dc2b6e0b7a8d0bac0eb3d8a2cc7cbee22488a`, branch
`codex/wp-006b-workflow-activation`, clean at entry. This slice is unstaged and
uncommitted, pending independent review; this record is not review approval.

- Credential-free Node test invocation: `checks/library-api.case.mjs`,
  `checks/bootstrap-initialization.case.mjs`, `checks/bootstrap-security.case.mjs`,
  `checks/infrastructure.case.mjs`, `checks/package-boundary.case.mjs`,
  `checks/release-control-implementation.case.mjs`, `checks/workflow-activation.case.mjs`,
  `checks/controller-provenance.case.mjs`, `checks/runtime-target.case.mjs`, and
  `checks/offline-synthesis.case.mjs`: **409 passed, 0 failed, 2 skipped** out of
  411 tests. The two existing Windows real-symlink cases skip when link creation
  is unavailable; mandatory mocked classification tests pass.
- Library-api alone: **37 passed**, including both actual app-entry configurations.
  Bounded initialization **74**, bootstrap **44**, infrastructure **8**, package
  **9** pass. Local temp-only synth proves six stacks with API resource totals
  **1 (parent)** / **8 (children)**, other five templates unchanged. Default
  dev/prod remain **six stacks / zero resources**, including prod protection.
- Root `node --test test/deployment/v3-v4-isolation.test.js test/ci-supply-chain.test.js`:
  **22 passed, 0 failed**, including all **6 WP-001** cases. The 12 changed/new
  paths classify V4-only; no actual Netlify run was requested or triggered.
- `git diff --check`, tracked credential tripwire plus explicit changed/new-file
  credential/private-binding and whitespace checks: passed. Only synthetic account
  data is used; no private handoff read. Dependency fields/lockfile, workflow files,
  execution policies/compositions and independent runtime-boundary policy bytes
  remain unchanged. Existing policy-size assertions pass; no new deployment-policy
  size/recomposition exercise is required.
- V3 source and existing publication each retain **42 files**, digest
  `a4b25c4da79431dedb37a1213d74bac55d8df42e86eecac296a7d88c06cd8caa`.
- No broad application-suite/audit rerun, dependency change, security suppression,
  AWS authentication/API call, resource creation, OIDC, workflow activation,
  bootstrap, deployment, remote mutation, stage, commit or push. Public AWS
  documentation reads informed the implementation, not live-account facts.

## WP-007 edge-certificate local slice

Local preparation only, **NOT DEPLOYMENT READY**. Independently reviewed with
**B — APPROVE WITH NONBLOCKING NOTES** and committed at
`522d72578f4d0aa3dc027fb57bf6842db662d891`. Evidence-authentication and
pending-validation/provider notes remain deferred live-proof gates, not resolved
by that local acceptance.
Traceability: WP-007; ADR-005/007/014; EDGE-001/002/004 and the selected staged
exact-record validation design in `bootstrap/pending-decisions.json`.

### Feasibility, scope and exact representation

The pinned CDK supports manual DNS validation without a hosted-zone parameter
(`aws-certificatemanager/lib/certificate.d.ts`, `CertificateValidation.fromDns`).
The implementation uses the smaller L1 `CfnCertificate`, not a DNS convenience
construct. The actual emitted template contains exactly:

| Structure | Approved emitted value |
|---|---|
| Stack / region | `shelfstate-v4-dev-edge-certificate` / `us-east-1` |
| Resource logical ID / type | `Certificate` / `AWS::CertificateManager::Certificate` |
| DomainName | `dev.shelfstate.codecorax.com` |
| ValidationMethod / CertificateExport | `DNS` / `DISABLED` |
| Ownership Tags | Environment=dev, ManagedBy=AWS-CDK, Project=ShelfState |
| Resource metadata | ShelfStateStatefulPolicy=destroy-approved (existing dev rollback/delete convention, not live authorization) |
| Output | `CertificateArn: { Value: { Ref: "Certificate" } }`, no Export |

Omitting CertificateAuthorityArn selects public issuance. No additional SAN,
DomainValidationOptions/HostedZoneId, DNS record, custom resource, key-algorithm
override or transparency override is supplied. ACM defaults to RSA_2048 and
enabled transparency; even explicit optional settings are unsupported until
reviewed. There are no cross-region tokens, `crossRegionReferences`, ImportValue
or automatic bridges. The existing topology dependency is ordering only.

Select the existing `certificate` initialization phase explicitly through
`createEnvironmentTopology` or `shelfstateInitializationPhase`, using dev and an
explicit local account input. The one phase populates only edge-certificate;
the other five templates equal the empty baseline. API parent/children remain
separate supported selectors with 1/8 resources. Default dev/prod stay 6/0.
Synthesis neither discovers an account nor reads AWS/SSM/context. The emitted
fixed bootstrap-version parameter remains a future deployment input, not a synth
lookup. No production certificate is implemented.

### Guard and unchanged authority

`bootstrap/edge-certificate-contract.mjs` defines the complete actual-synth
positive contract separately from constructs. The initialization validator accepts
it only under `shelfstate.wp007-edge-certificate-review/v1`, phase `certificate`,
east target and exact execution role. Initial bindings/assets/parameter overrides
are empty; only one reviewed native certificate Add is supported. Replacement,
steady updates, guessed physical bindings and alternate schemas cannot bypass it.
Every envelope/property/tag/output is closed under newly consistent review pins.
`validateLocalCertificateAssembly` is isolated from normal foundation and release
acceptance, which continue to reject all resource-bearing assemblies.

`bootstrap/certificate-assembly-adapter.mjs` closes the certificate phase's
actual-assembly review gap without adding an execution path. It reads the raw
pinned-CDK output directory through the existing bounded assembly reader,
requires the exact 22-member / six-stack assembly, verifies every raw member
identity, and accepts only the certificate stack's one reviewed resource. The
manifest, six templates, template-only asset manifests, bootstrap/role/region
bindings and an independently pinned credential-free/no-lookup synthesis-context
record are carried into canonical
`shelfstate.wp007-certificate-assembly-review-package/v1` bytes. The package is
explicitly `NON_EXECUTABLE_REVIEW_MATERIAL` with `executionAuthorized: false`.
Candidate files cannot supply trusted target pins: extra assembly members fail,
and the target digest is supplied separately and rebound into the package.

For the actual certificate review schema, `initialization-guard.mjs` now consumes
that self-contained review package instead of the historical stack/account
projection. It rehashes the raw manifest, templates, assets, assembly inventory
and context record, re-applies the complete certificate contract, and requires
the package target/template to match the independently pinned initialization
approval. This is certificate-only compatibility, not a generic cloud-assembly
adapter. It creates no change set, performs no AWS call, and does not alter the
ordinary resource-empty release controller.

### Certificate change-set review binding

`bootstrap/certificate-change-set-review.mjs` is the next local-only boundary
between the accepted certificate assembly package and a proposed initialization
change set. It requires the independently supplied assembly-package digest and a
separately supplied target digest, derives the unique `wp007-<sha256>` name from
the exact account/phase/region/stack/role/template/parameter identities, and then
reuses `initialization-guard.mjs` to require one `Add` of the exact native
certificate with no pre-existing physical resource.

The canonical proposal closes the CreateChangeSet and DescribeChangeSet
projections: `CREATE`, exact east stack and execution role, reviewed template,
no runtime parameter overrides, capabilities, nested stacks, imports or
notifications, complete pagination, and `CREATE_COMPLETE` / `AVAILABLE`. The
rollback contract is explicit: `OnStackFailure=ROLLBACK`, no rollback triggers
or monitoring interval, `DisableRollback` **must be omitted** from a future
ExecuteChangeSet request, and `RetainExceptOnCreate=false`. Because CloudFormation
does not permit ExecuteChangeSet `DisableRollback` when CreateChangeSet supplied
`OnStackFailure`, the package does not model `DisableRollback=false` as an
equivalent request.

The output is deterministic
`shelfstate.wp007-certificate-change-set-review-package/v1` material with both
CreateChangeSet and ExecuteChangeSet authority set to `false`. Raw assembly-review
and proposal bytes remain identity-bound. Candidate proposal bytes cannot carry
their own approval or trust fields because every accepted object has an exact
closed schema. Preparation and execution remain separately authorized future
operations; this adapter has no AWS SDK, credential, subprocess, request or
execution path.

Locally supplied DescribeChangeSet/template hashes are test data only. The
package explicitly leaves AWS-response authenticity, actual-request
correspondence, stored-template readback, physical-resource state and effective
IAM permissions unresolved. Those facts require authenticated service readback
under a future authorization. This slice does not make resource-bearing
assemblies acceptable to the ordinary release controller and is **NOT DEPLOYMENT
READY**.

### Certificate change-set preparation operator

`bootstrap/certificate-change-set-preparation.mjs` binds the accepted assembly
package and independently pinned change-set target to a future preparation-side
operation. It constructs one exact inline-template `CREATE` request for the east
certificate stack, its reviewed execution role and deterministic change-set
name. The request has no parameter overrides, capabilities, notifications,
nested stacks, imports, drift mode or validation bypass; it supplies the three
ownership tags, `OnStackFailure=ROLLBACK` and the explicit empty rollback
monitoring/trigger configuration. The reviewed template must fit the 51,200-byte
inline limit. No S3 publication path or mutable template URL is introduced.

The operator requires an injected transport. Before CreateChangeSet it obtains
`GetCallerIdentity` and requires the exact account and reviewed CDK deploy-role
identity derived from the canonical assembly. It then submits once, performs
bounded status polling and explicit `NextToken` pagination, reads the original
template, exact stack and stack resources, and stops at `CREATE_COMPLETE` /
`AVAILABLE` with the stack still `REVIEW_IN_PROGRESS`. It never exposes or calls
ExecuteChangeSet. Failure, timeout, wrong identity, unsupported option, response
substitution, extra change or physical resource fails closed without automatic
cleanup, retry or authority broadening.

When a call has already produced evidence and preparation then fails, the thrown
error retains the bounded raw transcript as a non-enumerable recovery property;
it is not added to the error message or routine log representation. A future
authorized caller must persist that private transcript before deciding any
cleanup action. A transport failure also retains a separate non-enumerable
failed-attempt record containing only the operation, canonical request, sanitized
error code and available request ID; stderr and arbitrary error text are not
retained. This preserves an ambiguous CreateChangeSet attempt for reconciliation.
It is not a success receipt or permission to retry.

Every request and unprojected CLI JSON response is retained with byte length,
SHA-256 and any request ID surfaced by the transport. The preparation receipt
also records each request/response sequence and the provenance of the normalized
proposal passed to the existing canonical review adapter. DescribeChangeSet does
not define `Replacement` for an `Add`; when it is absent, the receipt explicitly
records `DERIVED_FALSE_FOR_ADD_WITHOUT_PRIOR_RESOURCE` while preserving the raw
response. Change-set type and empty parameter overrides come from the submitted
request; execution role comes from DescribeStacks. These mappings do not relax
`certificate-change-set-review.mjs`.

GetTemplate must expose the `Original` template. If the transport preserves it
as a string, the operator requires exact submitted bytes. Standard AWS CLI uses
botocore's CloudFormation response customization to JSON-decode a JSON template
before formatting its output; for that documented shape, the operator requires
canonical equality to the reviewed template and records
`AWS_CLI_JSON_DECODED_CANONICAL_TEMPLATE_EQUIVALENCE`. The receipt then states
`AWS_CLI_GET_TEMPLATE_EXACT_BYTES_UNAVAILABLE`; this is semantic correspondence,
not service-held byte proof, and the adapter's stored-template limitation remains
open. Standard successful AWS CLI JSON also does not guarantee a service request
ID; the receipt preserves IDs when exposed and states the limitation when they
are unavailable. Private live receipts must remain outside Git.

`bootstrap/aws-cloudformation-cli.mjs` is the only concrete transport in this
slice. It has a closed operation inventory (STS caller identity plus create and
the four preparation readbacks), uses a private temporary JSON input file,
explicit `us-east-1`, no shell, disabled paging/prompt/configured endpoint
overrides and bounded process/socket timeouts. It has no ExecuteChangeSet
operation and performs nothing on import. Caller validation limits identity
substitution but does not prove the role's effective permissions or installed
window cap.

Local tests use an injected fixture transport and therefore establish only
request construction, sequencing, normalization, failure handling and receipt
validation. A future live preparation needs separate human authorization,
effective bootstrap/execution/caller policy verification, a private receipt
location, and an explicit failure/cleanup procedure because CreateChangeSet for
a new stack creates a `REVIEW_IN_PROGRESS` stack object. Execution remains a
later, distinct human decision. This operator is **NOT DEPLOYMENT READY**.

No IAM policy/action inventory/composition changes. Existing initialization has
RequestCertificate, AddTagsToCertificate, DescribeCertificate,
ListTagsForCertificate and DeleteCertificate. Requests are constrained to the
exact domain, public/DNS/non-exportable/east posture and ownership tags. Initial
creation-tagging/read/delete still has the previously accepted generated-ID
residual reach, not an ownership-isolation guarantee. No provider call is guessed.
Steady mode removes RequestCertificate and uses the verified exact certificate ID
for existing read/update/tag/delete actions. Neither full certificate composition
contains any Route 53 authority. The historical bounded-pattern candidate is not
installed or selected by this slice.

### Pending identity, DNS handoff and remaining live gates

The stable `Certificate` logical ID and local Ref output prepare explicit ARN
handoff, not a promise that an incomplete stack exposes either value. Future live
work must establish an authentic account/east/exact-stack-to-certificate binding,
recover the ARN while pending through an actually supported readback mechanism,
then describe that exact certificate and obtain the returned validation CNAME.
No broad ListCertificates fallback, name guessing or fabricated ARN/CNAME is used.

Separately authorized DNS work must validate the returned exact certificate/name,
normalized CNAME name/value and approved public-zone correspondence, authorize
only that exact record, publish/read back, retain it for renewal, then remove
temporary write authority. IAM does not constrain the record value. No standing
`_*.dev.shelfstate.codecorax.com` grant is introduced. Renewal uses the retained
record; continuing certificate-stack DNS write authority is not required.
CloudFormation may remain CREATE_IN_PROGRESS while validation is pending; actual
pending-ID/CNAME availability and handler timeout must be proven, not inferred
from ACM's validation window. Output availability does not attest issuance.

An issued certificate ARN is later independently verified and supplied explicitly
to edge-delivery, never consumed automatically cross-region. Live principal/stale-
stack containment, handler calls/rollback/propagation, reviewed template fidelity,
DNS timing/collisions/issuance/renewal, CloudTrail and exact-ID closure remain
unproved. Dependency security and proof-only WP-006 hosted acceptance later closed
for M2 without a waiver; bootstrap/deployment authorization remains outstanding.

Cost: local preparation $0; no incremental ACM service charge expected for this
non-exportable public certificate, consistent with the Personal model. No new
hosted zone or DNS resource is created. Revalidate the current service/cost and
live-binding premises before separately authorized deployment.

Primary references: [manual DNS validation without hosted zone](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_certificatemanager.CertificateValidation.html),
[native certificate properties, defaults and ARN Ref](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-certificatemanager-certificate.html).

### Certificate local verification — 2026-10-07

Baseline `1e1cf8a1f98423fc2bd34827f7b8160cfad1cee6`, branch
`codex/wp-006b-workflow-activation`, clean at entry. The prior index's pending
library-api review was superseded by human-accepted review and that commit;
implementation-plan B.2.2 permits reporting lagging evidence, not inventing a
new gate. This task explicitly authorizes only the next local certificate slice.

- Credential-free Node tests: `edge-certificate`, `library-api`,
  `bootstrap-initialization`, `bootstrap-security`, `infrastructure`, and
  `package-boundary` (`checks/*.case.mjs`): **201 passed, 0 failed**. Includes
  **29 new certificate tests**, 37 unchanged API tests, 74 initialization, 44
  bootstrap, 8 infrastructure and 9 package tests. Tests inspect emitted JSON,
  exercise actual app entry, and repin adversarial templates/evidence.
- Affected release suites (`release-control-implementation`, `workflow-activation`,
  `controller-provenance`, `runtime-target`, `offline-synthesis`): **237 passed,
  0 failed, 2 existing Windows real-symlink skips**. Mocked classification tests
  remain mandatory/passing. Combined affected V4 total: **438 passed / 2 skips**.
- CI-policy and WP-001 isolation: **22 passed**, including all six WP-001 cases.
  Normal dev/prod: **6 stacks / 0 resources**; API parent/children: **1 / 8**;
  certificate: **1 resource** and five unchanged empty templates. No general
  resource-bearing release support, policy expansion or dependency change.
- Existing policy-size assertions pass; policy/composition bytes are unchanged,
  so a new composition-size exercise is not required. Tracked credential tripwire,
  explicit changed/new-file credential/private-binding and whitespace checks,
  and `git diff --check` pass. The private-binding scan permits only the explicit
  `ZTESTONLY` synthetic test ARN. No private handoff is read. All 11 pending paths
  classify V4-only, nothing staged. V3 source and existing publication each remain
  **42 files**, digest
  `a4b25c4da79431dedb37a1213d74bac55d8df42e86eecac296a7d88c06cd8caa`.
- The recorded audit failure stays unresolved/unsuppressed; no upstream refresh,
  audit rerun, dependency remediation or V4 waiver. No AWS authentication/API call,
  DNS/public-DNS query, live mutation, OIDC, workflow activation, bootstrap,
  deployment, stage, commit or push. Public documentation reads only.

## WP-007 static edge-delivery local slice

**Locally prepared, independently closed and committed at
`904cd4715862661ed7afba806c88e138d5996e3a` — NOT DEPLOYMENT READY.** The supplied
focused independent closure resolved the prior documentation-only R1; no
implementation/security defect was found. This
adds only `edge-static` in the west `edge-delivery` stack. Normal dev/prod synth
still means six empty stacks. API parent/children and east certificate selectors
are unchanged. This is not a resource-bearing release-workflow authorization.

Exactly five native resources are supported:

| Logical ID | Resource and constraint |
|---|---|
| `StaticBucket` | S3, exact account-bound dev name, all four public-access blocks, BucketOwnerEnforced (no ACLs), AES256 SSE-S3, Retain on deletion/replacement; no website, KMS, versioning, expiry or auto-delete helper. |
| `OriginAccessControl` | S3 origin type; `always` SigV4 signing. No OAI. |
| `ResponseHeadersPolicy` | Custom initial static-proof security headers and viewer `Cache-Control: no-cache`; no CORS, analytics or header-removal behavior. |
| `Distribution` | One regional private S3 REST origin, one default GET/HEAD behavior, HTTPS redirect, TLSv1.2_2021/SNI, exact dev alias, explicit east certificate binding; index.html root. No API, functions, WAF, logs, custom errors, shield or DNS. Pay-as-you-go, no subscription configuration. |
| `StaticBucketPolicy` | Only Allow is CloudFront service `s3:GetObject` on this bucket's objects, conditioned on this distribution's native Ref-derived ARN. Separate all-principal Deny covers insecure bucket/object transport. Policy deletes normally; retained bucket stays blocked/private. |

Native intrinsic references bind bucket/OAC/header policy/distribution. In
particular the distribution ID need not be guessed to construct the bucket
grant. Distribution creation precedes its exact-ARN bucket policy; live origin
access must be checked after policy propagation. There is deliberately no reverse
dependency cycle or publication resource. A retained bucket may survive failed
creation/rollback; status alone never proves cleanup or authorizes reuse/deletion.

### Explicit certificate handoff and local selector

The existing explicit literal certificate-ARN review model is carried into the
actual phase as the only `initializationBindings` member, `certificateArn`.
It must be a same-account `us-east-1` ACM certificate ARN, and the template must
match the independently pinned binding exactly. Only this phase accepts that
option. The app's local context counterpart is `shelfstateInitializationBindings`
(object), alongside `shelfstateInitializationPhase: edge-static`. Tests use only
the documentation account and synthetic certificate ID. There is no environment
discovery, private-handoff read, ARN guess, automatic east-stack consumption,
`crossRegionReferences`, import/export, SSM certificate bridge or custom resource.

A well-formed ARN does **not** prove issuance, domain coverage, ownership, AWS
physical origin or readback freshness. Those must be authenticated under future
live authorization. Candidate-generated replacement pins are not trusted review.

### Policies and inert content

Architecture §§16.3–16.4 and WP-007 require explicit caching and initial custom
security headers, but do not select custom cache/origin-request policies. The
historical bounded-initialization fixture's three policy placeholders were not
deployable choices. For this single inert page, AWS managed **CachingDisabled**
(`4135ea2d-6df8-44a3-9df3-4b5a84be39ad`) has min/default/max TTL zero and needs no
new generated cache policy. No origin-request policy is needed: no cookies,
query forwarding, authentication or CORS flow exists. Managed CachingOptimized's
positive minimum TTL would defeat no-cache revalidation; managed
UseOriginCacheControlHeaders introduces unnecessary host/header/cookie forwarding.
Neither is selected. Hashed immutable-asset caching remains future work.

The custom response-header policy is required by the architecture: static-only
CSP `default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
nosniff, DENY framing, no-referrer, and one-year HSTS without includeSubdomains or
preload. Each overrides origin values. Viewer `Cache-Control: no-cache` forces
entry revalidation independently of future S3 publication metadata; this does
not enable edge caching. Final WP-026 CSP/CORS/API/auth qualification is not
claimed or implemented. Changes needed for the real application require review.

The WP-007/M1 inert-origin proof permits the minimal local
`frontend/static-proof/index.html`: only a non-production heading/paragraph,
title/charset/viewport, no scripts/styles/assets/data/manifest/worker/V3 shell.
Existing build/publication scripts are untouched. The page is **not** uploaded,
included as a CDK deployment asset, or copied by the toolchain-boundary build.
Future publication needs separate bounded authorization and byte/content-type
verification; until then the bucket has no page and no successful HTTP claim.

### Guard and authority effects

`static-edge-contract.mjs` is an independent positive contract for all five
complete emitted resource structures, topology/bootstrap envelope, tags,
intrinsics, headers, retention and bucket policy. Unknown behavior-bearing fields
are rejected, including under freshly consistent template/assembly/change-set/
review hashes. The separate `shelfstate.wp007-static-edge-review/v1` schema accepts
only this phase, exact target/role, reviewed certificate binding, no parameters or
external assets and five unconditional Add operations. The old synthetic `edge`
schema is unchanged; it cannot accept the actual static representation. Ordinary
foundation/release validation still rejects the resource-bearing assembly.

`edge-static` initialization selects **only** the already-adjudicated distribution,
OAC and response-headers action classes. No cache-policy/origin-request-policy,
API, Lambda, IAM runtime, log, Route53 or ACM authority remains in this phase's
composition. Exact named S3 bucket/configuration and existing regional template/
bootstrap support are retained. No object publication/deletion is granted.
Two-west attachment shape remains, with no new permission class. Completed prior
phase grants cannot be unioned into this isolated static window. After verified
physical readback, all three generated classes narrow to exact IDs and creation
grants (including bucket creation) disappear. Existing caller-window cap, terminal
closure, retained-remnant and replacement rules still apply; no executor exists.

Temporary creation `Resource: *`, same-account generated-ID OAC/header lifecycle
wildcards, distribution tag/relabel reach and exact named bucket-policy control
remain residual authority, **not** IAM-enforced unrelated-resource isolation.
The accepted single-stack reviewed-template window and narrower-principal/stale-
stack containment must be proven live before installation. PutBucketPolicy IAM
cannot enforce policy contents; the positive template contract and authenticated
execution provenance are essential. A missing handler action must stop for review,
never be granted automatically. Exact IDs do not make policy contents harmless.

Remaining live proofs: independently issued/correct east certificate; actual
provider calls/tag timing, OAC signing/private-origin denial and HTTPS headers;
source/stored-template/execution-role/physical-ID authenticity; live principal
containment, propagation, stabilization/rollback/retained remnants and CloudTrail;
exact-ID closure; separately authorized DNS/publication/browser proof. Dependency
security and proof-only WP-006 hosted acceptance later closed for M2. Bootstrap/
deployment authorization has not occurred. No V4 waiver or WP-007 live acceptance
is implied by that closure.

Cost: local preparation adds no AWS charge. Proposed S3/CloudFront pay-as-you-go
usage is already within the Personal architecture; no new fixed-price service,
customer KMS key, logging pipeline or flat-rate plan. CachingDisabled can increase
S3 reads relative to caching; acceptable only for the bounded inert proof, not a
final cost/performance claim. Revalidate usage/current pricing and the Personal
model at the separately authorized live gate; no promotional free-tier premise.

Primary references: [S3/OAC signing and exact-distribution bucket grant](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html),
[managed cache policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html),
[native default behavior](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-cloudfront-distribution-defaultcachebehavior.html),
[native security headers](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-cloudfront-responseheaderspolicy-securityheadersconfig.html).

### Static edge local verification — 2026-10-07

Snapshot reconciliation (2026-10-09): the dated implementation record below
predates the supplied focused independent closure and commit
`904cd4715862661ed7afba806c88e138d5996e3a`. Its prior uncommitted/dependency-
blocked wording is historical. The local dependency remediation is recorded in
the separate section above and does not authorize API routing or live work.

Starting branch `codex/wp-006b-workflow-activation`, HEAD
`522d72578f4d0aa3dc027fb57bf6842db662d891`, clean at entry. Gate check: the index's
pending certificate review was superseded by human-accepted independent review
and that commit; no additional prerequisite blocks this explicitly authorized
local slice. This evidence is implementation-agent verification, not approval.

- Credential-free `node --test` covering `static-edge`, `edge-certificate`,
  `library-api`, `bootstrap-initialization`, `bootstrap-security`, `infrastructure`
  and `package-boundary` (`checks/*.case.mjs`): **277 passed, 0 failed**. Static
  suite independently rerun: **73/73**. The initialization fixture remains
  historical-only; the new phase rejects that schema and uses the actual native
  template. All prior synthetic positive/negative cases are preserved.
- Attacks repin template/assembly/change-set/review bytes before rejection:
  public ACL/policy/access blocks, website/custom/unrelated origins, OAC/OAI/
  signing, bucket principal/action/resource/condition, certificate/alias/HTTPS/
  methods, extra origins/behaviors, edge functions, custom helpers/deployment/
  auto-delete, KMS, cross-region indirection, extra policies, caching/CORS/header
  weakening, retention and resource substitution. Recursive missing/unknown-key
  checks cover the entire actual template, not only a blacklist. A candidate's
  self-repinned certificate substitution fails against the original trusted pin;
  a genuinely new reviewed ARN still needs live provenance.
- Affected release suites (`release-control-implementation`, `workflow-activation`,
  `controller-provenance`, `runtime-target`, `offline-synthesis`): **237 passed,
  0 failed, 2 existing Windows real-symlink skips**. Combined affected V4:
  **514 passed / 2 skips**. Normal release acceptance rejects static resources.
- Root CI-policy and WP-001 deployment-isolation suites: **22 passed**, including
  all six WP-001 cases. No unrelated application suite was rerun.
- Static phase: **6 stacks / 5 resources**, five other stacks unchanged/empty.
  Prior default dev/prod: **6 / 0 each**; API parent/children: **1 / 8**; east
  certificate: **1**. All **30** prior phase templates (five selections × six
  stacks) match their captured pre-edit JSON-content SHA-256 identities exactly.
- Conservative 64-character generated-ID bindings: static execution attachments
  are **1,101 / 1,792** characters in initialization and **883 / 1,173** in steady
  mode; caller-cap maximum **4,029**, all below 6,144. Existing composition-size
  checks pass. No approved policy JSON/action class/attachment topology is expanded.
- Tracked credential tripwire, explicit changed/new-file credential/new-binding
  scan (distinguishing pre-existing synthetic fixtures), whitespace scan and
  `git diff --check`: passed. No private handoff read. Dependency configuration,
  lockfile, existing build/publication, workflows and V3 runtime unchanged.
  Package script change only adds the static suite to `infra:test`.
- All **14** pending paths are V4-owned under WP-001; nothing staged/committed.
  V3 source and existing publication each remain **42 files**, digest
  `a4b25c4da79431dedb37a1213d74bac55d8df42e86eecac296a7d88c06cd8caa`.
- Known dependency-security audit remains unresolved/failing and unsuppressed;
  no new audit/upstream freshness claim, dependency change or V4 waiver. No AWS
  credentials, authentication, account API call, live CDK, DNS query, publication,
  workflow activation, OIDC, bootstrap, deployment, remote mutation, commit or push.

## WP-007 API-origin routing local slice

**Independently approved local candidate — NOT DEPLOYMENT READY.** Starting
checkpoint: branch `codex/wp-006b-workflow-activation`, HEAD
`de0eba0bba1385447a8236bd47171f1ee7bcaef3`, clean worktree/empty index/no
untracked files. This separately authorized slice adds only the explicit local
`edge-routing` selector and its positive contract. It does not modify the
accepted `edge-static` selector or claim that any prior edge/API resource exists.

The selected template is a prospective initial combined edge stack. It preserves
the same five logical resources (`StaticBucket`, `OriginAccessControl`,
`ResponseHeadersPolicy`, `Distribution`, `StaticBucketPolicy`) and changes only
the distribution relative to the static representation:

- A second origin, ID `api`, uses the explicit API-ID binding at
  `<apiId>.execute-api.us-west-2.amazonaws.com`. It is a custom origin with
  `https-only` origin communication and only `TLSv1.2` enabled.
- Exactly one ordered behavior matches `/api/*`, targets `api`, accepts/caches
  only GET/HEAD, and requires HTTPS from viewers. It attaches AWS managed
  CachingDisabled (`4135ea2d-6df8-44a3-9df3-4b5a84be39ad`) and managed
  AllViewerExceptHostHeader (`b689b0a8-53d0-40ab-baf2-68738e2966ac`). The latter
  removes the viewer `Host` and lets CloudFront send the API origin domain.
- The API behavior deliberately has no response-headers policy, so it cannot
  overwrite the health handler's `Cache-Control: no-store`. It has no origin
  path, custom headers, CORS, WAF, edge functions, DNS or publication helper.

AWS documents CachingDisabled as min/default/max TTL zero and describes
AllViewerExceptHostHeader as intended for API Gateway, replacing the viewer Host
with the origin domain. CloudFormation documents `https-only` for origin/viewer
communication, the GET/HEAD allowed-method set, and explicit origin SSL protocols.
Primary references: [managed cache policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html),
[managed origin-request policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html),
[cache behavior](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-cloudfront-distribution-cachebehavior.html),
[custom origin](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-cloudfront-distribution-customoriginconfig.html).

### Binding, contract and authority boundaries

`shelfstateInitializationPhase: edge-routing` requires exactly
`shelfstateInitializationBindings: { certificateArn, apiId }`. The certificate
must have the same-account east ACM ARN shape; the API ID must be lower-case
alphanumeric and at most 32 characters. These are representation checks only.
They do not establish issuance, domain coverage, API ownership, physical ID,
deployment history or readback freshness. Candidate self-repinning cannot change
an independently trusted review pin.

`edge-routing-contract.mjs` first requires the original exact `edge-routing`
phase marker and exact API origin/behavior, then projects out only the routing
additions, restores the `edge-static` phase marker, and
passes the remainder through the unchanged complete static contract. Unknown or
missing keys, alternate intrinsics, wrong regions/TLS/path/policies/methods,
Host forwarding, extra origins/behaviors, origin path/custom headers, response
header overrides and function associations fail even under freshly consistent
template/assembly/change-set/review hashes. Ordinary foundation/release guards
still reject this resource-bearing assembly.

The phase selects exactly the same three generated CloudFront action classes
(distribution, OAC, response-headers policy) and same named S3/support statements
as `edge-static`. Initialization/steady policy documents and caller caps are
byte-equivalent; there is no API Gateway/Lambda/IAM/Route 53 authority and no new
service action or attachment. Existing residual initial wildcard/tag reach,
narrower-principal containment, exact-ID narrowing and closure requirements remain.

### Local verification and review — 2026-10-16

- Dedicated routing suite: **42 passed, 0 failed**. Combined infrastructure /
  bootstrap / prior phase suite: **313 passed, 0 failed** under Node 24.13.0 and
  pinned npm 11.6.2. Conservative policy-size checks remain under 6,144 bytes.
- Full `npm run verify`: package **9**, contract **1**, human security **17**,
  release design **17**, release implementation/activation **237 passed with 2
  existing Windows symlink skips**, and infrastructure **313**; synth/preview/
  build passed. Total: **594 passed, 0 failed, 2 platform skips**.
- Routing selector: **6 stacks / 5 resources**, only west `edge-delivery`
  resource-bearing. Default dev/prod stay **6 / 0** each. API parent/children,
  certificate and `edge-static` selectors retain all **36** captured starting
  JSON-content SHA-256 identities. The routing contract proves the static
  projection byte-identical to `edge-static` apart from its phase marker and the
  two explicit routing additions.
- Root regression / CI / WP-001 / V3 isolation: **197 passed, 0 failed**. The
  initial sandboxed run's two temporary-Git permission failures passed when the
  same suite was rerun with local temp-directory access. Tracked-file credential
  tripwire passed. No V3 file changed.
- Fresh registry checks on the unchanged lock: audit found **0 vulnerabilities**;
  **26** packages have verified registry signatures and **9** have verified
  attestations. This does not change the recorded limitation that graph-wide
  attestations are not direct `aws-cdk-lib` provenance evidence.
- Genuine independent review found one fail-closed defect: the static projection
  did not first validate the candidate's original routing phase marker. The
  correction added that assertion and wrong/static/missing-marker adversarial
  tests without changing the template, resource inventory, authority or trust
  boundaries. Focused independent closure returned **A — APPROVE**.

Deferred live proof: authenticate both physical bindings; verify certificate
issuance/domain coverage and the exact API; independently review stored template,
immutable assets, handler/provider call trace and rollback options; prove origin
TLS/Host/path forwarding, uncached health response, direct execute-api safety,
OAC/private S3 behavior, propagation, CloudTrail, containment and exact-ID
closure; separately authorize DNS alias, static publication and browser/V3
service-worker isolation proof. The hosted assembly-reader/controller transition
and four-directory pinned-CLI compatibility evidence later passed in the accepted
M2 proof exercises. Within this dated local routing slice, no AWS authentication/API call,
workflow activation, bootstrap, deployment, publication, DNS mutation, stage,
commit, push or other remote/live mutation occurred.

### WP-006 hosted-proof local amendment — 2026-10-19

PR #10 validation is green, but that run did not execute the manual proof
preparation or retain artifacts. This local, unstaged amendment prepares—not
executes—the remaining hosted compatibility and cross-environment denial evidence.

- The controller uses only the locked `aws-cdk@2.1141.0` binary to read each copied
  baseline/candidate dev/production assembly with `cdk list --app
  <retained-assembly> --no-lookups`. It verifies exactly six stacks, unchanged raw
  assembly inventory/snapshots and unchanged `cdk.context.json`, then stores a
  canonical digest record inside the sealed payload. No synth occurs during these
  reads. The custom schema/minimum-version reader still runs before packing and
  after authenticated transport; no compatibility guard was relaxed.
- After existing hosted artifact/revision/runtime validation, the proof derives and
  controller-pin-validates the fixed opposite environment role. It requests one
  exact-audience environment token in process memory and calls only the fixed
  regional STS `AssumeRoleWithWebIdentity` endpoint. Only an authenticated
  `AccessDenied` continues to the existing positive assumption; success and every
  token, network, parse, redirect or other AWS error fail closed. No token or
  credential reaches a file, artifact, child argument, output or exception body.
- Local adversarial fixtures are mechanism coverage, not evidence of an issued
  GitHub token, STS denial, protected-environment behavior, CloudTrail event or
  session lifetime. Those remain separately authorized hosted acceptance gates.

Development run `39291958886/1` later exercised those mechanisms successfully at
merged main `17f461ea9bba7318b2f2c8c54220ed573fb2d6c6`, but independent review rejected
the proof for privacy: public runner preambles exposed the private account binding
and dev-role ARN before the later credentials-action mask. No credential/token was
exposed, and retained hosted artifacts/payload files contained no matching private
binding. At that point production remained paused. The bounded preventive amendment uses exact
GitHub Environment secrets only at the three controller steps, rejects variable/
command/output exposure paths, and treats absence of same-name repository or
organization secrets as a separately read-back hosted configuration condition. It
therefore required a fresh amended-main dev proof plus post-run provider comparison after
separately authorized secret migration. Existing-log deletion is separate cleanup,
not part of the local remediation.

The privacy-remediated implementation was subsequently merged as M2
`9acb1ac9a3c89d8383ddc9d228a7b5b9ce021b4b`. Exact-main validation
`39459972062/1`, fresh development proof `39591973383/1`, production rejection
`39638752827/1` and deliberately approved production proof `39695069470/1` were
independently adjudicated **ACCEPTED WITH NONBLOCKING LIMITATIONS**. The retained
hashes, evidence locations, retention dates and limitations are indexed in
[`docs/V4_OIDC_RELEASE_CHECKPOINT.md` §9.16](../../docs/V4_OIDC_RELEASE_CHECKPOINT.md#916-wp-006b-hosted-proof-acceptance--2026-10-22). Rejection satisfied the contract's
reject/cancel alternative; no additional cancellation or proof run is required for
M2. This proof-only closure leaves both roles permission-inert and authorizes no
resource-bearing release, bootstrap, deployment, publication, DNS or other WP-007
live action. Historical run `39291958886/1` is superseded as proof evidence; its
exposed-log deletion remains a separately authorized incident-cleanup mutation.
