# ShelfState V4 Architecture Audit and Pre-Code Gate Review

> **Historical first-audit record.** Its findings were human-adjudicated on 2026-09-14 and incorporated into the canonical artifacts. Current readiness is evaluated in [`V4_ARCHITECTURE_AUDIT_2.md`](V4_ARCHITECTURE_AUDIT_2.md); the gate status below is not current.

**Audit date:** 2026-09-14\
**Audited revision:** `14d2025a94f1027d8dcaf03a1f214b7f69dde595`\
**Architecture authority reviewed:** `docs/V4_ARCHITECTURE.md`
**Scope:** Repository-grounded architecture audit only; no V4 production implementation and no V3 behavior changes

## A. Executive Result

**NOT READY — HUMAN ARCHITECTURAL ADJUDICATION REQUIRED**

The approved direction is broadly compatible with ShelfState V3.9: the current model uses `Book.bookshelfId` as the sole membership relationship, Bookshelves do not carry `bookIds`, current identifiers are UUIDs, client-side search/Insights fit a bounded whole-library read, and the existing PWA provides useful evidence for controlled service-worker updates.

The Pre-Code Gate is nevertheless not clear. There are four decisive issues:

1. The required original 196-item requirements ledger is not present in the repository or its reachable Git history, so the baseline cannot be reconciled against it.
2. The approved ADR source records are also absent; only their one-line summaries are present in the baseline. The gate's requested independent review "against the approved ADR record" cannot be completed from repository evidence.
3. The generation model does not define a concurrency fence shared by ordinary CRUD, generation activation, and long-running reads. As written, an ordinary write can succeed against a generation that has just become inactive, a staged replacement can overwrite intervening writes, and a multi-page export cannot guarantee the coherent snapshot promised by §18.2.
4. Several security and API controls are named but not sufficiently specified to demonstrate coverage: replay-safe creates, OAuth login transaction binding, human AWS-administrator hardening, and execution of potentially longer-than-30-second generation workflows.

No production code, AWS resources, or V3 application behavior were changed during this audit. The implementation plan was not created.

## B. Material Findings

### F-01 — Original requirements ledger is unavailable

- **Severity:** `BLOCKER`
- **Architecture / ADR:** §1.1, §29, §33.1 requirement-ledger gate item
- **Repository evidence:** A recursive repository search, including hidden files but excluding `.git`, found only `docs/V4_ARCHITECTURE.md` as a V4/requirements/architecture artifact. `git log --all --name-only` shows no prior requirements ledger, research note, threat-model document, planning export, or chat export. The baseline itself recorded the absence at the cited lines before the 2026-09-14 amendments.
- **Why it matters:** The baseline explicitly makes line-by-line reconciliation a mandatory condition of Pre-Code clearance. Completeness cannot be inferred from the consolidated themes.
- **Recommended next action:** Recover the authoritative 196-row ledger from the source conversation/export or formally amend the baseline/ADR process to state what evidence replaces it. Do not mark the gate clear merely because the current baseline appears comprehensive.

### F-02 — Generation activation is not fenced against ordinary mutations or multi-page reads

- **Severity:** `BLOCKER`
- **Architecture / ADR:** ADR-001, ADR-011, ADR-015; §4 principles 7-8, §§11.3-11.5 and 18.2-18.5
- **Repository evidence:** The pre-amendment baseline defined `CONTROL.activeGeneration`, generation-prefixed entity keys, in-place entity revisions, and a conditional generation switch (`docs/V4_ARCHITECTURE.md`, prior §11). It did not define a user/library-wide revision, mutation epoch, operation lock, or a requirement that every ordinary mutation transaction condition-check the current `CONTROL` state. The current application contains both ordinary entity changes (`src/app/script.js:89-109`, `:355-359`, `:429-441`) and structural changes that touch multiple records (`src/app/script.js:379-395`).
- **Why it matters:** Three concrete races remain:
  - A handler can read `CONTROL=G8`, then an import can activate `G9`, then the handler can successfully update `GEN#G8#BOOK#...`; the API reports success but the active library never reflects the change.
  - A replace/merge can stage from `G8` while CRUD continues in `G8`; checking only that `activeGeneration` is still `G8` does not detect intervening entity writes, so activation can silently discard them.
  - A strongly consistent DynamoDB `Query` is read-committed, not a multi-item snapshot. Ordinary in-place writes during paginated library load/export can produce a mixed-time result even when the generation does not change. That conflicts with the coherent-export promise in §18.2.
  - After a generation switch, an entity's integer revision alone is not a safe stale-client token if the same ID/revision can exist in the new generation. The expected generation must participate in concurrency validation or the concurrency token must otherwise change across activation.
