# V4 OIDC deployment and release-control checkpoint

Status: **WP-006A PAUSED — AG-001C COMPLETE / INDEPENDENT REVIEW PENDING**

- Assessment date: 2026-09-28.
- Approved repository baseline: `92ef181f8ae3ca836f166aa8311b8cfb9a8f2be5`.
- Authority: implementation plan WP-006; architecture §§21.3–21.7;
  ADR-007/010/016/017; OPS-002/003/004/013/014 and TEST-003/006;
  `V4_AWS_ACCESS_CHECKPOINT.md`; WP-004 CI and WP-005 human-access model.
- This is a partial assessment and prerequisite-mutation record, **not a
  completed release design or authorization for WP-006B**.
- Live account IDs, provider/role ARNs, directory identifiers, session IDs,
  provisioning request IDs, tokens, and raw AWS responses are deliberately
  excluded. Role names below are the approved symbolic capability names.

## 1. Provisioning history and current blocker

Current adjudicated state (2026-09-29): AG-001B is complete and approved.
Its independent `AccountMaintenanceAdmin` diagnosis established that both prior
provisioning requests **FAILED**, with IAM 403 `AccessDenied` for
`iam:PutRolePolicy` on the generated ShelfState AccountAdmin role: the submitting
AccountAdmin lacked an identity-based allow. The source contained all three
approved reads; the generated policy equaled the source without those reads.
See [account-maintenance evidence §11.8](AWS_ACCOUNT_MAINTENANCE_ACCESS.md#118-first-maintenance-task--read-only-diagnosis-complete).

AG-001C separately authorizes only the generated-AccountAdmin-namespace
`iam:PutRolePolicy` addition, validation, one maintenance-role reprovisioning
request and fresh AccountAdmin read-only prerequisite proof. Its local change
has passed local and live Access Analyzer validation. One separately authorized
source-policy update has passed canonical readback; one AG-001C provisioning
request was accepted at 12:02:10 UTC on 2026-09-29. The first status read at
12:03:30 UTC returned `SUCCEEDED`; the complete generated-role policy now
canonically matches the reviewed source. A fresh temporary AccountAdmin CLI
session subsequently read that status as `SUCCEEDED` and successfully listed
OIDC providers: none exist, so the conditional exact GitHub-provider get was
not applicable. No provider was created or changed. The prerequisite proof
is complete, but the broader assessment remains paused for independent review.
See [AG-001C evidence §12](AWS_ACCOUNT_MAINTENANCE_ACCESS.md#12-ag-001c--separately-authorized-narrow-reprovisioning-repair).
No further AWS permission,
provisioning retry or broader WP-006A assessment is implicitly authorized.
The historical uncertainty and bootstrap-required labels below describe the
earlier checkpoints, not the now-established failure cause.

The initial temporary AccountAdmin inventory call failed because no
identity-based policy allowed `iam:ListOpenIDConnectProviders`. Human
adjudication subsequently authorized exactly two read-only IAM additions and
their AccountAdmin permission-set update/provisioning, described in §3.

For the first submission, the two-read inline permission-set policy was saved
and read back successfully against the then-current local model.
`ProvisionPermissionSet` accepted the existing-account request and returned
`IN_PROGRESS`. Subsequent read-only `ListRolePolicies`/`GetRolePolicy` checks
of the caller's generated AccountAdmin role still showed its previous inline
policy: both new OIDC read actions were absent, with all other statement
actions, effects, and resource sets unchanged. Comparison accounted for IAM
ordering and equivalent scalar/list serialization; this is not merely a
formatting difference.

A bounded CloudTrail lookup located the corresponding `ProvisionPermissionSet`
event. Using its request identifier in memory, the following status read failed:

- API: `DescribePermissionSetProvisioningStatus`.
- IAM action: `sso:DescribePermissionSetProvisioningStatus`.
- Error: `AccessDeniedException`.
- Reason: no identity-based policy allows that action.

AWS work initially stopped. That provisioning result was **unknown**, not proven
successful or failed. No duplicate provisioning, policy rollback, direct IAM
role edit, additional permission, or fallback identity was attempted. A new
login alone would not establish that the underlying role policy was updated.
At that historical checkpoint, post-amendment OIDC inventory had not run;
provider presence, client IDs and thumbprints were unknown. The current result
above supersedes that uncertainty. No unrelated provider was inspected.

### 1.1 Human-approved status-read remediation and bounded result

Subsequent human adjudication permanently authorized exactly
`sso:DescribePermissionSetProvisioningStatus`, scoped to the existing runtime-bound
Identity Center instance ARN, because AccountAdmin already provisions permission
sets. Wildcard scope, `ListPermissionSetProvisioningStatus`, other Identity
Center actions, provider mutation, deployment, and bootstrap remained prohibited.

Before another provisioning request, the generated AccountAdmin role was read
again using its existing IAM inventory permissions. Neither OIDC read was
present, so the first provisioning remained unconfirmed; it was not resubmitted
merely for proof.

The local policy retained both OIDC reads and added only the approved exact-instance
status read. All 15 human-access tests passed, including exact instance scope,
absence from the wildcard allowlist, no provisioning-status list permission,
unchanged Operator/Recovery fingerprints, and existing mutation/deployment
exclusions. Root and full V4 verification also passed before mutation.

IAM Access Analyzer basic validation again returned 0 errors, 0 security
findings, and 0 warnings, with the same reviewed existing `REDUNDANT_ACTION`
suggestion about S3 deny coverage. Runtime comparison verified that the new
model differs from the saved two-read permission-set policy by only the
approved status-read action. Operator and Recovery live permission-set policies
still matched their approved baseline before this mutation.

Only AccountAdmin's inline permission-set policy was updated. Exactly **one new**
`ProvisionPermissionSet` request was submitted for the existing account. It was
accepted as `IN_PROGRESS`; its exact request ID stayed only in transient process
memory. There have been two submissions total across the two separately approved
remediations, not repeated submissions of this remediation.

The generated role's inline policy was checked 11 times within a three-minute
bounded wait using existing IAM reads. The comparison normalized action/resource
ordering and scalar/list forms while requiring the complete reviewed policy to
match. It never matched. The process then stopped without resubmission or a
direct role edit.

**Blocker at the end of this remediation:** effective AccountAdmin policy propagation was not confirmed
within the authorized wait. This is not a new access-denied result. Following
the required sequence, no status API call was made for the second request,
because the generated role never met the propagation prerequisite. Its final
Identity Center status is unknown; neither `SUCCEEDED` nor `FAILED` is claimed.
No fresh login or additional policy expansion was used as a substitute for
generated-role verification. OIDC inventory remains unexecuted and unknown.

Further diagnosis required human direction, subsequently provided for §1.2. Do not automatically retry
provisioning, expand permissions, edit the generated role, use a fallback
identity, or resume OIDC/deployment assessment from this unresolved state.

### 1.2 Human-authorized read-only provisioning diagnosis

This diagnosis added no permissions and made no AWS mutation. The caller was
verified as the existing temporary `ShelfStateAccountAdmin` federated role;
neither root nor `LegacyAdministrator` was used.

**Permission-set control plane:** `GetInlinePolicyForPermissionSet` returned
the complete reviewed AccountAdmin model, after normalization of statement,
action, and resource ordering and equivalent scalar/list forms. All three
approved additions were present with their reviewed scopes:

- `iam:ListOpenIDConnectProviders`: wildcard resource for this inventory action.
- `iam:GetOpenIDConnectProvider`: exact runtime-account GitHub Actions provider.
- `sso:DescribePermissionSetProvisioningStatus`: exact bound instance.

**Two existing provisioning submissions:** CloudTrail Event History in
`us-west-2` returned the following matching events on 2026-09-28. Each matched
the actual AccountAdmin permission set, target account, and federated caller
using transient identifiers that are not recorded here.

| Submission | Event time (UTC) | Event name | Caller | Invocation errorCode / errorMessage | Response status |
| --- | --- | --- | --- | --- | --- |
| First: two OIDC reads | 11:36:05 | `ProvisionPermissionSet` | `ShelfStateAccountAdmin` | Neither present | `IN_PROGRESS` |
| Second: status-read addition | 16:12:34 | `ProvisionPermissionSet` | `ShelfStateAccountAdmin` | Neither present | `IN_PROGRESS` |

These are invocation-time responses, not final asynchronous outcomes. Request
IDs and other live identifiers were not printed or written to repository files.

**Generated role:** after waiting without AWS polling until 16:27:34 UTC,
15 minutes after the second submission, the diagnosis made one generated-role
inline-policy inspection (`ListRolePolicies`, then one `GetRolePolicy`). The
role had one inline policy. Its normalized document did **not** match the
reviewed permission-set policy, and all three new read actions were still
absent. No additional role inspection or reprovisioning followed.

**Relevant IAM CloudTrail evidence:** Event History was inspected in
`us-west-2` and `us-east-1` for the bounded window 11:31:05–16:27:38 UTC,
covering both submissions and the additional wait. Results were filtered to
the generated AccountAdmin role; unrelated role contents were not inspected.
Pagination completed without reaching the configured page bound.

- `us-west-2`: no matching generated-role IAM events were returned.
- `us-east-1`: at both 11:36:05 and 16:12:34 UTC, `GetRole` and
  `ListAttachedRolePolicies` were recorded with `invokedBy` equal to
  `sso.amazonaws.com`, an assumed-role AccountAdmin caller, `readOnly: true`,
  and no invocation error. Other matching events were successful AccountAdmin
  `ListRolePolicies` / `GetRolePolicy` diagnosis reads.
- No matching service-side policy attachment/update event or conclusive
  provisioning failure was visible in these results. Absence from this
  Event History snapshot does not establish that no unobserved activity
  occurred or identify the underlying provisioning cause.

**IAM role quota posture:** `GetAccountSummary` reported 98 roles against a
role quota of 1,000. The reported role quota was not exhausted; this diagnosis
does not attribute the provisioning problem to role quota exhaustion.

**Final provisioning status:** still indeterminate for both submissions.
Generated-role propagation failed the prerequisite for fresh-session status
verification, so no new sign-in, second-request status read, or OIDC inventory
was attempted. No `SUCCEEDED` or `FAILED` result is claimed.

The mandated stop condition is met: **WP-006A BLOCKED — ACCOUNTADMIN
SELF-PROVISIONING BOOTSTRAP REQUIRED**. This label requests human adjudication;
it is not proof of a particular root cause or authority to bootstrap. No third
provisioning request, assignment recreation, direct generated-role edit,
temporary grant to another principal/group, or fallback identity was used.
No assignments, memberships, roles, permission sets, or policies were changed
during this diagnosis. WP-006B and WP-007 remain unstarted.

## 2. GitHub observations — read-only

REST responses and the actual repository settings UI established:

| Area | Observed state |
| --- | --- |
| Ownership/visibility | `espiercy/ShelfState`; personal account (`User`); public |
| `main` | Not protected; no required checks or PR protection configured |
| Repository rulesets | None; no ruleset force-push, deletion, or bypass controls configured |
| Environments | None; settings page exposes New environment, which was not used |
| Token permissions | Default read-only contents/packages; validation explicitly requests `contents: read` |
| Actions-created/approved PRs | Disabled |
| Allowed actions | All actions/reusable workflows allowed; settings-level full-SHA pin requirement disabled |
| Fork approvals | First-time contributors require approval; private-fork settings endpoint correctly reports not applicable to this public repository |
| Repository Actions secrets/variables | Zero each; only name/category metadata requested, no values |
| Retention | UI reports 90-day Actions artifact/log retention |
| OIDC subject customization | Default subject format, immutable-subject mode disabled; prefix `repo:espiercy/ShelfState` |
| Existing AWS workflow path | None in the sole authorized `validation.yml`: no `id-token: write`, AWS credentials action, environment, deploy command, or manual release trigger |

The current workflow retains full action SHA pins and checkout
`persist-credentials: false`. Its two distinct check names are:

- `V3 and repository boundary` (`repository-v3`);
- `V4 install and verification` (`v4-validation`).

Both checks succeeded in each of two push runs for the exact baseline:
[36414737772](https://github.com/espiercy/ShelfState/actions/runs/36414737772)
and [36414738179](https://github.com/espiercy/ShelfState/actions/runs/36414738179).
The names are unique within the authorized workflow; duplicate check records
across separate runs do not introduce another workflow. Their eventual required
check configuration must select the GitHub Actions producer and preserve name
uniqueness when new workflows are authorized.

The API did not disclose the account's paid plan. GitHub documents branch
protection, rulesets, and required environment reviewers for public repositories
on Free plans. The actual environment surface is available, but there is no
existing environment in which to inspect reviewer, prevent-self-review, branch,
or administrator-bypass configuration. No capability was tested by creating an
environment. A working, non-bypassable production approval gate is therefore
**not yet proven**. No paid-plan change is selected or authorized.

References: [deployment protection capabilities](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments),
[protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches),
[rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets).

## 3. Authorized WP-006A prerequisite mutations

The two narrow policy remediations are the only exceptions to WP-006A's read-only
external boundary, each granted by explicit human adjudication. They are not
OIDC-provider creation/management or deployment authority.

| Local model addition | Scope |
| --- | --- |
| `iam:ListOpenIDConnectProviders` | `Resource: "*"`; explicitly included in the existing wildcard inventory allowlist because this listing action has no scoped resource type |
| `iam:GetOpenIDConnectProvider` | Only `arn:aws:iam::<runtime-account-id>:oidc-provider/token.actions.githubusercontent.com`, derived from the existing validated runtime account binding |
| `sso:DescribePermissionSetProvisioningStatus` | Only the existing exact runtime-bound Identity Center instance ARN; permanent completion-observation capability for the already-approved provisioning operation |

No provider create/delete/update-thumbprint/client-ID/tag mutation and no
`ListOpenIDConnectProviderTags` permission was added. No unrelated executable
permission changed. Operator and Recovery model fingerprints remain identical
to the approved baseline; both live inline permission-set documents were also
read and confirmed unchanged before and after the AccountAdmin update.

Before the first mutation:

1. Verified the caller was the temporary Identity Center AccountAdmin role.
2. Read all three permission-set policies and matched the approved model using
   runtime-only bindings. No personal directory inventory was needed.
3. Verified that the revised AccountAdmin policy differed by exactly the two
   approved additions, including the exact provider resource restriction.
4. Passed all 14 human-access tests, including wrong-account, wrong-provider,
   wildcard, provider-suffix, mutation-denial, and runtime-rebinding cases.
5. Ran IAM Access Analyzer basic `ValidatePolicy`: 0 errors, 0 security
   findings, 0 warnings; one `REDUNDANT_ACTION` suggestion. The suggestion
   concerns existing S3 deny coverage (`GetObjectAttributes` also covered by
   `GetObject*`), not new authority. It was reviewed and left unchanged.
6. Rechecked the exact validated policy immediately before submission.

For each remediation, the two authorized mutation calls were:

1. `PutInlinePolicyToPermissionSet` for `ShelfStateAccountAdmin` only.
2. `ProvisionPermissionSet` for that permission set and the existing account
   only (`AWS_ACCOUNT`, not all provisioned accounts).

Readback confirmed the first permission-set document; the second update was
accepted after exact-model validation, followed by the bounded verification in
§1.1. The read-only diagnosis in §1.2 subsequently confirmed the complete saved
three-addition model. Effective role provisioning remained unresolved at that
checkpoint; separate AG-001C has now resolved it as recorded above. No group membership, account
assignment, Operator/Recovery policy, MFA/session setting, root or legacy
identity was changed. No GitHub or Netlify mutation occurred. No provider,
deployment role, bootstrap stack, application resource, or deployment was made.

## 4. Pending assessment/design — not selected or implemented

The assessment stopped before a coherent WP-006A design could be accepted.
These remaining items are required before proposing a WP-006B mutation plan:

| Area | Remaining work / preserved architecture constraint |
| --- | --- |
| Main protection | Exact PR/check/force-push/deletion/bypass rules and single-developer approval consequences need human review; current direct pushes cannot substitute for protection |
| Environments | Evaluate `dev` and `production` (explicit mapping to CDK `dev`/`prod`); exact branch-only restrictions and production reviewer/bypass configuration remain unproven |
| Trust | Candidate exact subjects are `repo:espiercy/ShelfState:environment:dev` and `repo:espiercy/ShelfState:environment:production`, audience `sts.amazonaws.com`; AG-001C confirmed provider absence, so establishment/configuration needs separate review; no repo/org/ref wildcard or PR credential path |
| Roles | Distinct `ShelfStateV4DevDeploy` / `ShelfStateV4ProdDeploy`; initial assumption-only proof surface, no hypothetical deployment permissions; final trust/permissions and negative tests pending |
| AccountAdmin | Provider mutation authority remains absent and unauthorized; inventory additions do not authorize establishing the provider. First-establishment/recovery path must be separately reviewed, without root or LegacyAdministrator |
| Bootstrap | Live state not assessed. Existing policy does not grant CloudFormation stack inventory; no such call was made. Same-account dev/prod isolation, west-region and east-certificate needs, exact execution authority, and possible deferral need design |
| Exact revision | Bind workflow source, requested full SHA, immutable checkout, build/template digests, approved artifact, deployed revision, and eligible rollback record; fail on mismatch |
| Stateful changes | Reuse WP-003 static guards, then add structured live change analysis and human preview; deletion/replacement and protection/retention/Vault Lock weakening must fail closed; text scraping alone is insufficient |
| Rollback | Only a previously verified environment-specific known-good artifact/revision; application/config rollback is not data recovery; same stateful protections apply |
| Supply chain | Preserve immutable pins, clean installs, signature/audit gates and no auto-merge; no credentials action has been selected or added |
| Production | Deliberate initiation plus native protected approval before AWS authority; no push/merge release, boolean-confirmation substitute, or unapproved bypass |

GitHub documents that environment subjects omit the independent Git ref, so
the eventual trust must be paired with enforced environment branch restrictions
and reviewed credential-bearing workflows. This is a design obligation, not a
claim that current repository settings enforce it.

AWS documents that default CDK bootstrap execution uses `AdministratorAccess`
and that separate qualifiers alone do not provide IAM isolation. Neither is an
approved solution here. Defer bootstrap if exact resource-scoped execution
permissions are not yet known; do not acquire broad permissions to complete an
assessment. [AWS bootstrap customization](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping-customizing.html)

## 5. Cost, next sequence, and boundaries

The inventory-policy amendment adds no resources and no expected AWS fixed
charge. The approved IAM/OIDC model expects $0 fixed AWS service cost; future
bootstrap storage/request usage must be estimated separately without free-tier
credits. No GitHub plan purchase or resource spending was authorized.

No complete WP-006B mutation sequence is approved or ready. The next sequence
is: independently review completed AG-001C; obtain authorization to resume
the remaining read-only WP-006A assessment/design; review the exact protection,
provider-establishment, role and bootstrap proposals; obtain separate WP-006B
authorization before any such mutations. No additional reprovisioning is
needed for the completed AG-001C proof.

No architecture deviation has been adopted. `LegacyAdministrator` remains
unchanged and outside ShelfState. WP-005C2 remains on hold, not a prerequisite.
Account-wide maintenance administration is separate work. Recovery remains
deny-only pending WP-039. WP-006B and WP-007 were not started.

## 6. Historical WP-006A repository verification and handoff

The policy/test correction and this partial checkpoint are left uncommitted
pending resolution of the blocker; no push is authorized. The starting SHA
remains HEAD. Local verification completed after the amendment:

| Check | Result |
| --- | --- |
| Root `node --test` | 149 passed, 0 failed |
| Focused WP-001 / CI-policy tests | 6 / 15 passed, 0 failed |
| V4 pinned `npm ci` through Corepack | Passed; dependency graph unchanged |
| V4 `npm run verify` | Passed after status-read amendment: 9 package, 1 contract, 15 human-access, 8 infrastructure tests; synth, preview, inert build passed |
| Dev / prod synth | Each 6 stacks, 0 resources; no bootstrap/deployment |
| Credential tripwire | Passed for tracked files and a separate check of this untracked document |
| V3 boundary build | Exactly 42 frozen files |
| V3 digest | `2b973f2a0c83fe0ca7df51528980f5d2cb142e3e8b3b2411e8727e303560af3a`, unchanged |
| `git diff --check` | Passed |

These tests do not prove AWS provisioning or complete the unfinished release
design. The only changed paths are this checkpoint, the human-access policy
model, and its tests; no V3, workflow, Netlify, dependency, or CDK source changed.

During the subsequent read-only diagnosis, root tests (149), focused WP-001 /
CI-policy tests (6 / 15), human-access tests (15), full V4 verification, both
zero-resource syntheses, the 42-file V3 build/digest, credential tripwire, and
diff whitespace/redaction checks were rerun successfully. The pinned clean
install result above is from the preceding remediation, not a new install in
this diagnosis. Only this checkpoint was edited during the diagnosis; the
existing policy/model test changes were preserved. No commit or push was made.

## 7. Separate AG-001C completion and current handoff

AG-001A and AG-001B are independently approved. AG-001C adds only
generated-AccountAdmin-namespace `iam:PutRolePolicy` to repair the established
management-account reprovisioning failure. Its Access Analyzer validation,
single source mutation/submission, complete generated-role match, fresh-role
proof and symbolic CloudTrail evidence are recorded in the account-maintenance
document §12. This does not retroactively characterize WP-006A as complete.

Current local verification passed: root 149/149; human-access 17/17; WP-001
6/6; CI-policy 15/15; pinned clean install and full V4 verify (9 package,
1 contract, 17 human-access, 8 infrastructure tests, preview and inert build).
Dev/prod each contain 6 stacks and 0 resources. V3 source and publish artifact
retain exactly 42 files and the frozen digest above. Tracked credential,
separate document redaction and whitespace checks pass. No V3, workflow,
Netlify, dependency or CDK source change is included.

The coherent unpushed governance/policy/test commit authorized after AG-001C
success includes four files: this checkpoint, the account-maintenance record,
the human-access model and its tests. Earlier uncommitted-state statements
above are historical. Review, not broader assessment or deployment, is next.
