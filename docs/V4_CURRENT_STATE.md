# ShelfState V4 current-state and handoff index

Updated: 2026-11-22. **Evidence index only — not an authorization source.**
Detailed package rules remain in
[the implementation plan](V4_IMPLEMENTATION_PLAN.md#b2-common-package-rules).

## Accepted baseline

| Subject | Current state |
|---|---|
| Repository baseline | Accepted WP-008 `main` revision `a9a46775b4ea61fcadde0bc46ec5dac24ec1ee38` (PR #36) before the repository-only deployment-authority extension. |
| WP-006B release controls | Accepted with the recorded nonblocking limitations in the [dated OIDC/release checkpoint](V4_OIDC_RELEASE_CHECKPOINT.md#916-wp-006b-hosted-proof-acceptance--2026-10-22). This does not grant deployment authority. |
| WP-007 | **Closed and accepted.** The protected development CloudFront distribution, WAF, issued certificate, private S3 origin, API origin, Route 53 alias, inert static proof, and actual custom-domain health endpoint were deployed and verified. `https://dev.shelfstate.codecorax.com/` and `/api/v1/health` passed their accepted checks; V3 remained isolated. |
| WP-007 authority | Temporary deployment/DNS/publication/security authority is closed. No standing AWS mutation permission is carried into WP-008. |
| WP-007 private closeout | `%LOCALAPPDATA%\ShelfState\wp007\final-security-closeout-20261121T224843Z\wp007-final-security-closeout.private.json`; the full recorded digest remains in the accepted private handoff. |

## Active package

| Field | Current state |
|---|---|
| Active package | WP-008 — Identity, Account, Session, and Auth-Transaction Persistence |
| Repository state | Contract version 1, two-table CDK inspection path, family-scoped unattached IAM policy definitions, backend operation-port adapters, plus a bounded repository-only CloudFormation deployment-authority candidate using the existing prepare/execute mechanism. |
| Physical boundaries | Identity/Account table; Session/Auth Transaction table. |
| Security invariants | Opaque/hash-keyed secrets, strong security reads, conditional creates/single-use consumption, application-authoritative expiry, TTL cleanup only, no browser Cognito tokens, no sensitive logging. |
| Infrastructure settings | Standard, On-Demand, AWS-owned encryption, 35-day PITR, deletion protection, Retain policies, no GSI, no Streams. |
| Cost | Actual repository-only AWS delta `$0/month`; future persistent dev estimate and revalidation are in [the WP-008 persistence record](V4_WP008_PERSISTENCE.md#cost-checkpoint). |
| AWS state | **Not deployed.** No table, IAM policy, execution-policy update, change set, backup, Cognito, Lambda, API, DNS, CloudFront, WAF, or other AWS change is claimed or authorized. |
| Verification boundary | Local contract/adapter tests, in-memory simulated DynamoDB behavior/IAM denials, offline CDK assertions, exact deployment-policy simulation, and strict CREATE change-set review validation only. Effective-IAM and real-table/PITR/TTL/recovery acceptance remain open. |

## Current handoff

- Review [the WP-008 persistence record](V4_WP008_PERSISTENCE.md) for the exact
  key contracts, classification, IAM boundaries, cost assumptions, commands,
  and evidence limitations.
- WP-009 and later auth flows remain out of scope. Cognito, OAuth endpoints,
  JIT provisioning, actual browser sessions, account lifecycle behavior, AWS
  Backup/Vault Lock, and production deployment have not begun.
- A future real-AWS WP-008 gate requires fresh explicit authority first to
  install and read back the reviewed execution-policy update, then separate
  prepare-only and execute-only authorization for the exact reviewed CREATE
  change set. This index grants none of them.
