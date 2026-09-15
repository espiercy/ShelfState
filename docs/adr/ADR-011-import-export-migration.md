# ADR-011: Import, export, and V3 migration

- **Status:** Closed / approved; amended 2026-09-14
- **Current authority:** [`V4_ARCHITECTURE.md`](../V4_ARCHITECTURE.md) §18 and [`V3_EXPORT_COMPATIBILITY.md`](../V3_EXPORT_COMPATIBILITY.md)

## Context

Users need complete portable export, safe replace/merge import, and migration from frozen V3 without modifying V3. Full libraries need coherent reads and can exceed synchronous/transaction limits.

## Decision

Use a versioned implementation-independent logical format and temporary private S3 transport with short-lived operation-specific presigned URLs. Imported bytes remain untrusted until fully bounded and validated. Replace and merge are explicit; IDs are identity, no fuzzy matching or timestamp-winner merge.

Import/export generation runs as owned, idempotent asynchronous Operation resources. Whole-generation work uses the ADR-001 writer fence. Export double-reads CONTROL around all pages. Schema 3 from frozen V3.9 is mandatory; schemas 1 and 2 are supported only through the deterministic transformations in the compatibility matrix. Preserve valid historical IDs/data/relationships/default marker, exclude `activeBookshelfId`, diagnose corruption, and never invent ambiguity or treat IDs as authority.

## Rationale

Logical files decouple portability from storage. Staging and conditional activation prevent partial replacement. A dedicated compatibility layer keeps V3 frozen.

## Consequences

Unsupported versions return `UNSUPPORTED_IMPORT_VERSION`. Transfer objects are temporary/non-authoritative and removed after about 24 hours. Duplicate async delivery cannot duplicate activation or artifacts.

## Deferred / reconsideration triggers

Field-level automatic merge remains deferred until real workflows justify its complexity.

## Amendments

The 2026-09-14 adjudication added generation fencing/coherent reads, full V3 policy, generalized idempotency, asynchronous operations, and TB-10 controls.
