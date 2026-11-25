# ShelfState V4 WP-008 persistence foundation

Updated: 2026-11-25. This record covers the WP-008 design, development
deployment, and accepted real-DynamoDB verification. It grants no deployment
authority.

## Storage boundaries and contract

WP-008 defines contract version `1` for two physical DynamoDB tables:

| Boundary | Logical family | Partition-key form | Retention authority |
|---|---|---|---|
| Identity / Account | `IdentityMap` | `IDENTITY#<sha256(subject)>` | Application/account lifecycle; no TTL |
| Identity / Account | `Account` | `ACCOUNT#<sha256(userId)>` | Application/account lifecycle; no TTL |
| Session / Auth Transaction | `Session` | `SESSION#<sha256(random session identifier)>` | Idle/absolute timestamps are authoritative; TTL cleans up after absolute expiry |
| Session / Auth Transaction | `AuthTransaction` | `AUTH_TRANSACTION#<sha256(random state)>` | Status/expiry are authoritative; TTL cleans up after expiry |

The browser keeps only random opaque session, browser-binding, and CSRF values
in their later cookie/header channels. Their hashes, not the raw values, enter
persistence keys or comparisons. The session contract stores the immutable
ShelfState `userId`, Cognito-subject hash, account `sessionVersion`, fresh-auth
time, idle/absolute expiry, CSRF hash, and a bounded server-only token bundle.
No Cognito token is returned to or stored by browser code in this package.

The auth-transaction contract stores hashed state, browser binding and nonce,
the PKCE verifier required by the later server-side code exchange, an explicitly
allowlisted relative return path, timestamps, and single-use status. WP-008 adds
no callback, Cognito integration, account provisioning, or browser session flow.

All parsers reject unsupported contract versions, missing or extra fields,
malformed identifiers, invalid timestamp ordering, and unsupported enum values.
Security-decision reads set DynamoDB `ConsistentRead: true`. Create operations
use `attribute_not_exists(pk)`. Auth-transaction consumption first checks the
application timestamp and browser binding, then conditionally changes `PENDING`
to `USED`; a replay or concurrent consume fails. TTL deletion is never treated
as a validity signal.

## Data classification and logging

| Data | Classification | Handling |
|---|---|---|
| `userId`, role, status, session version | Confidential identity/account data | Identity/Account table only; family-scoped access |
| Cognito subject | Restricted identity data | Hashed before storage/key construction; email is absent and never authority |
| Raw session ID, OAuth state, browser binding, nonce, CSRF token | Restricted authentication secrets | Generated from at least 256 bits; only SHA-256 digests persist |
| PKCE verifier and server token bundle | Restricted authentication secrets | Server-side persistence only; bounded fields; never keys, browser output, errors, or logs |
| Expiry/status/timestamps | Confidential security metadata | Validated by application on every security decision; TTL is cleanup only |

The contract and repositories contain no logging calls. Their errors are fixed,
sanitized messages and do not interpolate items, keys, tokens, subjects, or AWS
responses. Future handlers must preserve this boundary and the `PRIV-002`
prohibition on logging tokens, cookies, session IDs, CSRF values, PKCE verifiers,
or full bodies.

## Infrastructure and IAM

The explicit `identity-session` WP-008 synth path defines:

- DynamoDB Standard tables in `us-west-2` with On-Demand billing;
- AWS-managed KMS encryption (`alias/aws/dynamodb`);
- continuous PITR with the full 35-day recovery period;
- deletion protection plus Retain deletion/update-replacement policies in both
  environments;
- TTL only on the Session/Auth Transaction table;
- no GSI, local secondary index, DynamoDB Stream, query, or scan access.

WP-008 retains the deployed AWS-managed KMS configuration on both tables. The
approved CDK sets `SSEEnabled=true` and `SSEType=KMS` and omits `KMSMasterKeyId`.
CloudFormation resolves that configuration to `alias/aws/dynamodb`, which
matches the development readback. The earlier “AWS-owned” wording mislabeled
that configuration. [CloudFormation SSE settings](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-dynamodb-table-ssespecification.html)

| Encryption option | Key ownership and control |
|---|---|
| AWS-owned | DynamoDB's default uses a service-owned key outside the customer account, with no additional encryption charge. |
| AWS-managed KMS | AWS manages the DynamoDB service key `alias/aws/dynamodb` in the customer account. WP-008 uses this option. |
| Customer-managed KMS | The customer selects a key in their account and controls its policy and lifecycle. |

[DynamoDB encryption at rest](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/EncryptionAtRest.html)

Four deployed managed policies scope their grants to the `IdentityMap`,
`Account`, `Session`, and `AuthTransaction` key prefixes. Each grants only its
required item actions on its exact table ARN. All four remain unattached. Later
application roles must compose only the policies for the families they own.
AWS Backup/Vault Lock remains the separately gated WP-039 recovery package.

Default foundation synth and every accepted WP-007 phase remain unchanged. The
WP-008 inspection command does not deploy, bootstrap, look up, or read AWS:

```text
npm run test:persistence
npm run infra:synth:wp008
```