- **Recommended next action:** Return this to ADR-001/011/015 adjudication. Define one explicit concurrency protocol that covers ordinary writes, generation staging/activation, stale clients, library reads, and exports. A possible class of solution is a `CONTROL`-level mutation epoch/revision updated and checked transactionally, but selecting the protocol is an architecture decision and is not made by this audit.

### F-03 — The approved ADR record is not independently reviewable

- **Severity:** `BLOCKER`
- **Architecture / ADR:** §1 authority hierarchy; §30; §33.1 independent ADR review item
- **Repository evidence:** At audit time the repository contained only the summary register in `docs/V4_ARCHITECTURE.md` §30, but no ADR files or other artifact preserving ADR-001 through ADR-025 rationale/assumptions. Git history showed the architecture baseline was added in one commit (`14d2025`) and no earlier ADR paths existed.
- **Why it matters:** Internal consistency of the consolidated document can be reviewed, but the gate requires comparison to the approved ADR record. One-line summaries are not enough to detect rationale, assumption, or amendment loss during consolidation.
- **Recommended next action:** Add or provide the authoritative ADR records, or obtain explicit human confirmation that §30 is the complete approved record and amend the gate language accordingly. Then repeat the independent comparison.

### F-04 — The V3 compatibility contract does not describe the actual V3 export precisely enough

- **Severity:** `MAJOR`
- **Architecture / ADR:** ADR-011, ADR-015, ADR-025; §§12 and 18
- **Repository evidence:** The current exporter emits exactly five top-level members: `schemaVersion`, `exportedAt`, `books`, `bookshelves`, and `activeBookshelfId` (`src/persistence/storage.js:99-112`). The current schema version is `3` (`src/config.js:7`). Current Books contain the fields in `src/domain/models.js:5-36`; current Bookshelves contain `id`, `name`, and `isDefault` (`src/domain/models.js:52-57`). The current application has no import implementation. Git history also contains export versions 1 and 2: version 1 included legacy `Book.bookshelf` and shelf `bookIds` (commit `feb914d`), version 2 removed `Book.bookshelf` but retained shelf `bookIds` (commit `bb47667`), and version 3 introduced `isDefault` (commit `3e49019`; obsolete shelf `bookIds` was removed by `e2fe9d3`).
- **Why it matters:** The baseline says V4 "detects supported V3 format" but does not say whether support means only frozen V3.9 schema 3 or also previously downloadable V3 schema 1/2 backups. It also does not decide whether `activeBookshelfId` is imported, ignored as device UI state, or preserved as account preference. Identifier syntax and conversion rules are likewise unspecified.
- **Recommended next action:** Before OpenAPI/work-package design, approve a compatibility matrix for schema versions 1, 2, and 3. At minimum, document the exact schema-3 contract, treatment of `activeBookshelfId`, legacy relationship conversion, accepted identifier forms, and the result for unsupported versions.

### F-05 — Real V3 values are less constrained than the planned V4 import validator

- **Severity:** `MAJOR`
- **Architecture / ADR:** ADR-011, ADR-019, ADR-025; §§2.2, 12, 15, 18.3, 18.7
- **Repository evidence:** V3 validation only requires trimmed title/author, positive pages, nonempty status, and `0 <= progress <= pages` (`src/domain/validation.js:1-22`). It does not validate types before calling `.trim()`, enforce status/classification enums, validate dates/ISBN/IDs, cap text or collection sizes, require integral page counts, detect duplicate IDs, or validate timestamp shapes. Persistence accepts any parsed arrays (`src/persistence/storage.js:63-89`), and export checks only that Books and Bookshelves are arrays (`src/persistence/storage.js:99-112`). Hydrated `createdAt`/`updatedAt` values remain JSON strings, while new or edited values begin as `Date` objects and serialize to ISO strings (`src/domain/models.js:19-20`, `:35-36`, `:48`). Historical/hand-edited local storage can therefore run or export values that strict V4 validation may reject.
- **Why it matters:** "Fully validate" cannot simultaneously mean "apply new V4 constraints without migration rules" and "complete V3 migration." Valid user-visible V3 state may contain missing optional fields, empty date strings, legacy relationships, duplicate IDs, stale relationships, unknown enum values, or values above new V4 limits.
- **Recommended next action:** Produce a repository-derived V3 import normalization/rejection table. Human owners must decide which legacy deviations are repaired, which are rejected with actionable diagnostics, and which V4 bounds are set high enough to accept legitimate V3 exports. Preserve valid V3 IDs; never infer authority from them.

### F-06 — Default-shelf invariants and shelf-name uniqueness are not fully stated for the server

