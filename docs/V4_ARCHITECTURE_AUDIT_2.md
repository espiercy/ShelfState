# ShelfState V4 Second Architecture Audit and Pre-Code Gate Review

> **Post-audit gate action:** The human Pre-Code Gate approval was received on 2026-09-15 and is recorded in `V4_ARCHITECTURE.md` §33. The result below is the audit's pre-approval conclusion and remains the evidence that supported that decision.

**Audit date:** 2026-09-14\
**Scope:** Post-adjudication governance artifacts and frozen V3 repository evidence
**Implementation changes reviewed:** None; this phase is documentation/governance only

## A. Executive Result

**READY FOR HUMAN PRE-CODE GATE APPROVAL**

The amended architecture, 25 reconstructed ADRs, 172-entry canonical requirements registry, V3 schema compatibility matrix, and threat/control mappings are mutually consistent at the level required before implementation planning. All substantive Pre-Code Gate review items pass. The gate is **not cleared** because explicit final human authorization is intentionally separate and remains outstanding.

The audit did not infer readiness merely from artifact presence. It compared the normative statements across the current-state baseline, every ADR, every registry category, every named threat/control and trust boundary, the historical V3 exporter/model/migration evidence, and each approved first-audit adjudication. No production code, V3 behavior, AWS resource, or implementation plan was created.

Repository verification after the documentation changes also ran the frozen V3 suite with `node --test`: **127 passed, 0 failed**.

## B. Changes Made to Governance Artifacts

- Git case-renamed `docs/V4_Architecture.md` to canonical `docs/V4_ARCHITECTURE.md` and updated repository references.
- Amended the architecture authority hierarchy and formally superseded—but did not claim equivalence to—the unavailable 196-item ledger.
- Added the library-wide revision, ordinary-write transaction, generation writer-fence/lease, and double-CONTROL whole-read protocol.
- Added exact server-authoritative shelf invariants and small-versus-oversized shelf-delete execution.
- Added generalized idempotency, single-use browser-bound OAuth login transactions, explicit asynchronous Operation resources/worker/failure destination, human AWS administration, lifecycle-worker authority separation, and V3/V4 isolation.
- Updated runtime and trust diagrams with Library Operations Lambda, SQS failure destination, browser/Cognito TB-09, and browser/presigned-S3 TB-10.
- Added architecture-level workflow surface evidence without creating an OpenAPI specification or implementation plan.
- Replaced the baseline's prior sequencing section with a planning boundary and updated the Pre-Code Gate.
- Created `docs/adr/ADR-001-*.md` through `ADR-025-*.md`.
- Created `docs/V4_REQUIREMENTS.md` with stable IDs, normative level, provenance, ADR/control traceability, planned verification, and status.
- Created `docs/V3_EXPORT_COMPATIBILITY.md` from Git history for schemas 1, 2, and 3.
- Revalidated the cost delta and amended the conservative Personal figure from approximately `$2.69` to `$2.70` per month.
- Preserved `docs/V4_ARCHITECTURE_AUDIT.md` as the historical first-audit record while correcting canonical filename references.

## C. ADR Reconstruction Result

**PASS.** Exactly 25 individual ADR files exist and the architecture §30 register links to each one. Each record contains Status, Context, Decision, Rationale, Consequences, Deferred/reconsideration triggers, and Amendments; ADR-002 is explicitly N/A/superseded by the DynamoDB selection.

The required amendments are present in both the relevant ADRs and current baseline:

- concurrency: ADR-001/011/015;
- shelf invariants: ADR-001/004/015;
- idempotency: ADR-005/011/018;
- OAuth binding: ADR-003/020;
- human AWS administration: ADR-007/009;
- asynchronous operations: ADR-005/011/015;
- V3/V4 and PWA isolation: ADR-006/007/024;
- lifecycle-worker authority: ADR-004/012;
- dashboard deferral: ADR-008 as amended by ADR-021.

