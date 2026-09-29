# V4 OIDC deployment and release-control checkpoint

Status: **WP-006A DESIGN COMPLETE — READY FOR REVIEW / WP-006B NOT AUTHORIZED**

- Initial assessment date: 2026-09-28; resumed read-only assessment: 2026-09-29.
- Current approved repository baseline: `76f478aa54c648738290a559d94b10fe5ce585b3`.
- Historical pre-AG-001C baseline: `92ef181f8ae3ca836f166aa8311b8cfb9a8f2be5`.
- AG-001C is independently approved and finalized. The human adjudicated all
  three §8 blockers and authorized completion of WP-006A design only. Section 9
  is the current design; §§1–8 preserve the assessment/decision history.
- Authority: implementation plan WP-006; architecture §§21.3–21.7;
  ADR-007/010/016/017; OPS-002/003/004/013/014 and TEST-003/006;
  `V4_AWS_ACCESS_CHECKPOINT.md`; WP-004 CI and WP-005 human-access model.
- This is the completed WP-006A design and historical prerequisite-mutation
  record, **not authorization for WP-006B or application deployment**.
- Live account IDs, provider/role ARNs, directory identifiers, session IDs,
  provisioning request IDs, tokens, and raw AWS responses are deliberately
  excluded. Role names below are the approved symbolic capability names.

