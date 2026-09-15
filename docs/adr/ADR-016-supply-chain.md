# ADR-016: Dependency and supply-chain security

- **Status:** Closed / approved
- **Current authority:** [`V4_ARCHITECTURE.md`](../V4_ARCHITECTURE.md) §26

## Context

V4 introduces build, deployment, frontend, backend, and IaC dependencies that can affect production integrity.

## Decision

Minimize dependencies, commit lockfiles, use reproducible clean installs, pin GitHub Actions to immutable revisions, review dependency additions, and make known exploitable production vulnerability findings a release gate. Use automated update tooling with review and tests.

## Rationale

A small dependency graph and immutable automation inputs reduce compromise and maintenance exposure without creating a separate platform.

## Consequences

Dependency changes receive security scrutiny. Emergency exceptions are explicit, time-bounded, and documented.

## Deferred / reconsideration triggers

A formal SBOM is deferred until commercial, regulatory, customer, or governance requirements justify it.

## Amendments

None.
