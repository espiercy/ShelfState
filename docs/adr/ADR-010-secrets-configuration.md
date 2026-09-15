# ADR-010: Secrets and configuration

- **Status:** Closed / approved
- **Current authority:** [`V4_ARCHITECTURE.md`](../V4_ARCHITECTURE.md) §24

## Context

V4 needs environment configuration without putting sensitive values in source, browser bundles, logs, or unnecessarily expensive secret stores.

## Decision

Prefer IAM/service identity so no secret exists. Keep stable non-secret values in source/CDK and runtime non-secrets in environment variables or Parameter Store where warranted. Use Secrets Manager only for real rotatable secret material that cannot be eliminated. Never store secrets, OAuth tokens, session IDs, PKCE verifiers, or presigned URLs in source or client-accessible configuration.

## Rationale

Eliminating secrets is simpler and safer than storing them. Configuration services should match classification and lifecycle rather than be used uniformly.

## Consequences

Access is least-privilege, rotations are supported where secrets remain, and logs/errors are sanitized. GitHub uses OIDC rather than access-key secrets.

## Deferred / reconsideration triggers

Add Secrets Manager entries only when an approved integration introduces unavoidable secret material.

## Amendments

None.