- **Severity:** `MAJOR`
- **Architecture / ADR:** ADR-001, ADR-004, ADR-019; §§2.2, 11, 15
- **Repository evidence:** V3 ensures one explicit default on startup and repairs multiple/default-by-name legacy states (`src/persistence/migrations.js:9-49`; tests at `test/persistence/migrations.test.js:16-69`). The UI prevents deleting or renaming the default (`src/app/script.js:313-343`, `:397-427`). Shelf names are trimmed and duplicate names are rejected case-insensitively (`src/domain/bookshelves.js:30-46`, `:85-99`). Deleting an ordinary shelf reassigns every affected Book to the default before removing the shelf (`src/domain/bookshelves.js:48-70`), and the orchestrator then persists Books and Bookshelves (`src/app/script.js:379-395`). The pre-amendment baseline said only that default behavior remained a domain concern (`docs/V4_ARCHITECTURE.md`, prior §§2/11) and forbade `bookIds` mirrors.
- **Why it matters:** A V4 server must define and enforce exactly-one-default, default deletion/rename behavior, case-insensitive name uniqueness under concurrent requests, and atomic shelf deletion/reassignment. Shelf deletion can exceed DynamoDB's 100-item/4-MB transaction limit and is therefore a generation workflow, not ordinary CRUD, for a large shelf. A read-then-write uniqueness check is also racy unless protected by the library concurrency protocol or a uniqueness reservation item.
- **Recommended next action:** Record the server-authoritative Bookshelf invariants and classify delete-with-reassignment as a conditional transaction below a proven bound or a generation workflow above it. Decide the concurrency mechanism for name uniqueness without restoring `bookshelf.bookIds`.

### F-07 — Replay safety is explicit for import, but not for ordinary creates and commands

- **Severity:** `MAJOR`
- **Architecture / ADR:** ADR-011, ADR-015, ADR-025; T-24/C-17; §§12, 18.5, 29.1
- **Repository evidence:** In the pre-amendment baseline import alone received an explicit server-recognized idempotency key (`docs/V4_ARCHITECTURE.md`, prior §18.5). New V4 Book and Bookshelf IDs were backend-generated UUID v4, so a retried create request could not naturally address the same resource. T-24 mapped to C-17, but the prior API sections did not define generalized replay behavior.
- **Why it matters:** A timeout after a successful POST followed by a retry can create two resources with two server-generated IDs. Conditional writes on the generated ID do not prevent that. DynamoDB transaction client tokens provide only a short service-level idempotency window and do not by themselves define the durable API contract.
- **Recommended next action:** Decide which non-idempotent API operations require application-level idempotency keys/operation records and their retention/conflict semantics. Include this in the API contract derivation and C-17 evidence.

### F-08 — OAuth login transaction binding is omitted from the concrete controls

- **Severity:** `MAJOR`
- **Architecture / ADR:** ADR-003, ADR-020; T-02/T-05/T-24 and C-02/C-15/C-17; §9
- **Repository evidence:** The pre-amendment baseline selected Authorization Code + PKCE and backend callback/exchange (`docs/V4_ARCHITECTURE.md`, prior §9), but did not specify generation, storage, expiry, single use, or complete callback validation for state/PKCE/nonce/redirect/browser binding.
- **Why it matters:** API anti-CSRF headers do not protect the pre-authentication redirect/callback flow. The BFF must bind the returned authorization response to the browser-initiated login transaction and prevent callback replay/account confusion before creating a session.
- **Recommended next action:** Amend ADR-003/020 or the baseline with a minimal login-transaction state contract and threat mapping. This can remain within the chosen Cognito/BFF architecture; no identity-provider redesign is required.

### F-09 — C-21 names human AWS-administrator hardening without defining it

- **Severity:** `MAJOR`
- **Architecture / ADR:** ADR-007/009; T-14/C-21; §§20.3, 21, 29.1
- **Repository evidence:** The pre-amendment baseline tightly constrained GitHub deployment credentials and recovery/admin roles (`docs/V4_ARCHITECTURE.md`, prior §§20–21), but did not define human AWS login, root keys/MFA, temporary-role use, or periodic access review.
- **Why it matters:** T-14 is P1 and the same AWS account may contain both production and non-production. A named control without enforceable requirements is not sufficient coverage for the Pre-Code Gate.
- **Recommended next action:** Define the minimum human-access baseline: protected/root break-glass posture, MFA, no root access keys, temporary role/federated access for routine administration, recovery-role assumption and logging, and periodic credential/access review. Select only services appropriate to the one-person cost model.

### F-10 — Large-operation execution does not yet fit a proven HTTP API workflow

