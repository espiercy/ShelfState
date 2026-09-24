# ShelfState V4 AWS human-access checkpoint

Status: **WP-005C1 REMEDIATION COMPLETE — READY FOR FINAL REVIEW / WP-005C2 ON HOLD**

- Assessment date: 2026-09-21
- Repository baseline: `532be5c240ac62dd4fdb51cde491baba4540edb6`
- AWS evidence window: 2026-06-23 through 2026-09-21, limited by CloudTrail Event History retention
- Governing sources: `V4_ARCHITECTURE.md` §§20.3 and 21.9; ADR-007, ADR-009, and ADR-022; requirements OPS-005 through OPS-008, LIFE-009, and TEST-007
- Scope: historical WP-005B account assessment, WP-005C1 execution evidence, and human-adjudicated access boundaries
- Implementation status: WP-005C1 recorded in §15; remediation control-plane proof succeeded under §15.4; further AWS mutation requires separate authorization
- Human scope adjudication: 2026-09-27, recorded in §1.1

This document deliberately uses symbolic names. It contains no account IDs,
usernames, email addresses, access-key identifiers, MFA device identifiers,
organization or directory identifiers, portal URLs, IP addresses, event IDs,
trail or bucket names, or recovery secrets. `LegacyAdministrator`,
`PrimaryHumanPrincipal`, `RecoveryHumanPrincipal`, `ExistingUnrelatedGroup`,
and `ExistingLegacyTrail` are documentation aliases, not discovered names.

## 1. Decision summary

ShelfState needs **three human authority boundaries**:

1. `ShelfStateAccountAdmin` for rare identity and account-security administration;
2. `ShelfStateOperator` for narrow routine operational observation; and
3. `ShelfStateRecovery` for exceptional restore and recovery work.

A two-boundary Operator/Recovery model is rejected. It would either make the
routine Operator an account administrator, overload Recovery with identity
administration, or leave ordinary future account administration dependent on
root. The three-boundary model refines, rather than changes, the approved
architecture: account-level authority was already required to be separate from
routine operations and exceptional recovery.

All three paths use IAM Identity Center, MFA, temporary credentials, group-based
account assignments, and one-hour permission-set sessions. No AWS managed
`AdministratorAccess`, `PowerUserAccess`, or `ReadOnlyAccess` policy is proposed.
Generic read-only policies are unsuitable because they include application
data-plane reads.

Legacy administrator retirement is on hold under §1.1. Root remains an
MFA-protected, no-key break-glass path.

### 1.1 Account-wide administrator purpose and retirement hold

On 2026-09-27 the account owner clarified that `LegacyAdministrator` was created
to administer the entire AWS account, including cleanup of resources unrelated
to ShelfState. It is not a ShelfState-specific identity and must not be used
for future ShelfState work. ShelfState work uses its approved temporary roles;
insufficient permissions require review of the authorized role and task scope.

The account owner agreed to preserve the existing administrator for now and to
plan a separate MFA-backed, temporary account-wide administration role for
unrelated resource cleanup. That role is outside the three ShelfState authority
boundaries. `ShelfStateAccountAdmin` does not replace general AWS resource
administration or cleanup authority, and its policy must not be broadened for
that purpose.

Retirement of the legacy key, console profile, administrator membership/policy,
or IAM user is a separate account-governance decision, not a prerequisite for
ShelfState. WP-005C2 is on hold: its earlier staged-retirement proposal is
superseded and does not authorize legacy administrator retirement. Before any
retirement is proposed, the separate account-wide temporary path must be
independently verified to support the owner's required administration and
cleanup capabilities. The owner can then decide whether to retain the legacy
identity for a documented purpose or
authorize particular retirement stages. Deletion is not presumed.

Decisions to rotate, retain, deactivate, or delete the legacy IAM user's access
key belong to that separate account-wide access work, outside WP-005C1. The
legacy IAM user, access keys, console profile, MFA, groups, and permissions
remain unchanged. The three ShelfState temporary paths are the approved paths
for normal ShelfState administration, operation, and recovery; Recovery
capabilities remain limited until WP-039.

This scope adjudication does not authorize creation of the broader role,
resource cleanup, credential changes, or additional work packages. Existing
AWS permissions remain unchanged.

## 2. Observed account facts

This section preserves the WP-005B assessment-time inventory. Subsequent
WP-005C1 changes are recorded in §15; the current scope decision is in §1.1.

### 2.1 Organizations and account ownership

| Fact | Read-only evidence | Assessment |
| --- | --- | --- |
| Organizations topology | Organizations settings and account inventory | One-account organization with all features enabled |
| Current account role | Organizations settings | **Management account**, not a member account |
| Delegated administration | Organizations settings | None configured |
| Topology conflict | Comparison with WP-005A | None; the one-account observation is confirmed |

This design does not require a second account or an Organizations restructure.
Separate AWS accounts remain deferred under ADR-007.

### 2.2 Root credential posture