## Deployment authority and steady-state closeout

The development deployment used the bounded `identity-session` CloudFormation
phase and the separate bootstrap prepare/execute controls. The repository
models these controls for offline review.

- The west deployment-role allowlist already included the exact
  `shelfstate-v4-dev-identity-session` stack ARN.
- Execution authority covers the two exact dev table ARNs and four exact
  customer-managed policy ARNs. It contains DynamoDB create, stabilization,
  PITR, TTL and tag operations plus IAM managed-policy create/version/read and
  rollback operations. It contains no DynamoDB item action, `DeleteTable`, IAM
  attachment action, role creation, or production resource.
- `CreateTable` uses request-tag conditions. Existing-table lifecycle calls are
  scoped by exact ARN instead of incorrectly treating request tags as existing
  resource tags.
- The strict review schema requires one `CREATE` change set containing exactly
  two protected `AWS::DynamoDB::Table` additions and four unattached
  `AWS::IAM::ManagedPolicy` additions, all non-replacing, with exactly
  `CAPABILITY_NAMED_IAM`.
- The reviewed failure projection is `OnStackFailure=ROLLBACK`, with
  `DisableRollback` omitted and `RetainExceptOnCreate=false`. IAM policy
  definitions may be removed during rollback, but retained tables cannot be
  deleted by the execution policy. Failed or partial rollback stops for a new
  human recovery review; it never weakens deletion protection or adds
  `DeleteTable`.
- Change-set preparation and execution remain distinct `wp008-<sha256>` caller
  windows, and the closed state denies CloudFormation and PassRole operations.

The development stack reached `CREATE_COMPLETE` with six resources. Temporary
deployment caller authority is closed, with explicit denies for change-set
creation and execution. The West v8 and WestEdge v7 execution policies remain
on the existing CloudFormation execution role. Their steady-state closeout
requires separate authorization. Review the exact-resource policy pair, remove
WP-008 table and managed-policy creation permissions while preserving approved
lifecycle and WP-007 permissions, then verify the installed default versions,
documents, attachments, and effective restrictions. Keep the caller closed.

## Cost checkpoint

Standard On-Demand bills for requests and table storage. PITR bills based on
each protected table's size across the supported recovery window. The
AWS-managed DynamoDB key has no separate monthly storage fee. KMS API requests
can incur usage charges. [DynamoDB pricing](https://aws.amazon.com/dynamodb/pricing/),
[PITR billing](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/PointInTimeRecovery_Howitworks.html),
[KMS pricing](https://aws.amazon.com/kms/pricing/)

The existing development screening case assumes 0.1 GB of combined table data,
30,000 writes, and 250,000 strongly consistent reads per month. The DynamoDB and
PITR subtotal is approximately **$0.10/month** using the existing example rates
($0.025 table storage, $0.020 PITR, $0.019 writes, and $0.031 reads, rounded
upward). It excludes tax, data transfer, and KMS requests and assumes no
promotional or free-tier allowance. KMS request volume depends on traffic and
DynamoDB's per-caller key caching. The workload assumptions do not establish a
KMS request count, so the total monthly cost remains uncertain until usage or
billing data is available. [DynamoDB key caching](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/encryption.howitworks.html)

The production Personal baseline (approximately `$2.70/month`) already includes
the DynamoDB and PITR purposes of these tables. Revalidate this package's usage
against measured item sizes, DynamoDB activity, and billable KMS requests before
production deployment or material expansion.

## Accepted development verification

Development readback confirmed both tables `ACTIVE` with 35-day PITR enabled,
deletion protection enabled, and `Retain` on deletion and replacement. TTL was
disabled on Identity/Account and enabled on `cleanupAfterEpochSeconds` on
Session/Auth Transaction. TTL deletion and recovery restores were outside this
acceptance run.

- The committed adapters round-tripped `IdentityMap`, `Account`, `Session`, and
  `AuthTransaction` through their intended DynamoDB tables. Four duplicate
  creates were conditionally rejected. Malformed and unsupported test inputs
  were rejected before reaching AWS.
- All 15 security reads before cleanup were strongly consistent. With the
  application clock advanced to the idle and absolute boundaries, the session
  was rejected while its item remained present.
- Auth-transaction expiry and incorrect browser binding were rejected. Two
  concurrent consumption attempts produced one success and one conditional
  conflict. Replay was rejected and the stored status was `USED`.
- Four exact synthetic keys were deleted, and four strongly consistent reads
  confirmed their absence. Cleanup used neither Scan nor Query.
- All four deployed policy documents matched the committed action, table, and
  key-family contracts. All 39 targeted IAM simulations returned the expected
  decisions (11 allows and 28 implicit denies). The policies had zero
  attachments or permissions-boundary usage. Live authorization and denial
  through family-scoped principals remain a downstream acceptance requirement
  when application roles are introduced.

Evidence reference: WP-008 private real-DynamoDB acceptance record
(`identity-session-real-dynamodb-acceptance-record.private.json`), SHA-256
`40c5db7aad4775d244c3e5a4c906dba064445c28507c258d870f7a5da48b989e`.
