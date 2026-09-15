# ADR-007: Infrastructure as Code, delivery, and AWS administration

- **Status:** Closed / approved; amended 2026-09-14
- **Current authority:** [`V4_ARCHITECTURE.md`](../V4_ARCHITECTURE.md) §21

## Context

Production infrastructure must be reproducible, reviewed, separable from V3, and administered without durable broad credentials.

## Decision

Use AWS CDK v2 in JavaScript and GitHub Actions with OIDC temporary deployment roles. Merge is not deployment; production requires explicit human release of a reviewed revision, change preview, verification, and rollback support. V4 deploys only to AWS and cannot trigger or alter the frozen V3 Netlify production surface.

AWS root is MFA-protected break-glass only, has no access keys, and is never routine. Human access uses MFA-protected temporary roles; Identity Center is preferred where suitable without mandatory account restructuring. Routine operator authority is narrow; recovery/backup/Vault Lock/destructive authority is separately scoped. CloudTrail audits management activity and access is periodically reviewed.

## Rationale

IaC and short-lived federated credentials reduce drift and credential exposure. Deliberate releases preserve review and production control.

## Consequences

Emergency console changes require incident documentation and IaC reconciliation. Durable resources need protection. Exact repository/package layout remains future planning work.

## Deferred / reconsideration triggers

Separate AWS accounts may be adopted when scale/risk justifies the administration. Routine long-lived IAM access keys remain prohibited.

## Amendments

The 2026-09-14 adjudication added the human AWS administration baseline and V3/V4 deployment isolation.
