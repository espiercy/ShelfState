# WP-007 bounded initialization — local security preparation

Snapshot notice: the preparation and R1 records below are historical. The full
13-path package subsequently received human approval after independent R1 closure
and was committed as `dd1dc2b6e0b7a8d0bac0eb3d8a2cc7cbee22488a`. The separately
authorized local [library-api slice](../README.md#wp-007-library-api-local-slice)
extends the existing API phases to an explicitly versioned actual-synth contract:
one parent resource, then eight total health resources at `GET /api/v1/health`.
The original synthetic `/health` fixtures remain historical guard tests, not the
application endpoint. That slice subsequently received human-accepted independent
**B — APPROVE WITH NONBLOCKING NOTES** and was committed as
`1e1cf8a1f98423fc2bd34827f7b8160cfad1cee6`. The separately authorized local
[edge-certificate slice](../README.md#wp-007-edge-certificate-local-slice) now
extends the certificate phase with an explicit actual-synth contract, ownership
tags and a local ARN output, without DNS automation or policy expansion. That
certificate slice received human-accepted independent **B — APPROVE WITH
NONBLOCKING NOTES** and was committed at
`522d72578f4d0aa3dc027fb57bf6842db662d891`. Its evidence-authentication and
pending-validation/provider notes remain deferred live-proof gates. The local
[static-edge slice](../README.md#wp-007-static-edge-delivery-local-slice)
subsequently received the supplied focused independent closure and was committed
at `904cd4715862661ed7afba806c88e138d5996e3a`; no implementation/security defect
was found. The dependency remediation was independently approved and committed
at `de0eba0bba1385447a8236bd47171f1ee7bcaef3`; at that dated point hosted
acceptance remained open. It later closed for exact M2 through validation and the
accepted WP-006B proof preparations.
The separately authorized local API-origin routing candidate is described below.
After narrow phase-marker remediation, focused independent closure returned
**A — APPROVE**. At this historical local checkpoint none of those acceptances
closed hosted gates. Later proof-only WP-006B acceptance closes only that named M2
gate; bootstrap authorization, physical-ID, DNS and deployment gates remain. The
records below remain dated synthetic-preparation history, not the new actual
certificate/static contracts; all preparation remains **NOT DEPLOYMENT READY**.

Status: **LOCAL PREPARATION / REVIEWS CLOSED FOR COMMITTED SLICES AND ROUTING CANDIDATE / NOT DEPLOYMENT READY**.

Authority: human request “Implement the local-only WP-007 bounded-initialization authority package,” following the CloudFormation-native design adjudication. Starting branch `codex/wp-006b-workflow-activation`, HEAD `2f81271a4e968638bfa43da2cd4c4849dd3bf768`, clean. No commit/live use is authorized. These functions are pure models and evidence validators, not an AWS executor or proof of authentic AWS responses.

## Selected design and artifact boundaries

CloudFormation owns resources from creation. Temporary non-exact lifecycle reach is accepted as a design residual, not equivalent to exact-resource IAM isolation. Direct create/import and no-rollback are separately reviewed recovery alternatives, never automatic fallbacks. Historical candidates remain in the earlier README/model snapshots; the selected fields in `pending-decisions.json` supersede their undecided status.

`initialization.mjs` provides eight action-class inventories, generated authority fragments, full phase execution-policy compositions, caller window caps and closure decisions. `executionPolicies` REPLACES the legacy CloudFront/API/ACM statements; it never unions wildcard creation with exact steady state. Completed regional phases may be retained only with exact steady-state grants. The two-west/one-east managed attachment structure remains. Actual bound policy size and complete effective policy/trust readback remain prerequisites to live use.

Named S3, health Lambda/role/log and bootstrap-support statements retain their existing boundaries. In steady mode their creation actions are also removed. Certificate compositions have no Route 53 authority, including no automatic publication. The existing JSON execution files remain a historical/catalog input, not a policy installation instruction.

## Single-stack and protected change-set path

One capability stack may initialize at a time, across both regions. The existing regional execution roles/topology remain unchanged. The proposed window requires independently administered role-side caps on both deployment roles, plus complete review of every other narrower principal able to operate any stack associated with the expanded execution role. An optional session policy, caller promise, or six-stack allowlist is insufficient.

1. Before expansion, verify both deployment roles' complete effective policies, attached-stack inventory, narrower-principal closure, no concurrent/pending unreviewed operation and the CloudFormation-only execution trust. The opposite regional deployment role is denied all CloudFormation/PassRole activity. Existing AccountAdmin/Operator/Recovery models deny deployment/role use; that is local model evidence, not live account-wide inventory. Account-wide administrators are excluded from the narrower-principal claim because they already possess greater authority.
2. In **prepare**, replace the ordinary deployment allow with `callerWindowCap`; explicitly deny operations outside the exact stack, retaining only exact toolkit/support reads. Permit creation of one uniquely named change set with the exact execution role; deny ExecuteChangeSet. The cap is installed on the role, not supplied voluntarily by its caller. Do not install execution expansion until closure/readback is established.
3. Independently inspect the prepared change set, complete changes and physical mappings, stored template, parameters, assembly and immutable/version-bound assets. Obtain the approved digest of this whole review package outside the candidate. A candidate cannot supply its own trusted pin. Only after validation replace prepare authority with **execute** authority.
4. Execute state explicitly denies CreateChangeSet, DeleteChangeSet, direct update/create/delete/repair paths and other change-set names. Execute uses the inspected immutable change-set ID. The same name cannot be deleted/recreated by this principal. A distinct operator capable of replacing it is a closure failure. The existing release controller/workflows do not perform this protocol. The local certificate-only `certificate-change-set-review.mjs` adapter now binds the accepted assembly, proposed request/readback, exact change-set ID and rollback contract (`OnStackFailure=ROLLBACK`, empty rollback triggers, future `DisableRollback` omission and `RetainExceptOnCreate=false`) without granting create or execute authority. It does not authenticate AWS evidence or an actual request; a future separately authorized live adapter/operator must establish that correspondence before authority changes. Template/change-set identity alone does not establish rollback mode (independent-review note N2). No executor is introduced here.
5. Only after terminal success and complete resource binding narrow execution policies. Read back effective narrowing, close the caller window, and only then consider restoring ordinary caller permissions under the authorized procedure. No next stack while the expanded role or a prior operation remains active.

The cap includes explicit denies that defeat the old six-stack allow for mutation elsewhere. It does not prove absence of another unexamined principal or associated stack. If existing topology cannot close that path, STOP before live expansion; do not silently exempt a narrower operator. Likewise the local evidence validator is not an authentication mechanism.

The pinned CDK general deployment path is not declared compatible with this two-stage authorization switch. Future tooling must stop between non-executing preparation and execution; direct/hotswap/repair fallback remains prohibited. No workflow activation is needed to prepare/test these controls locally.

## Action inventory and residuals

The executable inventory is `ACTION_INVENTORY`; all rows separate create, read/stabilization, rollback, exact steady update, replacement and outstanding proof.

| Class | Minimum proposed initialization lifecycle | Residual / proof |
|---|---|---|
| Distribution | Create/tag; Get/GetConfig/tag read; Update to disable; Delete | Tag-on-create authorization and stabilization sequence need handler proof. Temporary tagging can label an unrelated distribution; tests expose this rather than claiming tag isolation. |
| OAC | Create; Get/GetConfig; Delete | Untaggable account/type reach; ETag/dependency teardown. No initial Update merely for convenience. |
| Cache policy | Create; Get/GetConfig; Delete | Same untaggable reach; detach/delete ordering. |
| Origin-request policy | Create; Get/GetConfig; Delete | Same; include only if the reviewed resource inventory needs it. |
| Response-headers policy | Create; Get/GetConfig; Delete | Same; reviewed exact configuration/digest required. |
| HTTP API parent | POST `/apis` with exact name/request tags; GET/DELETE generated parent pattern | IAM wildcard can match descendant paths too. Parent initialization is not unrelated-API isolation. Unknown tag endpoint/PATCH requirements are NOT granted speculatively. |
| HTTP API children | POST selected collections under exact API; GET/DELETE integration/route patterns and fixed stage | No REST tag inheritance assumption. No cross-API wildcard. Child tag/PATCH requirements need evidence. |
| ACM | Exact-domain/DNS/public/non-exportable east request; creation tagging; Describe/tag read/Delete | Initial tagging/read/delete spans certificate IDs. No automatic DNS. Handler timing/pending-ID proof remains outstanding. |

No account-wide resource listing is added to find resources by name. No initial OAC/policy Update, arbitrary API PATCH or tag/untag endpoint is added solely because it might help. Handler-version-specific requirements must be established before policy installation; a material new action is a stop/review, not an automatic addition. The policy models are action-class preparation, not a certified complete handler permission trace.

Initial distribution/certificate lifecycle reads and rollback require the reviewed resource tags as defense in depth. This is not an ownership guarantee: the creation-tagging residual could relabel another resource, and other ShelfState/dev resources may already share the tags. The negative tests explicitly distinguish missing-tag denial from that remaining reach; untaggable policies/OAC have no invented tag condition. Tag availability at each handler call remains a live-proof item.

## Template and artifact guard

Current actual-synth contracts now also include the separately authorized local
`edge-static` phase: [static edge representation, policies and limitations](../README.md#wp-007-static-edge-delivery-local-slice).
It is a strict five-resource static-only subset with its own review schema, not a
relaxation of the historical synthetic `edge` placeholder below. Only distribution,
OAC and response-header generated authority is selected; no custom cache/origin
request policy, DNS, API or certificate authority is added. Exact named bucket
control/support remains. No prior-phase authority may be retained in this isolated
static window. The supplied reviewed east certificate ARN is locally bound but
does not establish live provenance. All original live-containment/closure gates
and **NOT DEPLOYMENT READY** status remain.

The separately selected local `edge-routing` phase extends that same prospective
initial five-resource edge template with one API custom origin and one ordered
`/api/*` behavior. It does not model a steady update to, or prove the existence
of, a previously deployed static distribution. Its only external bindings are
the reviewed certificate ARN and API ID; their format is checked, but authentic
physical-resource provenance, certificate state/domain coverage and API ownership
remain live readback gates. The positive routing contract removes only the API
origin/behavior and restores the `edge-static` phase marker before requiring the
unchanged complete static contract, then separately requires the exact API
semantics. No logical ID or resource is added.

`edge-routing` selects exactly the same distribution, OAC and response-headers
generated action classes and the same named S3/support authority as `edge-static`.
It adds no API Gateway, Lambda, IAM, Route 53, custom-policy or publication
action. The isolated-window, prepare/execute, exact-ID narrowing and closure
requirements are unchanged. This local representation is not evidence that the
current generic CDK flow can safely perform the future initial transaction.

`initialization-guard.mjs` accepts bounded byte inputs and independently pinned review metadata. It rejects wrong target/role, unexpected logical IDs/types/count, macros at any depth, nested/custom resources, replacement, unapproved relationships, wrong domain, parameters and substituted artifacts/change sets. Historical synthetic contracts remain narrow fixtures, while the API, certificate and edge selectors have separate actual-synth semantic contracts. The certificate schema additionally requires the canonical output of `certificate-assembly-adapter.mjs`; the old stack/account projection is no longer accepted for that schema. This remains a selected-phase validator, not a generalized CloudFormation interpreter or application-stack generator. Synthetic fixtures deliberately are not deployable application templates.

All reviewed bytes/configuration are pinned. R1 remediation additionally compares every accepted resource's complete `Properties` against a positive semantic structure: only object-key order is normalized. Extra/missing fields, nested additions, alternate intrinsics, external specifications and changed values fail even with a separately valid review pin. Only literal top-level description and the fixed template-format version are optional for the historical synthetic schema; each actual-synth contract closes its own complete emitted envelope. This is a fail-closed validator for the explicitly supported WP-007 subsets, **not a complete CloudFormation security verifier or a deployable-template contract**.

| Supported resource | Complete accepted property contract |
|---|---|
| HTTP API parent | Exact `Name` and `ProtocolType` only, in both API phases. No quick-create `Target`/`RouteKey`, OpenAPI `Body` or `BodyS3Location`. |
| Integration / Route / Stage | Exact API `Ref`; exact AWS_PROXY health-Lambda URI, GET `/health` integration join, and auto-deployed `$default` stage respectively. No credentials ARN, request transforms, stage variables or alternate intrinsics. |
| Lambda permission | Exact action, health function, API service principal and reviewed API/source-path join. |
| Distribution | Exact aliases, bound certificate, single bound S3/OAC origin, and default behavior referencing the three approved logical policies. No extra behaviors/origins, edge/function associations, alternate viewer/origin fields or policy references. |
| OAC / cache / origin-request / response-headers policy | Exactly empty `Properties` placeholders in the existing synthetic fixture. No real configuration is yet supported. Their future deployable configurations require separately reviewed complete contracts; this remediation does not select those configurations. |
| ACM certificate | Exact dev hostname, DNS validation and disabled export only. Previously unchecked optional `Tags` are no longer accepted; ownership/tagged deployable representations require explicit review, not arbitrary tags. |
| A / AAAA aliases | Exact name/type/bound zone and native distribution-domain GetAtt/CloudFront hosted-zone target only. |

The certificate assembly input is now the deterministic
`shelfstate.wp007-certificate-assembly-review-package/v1` produced from the
actual pinned-CDK directory, not a candidate-generated identity projection. The
adapter requires the exact 22 raw members, six stacks, manifest/artifact graph,
template-only assets, five empty templates and one exact east certificate
template. It binds the raw-file inventory, manifest/template/asset bytes,
credential-free no-lookup context, account, phase, region, stack and execution
role to a separately supplied trusted target digest. Its status is explicitly
non-executable. This does not claim arbitrary CDK assembly support. Current
zero-resource release guards stay unchanged. Resource-bearing steady updates
remain gated; exact steady IAM is modeled, but no generic update executor is
introduced.

The certificate-only change-set review input is a closed canonical proposal, not
an AWS client response accepted on faith. `certificate-change-set-review.mjs`
requires the independently pinned assembly-package and review-target identities,
reuses the existing certificate initialization validator, and binds the exact
CREATE request projection, complete DescribeChangeSet projection, immutable ID,
template, empty runtime parameters and one certificate Add. Both operation
authority flags remain false. Its explicit rollback projection resolves N2 for
this local representation: failure mode is ROLLBACK, rollback monitoring/triggers
are empty, a future ExecuteChangeSet request must omit DisableRollback and must
set RetainExceptOnCreate false. AWS-response authenticity, actual request
correspondence and stored-template/physical-resource/effective-IAM facts remain
live gates; local fixtures do not prove them.

`certificate-change-set-preparation.mjs` is the bounded integration layer for a
future separately authorized preparation operation. It consumes the same pinned
assembly and target, derives the reviewed CDK deploy caller, constructs the exact
inline-template CREATE request, verifies the east caller identity before
submission, performs bounded polling and complete pagination, and collects
GetTemplate Original, DescribeStacks and DescribeStackResources readback. Raw
request/response JSON, byte digests, sequence and available request IDs remain in
a non-executable receipt; the existing review adapter remains the canonical
normalized validator.

The operator records its few necessary mappings instead of treating projections
as raw service fields. Change-set type and empty parameter overrides are bound to
the submitted request, execution role is read from the prepared stack, and an
absent `Replacement` on the single Add becomes the adapter's `False` only with
explicit `DERIVED_FALSE_FOR_ADD_WITHOUT_PRIOR_RESOURCE` provenance. Exact
GetTemplate string bytes must match the reviewed template. Because standard AWS
CLI JSON-decodes a JSON TemplateBody before output, that documented object shape
instead requires canonical template equality and records that exact service-held
bytes remain unavailable; this does not close the adapter's stored-template
limitation. The AWS CLI transport exposes no ExecuteChangeSet, uses explicit
region/private structured input/no shell/bounded timeouts and cannot run on
import. Local fixture success is not AWS evidence.

Stored-template readback and immutable/version-bound asset verification must occur before the execute grant. The local adapter proves raw synthesized-template-to-manifest/asset correspondence only. A content-hash filename is not immutable S3 storage; existing publisher access can overwrite/delete objects. The execute principal must not be able to replace reviewed asset versions; if this cannot be enforced/read back with the existing publication path, STOP rather than trusting a filename. Authenticated service readback remains a later live-proof obligation, not a fact established by this local package.

## HTTP API and certificate phases

Parent-first native API creation completes, captures its exact ID, then narrows. The child phase retains exact parent permissions for reads/rollback and permits child lifecycle only under that ID. Its change set cannot modify/replace the parent. Integration URI, route target and Lambda invoke SourceArn are validated. Replacing a parent invalidates child bindings and needs separate initialization authorization.

East: exact `dev.shelfstate.codecorax.com`, public, `us-east-1`, DNS, export disabled, no SAN/private CA/HostedZoneId auto-validation. Recover pending certificate ARN from exact stack/logical-resource evidence; independently bind it and describe it to obtain the CNAME. Pending physical-ID availability is an outstanding live proof, not a guarantee. No name-based guessing or broad ListCertificates fallback.

Publish only after separate exact-zone/exact-normalized-CNAME authorization and verification of the ACM-returned value. IAM does not constrain record value. Retain the CNAME for renewal; remove temporary DNS write authority afterward. This package grants no DNS-validation write, standing `_*.dev...` pattern or validation-record deletion. ACM's 72-hour validation timeout does not promise CloudFormation will wait that long; a future bounded procedure must fit actual handler/workflow limits.

## Failure, transition and closure

- Active creation, stabilization, cleanup or rollback: retain required execution authority; block next operations. Human logout/credential expiry does not remove role policies.
- Terminal CREATE_COMPLETE/UPDATE_COMPLETE: verify complete physical IDs and ownership, replace with exact-ID policies, remove unnecessary creation grants, verify effective policy propagation/operation, close window.
- Terminal ROLLBACK_COMPLETE/UPDATE_ROLLBACK_COMPLETE: inspect absence or reviewed remnants, retain exact authority needed for existing resources, then close. Status alone does not prove absence.
- Failed/indeterminate rollback or AccessDenied: STOP for human recovery authorization. No automatic broadening, repair, reprovisioning, direct import or no-rollback fallback.
- Replacement/new generated IDs: new reviewed initialization window. Keep old exact bindings until terminal cleanup; never silently replace an old ID or tighten mid-operation.

`assertClosure` validates a supplied evidence projection against an independently verified expected map. It cannot establish AWS response authenticity, completeness, account ownership or effective permissions by itself. These require the authorized future readback adapter/operator. No successful local call is a live closure attestation.

## Remaining gates and verification

Dependency security and proof-only WP-006 hosted acceptance closed for exact M2 with retained nonblocking limitations. The east-only bootstrap intent defers `handler-and-rollback-proof` and `staged-exact-dns-live-proof` from bootstrap installation while preserving both as explicit later certificate-operation gates; this does not close either gate or change the west intent. Outstanding: separate live preparation authorization; effective bootstrap, caller-window and execution-role readback; private receipt handling; explicit failed/partial preparation cleanup; handler calls/stabilization/rollback; narrower-principal closure; authentic pending ACM ARN/CNAME/API ID; effective propagation and exact-ID operation; WP-007 CloudTrail; and a later distinct execution authorization. **NOT DEPLOYMENT READY.** No policy or application resource represented here has been installed, and the proof roles remain permission-inert.

Run focused bootstrap/initialization/infrastructure and affected release/boundary checks, full composed policy-size assertions, raw-binding/credential scans and diff checks. The separately authorized 2026-10-09 dependency remediation reran the audit and preserves the older records below as dated evidence rather than relabeling them. The historical upstream/CDK template digest and V3 publication identity remain independently checkable and unchanged by this package.

Public primary references: [CloudFormation actions/condition keys](https://docs.aws.amazon.com/service-authorization/latest/reference/list_cloudformation.html), [service-role reuse](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-iam-servicerole.html), [failure options](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/stack-failure-options.html), [CloudFront](https://docs.aws.amazon.com/service-authorization/latest/reference/list_cloudfront.html), [API Gateway V2](https://docs.aws.amazon.com/service-authorization/latest/reference/list_apigatewayv2.html), [ACM](https://docs.aws.amazon.com/service-authorization/latest/reference/list_acm.html), [CDK DNS validation](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_certificatemanager.CertificateValidation.html). These support design semantics, not live deployment proof.

### Local verification record — 2026-10-06

- `node --test checks/bootstrap-initialization.case.mjs checks/bootstrap-security.case.mjs checks/infrastructure.case.mjs` from `v4/`, launched with the existing `credentialFreeEnvironment`: **88 passed, 0 failed** (36 new initialization cases, 44 bootstrap cases, 8 infrastructure cases). The infrastructure tests synthesize dev/prod with six stacks and zero resources each. No AWS credentials/lookup used.
- Affected release/package suites (`package-boundary`, `release-control-implementation`, `workflow-activation`, `controller-provenance`, `runtime-target`, `offline-synthesis`) also ran with credential discovery disabled: **246 passed, 0 failed, 2 skipped**. The two existing Windows filesystem symlink tests skip on EPERM; mandatory mocked link/junction/type tests pass. These ran in a combined 282-case invocation with the then-34 initialization cases; two additional initialization cases passed in the final 88-case run above.
- Root CI-policy plus WP-001 isolation: **22 passed, 0 failed**, including all six WP-001 cases. No unrelated application-suite rerun.
- Conservative bindings (64-character generated IDs, 32-character zone ID): full composed execution-policy maximum **4,832 / 6,144** characters; caller-policy maximum **4,047 / 6,144**. The existing two-west/one-east attachment topology remains unchanged. Concrete live bindings require their own size check.
- Tracked credential tripwire and explicit changed/new-file credential/new-binding scan: passed. The binding scan distinguishes existing synthetic negative fixtures from newly introduced identifiers; no private handoff was read. `git diff --check`: passed.
- All 13 pending paths are V4-owned under WP-001. V3 source and existing publication both contain **42 files**, digest `a4b25c4da79431dedb37a1213d74bac55d8df42e86eecac296a7d88c06cd8caa`. Customized bootstrap bytes remain SHA-256 `8c31645f35ac96d221a07deced271376289e1a2e8723b72bf711c3b5d8b23888`.
- Dependency fields/lockfile, workflows, existing release controller/zero-resource gate and V3 runtime are unchanged. No new audit/upstream freshness claim: recorded dependency-security failure remains unresolved/unsuppressed, with no V4 waiver.
- No AWS authentication/account calls, live policy use, OIDC, workflow activation, bootstrap, deployment, remote mutation, stage, commit or push. This record is implementation-agent evidence, not independent-review approval.

### R1 remediation verification — 2026-10-06

Genuine independent review returned **C — REMEDIATION REQUIRED**: R1 identified alternate resource representations accepted under newly consistent review pins. The hash mechanism was not bypassed. This local correction is ready for focused independent closure; it is not independent approval.

- Remediation delta is exactly four existing package paths: `initialization-guard.mjs`, `../../checks/bootstrap-initialization.case.mjs`, this document and `../../../docs/V4_CURRENT_STATE.md`. The pending inventory remains the original 13 paths, unstaged/uncommitted, on baseline `2f81271a4e968638bfa43da2cd4c4849dd3bf768`. The other nine prepared files, including policy/model and synthetic fixture bytes, remain unchanged.
- Credential-free `node --test checks/bootstrap-initialization.case.mjs checks/bootstrap-security.case.mjs checks/infrastructure.case.mjs checks/package-boundary.case.mjs`: **135 passed, 0 failed, 0 skipped** — 74 initialization (38 added), 44 bootstrap, 8 infrastructure, 9 package checks. Dev/prod synthesis still proves six stacks/zero resources each. Existing transition tests and all four original positive fixtures pass unchanged.
- Seven explicit R1 regressions reject API `Target`, API `RouteKey`, OpenAPI `Body`, external `BodyS3Location`, extra cache behavior/unrelated policy, Lambda@Edge association and integration `CredentialsArn`. Each recomputes template/assembly/change-set/review digests before validation; API cases cover both phases. Additional checks cover every resource's unknown/missing properties, nested unknown keys, invalid property containers, function associations, extra/custom origins, unrelated policy references, alternate relationship intrinsics, child transforms/stage variables, certificate tags and unsupported template/resource attributes. Benign object-key reordering and literal metadata pass.
- `git diff --check`, whitespace checks on all pending files, tracked credential tripwire and explicit 13-file credential/new-raw-binding scan: passed. No private handoff was read. Dependency fields/lockfile and bootstrap-template bytes are unchanged. V3 source and existing publish artifact each remain 42 files with digest `a4b25c4da79431dedb37a1213d74bac55d8df42e86eecac296a7d88c06cd8caa`; all pending paths remain V4-owned under WP-001.
- Prior release/workflow/CI and policy-size evidence is reused where inputs are unchanged; no separate size exercise, unrelated application suite or audit rerun was needed. The existing suite's size assertions also remained green. Recorded dependency-security failure remains unresolved/unsuppressed, with no V4 waiver or new upstream-freshness claim.
- N1 remains a later live narrower-principal/stale-stack containment gate; local success does not close it. N2 is represented and rejected fail-closed by the certificate-only local review adapter, but authentic request/readback correspondence and any executor remain future work. Authentic uploaded artifact correspondence, handler behavior, propagation and live exact-ID proof remain outstanding. No AWS/remote operation, workflow activation, stage, commit, bootstrap or deployment occurred.