| Control | Observed posture |
| --- | --- |
| Root MFA | Enabled |
| Root access key slot 1 | Absent (not merely inactive) |
| Root access key slot 2 | Absent (not merely inactive) |
| Root password | Enabled, as expected for the account root user |
| Root MFA device count/type | The non-root credential report confirms an active MFA posture but does not disclose a reliable device count or device details; those details were intentionally not pursued through a root session |

The root-key stop condition is not present. Root's credential posture meets the
key/MFA baseline. The account owner subsequently attested that the reviewed
root activity described in §3 was legitimate account-recovery work used to
restore access to a dormant administrator identity. This resolves the earlier
unexplained-activity question without changing the forward control: root use is
prohibited for routine administration, and any future unexplained root use is
an escalation condition.

### 2.3 IAM credential inventory

The account has one permanent IAM user, represented here as
`LegacyAdministrator`.

| Property | Observed posture |
| --- | --- |
| Console password | Enabled |
| MFA | Enabled |
| Effective privilege | Administrator-equivalent AWS managed policy inherited through a group |
| Active access keys | One |
| Active key age | Approximately 1,616 days at assessment time |
| Active key last use | Approximately 675 days before assessment |
| Second access key | Inactive |
| Signing certificates | Inactive |
| Other IAM users | None |
| Relevant human-assumable IAM roles | None found |
| Identity Center generated IAM roles | None, consistent with zero account assignments |

Ninety-five IAM roles were reviewed. Non-service trust relationships were
application-related Cognito roles; no existing human AccountAdmin, Operator,
Recovery, or organization-access role was found. Secret key material was never
viewed or recorded.

### 2.4 IAM Identity Center posture

| Property | Observed posture |
| --- | --- |
| Instance | Organization instance in `us-west-2` |
| Identity source | Identity Center directory |
| Provisioning | Direct/manual |
| Directory users | Two enabled users; real identities intentionally omitted |
| User MFA | Each user has an MFA device |
| Groups | One manually created unrelated group containing both users |
| Permission sets | Zero |
| AWS-account user/group assignments | Zero |
| Authentication | Password plus context-aware MFA policy |
| MFA enrollment | Required at sign-in when the user has no registered MFA device |
| Allowed MFA methods | Authenticator applications, security keys, and built-in authenticators |
| Interactive portal session | Eight hours |
| Background session | Seven days |
| Trusted token issuers | None |

The existing context-aware policy prompts when sign-in context changes rather
than on every portal sign-in. It still provides an enforceable MFA enrollment
and challenge posture for Identity Center. Each proposed privileged permission
set independently limits the resulting AWS role session to one hour. WP-005C
must prove an MFA-backed portal flow for each selected symbolic principal; it
must not infer the real-user mapping from this assessment.

The current portal/session configuration is acceptable for the Personal model.
Changing the organization-wide portal session is not required by this design.

### 2.5 Existing gaps against the approved target

| Approved invariant | Current gap | WP-005C target |
| --- | --- | --- |
| Routine ShelfState human access uses temporary MFA-backed credentials | ShelfState temporary paths were absent at assessment; the permanent administrator serves the wider AWS account | Prove ShelfState Identity Center paths; legacy retirement is outside this prerequisite and on hold under §1.1 |
| Root is break-glass only | Reviewed activity was attested as legitimate account recovery; routine future root use remains prohibited | Enforce the documented break-glass procedure |
| Operator and recovery are separate | Neither authority exists | Create separate group/permission-set assignments after review |
| Account administration is not routine operation | Permanent administrator combines all authority | Establish separate AccountAdmin authority |
| Management activity is auditable | Event History works, but the legacy trail is not a management-event baseline | Retain Event History review; propose any durable trail change separately because it affects storage/cost |
| Periodic access review | No ShelfState-specific review record exists | Adopt §10 quarterly checklist |

## 3. CloudTrail review

### 3.1 Scope and limitations

The bounded review covered CloudTrail Event History from **2026-06-23 through
2026-09-21** in:

- `us-east-1`, for global IAM activity and root/console sign-ins;
- `us-west-2`, for the Identity Center instance and future ShelfState primary
  region; and
- `us-east-2`, because relevant console sign-in/root read activity was observed
  there.

The review focused on root activity, console sign-ins, access-key changes,
IAM users/groups/roles/policies, MFA, Identity Center, Organizations, and
CloudTrail configuration. Event History is Region-specific and retains only the
most recent 90 days. An event absent from this review may have occurred earlier,
in an unreviewed Region, or outside Event History's management-event scope.

### 3.2 Findings