The exact prose of the original architecture discussion is not recoverable. The ADRs therefore preserve only rationale supported by the approved baseline/adjudications and label amendment history; they do not claim verbatim historical reconstruction. This source limitation is disclosed and does not leave a current decision undefined.

## D. Requirements Registry Result

**PASS.** The canonical registry contains **172** current V4.0 requirements:

| Category | Count |
|---|---:|
| API | 16 |
| AUTH | 20 |
| AZ | 8 |
| COST | 5 |
| DATA | 18 |
| DOM | 7 |
| EDGE | 14 |
| GOV | 6 |
| ID | 4 |
| LIFE | 11 |
| MIG | 18 |
| OP | 12 |
| OPS | 14 |
| PRIV | 7 |
| PUB | 4 |
| TEST | 8 |
| **Total** | **172** |

Every row has a stable ID, normative statement/level, architecture or adjudication provenance, satisfying ADR/control where applicable, planned verification, and `PRE-CODE` implementation status.

- **Untraceable requirements:** none.
- **Current architecture/control without a corresponding implementation requirement:** none found.
- **Deferred items accidentally expressed as V4.0 requirements:** none; §3 of the registry separates the deferred register.
- **Completeness-review result:** pass. The review covered architecture §§1–35, ADR-001–025, A-01–A-07, TB-01–TB-10, T-01–T-25/C-01–C-25, the compatibility matrix, and adjudications F-01–F-14 plus lifecycle clarification.

This is a new maintainable implementation registry, not a recreation of the unavailable 196-row source.

## E. V3 Compatibility Result

**PASS.** The future V4 importer can migrate frozen V3.9 schema 3 without changing V3. The matrix is grounded in commits `feb914d` (schema 1), `bb47667` (schema 2), `3e49019` (schema 3/default marker), `e2fe9d3` (removal of shelf `bookIds`), and tag `v3.9.0`.

| Version | Status | Deterministic contract |
|---|---|---|
| 1 | Supported | Preserve a valid canonical `bookshelfId`; otherwise map the legacy Book `bookshelf` name uniquely or derive the default; ignore `bookIds`; normalize historical `Poetry`; reject ambiguity. |
| 2 | Supported | Preserve valid canonical `Book.bookshelfId`; ignore `bookIds`; derive/create the historical exact-name default; reject missing/stale relationships because no Book name fallback exists. |
| 3 | Mandatory supported | Preserve valid IDs, Book data, canonical relationships, and exactly one explicit `isDefault`; ignore early-v3 `bookIds`; reject corrupt default/reference state. |
| Other | Unsupported | Return `UNSUPPORTED_IMPORT_VERSION`. |

All versions share the evidenced five top-level properties. `activeBookshelfId` is validated only as input shape/UI state and is not migrated. IDs are preserved but never authorize. Dates/timestamps and legitimate optional omissions have explicit normalization; malformed or ambiguous data gets bounded actionable diagnostics and cannot activate.

**Remaining historical ambiguity:** none inside the supported contracts. Hand-edited/corrupt schema-1 cases are accepted only when the documented ID/name rule is unique; schema-2/3 missing canonical relationships reject. This deliberately avoids guessing from `bookIds` or metadata.

## F. Threat / Control Result

**PASS.** All named threats retain at least one concrete preventive, detective, or recovery control and corresponding implementation/verification requirement.

