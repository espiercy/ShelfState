# WP-007 local bootstrap-security proposal

Snapshot note (2026-10-05): the preparation and remediation results below describe the 2026-10-04 review state, including its then-uncommitted status. The approved preparation is now locally committed at `6ddbd25e8699c949b727c2dfa342fc0f6345e5e4`; see the [current-state index](../../../docs/V4_CURRENT_STATE.md) for subsequent inventory/cleanup evidence and outstanding gates. No live-use authority follows from that commit.

Status: LOCAL REVIEW ONLY — NOT AUTHORIZED FOR AWS USE

**NOT DEPLOYMENT READY.** R1–R3 remediation does not resolve any live authorization or pending architecture/security gate.

Baseline: `8330ec9f2afe16241815e4eb9a04ae377af67c24`. Prepared 2026-10-04.
This directory is security preparation, not an application stack or an executable bootstrap procedure. No policy, boundary or bootstrap has been installed. No live binding is recorded here. The temporary inventory reader, existing OIDC roles, workflows and application topology are unchanged.

## Review artifacts and provenance

`model.mjs` is a pure local constructor/validator. JSON artifacts are deterministic review snapshots, not runtime policy bindings. `${ACCOUNT_ID}`, `${SELECTED_ZONE_ID}` and generated-ID/name placeholders are deliberately unresolved. Do not upload these policies or substitute broad wildcards to make them deployable.

- `bootstrap-template.json`: customized modern bootstrap, JSON serialization of the pinned upstream YAML structure.
- `execution-west.policy.json`, `execution-west-edge.policy.json`: proposed separately managed `ShelfStateV4DevCfnExecutionWest` (regional application/runtime) and `ShelfStateV4DevCfnExecutionWestEdge` (CloudFront/IAM/DNS) policies. Both are required on the west execution role.
- `execution-east.policy.json`: independently narrow `ShelfStateV4DevCfnExecutionEast`, only on the east execution role.
- `health-runtime-boundary.policy.json`: proposed independently managed `ShelfStateV4DevHealthBoundary`.
- `github-dev-assumptions.policy.json`: future exact-role assumption proposal only; does not modify the current GitHub role.
- `bootstrap-intent.json`: non-executing configuration for two future regional bootstraps, including termination protection and authorization gates.
- `pending-decisions.json`: generated-ID, creation-scope and certificate-validation decisions requiring human adjudication.
- `provenance.json`: upstream and custom digests and serialization identity.

Upstream is the installed `aws-cdk@2.1141.0` file `node_modules/aws-cdk/lib/api/bootstrap/bootstrap-template.yaml`, bootstrap version **32**. Its raw bytes were checked before customization:

`a484ad768d3446874161044d986bec096e201a54037c8ce93ed5a0d215e1dd25`

ShelfState variant: `ShelfState: Dev isolated modern bootstrap`, revision **2** (fixed two-policy west attachment). Custom JSON SHA-256:

`8c31645f35ac96d221a07deced271376289e1a2e8723b72bf711c3b5d8b23888`

This is a derivative, **not** the canonical upstream template. The upstream AWS CDK package/license remains its source. JSON serialization removes YAML comments but preserves the parsed contract except for the enumerated changes below. Tests first verify raw upstream bytes, then reconstruct and structurally compare both templates. An upstream update must fail review visibly; do not just replace the recorded digest.

The directory-local `.gitattributes` pins JSON files to LF so Windows checkout conversion cannot change the raw-byte provenance or snapshot identity. It does not change line-ending policy elsewhere in the repository.

## Customization boundary

All canonical parameter names, 14 resource declarations, role names, asset/version behavior and canonical outputs remain, including bucket domain, image repository and legacy key outputs. Qualifier stays `hnb659fds`; `BootstrapVersion` stays 32. Separate variant metadata/outputs identify this fork.

Only these structural changes are permitted by the comparison test:

1. Replace `DeploymentActionRole` inline authority with the regional dev-only policy below, remove its managed `AWSCloudFormationReadOnlyAccess`, and remove its conditional external-account trust branches.
2. Constrain parameters to the reviewed qualifier, canonical asset names, no extra trust, public-access blocking, external-ID denial, AWS-managed S3 key and disabled example/custom bootstrap boundary.
3. Fix the execution-role attachments to the current account's exact two west policies or single east policy through a two-region mapping/condition; no `AdministratorAccess` fallback or arbitrary policy union.
4. Add the region condition/mapping and variant provenance metadata/outputs.