| Region | Relevant findings |
| --- | --- |
| `us-east-1` | Six root `ConsoleLogin` records were present. The most recent inspected login succeeded with MFA. A concentrated earlier sequence included password-recovery records, IAM principal/profile cleanup, and unrelated resource cleanup. No access-key create/update/delete event appeared in the reviewed write-event set. No Organizations or CloudTrail configuration mutation appeared. |
| `us-west-2` | No IAM management events appeared. Identity Center events in the window were the read-only calls made for this assessment. CloudTrail-source events were read-only inventory calls. No trail exists in this Region. |
| `us-east-2` | Root activity in the bounded result set consisted of read-only EC2 inventory calls. The write-event view contained three console-login events and three corresponding MFA checks for the legacy administrator, including the assessment session; no account/service configuration mutation appeared. No trail or event data store exists in this Region. |

The Event History evidence establishes audit availability, not business
justification. The account owner attested that the reviewed root sequence was
legitimate account-recovery work associated with restoring access to a dormant
administrator identity. Future unexplained root use remains an incident-review
trigger. WP-005C must also confirm that the first federated AccountAdmin,
Operator, and Recovery sessions appear under the intended Identity Center role
identities.

### 3.3 Trails, event data stores, and cost posture

- One single-Region `ExistingLegacyTrail` exists in `us-east-1`.
- It is not an organization trail.
- The console labels it logging, but its last log delivery was 2024-05-08.
- It does not record management events and has no CloudWatch Logs integration,
  Insights, log-file validation, or SNS integration.
- Its legacy selector targets S3 data events for current and future buckets.
- No event data store exists in `us-east-1`, `us-west-2`, or `us-east-2`.

The legacy trail is not relied upon for the WP-005 management-event control.
Its stale delivery state and broad S3 data-event selector need a separate human
decision: S3 data events and S3 storage/requests can incur usage-driven cost.
WP-005B does not alter or remove it.

CloudTrail Event History is available at no charge for 90-day management-event
lookup. CloudTrail charges no service fee for the first copy of ongoing
management events delivered by a trail, although destination S3 usage still
costs money; data events and CloudTrail Lake/event data stores are paid usage.
No new trail, data selector, log bucket, or event data store is authorized here.

## 4. Recommended authority model

### 4.1 Assignment topology

Use group-based Identity Center account assignments:

| Symbolic group | Permission set | Proposed membership |
| --- | --- | --- |
| `ShelfStateAccountAdmins` | `ShelfStateAccountAdmin` | `PrimaryHumanPrincipal` |
| `ShelfStateOperators` | `ShelfStateOperator` | `PrimaryHumanPrincipal` |
| `ShelfStateRecovery` | `ShelfStateRecovery` | `RecoveryHumanPrincipal` |

The account owner must choose which real directory user maps to each symbolic
principal during WP-005C. This document makes no such mapping.

One person may control both symbolic principals in the Personal deployment only
if the principals remain distinct, each has its own protected authentication
path and MFA device, group membership is reviewed separately, one role is used
per session, recovery use is reason-recorded, and CloudTrail is reviewed after
recovery use. Distinct people are preferable when available.

Recovery should have a permanent group assignment to the distinct recovery
principal so loss of AccountAdmin does not prevent recovery. "Deliberate
activation" means an intentional access-portal login and explicit Recovery role
selection after recording the reason; it does not mean just-in-time group
mutation, which would create a circular dependency on AccountAdmin.

If Identity Center is unavailable and both federated paths cannot be restored,
use the root break-glass procedure in §9. Recovery must not depend on a running
ShelfState application, V4 domain, Cognito pool, or application datastore.

### 4.2 Common policy invariants

All three permission sets have a one-hour session. All are custom inline or
customer-managed policies maintained as reviewed IaC once implementation is
authorized. No broad AWS managed job-function policy is attached.

Resource placeholders in this section are intentional. WP-005C must bind
existing identity resources where possible; later packages must replace
ShelfState resource placeholders with the exact environment/account/Region
ARNs as those resources are authorized. A placeholder must never become `*`
merely to make a test pass.

The following application-content actions are denied to routine human roles,
including AccountAdmin and Recovery unless a separately reviewed incident
procedure explicitly changes the effective policy:

- DynamoDB: `GetItem`, `BatchGetItem`, `TransactGetItems`, `Query`, `Scan`,
  `ExecuteStatement`, `BatchExecuteStatement`, `ExecuteTransaction`, and
  `ExportTableToPointInTime` against ShelfState tables;
- S3: `ListBucket` on payload buckets and `GetObject*`, `GetObjectAttributes`,
  `SelectObjectContent`, and `RestoreObject` against ShelfState import/export
  or other user-payload objects;
- Cognito: `ListUsers`, `ListUsersInGroup`, `AdminGetUser`, and
  `AdminListGroupsForUser` against ShelfState user pools;
- Lambda: `InvokeFunction`, `InvokeAsync`, and `InvokeFunctionUrl` against
  ShelfState application functions;
- Secrets Manager/Parameter Store: secret-value and parameter-value reads;
- KMS: `Decrypt`, `ReEncryptFrom`, and data-key generation for ShelfState keys;
- direct application API invocation through `execute-api:Invoke` when acting as
  an AWS human role.