- **Severity:** `MAJOR`
- **Architecture / ADR:** ADR-005, ADR-011, ADR-015, ADR-019; §§13, 15, 18, 32 increment 6
- **Repository evidence:** The pre-amendment runtime diagram contained request-driven Lambdas but no asynchronous worker (`docs/V4_ARCHITECTURE.md`, prior §5). Imports required complete validation, bounded writes, verification, and activation while maximum application limits were not yet fixed.
- **Why it matters:** It is not yet demonstrable that the largest supported V3 export or generation rebuild completes safely within a synchronous request. The wording that retries "resume/return the same logical operation" suggests persisted operation state, but its lifecycle/status API and execution mechanism are absent. Adding Step Functions, SQS, or another worker later would affect runtime architecture, IAM, threat mapping, tests, and cost.
- **Recommended next action:** During architecture adjudication/OpenAPI derivation, choose either (a) a measured, explicitly bounded synchronous workflow proven below the timeout with margin or (b) an explicit asynchronous operation resource and execution component. Revalidate the cost model if a new service or scheduled poller is selected.

### F-11 — V3/V4 deployment and service-worker isolation needs an explicit implementation boundary

- **Severity:** `MAJOR`
- **Architecture / ADR:** ADR-006, ADR-007, ADR-024; §§2.1, 16, 21, 32 increment 1
- **Repository evidence:** V3.9 is deployed from this repository's root and its root-scoped service worker precaches the entire application shell (`service-worker.js:11-15`, `:71-94`; `src/pwa/register-service-worker.js:1-6`). The checked-in shell uses unversioned source URLs tied together by a release digest (`src/pwa/precache-manifest.js:1-3`) and Netlify-specific index canonicalization (`src/pwa/service-worker-policy.js:1-73`). The repository has no V4 workspace/deployment configuration yet. The current `main` is one commit ahead of the V3.9 production tag and remote branch only because the architecture document was added.
- **Why it matters:** Adding V4 into the existing root or reusing the existing V3 origin/service-worker scope could couple V4 changes to Netlify deploys or allow an installed V3 worker to control a V4 shell. That would contradict the required operational separation. This does not require a separate repository, but it does require an explicit boundary.
- **Recommended next action:** Before implementation planning is approved, decide and document repository/package boundaries, Netlify ignore/publish behavior, V4 deployment roots, and distinct production host/origin/service-worker transition assumptions. Do not copy the Netlify canonicalization policy into AWS V4.

### F-12 — The authority filename differs by case from the requested canonical path

- **Severity:** `MINOR`
- **Architecture / ADR:** §1 authority naming / repository portability
- **Repository evidence:** Git then tracked `docs/V4_Architecture.md`; the approved audit brief named `docs/V4_ARCHITECTURE.md`. Windows resolves these as the same local path, but Git hosting and Linux tooling are case-sensitive.
- **Why it matters:** Automation, links, and future gate scripts can disagree about the authoritative artifact.
- **Recommended next action:** After confirming the intended canonical spelling, perform a case-only Git rename and update references. This audit does not rename the approved baseline.

### F-13 — Current PWA behavior is useful evidence but must not be treated as the V4 policy verbatim

- **Severity:** `NOTE`
- **Architecture / ADR:** ADR-006, ADR-024; §16
- **Repository evidence:** V3 installs a root module worker with `updateViaCache: "none"` (`src/pwa/register-service-worker.js:1-18`), fills a release-specific cache only after every resource passes status/origin/media-type/digest checks (`service-worker.js:24-43`), retains the old active worker until normal lifecycle turnover (no `skipWaiting`), deletes only obsolete ShelfState caches on activation (`service-worker.js:46-77`), and bypasses non-precached/API requests (`src/pwa/service-worker-policy.js:94-112`). It also cache-serves `/index.html` and the manifest as release-bound resources and has Netlify-only response canonicalization.
- **Why it matters:** The lifecycle supports the baseline's no-forced-reload and rolling-client goals. However, V4's hashed assets, revalidated mutable shell/manifest, API/auth network-only behavior, and AWS response behavior need a new policy. CloudFront revalidation alone does not update a page currently served from a service-worker cache.
- **Recommended next action:** Carry forward the tested lifecycle lessons and exact API/auth bypass invariant, not the Netlify transformation logic or the current unversioned resource inventory.

### F-14 — Runtime and trust-boundary diagrams omit direct browser flows

