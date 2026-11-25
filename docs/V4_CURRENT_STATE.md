# ShelfState V4 current-state and handoff index

Updated: 2026-11-25. **Evidence index only — not an authorization source.**
Detailed package rules remain in
[the implementation plan](V4_IMPLEMENTATION_PLAN.md#b2-common-package-rules).

## Accepted baseline

| Subject | Current state |
|---|---|
| Repository baseline | PR #39 landed the WP-008 steady-state policy composition. PR #40 merged the WP-009 Cognito foundation at `b7d1414bc5a9fc6b61c478fc71c690b430220e95`. |
| WP-006B release controls | Accepted with the recorded nonblocking limitations in the [dated OIDC/release checkpoint](V4_OIDC_RELEASE_CHECKPOINT.md#916-wp-006b-hosted-proof-acceptance--2026-10-22). This does not grant deployment authority. |
| WP-007 | **Closed and accepted.** The protected development CloudFront distribution, WAF, issued certificate, private S3 origin, API origin, Route 53 alias, inert static proof, and actual custom-domain health endpoint were deployed and verified. `https://dev.shelfstate.codecorax.com/` and `/api/v1/health` passed their accepted checks; V3 remained isolated. |
| WP-007 authority | Temporary deployment/DNS/publication/security authority is closed. No standing AWS mutation permission is carried into WP-008. |
| WP-007 private closeout | `%LOCALAPPDATA%\ShelfState\wp007\final-security-closeout-20261121T224843Z\wp007-final-security-closeout.private.json`; the full recorded digest remains in the accepted private handoff. |
| WP-008 | **Closed and accepted.** The development stack reached `CREATE_COMPLETE` with two retained DynamoDB tables and four unattached IAM policies. Real DynamoDB tests passed across all four item families, including conditional writes, expiry, concurrent single-use consumption, and cleanup. See the [persistence record](V4_WP008_PERSISTENCE.md#accepted-development-verification). |
| WP-008 security closeout | Both caller windows are closed. Installed West v9 canonical SHA-256 is `7b915b55c01d8c55512498511237504643a219941d5417168504ba7cd96b93a0`. WestEdge v8 is `6e719977bdf113133336b34fbae7dc5f47c5b38394a654df8540e838350d6c8f`. The 39 policy simulations passed. Live family-scoped enforcement awaits application runtime roles. |

## Active package

| Field | Current state |
|---|---|
| Active package | WP-009 — Cognito Plus and Managed Login deployment preparation |
| Repository state | The accepted dev-only four-resource Cognito configuration has bounded west caller-window proposals, initialization and exact-pool steady policies, and a strict CREATE review contract. |
| AWS state | The WP-009 stack is pending separately authorized deployment. Caller windows remain closed and installed execution policies remain at the accepted checkpoint. |

## Current handoff

- The next AWS gate is separately authorized preflight and preparation for
  `shelfstate-v4-dev-cognito-login`. The immutable change-set ARN requires a
  distinct execute approval. See the [WP-009 deployment contract](V4_WP009_COGNITO_LOGIN.md#bounded-deployment-contract).
- WP-010 owns the server-side OAuth callback. Application sessions and
  production Cognito remain later work.
