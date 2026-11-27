# WP-009 Cognito Plus and Managed Login foundation

## Development contract

| Purpose | Sole allowed HTTPS URL |
|---|---|
| OAuth callback | `https://dev.shelfstate.codecorax.com/api/v1/auth/callback` |
| Cognito post-logout destination | `https://dev.shelfstate.codecorax.com/` |

The [server-side configuration contract](../v4/contracts/cognito-login.mjs)
pins both literals. The callback goes through the existing `/api/*` routing
boundary to the future WP-010 handler. WP-012 owns application-session logout.
Cognito's logout return is the application root.

`shelfstateImplementationPhase=cognito-login` adds one local inspection stack,
`shelfstate-v4-dev-cognito-login`, in `us-west-2`. It requires an explicit
development account and uses the existing credential-free, no-lookup synthesis
path. This selector emits four resources and no outputs or cross-stack
references. The six original templates and the ordinary release gate retain
their existing contracts.

| Resource | Configuration |
|---|---|
| `AWS::Cognito::UserPool` | Plus tier, ACTIVE deletion protection, Retain on deletion and replacement, administrator-created users only, built-in email, password sign-in and `AUDIT` threat protection |
| `AWS::Cognito::UserPoolClient` | Public, secret-free, OAuth `code` only, `openid email`, native Cognito provider, exact redirect lists, `PreventUserExistenceErrors=ENABLED` |
| `AWS::Cognito::UserPoolDomain` | Account-suffixed Cognito prefix domain, Managed Login version 2 |
| `AWS::Cognito::ManagedLoginBranding` | Cognito-provided defaults assigned to the exact client after the domain exists |

For local inspection, run the pinned CDK CLI in the V4 package using the
credential-free environment and explicit development account binding:

```text
node node_modules/aws-cdk/bin/cdk synth --no-lookups --quiet -c shelfstateEnvironment=dev -c shelfstateImplementationPhase=cognito-login --output cdk.out/wp009/dev
```

## Feasibility and security

AWS's Oregon CloudFormation schemas include all four resources. CloudFormation
supports Plus, `AUDIT`, Managed Login v2, and explicit default branding. AWS
requires assigning branding for app clients created programmatically. The
prefix domain uses Cognito's managed endpoint and requires no application DNS
or certificate changes. Confirm prefix availability before a future change
set. [Regional provider schemas](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/resource-type-schemas.html),
[Managed Login](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-managed-login.html)