- **Severity:** `MAJOR`
- **Architecture / ADR:** ADR-003, ADR-006, ADR-011, ADR-020; §§5-6, 9.1, 17.3, 18.6
- **Repository evidence:** The pre-amendment runtime/trust diagrams (`docs/V4_ARCHITECTURE.md`, prior §§5–6) omitted the browser/Cognito and browser/presigned-S3 edges even though prose required both flows.
- **Why it matters:** These are real cross-origin, public-network trust crossings. They determine OAuth transaction binding, redirect allowlists, CSP/navigation policy, S3 CORS, allowed methods/content types, upload-size enforcement, URL leakage, transfer error handling, and whether cookies or other credentials can be exposed. Calling the application "one origin" is correct only for the ordinary static/API path, not the complete authentication and transfer path.
- **Recommended next action:** Have the architecture owner explicitly map both flows to existing trust boundaries or add boundary identifiers, then update the runtime/trust diagrams and associated T-02/T-05/T-10/T-11/T-23 controls. This audit does not choose the boundary numbering.

## C. Existing Repository Compatibility

### Domain model

**Compatibility: compatible in shape, incomplete as a V4 server contract.**

- `Book.bookshelfId` is canonical in current runtime membership queries and moves (`src/domain/bookshelves.js:79-83`, `:101-103`).
- `Bookshelf` has no `bookIds`; the constructor deliberately discards legacy membership state (`src/domain/models.js:52-57`; `test/domain/models.test.js:70-97`).
- Book fields match the representative baseline list (`src/domain/models.js:5-36`).
- New V3 Books and Bookshelves use `crypto.randomUUID()`, which is compatible with preserving V3 identifiers while generating new V4 IDs server-side.
- V3's effective Bookshelf rules are stronger and more specific than the baseline currently records: explicit default role, one repaired default, default protected in the UI, trimmed/case-insensitive unique names, and delete-with-reassignment.
- V3 has no entity revision. V4 must add server metadata without treating any imported client field as trusted revision/authority.

### Persistence and export model

**Compatibility: exportable, but migration rules are not ready.**

The actual frozen V3.9 export is:

```json
{
  "schemaVersion": 3,
  "exportedAt": "<ISO instant>",
  "books": [
    {
      "id": "<UUID>",
      "title": "...",
      "author": "...",
      "pages": 1,
      "progress": 0,
      "startDate": "",
      "endDate": "",
      "isbn": "",
      "notes": "",
      "classification": "fiction",
      "category": "",
      "status": "not-started",
      "bookshelfId": "<shelf UUID>",
      "createdAt": "<ISO instant>",
      "updatedAt": "<ISO instant>"
    }
  ],
  "bookshelves": [
    {
      "id": "<UUID>",
      "name": "My Library",
      "isDefault": true
    }
  ],
  "activeBookshelfId": "<shelf UUID>"
}
```

Properties whose in-memory value is `undefined` are omitted by JSON serialization, so older records can have fewer Book members. V3 does not import this file; it only exports. The V4 compatibility importer can preserve schema-3 IDs and `bookshelfId` relationships, but only after the missing validation/normalization decisions in F-04/F-05 are made.

### PWA behavior

**Compatibility: architectural lessons are sound; implementation is intentionally not reusable as-is.**

- V3's worker update path avoids HTTP cache reuse for the worker, uses release-specific caches, and does not force activation.
- Exact precache membership and digest verification make a V3 release internally coherent.
- `/api/*` will naturally bypass the current exact-path precache policy, but V4 should make API/auth/transfer bypass an explicit invariant and test it.
- V3's `index.html` integrity exception and `_headers` file are Netlify-specific and must remain V3-only.
- V4's separate hashed build and mutable-entry caching policy is technically compatible with the lifecycle lessons, provided origin/scope separation is resolved.

### Application orchestration

**Compatibility: ordinary behavior maps cleanly; several workflows need explicit server contracts.**

| Current behavior | V4 API capability | Special requirement |
|---|---|---|
| Initial load of Books + Bookshelves | Coherent owner-scoped library read, potentially paginated | Bind pages to one generation/concurrency view |
| Create/edit/delete Book | Resource CRUD | Revision + active-generation condition; create replay safety |
| Drag Book to shelf | Book relationship update | Validate target shelf in the same owner/generation |
| Create/rename Bookshelf | Resource CRUD | Atomic case-insensitive uniqueness and default rules |
| Delete ordinary Bookshelf | Dedicated structural command/workflow | Atomically reassign all affected Books, delete shelf, handle large sets with a generation |
| Export | Dedicated operation | Coherent snapshot, owner binding, temporary transfer, replay behavior |
| Import replace/merge | Dedicated operation | Validation, conflict strategy, staging/activation, status/idempotency |
| Active bookshelf selection | UI preference decision | Decide device-local vs cloud/account state and migration behavior |

No current library behavior requires GraphQL, a relational datastore, a GSI, server-side search, offline sync, or a deferred analytics system.