## 1. Historical provisioning blocker and AG-001C resolution

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
is complete. AG-001C was subsequently approved and finalized; a new human
authorization resumed read-only assessment. Section 8 records its intervening
decision stop; §9 records the subsequent human adjudication and completed design.
See [AG-001C evidence §12](AWS_ACCOUNT_MAINTENANCE_ACCESS.md#12-ag-001c--separately-authorized-narrow-reprovisioning-repair).
No further AWS permission or provisioning retry is authorized. The separate
resumption permits only the read-only WP-006A scope recorded in §8.
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

## 2. Historical GitHub observations — read-only

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

At this historical checkpoint, no complete WP-006B mutation sequence was ready.
AG-001C review and finalization are now complete and read-only WP-006A resumption
was authorized. Section 8's decisions are now adjudicated and §9.10 supplies the
completed proposed sequence. The next step is independent review of §9 and
separate WP-006B authority before any mutation.
No additional reprovisioning is needed for the completed AG-001C proof.

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

## 7. Separate AG-001C completion and historical review handoff

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

## 8. Resumed WP-006A — historical facts and decision stop (now adjudicated)

### 8.1 Baseline and inspection boundary

On 2026-09-29, HEAD was exactly the current approved baseline above and the
worktree was clean before this documentation update. WP-004 workflow/policy
files, WP-001 classifier, Netlify configuration and frozen V3 paths have no
changes relative to their approved baselines. Only this checkpoint is edited
in the resumed assessment. No AWS API was called and none of AG-001A/B/C was
re-investigated. No GitHub write, workflow change or deployment occurred.

Established AWS facts are carried forward explicitly: AccountAdmin source and
effective policies match the approved model; status and OIDC inventory reads
work; no OIDC providers exist. AccountMaintenanceAdmin is separately governed,
LegacyAdministrator is retained outside routine ShelfState work, Recovery is
deny-only pending WP-039, and root is break-glass only. None is used here.

### 8.2 Actual current GitHub observations

Authenticated GitHub REST GETs against the actual repository returned:

| Surface / read | Current evidence |
| --- | --- |
| Repository metadata | `espiercy/ShelfState`, public, personal owner (`User`); default branch `main`; caller has repository admin capability |
| Collaborators | Exactly one returned collaborator, with admin role; no second collaborating reviewer is currently established |
| Owner plan (`GET /user`) | Paid-plan name not disclosed; do not infer a subscription from missing metadata |
| Main branch / protection | `protected: false`; protection GET returns `404 Branch not protected`; no required checks |
| Rulesets / effective rules for main | Both empty; no configured ruleset bypass actors or main rules |
| Force push, deletion, PR requirement | No branch/ruleset protection against these actions; GitHub's independent default-branch constraints still apply, so absence of a deletion rule is not a claim that the current default branch can be deleted directly |
| Environments | Zero; no production reviewer, self-review, branch/tag restriction or admin-bypass setting exists yet |
| Actions permissions | Enabled, all actions/reusable workflows allowed; settings-level full-SHA pin requirement is false |
| Default token / PR approval | Default read-only token; Actions cannot create/approve pull requests through the repository setting |
| Public fork contributor policy | `first_time_contributors`: first-time contributors require workflow approval; not an all-contributors approval policy |
| Repository Actions secrets / variables | Zero each; only names/counts queried, never values; no environment entries exist to inspect |
| OIDC customization | Default subject, immutable-subject mode off, prefix `repo:espiercy/ShelfState` |
| Other repository settings | Auto-merge disabled; automatic head-branch deletion disabled; fork creation allowed |

There is still exactly one workflow, `validation.yml`. Inspection found no
credential-bearing job: no `id-token: write`, AWS credentials action, static
AWS credential value, role ARN, environment, `workflow_dispatch`, deploy
command or production release path. References to AWS credential variable
names are the existing **absence tripwire**, not a credential source.
Workflow-only immutable action pins, `persist-credentials: false`, minimal
token permissions and deterministic/audit checks remain intact, even though
repository-wide action restrictions are not yet enabled.

The approved-baseline push run
[36599348274](https://github.com/espiercy/ShelfState/actions/runs/36599348274)
succeeded. Both jobs and every returned step succeeded. Exactly two check runs
were returned for that SHA, each once and produced by `github-actions`:

- `V3 and repository boundary` (`repository-v3`);
- `V4 install and verification` (`v4-validation`).

These are the stable candidate required-check names. The earlier baseline push
run [36414738179](https://github.com/espiercy/ShelfState/actions/runs/36414738179)
also succeeded. Two intervening Dependabot PR runs currently show failure;
they are not the approved baseline, do not invalidate its successful evidence,
and were not investigated or changed as part of this release-control scope.

### 8.3 Production capability versus an actual enforced gate

GitHub documents environments, required reviewers, deployment branch/tag
restrictions, prevent-self-review and disabling administrator bypass for public
repositories. The actual repository is public and its environments API is
available, so no paid-plan upgrade is identified for those controls. This is
product-eligibility evidence, **not a rehearsal or a claim that any gate is
configured**. There is no existing environment whose reviewer/bypass settings
can be proven read-only, and no environment was created merely to test them.
Changing repository visibility requires a new capability/plan review.

Sources checked on the resumed assessment date:
[environment capabilities](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments),
[environment configuration](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments),
and [deployment review/bypass](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments).

**Decision D-01 — human release approval model.** With the one current
collaborator, enabling prevent-self-review blocks approval of their own manually
initiated release. Choose explicitly between:

1. Single-maintainer operation: the owner deliberately dispatches an exact-SHA
   release and separately approves its native protected-environment job;
   required reviewer is the owner, prevent-self-review is false, and configured
   admin bypass is disabled. This is a real second human action, not independent
   second-person review. It must not be presented as two-person separation.
2. Independent reviewer operation: identify/authorize another eligible human
   reviewer, enable prevent-self-review, and keep admin bypass disabled. This
   changes collaboration and availability requirements; adding a collaborator
   is not authorized by this assessment.

Neither is selected. Both require branch-only `main` restrictions (not merely
the same-named tag), exact revision checks and credentials only after the native
environment gate. Workflow inputs, timers or `if:` checks cannot replace it.
Repository-owner ability to **edit/remove the protection configuration** remains
a separate trust boundary even when deployment-job admin bypass is disabled.
The human must accept or separately address that residual owner authority;
claiming immutable protection against the owner would be false.

### 8.4 Main protection proposal requiring human workflow acceptance

**Decision D-02 — ordinary changes move to PRs.** Candidate active branch
ruleset targets exactly `refs/heads/main`, with no bypass actors: require a PR,
both exact GitHub Actions checks above (bound to that check producer), branch
up-to-date checks, resolved review conversations, block non-fast-forward/force
updates and deletion. Ordinary direct pushes, including the historical
finalization workflow, would stop being valid. No exception is silently added
for the owner, bots or this agent.

For the solo model, zero required approving reviews permits the author to merge
their own PR only after checks/conversations pass; stale-review dismissal and
last-pusher approval rules are then inapplicable. This provides PR/check gates,
not independent code review. Requiring at least one approving review instead
requires another eligible reviewer because authors cannot approve their own PRs.
With that independent model, propose stale-approval dismissal and review of the
latest changes; do not decide the reviewer roster or approval count implicitly.
[GitHub PR approval constraint](https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/approving-a-pull-request-with-required-reviews),
[ruleset creation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository).

An emergency protection edit would need separately authorized, documented owner
action and restoration/verification, not a standing routine bypass or weakened
AWS trust. Whether to accept PR-only operation and this emergency model is a
human workflow decision, triggering the requested stop condition now.

### 8.5 OIDC establishment authority — separate unresolved choice

The provider is absent by established AG-001C inventory; no new AWS inventory
was necessary. The committed AccountAdmin model permits provider list and exact
GitHub-provider get, but **not `iam:CreateOpenIDConnectProvider`**. Its existing
`iam:CreateRole`, `iam:TagRole` and `iam:UpdateAssumeRolePolicy` controls are scoped
to `ShelfState*` roles and cover the proposed initial role names; they do not
create the missing provider. An empty-permissions role needs no attached broad
policy or application-service grants. No privilege expansion is made here.

**Decision D-03 — first-provider establishment.** Recommended option for review:
a separately authorized, one-time account-governance use of the proven
AccountMaintenanceAdmin session solely to create the one shared GitHub provider,
followed by ordinary AccountAdmin establishment of the two named ShelfState
roles under separately authorized WP-006B. This keeps provider mutation out of
routine ShelfState permissions. The maintenance task must explicitly bound
issuer, audience, tags, exact account, readback and collision/failure stop
behavior; its broad credentials are not permission for unrelated changes.

Alternative: separately review an AccountAdmin amendment for
`iam:CreateOpenIDConnectProvider` on the exact runtime-account GitHub-provider
resource, plus `iam:TagOpenIDConnectProvider` if required for the reviewed tagged
creation. Validate action/resource and tag-on-create semantics before approval;
do not grant provider delete, audience updates, thumbprint updates or broad
provider management by implication. No such amendment is selected or implemented.
[AWS provider creation API](https://docs.aws.amazon.com/IAM/latest/APIReference/API_CreateOpenIDConnectProvider.html),
[AWS provider tagging](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_tags_oidc.html).

Both paths require new explicit establishment authority. AccountMaintenanceAdmin
is not used simply because it is broad; LegacyAdministrator and root are not
fallbacks. This decision is reported alongside D-01/D-02, not silently resolved.

### 8.6 Preserved design constraints and deferred work

These constraints are not a completed WP-006B plan:

- Provider issuer `https://token.actions.githubusercontent.com`; audience
  exactly `sts.amazonaws.com`. Account IDs remain runtime-only.
- Candidate roles `ShelfStateV4DevDeploy` / `ShelfStateV4ProdDeploy`; trust uses
  `StringEquals` for the audience and respectively
  `repo:espiercy/ShelfState:environment:dev` or
  `repo:espiercy/ShelfState:environment:production`. No owner/repository wildcard,
  PR subject or cross-environment alternative. Environment subjects lack a
  separate branch binding, so reviewed workflows and environment branch/tag
  restrictions are mandatory complementary controls.
- Initial roles have no application-service permissions; OIDC assumption and
  caller-identity proof only. Future permission changes require concrete
  resource/action review; neither role gets AdministratorAccess/PowerUserAccess.
- Current AccountAdmin model lacks CloudFormation bootstrap inventory authority.
  Existing toolkit-stack state is therefore **unknown**, not absent; no denied
  probe or permission expansion was attempted. Recommend deferring bootstrap
  until concrete resource-scoped execution authority can be reviewed. Separate
  toolkit qualifiers alone do not establish dev/prod IAM isolation.
- The unresolved design still must bind workflow-definition SHA, requested full
  SHA, immutable checkout, artifact/template digests, deployed revision and
  environment-specific known-good rollback evidence. Static WP-003 guards,
  structured live change analysis and human preview are distinct gates;
  unstructured diff text alone is insufficient. Full fail-closed destructive
  change and rollback design/tests remain pending, not claimed complete.
- AWS IAM/OIDC expected fixed service charge remains `$0`; any eventual artifact
  S3/ECR storage is usage-driven and must be estimated before bootstrap. No
  GitHub plan purchase is identified or authorized; a second-reviewer workflow
  is a human availability/access decision, not necessarily a paid feature.

No deployment workflow, credential action revision, new design/policy module or
test assertion is committed for an unadjudicated design. Existing policy tests
remain unchanged. The ordered next steps are human adjudication of D-01–D-03,
completion and independent review of WP-006A, then a separately authorized
WP-006B mutation sequence with prerequisites verified before credentials can
be issued. No exact execution sequence is represented as approved or complete.

### 8.7 Verification and stop handoff

The resumed assessment stops for human review under the explicit workflow and
establishment-authority stop conditions. Only this checkpoint is left modified;
no local commit or push is made. No AWS call, GitHub setting change, OIDC provider,
deployment role, CDK bootstrap, application deployment, WP-006B or WP-007 work
occurred. Fresh local integrity checks passed: root 149/149, focused WP-001
6/6, CI-policy 15/15 and human-access 17/17 (38 focused tests total), tracked
credential tripwire, separate checkpoint redaction/whitespace checks and
`git diff --check`. The V3 boundary build and independent source/artifact checks
each confirmed exactly 42 files and SHA-256
`2b973f2a0c83fe0ca7df51528980f5d2cb142e3e8b3b2411e8727e303560af3a`.
Full V4 clean install/verify and dev/prod synth were not rerun after this
documentation-only decision stop; their prior successful results retain their
AG-001C finalization scope, not a completed WP-006A verification claim.

## 9. Final WP-006A design after human adjudication

This section supersedes §8's unselected options, not its factual observations.
It is a design for separately authorized execution, not evidence that GitHub
controls or deployment identities already exist. No GitHub or AWS mutation was
made for this design. Traceability: WP-006; ADR-007/010/016/017; architecture
§§21.3–21.7; OPS-002/003/004/013/014 and TEST-003/006; T-13/T-20 and
C-07/C-09/C-16/C-22. V3, existing validation workflows and AWS policies remain
unchanged. The baseline remains the full SHA at the top of this document.

### 9.1 Adjudicated human decisions and trust limits

| Decision | Approved design |
| --- | --- |
| Production approval | Owner starts release, then separately approves the native protected `production` environment job; owner required reviewer, `prevent_self_review: false`, admin deployment-gate bypass disabled |
| Main changes | PR required, 0 approving reviews, both existing CI checks required, branch up to date, force pushes/deletion blocked, no bypass actors |
| Provider creation | Separate one-time explicitly authorized MFA-backed AccountMaintenanceAdmin task; no permanent provider-create addition to ShelfStateAccountAdmin |
| CDK bootstrap | Deferred until concrete deployment resources and least-privilege execution authority can be reviewed |

This is **one-human deliberate release control**, not peer review or two-person
control. The owner may self-merge passing PRs. No collaborator is added. When a
trusted deploy-capable reviewer is added, reconsider independent approval and
`prevent_self_review: true`. The owner can still administratively edit/remove
repository/environment settings; no workflow can make those controls immutable
against its own administrator. Ordinary bypass is disabled; emergency settings
changes require separately recorded human authority, bounded use, restoration
and readback. No automatic break-glass or credentials fallback is designed.

### 9.2 Exact main ruleset and environment settings

Proposed branch ruleset name `shelfstate-main-validation`, `target: branch`,
`enforcement: active`, conditions include only `refs/heads/main`, exclusions
empty, `bypass_actors: []`. Required rule types/parameters:

- `pull_request`: `required_approving_review_count: 0`; no code-owner review,
  stale-review dismissal or last-push approval requirement. No signed-commit
  requirement is introduced without a reviewed signing workflow.
- `required_status_checks`: `strict_required_status_checks_policy: true`;
  require `V3 and repository boundary` and `V4 install and verification`.
  Resolve each `integration_id` from the actual successful check's GitHub
  Actions producer, not an arbitrary status context or client-supplied ID.
  Verify both remain unique. No new release/proof check becomes a main check.
- `non_fast_forward` and `deletion`: enabled; no bypass actors.
- `required_review_thread_resolution: true` within the PR rule: selected because
  it applies only when actual review threads exist and prevents leaving a known
  discussion unresolved. It adds no reviewer requirement or ritual on a PR
  without threads. The owner can resolve addressed discussions.

Both environments use `deployment_branch_policy` with
`protected_branches: false`, `custom_branch_policies: true`, and exactly one
deployment branch policy `{ "name": "main", "type": "branch" }`.
There is no tag policy, wildcard, PR merge ref or "all protected branches"
shortcut. Explicitly verify returned rule type; a same-named tag is not the
approved branch. Do not use `refs/heads/main` as the branch-policy name pattern.

| Environment | CDK name | Reviewer | Self-review | Admin gate bypass | Allowed initial trigger |
| --- | --- | --- | --- | --- | --- |
| `dev` | `dev` | None | Not applicable | Disabled where exposed | Manual `workflow_dispatch` from main |
| `production` | `prod` | Exact repository owner, resolved at execution | Allowed, by human decision | Disabled | Manual `workflow_dispatch` from main only |

Manual-only dev is selected initially to keep the proof surface small; automatic
main dev deployment is allowed by architecture but not part of the first
inert WP-006B workflow. PR validation never references either environment.
Production has no push, PR, `pull_request_target`, `workflow_run`, reusable-call
or scheduled entry point. Wait timers are unnecessary. Environment approval is
a native job scheduling gate, not a Boolean input or shell test.

The repository is public and these native protections need no paid upgrade.
No environment currently exists; exact readback and a blocked-job rehearsal are
WP-006B acceptance prerequisites, not assumed accomplished here.
[Branch/tag API](https://docs.github.com/en/rest/deployments/branch-policies),
[ruleset API](https://docs.github.com/en/rest/repos/rules),
[environment controls](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).

### 9.3 One-time provider task and existing AccountAdmin coverage

The later provider task is separate account governance and needs its own
explicit execution authorization. In a fresh human-confirmed MFA-backed
AccountMaintenanceAdmin session: verify temporary caller and correct management
account; list providers; require none exist; create exactly one issuer
`https://token.actions.githubusercontent.com` with exactly one client ID
`sts.amazonaws.com`; read back exact URL, audience and runtime-account provider
ARN; record symbolic evidence and stop. A newly discovered provider/collision
requires review, not adoption, overwrite, deletion or retry. Submit creation
once; on ambiguous timeout read-only reconcile before reporting, never duplicate
blindly. No deployment role is created in that task. No root or legacy identity.

Select **no provider tags initially**; there are no unreviewed tag keys/values.
Do not hard-code a copied thumbprint: AWS's create API permits omission and
retrieves the intermediate CA thumbprint. Review its actual readback as metadata;
do not mutate thumbprints or audiences. Revalidate current API behavior at
execution. No provider create/update/delete rights are added to AccountAdmin.
[AWS creation semantics](https://docs.aws.amazon.com/IAM/latest/APIReference/API_CreateOpenIDConnectProvider.html).

After provider verification, ShelfStateAccountAdmin establishes the exact two
roles at IAM path `/`, with maximum session duration 3,600 seconds. Proposed tags
are `Project=shelfstate-v4`, `Environment=dev|prod`, and
`ManagedBy=ShelfStateBootstrap`; do not falsely tag these initial identity
bootstrap objects as deployed by CDK. Trust JSON/configuration are versioned
bootstrap artifacts; later IaC adoption requires explicit ownership review,
not recreation of the existing provider or roles.

| Needed operation | Current reviewed AccountAdmin coverage | Initial use |
| --- | --- | --- |
| `iam:CreateRole` | `arn:aws:iam::<runtime-account-id>:role/ShelfState*` | Create the exact two roles, with trust supplied in the create request |
| `iam:UpdateAssumeRolePolicy` | Same namespace | Covered; do not overwrite a collision/preexisting role without separate review |
| `iam:TagRole` | Same namespace | Only the three reviewed role tags |
| `iam:GetRole`, role-policy/attachment/tag reads | Existing IAM inventory | Readback and empty-permissions verification |
| `iam:PutRolePolicy`, `iam:AttachRolePolicy` | Existing ShelfState role/policy scope | **Not needed or invoked**: initial roles have no identity permissions |
| `iam:PassRole`, `sts:AssumeRole` | Explicitly denied | Not required for creating these inert web-identity roles |
| Provider creation | Absent | Separately authorized maintenance task only |

Dependency-free assertions materialize the **existing unchanged model** with
synthetic bindings and prove the needed allows for both exact role ARNs, denied
wrong-account/unrelated-role cases, preserved role-use denials and absent
provider-create authority. The existing model's role wildcard is broader than
these two names; the execution task is bounded to the exact names. **No policy
amendment is required** for the selected initial operations. This is policy
coverage evidence, not a claim that a future CreateRole call has succeeded;
unexpected AWS denial or organizational constraint stops execution.

### 9.4 Exact role trust and minimal authority

Both role trusts have exactly one Allow statement: action
`sts:AssumeRoleWithWebIdentity`; Federated principal only
`arn:aws:iam::<runtime-account-id>:oidc-provider/token.actions.githubusercontent.com`;
`StringEquals` for audience `sts.amazonaws.com` and the one corresponding subject:

| Role | Exact subject |
| --- | --- |
| `ShelfStateV4DevDeploy` | `repo:espiercy/ShelfState:environment:dev` |
| `ShelfStateV4ProdDeploy` | `repo:espiercy/ShelfState:environment:production` |

No `StringLike`, extra statement/principal, repo/owner wildcard, branch or PR
subject. The actual repository uses the legacy name-based default subject;
rename/transfer/immutable-subject migration requires trust review, not broadening.
Environment subjects do **not** independently bind the branch or workflow file.
Environment branch restrictions and the reviewed credential-bearing workflow
inventory are therefore security boundaries, not optional convenience checks.
Do not claim that rejecting a `pull_request` subject alone excludes a malicious
PR workflow that asks for an environment subject. Enforce all three boundaries:
no PR credential jobs, main-only environment rules, exact AWS trust.

No managed/inline permission policy is attached to either role initially. No
CloudFormation, IAM mutation, application data or deployment rights; prod is not
broader than dev. The only positive service proof is STS caller identity, which
does not require an identity-policy allow. Each later deployment package must
review exact actions/resources, pass-role/role-chain needs, dev/prod isolation,
stateful protections and cost before adding permissions. No hypothetical
WP-007 permissions or bootstrap execution policy is preauthorized.
[OIDC subject/claim behavior](https://docs.github.com/en/actions/reference/security/oidc),
[AWS trust guidance](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws).

### 9.5 Workflow and credential design — not executable workflows yet

WP-006B may propose exactly `v4-dev-release.yml` and
`v4-production-release.yml` in addition to existing `validation.yml`, and must
revise WP-004's exact workflow-inventory policy in the same reviewed PR. Preserve
the two validation job names and all existing no-credential PR checks. New
release jobs must have different names, job-level permissions and separate
environment concurrency groups `shelfstate-v4-dev` / `shelfstate-v4-production`,
`cancel-in-progress: false`. Serialization covers prepare, approval, proof and
eventual mutation; never automatically cancel an executing production change.
GitHub's pending-run behavior is not a durable FIFO; a canceled pending run
cannot be treated as released or known-good.

Both workflows initially dispatch manually with required string `commit_sha`.
Reject any dispatch ref except branch `refs/heads/main`. Workflow-level token
permissions are `contents: read`; prepare has no environment or ID-token right.
The deploy/proof job needs prepare, uses its exact fixed environment and has only
`contents: read`, `actions: read`, `id-token: write` (the latter only here).
All steps in that job start after environment approval, including artifact
verification; obtaining an ID token is never a prepare-job operation.

Credential-free prepare: verify dispatch provenance/full SHA/main ancestry;
checkout immutably, rerun validation/clean install/audits/synth; compare templates
to recorded baseline; publish candidate manifest and human-readable preview.
No target-commit script runs with credentials. Later privileged jobs use reviewed
controller scripts from the separately recorded workflow-definition revision,
not arbitrary scripts from the requested candidate. Unpack verified artifacts
as data with path/link checks; do not evaluate artifact-supplied commands.

Post-approval job: validate run/attempt/manifest/digests, obtain only its fixed
role through OIDC, verify expected account/role/session lifetime, revalidate live
baseline and destructive gates, then **identity proof only in WP-006B**. No
deploy command, shell-commented deployment placeholder, deploy Boolean or
permissions that would make application deployment possible. A later reviewed
package is required to introduce actual deployment and its authority.

Proposed official actions, resolved read-only on 2026-09-29:

| Action | Immutable revision | Reason |
| --- | --- | --- |
| `actions/checkout` | `3d3c42e5aac5ba805825da76410c181273ba90b1` | Existing WP-004 pin; `persist-credentials: false` |
| `actions/setup-node` | `820762786026740c76f36085b0efc47a31fe5020` | Existing WP-004 pin; `node-version-file: v4/.nvmrc`, `package-manager-cache: false` |
| `aws-actions/configure-aws-credentials` v6.3.0 | `e1253824e5c10ff9df46874f81ed3ec929e19cfd` | Official maintained OIDC acquisition/cleanup; no custom token transport |
| `actions/upload-artifact` v7.0.1 | `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` | Immutable run-bound evidence upload |
| `actions/download-artifact` v8.0.1 | `3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c` | Retrieve exact producer/run artifact, independently verify bytes |

Every use of that pinned setup-node action must explicitly supply:

```yaml
with:
  node-version-file: v4/.nvmrc
  package-manager-cache: false
```

This applies to credential-free prepare jobs and to environment/OIDC-gated
deploy/proof jobs if setup-node is used there. Do not rely on action defaults:
V4 declares npm through `packageManager`. Release jobs deliberately disable
automatic npm dependency caching to preserve the WP-004 supply-chain posture
and avoid an unnecessary cache-poisoning surface in OIDC-capable workflows.

**GitHub release workflows do not restore or save dependency/package-manager
caches.** No `actions/cache`, setup-node `cache: npm`, other dependency-cache
action, or ad-hoc restore/save cache step may enter the release workflow without
separate review. Workflow artifacts are not dependency caches; candidate/release
artifacts remain allowed under the existing SHA/digest/run binding. The executable
design binds each modeled setup-node use's `uses` identity separately from its
required `with` inputs and keeps the strict approved action inventory.

These are design candidates, not installed/activated actions or an assertion
that pinning is a complete code audit. WP-006B reviews pinned source/action.yml,
runtime compatibility and advisories before activation; changing a pin requires
review. Credentials action inputs: exact runtime role ARN, region `us-west-2`,
explicit audience, expected `allowed-account-ids`, 900-second requested session,
run/attempt-based non-personal session name, account masking, clear inherited
credentials, no existing-credential reuse or role chaining, credential outputs
off, input-from-environment translation off, bounded timeout/retries. No static
AWS key/session-token input, token file, alternative STS endpoint or stored
credential output. The pinned action uses Node 24. Never print raw OIDC tokens.
Non-secret account/role bindings may be future environment variables populated
from runtime verification; no live identifiers are committed here.
[Pinned action source](https://github.com/aws-actions/configure-aws-credentials/tree/e1253824e5c10ff9df46874f81ed3ec929e19cfd).

### 9.6 Exact revision and artifact binding

Require a lower-case full 40-hex commit SHA; reject `main`, tags, abbreviated
SHAs, expressions and shell syntax. Pass inputs as quoted data, never interpolate
them into executable shell. Fetch from the fixed repository, prove it resolves
to a commit reachable from fetched protected main, and record that main tip.
No PR head/merge ref, arbitrary repository URL or mutable checkout reference.
After detached checkout, `git rev-parse HEAD` must equal the requested SHA.
Require the approved validation checks for that exact candidate and rerun the
release checks; do not borrow green checks from another revision.

| Identity | Binding rule |
| --- | --- |
| Workflow/controller revision | Record `github.workflow_sha`, workflow path/ref and controller file digest; require dispatch from protected main and approved workflow/controller; it can differ from an older release candidate |
| Requested revision | Validated full input SHA, intended repository and protected-main ancestry |
| Checkout revision | Exact detached HEAD equals requested SHA |
| Synth/artifact | Build only in candidate checkout without credentials; hash complete sorted relative-path inventory, template bytes, assets, assembly and resolved non-secret configuration |
| Deployed revision | Later result record must reference the same candidate SHA and approved manifest/content digests; never substitute then-current main |
| Known-good revision | Only a successful deployment plus passed required smoke and retained verified evidence; identity proof is never known-good application deployment |

Versioned candidate manifest binds repository, requested/checkout/workflow SHAs,
workflow path/digest, environment (`production` maps explicitly to CDK `prod`),
run ID/attempt, UTC timestamp, Node/npm/lockfile digest, exact action pins,
resolved configuration digest, recorded deployed-baseline digest/version,
sorted complete file path/SHA-256 inventory and preview digest. The manifest
does not hash itself recursively: record its own digest in the run summary and
later result record. Binary bytes hash unchanged; template canonicalization,
if used for comparisons, is separately identified from raw artifact hashing.

Use immutable artifact IDs and exact producer run/attempt/repository, not
"latest", matching name alone, or an artifact supplied through workflow input.
Validate service-returned artifact identity plus independent content digests;
checksum warnings must be made fatal. Reject missing/extra/duplicate files,
absolute/traversal paths, symlinks and mismatched environment/configuration.
Reruns create new evidence and need fresh approval; no reuse of prior approval
after a changed run attempt, artifact, baseline or workflow revision.

### 9.7 Preview before approval; live gate after approval

Pre-approval prepare runs static WP-003 safeguards and structured candidate vs
last verified deployed-baseline template comparison, with a reviewable summary.
This is explicitly an **offline recorded-baseline preview**, not a claim of live
AWS freshness. The initial WP-006B case is an empty six-stack fixture/proof with
no deployments; there is no invented deployed stack baseline. For future first
application deployment, authenticated absence inventory must be collected under
that package's separately reviewed read authority before approval evidence.

No production AWS credential exists before the environment gate. After approval,
future scoped read authority confirms live stack/template/configuration identity
still equals the recorded baseline and rebuilds the structured change assessment.
Any drift or materially changed preview stops the run, publishes new evidence,
and requires a newly prepared/approved run. No hidden read-only production role
or use of AccountMaintenanceAdmin is introduced to perform pre-approval diff.
Live `cdk diff` is useful supplementary evidence once read authority exists; it
cannot be honestly promised by inert roles in WP-006B.

The definitive later gate combines:

1. Static candidate and prior templates, explicit WP-003
   `ShelfStateStatefulPolicy` metadata and type-based inventory across **all**
   stacks (including absent/removed stacks), parameters and nested templates.
2. Structured service change evidence, including every resource's action and
   replacement determination; complete pagination, baseline IDs and resolved
   inputs. Unknown resource schemas, macros, custom/nested behavior or conditional
   replacements fail closed until explicitly supported. CloudFormation change-set
   creation is itself an AWS management mutation: if used later it occurs only
   after approval and separately authorized scope, never in credential-free
   prepare or WP-006's inert proof.
3. Human review of IAM/public-access/data effects and comparison to the originally
   approved preview. Human approval alone cannot override a hard rejection.

| Classification | Required behavior |
| --- | --- |
| Always reject this run | Missing/inconsistent evidence; revision/content/environment mismatch; live drift; incomplete changes; unknown/conditional replacement; unsupported macro/nested effects; missing stateful metadata; Governance-to-Compliance Vault Lock; invalid protection declarations |
| Separately authorize/design, never a routine override | Any removal or replacement (including a missing stack), retention weakening, stateful reclassification, DynamoDB/Cognito protection weakening, BackupPlan/Vault Lock change/removal, protected DNS/certificate replacement; require recovery/compatibility plan and new reviewed evidence/run |
| Informational only after guards pass | Unchanged resources, valid additions, non-replacing resolved changes with protections preserved; IAM/public/network changes remain explicitly highlighted for human review |

Retained resources keep both `DeletionPolicy: Retain` and
`UpdateReplacePolicy: Retain`. Track old and new type/metadata, so deleting a
classification cannot hide a stateful resource. Check DynamoDB
`DeletionProtectionEnabled`, Cognito `DeletionProtection`, backup retention
and Governance `LockConfiguration` (no `ChangeableForDays`). Initially reject
all changes to existing backup plan/vault configuration for separate WP-039
review, even if a change appears to strengthen retention; do not guess costs or
irreversibility. No exception input/path is implemented in WP-006B.
[Structured replacement evidence](https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_ResourceChange.html).

### 9.8 Known-good evidence and rollback

Future successful releases append a result manifest linking candidate-manifest
digest, environment, actual deployed revision, stack/deploy outcomes, smoke
results and timestamps to the exact original run/artifact identities. Eligibility
requires successful deployment, all required smoke/verification passed, and
retained artifact/template bytes whose digests verify. Failed/canceled/proof-only
runs are never eligible. Smoke failure means unaccepted release and incident /
reviewed rollback handling, not promotion into the ledger.

Initially retain evidence as immutable GitHub Actions artifacts with explicit
90-day retention (within observed repo retention), no overwrite; a separately
reviewed future storage change is needed for longer retention. Run provenance,
eligibility and content are verified against GitHub API plus the result record,
not a user-provided JSON claim. Missing/deleted/expired evidence makes the record
ineligible, even if the source SHA still exists. No S3 evidence bucket, mutable
"latest good" tag, custom platform or indefinite cost is introduced now.

Rollback is an explicit mode of the same later release path, selected by exact
known-good record identity and full SHA, never a free-form old SHA. Resolve the
record only in the target environment, verify original digests and workflow
provenance, use retained artifact bytes, and record the current approved rollback
controller separately from the historical build controller. No silent rebuild
of changed assets is equivalent to the retained release. Re-run current safety
checks and compare against **current** deployed state; the same protected
environment approval, exact-SHA/live-drift gate and concurrency apply. Changes
to protection or incompatible schema/data stop rollback for recovery planning.
Application/configuration rollback does not restore DynamoDB, account data,
Cognito or backups; those require separate migration/recovery authority.

### 9.9 CDK bootstrap and cost decision

**DEFER bootstrap**, as human-approved: both foundations have six stacks and
zero resources; default broad CloudFormation execution would grant hypothetical
future authority. Existing toolkit state remains unknown because current
AccountAdmin has no CloudFormation inventory scope, not because absence was
proved. No unauthorized probe was made. Later work must separately review
`us-west-2`, eventual `us-east-1` ACM needs, per-environment artifact S3/ECR and
resource policies, execution-role trust/pass-role restrictions, qualifier/toolkit
collision inventory and cross-environment denial. Shared/default bootstrap or
separate qualifiers alone are not accepted as IAM isolation. No blanket default
AdministratorAccess bootstrap policy is authorized.

IAM/OIDC expected fixed cost is `$0`; inert proof adds no application resource.
GitHub's current public repository needs no paid-plan upgrade for the approved
native gate. Workflow/artifact consumption remains subject to actual platform
limits/retention; no purchase is authorized. Future bootstrap storage/request
costs need explicit estimates without promotional credits and Personal-model
revalidation before implementation.

### 9.10 Exact proposed WP-006B stages — separate authorization required

| Order | Authorized-later stage / actor | Binary checkpoint / stop |
| --- | --- | --- |
| 1 | GitHub owner creates exact §9.2 active main ruleset | Read back main-only target, 0 reviews, both producer-bound checks, strict updates, no bypass/force/delete; all further ordinary code changes use PRs |
| 2 | GitHub owner creates `dev` environment | Exactly branch `main`, type `branch`, no tags/wildcards/reviewer |
| 3 | GitHub owner creates `production` environment | Same branch restriction; exact owner reviewer; `prevent_self_review: false` (owner may approve); admin gate bypass false |
| 4 | Independent read-only verification of ruleset/environments | All returned settings match; no unexpected existing control; stop before trust on mismatch. Runtime approval behavior is rehearsed in stages 11–13 once workflows exist |
| 5 | **Separately authorized account-governance task**, fresh MFA AccountMaintenanceAdmin, creates provider only | Require absent provider inventory, exact issuer and sole audience, no tags; one creation attempt; no roles or unrelated changes |
| 6 | Provider readback, then stop maintenance use | Correct runtime account/ARN/URL/audience; no raw identifiers in repository; AccountAdmin read confirms intended provider; failure stops |
| 7 | Separately authorized ShelfStateAccountAdmin creates two root-path inert roles | Revalidate unchanged policy coverage, no role collisions, exact trust/tags/3,600-second maxima; zero attached/inline permissions; readback. No provider amendment |
| 8 | Local negative trust tests plus exact AWS trust readback | Wrong owner/repo/audience/PR/branch/environment denied by exact conditions; IAM simulator limitations are not presented as actual federated STS proof |
| 9 | Reviewed PR adds two proof-only manual workflows and revises workflow-inventory/CI tests | Immutable pins, controller/candidate separation, manifest/diff/rollback fixture tests, per-job OIDC, no application deploy; existing required checks pass before self-merge |
| 10 | PR-origin credential exclusion proof | Existing PR validation has no ID-token permission or environment; adversarial policy fixtures reject credential jobs. Controlled negative environment/ref tests cannot mint an allowed environment token; do not grant PRs ID-token rights just to demonstrate denial |
| 11 | Main dev dispatch with exact candidate SHA | Dev can assume dev; its token fails assuming prod; identity-only service proof. Wrong-audience/wrong-sub tests use controlled fixtures or explicitly bounded nontrusted test contexts, never arbitrary third-party repo access |
| 12 | Main production dispatch prepares evidence and enters environment wait | Observe required owner approval; no job runner/production OIDC before approval. Reject/cancel proof shows no production session. Main/tag/PR ref negatives fail |
| 13 | New deliberate production proof run and explicit separate owner approval | Only after approval, acquire prod role, verify account/role and short lifetime, cross-environment negative proof; **no application mutation**, no known-good deployment promotion |
| 14 | Record redacted run/job/artifact/trust/CloudTrail evidence and policy-empty readbacks | Demonstrate actual provider/role assumption separately from fixture tests; no tokens, account IDs or raw session ARNs committed |
| 15 | Stop for WP-006B review | No bootstrap, resource deployment, permissions extension, rollback execution or WP-007; partial failure never triggers automatic cleanup, widening or credential fallback |

This ordering follows the adjudication. Settings are independently read back
before AWS trust exists; native approval **behavior** cannot be proven until a
workflow exists and is explicitly verified before any future application
authority. Inert roles bound the first rehearsal. Once main protection activates,
an unmerged local commit cannot be finalized by the old direct-push procedure;
use a branch/PR with existing checks. No temporary bypass is needed to add new
workflows because zero required peer approvals was intentionally selected.

At each stage, stop on an unexpected resource, extra permission, missing product
control, identity ambiguity, policy denial, test failure or unavailable evidence.
Preserve created state and report it; no delete/recreate, broad policy, third
principal, root or legacy fallback is authorized by the sequence.

### 9.11 Design assertions and verification scope

`v4/checks/support/release-control-design.mjs` and its `.case.mjs` tests are
dependency-free executable **design specifications**, not production guards,
JWT validation, deployed IAM simulation or workflow implementation. They have no
AWS/GitHub client and are not imported by application/IaC entrypoints. Synthetic
claims and evidence must not be mistaken for independently collected live data.
The model deliberately fails closed on its small supported structured surface;
WP-006B+ must supply real provenance, complete cross-stack inventory, service
change adapters and hosted negative proofs before deployment use.

Tests exercise positive and negative exact trust, wrong subjects/audience,
wildcard trust, PR/push/ID-token/approval bypass, full-SHA/main-history/run/artifact
binding, complete non-replacing changes, retention/deletion protection, backup
Governance lock, known-good-only rollback and existing AccountAdmin coverage.
Cache regressions mutate both jobs in both environments to reject missing or
enabled automatic caching, changed Node version files, pinned actions without
inputs, changed setup-node revisions, extra cache actions and ad-hoc cache steps.
`npm run test:design` is included in full V4 verify; no workflow or dependency
is added. New security fixture behavior is continuously checked by the existing
credential-free validation job. Final command results and commit SHA are
reported at handoff; this document does not claim hosted enforcement before
WP-006B or embed a self-referential commit hash.

### 9.12 Local completion evidence — 2026-09-29

The complete verification set below was rerun after the release-cache remediation.

| Verification | Result |
| --- | --- |
| Root `node --test` | 149 passed, 0 failed |
| Focused WP-001 / CI-policy tests | 6 / 15 passed, 0 failed |
| Human-access / release-design / infrastructure assertions | 17 / 17 / 8 passed, 0 failed; release-design count includes six cache-remediation regressions |
| V4 deterministic install and full verify | `corepack npm ci` and `corepack npm run verify` passed with Node 24.13.0 and npm 11.6.2; package 9 and contract 1 tests also passed |
| Dev / prod synth and offline preview | Each environment: exactly 6 stacks, 0 resources; preview and inert V4 build passed |
| Dependency checks | No dependency or lockfile change; audit found 0 vulnerabilities; 26 registry signatures and 9 available attestations verified |
| Credential / redaction checks | Tracked-file tripwire and changed-design live-identifier pattern checks passed; evidence remains symbolic |
| V3 boundary | Source and built publication each exactly 42 files; both digests equal `2b973f2a0c83fe0ca7df51528980f5d2cb142e3e8b3b2411e8727e303560af3a` |
| Scope / whitespace | `git diff --check` passed; existing workflow, CI/boundary scripts/tests, V3 runtime, IaC and human policy sources unchanged |

This completion pass made no AWS call or AWS/GitHub mutation, created no provider
or role, and performed no bootstrap or deployment. Earlier read-only GitHub
assessment is distinguished from the historical separately authorized AWS
prerequisite mutations above. Hosted release-gate/OIDC enforcement remains a
future WP-006B proof; local fixtures do not claim to establish it. The authorized
design commit is local only, with final SHA and worktree status reported at
handoff. WP-006B and WP-007 have not begun.
