# ADR-002: Relational datastore implementation choice

- **Status:** N/A
- **Superseded by:** [ADR-001](ADR-001-primary-datastore.md)

## Context

The architecture discovery retained a decision slot for selecting a relational implementation if a relational primary datastore were chosen.

## Decision

No relational implementation is selected. ADR-001 approved DynamoDB as the V4 primary datastore, so this conditional decision is not applicable.

## Rationale

The prerequisite for this ADR did not occur. Recording N/A preserves the approved ADR numbering without inventing a relational decision.

## Consequences

V4.0 has no relational database. A future material datastore change requires a new or superseding ADR and baseline update.

## Deferred / reconsideration triggers

Only a proven requirement that the approved DynamoDB model cannot meet cleanly.

## Amendments

None.