### Tests

**Compatibility: strong V3 behavior evidence, not V4 infrastructure evidence.**

- `node --test` passes **127/127** tests at the audited revision.
- Tests explicitly cover canonical bookshelf IDs, removal of `bookIds`, default migration, relationship repair, export schema 3, safe text rendering, service-worker cache ownership, release-digest correctness, and exact Netlify transformation handling.
- The tests are local unit/presentation/service-worker tests. They do not supply evidence for DynamoDB transactions, Cognito, API Gateway, IAM, CloudFront/S3, presigned transfers, or browser end-to-end V4 flows; §27 correctly requires those later.
- `npm test` could not be launched on this audit host because its global npm shim points to a missing `npm-cli.js`; the equivalent declared command `node --test` ran successfully. This is a host-tooling issue, not a repository test failure.

## D. Requirements Recovery Result

**The original detailed 196-requirement set was not found.**

Search scope included:

- every current repository file, including hidden files outside `.git`;
- filenames and contents for requirement, V4, research, planning, architecture, ADR, threat, security, cloud, migration, TODO, and related terms;
- every path present in reachable Git history across all branches/remotes;
- content history for V4/ADR/requirements terms.

The only recovered architecture/requirements artifact at audit time was `docs/V4_ARCHITECTURE.md`. Its then-current §29 table was a category-level consolidation and expressly disclaimed being the 196-row ledger. No substantially complete equivalent was found, so no line-by-line traceability comparison was possible and no missing requirements were manufactured in that audit.

The repository also lacks the individual ADR-001 through ADR-025 records. This is separately material because the gate asks for comparison with the approved ADR record, not merely the register summaries.

## E. ADR Consistency Result

The summaries and baseline sections are mostly directionally consistent. ADR-002 is intentionally N/A and is not treated as missing.

| ADR relationship | Result |
|---|---|
| ADR-001 / 011 / 015 generation, import, migration | **Conflict/ambiguity requiring adjudication.** The baseline promises no silent overwrite and coherent export but lacks a concurrency fence that can make those promises true under ordinary in-place writes. See F-02. |
| ADR-003 / 020 identity and session security | **Incomplete control specification.** The selected BFF/PKCE model is compatible, but login transaction state/nonce/verifier/replay handling is not documented. See F-08. |
| ADR-004 / 012 ownership and account lifecycle | **Compatible with clarification.** ADMIN has no library-browse right, while the Lifecycle Lambda must have a narrowly scoped, auditable ability to delete a target user's item collection after authoritative state checks. This is an exceptional service capability, not ADMIN ownership. State it explicitly to prevent accidental cross-user read authority. |
| ADR-006 / 024 PWA edge and compatibility | **Compatible if V3/V4 origins/scopes remain separate.** Reusing the V3 root scope without a transition plan would invalidate that assumption. See F-11/F-13. |
| ADR-011 / 025 imports and identifiers | **Compatible but underspecified.** V3 UUIDs can be preserved; accepted legacy schemas/ID syntax and revision assignment remain undefined. |
| ADR-003 / 006 / 011 browser paths | **Diagram/prose inconsistency.** Cognito redirects and presigned S3 transfers cross origins but are absent from the runtime and trust-boundary diagrams. See F-14. |
| ADR-008 / 021 observability and cost | **Consistent.** The custom dashboard is deferred until after a full billing cycle; the baseline cost includes a conservative allowance for logs/alarms. |
| ADR-009 / 022 backups, deletion, retention | **Consistent.** Active data deletion and backup expiry are distinguished; the privacy notice must disclose retained recovery copies. |
| ADR-006 / 023 WAF and public signup | **Consistent.** WAF is deferred for invite-only launch and explicitly reconsidered or consciously waived before public signup. |
| ADR-016 formal SBOM | **Consistent.** Dependency controls are required; formal SBOM generation remains deferred. |
| ADR-017 OpenAPI/testing | **Not contradicted, not yet satisfied.** The contract derivation and real-AWS evidence are future gate/work-package work. |

Because the full ADR texts are absent, this result covers only the consolidated baseline and register summaries. It cannot certify that no approved rationale or assumption was lost.

## F. Threat / Control Coverage Result

No new threat identifiers are necessary. The uncovered risks fit the existing threat catalog, but four existing mappings are not yet backed by a sufficient architectural control:

