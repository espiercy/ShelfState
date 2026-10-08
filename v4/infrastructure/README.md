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

Still required: independent slice review; dependency-security resolution (no V4
waiver); WP-006 hosted acceptance; bootstrap/live authorization; boundary policy
installation/readback; narrower-principal/stale-stack closure; actual handler/tag
calls, permissions/propagation/rollback; parent ID and change-set authenticity;
artifact/template correspondence; direct HTTP/invocation/logging/no-store smoke;
CloudTrail and exact-ID closure. No upstream patch availability or green audit is
claimed: the unchanged dependency graph retains its recorded failing audit.

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
unproved. Dependency security, WP-006 hosted acceptance and bootstrap/deployment
authorization remain outstanding. No V4 waiver or successful audit is claimed.

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

**Locally prepared / full review C — REMEDIATION REQUIRED; documentation R1 under
focused remediation — NOT DEPLOYMENT READY.** No implementation/security defect
was found; the 14-path package remains uncommitted. This
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
security and WP-006 hosted acceptance remain unresolved. Bootstrap/deployment
authorization has not occurred. No V4 waiver is implied by local success.

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
