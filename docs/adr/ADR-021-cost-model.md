# ADR-021: Cost posture and scale gate

- **Status:** Closed / approved; revalidated 2026-09-14
- **Current authority:** [`V4_ARCHITECTURE.md`](../V4_ARCHITECTURE.md) §23

## Context

ShelfState is initially a personal/invite-only product, so idle fixed costs can be disproportionate and architecture must remain viable without promotional/free-tier assumptions.

## Decision

Use the documented conservative Personal and approximately 20-user screening scenarios. The amended Personal model is approximately `$2.70/month`, against a preferred `$5/month` target. A near-term projection above about `$15/month` requires explicit review/approval or demonstrated-driver optimization before expansion. Budget alerts do not delete production.

The custom CloudWatch dashboard remains deferred until a full production billing cycle and explicit reconsideration. Added Operations Lambda, failure-only SQS destination, and auth/idempotency/operation records add an immaterial rounded `$0.01` Personal allowance under current published pay-per-use pricing.

## Rationale

Serverless managed services preserve low idle cost. Conservative no-free-tier modeling proves viability without depending on account eligibility.

## Consequences

Actual spend is reviewed after the first full cycle and before material expansion. Security/recovery controls are not weakened merely to reach a round-number target.

## Deferred / reconsideration triggers

Dashboard and ~20-user expansion remain behind observed-cost review. Pricing is revalidated before implementation and scale changes.

## Amendments

ADR-021 amended ADR-008 to defer the dashboard. On 2026-09-14 the async/idempotency delta changed the conservative Personal total from about `$2.69` to `$2.70`, not a material posture change.