| Threat | Result | Principal evidence |
|---|---|---|
| T-01 authenticated user untrusted | PASS | C-12/C-25; AZ-001/002, API-005/006 |
| T-02 compromised session | PASS | C-02/C-15; AUTH-005–016, TEST-007 |
| T-03 hostile client | PASS | C-12/C-25; AZ-001/002, API-005–007 |
| T-04 XSS | PASS | C-05; API-007, EDGE-004/009 |
| T-05 CSRF | PASS | C-02/C-15; AUTH-005–010/014, EDGE-005 |
| T-06 BOLA/IDOR | PASS | C-01; AZ-001–003 |
| T-07 BFLA | PASS | C-10; AZ-004–007 |
| T-08 credential abuse | PASS | C-13; AUTH-001/002, PUB-002 |
| T-09 enumeration | PASS | C-19; AUTH-002/003, AZ-003 |
| T-10 malicious import | PASS | C-11; MIG-003/007–009/017 |
| T-11 exhaustion/cost amplification | PASS | C-06; API-006, OP-009–011, OPS-012, COST entries |
| T-12 supply chain | PASS | C-22; OPS-013 |
| T-13 CI/CD compromise | PASS | C-07; OPS-001–004 |
| T-14 AWS admin compromise | PASS | C-07/C-08/C-21; OPS-005–008, TEST-007 |
| T-15 cloud misconfiguration | PASS | C-04/C-20; EDGE-001–006/012/013, OPS-001 |
| T-16 corruption/data loss | PASS | C-03/C-16/C-17; DATA-002–015, LIFE-007–011, TEST-007 |
| T-17 accidental destruction | PASS | C-16; DOM-003/006/007, MIG-004, LIFE-004/005 |
| T-18 backup compromise | PASS | C-08; LIFE-008–011, OPS-007 |
| T-19 log leakage | PASS | C-14; API-008/009, OPS-009/010, PRIV-001/002 |
| T-20 secret exposure | PASS | C-09; AUTH-006/010, MIG-007, OPS-002/014, PRIV-002 |
| T-21 DNS/TLS misconfiguration | PASS | C-20; EDGE-001/005/012 |
| T-22 identity-provider failure | PASS | C-18; AUTH-003, LIFE-010 |
| T-23 export abuse | PASS | C-23; MIG-001/002/006–009, PRIV-004 |
| T-24 replay/duplicate writes | PASS | C-17; API-010–014, OP-002/004/005, TEST-007 |
| T-25 stale/incompatible client | PASS | C-24; DATA-004/005, EDGE-003/008–011 |

The previously deficient mappings are now concrete: T-16/C-03 uses revision/fencing/validation plus rollback/PITR/locked backups/drills; T-24/C-17 uses scoped fingerprinted idempotency and retry-safe operations; T-02/T-05 use bound one-time login transactions, server-held tokens, opaque sessions, CSRF header/origin controls, revocation and fresh auth; T-14/C-21 uses break-glass root, MFA, no root keys, temporary roles, separated recovery authority, CloudTrail and review.

No new threat is required by the amended diagrams. TB-09 and TB-10 expose already-known authentication, secret, import, export, and misconfiguration threats and now have explicit controls.

## G. Cost Revalidation

**PASS; no material posture change.** Current official pricing confirms ordinary Lambda charges by request and GB-second, asynchronous events consume request units, DynamoDB On-Demand charges by consumed request units (with transactional writes consuming twice the write units), and SQS has no minimum fee. Lambda asynchronous delivery can duplicate and retry events, justifying the already-required idempotency and failure destination.

The Personal delta model assumes 100 asynchronous operations/month, 512 MB, average five billed seconds: 250 GB-seconds × `$0.0000166667` ≈ `$0.00417`, plus 100 async request units × `$0.20/million` ≈ `$0.00002`, without free-tier credit. Auth transaction/idempotency/Operation traffic fits the existing 250,000-RRU/100,000-WRU/50-MB DynamoDB headroom. A failure-only SQS queue is negligible within the rounded allowance. The conservative architecture total is amended from approximately **`$2.69` to `$2.70/month`**.