The names above describe prohibited API capabilities, not necessarily literal
IAM `Action` values. `TransactGetItems` is authorized by `dynamodb:GetItem`.
The three PartiQL execution APIs are authorized, according to their statements,
by `dynamodb:PartiQLSelect`, `dynamodb:PartiQLInsert`,
`dynamodb:PartiQLUpdate`, and `dynamodb:PartiQLDelete` and all four are denied.
`SelectObjectContent` is authorized by `s3:GetObject` and is covered by the
applicable `s3:GetObject*` deny. Executable policies must use these valid IAM
authorization actions rather than the API-operation names.

These are policy guardrails against accidental or routine content browsing.
An identity administrator who can change permission sets could deliberately
remove their own restrictions; therefore AccountAdmin separation also depends
on rare use, MFA, short sessions, change review, and CloudTrail. It is not a
technical defense against a malicious account administrator.

## 5. Proposed permission sets

### 5.1 `ShelfStateAccountAdmin`

**Purpose:** rare IAM, Identity Center, and account-security administration
needed by separately authorized work. It is not used for application operations,
deployment, recovery, or content access.

- Session duration: one hour.
- AWS managed policies: none.
- Application data-plane access: none.
- Recovery actions: none.
- IAM/Identity Center administration: yes, within the identity control plane.

Proposed allow boundary:

- IAM account/credential inventory and administration required to manage human,
  service, and federated roles and policies: IAM `Get*`, `List*`, credential
  report generation/read, and reviewed role/policy create/update/delete,
  attach/detach, tagging, and trust-policy actions. `PassRole` is excluded by
  default and added only for an exact service role plus `iam:PassedToService`
  condition in a separately authorized package.
- IAM Identity Center instance, permission-set, and account-assignment
  administration: required `sso:List*`, `sso:Describe*`, permission-set
  create/update/delete, inline/customer-managed policy association,
  provisioning, and account-assignment create/delete actions.
- Identity Store group and membership administration: required
  `identitystore:List*`, `Describe*`, group create/update/delete, and group
  membership create/delete actions. Routine browsing/export of personal profile
  attributes is outside purpose and must be minimized to fields needed for the
  selected mapping.
- Organizations, account, and CloudTrail **read-only** inventory:
  Organizations `List*`/`Describe*`; account `Get*`/`List*`; CloudTrail
  `LookupEvents`, `ListTrails`, `DescribeTrails`, `GetTrail`, and
  `GetTrailStatus`.

Explicit exclusions/denies:

- the common application-content deny set in §4.2;
- Organizations mutation, account closure, billing/payment mutation, and root
  credential management;
- AWS Backup restore, vault deletion, recovery-point deletion, Vault Lock
  mutation, and DynamoDB restore/export;
- application deployment/service mutation except a later separately reviewed
  policy amendment;
- unrestricted `sts:AssumeRole` and unrestricted `iam:PassRole`.

WP-005C must enumerate the exact console/API actions through policy simulation
and a constrained capability test; it must not replace this boundary with
`AdministratorAccess` when a console path initially fails.

### 5.2 `ShelfStateOperator`

**Purpose:** routine operational observation and explicitly approved safe
platform operations, without account administration, recovery authority, or
library-content access.

- Session duration: one hour. A longer session is unnecessary for the expected
  Personal workload.
- AWS managed policies: none, including no `ReadOnlyAccess`.
- Application data-plane access: none.
- IAM/Identity Center/Organizations administration: none.
- Recovery actions: none.

Proposed allow boundary, scoped to ShelfState tags and exact ARNs when available:

- CloudWatch metrics/alarms: `ListMetrics`, `GetMetricData`,
  `GetMetricStatistics`, `DescribeAlarms`, `DescribeAlarmHistory`, and approved
  dashboard/widget reads;
- CloudWatch Logs for ShelfState log groups: describe groups/streams,
  `GetLogEvents`, `FilterLogEvents`, `StartQuery`, `GetQueryResults`, and
  `StopQuery`. This is allowed only because ADR-022 requires logs to omit private
  content, tokens, URLs, request bodies, and other sensitive values;
- CloudFormation stack/resource/event/drift and template metadata reads,
  including drift detection but no stack mutation;
- control-plane status only for ShelfState resources: DynamoDB table/PITR
  description and tags; S3 bucket configuration and tags without bucket/object
  listing; Lambda configuration and policy without code download or invocation;
  API Gateway, CloudFront, ACM, Route 53, Cognito user-pool configuration,
  EventBridge Scheduler, SNS alarm, and AWS Backup job/plan/vault status needed
  to diagnose the service;
- CloudTrail `LookupEvents` for operational/audit review.

Explicit exclusions/denies:

- the common application-content deny set in §4.2;
- IAM, Identity Center, Organizations, account, billing, and trust-policy
  mutation;
- CloudFormation stack mutation, Lambda invocation, DynamoDB item/statement
  access, S3 bucket/object listing or reads, and Cognito user/profile listing;
