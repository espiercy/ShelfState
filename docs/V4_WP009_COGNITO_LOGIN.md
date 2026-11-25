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

## Future deployment-authority review

The existing west caller is closed and the bootstrap allowlist and local
initialization phase table omit this stack. A separate authorization must bind
the exact west `shelfstate-v4-dev-cognito-login` stack ARN and accepted template
to a prepare-only change-set window, then the immutable change-set ARN to one
execute-only window. The caller needs existing scoped CloudFormation preview
and read actions, `iam:PassRole` only for the west CloudFormation execution
role to CloudFormation, and the termination-protection action for this stack.
Preserve the two west execution policy attachments and all accepted WP-007 and
WP-008 grants. Close the caller and narrow initialization permissions after
readback.

The Oregon provider schemas and Cognito authorization reference identify the
following `cognito-idp:` permission candidates for this template. Handler
declarations cover more configuration options than this candidate uses.
The single template creates the pool and its dependent resources before an
exact pool ARN can be known. A later deployment review must approve an initial
same-account `userpool/us-west-2_*` ARN pattern for pool-scoped actions. Bind
supported operations to the existing project/environment/management tags and
`WorkPackage=WP-009`, verify no pre-existing pool matches that tag set, and
replace the pattern with the authenticated pool ARN after creation. Initial
tagging may need request-tag conditions before resource tags can be observed.
Review this residual before any live grant. The provider call path and
effective context remain subject to actual AWS verification.

| Purpose | Actions and scope |
|---|---|
| Pool initialization | `CreateUserPool` on `*`, bounded by `aws:RequestedRegion` in `us-west-2` and exact request tags. Use the reviewed pool scope above for `TagResource`, `DescribeUserPool`, `ListTagsForResource`, `GetUserPoolMfaConfig`, and any provider-required `SetUserPoolMfaConfig` call. |
| Client create/read/rollback | `CreateUserPoolClient`, `DescribeUserPoolClient`, `ListUserPoolClientSecrets` if used by the read handler, and rollback `DeleteUserPoolClient`, scoped to the reviewed pool as described above. |
| Prefix domain create/read/rollback | `CreateUserPoolDomain` and rollback `DeleteUserPoolDomain` in the reviewed pool scope. `DescribeUserPoolDomain` has no resource-level scope in the service reference and requires a separately reviewed regional read allowance on `*`. |
| Branding create/read/rollback | `CreateManagedLoginBranding`, `DescribeManagedLoginBrandingByClient`, `DescribeManagedLoginBranding`, and rollback `DeleteManagedLoginBranding` in the reviewed pool scope. |
| Exact steady-state management | Approved Cognito reads plus `UpdateUserPool`, `UpdateUserPoolClient`, `UpdateUserPoolDomain`, `UpdateManagedLoginBranding`, `TagResource`, and `UntagResource` as needed on the exact pool. Review provider behavior for any ancillary calls. |

The pool is retained and deletion-protected. `DeleteUserPool` is outside the
proposed authority. Rollback can leave a retained pool and must stop for
review before any subsequent create attempt. Generic handler schemas also
list permissions for optional paths such as SMS/role integration, analytics,
customer KMS, schema additions, and custom-domain CloudFront management. Do
not copy those lists into execution IAM. If AWS requires an extra dependency
for the approved configuration, capture the exact request and stop for review.
User provisioning, user administration, and enabling other security modes
require their own authorization. [Cognito IAM actions and scoping](https://docs.aws.amazon.com/service-authorization/latest/reference/list_cognito-idp.html),
[CloudFormation tagging](https://docs.aws.amazon.com/cognito/latest/developerguide/tagging.html)

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
