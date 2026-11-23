# ShelfState V4 WP-008 persistence foundation

Updated: 2026-11-22. This is a repository design and local-verification record,
not deployment authority or real-DynamoDB acceptance evidence.

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
- AWS-owned KMS encryption (`SSEEnabled=true`, `SSEType=KMS`, no customer key);
- continuous PITR with the full 35-day recovery period;
- deletion protection plus Retain deletion/update-replacement policies in both
  environments;
- TTL only on the Session/Auth Transaction table;
- no GSI, local secondary index, DynamoDB Stream, query, or scan access.

Four unattached managed-policy definitions isolate the `IdentityMap`, `Account`,
`Session`, and `AuthTransaction` key prefixes. Each has only its required item
actions and exact table ARN. Later application roles must compose only the
family policies their component owns. WP-008 deliberately creates no Lambda or
role and grants no principal access. None of the policies permits table
administration, backup administration, restore, scan, query, or cross-family
access. AWS Backup/Vault Lock remains the separately gated WP-039 recovery
package; adding it here would exceed this package and the no-additional-
infrastructure authorization.

Default foundation synth and every accepted WP-007 phase remain unchanged. The
WP-008 inspection command does not deploy, bootstrap, look up, or read AWS:

```text
npm run test:persistence
npm run infra:synth:wp008
```

## Deployment-authority readiness

The repository now models the bounded `identity-session` CloudFormation phase
through the existing bootstrap and prepare/execute controls. This is local
review material only and performs no AWS operation.

- The west deployment-role allowlist already contained only the exact
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

The next AWS step still requires fresh authorization to install/read back the
reviewed policy update, then separate preparation and execution authority. This
record does not grant either.

## Cost checkpoint

Repository work and local synthesis create no AWS resources, so the actual
WP-008 AWS delta at this checkpoint is **$0/month**.

A future approved deployment has no provisioned-capacity or per-table fixed
charge: Standard On-Demand bills requests and storage, and PITR bills the size
of each protected table. The 35-day period does not cost more than a shorter
PITR period because PITR price is table-size based. Under the conservative dev
screening case of 0.1 GB combined table data, 30,000 writes, and 250,000 strongly
consistent reads per month, current published example rates imply approximately
**$0.10/month** before tax/data transfer: about $0.025 table storage, $0.020
PITR, $0.019 writes, and $0.031 reads, rounded upward. This estimate assumes no
promotional/free-tier allowance.

The production identity/session table purposes were already included in the
approved approximately `$2.70/month` Personal model, so this repository package
does not change that modeled production total. Persistent dev resources would
be an additional usage-driven amount and must be revalidated against measured
item sizes and request counts before any deployment. Current pricing sources:
[DynamoDB pricing](https://aws.amazon.com/dynamodb/pricing/) and
[DynamoDB PITR billing](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/PointInTimeRecovery_Howitworks.html).

## Verification boundary

Local tests cover strict validation/round trips, opaque identifiers, exact
expiry boundaries, strong reads, create/consume conditional writes, simulated
cross-family IAM denials, table settings, PITR, encryption, TTL, deletion
protection, retention, and default V3/V4/foundation isolation. These tests use
an in-memory DynamoDB operation port and CDK assertions. They are not evidence
of effective AWS IAM, a deployed table, real DynamoDB conditional behavior,
PITR status, TTL cleanup, or recovery. Those remain explicit future deployment
and real-AWS gates.