- deployment, CDK bootstrap, backup restore/copy/delete, recovery-point or vault
  deletion, Vault Lock changes, key/secret access, and role assumption.

### 5.3 `ShelfStateRecovery`

**Purpose:** exceptional, audited restore of approved ShelfState recovery points
to isolated replacement resources. It is not a routine operator or account
administrator.

- Session duration: one hour.
- AWS managed policies: none.
- Application data-plane access: none.
- IAM/Identity Center/Organizations administration: none.
- Recovery actions: narrowly scoped, yes.

Proposed allow boundary after WP-039 creates exact recovery resources:

- list/describe approved ShelfState backup plans, vaults, jobs, recovery points,
  and restore jobs;
- obtain the restore metadata necessary for an approved recovery point;
- `backup:StartRestoreJob` only from the dedicated ShelfState recovery vault to
  the approved isolated restore target pattern;
- `iam:PassRole` only for a dedicated recovery service role, only with
  `iam:PassedToService` equal to AWS Backup;
- read DynamoDB table/PITR metadata needed to identify source and isolated
  restore targets, without item access.

Explicit exclusions/denies:

- the common application-content deny set in §4.2;
- account/IAM/Identity Center/Organizations administration;
- routine CloudWatch/log browsing or deployment;
- backup-vault, recovery-point, backup-plan, or Vault Lock deletion/weakening;
- restore over an active production table, restore promotion, table deletion,
  and direct reads of restored data;
- unrestricted `iam:PassRole`, KMS decrypt, or S3 payload access.

Restore validation should use approved automated structural/count/digest checks
under a separate service role. Promotion, destructive cleanup, Vault Lock
changes, and policy expansion each require the later package's explicit human
checkpoint. WP-039 owns final recovery ARN, retention, and Vault Lock policy
details; this document does not pre-implement them.

## 6. Policy verification required in WP-005C and later packages

WP-005B adds no executable IAM policy because no reviewed permission set exists
yet. WP-005C must add dependency-free static policy assertions and, where AWS
supports it, IAM simulation/capability tests proving at least:

- each assignment is group-based and each session is one hour;
- Operator cannot perform every action in the §4.2 deny set;
- Operator cannot administer IAM, Identity Center, Organizations, backups, or
  deployments;
- AccountAdmin can complete the approved identity-control workflows but cannot
  directly read ShelfState content or start/delete recovery operations;
- Recovery can start only the approved isolated restore with only the dedicated
  pass-role target, and cannot read restored content or delete/alter recovery
  assets;
- wrong account, Region, environment, resource ARN, tag, principal, and
  `iam:PassedToService` values are denied;
- no permission-set policy contains broad job-function managed policies,
  wildcard data-plane access, unrestricted `sts:AssumeRole`, or unrestricted
  `iam:PassRole`.

Where a future resource ARN does not yet exist, keep a named failing/pending
invariant at that package boundary rather than broadening the policy.

## 7. WP-005C migration sequence and checkpoints

WP-005C1 executed steps 1–4 and 6–8 below. Step 5 was initially deferred until
CLI tooling was available, then proved with temporary SSO credentials during
remediation (§15.4); no static credential or legacy access key was substituted.
These steps record the historical C1 sequence; step 1 does not authorize
future ShelfState use of the legacy
administrator. The former steps 9–12 for legacy credential/user retirement
were never executed and are superseded by the hold and separate
account-governance prerequisites in §1.1. Root remains break-glass under §9.

1. Using the existing authenticated administrator only for the migration,
   create the independently approved Identity Center groups and permission sets.
2. Pause for the account owner to map the two real directory users explicitly
   to `PrimaryHumanPrincipal` and `RecoveryHumanPrincipal`; add only the approved
   group memberships and group-based account assignments.
3. Verify MFA-backed sign-in through the AWS access portal for each symbolic
   principal. Failure leaves the existing administrator unchanged.
4. Verify required console capability with temporary AccountAdmin credentials.
5. If CLI access is needed, configure the AWS CLI through `aws configure sso`
   and verify temporary cached SSO credentials; create no access key.
6. Test AccountAdmin and Operator independently, including positive control-plane
   actions and negative content/recovery/identity cases.
7. Test Recovery independently, including positive metadata access and negative
   content, account-admin, and destructive cases. Do not run a real restore until
   an authorized recovery package provides a synthetic target.
8. Review CloudTrail Event History for the three intended federated role
   sessions and confirm principal, account, Region, and denied-action evidence.

## 8. Rollback and stop behavior during migration

- ShelfState assignment/policy rollback requires an explicitly authorized
  change through the approved temporary administration path. If that path is
  unusable, stop for human review; do not fall back to `LegacyAdministrator`.
- Legacy credentials remain untouched under §1.1. Any separately proposed
  retirement must define and verify account-wide rollback access; the
  restricted ShelfState roles are not sufficient proof of that capability.
