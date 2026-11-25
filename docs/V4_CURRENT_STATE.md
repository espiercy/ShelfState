# ShelfState V4 current-state and handoff index

Updated: 2026-11-25. **Evidence index only — not an authorization source.**
Detailed package rules remain in
[the implementation plan](V4_IMPLEMENTATION_PLAN.md#b2-common-package-rules).

## Accepted baseline

| Subject | Current state |
|---|---|
| Repository baseline | WP-008 development deployment and acceptance used `main` revision `7961e1ac85454cb560e273bb3b7fe0854ad32e04` (PR #37), including the persistence foundation from PR #36. |
| WP-006B release controls | Accepted with the recorded nonblocking limitations in the [dated OIDC/release checkpoint](V4_OIDC_RELEASE_CHECKPOINT.md#916-wp-006b-hosted-proof-acceptance--2026-10-22). This does not grant deployment authority. |
| WP-007 | **Closed and accepted.** The protected development CloudFront distribution, WAF, issued certificate, private S3 origin, API origin, Route 53 alias, inert static proof, and actual custom-domain health endpoint were deployed and verified. `https://dev.shelfstate.codecorax.com/` and `/api/v1/health` passed their accepted checks; V3 remained isolated. |
| WP-007 authority | Temporary deployment/DNS/publication/security authority is closed. No standing AWS mutation permission is carried into WP-008. |
| WP-007 private closeout | `%LOCALAPPDATA%\ShelfState\wp007\final-security-closeout-20261121T224843Z\wp007-final-security-closeout.private.json`; the full recorded digest remains in the accepted private handoff. |

## Active package

| Field | Current state |
|---|---|
| Active package | WP-008 — Identity, Account, Session, and Auth-Transaction Persistence |
| Repository state | Contract version 1, two-table CDK inspection path, family-scoped IAM policy definitions, backend operation-port adapters, and bounded CloudFormation prepare/execute controls. |
| Physical boundaries | Identity/Account table and Session/Auth Transaction table in development. |
| Security invariants | Opaque/hash-keyed secrets, strong security reads, conditional creates/single-use consumption, application-authoritative expiry, TTL cleanup only, no browser Cognito tokens, no sensitive logging. |
| Infrastructure settings | Both tables are `ACTIVE`, Standard, On-Demand, encrypted with AWS-managed `alias/aws/dynamodb`, and protected by 35-day PITR, deletion protection, and `Retain` on deletion and replacement. No indexes or streams. TTL is disabled on Identity/Account and enabled on Session/Auth Transaction (`cleanupAfterEpochSeconds`). |
| Cost | Approximately `$0.10/month` for the existing development DynamoDB and PITR screening case, plus unmeasured KMS API request charges. The AWS-managed key has no monthly storage fee. See [cost assumptions](V4_WP008_PERSISTENCE.md#cost-checkpoint). |
| AWS state | The development stack is `CREATE_COMPLETE` with two tables and four deployed, unattached IAM policies. Temporary deployment caller authority is closed. |
| Functional acceptance | All four item families round-tripped on real DynamoDB. Strong security reads, conditional duplicate rejection, session idle and absolute expiry, and single-use transaction consumption under concurrency passed. Strong reads confirmed removal of all four synthetic items. |
| IAM verification | All four policy documents match the committed contracts, and 39 targeted IAM simulations passed. Live authorization and denial remain to be tested when family-scoped application roles are introduced. |
| Private evidence | WP-008 private real-DynamoDB acceptance record, SHA-256 `40c5db7aad4775d244c3e5a4c906dba064445c28507c258d870f7a5da48b989e`. See [accepted development verification](V4_WP008_PERSISTENCE.md#accepted-development-verification). |

## Current handoff

- Review [the WP-008 persistence record](V4_WP008_PERSISTENCE.md) for the exact
  key contracts, classification, IAM boundaries, cost assumptions, commands,
  and evidence limitations.
- WP-009 and later auth flows remain out of scope. Cognito, OAuth endpoints,
  JIT provisioning, actual browser sessions, account lifecycle behavior, AWS
  Backup/Vault Lock, and production deployment have not begun.
- The West and WestEdge CloudFormation execution policies still require a
  separately authorized [steady-state closeout](V4_WP008_PERSISTENCE.md#deployment-authority-and-steady-state-closeout).
  Keep temporary deployment caller authority closed.
