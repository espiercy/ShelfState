# ShelfState V4 AWS human-access checkpoint

Status: **WP-005B DESIGN COMPLETE / AWS MUTATION NOT AUTHORIZED**

- Assessment date: 2026-09-21
- Repository baseline: `532be5c240ac62dd4fdb51cde491baba4540edb6`
- AWS evidence window: 2026-06-23 through 2026-09-21, limited by CloudTrail Event History retention
- Governing sources: `V4_ARCHITECTURE.md` §§20.3 and 21.9; ADR-007, ADR-009, and ADR-022; requirements OPS-005 through OPS-008, LIFE-009, and TEST-007
- Scope: read-only account assessment and proposed WP-005C human-access design
- Implementation status: not implemented; independent review and separate WP-005C authorization are required

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

The currently active permanent IAM administrator key must be retired in stages
only after the replacement temporary paths are proven. Root remains a
MFA-protected, no-key break-glass path.

## 2. Observed account facts

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
key/MFA baseline, but recent root activity described in §3 is not evidence that
root is already operating as break-glass only.

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
| Routine human access uses temporary MFA-backed credentials | Permanent administrator console profile and long-lived key remain usable | Prove Identity Center paths, then retire permanent credentials in stages |
| Root is break-glass only | Recent root sign-ins and root management activity exist; justification was not available from Event History | Establish procedure and end routine root use |
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
justification. The account owner must review the earlier root sequence and
record whether it was legitimate recovery/cleanup. Unexplained root use is an
incident-review trigger. WP-005C must also confirm that the first federated
AccountAdmin, Operator, and Recovery sessions appear under the intended
Identity Center role identities.

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

No step below has been executed.

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
9. Only after steps 3–8 pass, deactivate the active `LegacyAdministrator`
   access key. Record its identifier only in a private operator record, never in
   the repository.
10. Re-test portal, AccountAdmin, Operator, Recovery, and temporary CLI access
    after key deactivation. If replacement access fails, reactivate only under
    an explicit human rollback decision and investigate; do not improvise root
    routine use.
11. Pause for a human checkpoint before permanently deleting the old access key.
12. In separate reviewed stages, remove the IAM user's console login profile,
    detach administrator group membership, and delete the IAM user if no
    legitimate residual purpose remains. Re-verify replacement access and
    CloudTrail after each stage.
13. Preserve root only as break-glass under §9.

The old key is not retained indefinitely for convenience, but it is never
destroyed before temporary replacement access is proven. The IAM key, console
profile, group membership, and user object are four independent retirement
decisions.

## 8. Rollback and stop behavior during migration

- Before legacy-key deactivation, rollback is removal of the new assignments or
  policy correction while the existing administrator remains available.
- After deactivation but before deletion, a human may explicitly authorize key
  reactivation only if every intended temporary admin path is unusable. Record
  the reason and review CloudTrail immediately.
- After key deletion, rollback uses the proven AccountAdmin path; root is used
  only if all authorized federated administration paths are unavailable.
- Stop WP-005C before credential retirement if MFA is not enforced, either
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
- No AWS identity, permission set, assignment, group, policy, key, MFA setting,
  trail, event data store, organization/account setting, or other resource was
  created, modified, disabled, deactivated, or deleted.
- No AWS bootstrap or deployment occurred.
- WP-005C and WP-006 were not started.

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
- the staged credential retirement checkpoints and rollback authority; and
- the handling/attestation of the recent root activity.

WP-005C must stop for review instead of broadening a policy, choosing a real
principal implicitly, changing CloudTrail cost posture, or retiring a legacy
credential before replacement access and audit evidence are proven.

## 15. Current official-service references

- [IAM Identity Center FAQs](https://aws.amazon.com/iam/identity-center/faqs/)
  (service pricing and workforce access model)
- [Set session duration for AWS accounts](https://docs.aws.amazon.com/singlesignon/latest/userguide/howtosessionduration.html)
- [Get IAM Identity Center user credentials for the AWS CLI or AWS SDKs](https://docs.aws.amazon.com/singlesignon/latest/userguide/howtogetcredentials.html)
- [CloudTrail pricing](https://aws.amazon.com/cloudtrail/pricing/)
- [CloudTrail FAQs](https://aws.amazon.com/cloudtrail/faqs/)
- [Managing CloudTrail trail costs](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-trail-manage-costs.html)