- Stop WP-005C if MFA is not enforced, either
  symbolic principal cannot sign in, intended positive actions fail, any
  forbidden content/destructive action succeeds, CloudTrail cannot identify the
  sessions, or policy implementation requires broader authority than §5.

## 9. Root break-glass procedure

1. Use root only for an AWS root-required action or when all authorized
   AccountAdmin and federated recovery paths are unavailable.
2. Confirm the action cannot be completed through a temporary approved role.
3. Record the reason, intended action, start time, and operator before sign-in
   where practical. Do not put recovery details or credentials in the record.
4. Use the protected root credential and MFA. Root access keys are prohibited.
5. Perform only the bounded action, sign out, and immediately review CloudTrail
   in the applicable Region plus `us-east-1`.
6. Treat unexpected access, MFA changes, recovery changes, or suspected
   compromise as an incident; secure the account using AWS's root-recovery
   process and review all privileged activity.
7. Review root contact/recovery mechanisms quarterly. They must not depend on
   ShelfState hosting, Cognito, the V4 domain, application email, or application
   data.

## 10. Quarterly Personal access review

The ShelfState account owner performs this lightweight review each quarter and
after any privileged-access incident:

1. Generate/read the IAM credential report; verify root MFA remains active and
   both root access-key slots remain inactive.
2. Inventory IAM users, console profiles, MFA, keys, key age/use, groups,
   policies, and human-assumable roles. Investigate or remove unnecessary access
   through a separately approved change.
3. Review Identity Center users, disabled status, MFA registration, groups,
   permission sets, account assignments, session durations, and trusted token
   issuers.
4. Compare `ShelfStateAccountAdmins`, `ShelfStateOperators`, and
   `ShelfStateRecovery` membership and policies with §§4–5. Confirm the recovery
   principal can still authenticate without using the role routinely.
5. Review role trust and pass-role edges, especially any principal that can
   deploy, alter identity, or affect backups/Vault Lock.
6. Review CloudTrail privileged events in `us-east-1`, `us-west-2`, and every
   Region with relevant account activity. Include root, console/federated
   sign-ins, IAM/MFA/Identity Center/Organizations/CloudTrail changes, access-key
   changes, denied content reads, and recovery activity.
7. Review `ExistingLegacyTrail` delivery/configuration and attributable cost;
   do not treat it as the management-event control while delivery is stale.
8. After WP-006, review GitHub OIDC providers and deploy-role trusts, GitHub
   environment approvals, and branch protection/rulesets.
9. Record date, reviewer, redacted findings, remediation owner, and target date
   in the governed access-review evidence.

Escalate immediately rather than waiting for the quarter if a root key appears,
root MFA is disabled, privileged activity is unexplained, a trust/policy or
assignment changes unexpectedly, a user's MFA is lost/disabled, recovery access
cannot be proven, or a human role gains application-content access.

## 11. WP-006 prerequisite

GitHub `main` is currently unprotected and no ruleset exists. Deployment/OIDC
authority must not be enabled until an authorized WP-006 establishes and proves
the required repository/environment approval controls. WP-005B makes no GitHub
change and creates no deployment role.

## 12. Cost

- IAM Identity Center workforce identity, permission sets, account assignments,
  and temporary role sessions have no additional service charge under current
  AWS product terms. WP-005C should therefore add **$0 expected fixed AWS cost**
  and **$0 expected usage-driven identity cost**.
- IAM users, roles, and policies have no direct service charge.
- CloudTrail Event History management-event lookup has no charge.
- The first ongoing management-event copy delivered by a trail has no
  CloudTrail service charge, but S3 storage/request charges still apply.
- `ExistingLegacyTrail` can incur S3 data-event charges and destination S3
  charges if delivery/events occur. Its last observed delivery is stale, so no
  current spend is inferred from configuration alone.
- No CloudTrail Lake/event data store exists; none is proposed. No paid identity
  or audit feature is required for WP-005C.

The design remains compatible with the approved Personal cost model. Any
future durable management trail or change to the legacy data-event selector
requires separate cost estimation and authorization; promotional free tiers
must not be assumed.

## 13. Assessment handling and non-actions

- The IAM credential report was generated/read solely for this authorized
  assessment. Its temporary local raw CSV was deleted after extracting the
  redacted facts above and is not a repository artifact.
- No production/application data, object names, DynamoDB items, Cognito user
  profiles, secrets, or credential values were inspected.
- WP-005C1 created only the three approved Identity Center groups, the three
  approved permission sets and inline policies, the approved symbolic group
  memberships, and the three corresponding AWS-account assignments described
  in §15. No access key, console profile, IAM user, MFA setting, trail, event
  data store, organization/account setting, application resource, or deployment
  resource was created, modified, disabled, deactivated, or deleted.
- Root was not used. `ExistingLegacyTrail` was not modified. The legacy
  administrator access key, console profile, administrator group/policy, and IAM
  user remain unchanged for their separate account-wide purpose under §1.1,
  not as a fallback for ShelfState work.
