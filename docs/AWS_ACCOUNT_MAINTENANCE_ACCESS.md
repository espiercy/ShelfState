# AG-001A — Temporary Account-Wide Maintenance Administration Design

Status: **AG-001A APPROVED / AG-001B COMPLETE AND APPROVED / AG-001C COMPLETE — READY FOR REVIEW**

- Date: 2026-09-28.
- AG-001A and AG-001B were independently approved. Completed maintenance-path
  proof and the established provisioning failure are in §11; separately
  authorized AG-001C remediation is recorded in §12.
- Repository baseline: `92ef181f8ae3ca836f166aa8311b8cfb9a8f2be5`.
- Package: separate AWS account governance, outside the ShelfState V4 sequence.
- Authority: the human AG-001A design-only direction and the WP-005 account-wide
  maintenance decision in [V4_AWS_ACCESS_CHECKPOINT.md §1.1](V4_AWS_ACCESS_CHECKPOINT.md#11-account-wide-administrator-purpose-and-retirement-hold).
- Evidence: that checkpoint's historical credential inventory and the redacted
  diagnosis in [V4_OIDC_RELEASE_CHECKPOINT.md §1.2](V4_OIDC_RELEASE_CHECKPOINT.md#12-human-authorized-read-only-provisioning-diagnosis).
- No live AWS calls were made for this design. Historical observations are not
  represented as a fresh inventory. Official references were checked on the
  design date; recommendations below are proposals, not deployed controls.

The original AG-001A design alone authorized neither implementation nor further
provisioning. AG-001B and AG-001C received separate human authorization, recorded
below. Neither resumes the wider WP-006A assessment or starts WP-006B / WP-007.

## 1. Preserved decisions and triggering evidence

`LegacyAdministrator` is an existing account-wide maintenance IAM identity,
not a ShelfState identity. It remains retained; retirement is on hold. Routine
ShelfState administration uses its separate temporary AccountAdmin, Operator,
and Recovery paths. Root remains final break-glass only.

At the pre-AG-001B checkpoint, the latest completed diagnosis found:

| Layer | Recorded evidence, not rechecked in AG-001A |
| --- | --- |
| AccountAdmin permission-set source | Matches the reviewed model, including the OIDC list read, exact-provider get read, and exact-instance provisioning-status read |
| First provisioning | Accepted on 2026-09-28 at 11:36:05 UTC; response `IN_PROGRESS` |
| Second provisioning | Accepted on 2026-09-28 at 16:12:34 UTC; response `IN_PROGRESS` |
| Generated AccountAdmin role | Still lacked all three additions at the single inspection beginning 16:27:34 UTC: over four hours after the first submission and at least 15 minutes after the second |
| Final outcomes | Not observable through the effective AccountAdmin role; neither success nor failure established |
| IAM quota | 98 roles / 1,000 quota; not exhausted at diagnosis time |
| CloudTrail | Invocation records lacked errors; relevant service-mediated IAM reads were visible, but no conclusive service-side provisioning failure was found |

The underlying AWS cause was **unknown at that pre-AG-001B checkpoint**.
The original design did not convert missing evidence into a claimed
self-provisioning restriction or authorize further provisioning. AG-001B §11.8
subsequently established both failures: IAM denied `iam:PutRolePolicy` to the
submitting ShelfState AccountAdmin on its generated role. AG-001C separately
authorizes the narrow remediation in §12, not the generic AWS example action set.

## 2. Recommended durable authority

Recommend **Option A: a separate IAM Identity Center maintenance permission
set**, established only after review and explicit AG-001B authorization.

| Element | Proposed value / boundary |
| --- | --- |
| Permission set | `AccountMaintenanceAdmin` (provisional) |
| Assigned user | Only `PrimaryHumanPrincipal`; explicitly verify the real directory-user mapping privately during implementation, never infer another identity |
| Account assignment | Direct user assignment (`PrincipalType = USER`) to the existing AWS Organizations management account only; no administrative group, new account or organization restructuring |
| IAM role | Identity Center-generated role for `AccountMaintenanceAdmin`; service-owned name/suffix, not a manually named or edited role |
| Permissions | AWS managed `AdministratorAccess`; no custom inline allow policy or permissions boundary proposed initially |
| Session | Permission-set `SessionDuration = PT1H`; temporary console/CLI credentials only |
| Activation | MFA-backed portal authentication and deliberate selection of this permission set; no default role for routine work |
| Separation | No membership/policy changes to ShelfState AccountAdmin, Operator, Recovery, or any GitHub deployment role |

This is standing eligibility for **temporary credentials**, not automatic
just-in-time entitlement or per-session human approval enforced by AWS.
Each maintenance task still requires a recorded reason and bounded authority.
The Primary-only direct assignment also means this role is not an independent
second-human recovery path; retained legacy and root paths remain relevant.

The management-account assignment choice follows the AWS guidance identified
in the human review: use a dedicated permission set for management-account
access and assign users directly rather than through a group. Otherwise,
authority to modify group membership can become authority to grant
management-account access. This is particularly important for this permission
set's `AdministratorAccess`. Do not create an administrative Identity Center
group or group membership solely for this authority. The dedicated permission
set must not acquire assignments to other accounts or additional principals
without separate human review.

### 2.1 Why broad administration is appropriate here

Account-wide cleanup genuinely requires cross-service administration, including
resources unrelated to ShelfState. `AdministratorAccess` openly describes this
purpose; an incomplete custom pseudo-administrator policy would obscure gaps
and invite repeated emergency expansion. AWS defines this policy as allowing
all actions on all resources. Root-only operations and other applicable policy
or service restrictions still exist; this is not the root identity.
[AWS policy definition](https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AdministratorAccess.html)

This proposal is deliberately **not least-privileged by service/resource**.
Its safeguards are restricted direct assignment, protected authentication,
temporary sessions, deliberate use, task authorization, and audit. Broad authority can
read application content, alter permissions, disable audit controls, or grant
other principals access. Those abilities are not permission to do so.
Application-content browsing is prohibited unless separately authorized for
the specific maintenance task. ShelfState's existing content-deny invariants
remain unchanged on its three roles; they are not falsely claimed for this one.

### 2.2 Permissions boundary and explicit-deny evaluation

A boundary caps effective permissions, and an explicit deny can block allowed
operations. Denying IAM changes, policy attachment, resource deletion, key
operations, or content APIs could prevent legitimate repair/cleanup and would
need task-specific exceptions. An administrator able to remove its own guard
would not be reliably constrained by that guard. A meaningful immutable control
would need separately controlled authority, which this package does not create.
[AWS permissions-boundary behavior](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_boundaries.html)

Recommend **no boundary or new deny set initially**, with explicit human
acceptance of this broad trust. Do not invent restrictions to label it
least-privileged. If the owner instead requires a technical content-access or
audit-tamper boundary, stop and design that independently before implementation.
Do not introduce an SCP/account restructure as a shortcut; the recorded account
is the organization management account, not a newly isolated member account.

## 3. Identity Center versus direct IAM role

| Dimension | Option A: Identity Center (recommended) | Option B: direct IAM maintenance role (not selected) |
| --- | --- | --- |
| Proposed name | Permission set `AccountMaintenanceAdmin` | IAM role `AccountMaintenanceEmergency` (provisional alternative only) |
| Who enters | `PrimaryHumanPrincipal` through a direct user assignment to the dedicated management-account permission set; no group | Exact existing `LegacyAdministrator` IAM principal, bound privately at implementation; no account-wide principal wildcard |
| Authentication | Existing directory MFA posture; portal role selection | MFA-authenticated IAM console switch-role or an explicitly reviewed MFA-backed STS assumption path |
| Credentials/session | Identity Center temporary credentials; one-hour permission set | `MaxSessionDuration = 3600`; assumption request no longer than one hour; no static key created for role |
| Trust | Service-managed Identity Center trust, no manual alterations | Only exact IAM principal and `sts:AssumeRole`, requiring `Bool aws:MultiFactorAuthPresent = true`; absent/false must fail; no public, GitHub, or generic federated trust |
| Independence | Depends on Identity Center authentication and provisioning | Can function independently of Identity Center if legacy IAM authentication works |
| Security gain | Replaces ordinary legacy-key/user use with named workforce sessions | Expiring sessions and clearer role attribution, but retained administrator can still act directly or change trust/policy |
| Cost | Expected $0 fixed identity cost | Expected $0 fixed identity cost |
| Main limitation | Current provisioning problem may affect it too | Does not reduce administrator-equivalent legacy authority; adds another privileged path and cannot itself solve legacy credential compromise |

For Option B, requiring MFA at `AssumeRole` is technically appropriate for an
IAM-user trust. Do not transpose that condition onto Identity Center federation
as proof of MFA: authentication and condition-key behavior differ. CLI MFA APIs
also have device-method constraints; do not assume the existing enrolled method
supports TOTP-based API parameters. Prefer an MFA console switch-role proof if
this alternative is ever separately selected; no copying the old access key or
issuing a new one merely for testing.
[AWS MFA-protected assumption guidance](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_mfa_configure-api-require.html)

Trusting a ShelfState role instead would preserve the failing dependency and
expand its authority. A new limited IAM bootstrap user would be another identity
and credential-governance design, not an implicit part of Option B. Reducing
the legacy user to assume-role/bootstrap-only access may improve the model
later, but is a **separate future option**, not an AG-001 acceptance criterion.

Choose A for durable workforce maintenance, not because its provisioning is
assumed to succeed. If A fails, stop with the observed result. B requires a
new human decision; it is not an automatic fallback implementation.

## 4. Authentication and session limits

Preserve existing Identity Center MFA enrollment/enforcement. The recorded
context-aware policy does not challenge on every role selection. The operating
procedure requires an MFA-authenticated sign-in for each maintenance use: use
a fresh isolated sign-in and record that the challenge was completed. If a
cached/trusted context bypasses the challenge, do not claim fresh MFA or proceed
with privileged work; pause for a reviewed authentication procedure. Do not
silently change organization-wide MFA settings to satisfy this package.
[AWS MFA prompt modes](https://docs.aws.amazon.com/singlesignon/latest/userguide/mfa-getting-started.html)

Set the **permission set** to one hour and verify issued credentials' lifetime.
AWS documents that generated Identity Center IAM roles can show a 12-hour
maximum while the permission-set setting controls issued workforce sessions.
Do not directly edit the generated role to force a one-hour IAM metadata value.
[AWS account session duration](https://docs.aws.amazon.com/singlesignon/latest/userguide/howtosessionduration.html)

Portal session lifetime is separate. Sign out of both AWS console and portal,
and end local CLI SSO use/cache through its normal logout procedure after work.
Previously issued role credentials can remain valid until expiry; logout is
not proof of immediate revocation. Compromise requires a separately authorized
containment/revocation procedure, not merely closing a tab.
[AWS session independence](https://docs.aws.amazon.com/singlesignon/latest/userguide/authconcept.html)

## 5. One-time bootstrap design — not execution authority

The new role cannot establish itself. Of the existing candidates, the minimum
appropriate **existing principal** is `LegacyAdministrator`, authenticated with
MFA. Its rights are broad, but the proposed one-time *task scope* is narrow:
establish and verify only the reviewed maintenance path. This is not a request
to broaden it or use it for WP-006 diagnosis/repair. Root is excluded absent an
actual break-glass condition. ShelfState roles are not bootstrap substitutes.

Before AG-001B, the human must approve the permission-set name, direct Primary
user assignment, broad managed policy, authentication procedure, exact target
management-account binding, and the bounded creation/verification actions below.
Resolve live identifiers privately and
stop on a name collision, unexpected existing assignment, or identity ambiguity.

1. Record the one-time reason and allowed changes; authenticate to the existing
   legacy console using MFA. Verify the account and caller without recording
   live IDs. Do not use its stored access key or request a replacement. Use
   console/service-supported temporary tooling; if safe tooling cannot perform
   the required status reads, stop rather than introducing static credentials.
2. Recheck the historical legacy/MFA and Identity Center bindings read-only.
   Explicitly verify the private mapping of Primary to the intended directory
   user and the target's AWS Organizations management-account identity.
   Inventory the candidate maintenance permission set and its account
   assignments to avoid duplicate creation or unintended access. An unexpected
   preexisting object requires review, not overwrite/adoption.
3. Create only the reviewed maintenance permission set and direct account
   assignment; attach `AdministratorAccess`, set `PT1H`, and read back the configuration.
   An update to an existing object would require an explicitly reviewed delta.
   Assign only the privately verified Primary directory user to
   `AccountMaintenanceAdmin` for the existing management account, using
   `PrincipalType = USER` and `TargetType = AWS_ACCOUNT`. Do not create a group
   or membership, or change any other assignment.
4. Observe asynchronous completion using the bootstrap administrator, not the
   new unproven role. `CreateAccountAssignment` already provisions the new
   permission set: track its request with `DescribeAccountAssignmentCreationStatus`.
   Do not issue an extra `ProvisionPermissionSet` merely for proof. If a later
   reviewed maintenance-permission-set update explicitly requires that API,
   observe its own request with `DescribePermissionSetProvisioningStatus`.
   Assignment and provisioning request IDs are distinct, runtime-only values.
   [AWS assignment/provisioning semantics](https://docs.aws.amazon.com/singlesignon/latest/APIReference/API_CreateAccountAssignment.html)
5. Proposed read budget: status reads no more often than once per minute for
   at most 15 minutes. Require `SUCCEEDED`. On `FAILED`, record a redacted
   `FailureReason`; on persistent `IN_PROGRESS`, record indeterminate. Stop on
   denial or unavailable status; no resubmission, policy broadening, assignment
   delete/recreate, or generated-role patch. Do not assume a new permission set
   will avoid the existing failure.
6. After successful assignment provisioning, verify all of the following:
   exactly the intended symbolic Primary principal is directly assigned;
   exactly the intended management account is targeted; the permission set
   is `AccountMaintenanceAdmin`; `AdministratorAccess` is attached; and the
   permission-set session duration is one hour. Enumerate that permission
   set's provisioned accounts and assignments, completing pagination, to prove
   no unexpected additional account assignment exists for it, including any
   other user or group assignment. Read the **new maintenance** generated role
   and verify its managed-policy attachment, expected service trust, and absence
   of unexpected inline policies/boundaries. Any mismatch stops acceptance.
   Inspect policies, not application content. Record symbolic evidence only.
7. Independently sign in as Primary with MFA in a separate session, deliberately
   select `AccountMaintenanceAdmin`, and prove the expected temporary caller,
   one-hour issuance and safe IAM/Identity Center reads. Independently confirm
   the exact direct Primary assignment, management-account target and all
   configuration/assignment checks in step 6. Record CloudTrail attribution
   to this role.
   Policy/configuration inspection confirms the configured broad authority,
   not successful execution of every service operation. Combine it with the
   safe positive reads; do not create/delete resources just for proof.
8. Sign out of the legacy administrative session after independent verification;
   close its temporary tooling. Record completion and audit evidence. Thereafter
   use the temporary maintenance role for separately authorized account-wide
   maintenance; any further legacy use requires its own explicit reason/approval.

If bootstrap stops partially complete, inventory the exact newly created
objects and report them. Do not automatically retry, delete them, revoke an
assignment, alter legacy credentials, or switch to root. Containment/cleanup
requires human direction. The legacy identity remains available and unchanged.

## 6. Recovery and break-glass hierarchy

| Failure | Proposed response, subject to bounded task authorization |
| --- | --- |
| `ShelfStateAccountAdmin` fails | Use the independently verified maintenance path for read-only diagnosis first; no implicit repair |
| GitHub OIDC fails | Human maintenance access does not depend on GitHub; inspect trust/provider/configuration, but do not bypass production-release controls or deploy manually without separate authority |
| Maintenance permission set/role fails while Identity Center works | Stop using it; separately authorize retained LegacyAdministrator with MFA for the specific account-governance diagnosis/recovery, not routine ShelfState work |
| Identity Center is unavailable | Retained legacy IAM console/MFA is the existing independent account-wide path; no need to pretend an unbuilt direct IAM role exists |
| Legacy authentication also fails, is unsafe, or a root-only action is required | Root is final break-glass under the WP-005 procedure: record necessity, use protected MFA, no root keys, bounded actions, sign out, audit |

`ShelfStateRecovery` remains deny-only pending WP-039, not a general account
administrator. Loss/compromise of Primary does not authorize silently assigning
the maintenance permission set to Recovery or introducing a group assignment.
Root/legacy credentials and recovery material must remain independent of
ShelfState hosting and application identity.

### 6.1 Retained legacy credential posture

WP-005B recorded an enabled console profile, MFA enabled, an
administrator-equivalent AWS managed policy inherited through a group, one
active access key and a second inactive key. The active key was old and little
used at that assessment. These are historical facts, not refreshed claims.

No key value is needed for this design. No rotation, retention change,
deactivation, deletion, MFA replacement, console change, group change, policy
reduction, or retirement is authorized. Those are separate account-governance
decisions. New temporary access does not eliminate the risks of retaining an
administrator-equivalent IAM user/key; that residual risk is explicit.

## 7. First maintenance action after independent proof: diagnosis only

AG-001B authority must explicitly include this bounded read-only action if it
is to be executed. Creation of a maintenance role alone is not authority to
resume ShelfState implementation or repair the existing provisioning state.

1. In a fresh, verified maintenance session, recover both original request IDs
   transiently from the matching CloudTrail submission records in `us-west-2`.
   Match permission set, account, caller and submission time; never use the
   CloudTrail event ID in place of the provisioning request ID. Stop if ambiguous
   or unavailable; do not guess/recreate requests.
2. Call `DescribePermissionSetProvisioningStatus` for **each** original request
   with the bound instance. Record first and second separately as `SUCCEEDED`,
   `FAILED` (redacted `FailureReason`), or `IN_PROGRESS`. An API denial/not-found
   is an observation failure, not a provisioning status. For `IN_PROGRESS`,
   propose at most two further reads per request five minutes apart, then stop.
   [AWS status response](https://docs.aws.amazon.com/singlesignon/latest/APIReference/API_DescribePermissionSetProvisioningStatus.html)
3. Read the current ShelfState AccountAdmin permission-set source and generated
   role policy, compare canonical documents, and distinguish source, effective
   role, and request outcome. Success with a mismatch is still a review blocker.
4. Inspect matching CloudTrail Identity Center and relevant IAM management
   events in bounded windows; filter to the actual target. Record redacted
   times, operations, symbolic caller, errors, and any response status. Do not
   treat absent events as proof that nothing occurred.
5. Stop and present the evidence. Human adjudication separately decides whether
   another provisioning attempt, assignment repair, AWS Support escalation or
   other mutation is justified. **No third provisioning request is authorized.**
   Even success does not resume WP-006A without separate direction.

## 8. Maintenance operating procedure and quarterly review

For each use after establishment:

1. Record reason, authorizer, date, intended account/resource scope, allowed
   read/write actions, risk/rollback considerations, and time limit before login
   when practical. A broadly capable role is not a standing change approval.
2. Complete MFA authentication, select `AccountMaintenanceAdmin` explicitly,
   verify the Primary user, management-account target, role and session expiry,
   and use no static credentials. Entry is through the reviewed direct user
   assignment, not group membership.
3. Stay within the bounded actions and one-hour session. Stop on surprises;
   extending work requires deliberate reauthentication and renewed task scope.
   No application-content browsing without explicit separate permission.
4. Sign out and close temporary tooling; record completion/remaining work.
   Do not confuse local logout with revocation of all issued credentials.
5. Review CloudTrail for sign-in/role attribution and relevant management
   actions/errors after use. If events are delayed, record audit pending and
   arrange a bounded follow-up. Do not assert proof from console success alone.

Use current Event History in the applicable Regions plus the global-IAM region;
its 90-day management-event window is not a complete durable audit archive or
evidence of all content reads. Preserve only redacted summaries in this repo.
WP-005 recorded that the legacy trail is not a usable management-event baseline;
no trail change or new audit service is bundled here.
[AWS Event History scope](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/view-cloudtrail-events.html)

Every quarter, review this authority **separately** from the three ShelfState
roles: the exact direct Primary assignment to the management account, absence
of any additional user/group or other-account assignment for this dedicated
permission set, continued need, MFA posture,
permission-set policy/session drift, generated trust/attachments, issuance and
audit evidence, unexpected use, independent fallback availability, and retained
legacy credential risk. Review AWS managed-policy changes as well as local
configuration. Record reviewer, findings, owner and due date symbolically;
credential changes require separate approval. Unexpected privilege or lost MFA
requires immediate review, not waiting for the quarter.

## 9. Cost and scope

Expected fixed AWS IAM / IAM Identity Center service cost: **$0**. No new
always-on service is proposed, and no free-tier credits are assumed. The
identity path itself has no expected additional usage charge under current
service terms. [IAM FAQ](https://aws.amazon.com/iam/faqs/),
[Identity Center FAQ](https://aws.amazon.com/iam/identity-center/faqs/).

Account-maintenance actions can themselves incur costs. Durable audit storage,
new trails/data events, paid support, new identity infrastructure or services
would need explicit estimates and authorization before selection. This design
does not change the ShelfState Personal infrastructure cost model or purchase
any service. Existing legacy trail cost questions remain separate.

## 10. Human acceptance and handoff

AG-001A is ready for review when the design covers the authority distinction,
both options, the dependency risk, retained legacy posture, MFA/session limits,
bounded bootstrap/status checks, diagnostic-only first task, audit and cost.
These are design criteria, not a claim that live access is proven.

Before authorizing AG-001B, approve explicitly:

- Option A and the permission-set name; direct assignment of only the privately
  verified Primary directory user to the existing management account, with no
  new administrative group, membership, additional assignment or identity.
- Broad `AdministratorAccess` with no new boundary/deny set, including its
  acknowledged technical content-access and self-administration capability.
- One-time MFA-backed LegacyAdministrator bootstrap solely under §5 and the
  stop-on-failure approach; no direct generated-role edit or automatic Option B.
- The authentication evidence procedure and safe temporary tooling; no new key.
- Whether the post-proof read-only diagnosis in §7 is included; no repair or
  third provisioning attempt, even if the maintenance role works.

Future execution acceptance must separately show successful assignment/status,
correct generated policy/trust, exactly the approved direct Primary assignment
and management-account target, the dedicated `AccountMaintenanceAdmin`
permission set with `AdministratorAccess` and `PT1H`, no unexpected additional
account assignment for it, independent MFA-backed temporary role proof,
one-hour issuance, legacy logout, and attributable audit evidence. A destructive
cleanup test is not required. If any proof fails, stop.

Only this governance artifact is introduced by AG-001A. Preexisting uncommitted
WP-006A checkpoint/model/test changes are preserved, not incorporated into an
account-maintenance policy. No AWS API, sign-in, GitHub/Netlify change, deployment,
CDK bootstrap, credential change, or WP-006 continuation occurred. This design
is left uncommitted for human review; nothing is pushed.

### 10.1 Design verification record

- Root `node --test`: 149 passed, 0 failed, including the 6 WP-001 boundary
  tests and 15 CI-policy tests.
- Human-access policy tests: 15 passed, 0 failed; existing ShelfState model
  restrictions are preserved, not expanded for account-wide administration.
- Tracked-file credential tripwire and separate new-document credential,
  account-number, portal-address and whitespace checks: passed.
- `git diff --check`: passed; new-document whitespace checked separately
  because the document is untracked.
- No production code, dependency, workflow, Netlify or CDK source was changed
  for AG-001A; no install, live AWS validation or deployment was needed.
- Existing WP-001 classification treats this account-wide document as **shared**,
  not V4-owned. A future authorized push containing it requires a V3 build;
  the classifier was verified read-only and was not changed to suppress it.

Review checked all twelve AG-001A request sections against this document.
Implementation readiness depends on the explicit human choices above and
later live proof; it does not depend on pretending the provisioning issue is
already understood or on retiring the retained administrator.

### 10.2 Independent-review remediation

Human review replaced the proposed group topology with a direct Primary user
assignment to the management account. Sections 2, 3, 5, 6, 8 and 10 now reflect
that decision, its management-account rationale and the complete assignment
verification criteria. All other authority, session, credential, diagnostic
and stop decisions remain unchanged.

After this correction, root tests again passed 149/149 and human-access policy
tests passed 15/15. Credential/redaction checks and `git diff --check` passed,
with the untracked document checked separately for whitespace and removed-group
references. Only this document was amended; hashes of the three preexisting
WP-006A changed files were unchanged. No AWS call, implementation, commit or
push occurred; the uncommitted review state is preserved.

## 11. AG-001B redacted execution record

### 11.1 Authority and bounded bootstrap reason

On 2026-09-28 the human authorized AG-001B separately from the ShelfState
sequence: establish only the reviewed maintenance permission set and direct
Primary assignment, independently prove the temporary path, end the legacy
bootstrap session, then diagnose the two existing ShelfState provisioning
requests read-only. No repair or ShelfState progression was authorized.

The bounded legacy-session reason was recorded before authentication: establish
and verify the separate account-maintenance path, not perform WP-006 diagnosis
or repair. The human completed the legacy console sign-in. AWS CloudShell was
opened as console-supported temporary tooling; no stored/new static access key
was used or exposed. Runtime identifiers were held in process memory and are
not included in this record.

### 11.2 Completed preflight

- STS verified the expected retained legacy IAM caller, not root or a ShelfState
  role. Organizations metadata matched that caller's account to the management
  account.
- The existing Primary directory-user mapping was resolved exactly and verified
  privately; the organization instance was unambiguous.
- Paginated permission-set inventory found no existing `AccountMaintenanceAdmin`,
  so there was no candidate assignment to adopt or overwrite.
- Recent sign-in-event lookups initially had no matching evidence. A later
  CloudTrail `DescribeOrganization` record in `us-east-1`, at 22:26:51 UTC,
  matched the actual bootstrap IAM caller with `mfaAuthenticated: true`.
  This establishes MFA-backed bootstrap-session use; a specific `ConsoleLogin`
  event was not claimed as observed.
- The human supplied action-time confirmation of permission-set creation and
  the single direct-user management-account assignment before mutation.

### 11.3 Creation and asynchronous outcome

Exactly these access mutations were submitted, with SDK mutation retries disabled:

1. `CreatePermissionSet`: `AccountMaintenanceAdmin`, `SessionDuration = PT1H`.
2. `AttachManagedPolicyToPermissionSet`: AWS managed `AdministratorAccess`.
3. `CreateAccountAssignment`: the privately verified Primary user, the existing
   management account, `PrincipalType = USER`, `TargetType = AWS_ACCOUNT`.

Before assignment, readback verified the name, one-hour duration, sole managed
policy, absence of inline/customer-managed policies and absence of a permissions
boundary. No group or membership was created or changed.

The assignment submission returned `IN_PROGRESS` at 22:30:36 UTC. Its request
identifier remained transient. One `DescribeAccountAssignmentCreationStatus`
read after at least one minute returned **SUCCEEDED** at 22:31:36 UTC. No
assignment resubmission or `ProvisionPermissionSet` call was made.

### 11.4 Configuration proof — passed

Paginated account and assignment enumeration verified exactly one provisioned
account, matching the management account, and exactly one direct `USER`
assignment matching Primary and the new permission set. No group, additional
user or additional-account assignment was present. A fresh permission-set
description still reported `AccountMaintenanceAdmin` and `PT1H`.

The unique Identity Center-generated maintenance role had only the expected
`AdministratorAccess` attachment, no inline policy and no permissions boundary.
Its trust contained a single Allow statement for the same-account, reserved
Identity Center SAML provider, the actions `sts:AssumeRoleWithSAML` and
`sts:TagSession`, and the expected AWS SAML audience condition. No generated
role was directly modified. This is configuration proof, not independent
maintenance-user session proof.

### 11.5 Historical independent authentication blocker and handoff

Opening the known access portal in a separate in-app browser for a fresh Primary
sign-in was rejected by the browser's automatic safety review, which classified
the redirect destination as an unrecognized sign-in hostname. No safety bypass
or alternate automated authentication route was attempted. This is a tooling
block, not evidence that the maintenance permission set failed.

Required next human handoff: use a personally verified trusted AWS access-portal
entry in a separate fresh authentication session, complete an actual MFA challenge,
and select `AccountMaintenanceAdmin`. Do not supply credentials/codes in chat.
If MFA is skipped by a cached/trusted session, stop for authentication-procedure
review. Further browser automation of the rejected destination requires review
of that destination and explicit permission; no workaround is authorized here.

At this stop:

- Temporary maintenance caller, one-hour issued session, Primary MFA event and
  maintenance-role CloudTrail attribution remain **unproven**.
- The legacy bootstrap session has **not yet ended**: independent proof is still
  pending. Its password, MFA, keys, groups, policies, console profile and IAM user
  were not changed. Do not describe the legacy session as signed out.
- The two original ShelfState provisioning outcomes remain unknown. No status
  reads or source/effective-policy diagnosis were performed with the new role
  or with legacy authority in AG-001B.
- Created objects remain intact: one permission set, its managed-policy
  attachment, one successful direct assignment and its service-generated role.
  No automatic cleanup, revocation, Option B fallback, or repair occurred.
- No third ShelfState provisioning request, root use, WP-006A resumption,
  WP-006B, WP-007, CDK bootstrap or application deployment occurred.

The WP-006A checkpoint and human-access model/test changes are preserved, not
rewritten or committed. Only this governance document gains AG-001B evidence.
HEAD remains `92ef181f8ae3ca836f166aa8311b8cfb9a8f2be5`; no commit or push.

### 11.6 Verification at the partial-execution handoff

After recording the execution evidence, the following local checks passed:

| Check | Result |
| --- | --- |
| Root `node --test` | 149 passed, 0 failed |
| Human-access policy tests within full V4 verification | 15 passed, 0 failed |
| Focused WP-001 / CI-policy tests | 6 / 15 passed, 0 failed |
| Pinned V4 clean install | Passed; dependency graph unchanged |
| Full V4 `npm run verify` | Passed: 9 package, 1 contract, 15 human-access, 8 infrastructure tests; synth, preview and inert build |
| Dev / prod synth | Each 6 stacks, 0 resources; no CDK bootstrap/deployment |
| V3 boundary build | Exactly 42 frozen files |
| Frozen V3 digest | `2b973f2a0c83fe0ca7df51528980f5d2cb142e3e8b3b2411e8727e303560af3a`, unchanged |
| Credential / redaction checks | Tracked-file tripwire and separate untracked evidence checks passed |
| Whitespace | `git diff --check` and separate untracked-document checks passed |

The three preexisting WP-006A changed files retain their pre-AG-001B hashes.
The working tree remains intentionally uncommitted: the two existing model/test
modifications and two governance documents. No V3 source, workflow, deployment
boundary, dependency or CDK source was changed. Local tests do not substitute
for the outstanding independent maintenance-session proof.

### 11.7 Independent maintenance-session proof — passed

The human subsequently confirmed fresh access-portal authentication in Chrome,
an explicit MFA challenge, deliberate selection of `AccountMaintenanceAdmin`,
and successful console entry as the verified Primary directory principal.
This is human-attested MFA evidence, not an agent-observed challenge.
The real directory user mapped to PrimaryHumanPrincipal was privately verified
from the live AccountMaintenanceAdmin direct assignment. No IAM-user name was
used as a substitute for that directory mapping.

Read-only verification in the established maintenance console on 2026-09-28
then established:

- STS returned a temporary assumed-role caller for the Identity Center-generated
  `AccountMaintenanceAdmin` role, not root or the legacy IAM user.
- Organizations metadata matched the caller's account to the management
  account. The generated IAM role's reserved Identity Center path matched the
  effective caller, and the permission set still reported `PT1H`.
- CloudTrail in `us-west-2` recorded successful `AssumeRoleWithSAML` at
  22:56:49 UTC. Its returned assumed-role identity matched the current STS
  caller exactly. The requested duration was 3,600 seconds and the returned
  expiration was 23:56:48 UTC: 3,599 seconds after the event timestamp, within
  the approved one-hour bound. This is issuance evidence, not reliance on the
  generated role's maximum-session metadata.
- The matching `ConsoleLogin` at 22:56:50 UTC and a successful
  `GetCallerIdentity` at 22:58:53 UTC in `us-east-2` carried the exact maintenance
  caller/issuer attribution. No credential or token values were printed or
  copied into repository evidence.

The previously used legacy bootstrap console tab was already absent from the
current browser inventory when this verification resumed. It remained closed;
bootstrap use ended and no legacy API calls were made in this continuation.
This records tab closure, not proof of server-side logout or immediate
revocation of previously issued credentials. Legacy password, MFA, keys,
groups, policies and console profile remain unchanged; retirement stays on hold.

### 11.8 First maintenance task — read-only diagnosis complete

After independent proof, only `AccountMaintenanceAdmin` was used. The two
existing request IDs were recovered transiently from the exact known
`ProvisionPermissionSet` CloudTrail events, matching the ShelfState permission
set, target account and submitting AccountAdmin caller. One
`DescribePermissionSetProvisioningStatus` read per request at 23:01:16 UTC
returned final outcomes; no waiting/retry reads were needed.

| Existing submission (2026-09-28 UTC) | Final status | Redacted failure reason |
| --- | --- | --- |
| First, 11:36:05 | `FAILED` | IAM 403 `AccessDenied`: the submitting ShelfState AccountAdmin session was not authorized for `iam:PutRolePolicy` on its generated role because no identity-based policy allowed that action |
| Second, 16:12:34 | `FAILED` | Same IAM 403 `AccessDenied` for `iam:PutRolePolicy`, with the submitting ShelfState AccountAdmin session and generated role matched privately |

The original invocation records had no API error and returned `IN_PROGRESS`;
those responses were not final success. The status API now supplies the
conclusive failure evidence missing from the earlier WP-006A diagnosis.

Current `GetInlinePolicyForPermissionSet` source contains all three approved
read additions with exact reviewed scopes: wildcard OIDC-provider inventory,
get for only the runtime-account GitHub provider, and status describe for only
the runtime-bound Identity Center instance. The generated role has one inline
policy, no attached managed policy and no permissions boundary. Its complete
normalized policy equals the source after removing only those three additions;
none has propagated. Comparison ignored statement identifiers, ordering and
equivalent scalar/list representation, not policy conditions or permissions.

Bounded IAM Event History inspection covered two minutes before through five
minutes after each submission, in `us-east-1` and `us-west-2`, with pagination
completed. Only records targeting the generated ShelfState AccountAdmin role
were analyzed. East-region evidence contained 10 / 14 matching events for the
first / second windows: Identity Center-mediated `GetRole` and
`ListAttachedRolePolicies` at submission time, plus subsequent diagnostic
policy reads. All were read-only without invocation errors. No matching west
IAM events or policy-write event appeared in those windows. This limited audit
visibility does not contradict the explicit failure returned by the status API.

No AWS configuration mutation, third provisioning request, assignment repair,
generated-role edit, root use, legacy-credential change, CDK bootstrap or
deployment occurred in this continuation. The earlier authorized maintenance
permission-set creation remains as recorded in §11.3. No OIDC inventory or
wider WP-006A assessment resumed; WP-006B and WP-007 were not started.
The diagnosis stops here. Any remediation requires separate human authority.

Only this redacted governance document is updated in this continuation.
The preexisting WP-006A checkpoint/model/test changes remain untouched;
no commit or push is made. Earlier verification results in §11.6 retain their
original scope and are not presented as new runs.

### 11.9 Final evidence integrity checks

On 2026-09-29, repository-only completion checks passed: root tests 149/149
(including all 6 WP-001 boundary and 15 CI-policy tests), human-access tests
15/15, tracked-file credential tripwire, separate credential/live-identifier
and whitespace checks for this untracked document, and `git diff --check`.
The WP-006A checkpoint and human-access model/test SHA-256 values remain
identical to their pre-AG-001B values. Full V4 install/verify and synth results
remain the earlier runs in §11.6; they were not rerun for this evidence-only
completion. No further AWS call was made. Review state remains uncommitted.

## 12. AG-001C — separately authorized narrow reprovisioning repair

Human authorization on 2026-09-29 approves adding only `iam:PutRolePolicy` for
the runtime-bound management account's reserved Identity Center generated-role
namespace for `ShelfStateAccountAdmin` in `us-west-2`. The suffix wildcard is
service-owned; it does not grant access to other permission sets, accounts,
Regions, arbitrary roles, or a broad reserved-role namespace.

The model uses a separately named generated-role resource and Allow statement,
not an expansion of ordinary `ShelfState*` IAM role/policy administration.
Operator and Recovery remain byte-for-byte unchanged. `iam:PassRole` and
`sts:AssumeRole` remain denied. No other generated-role mutation action is added.
The account-maintenance permission set is not part of the ShelfState model.

Local human-access tests pass 17/17, including positive AccountAdmin scope,
negative other-role/account/Region cases, runtime rebinding, sole generated-role
mutation authority, and unchanged Operator/Recovery fingerprints.

Execution gate: materialize the reviewed model with runtime-only bindings;
require zero Access Analyzer errors or unresolved security findings and review
every warning/suggestion. Only then update the ShelfState AccountAdmin inline
permission-set source through the maintenance role, require canonical readback,
and submit exactly one existing-management-account provisioning request.
Observe at most once per minute for 15 minutes. Failure or indeterminate status
stops work without another permission, direct role edit or resubmission.

Only `SUCCEEDED` permits generated-policy comparison and a fresh
`ShelfStateAccountAdmin` read-only proof of status describe, provider list and
exact GitHub-provider get if present. Then stop for review. OIDC mutation,
deployment roles, GitHub changes, bootstrap, application deployment, wider
WP-006A work, WP-006B and WP-007 remain forbidden. Root and legacy are not used.

### 12.1 Validated source update and single submission

The human confirmed fresh portal MFA on 2026-09-29. After an interrupted local
handoff, the maintenance console was reopened from that authenticated portal;
STS verified the temporary `AccountMaintenanceAdmin` caller, and Organizations
metadata confirmed the management-account target. No mutation had been
attempted in the interrupted run.

Runtime identifiers remained in CloudShell interpreter memory. Canonical
symbolic fingerprints independently generated from the local model matched
the complete existing three permission-set source policies and the revised
AccountAdmin materialization. Only the new generated-role-scoped statement
was added; existing bound identities/resources and all deny controls persisted.
Live Operator and Recovery matched their unchanged local baselines.

IAM Access Analyzer basic validation returned zero errors, zero security
findings and zero warnings. Its sole `REDUNDANT_ACTION` suggestion concerns
the existing `s3:GetObjectAttributes` / `s3:GetObject*` deny overlap. Reviewed
and retained as unrelated to the authorized remediation; no broader action
or ARN was required. Human action-time confirmation was obtained before mutation.

Using only maintenance authority, one `PutInlinePolicyToPermissionSet` updated
ShelfState AccountAdmin, and canonical source readback exactly matched the
validated policy. Exactly one `ProvisionPermissionSet` request was submitted
at 12:02:10 UTC, targeting the existing management account only. Its initial
response was `IN_PROGRESS`. SDK automatic retries were disabled; its request
ID is transient only.

### 12.2 Provisioning and generated-role verification — passed

The first status read at 12:03:30 UTC, more than one minute after submission,
returned `SUCCEEDED`. No second AG-001C provisioning request was submitted.
The unique generated AccountAdmin role had one inline policy. Its complete
canonical document exactly matched the reviewed permission-set source,
including the three earlier read additions and the new precisely scoped
`iam:PutRolePolicy` statement. The generated role was not edited directly.
Live Operator and Recovery source-policy readbacks remained unchanged.

A fresh AccountAdmin console was selected from the access portal. Its CloudShell
environment was unavailable because that restricted role lacks the required
permissions; no CloudShell authority was added. The existing local SSO CLI
profile was confirmed to select ShelfStateAccountAdmin. A fresh browser login
handoff was attempted and the human reported completion, but the CLI did not
report login success. Its bounded STS caller check failed locally with
`Token has expired and refresh failed`. The waiting login process was stopped.
No authenticated final capability call was possible through that CLI session.
This was an authentication handoff blocker, subsequently resolved in §12.4;
no permission was added and no provisioning request was repeated for tooling.

### 12.3 Local verification at the authentication handoff

On 2026-09-29, pinned V4 clean install and full verification passed: 9 package,
1 contract, 17 human-access and 8 infrastructure tests, offline preview and
inert build. Dev and prod each synthesized 6 stacks with 0 resources. Root
tests passed 149/149; focused WP-001 and CI-policy tests passed 6/6 and 15/15.
The tracked credential tripwire passed; the V3 boundary build prepared exactly
42 files. No dependency, V3 runtime, workflow, Netlify or CDK source changed.
Review state remains four uncommitted governance/model/test files; no push.
Commit is deferred until the required fresh-role capability proof succeeds.

### 12.4 Fresh AccountAdmin capability proof — passed

The human completed a new login through the existing SSO CLI profile and
confirmed success. STS then verified a temporary assumed-role caller for
`ShelfStateAccountAdmin`, with the account matching its configured binding.
Only that role, not maintenance authority, performed the final proof.

A bounded CloudTrail lookup in `us-west-2` (12:01:50–12:02:30 UTC on 2026-09-29)
returned exactly one provisioning event. Its time was 12:02:10 UTC, its caller
was `AccountMaintenanceAdmin`, and its target matched the fresh AccountAdmin
caller's account with `targetType = AWS_ACCOUNT`. The event contained no
invocation error. `DescribePermissionSet` verified the referenced permission
set name as `ShelfStateAccountAdmin`. Its request ID stayed only in process
memory; no live identifiers or raw responses were written to the repository.
The initial event matcher needed correction for CloudTrail's `targetId` field
and PowerShell's typed timestamp parsing; these were local matching issues,
not API denials or provisioning retries.

| Required fresh-role read | Result |
| --- | --- |
| `DescribePermissionSetProvisioningStatus` for the remediation request | Succeeded; final status `SUCCEEDED` |
| `ListOpenIDConnectProviders` | Succeeded; no providers returned |
| Exact GitHub-provider `GetOpenIDConnectProvider`, if present | Not applicable: provider absent; no get call made |

No unrelated provider was inspected. No existing provider URL, audience or
thumbprint configuration exists to assess. This establishes the authorized
inventory prerequisites, not a complete WP-006A design or permission to create
the missing provider. AWS activity stops after this proof.

### 12.5 Final governance and repository handoff

The only AG-001C configuration mutations were the reviewed AccountAdmin inline
source update and exactly one provisioning submission. No generated role was
edited directly. AccountMaintenanceAdmin, Operator, Recovery, assignments,
directory identities, MFA/session settings and LegacyAdministrator remain
unchanged. Recovery remains deny-only pending WP-039; root was not used.
No broader WP-006A work, OIDC/GitHub mutation, deployment-role creation, CDK
bootstrap, application deployment, WP-006B or WP-007 occurred.

The successful clean install/full verification in §12.3 used the final model
and tests; the subsequent changes are evidence documentation only. V3 source
and publish artifact both contain 42 files and retain SHA-256
`2b973f2a0c83fe0ca7df51528980f5d2cb142e3e8b3b2411e8727e303560af3a`.
Credential/live-identifier checks cover both governance documents in addition
to the tracked-file tripwire. No dependencies were added or changed.

The authorized coherent local commit includes only this governance record,
`V4_OIDC_RELEASE_CHECKPOINT.md`, the human-access model, and its regression
tests. It preserves the accumulated approved prerequisite amendments and
AG-001A/B history alongside the separately authorized AG-001C repair. No push
is authorized. Independent review must precede any broader WP-006A resumption.