| Existing threat/control | Coverage result | Gap |
|---|---|---|
| T-16 / C-03 data integrity and recovery | **Not sufficient** | Recovery exists, but F-02 allows acknowledged writes to disappear at generation activation and permits non-coherent exports. Prevention/concurrency correctness is required in addition to recovery. |
| T-24 / C-17 replay/duplicate writes | **Not sufficient** | Import is idempotent; ordinary server-ID create operations and other commands have no replay contract. See F-07. |
| T-02, T-05 / C-02, C-15 session compromise/CSRF | **Not sufficient for login boundary** | Established-session CSRF is specified; OAuth initiation/callback binding and replay protection are not. See F-08. |
| T-14 / C-21 AWS administrator compromise | **Not sufficient** | C-21 is named but human/root authentication and credential requirements are not defined. See F-09. |

Additional repository-specific observations:

- Existing user-authored Book/Shelf content is rendered with `textContent` in the main library surfaces (`src/ui/book-spine-view.js:28-66`, `src/ui/bookshelf-selector-view.js:80-99`). The Insights template uses `innerHTML`, but interpolated values there are derived status constants/counts; category, shelf, and classification labels are appended through `textContent` (`src/ui/insights-view.js:7-102`). The baseline's plain-text rendering control is compatible with current behavior.
- Existing localStorage data and drag/drop IDs are fully client-controlled. V4 must treat every field, relationship, ID, status, and active selection as untrusted; the approved owner-scoped server resolution correctly addresses this boundary once implemented.
- The V4 service worker must never cache authenticated API/auth callback responses. Current exact precache classification provides a useful test pattern but is not itself a V4 control.
- The controls for malicious import, resource exhaustion, and export abuse are directionally present, but the direct Browser/S3 and Browser/Cognito crossings must be made explicit before their coverage can be verified end to end. See F-14.

## G. Pre-Code Gate Checklist

The classifications below independently evaluate every item in §33.1; they do not merely repeat its checkboxes.

| # | Gate item | Result | Evidence / reason |
|---:|---|---|---|
| 1 | Architecture discovery completed through ADR-025 | `PASS` | The approved baseline and complete 001-025 summary register exist. The separate inability to compare full ADR rationale is item 13. |
| 2 | Consolidated runtime architecture documented | `PASS` | §5 documents the browser, edge, API, compute, identity, persistence, operations, and backup components. |
| 3 | Trust boundaries, assets, threats, and controls documented | `NEEDS HUMAN ADJUDICATION` | TB-01–TB-08, A-01–A-07, T-01–T-25, and C-01–C-25 are enumerated, but the Browser/Cognito and Browser/presigned-S3 crossings are absent from the diagrams and do not clearly map to an existing boundary. See F-14. |
| 4 | Datastore and key/generation model sufficiently documented for planning | `NEEDS HUMAN ADJUDICATION` | F-02 shows unresolved correctness races and stale-token semantics; F-06 adds cross-record/default uniqueness requirements. |
| 5 | Identity/session/authorization boundaries documented | `NEEDS HUMAN ADJUDICATION` | Core ownership and identity boundaries are clear, but F-08 and F-09 leave two P1/P2 boundary controls non-operational. |
| 6 | API/backend and frontend/edge boundaries documented | `PASS` | §§13 and 16 define the broad boundaries, single origin, cache behavior, and API style. Route/workflow representability is separately blocked at item 15. |
| 7 | Dev/prod and deployment-authority model documented | `PASS` | §§21.2-21.5 separate resources and constrain CI/CD/production release authority. Human AWS access hardening remains a threat-coverage gap, not an absence of the deployment model. |
| 8 | Backup/recovery architecture documented | `PASS` | §20 defines PITR, scheduled backup, vault isolation, Cognito reconstruction, targets, drill, and runbook. |
| 9 | Cost model approved for Personal launch | `PASS` | §23 has an approved ~$2.69 model. Current official pricing/capability checks do not reveal a fixed-cost contradiction; see cost review below. |
| 10 | Deferred decisions separated from V4.0 requirements | `PASS` | §31 clearly separates deferred features. Current V3 behavior does not require a GSI/search service, offline sync, WAF, dashboard, tracing, formal SBOM, federation, SES, or multi-region operation for V4.0. |
| 11 | Implementation sequencing established | `PASS` | §32 supplies dependency-aware architectural increments, while correctly disclaiming a final task breakdown. |
| 12 | Recover/reconcile original 196-item ledger | `BLOCKED` | The source ledger/equivalent is not in the repository or history. See F-01 and §D. |
| 13 | Independent contradiction/completeness review against ADR record | `BLOCKED` | This audit reviewed the consolidated baseline, but the approved ADR source records are absent. See F-03 and §E. |
| 14 | Confirm no material requirement/threat lacks a control | `BLOCKED` | Requirements cannot be confirmed without the ledger; T-16, T-24, T-02/T-05 login flow, and T-14 have material control gaps. See §F. |
| 15 | Derive initial OpenAPI sufficiently to prove workflows | `BLOCKED` | No OpenAPI artifact exists. Ordinary CRUD is representable, but generation fencing, shelf deletion, idempotent creates, active-shelf state, and sync-vs-async generation operations must be resolved first. |
| 16 | Produce implementation work packages with acceptance criteria/dependencies | `BLOCKED` | Not yet produced and explicitly outside this audit without separate approval. F-02/F-04/F-06-F-11 must inform them. |
| 17 | Revalidate current AWS constraints/pricing | `PASS` | Revalidated on 2026-09-14 against current official sources summarized below. No baseline service selection was found technically unavailable. |
| 18 | Explicit human approval to clear gate | `BLOCKED` | No such approval has been given, and the substantive blockers above prevent a responsible request for clearance. |