- No AWS bootstrap or deployment occurred.
- WP-005C2 and WP-006 were not started.

## 14. WP-005C authorization prerequisites

Independent review must approve all of the following before a narrowly scoped
WP-005C is authorized:

- the three-boundary refinement and provisional group/permission-set names;
- the real-to-symbolic principal mapping, supplied explicitly by the account
  owner outside repository documentation;
- the exact AccountAdmin identity-control action list and its acknowledged
  self-escalation limitation;
- Operator and Recovery allow/deny policy models and tests;
- whether and how to disposition `ExistingLegacyTrail` in a separate package;
- the account-wide administration separation and retirement hold in §1.1; and
- the recorded resolution of the recent root-activity attestation.

WP-005C must stop for review instead of broadening a policy, choosing a real
principal implicitly, changing CloudTrail cost posture, or using or retiring
legacy credentials contrary to §1.1.

## 15. WP-005C1 redacted execution record

WP-005C1 established the following symbolic structure without committing live
AWS identifiers or personal information:

| Symbolic principal | Group | Permission set | Session |
| --- | --- | --- | --- |
| `PrimaryHumanPrincipal` | `ShelfStateAccountAdmins` | `ShelfStateAccountAdmin` | 1 hour |
| `PrimaryHumanPrincipal` | `ShelfStateOperators` | `ShelfStateOperator` | 1 hour |
| `RecoveryHumanPrincipal` | `ShelfStateRecovery` | `ShelfStateRecovery` | 1 hour |

All three groups, permission sets, group memberships, and account assignments
were created. No AWS managed policy is attached to any permission set. The
committed, secret-free policy model version is `wp-005c1-v1`.

### 15.1 Policy validation and adjudicated action mapping

Local policy assertions pass for all three permission sets. IAM Access Analyzer
basic validation returned, for each materialized inline policy: 0 security
findings, 0 errors, 0 warnings, and 2 reviewed suggestions. No unresolved error
or security finding was assigned. No paid custom policy check was used.

The implementation uses the adjudicated API-operation/IAM-action mapping in
§4.2: `TransactGetItems` is blocked by `dynamodb:GetItem`; the three PartiQL
execution APIs are blocked through all four valid `dynamodb:PartiQL*` actions;
and `SelectObjectContent` is blocked by `s3:GetObject`/`s3:GetObject*`. No
invented API-operation name remains in executable IAM `Action` sets.

`ShelfStateAccountAdmin` permits the reviewed IAM, Identity Center, Identity
Store, account, Organizations, and CloudTrail administration/inventory surface
while denying application content, recovery authority, role use, and
application deployment. `ShelfStateOperator` permits only current CloudTrail
and CloudWatch metadata operations and denies identity, content, recovery, role
use, and deployment authority. `ShelfStateRecovery` is deny-only until WP-039
defines exact vault, recovery-point, service-role, and isolated restore-target
boundaries.

### 15.2 Temporary-session and capability proof

Interactive portal verification proved that `PrimaryHumanPrincipal` can sign in
with the enrolled MFA method and sees only the AccountAdmin and Operator
ShelfState roles, while `RecoveryHumanPrincipal` signs in separately with its
enrolled MFA method and sees only the Recovery ShelfState role. Each resulting
console session is an Identity Center assumed-role session from a one-hour
permission set; no browser-held long-lived AWS credential was created.

Safe positive tests proved AccountAdmin IAM inventory/read capability and
Operator CloudTrail Event History lookup capability. Recovery identity/session
establishment succeeded; no restore authority was added or exercised.

Representative live negative tests produced the expected authorization
failures: Operator IAM administration; AccountAdmin S3 bucket inventory, Backup
vault listing, and CloudFormation stack listing; and Recovery IAM inventory,
S3 bucket inventory, CloudFormation stack listing, and Backup vault listing.
The validated explicit-deny/static invariants additionally cover every listed
DynamoDB/PartiQL, S3 payload, Cognito profile, Lambda/API execution, secret/
parameter/KMS, identity, deployment, recovery, role-assumption, and pass-role
capability. Potentially mutating forbidden calls were not invoked merely to
prove their denial.

CloudTrail Event History contains distinguishable, redacted management events
for all three federated roles: a successful AccountAdmin IAM read, a successful
Operator lookup, and Recovery access-denied events. The records identify the
expected Identity Center assumed-role issuer and console-sourced temporary
session without relying on personal usernames, account IDs, IP addresses,
session identifiers, or request identifiers in repository evidence.

Temporary CLI proof was initially deferred because the AWS CLI executable was
not discoverable in the workstation command path or standard installation
locations. The subsequent direct API proof is recorded in §15.4. The legacy
access key was not used or copied, and no replacement access key was created.

### 15.3 Procedure note and remaining boundary

