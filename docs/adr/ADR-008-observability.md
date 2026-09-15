# ADR-008: Observability and alerting

- **Status:** Closed / approved; amended by ADR-021
- **Current authority:** [`V4_ARCHITECTURE.md`](../V4_ARCHITECTURE.md) §22

## Context

The invite-only serverless system needs actionable diagnosis and alerting without collecting private library content or adding disproportionate idle cost.

## Decision

Use structured CloudWatch logs, native service metrics, approximately five actionable production alarms, and SNS email. Propagate correlation IDs and sanitize/minimize logs. Do not use X-Ray initially.

The initially considered custom CloudWatch dashboard is expressly deferred. Use service-provided dashboards for ad-hoc inspection and reconsider a custom dashboard only after one full Personal production billing cycle shows comfortable actual cost and recurring operational value.

## Rationale

Native signals are sufficient for short serverless request paths and minimize cost/operations. The dashboard does not satisfy a launch-critical control.

## Consequences

Production routine logs retain about 30 days; non-production about 7–14. Alerts cover sustained failures/throttles, not every 4xx or transient event. Async destination failures must be observable.

## Deferred / reconsideration triggers

Custom dashboards or distributed tracing require observed operational need and cost review.

## Amendments

ADR-021's approved cost review deferred the custom dashboard from V4.0.