The authorization endpoint supports `S256` as its only PKCE method. The client
is compatible with PKCE, and WP-010 must send the challenge and exchange the
code with the stored verifier. `AllowedOAuthFlows` contains only `code`. The
direct user pools API explicitly lists only `ALLOW_REFRESH_TOKEN_AUTH` to avoid
the default SRP and custom-auth flows. Refresh requires an existing token, and
the BFF holds Cognito tokens server-side under the approved architecture.
Confirm the hosted password flow and direct API restrictions in the service
acceptance. [Authorization endpoint](https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html),
[App-client API default flows](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_CreateUserPoolClient.html),
[AWS OAuth-only client example](https://github.com/aws-samples/amazon-cognito-example-for-external-idp)

This foundation uses the Cognito service defaults of one-hour access and ID
tokens and a 30-day refresh token. WP-012 must remove
`ALLOW_REFRESH_TOKEN_AUTH` before enabling refresh-token rotation and handle
refresh through the token endpoint with server-held credentials. Cognito
rejects legacy API refresh flow and rotation together. Verify the transition
before accepting WP-012 or applying the production configuration.
[Refresh-token rotation](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-refresh-token.html)

`openid` supplies the OIDC subject. `email` supplies the verified email claim
for the later invitation check. User identity is `(issuer, sub)` and maps to a
distinct server-assigned ShelfState `userId`. Neither email nor Cognito `sub`
confers library ownership. WP-009 emits no app-client secret, token, frontend
runtime configuration, callback, or session handler.

Administrator-only account recovery is a development safeguard against
anonymous password-reset mail exhausting the native delivery quota. It uses
Cognito's `admin_only` recovery setting and leaves operator-managed
invitations available. The pool keeps the service default for MFA and adds no
SMS, email MFA, passwordless, federation, or custom factors. Dynamic client
registration is opt-in and the template guard requires its configuration to
be absent. The existing CloudFront WAF protects the application hostname.
Cognito's separate endpoint has its own quotas, and `AUDIT` observes risk
without enforcing rate limits. Keep test invitations bounded and check
recovery suppression, quota signals, and acceptance traffic before any
expansion. [Account recovery](https://docs.aws.amazon.com/cognito/latest/developerguide/managing-users-passwords.html),
[Dynamic client registration](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-dynamic-client-registration.html),
[Threat protection limits](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pool-settings-threat-protection.html)

## Cost checkpoint

Checked 2026-11-25. AWS publishes **$0.020 per direct Cognito Plus MAU** at this
volume with no Plus MAU free tier. Threat protection including observation is
part of the Plus tier. This design sends no threat log exports to a separately
billed sink. Budget for one to two synthetic development MAUs during live
acceptance (about $0.02–$0.04 for Cognito MAU usage in an active month). The
approved 1- and 20-MAU planning rows remain $0.02 and $0.40. This is a workload
estimate, not a bill cap. AWS counts qualifying user activity beyond sign-in.
[Cognito pricing](https://aws.amazon.com/cognito/pricing/)

Cognito's default email configuration sends through AWS-managed delivery
resources. The default email quota is 50 messages per day per account in the
Region, resets at 09:00 UTC, and is non-adjustable. Plan a few synthetic invite
and verification messages during acceptance, with no ongoing bulk sends.
The model includes no customer-managed SES or SMS usage. Recheck quotas and
billing before deployment and reconcile actual activity on the first bill.
An SES transition, increased quotas, enforcement, or added WAF protection
warrants separate review. [Email delivery](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-email.html),
[Cognito quotas](https://docs.aws.amazon.com/cognito/latest/developerguide/quotas.html)

## Bounded deployment contract

The existing west bootstrap mechanism now models a `cognito-login` phase with
closed, prepare-only, and execute-only caller policies for
`shelfstate-v4-dev-cognito-login`. The ordinary rollout allowlist stays as
approved. The policy constructor preserves every installed WP-007/WP-008
statement in its existing attachment. Cognito create, read, update and
dependent-resource rollback grants are composed into West. Cognito tagging
grants are composed into WestEdge to fit the existing managed-policy limits.

The local preparation contract pins the exact reviewed inline template and
confirmed preflight. It projects one `CREATE` request named
`wp009-<template SHA-256>` with the existing west execution role, the four
approved resource types, zero parameter overrides, no assets, no nested
stacks or imports, and `OnStackFailure=ROLLBACK`. The separate review requires
complete, authenticated preparation readback for exactly four additions, an
empty pre-existing resource map, the reviewed original template and role, and
the immutable change-set and stack ARNs. Execution uses both readback ARNs,
omits `DisableRollback`, and sets `RetainExceptOnCreate=false` to preserve
the protected retained pool if creation fails.

Record the authenticated CreateChangeSet request for the CREATE type and
empty overrides and use DescribeStacks to verify the role. Cross-check the
resolved CDK `BootstrapVersion` default from DescribeChangeSet against the
bootstrap parameter, with a version of at least 6. CloudFormation documents
`Replacement` for Modify. An Add may omit it, and any supplied value must be
`False`. Review `GetTemplate` with `TemplateStage=Original` against the
accepted template before execution. [CloudFormation resource changes](https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_ResourceChange.html)

The prepare caller may pass only the existing west execution role to
CloudFormation. The execute caller uses the stored role and has no PassRole
allowance. The caller permits CloudFormation stack tag checks only with
`cloudformation:CreateAction` for the window's change-set operation. The
request supplies no stack tags and standalone tags are denied. If AWS
requires a separate change-set-resource tagging or pre-deployment validation
permission for this template, preserve the exact denial for review. Validation
stays enabled. Only the exact execute window permits termination protection.
AWS IAM scopes `ExecuteChangeSet` to the exact prepared stack ARN
and change-set **name**. The separately approved local review pins the full
change-set ARN and request flags. IAM also cannot enforce inline template
content or the CREATE type. Use the pinned request projections and prevent
other principals from creating, deleting, or substituting a change set or
operating stacks with the shared west role while the temporary grant is live.
[CloudFormation IAM scope](https://docs.aws.amazon.com/service-authorization/latest/reference/list_cloudformation.html),
[CloudFormation pre-deployment validation](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/validate-stack-deployments.html),
[CreateChangeSet API](https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_CreateChangeSet.html),
[ExecuteChangeSet API](https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_ExecuteChangeSet.html)

All Cognito grants use `aws:RequestedRegion=us-west-2`. The pool ownership
tags are `Project=ShelfState`, `Environment=dev`, `ManagedBy=AWS-CDK`, and
`WorkPackage=WP-009`.

| Mode | Cognito execution grants |
|---|---|
| Initialization | `CreateUserPool` on `*` with all four request tags and only approved tag keys. Within the same-account `userpool/us-west-2_*` pattern with all four existing ownership tags, allow pool/client/branding reads, `GetUserPoolMfaConfig`, `ListTagsForResource`, and creation and rollback deletion of the client, prefix domain and branding. |
| Tagging | Initial `TagResource` uses the same-account `userpool/*` ARN in `us-west-2`, requires all four request tags, and admits their keys plus the three reserved CloudFormation keys. Existing ownership tags, when present, must agree. `UntagResource` retains the narrower initialization pattern and requires ownership. It can target only the three reserved stack keys. Steady tagging requires the exact owned pool and preserves ownership tag values. |
| Steady | On the authenticated exact pool ARN with all ownership tags, retain approved reads and tagging, and allow `UpdateUserPool`, `UpdateUserPoolClient`, `UpdateUserPoolDomain`, and `UpdateManagedLoginBranding`. Creation and rollback deletes are removed. |
| Domain read in both modes | `DescribeUserPoolDomain` uses `*` in `us-west-2` because AWS exposes no resource-level scope or prefix condition for this action. |

The service generates user-pool IDs without an environment name. The
temporary lifecycle scope uses ownership tags to identify development pools.
Initial `TagResource` can reach a same-account west pool that lacks the
ownership tags. Before enabling these policies, explicitly accept that
remaining reach, confirm no pre-existing pool has the approved name or
ownership tag set, and isolate every principal that can use the shared
execution role. Verify Cognito's effective authorization for both tagged
creation and dependent tag authorization. The service reference documents
request tags on `CreateUserPool` and `TagResource`, and resource tags and
tag-key constraints on `UntagResource`. The regional provider schemas also
declare `SetUserPoolMfaConfig` and `ListUserPoolClientSecrets` for general
handlers. The accepted template sets no separate MFA configuration and uses
a public client without a secret. If a handler calls either action, or
requires a different tag context, capture the exact call and stop for
review. `DeleteUserPool`, user administration and other integrations are
outside the proposed grant. [Cognito IAM actions and scoping](https://docs.aws.amazon.com/service-authorization/latest/reference/list_cognito-idp.html),
[CloudFormation tagging](https://docs.aws.amazon.com/cognito/latest/developerguide/tagging.html)

### First deployment and recovery

The first CREATE execution reached `ROLLBACK_COMPLETE` with no physical
Cognito resources. Request `e99e009e-76cd-421b-a48c-ad5e3af99550` failed with
`cognito-idp:TagResource` denied on the same-account west `userpool/*` ARN.
The previous `userpool/us-west-2_*` pattern could only match after an ID was
available. The correction covers the observed ARN only for initialization
`TagResource`. CloudFormation can propagate stack and system tags, and the
reviewed template supplies the four ownership tags. CloudTrail omitted
request parameters for this failed `CreateUserPool` event. Simulation with
the required context verifies the proposed authorization. The actual
create-time tag context remains a live acceptance requirement.

A fresh CREATE requires separate authorization to remove the failed stack
record after an authenticated check confirms there are still no physical
resources, including any retained pool. Stop for review if a resource is
found. Then follow the separate prepare, review and close sequence and the
separately approved execute and close sequence below with a new immutable
change-set ARN. The executed change set cannot be reused.

### Subsequent AWS sequence

1. Obtain separate preflight and preparation authority. Authenticate the
   existing west roles and accepted policy digests. Verify the stack and
   matching pools are absent and the exact prefix
   `shelfstate-v4-dev-auth-710058944513` is available. Recheck the cost and
   invitation-only posture before exposing the Cognito endpoint.
2. Open only the west prepare window, submit the pinned CREATE request once,
   collect the original template, complete change list, stack role and empty
   physical readbacks, then return the caller to closed. Review the exact
   prepared stack and change-set ARNs and the execution-policy pair.
3. After distinct execute approval, verify containment of other callers,
   install and read back the approved temporary West/WestEdge versions, open
   only the exact execute window and execute the immutable change set once.
   Verify stack termination protection and all four physical resources.
4. After `CREATE_COMPLETE`, bind the authenticated pool ARN, narrow the two
   execution policies, verify effective readback and close the callers. The
   four-resource readback must correlate the exact domain, app client and
   branding IDs to that pool, and the branding to the reviewed app client.
   Any failure or retained pool stops the deployment for human review. No
   automatic retry or pool cleanup is authorized.

This repository extension creates no resources or charges. Later deployment
exposes Cognito's Managed Login endpoint outside the application's CloudFront
WAF. AUDIT observes risk without blocking abuse and native email is quota
limited. AWS behavior and billing still require real acceptance.

## Separate production decision

Production needs an explicit production environment binding, a separate stack
and deletion-protected pool, its own Managed Login v2 domain and branding, and a separate
public code/PKCE client with only the approved production scopes. Confirm
exact production callback and logout URLs, initial invite-only admission,
native email capacity, MFA and risk posture, token lifetimes and rotation,
and effective cost and abuse controls before authorizing a production
configuration. None of the development identifiers or redirect literals is
shared with production.

## Live acceptance boundary

Repository tests establish the synthesized configuration and isolation.
Separately authorized AWS acceptance still needs to verify the exact stack,
pool, branding, client and DNS prefix readbacks, successful Managed Login
with a synthetic invite, native mail delivery, `AUDIT` observations,
enumeration resistance, rejection of self-signup/direct sign-in/extra
redirects and dynamic client registration, and the accepted logout return. A
controlled authorize request can observe the registered callback redirect
without following it into the application. The complete BFF callback/token
exchange and application-session revocation are later work packages.