Evidence: [AWS Lambda pricing](https://aws.amazon.com/lambda/pricing/), [DynamoDB pricing](https://aws.amazon.com/dynamodb/pricing/), [SQS pricing](https://aws.amazon.com/sqs/pricing/), [Lambda asynchronous error/retry behavior](https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-error-handling.html), and [Lambda asynchronous destinations](https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-retain-records.html).

The dashboard remains deferred. The ~20-user scenario remains behind actual-cost review.

## H. Pre-Code Gate Checklist

| Gate item | Result | Repository evidence |
|---|---|---|
| Architecture discovery through ADR-025 | PASS | Architecture baseline and §30 register |
| Current baseline complete | PASS | `V4_ARCHITECTURE.md` §§1–35; no unresolved contradiction found |
| ADR-001–025 reconstructed/independently reviewed | PASS | 25 linked files; §C of this audit |
| Canonical requirements registry complete/reviewed | PASS | 172 entries; §D of this audit |
| Runtime and TB-01–TB-10 represented | PASS | Architecture §§5–6 |
| Assets, T-01–T-25, controls and traceability complete | PASS | Architecture §§7–8, 29.1; §F of this audit |
| Generation/revision/fence/coherent-read protocol complete | PASS | Architecture §§11.3–11.5; ADR-001/011/015; DATA-002–015 |
| Identity/session/authorization boundaries complete | PASS | Architecture §§9–10; AUTH/AZ registry entries |
| OAuth login-transaction contract complete | PASS | Architecture §9.3/TB-09; ADR-003/020; AUTH-005–010 |
| Sync/async API boundaries represented | PASS | Architecture §§13.7–13.9; ADR-005/011/015; API/OP entries |
| V3 compatibility matrix implementation-ready | PASS | `V3_EXPORT_COMPATIBILITY.md`; §E of this audit |
| V3/V4 deployment/origin/service-worker isolation represented | PASS | Architecture §16.7; ADR-006/007/024; EDGE-007–010 |
| Human AWS administration/deployment authority represented | PASS | Architecture §21.9; ADR-007/009; OPS-002–008 |
| Backup/recovery architecture complete | PASS | Architecture §20; ADR-009; LIFE-007–011 |
| Cost remains within Personal posture | PASS | Architecture §23; ADR-021; §G of this audit |
| Deferred decisions remain outside V4.0 | PASS | Architecture §31; registry §3 |
| Initial OpenAPI surface derivable/workflows representable | PASS | Architecture §13.9; workflow review below |
| Independent contradiction/completeness review performed | PASS | This audit §§A–G |
| Implementation work packages deferred pending authorization | PASS | Architecture §32; no `V4_IMPLEMENTATION_PLAN.md` exists |
| Explicit human approval to clear gate | NEEDS HUMAN ADJUDICATION | Intentionally outstanding; architecture §33.2 |

Workflow representability cross-check:

| Workflow | Result | Architecture mechanism |
|---|---|---|
| Initial library load | PASS | Owned synchronous `GET /library`; double-CONTROL coherent read |
| Book create/read/update/delete | PASS | Owned synchronous resources; create idempotency; generation/entity preconditions |
| Move Book between shelves | PASS | Ordinary atomic mutation preserving target/default/name invariants |
| Bookshelf create/rename | PASS | Idempotent create; synchronous invariant-checked rename |
| Small Bookshelf delete | PASS | One in-place transactional reassign/remove mutation |
| Oversized Bookshelf delete | PASS | Owned async Operation + writer-fenced generation rebuild |
| Import | PASS | Presigned upload + owned idempotent async Operation + validate/stage/activate |
| Export | PASS | Owned async Operation + coherent double-CONTROL read + presigned download |
| Migration | PASS | Owned idempotent async Operation + fenced source-bound activation |
| Invitations | PASS | ADMIN-authorized, verified-email-conditioned, idempotent command |
| Account disable/delete | PASS | Immediate status/session change plus versioned scheduled lifecycle worker |
| Operation status | PASS | Owner-scoped `GET /operations/{operationId}` |
| Stale revision/generation | PASS | Stable 409 conflict from compound preconditions/fence |
| Idempotent create/retry | PASS | Fingerprinted owner/type/key record returns original server-generated result |

There is no requirement for WAF, dashboard, VPC, Step Functions, primary SQS dispatcher, search GSI, offline sync, or other deferred capability to represent these workflows.

## I. Recommended Next Step

Request the one remaining action: **explicit human approval to mark the V4 Pre-Code Gate CLEARED**.

Do not create `V4_IMPLEMENTATION_PLAN.md` or begin production implementation until that approval is given. After approval, implementation planning still requires separate authorization under the stated authority hierarchy.