`CloudFormationExecutionPolicies` remains the canonical comma-delimited CLI parameter, with a narrowed per-ARN pattern, but it no longer selects arbitrary attached policies: the mapping/condition fixes the regional set. `assertBootstrapIntent` requires exactly the ordered `West,WestEdge` ARN pair in west, and only the `East` ARN in east. A future caller must use this check, not rely on a silently ignored or mismatched CLI argument. Regions other than the two approved regions cannot resolve the mapping. Missing partitions and west/east unions fail local intent validation; the template itself cannot attach caller-selected policies.

The canonical conditional key, alias and example-boundary declarations remain, but constrained parameters make them inactive (11 active resources under this proposal). `FileAssetsBucketKmsKeyId=AWS_MANAGED_KEY` is explicit. No customer-managed key is enabled. Same-account file/image/lookup trust and their policies remain canonical. No Lambda custom resource, network or additional service is introduced.

Termination protection is a **stack operation/configuration**, not a template IAM property. Both intent entries require it; later authorized bootstrap must read it back. SSM uses the canonical version parameter; any account default that would cause an unexpected advanced-tier charge must be resolved before live execution.

## Exact deployment-role scope

Stack ARNs use `arn:aws:cloudformation:<region>:<account>:stack/<exact-name>/*`; the suffix represents the generated stack ID, not a wildcard stack name. Names are derived from the existing capability/naming modules:

| Region | Exact dev stack names |
| --- | --- |
| west | `shelfstate-v4-dev-edge-delivery`, `shelfstate-v4-dev-identity-session`, `shelfstate-v4-dev-library-api`, `shelfstate-v4-dev-operations-lifecycle`, `shelfstate-v4-dev-recovery-observability` |
| east | `shelfstate-v4-dev-edge-certificate` |

This permits future mutation within those six names, not implementation of their later capabilities now. The narrow execution policy separately limits current WP-007 capability. No production/unrelated/additional-dev stack or `CDKToolkit` mutation is granted. Existing stacks under an approved name must later be checked for expected ownership, service-role binding and pending change sets before use: exact names alone do not prove historical ownership.

### CloudFormation action analysis