Group membership was added before inline-policy provisioning completed, rather
than after policy review as sequenced in §7. At that time the groups had no AWS
account assignments, so the memberships conveyed no AWS permissions. Policies
were corrected, locally tested, and successfully validated before any account
assignment was created. This is a recorded procedure-sequencing deviation, not
an architecture or authority-boundary deviation.

WP-005C1 adds no incremental Identity Center service charge. The next step is
independent review and finalization of WP-005C1. WP-005C2 remains on hold;
account-wide maintenance access is separately planned only when authorized,
under §1.1. Recovery activation remains deferred to WP-039;
GitHub/OIDC/deployment controls remain deferred to WP-006.

### 15.4 Remediation control-plane proof — succeeded

On 2026-09-27 the account owner completed interactive portal authentication for
`PrimaryHumanPrincipal`. The `ShelfStateAccountAdmin` role was selected and the
resulting console identified the expected temporary federated AccountAdmin
session. Neither `LegacyAdministrator` nor root was used for this proof.

The Identity Center dashboard loaded, but opening Groups failed with an
authorization error: `sso-directory:SearchGroups` was not allowed by an
identity-based policy. The console returned no group-list evidence for the
ShelfState structures. This result is a failure of the attempted console read;
it did not establish the outcome of a direct Identity Store API call. Work
stopped for human adjudication; no console permission was added.

The account owner subsequently authorized a direct read using the already
approved `identitystore` actions and provided an authenticated CLI SSO path.
On 2026-09-27 the following non-destructive checks succeeded:

| Check | Redacted evidence | Result |
| --- | --- | --- |
| Temporary caller | STS caller identity matched the Identity Center-generated assumed role for `ShelfStateAccountAdmin` | PASS; neither root nor an IAM user was the caller |
| Actual ShelfState structure | `identitystore:ListGroups` against the actual Identity Store in `us-west-2`, filtered by the exact `ShelfStateAccountAdmins` display name with a bounded, non-paginated result | PASS; exactly one matching group returned |
| Auditability | CloudTrail Event History lookup in `us-west-2` found the successful `ListGroups` event from `identitystore.amazonaws.com` under the `ShelfStateAccountAdmin` session issuer in the proof window | PASS; `AssumedRole`, read-only management event, no error |

The direct API response proves the group match; the CloudTrail event proves
the role, operation, and successful read. The event is not claimed to preserve
the exact display-name filter. Raw responses and live identifiers are not
repository artifacts. Credential values were not printed or recorded.

The direct Identity Store proof resolves the positive control-plane blocker.
Console group-search usability is not an acceptance requirement, and
`sso-directory:SearchGroups` remains ungranted. Executable policy statements
were not changed for remediation; the only policy-model change is descriptive
deferred-capability metadata reflecting the account-wide access boundary.
No AWS mutation, root use, legacy-identity use or change, bootstrap, or
deployment occurred during remediation. Recovery remains deny-only pending
WP-039. WP-005C2 and WP-006 remain unstarted; this record awaits final human
review and is not authorization to push or proceed to another package.

### 15.5 Remediation repository verification

Final verification completed on 2026-09-28:

| Command/check | Result |
| --- | --- |
| Root `node --test` | 149 passed, 0 failed |
| Focused deployment-isolation and CI-policy tests | 21 passed, 0 failed: 6 isolation and 15 CI-policy tests |
| V4 `npm ci` using pinned npm through Corepack | Succeeded; dependencies unchanged |
| V4 `npm run verify` | Succeeded: 9 package-boundary, 1 contract, 12 human-access policy, and 8 infrastructure tests; preview and inert build succeeded |
| Dev/prod synth within verification | Each environment: 6 stacks, 0 resources; account-unbound local synthesis, no bootstrap or deployment |
| `node scripts/check-ci-secrets.mjs` | No obvious credential matches |
| `node scripts/v3-deployment-boundary.mjs build` | Exactly 42 frozen V3 files; no V4 content |
| Frozen V3 SHA-256 | `2b973f2a0c83fe0ca7df51528980f5d2cb142e3e8b3b2411e8727e303560af3a`, unchanged |
| `git diff --check` | Passed |

The remediation changes only this checkpoint and the policy model's
descriptive deferred-capability entry. No executable IAM statement, dependency,
V3 runtime, Netlify configuration, or deployment workflow changed.

## 16. Current official-service references

- [IAM Identity Center FAQs](https://aws.amazon.com/iam/identity-center/faqs/)
  (service pricing and workforce access model)
- [Set session duration for AWS accounts](https://docs.aws.amazon.com/singlesignon/latest/userguide/howtosessionduration.html)
- [Get IAM Identity Center user credentials for the AWS CLI or AWS SDKs](https://docs.aws.amazon.com/singlesignon/latest/userguide/howtogetcredentials.html)
- [CloudTrail pricing](https://aws.amazon.com/cloudtrail/pricing/)
- [CloudTrail FAQs](https://aws.amazon.com/cloudtrail/faqs/)
- [Managing CloudTrail trail costs](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-trail-manage-costs.html)
