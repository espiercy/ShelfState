# ADR-009: Backup, disaster recovery, and recovery authority

- **Status:** Closed / approved; amended 2026-09-14
- **Current authority:** [`V4_ARCHITECTURE.md`](../V4_ARCHITECTURE.md) §§20, 21.9

## Context

Cloud authority requires recoverability from corruption, loss, or destructive operator action while preventing ordinary application or admin authority from defeating recovery.

## Decision

Target approximately 15-minute RPO and four-hour RTO. Enable DynamoDB PITR for the full supported window, target 35 days, plus approximately weekly AWS Backup recovery points retained about 90 days in a dedicated Governance-mode Vault Lock vault. Restore to separate tables and validate before promotion. Protect stateful infrastructure and maintain/test a secret-free recovery runbook.

Application roles cannot administer/delete recovery assets. Routine temporary human operator authority is separated from exceptional recovery, backup, Vault Lock, destructive recovery, and account-level authority. Root is MFA-protected, has no keys, and is break-glass only; management is CloudTrail-auditable.

## Rationale

PITR handles recent operational loss; independently retained locked backups improve destructive-event resilience. Authority separation prevents ADMIN or application compromise from trivially erasing recovery.

## Consequences

Cognito configuration is rebuilt from IaC; identity rebinding is separately verified and never email-only. Recovery must be drilled before launch and periodically.

## Deferred / reconsideration triggers

Cross-account/cross-region backups and automated Cognito profile replication require a stronger demonstrated recovery need.

## Amendments

The 2026-09-14 adjudication made temporary human access and recovery-authority separation explicit.