Each retained action below supports the **stack** resource type in the [CloudFormation authorization reference](https://docs.aws.amazon.com/service-authorization/latest/reference/list_cloudformation.html). None requires `Resource: "*"` in this flow. The model's positive/negative tests evaluate the policy embedded in the customized template, not a parallel prose allowlist.

| Retained action | Local pinned-flow justification and restriction |
| --- | --- |
| `CreateChangeSet` | Standard change-set path; exact application stacks, required exact regional execution `cloudformation:RoleArn` plus `Null=false`. |
| `DescribeChangeSet` | Poll prepared change set, bound to its authorized stack. |
| `ExecuteChangeSet` | Future reviewed execution of that stack's change set. Not executed or authorized in this slice. |
| `DeleteChangeSet` | Remove obsolete/no-op change sets; does not grant stack deletion. |
| `DescribeStacks` | Named existence/status/output/termination-protection reads. Also exact regional `CDKToolkit/*` for toolkit output discovery; no unnamed inventory. |
| `DescribeStackEvents` | Named deployment progress. |
| `DescribeStackResources` | Named physical-resource inventory used by deployment diagnostics. |
| `GetTemplate` | Named existing-template comparison; not global template access. |
| `TagResource`, `UntagResource` | Stack-tag authorization dependencies of change-set operations. |
| `UpdateTerminationProtection` | Pinned change-set flow calls it even for a non-executing preview; exact dev application names only. |

Installed source evidence is in `aws-cdk/lib/index.js`: `FullCloudFormationDeployment.changeSetDeployment`, `createChangeSet`, `updateTerminationProtection`, `CloudFormationStack.lookup`, and `CloudFormationStack.template`. The contract test also checks role-before-version validation and template-file publication. These are local source observations, not live compatibility proof.

The CLI has **other paths**: `directDeployment` emits `CreateStack`/`UpdateStack`; `deployStack` can `DeleteStack` when cleaning up `REVIEW_IN_PROGRESS`; repair/destroy can delete or roll back stacks. Those paths are intentionally outside this change-set-only proposal. `CreateStack`, `UpdateStack`, `DeleteStack`, `ContinueUpdateRollback`, `RollbackStack`, stack refactoring, `GetStackPolicy`/`SetStackPolicy`, `GetTemplateSummary`, account-wide listing and extra hook diagnostics are not granted. A failed/partial stack, resource import, direct/hotswap request, new diagnostic requirement or attempted fallback is a **stop for separate review**, not a reason to retry with broader credentials. No general-purpose CDK compatibility is claimed.

CloudFormation can reuse a stack's existing service role; a narrow `PassRole` alone is not a stack boundary. Exact stack mutation scope is therefore essential. See [CloudFormation service roles](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-iam-servicerole.html). Before future execution, verify the prepared change set belongs to the expected stack/revision and the stack uses only the reviewed regional execution role. This preparation does not change the existing release controller to execute deployments.

### Other deployment-role actions

- `iam:PassRole`: one regional `cdk-hnb659fds-cfn-exec-role-<account>-<region>`, with `iam:PassedToService=cloudformation.amazonaws.com`. No other role or role wildcard.
- `ssm:GetParameter`: CLI `validateBootstrapStackVersion`. `ssm:GetParameters`: CloudFormation template bootstrap-version parameter resolution (also preserved on the regional execution policy). Both target only `/cdk-bootstrap/hnb659fds/version`; no application path or decrypt grant.
- S3 bucket metadata/list reads and object/version reads: only the canonical regional `cdk-hnb659fds-assets-<account>-<region>` bucket. No bucket administration or object mutation by the deployment role, cross-account artifact grant, or added KMS permission. AWS-managed S3 encryption remains the canonical posture, not a claim that S3 never internally uses KMS.

Future GitHub dev assumption is exactly four ARNs: deploy and file-publishing roles in each region. No lookup, image, execution, production or administrative role. Both file-publishing roles remain because a stack template is itself a file asset. Canonical publishing can overwrite/delete objects in its regional bootstrap bucket; it is not write-once storage. Keep that bucket dev-only and preserve release SHA/digest/provenance controls. The preserved lookup role is not a lookup authorization: credential-free synth and `--no-lookups` remain required.

## Proposed execution policies and residuals

These artifacts are **not immediately installable**. Generated identifiers intentionally remain symbolic. Neither an automatic binding tool nor a live creation sequence is supplied.

### R1 — managed-policy size and authority-preserving partition

The original west document was 8,078 minified characters. Removing Sids reduced it to 7,454; additionally merging only identical Effect/Action/Condition statements by unioning their resources left 7,145, still over the non-adjustable 6,144 limit. These straightforward safe optimizations did not suffice; no resources, actions or conditions were broadened to compress it. Two coherent policies instead retain every original statement unchanged, including Sids. An independently captured sorted-statement SHA-256 (`64efd611ef5b7e8ab8f0092a72a90f0b883c73fccc0e41dbc7d3768343db3f41`) locks the combined authority to its pre-remediation form. All existing west negative cases now evaluate that combined set.

| Review artifact | Symbolic minified characters | Conservatively bound characters |
| --- | ---: | ---: |
| `execution-west.policy.json` | 3,719 | 3,907 |
| `execution-west-edge.policy.json` | 4,397 | 4,483 |
| `execution-east.policy.json` | 2,067 | 2,178 |
| `health-runtime-boundary.policy.json` | 591 | 589 |
| `github-dev-assumptions.policy.json` (also checked conservatively) | 491 | 483 |

Sizes use serialized JSON without formatting whitespace, a synthetic 12-digit account, 32-character zone/distribution/OAC/API/integration/route allowances, 36-character UUID policy/certificate IDs, and a 64-hex-character validation-token allowance. These are conservative production-like fixtures, not asserted service maxima. Concrete future bindings must be size-checked again; no binding is authorized by this fixture. Each proposed managed policy is below 6,144, with the largest retaining 1,661 characters of headroom. West has exactly two execution-role managed attachments; east has one, below even the test's conservative ten-attachment ceiling. See [IAM size and attachment quotas](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_iam-quotas.html).

The additional `execution-west-edge.policy.json` is the sole 15th pending file and directly necessary for R1. It is not a new capability or an additional live resource in this local slice.

| Policy area | Proposed scope / unresolved detail |
| --- | --- |
| West static S3 | One explicit account/region-qualified dev static bucket; creation with west location condition, configuration/policy and lifecycle only. No static-object publication grant here. |
| West CloudFront | Distribution creation with required request tags; OAC/cache/origin-request/response-header policy creation. Lifecycle operations bind exact future IDs. Do not add Functions, Lambda@Edge, WAF, VPC origins, invalidation or general inventory. |
| West HTTP API | `/apis` creation requires exact API name and dev request tags. API/integration/route IDs are unresolved; child creation and selected lifecycle paths are enumerated, `$default` stage fixed. |
| West health Lambda/logs | One named health function and log group; configuration/invoke permission only for API Gateway principal. Future template must constrain invocation `SourceArn` to the intended API; the principal condition alone does not do that. |
| West IAM | Only named health role, mandatory independently managed boundary at creation, exact Lambda-only PassRole. No boundary editing, replacing/removing or unrelated IAM authority. |
| East ACM | Public DNS-validated, non-exportable certificate request, exact dev domain set, east region, required request tags; lifecycle bound to future certificate ID. |
| Regional support | Exact bootstrap objects/version; selected-zone metadata/record read and DNS change-status polling. No east S3 administration, IAM, Lambda or API. |

The proposal uses service authorization models from [S3](https://docs.aws.amazon.com/service-authorization/latest/reference/list_s3.html), [CloudFront](https://docs.aws.amazon.com/service-authorization/latest/reference/list_cloudfront.html), [API Gateway V2](https://docs.aws.amazon.com/service-authorization/latest/reference/list_apigatewayv2.html), [Lambda](https://docs.aws.amazon.com/service-authorization/latest/reference/list_lambda.html), [Logs](https://docs.aws.amazon.com/service-authorization/latest/reference/list_logs.html), [IAM](https://docs.aws.amazon.com/service-authorization/latest/reference/list_iam.html) and [ACM](https://docs.aws.amazon.com/service-authorization/latest/reference/list_acm.html). Future native CloudFormation handlers must be compared with these exact operations before policies are authorized; tags, generated-ID reads and dependent tagging actions must not be assumed to work before their binding stage. For example, CloudFront tagged creation also needs `TagResource` against the not-yet-known distribution, and ACM's request must explicitly satisfy the non-exportable condition. The current exact-ID lifecycle statements cannot complete that initial transaction without resolving the adjudication below.

### Generated-ID and wildcard adjudication — still open

Every execution-policy `Resource: "*"` is inventoried in `pending-decisions.json` and tested:

| Action(s) | Creation/read constraint | Residual needing review |
| --- | --- | --- |
| `cloudfront:CreateDistribution` | Required Project/Environment/ManagedBy request tags | Multiple matching distributions/cost; future ID unknown. |
| `cloudfront:CreateOriginAccessControl`, `CreateCachePolicy`, `CreateOriginRequestPolicy`, `CreateResponseHeadersPolicy` | No supported exact-name/tag creation condition in this proposal | Account-wide creation of these types. Not lifecycle access. |
| `acm:RequestCertificate` | Exact domains, DNS, public, export disabled, east, request tags | Multiple certificates for same name. |
| `logs:DescribeLogGroups` | West endpoint | Account-region log-group metadata, not log content. |

`route53:GetChange` uses `change/*` because change IDs are generated, not zone ARNs. This is DNS-change status read authority, not record mutation. Selected-zone `ListResourceRecordSets` cannot filter to only the dev records; it reads zone records and is not authorization to inspect them now. Canonical bootstrap object reads and health log-stream wildcards are confined to their named containers.

Choose explicitly between a staged exact-ID process (the placeholder shape shown here) and a separately reviewed initial lifecycle policy with bounded ARN patterns followed by tightening. **No pattern-based lifecycle policy has been selected or emitted.** Tags cannot isolate untaggable OAC/cache-related objects; initial `.../*` lifecycle access could affect unrelated resources. Account/region ARN bounds and post-creation tightening reduce but do not erase that interval. A staged process also needs a viable native-resource creation/tagging/readback sequence and separate authorizations; do not assume a partially created stack will pause safely for manual policy replacement.

Independent review must resolve the process before a live policy is constructed. Recheck every required action against the eventual generated WP-007 template and resource handlers. Remove unused capabilities rather than retaining speculative permissions; if a handler needs additional authority, stop and review it. No customer-managed policy is created in this slice.

## Route 53 / certificate validation

All zone operations use the symbolic selected-zone ARN. West changes require normalized `dev.shelfstate.codecorax.com`, types A/AAAA, and CREATE/UPSERT/DELETE. `ForAllValues` prevents mixed-batch escapes; explicit `Null=false` closes missing-key vacuity. The future template must also pass `assertDevAliasTargets`: exactly one native A and one native AAAA alias in the selected zone, with exact `Fn::GetAtt` references to the intended unconditional CloudFront distribution and CloudFront zone `Z2FDTNDATAQYW2`. Any top-level `Condition` on either record fails, even if true. All `RecordSetGroup` resources in the guarded stack are rejected. Template transforms, nested stacks, custom-resource record mechanisms and intrinsic resource/property alternatives are unsupported and rejected rather than interpreted. The intended stack must use this narrow native representation; supporting a different representation requires review. Synthetic fixtures include disabled good records plus an active wrong-target group, individual conditions, missing/duplicate/non-alias records and both wrong targets. There is no WP-007 application template yet. IAM record conditions alone cannot constrain alias targets or CNAME values.

East currently uses `${VALIDATION_RECORD_NAME}`, CNAME, CREATE/UPSERT only. The separate **unselected** candidate in `pending-decisions.json` permits `_*.dev.shelfstate.codecorax.com`. IAM `*` is not an ACM-token grammar and can match extra labels; a negative-boundary test deliberately demonstrates that residual. Human adjudication must choose bounded-pattern authority or a viable staged exact-name process. No validation token is invented, no validation-record DELETE is proposed. A provider demanding deletion or broader discovery stops for review.

References: [Route 53 condition semantics](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/specifying-conditions-route53.html), [ACM CloudFormation certificate behavior](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-certificatemanager-certificate.html). Public DNS, Stage-2 reads and temporary-reader cleanup are not performed by this preparation.

## IAM boundaries

The health-role boundary allows only `logs:CreateLogStream` and `logs:PutLogEvents` on streams beneath the exact west/account `/aws/lambda/shelfstate-v4-dev-health` group. Infrastructure, not the runtime, creates that group (`HealthLogGroup` execution-policy statement). These are the two stream/write operations from [Lambda logging permissions](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-cloudwatchlogs.html); runtime `CreateLogGroup` is unnecessary under the pre-created-group invariant. Future template review must enforce group-before-function readiness; do not broaden the runtime boundary to recover from a missing group. Live logging proof remains gated.

R2 adds an unconditional `Deny` with `NotAction` equal to those two actions and `Resource: "*"`, plus `Deny` for those actions with `NotResource` equal to the exact health log-stream scope. No resource-policy Allow can override these explicit denials. The boundary alone grants nothing; an identity or qualifying resource grant is still required for allowed logging. Same-account `Principal: "*"` plus `aws:PrincipalArn` grants can bypass **implicit** boundary denial; the S3 attack regression first proves that old failure, then proves the new explicit denial wins. See [IAM resource-policy evaluation](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic_policy-eval-denyallow.html), [Deny with NotAction](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_notaction.html) and [NotResource](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_notresource.html).

West requires this exact boundary at role creation and explicitly denies replacing/removing it or editing its managed policy. The boundary must be created/owned independently by separately authorized administration before the application role exists. The execution policy can change that exact role's inline policy/trust, but cannot expand its explicit-deny runtime ceiling; future template review must still require Lambda-only trust and review resource policies. The policy partition preserves these controls and Lambda-only PassRole unchanged.

No extra boundary is proposed for the bootstrap execution roles: duplicating the same customer-managed execution policy without independent ownership would add no independent immutable ceiling. Their fixed regional policy attachments, narrow deployment-role stack scope, independently managed health boundary and protected human bootstrap process are the selected controls. A future independent execution ceiling would be a separate reviewed design, not the health boundary reused on a different role.

## Future gates, operational stops and cost

This package does not satisfy any live gate. Before a separately authorized bootstrap:

1. Clear the unresolved dependency-security gate; do not reuse the V3 exception. Complete relevant WP-006B live proofs separately.
2. Adjudicate generated-ID/lifecycle authority, create-time residuals, east DNS process and final generated-template compatibility. Validate concrete policies and review findings without automatic widening.
3. Independently authorize creation of the three exact execution policies (two west, one east) and health boundary; verify content/ownership, bound policy sizes and privately bind account/zone/IDs.
4. Independently authorize fresh MFA-backed `AccountMaintenanceAdmin` (one-hour duration), both regional intents, exact template digest/variant and termination protection. Do not use the temporary inventory reader, root or legacy identity for bootstrap.
5. Preserve no additional trust, canonical names, AWS-managed key, no lookups and no fallback credentials. Inspect a separately authorized plan before execution, then verify actual role policies, version/output contracts and stack termination protection.

Canonical ECR is retained even though unused, not removed for savings. Empty bootstrap buckets/repositories have no proposed customer-managed-key fixed charge; future storage/requests, asset retention and regional usage still require cost verification against the Personal model. No costs were incurred through resource creation here. No `AdministratorAccess`, arbitrary policy union or direct deployment fallback is acceptable on any failure.

## Local verification

Run `node --test v4/checks/bootstrap-security.case.mjs` from repository root, then credential-isolated full V4 verification. The sole runner integration is adding this test file to `infra:test`; dependency configuration/lockfile are unchanged. Tests use built-in Node APIs and the YAML parser already bundled with the pinned dependency, not a new dependency. The limited test-only evaluator is **not** AWS IAM simulation. Its added resource-policy model covers only a same-account assumed-role session, wildcard Principal, and exact `ArnEquals` on `aws:PrincipalArn` (the IAM role ARN, not the STS session ARN). It distinguishes implicit from explicit denial and models the reviewed boundary-bypass rule. S3 same-account ownership is a fixture premise. Other-service adversarial grants test the explicit-deny ceiling, not whether those services accept S3-style policies. SCPs, trust, cross-account rules, direct role Principals, session policies, KMS special rules and service execution are not modeled; unsupported shapes throw. Local positives are not live effective-permission or logging proof.

Full verification must retain six empty application stacks in each environment, frozen 42-file V3 publication, existing release/security controls and credential redaction checks. Run the actual dependency audit separately and report its nonzero result; test/synth success cannot make that gate green. No CloudFormation validation API, policy simulator API, account lookup or live CDK operation is needed or authorized here.

### Recorded local R1–R3 remediation results (2026-10-04)

- Focused R1: **3 passed**; R2: **5 passed**; R3: **6 passed**, all zero failures. Both independent-review attack reproductions reject under the remediated controls; the old implicit-boundary attack is positively reproduced as a contrast.
- Complete bootstrap-security suite: **44 passed, 0 failed**. Infrastructure plus bootstrap suite: **52 passed, 0 failed**.
- Credential-isolated `npm run verify`: exit **0**. Package 9/9; contract 1/1; human-access 17/17; release design 17/17; release implementation/activation 237 passed, 0 failed, 2 platform skips; infrastructure 52/52; synth/preview/build passed. Existing platform skips concern real Windows link creation; mocked link classification tests remain mandatory and passed.
- Both dev and prod assemblies: **6 stacks, 0 resources**. AWS environment credentials removed, profile/config paths set to the null device, metadata credential discovery disabled, and `--no-lookups` retained. No AWS API or live CDK operation performed.
- Root `node --test`: **197 passed, 0 failed**. Focused WP-001 + CI policy suites: **22 passed, 0 failed** (6 isolation, 16 CI).
- Tracked-file credential tripwire plus explicit scan of all 15 pending paths: no obvious matches. Whitespace/diff checks passed. Only the original preparation's `infra:test` command changed in package metadata; no additional script change, dependency fields and lockfile unchanged.
- V3 source and existing publish artifact independently rechecked: **42 files** each, source and publication digest both `a4b25c4da79431dedb37a1213d74bac55d8df42e86eecac296a7d88c06cd8caa`. WP-001 classifies this pending set as V4-only.
- Fresh `npm audit --audit-level=high --json`: exit **1**, one high-severity vulnerable package, three advisories on unchanged bundled `brace-expansion@5.0.9`: `GHSA-q2hr-2g5m-vwhr`, `GHSA-qhr7-859c-m2p7`, `GHSA-6j4f-fj2g-mc7p`. The registry check ran only after explicit permission to send dependency metadata. No fix, suppression, waiver or dependency change was attempted; this result remains a live-execution/CI security blocker. The generic audit `fixAvailable` field is not evidence of an installed or reviewed CDK remediation.

Changes remain unstaged and uncommitted for independent review. No live inventory access, AWS/GitHub/Netlify mutation, bootstrap, deployment, workflow activation or WP-007 application-resource implementation occurred.