### Current AWS constraint and cost revalidation

- DynamoDB still supports strongly consistent base-table `Query`, but multi-item `Query` is read-committed relative to concurrent transactions, not serializable snapshot isolation. Transactions remain limited to 100 unique items and 4 MB. This validates the need for generation staging but also confirms F-02.
- DynamoDB PITR supports a configurable 1-35-day recovery period. AWS Backup advanced DynamoDB features support complementary periodic backups and backup-vault encryption/management; AWS explicitly notes that using PITR and periodic backups together incurs both charges.
- Cognito Plus remains priced at `$0.020` per directly authenticated MAU and includes threat protection/risk features and refresh-token rotation. The baseline's `$0.02` for one MAU and `$0.40` for 20 MAU are arithmetically current before ancillary message costs.
- API Gateway HTTP API still has a non-increasable 30-second maximum integration timeout, making F-10 a real contract constraint.
- CloudWatch remains usage-priced with automatic dashboards free and standard alarms priced per alarm metric; the conservative `$1` Personal allowance for 1 GB of logs and about five standard alarms is not understated when temporary free-tier allowances are ignored.
- No selected baseline component inherently adds an unmodeled always-on compute/VPC/NAT cost. A future decision to add asynchronous orchestration, customer-managed KMS keys, WAF, or additional monitoring must be costed before adoption.

Official references checked:

- [DynamoDB transactions and isolation](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html)
- [DynamoDB transaction constraints](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Constraints.html)
- [DynamoDB read consistency](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadConsistency.html)
- [DynamoDB pricing and PITR](https://aws.amazon.com/dynamodb/pricing/)
- [Advanced DynamoDB backup](https://docs.aws.amazon.com/aws-backup/latest/devguide/advanced-ddb-backup.html)
- [Cognito pricing](https://aws.amazon.com/cognito/pricing/)
- [Cognito PKCE flow](https://docs.aws.amazon.com/cognito/latest/developerguide/using-pkce-in-authorization-code.html)
- [Cognito authorization endpoint state/nonce behavior](https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html)
- [API Gateway HTTP API quotas](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-quotas.html)
- [CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/)
- [CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/)
- [AWS root-user and temporary-credential best practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/root-user-best-practices.html)

## H. Recommended Next Step

Do **not** begin production implementation and do **not** create `docs/V4_IMPLEMENTATION_PLAN.md` yet.

The smallest adjudication set is:

1. **Recover authority artifacts:** provide the 196-item ledger and ADR-001–ADR-025 source records, or explicitly amend the baseline process to designate accepted replacements.
2. **Approve a generation concurrency protocol:** decide how every ordinary mutation, generation activation, stale-client token, library read, and export is fenced so acknowledged writes cannot disappear and coherent snapshots are real.
3. **Approve the V3 compatibility matrix:** exact supported export versions, legacy field conversions, `activeBookshelfId`, identifier rules, dates/timestamps, invalid/duplicate/orphan handling, and V4 bounds.
4. **Complete the missing control contracts and boundary map:** replay/idempotency scope, OAuth login transaction state, human AWS-administrator hardening, and the direct Browser/Cognito and Browser/S3 flows.
5. **Choose the large-operation API execution model:** proven bounded synchronous execution or an explicit asynchronous operation resource/worker, including cost impact.
6. **Define V3/V4 isolation:** repository/package/deploy root, hostname/origin, Netlify behavior, and service-worker scope/transition.

After those issues are reflected through the approved ADR/baseline process, the next authorized phase should:

- derive the initial `/api/v1` OpenAPI surface far enough to prove the capability table in §C;
- produce `docs/V4_IMPLEMENTATION_PLAN.md` with work packages, acceptance criteria, and dependencies;
- rerun this gate review against the recovered requirements/ADR record;
- obtain explicit human approval to mark the gate `CLEARED`.
