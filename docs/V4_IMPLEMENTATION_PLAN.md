# ShelfState V4 Implementation Plan

## A. Status

**Status: APPROVED ARCHITECTURE / IMPLEMENTATION PLANNING**

- **Plan revision:** 1.0
- **Plan date:** 2026-09-15
- **Architecture baseline used:** `docs/V4_ARCHITECTURE.md`, baseline 2026-09-14; Pre-Code Gate cleared 2026-09-15
- **Requirements registry used:** `docs/V4_REQUIREMENTS.md`, independently reviewed 2026-09-14; 172 current requirements (166 MUST, 4 SHOULD, 2 MAY); SHA-256 `E937E112102C9EED41421D938D4477341AAC0400040EAA7721928A036FFA07EA`
- **ADR set used:** ADR-001 through ADR-025, including 2026-09-14 amendments
- **Compatibility contract used:** `docs/V3_EXPORT_COMPATIBILITY.md`
- **Independent review used:** `docs/V4_ARCHITECTURE_AUDIT_2.md`
- **Repository revision used:** `14d2025a94f1027d8dcaf03a1f214b7f69dde595` (`main` HEAD), plus the current uncommitted governance artifacts listed above
- **Frozen V3 reference:** tag `v3.9.0` at `c70f6ff`
- **Implementation authorization:** **NOT GRANTED**. This plan may be reviewed and approved; no package may be started until separately authorized.

If an authority changes, record its new revision/digest and rerun the coverage/dependency review in §I before authorizing another package.

## B. Implementation Principles

1. V3.9 remains frozen at the repository root and independently deployable. V4 cannot depend on V3 runtime changes, V3 service-worker behavior, or a V3 production release.
2. V4 uses a separate build/deploy boundary, distinct origin, AWS-only deployment path, and its own service-worker scope. The planned repository boundary is one isolated `v4/` package with logical `frontend/`, `backend/`, `infrastructure/`, `contracts/`, `scripts/`, and `test/` areas; generated output never becomes V3 input.
3. Architecture or ADR deviations stop the package. Update the architecture, ADR, and requirements registry through human review before changing implementation direction.
4. Browser/API, backend/persistence, browser/IdP, browser/transfer storage, CI/production, human-admin/production, and production/recovery boundaries remain untrusted and explicitly tested.
5. The backend derives ownership only from a valid ShelfState session and internal `userId`. No client ID, email, Cognito claim, resource ID, or ADMIN role grants library ownership.
6. Use the approved managed, usage-driven AWS services. Do not add a VPC/NAT, GSI/search/analytics service, WAF, Step Functions, ECS, primary SQS dispatcher, federation, SES, X-Ray, custom dashboard, multi-region, separate account, or offline sync without reopening architecture.
7. All infrastructure is CDK v2 JavaScript and environment-explicit. Prefer IAM/managed identities; classify configuration, expose no frontend secret, and use Secrets Manager only for an unavoidable rotatable secret. GitHub OIDC is the normal deployment path; production releases are deliberate, revision-bound, previewed, smoke-tested, and rollback-capable.
8. The conservative Personal cost posture is approximately `$2.70/month` without promotional allowances. Every resource package records modeled fixed/usage cost and revalidates material deltas before merge/deploy.
9. OpenAPI, requirements traceability, automated tests, real-AWS evidence, privacy checks, and completion records are part of each package—not cleanup deferred to the end.
10. Prefer the smallest coherent vertical proof. A package is incomplete when its negative, concurrency, recovery, or ownership behavior is unverified.

### B.1 Planned repository boundary

The default implementation layout is:

```text
repository root/                 # frozen V3 application/package/Netlify surface
└── v4/                          # independent V4 package and lockfile
    ├── frontend/                # vanilla-JavaScript PWA source
    ├── backend/                 # Lambda/domain/persistence source
    ├── infrastructure/          # CDK v2 JavaScript app/stacks
    ├── contracts/               # OpenAPI and shared wire schemas
    ├── scripts/                 # V4-only build/deploy/verification helpers
    └── test/                    # unit, contract, integration, E2E, fixtures
```

This is an implementation boundary, not permission to create it now. WP-001 must verify the actual Netlify project settings and establish a reliable V4-path exclusion/trigger guard before V4 files are added. If that cannot be done without changing V3 runtime behavior or exposing V4 artifacts on the V3 origin, stop for human review.

### B.2 Common package rules

- Every package begins by confirming its authority revisions and cleanly separating pre-existing user changes.
- Completion evidence records the package ID, commit hash, changed paths, requirement IDs, exact commands, test counts/results, relevant synth/diff/deployed-dev evidence, cost delta, and unresolved observations.
- Real-AWS tests use namespaced synthetic identities/data in non-production and include cleanup that tolerates interrupted prior runs. Production data is never copied.
- Common stop conditions: an architecture/requirements conflict; inability to preserve ownership/atomicity; a needed deferred service; material unmodeled recurring cost; V3 deployment/runtime coupling; or a required control with no implementable verification path.

## C. Work-Package Index

| WP | Name | Depends on | Primary outcome | Package gate |
|---|---|---|---|---|
| WP-001 | Repository and V3/V4 isolation boundary | — | Proven independent V4 path and Netlify guard | No V4 file can publish/trigger V3 |
| WP-002 | V4 package and deterministic toolchain | WP-001 | Isolated package, lockfile, commands, test skeleton | Reproducible clean install/test |
| WP-003 | CDK environment foundation | WP-002 | Synthesizable explicit dev/prod topology | No resource deployment yet unless authorized |
| WP-004 | CI and supply-chain baseline | WP-002, WP-003 | Path-scoped validation/security pipeline | V3 and V4 jobs isolated |
| WP-005 | Human AWS access checkpoint | WP-003 | Verified temporary-role/root/recovery posture | No broad or root routine access |
| WP-006 | OIDC deployment and release controls | WP-003–WP-005 | Environment-scoped short-lived deploy authority | Exact-revision preview/release controls |
| WP-007 | Minimal non-production V4 origin | WP-003, WP-006 | Distinct HTTPS dev edge/API health slice | V3 origin/service worker cannot control it |
| WP-008 | Identity/session persistence foundation | WP-003, WP-006 | Identity, session, auth-transaction data boundaries | TTL never decides validity |
| WP-009 | Cognito Plus and Managed Login | WP-007, WP-008 | Separate dev identity provider and public client | Exact HTTPS redirects; no client secret |
| WP-010 | Bound OAuth login transaction and callback | WP-008, WP-009 | Single-use state/PKCE/nonce/browser-bound callback | Replay and substitution fail |
| WP-011 | IdentityMap and JIT account provisioning | WP-008–WP-010 | Immutable userId and conditional invite-bound provisioning | Email/claims never own data |
| WP-012 | Opaque sessions, CSRF, logout, and fresh auth | WP-008, WP-010, WP-011 | Revocable BFF session boundary | No browser Cognito tokens |
| WP-013 | Identity vertical-slice proof | WP-007, WP-009–WP-012 | Real-AWS/browser authentication evidence | Adversarial auth suite passes |
| WP-014 | Library table and owner-scoped repository | WP-003, WP-006, WP-008, WP-012 | DynamoDB library foundation and least-privilege access | Cross-owner construction impossible |
| WP-015 | Domain schemas and Bookshelf invariants | WP-014 | Server-authoritative Book/Shelf behavior | Exactly one protected default; no `bookIds` |
| WP-016 | OpenAPI, validation, and error foundation | WP-002, WP-007, WP-012, WP-015 | Authoritative `/api/v1` contract baseline | Strict schemas and sanitized errors |
| WP-017 | Idempotency substrate | WP-014, WP-016 | Fingerprinted replay-safe mutation primitive | Lost-response retry returns original result |
| WP-018 | Generation concurrency engine | WP-014, WP-015, WP-017 | CONTROL revision/fence/stage/activate primitives | Race/failure invariants proven |
| WP-019 | Coherent library-read API | WP-014, WP-016, WP-018 | Owned double-CONTROL library load | Mid-read changes cannot leak mixed state |
| WP-020 | Book CRUD and move API | WP-016–WP-019 | Revision-safe synchronous Book slice | Stale/non-owner/replay cases pass |
| WP-021 | Bookshelf CRUD and small delete API | WP-015–WP-020 | Invariant-safe shelf operations | Reassign/remove is one transaction |
| WP-022 | Real-DynamoDB concurrency proof | WP-018–WP-021 | Comprehensive live race/fault evidence | No stale activation or silent overwrite |
| WP-023 | V4 frontend/authenticated shell | WP-007, WP-013, WP-016, WP-019 | Separate vanilla-JS authenticated PWA shell | Public config only; no token storage |
| WP-024 | Usable cloud-library UI slice | WP-020, WP-021, WP-023 | Load/CRUD/move/search/Insights vertical slice | Server remains authoritative |
| WP-025 | V4 service worker and release coherence | WP-023, WP-024 | V4-owned caches and safe updates | API/auth bypass; no forced reload |
| WP-026 | Edge security and rolling-client proof | WP-007, WP-016, WP-023–WP-025 | Headers/cache/client-version/browser evidence | Previous client works; stale client blocks safely |
| WP-027 | Async Operation resource and worker | WP-013, WP-016–WP-018, WP-022 | Owned operation state machine and direct async Lambda | Duplicate delivery is harmless |
| WP-028 | Temporary transfer boundary | WP-007, WP-013, WP-016, WP-017, WP-027 | Private S3 presigned upload/download path | TB-10 negative tests pass |
| WP-029 | Logical coherent export | WP-019, WP-027, WP-028 | Portable owned async export | Snapshot coherence and exfiltration controls pass |
| WP-030 | Native V4 import replace/merge | WP-015, WP-017–WP-019, WP-027–WP-029 | Fully validated atomic import workflow | Invalid input never activates |
| WP-031 | Oversized Bookshelf deletion | WP-021, WP-027, WP-030 | Async generation-based reassign/delete | Source/fence staleness fails safely |
| WP-032 | Persisted schema-migration framework | WP-018, WP-027, WP-030 | Versioned expand/migrate/contract mechanism | Retry-safe conditional activation |
| WP-033 | Invitation administration | WP-011, WP-012, WP-016, WP-017 | Audited idempotent invite lifecycle | ADMIN cannot browse libraries |
| WP-034 | Account disable/enable | WP-012, WP-013, WP-033 | Reversible access revocation | All sessions fail immediately |
| WP-035 | Deletion request, grace, and cancellation | WP-012, WP-016, WP-017, WP-034 | Fresh-auth versioned pending-deletion flow | Stale schedule/cancel is harmless |
| WP-036 | Lifecycle worker and identity retirement | WP-014, WP-027, WP-028, WP-035 | Target-bound permanent deletion | No cross-user browsing or email resurrection |
| WP-037 | Structured observability and alarms | WP-027, WP-033–WP-036 | Sanitized logs, correlation, alarms, SNS | Sensitive-data log tests pass |
| WP-038 | Privacy, classification, and retention | WP-028–WP-030, WP-033–WP-037 | Enforced data lifecycle and user notice | Every data class has owner/retention |
| WP-039 | PITR, AWS Backup, and recovery authority | WP-005, WP-006, WP-008, WP-014, WP-028 | Protected recoverable DynamoDB state | App/operator cannot delete recovery assets |
| WP-040 | Limits, async benchmark, and cost checkpoint | WP-027–WP-032, WP-037–WP-039 | Approved workload bounds and cost evidence | Lambda margin and ~$2.70 posture hold |
| WP-041 | Frozen V3 fixture corpus and schema-3 importer | WP-030, WP-032, WP-040 | Mandatory V3.9 migration proof | IDs/data/relationships/default preserved |
| WP-042 | Schema-1/schema-2 compatibility | WP-041 | Deterministic historical transformations | Ambiguity rejects; `bookIds` ignored |
| WP-043 | Disaster-recovery runbook and drill | WP-036, WP-039, WP-042 | Timed restore/rebuild/rebind evidence | RPO/RTO targets demonstrated |
| WP-044 | Full security and release-verification pass | WP-026, WP-033–WP-043 | End-to-end threat/control and contract evidence | T-01–T-25 verification complete |
| WP-045 | Pre-production acceptance and release rehearsal | WP-044 | Release candidate, rollback, public-signup-off proof | Exact revision accepted in non-production |
| WP-046 | Deliberate production release and observation | WP-045 + separate production authorization | Controlled production launch/smoke/rollback readiness | Human release approval and smoke pass |

## D. Milestones

### M1 — Isolated delivery foundation (`WP-001`–`WP-007`)

- **Purpose:** Establish an independently deployable V4 lane and the minimum controlled non-production edge path.
- **Entry:** Implementation authorization for the listed packages and access to repository/Netlify/AWS/GitHub configuration as individually required.
- **Exit:** Clean V4 package validation and CDK synth succeed; human/OIDC authority is bounded; an inert V4 HTTPS origin and API health route are reachable; a V4-only commit neither publishes nor triggers V3.
- **Demonstration:** Compare V3 production artifacts before/after, show path-scoped CI, CDK diff, CloudFront/private-S3 access denial, API health through V4 origin, and service-worker origin isolation.

### M2 — Trusted identity boundary (`WP-008`–`WP-013`)

- **Purpose:** Prove Managed Login through a bound server transaction into an opaque, revocable ShelfState session and immutable internal identity.
- **Entry:** M1 complete; synthetic invitation can be seeded by an authorized test fixture.
- **Exit:** A synthetic invited user signs in through TB-09, receives no browser token, reaches an authenticated session endpoint, passes CSRF-protected mutation probe, and is revoked by logout/global logout/disablement.
- **Demonstration:** Browser E2E plus real Cognito/DynamoDB tests for callback replay, state/binding/nonce mismatch, concurrent JIT provisioning, expiry, and sessionVersion.

### M3 — Persistent library API (`WP-014`–`WP-022`)

- **Purpose:** Establish owner-scoped cloud persistence, server invariants, synchronous API workflows, and the generation correctness kernel.
- **Entry:** M2 complete.
- **Exit:** OpenAPI-backed library load, Book CRUD/move, Shelf CRUD, and small delete work for one owner; non-owner and stale operations fail correctly; real-DynamoDB race tests prove CONTROL/fence/revision behavior.
- **Demonstration:** Two-user API scenario plus forced create/update/delete/generation races and a coherent paginated read during mutation/activation.

### M4 — Usable V4 PWA slice (`WP-023`–`WP-026`)

- **Purpose:** Put the authenticated library slice behind the separate V4 PWA/edge lifecycle.
- **Entry:** M3 complete and the M1 V4 origin available.
- **Exit:** Browser users can sign in, load/edit/move Books and shelves, search/compute Insights locally, and update safely across one-client-version rollout without V3 interaction.
- **Demonstration:** Installed-PWA E2E showing cache ownership, no API/auth caching, no forced reload, immutable/mutable asset ordering, security headers, and `CLIENT_UPDATE_REQUIRED` behavior.

### M5 — Portability and generation workflows (`WP-027`–`WP-032`)

- **Purpose:** Add owned asynchronous execution, transfer storage, coherent export, atomic import, oversized shelf deletion, and versioned migration machinery.
- **Entry:** M3 complete; M4 edge security available for browser transfer tests.
- **Exit:** Operations move safely through terminal states; duplicate delivery/retry is harmless; V4-native export/import and oversized structural change activate only through a valid fence.
- **Demonstration:** Browser/API/AWS scenarios for presigned upload/download, coherent export under concurrent writes, invalid import non-activation, retry recovery, and stale worker denial.

### M6 — Account lifecycle (`WP-033`–`WP-036`)

- **Purpose:** Complete invitation administration, disablement, grace-period deletion, and narrowly authorized permanent deletion.
- **Entry:** M2 identity and M3 persistence complete; operation/idempotency primitives available.
- **Exit:** ADMIN can manage allowed lifecycle functions without library access; disablement revokes; deletion can be canceled; due/current deletion removes only the target and retires identity.
- **Demonstration:** Multi-user lifecycle E2E including stale schedules, duplicate events, cancellation, target escape attempts, same-email re-registration, and audit events.

### M7 — Operational and recovery hardening (`WP-037`–`WP-040`)

- **Purpose:** Add bounded observability, privacy/retention, protected backups, tested limits, and a cost checkpoint before legacy migration/final acceptance.
- **Entry:** M5 and M6 complete.
- **Exit:** Logs/alarms/budgets, retention, PITR/backup/recovery IAM, maximum input limits, async Lambda margin, and conservative cost are evidenced.
- **Demonstration:** Forced alarm/failure-destination events, log-leak tests, IAM negative tests, backup recovery-point inspection, workload benchmark, and updated no-free-tier estimate.

### M8 — Migration and recovery proof (`WP-041`–`WP-044`)

- **Purpose:** Prove frozen V3 compatibility, disaster recovery, and all architecture-critical controls before a release candidate.
- **Entry:** M7 limits/cost and recovery infrastructure pass.
- **Exit:** Schemas 1/2/3 meet the compatibility matrix; the full recovery drill meets targets; OpenAPI/E2E/threat-control/coverage suites pass.
- **Demonstration:** Golden historical fixtures, preserved-ID assertions, ambiguity diagnostics, separate-table restore/promotion simulation, Cognito reconstruction tabletop, and T-01–T-25 evidence index.

### M9 — Pre-production acceptance and deliberate release (`WP-045`–`WP-046`)

- **Purpose:** Turn a verified revision into a rehearsed release and, only after separate authorization, a controlled production deployment.
- **Entry:** M8 complete with no unresolved architecture exception.
- **Exit:** Non-production rehearsal and rollback pass; public signup remains off; the exact reviewed production revision is deployed only after explicit production authorization; smoke passes and billing observation starts.
- **Demonstration:** CDK/CloudFormation preview, release attestation, known-good rollback, production smoke with synthetic account, and first-cycle cost-review schedule.

## E. Work Packages

The packages below are authorization units. Authorizing one package does not authorize its successors.

### WP-001 — Repository and V3/V4 isolation boundary

- **Objective:** Establish a provable repository/deployment boundary before any V4 source is added.
- **Traceability:** ADR-006/007/024; architecture §§2.1, 16.7, 21; GOV-001, GOV-004–006, EDGE-007–010; T-13/T-25, C-07/C-24.
- **Dependencies:** None. Repository and actual Netlify project/build-trigger access are required; AWS access is not.
- **Scope:** Inventory root V3 publish inputs and Netlify UI/repository configuration; adopt the top-level `v4/` boundary; define V3/V4 path ownership; implement the least-invasive publish exclusion and V4-only change trigger guard; add automated checks that V4 build output cannot enter the V3 artifact set.
- **Explicit non-scope:** V4 package contents, V3 runtime/service-worker changes, a V3-to-V4 migration, AWS configuration, or reusable-code extraction.
- **Expected repository impact:** Deployment/governance checks and possibly Netlify configuration only; no changes to `index.html`, `service-worker.js`, `manifest.webmanifest`, `src/`, existing V3 tests, or V3 behavior.
- **Security:** Preserve C-07/C-24; an installed/root-scoped V3 worker must never receive a V4 production origin or artifact.
- **Data/migration:** None.
- **Cost:** No AWS resources or recurring charge.
- **Required automated tests:** Existing V3 suite; path-ownership test; V3 publish-manifest exclusion test; CI trigger/path-filter tests where testable.
- **Manual/operational verification:** Inspect Netlify's actual base/publish/build-hook settings and a safe deploy/trigger log; record why V4-only changes cannot publish or trigger V3.
- **Acceptance criteria:** Root V3 regression suite passes unchanged; V4 output path is excluded from V3 publish input; a V4-only synthetic change produces no V3 production deployment; V4 is assigned a distinct future hostname; no V3 tracked runtime file changes.
- **Completion evidence:** Before/after path inventory, Netlify setting evidence without secrets, exact tests/results, V3 file diff, chosen guard, and commit hash.
- **Stop/escalate:** Stop if reliable trigger/publish isolation requires a V3 runtime change, exposes V4 beneath the V3 service-worker scope, or cannot be proven with the actual Netlify setup.

### WP-002 — V4 package and deterministic toolchain

- **Objective:** Create the isolated `v4/` package skeleton and reproducible local command surface without adding speculative dependencies.
- **Traceability:** ADR-006/016/017/024; architecture §§16.7, 26–27; GOV-004–006, EDGE-007–010, OPS-013, TEST-001/004.
- **Dependencies:** WP-001. No AWS access.
- **Scope:** Create `v4/package.json` and lockfile plus the planned logical directories; define deterministic install, lint/format if selected, unit-test, contract-test, build, and aggregate verification commands; ignore generated artifacts; keep configuration environment-explicit and public-safe.
- **Explicit non-scope:** Application behavior, CDK dependencies/resources, V3 refactoring, framework adoption, or dependencies needed only by future packages.
- **Expected repository impact:** New `v4/` skeleton and V4-only documentation/tests; root V3 package stays independent.
- **Security:** Lockfile and clean-install discipline; no secrets or inherited root/V3 build inputs.
- **Data/migration:** Fixture directories only, initially empty/readme-backed.
- **Cost:** None.
- **Required automated tests:** Clean install from lockfile; command smoke tests; package-boundary/import test; root `node --test` regression.
- **Manual/operational verification:** Review package dependency list and confirm each dependency is used in this package.
- **Acceptance criteria:** Fresh checkout can install and run V4 verification deterministically; V4 build writes only its own ignored output; root V3 tests remain 127/127 or higher with no V3 test regression; no cross-package runtime imports.
- **Completion evidence:** Tool/runtime versions, lockfile digest, commands/results, dependency rationale, changed paths, commit hash.
- **Stop/escalate:** Stop if the toolchain requires changing V3 runtime/build behavior or introduces a framework/service excluded by architecture.

### WP-003 — CDK environment foundation

- **Objective:** Establish a synthesizable CDK v2 JavaScript structure with explicit dev/prod identity and capability-oriented stack boundaries.
- **Traceability:** ADR-005/007/010/013/014/021; architecture §§5, 17, 21, 23–24; API-001/002, EDGE-012/013, OPS-001/004/014, COST-001/005.
- **Dependencies:** WP-002. AWS access is not required for code/synth; CDK bootstrap/deploy is separately authorized later.
- **Scope:** Add CDK v2 app/dependencies; explicit environment configuration validation; model separate dev/prod resource naming/tags; define stack boundaries for edge, identity/session, library/API, operations/lifecycle, and recovery/observability without yet creating service resources; add synth/diff wrappers and stateful-resource safeguard assertions.
- **Explicit non-scope:** Deploying/bootstrapping AWS, creating service resources, VPC/NAT, multi-region/accounts, or application Lambdas.
- **Expected repository impact:** `v4/infrastructure`, V4 scripts/tests, lockfile, docs.
- **Security:** Fail closed on missing/ambiguous environment; no secrets in context/source; least-privilege capability boundaries remain visible.
- **Data/migration:** Record planned Identity/Account, Session/Auth Transaction, and Library/Operation data boundaries without final key implementation.
- **Cost:** Synth only costs `$0`; future CDK bootstrap storage is usage-driven and must be included at deployment checkpoint.
- **Required automated tests:** CDK synth for dev/prod; template assertions for environment isolation, regions, tags, no VPC/GSI/Streams, and retention/deletion-policy hooks.
- **Manual/operational verification:** Review synthesized topology and stateful-resource change warnings.
- **Acceptance criteria:** Dev/prod synth deterministically to distinct names/config; `us-west-2` runtime and `us-east-1` certificate exception are explicit; no AWS call is required to test; no resource exists yet.
- **Completion evidence:** Synth commands/results, template snapshots/diff, dependency delta, cost note, commit hash.
- **Stop/escalate:** Stop if a required construct silently creates a VPC, paid always-on service, cross-region state, or collapses approved IAM/data boundaries.

### WP-004 — CI and supply-chain baseline

- **Objective:** Make V4 verification automatic, path-aware, reproducible, and supply-chain constrained before feature code.
- **Traceability:** ADR-007/016/017; architecture §§21.3–21.5, 26–27; GOV-005, OPS-002/003/013, TEST-001/003/004; T-12/T-13, C-07/C-22.
- **Dependencies:** WP-002, WP-003. GitHub repository settings access is required for final verification; AWS access is not.
- **Scope:** Add V4-only CI jobs for clean install, unit/contract tests, OpenAPI lint placeholder, CDK synth/diff, dependency audit, secret scanning, and artifact/path checks; pin Actions to immutable revisions; keep the V3 test job independent; define protected-environment/release-job prerequisites without deployment credentials yet.
- **Explicit non-scope:** AWS authentication/deployment, production release, SBOM, third-party paging, or V3 workflow behavior changes beyond isolation needed by WP-001.
- **Expected repository impact:** GitHub workflow/config files, V4 scripts/tests, docs; no V3 runtime source.
- **Security:** Minimal job permissions, untrusted PR isolation, immutable Actions, no long-lived credentials, no secret exposure in logs/artifacts.
- **Data/migration:** Synthetic fixtures only.
- **Cost:** No AWS charge; account for CI service policy outside AWS model if applicable.
- **Required automated tests:** Workflow syntax/static checks; clean-run matrix; intentional failing audit/secret/path fixtures; artifact content checks; root V3 and V4 jobs.
- **Manual/operational verification:** Inspect GitHub Actions permissions, branch/environment protections, and an actual PR run.
- **Acceptance criteria:** CI rejects lock drift, vulnerable release-blocking dependencies, unpinned Actions, secret fixtures, invalid synth, and broken tests; a V4-only run does not invoke V3 deployment.
- **Completion evidence:** Workflow run links/IDs, exact job results, permission snapshot, test counts, commit hash.
- **Stop/escalate:** Stop if required checks need broad write permissions, expose forked PRs to credentials, or couple V4 validation to V3 deployment.

### WP-005 — Human AWS access checkpoint

- **Objective:** Verify and, only under separate implementation authorization, establish the approved human/root/recovery access posture against the actual AWS account.
- **Traceability:** ADR-007/009; architecture §§20.3, 21.9; OPS-005–008, LIFE-009, TEST-007; T-14/T-18, C-08/C-21.
- **Dependencies:** WP-003. Authorized read-only AWS account inspection and an appropriately secured administrator are required; do not assume Identity Center/account structure.
- **Scope:** Inspect root MFA/key status, CloudTrail management events, existing federation/Identity Center, human users/roles, and recovery separation; document gaps; establish or approve a narrowly scoped temporary ShelfState operator path and separately scoped recovery authority; define periodic access review and break-glass procedure.
- **Explicit non-scope:** Whole-account restructuring, routine root work, application resources, production data access, or long-lived access keys.
- **Expected repository impact:** Secret-free access/runbook/checkpoint evidence and IaC policy definitions where ShelfState-specific; no credentials.
- **Security:** MFA, temporary sessions, least privilege, CloudTrail auditability, recovery separation, no library-browsing permission.
- **Data/migration:** None; never inspect user content.
- **Cost:** IAM/CloudTrail baseline should add no material ShelfState recurring charge; flag any proposed trail/storage change before creation.
- **Required automated tests:** IAM policy simulation/static assertions for denied root-key/routine admin patterns and separated operator/recovery capabilities where automatable.
- **Manual/operational verification:** Account security review using redacted evidence; confirm root has MFA/no keys and temporary-role login works.
- **Acceptance criteria:** Root is break-glass only with MFA and no access keys; routine access is MFA-backed temporary credentials; operator and recovery authorities are distinct; management events are auditable; review cadence/owner recorded.
- **Completion evidence:** Dated redacted checklist, role/policy identifiers, CloudTrail evidence, policy-test results, cost delta, commit hash for docs/IaC.
- **Stop/escalate:** Stop if root keys exist and cannot be removed, MFA/temporary roles cannot be enforced, recovery authority cannot be separated, or account restructuring appears necessary.

### WP-006 — OIDC deployment and release controls

- **Objective:** Create short-lived, environment-scoped GitHub deployment authority and exact-revision release/rollback gates.
- **Traceability:** ADR-007/010/016/017; architecture §§21.3–21.7; OPS-002–004/013/014, TEST-003/006; T-13/T-20, C-07/C-09/C-16/C-22.
- **Dependencies:** WP-003–WP-005. AWS and GitHub administrative access are required for implementation/verification.
- **Scope:** Define/deploy GitHub OIDC provider/trust and distinct dev/prod deployment roles; constrain repo/ref/environment and permissions; require prod environment approval; bind artifacts/diff/release to commit SHA; implement non-production deploy workflow and production workflow in disabled/manual-gated form; establish known-good rollback inputs and stateful deletion checks.
- **Explicit non-scope:** Production application deployment, long-lived AWS secrets, broad administrator policies, automatic production-on-merge, or application resources beyond bootstrap authority.
- **Expected repository impact:** CDK IAM definitions, workflows, policy tests, release documentation.
- **Security:** Audience/subject trust restrictions, minimum job permissions, short-lived credentials, protected environments, no PR credential path.
- **Data/migration:** Stateful-resource changes must be surfaced and blocked by default.
- **Cost:** IAM/OIDC has no expected recurring charge; bootstrap artifact storage is usage-driven and must be recorded.
- **Required automated tests:** Trust-policy assertions, IAM simulation, wrong-repo/ref/environment denial, SHA/artifact binding, destructive-diff rejection, rollback workflow dry run.
- **Manual/operational verification:** Assume each role through its intended GitHub environment and prove prohibited paths fail.
- **Acceptance criteria:** No AWS keys in GitHub; dev role cannot mutate prod; prod requires explicit environment approval and exact SHA; diff is reviewable; deletion/replacement flags block; rollback selects a recorded known-good revision.
- **Completion evidence:** Redacted role/trust policies, workflow run IDs, denial results, synth/diff, cost note, commit hash.
- **Stop/escalate:** Stop if trust cannot be narrowed, production approval can be bypassed, or required deploy permissions imply routine account-wide administration.

### WP-007 — Minimal non-production V4 origin

- **Objective:** Prove the separate V4 HTTPS origin and ordinary static/API route before identity and feature work.
- **Traceability:** ADR-005/006/007/013/014/021/024; architecture §§5, 16–17, 21; EDGE-001/002/004/008/012–014, API-001/002, COST-001; T-15/T-21/T-25, C-04/C-20/C-24.
- **Dependencies:** WP-003, WP-006 and an approved dev hostname/certificate path. AWS dev deployment access is required.
- **Scope:** Provision a private dev static bucket, CloudFront OAC/pay-as-you-go distribution, HTTPS certificate/DNS, API Gateway HTTP API, and a minimal bounded health Lambda/path; route `/api/*` to API and other paths to static origin; disable API caching; apply initial security headers; prove direct execute-api endpoint remains independently safe.
- **Explicit non-scope:** PWA feature shell/service worker, Cognito, user data, WAF, Lambda@Edge, VPC/NAT, production distribution, or general S3 access.
- **Expected repository impact:** CDK edge/API foundation, tiny dev health handler, contract/test artifacts, deployment docs.
- **Security:** Private S3 REST origin/OAC, HTTPS, no credentials in frontend, restricted bucket policy, safe health response, no reliance on CloudFront for authorization.
- **Data/migration:** None.
- **Cost:** Adds usage-driven dev CloudFront/S3/API/Lambda/DNS-certificate path; production equivalents are in the `$2.70` model, but persistent dev cost must be estimated and recorded before deploy.
- **Required automated tests:** CDK assertions, bucket public-access denial, cache-policy tests, header tests, health contract, direct API negative/security behavior, V3 path-isolation checks.
- **Manual/operational verification:** Fetch through V4 hostname and direct API; inspect certificate/DNS, CloudFront origin, and browser service-worker registrations.
- **Acceptance criteria:** Dev V4 hostname is distinct and HTTPS; S3 is not public; `/api/v1/health` works through CloudFront; API responses are uncached; V3 worker cannot control V4; no V3 deployment is triggered/altered.
- **Completion evidence:** URLs without bearer material, headers, AWS resource IDs, CDK diff, tests/results, dev monthly estimate, commit/deployed SHA.
- **Stop/escalate:** Stop if the chosen hostname overlaps V3 scope, S3 must become public, CloudFront requires a deferred edge service, or combined dev/prod cost materially threatens posture.

## Milestone 2 packages — Identity and session boundary

### WP-008 — Identity, account, session, and auth-transaction persistence

- **Objective:** Establish the persistence contracts that let the BFF own identity and browser sessions without storing Cognito tokens in browser-readable storage.
- **Traceability:** ADR-001/002/003/015/019; architecture §§8–10, 11.1, 12.5–12.7, 20.2; AUTH-003/004/006/011–013, DATA-001/015–017, PRIV-002/003; T-01/T-02/T-04/T-14/T-18, C-01/C-03/C-05/C-08/C-10/C-15.
- **Dependencies:** WP-003, WP-006. AWS dev access is required for real-table verification.
- **Scope:** Provision separate Identity/Account and Session/Auth Transaction DynamoDB boundaries; define versioned item contracts for IdentityMap, Account, Session, and single-use auth transaction records; use Standard table class, On-Demand capacity, PITR, AWS-owned encryption, no GSI, no Streams, strong reads on security decisions, and TTL only as asynchronous cleanup after application-enforced expiry.
- **Explicit non-scope:** Cognito, OAuth endpoints, library items, user provisioning, account lifecycle behavior, or production deployment.
- **Expected repository impact:** CDK, backend persistence adapters/contracts, tests, data-classification and cost documentation; no V3 changes.
- **Security:** Least-privilege per item family/table; random opaque identifiers; hashed/otherwise non-replayable session material as approved; authoritative application expiry; no tokens, cookie values, or PII in logs.
- **Data/migration:** IdentityMap and Account remain distinct logical records; session/auth-transaction retention and TTL attributes are explicit; table deletion protection/retention safeguards apply.
- **Cost:** Adds On-Demand DynamoDB storage/requests and PITR in dev and later prod; these table purposes are already in the Personal model, but persistent dev and PITR costs must be recorded and model-revalidated.
- **Required automated tests:** Item-schema/unit tests; expiry-boundary tests; strong-read adapter tests; IAM negative tests; CDK assertions for table class, capacity, encryption, PITR, deletion safeguards, no GSI/Streams; real-DynamoDB put/get/conditional/TTL-field integration tests.
- **Manual/operational verification:** Inspect table settings, IAM grants, and backup status in dev; do not wait for TTL deletion as correctness evidence.
- **Acceptance criteria:** All four item types round-trip through their intended boundary; expired records are rejected even before TTL removal; security-sensitive reads are strong; unauthorized Lambda roles cannot read/write other item families; required table settings exactly match architecture.
- **Completion evidence:** Contract version, table/config evidence, IAM denial results, test counts/commands, CDK diff, monthly cost delta, commit/deployed SHA.
- **Stop/escalate:** Stop if an access pattern requires a GSI, if security decisions cannot use strong reads, or if a proposed table consolidation/split changes approved lifecycle or IAM boundaries.

### WP-009 — Cognito Plus and Managed Login foundation

- **Objective:** Establish the approved external identity provider and public OAuth client, with registration still invite-only.
- **Traceability:** ADR-001/002/003/007/019/024; architecture §§8–9, 21.8, 23.3; AUTH-001/002/005/009/010/019, PUB-001/002, EDGE-003; T-01/T-16/T-17, C-01/C-12/C-13.
- **Dependencies:** WP-006–WP-008 and exact dev callback/logout origins. AWS dev access is required.
- **Scope:** Provision a dev Cognito Plus user pool/domain and Managed Login; public app client with Authorization Code flow and PKCE S256; exact callback/logout URLs; enumeration-resistant errors; native Cognito email delivery; self-registration disabled; threat protection initially in audit/observation mode; enumerate settings required later for prod as a distinct environment.
- **Explicit non-scope:** Client secret, implicit flow, identity pool, federated login, SES, public signup, custom auth Lambda triggers, application sessions, or production user pool.
- **Expected repository impact:** CDK identity constructs/assertions, configuration contracts, threat/checkpoint documentation; no V3 changes.
- **Security:** Exact redirect allowlist, minimum scopes, no browser token contract, no reusable client credential, MFA/risk settings only as explicitly approved/configured.
- **Data/migration:** Cognito `sub` is an external identity reference, never the ShelfState resource-owner key; no V3 identity migration.
- **Cost:** Cognito Plus MAU and built-in email usage are usage-driven and included in the approved model assumptions; revalidate current pricing, quotas, and dev/prod MAU assumptions before deployment.
- **Required automated tests:** CDK assertions for public-client settings, code flow, PKCE expectation, exact URLs, disabled self-signup, absence of secret/federation/identity pool/triggers; configuration drift tests.
- **Manual/operational verification:** Inspect Managed Login, authorize URL, app-client secret absence, signup behavior, email path, and exact redirects in dev.
- **Acceptance criteria:** Direct public signup is unavailable; only code flow is enabled; client has no secret; dev redirects are exact; browser-facing configuration contains no credential; Cognito subject is not accepted as application ownership authority.
- **Completion evidence:** Redacted pool/client settings, test results, manual login/signup observations, price/quota check date and sources, CDK diff, cost delta, commit/deployed SHA.
- **Stop/escalate:** Stop if Cognito Plus capabilities/pricing materially changed, exact redirects cannot be enforced, or an approved flow would require a client secret, federation, or public signup.

### WP-010 — OAuth transaction and callback validation

- **Objective:** Implement the BFF-owned Authorization Code + PKCE transaction so every callback is bound, single-use, and completely validated.
- **Traceability:** ADR-001/002/003/019; architecture §§8.3, 9, 20.1–20.2; AUTH-003–008/020, API-007/008, EDGE-003, PRIV-003; T-01/T-02/T-16/T-17, C-01/C-10/C-12/C-13.
- **Dependencies:** WP-008, WP-009. AWS dev access is required for the real callback proof.
- **Scope:** Add login initiation and callback handlers; generate high-entropy `state`, PKCE verifier/challenge S256, nonce, and a short-lived host-only `Secure; HttpOnly; SameSite=Lax` transient browser-binding cookie; store hashed binding, verifier, nonce, allowlisted return target, timestamps, status/used marker, and an approximately ten-minute authoritative lifetime; atomically consume on callback; exchange code server-side; validate issuer, audience/client, signature, timestamps, nonce, state, and binding; clear transient material on every terminal path.
- **Explicit non-scope:** Account provisioning, durable application sessions, refresh/logout, frontend authenticated UI, social login, or browser access to Cognito tokens.
- **Expected repository impact:** Backend auth module/routes, contracts, tests, configuration docs; no V3 changes.
- **Security:** Single-use transaction, constant-time secret comparison where applicable, exact issuer/audience, no open redirect, generic failure response, redaction of codes/tokens/cookies.
- **Data/migration:** Expiration is checked by application before TTL cleanup; consumed/failed state cannot be replayed.
- **Cost:** Normal Lambda/API/DynamoDB/Cognito request usage already represented in the model; revalidate if transaction retention or request volume changes assumptions.
- **Required automated tests:** Unit/property tests for entropy, PKCE, nonce, redirect allowlist, and token claims; integration/security negatives for missing/mismatched/replayed/expired state, cookie, nonce, issuer, audience, signature, and code; log-redaction assertions; real Cognito dev happy path.
- **Manual/operational verification:** Browser-network inspection proves only code/state and HttpOnly binding cookie are browser-visible and return targets cannot escape the V4 origin.
- **Acceptance criteria:** Valid bound callback produces only an internal validated identity result; every tampered, expired, duplicate, or unbound callback fails without provisioning/session creation; auth transaction is terminal after one attempt; no Cognito token reaches browser JavaScript or logs.
- **Completion evidence:** Negative-case matrix/results, redacted browser trace, relevant structured logs/correlation ID, contract validation, cost note, commit/deployed SHA.
- **Stop/escalate:** Stop if Managed Login behavior prevents nonce/binding validation, tokens must be exposed to the browser, or callback replay cannot be atomically prevented.

### WP-011 — IdentityMap and just-in-time account provisioning

- **Objective:** Convert a validated external identity into one immutable ShelfState `userId` under invitation and account-state controls.
- **Traceability:** ADR-001/003/008/015/019/023; architecture §§8.2, 10, 12.6–12.7, 14.1; AUTH-009/010/014–019, ID-001/002, LIFE-010/011, PUB-001; T-01/T-04/T-14/T-18, C-01/C-03/C-08/C-15/C-21.
- **Dependencies:** WP-008–WP-010; invitation records may be seeded only through an approved dev fixture until the administration package exists. AWS dev access required.
- **Scope:** Resolve `(issuer, subject)` IdentityMap; validate normalized-email invitation only for first-time mapping; conditionally and atomically create immutable server-generated UUID `userId`, Account, mapping, default role, and invitation consumption; make retry/concurrent callbacks converge; reject disabled/pending-deletion/retired identity states; keep ADMIN server-controlled.
- **Explicit non-scope:** Invitation administration UI/API, durable browser session, enable/disable commands, deletion worker, public registration, or resource creation.
- **Expected repository impact:** Identity/account domain and repository modules, tests, dev-only synthetic fixture tooling, docs; no V3 changes.
- **Security:** Email never becomes owner key; roles never come from claims/client input; invitation is bounded/single-use; non-disclosing denial; retired identity cannot resurrect automatically by matching email.
- **Data/migration:** IdentityMap persists subject-to-user binding; valid UUIDs are server-generated for new V4 users; account lifecycle/version fields initialized consistently.
- **Cost:** Conditional DynamoDB writes/reads are usage-driven and already modeled; no new service/fixed charge.
- **Required automated tests:** Unit normalization/state tests; real-DynamoDB transactional and concurrency tests for duplicate callback, invitation race, reused email/different subject, retired mapping, disabled account, and rollback on partial failure; IAM negatives.
- **Manual/operational verification:** Use two synthetic dev identities and invitations to inspect mapping/account invariants without production data.
- **Acceptance criteria:** One external identity maps to exactly one immutable `userId`; concurrent first logins create one account/default role and consume one invitation; no invitation creates nothing; disabled/deleting/retired accounts do not regain access; supplied email/role/userId cannot override authority.
- **Completion evidence:** Transaction/concurrency results, redacted item invariants, denial cases, test counts, cost note, commit/deployed SHA.
- **Stop/escalate:** Stop if the transaction cannot enforce one-to-one mapping/invitation consumption within DynamoDB limits or if email reuse/identity retirement is ambiguous under approved rules.

### WP-012 — Opaque BFF sessions, CSRF, logout, and fresh authentication

- **Objective:** Establish the complete application-session boundary used by all authenticated APIs.
- **Traceability:** ADR-002/003/015/019; architecture §§9.2, 11, 12.6–12.7, 20.1–20.2; AUTH-004/006/011–018/020, API-007/008, PRIV-003; T-01–T-03/T-14, C-01/C-02/C-05/C-08/C-10/C-15.
- **Dependencies:** WP-008, WP-010, WP-011. AWS dev access required.
- **Scope:** Issue random opaque host-only `Secure; HttpOnly; SameSite=Lax` application cookies with the narrowest practical path; start with server-authoritative seven-day idle and 30-day absolute session expiry; keep initial one-hour Cognito access/ID tokens and rotating 30-day refresh token server-side; enforce Account `ACTIVE` and matching `sessionVersion`; refresh upstream credentials server-side; rotate session ID on login and every security/privilege boundary; implement session introspection, logout, global logout/version invalidation, CSRF custom-header plus method/origin checks for unsafe methods, and bounded fresh-auth state for sensitive commands.
- **Explicit non-scope:** Library operations, admin lifecycle commands, browser token storage, persistent-device/offline login, or public signup.
- **Expected repository impact:** Backend session/auth middleware/routes, OpenAPI schemas, tests, frontend-facing session contract docs; no V3 changes.
- **Security:** Server-derived `userId`/role only; deny expired/revoked/non-ACTIVE sessions; CSRF defense independent of CORS; no session/token disclosure; global logout is immediately authoritative despite TTL lag.
- **Data/migration:** Session expiry/version fields explicit; TTL is cleanup; disabled/deletion states invalidate at authorization time.
- **Cost:** DynamoDB/Lambda/API/Cognito refresh traffic is usage-driven and within the approved model; record retention/request assumptions.
- **Required automated tests:** Cookie-attribute tests; session expiry/version/rotation unit tests; integration negatives for missing/forged/stolen/revoked cookie, stale version, disabled account, missing/bad CSRF and origin; concurrent global logout; real browser and Cognito refresh/logout proof; log-redaction tests.
- **Manual/operational verification:** Inspect browser storage/network to prove no tokens are available to JavaScript and logout/fresh-auth UX clears state.
- **Acceptance criteria:** Authenticated middleware exposes only server-derived principal data; stale version or non-ACTIVE account is rejected; unsafe cookie-authenticated request without valid CSRF is rejected; global logout invalidates all prior sessions; fresh-auth window expires; no Cognito/access/refresh token is browser-readable.
- **Completion evidence:** Security matrix, browser trace, test counts/commands, contract results, representative redacted logs, cost note, commit/deployed SHA.
- **Stop/escalate:** Stop if a required Cognito interaction forces browser token possession, revocation cannot be made immediately authoritative, or CSRF/fresh-auth rules conflict with approved UX.

### WP-013 — Identity vertical-slice proof

- **Objective:** Demonstrate invite-only login through the real dev edge, Cognito, BFF, persistence, and browser as one reviewable slice.
- **Traceability:** ADR-001–003/007/015/019; architecture §§8–11, 20.1–20.3, 27; AUTH-001–020, AZ-001/002/006, TEST-002/003/007; T-01–T-04/T-14/T-16–T-18, C-01–C-03/C-05/C-08/C-10/C-12/C-13/C-15.
- **Dependencies:** WP-007–WP-012. AWS dev and browser-E2E access required.
- **Scope:** Wire the dev `/api/v1` auth/session path; create synthetic invitations/users; execute login, session check, CSRF-protected probe command, logout, global logout, disabled-state denial, and fresh-auth proof; exercise direct API and CloudFront routes; document the identity boundary.
- **Explicit non-scope:** Library data/API/UI, invitation administration, production identities, public signup, or V3 integration.
- **Expected repository impact:** Integration/browser E2E suites, synthetic-data tooling, contract/docs and minimal glue; no V3 changes.
- **Security:** Full negative matrix across callback/session/CSRF/ownership-free endpoints; synthetic data only; test cleanup cannot broaden production role access.
- **Data/migration:** Cleanup synthetic IdentityMap/Account/Session/Auth Transaction records while retaining test evidence.
- **Cost:** Small dev test usage across already introduced services; update actual dev run-rate against the Personal model.
- **Required automated tests:** Real-AWS integration and browser E2E for all scope paths; OpenAPI conformance; direct API authorization negatives; lost/replayed callback; session invalidation; no-token/browser-storage assertion.
- **Manual/operational verification:** Review Managed Login redirect and browser storage/cookies; confirm CloudTrail/structured logs correlate the run without sensitive values.
- **Acceptance criteria:** Invited user reaches an authenticated session; uninvited user cannot; CSRF probe and logout semantics match contracts; direct API is equally protected; E2E confirms no browser Cognito tokens; V3 site/tests/deploy inputs are unchanged.
- **Completion evidence:** E2E video/screenshot only where useful, exact test counts, correlation IDs/redacted logs, deployed SHA/resources, cost actual, root V3 regression result, commit hash.
- **Stop/escalate:** Stop if the end-to-end identity boundary differs from the approved token/session model or any negative case cannot be proven.

## Milestone 3 packages — Persistent library and core API

### WP-014 — Library DynamoDB and owner-scoped repository foundation

- **Objective:** Establish the approved single-table logical library boundary and least-privilege owner-scoped repository primitives.
- **Traceability:** ADR-004/012/015/018/020/025; architecture §§12–13, 20.2, 24.1; DATA-001–009/011/012/015–018, AZ-001–004, ID-003/004, COST-001; T-04–T-08/T-14, C-03/C-06/C-08/C-11/C-14/C-17/C-18.
- **Dependencies:** WP-003, WP-006, WP-008, WP-012. AWS dev access required.
- **Scope:** Provision the Library table using Standard/On-Demand, PITR, AWS-owned encryption, no GSI/Streams; define owner partition/key/version contracts for CONTROL, generations, books, shelves, idempotency, and operations; repository methods always receive trusted server principal, default to strongly consistent reads where coordination/authorization needs them, and expose conditional/transaction primitives.
- **Explicit non-scope:** Domain CRUD, generation algorithms, secondary indexes, search service, library contents, or production table.
- **Expected repository impact:** CDK, backend persistence contracts/adapters, IAM and integration tests, docs; no V3 changes.
- **Security:** Owner partition/key construction is internal; no arbitrary key/query API; operation roles receive only required prefixes/actions; non-owner probes do not disclose existence.
- **Data/migration:** Record schema/version fields and immutable IDs; CONTROL is the sole active-generation/revision/fence authority; stateful deletion/replacement protection applies.
- **Cost:** Adds On-Demand Library table requests/storage and PITR, already represented in the Personal model; persistent dev costs and actual item-size assumptions require revalidation.
- **Required automated tests:** Key-schema/item codec tests; CDK configuration/no-GSI/no-Streams assertions; IAM policy simulation; real-DynamoDB strong-read, conditional-write, transaction-cancel, pagination, and cross-owner negative tests.
- **Manual/operational verification:** Inspect dev table settings, item metrics, and role grants.
- **Acceptance criteria:** Repository cannot address another owner through client-controlled fields; non-owner and nonexistent lookups are indistinguishable; all approved item families fit without GSI; CONTROL reads can be strong; table settings and safeguards match architecture.
- **Completion evidence:** Key/item contract, IAM denial matrix, integration results, CDK diff/settings, measured item sizes, cost delta, commit/deployed SHA.
- **Stop/escalate:** Stop if any mandatory access pattern requires a GSI/scan across owners, a separate index/search service, or changed security/lifecycle boundary.

### WP-015 — Library domain schemas and bookshelf invariants

- **Objective:** Encode strict server-side Book/Bookshelf rules independently of transport and storage details.
- **Traceability:** ADR-004/012/020; architecture §§6.1–6.2, 12.2–12.4, 20.1; DOM-001–007, ID-001–004, DATA-002/006/007/010/013, API-011/012; T-06/T-09/T-25, C-06/C-11/C-19/C-24.
- **Dependencies:** WP-014. No AWS access for domain tests.
- **Scope:** Define strict bounded schemas and commands for Book and Bookshelf; canonical `Book.bookshelfId`; opaque server-generated UUID v4 creation with no user/email/name/time/order/privilege encoding and a future globally unique offline-ID compatibility path without implementing offline sync; normalized case-insensitive shelf-name key; exactly one protected default shelf; move validation; expected entity revision; small structural delete/reassign planning; request-size/collection/complexity bounds; preserve optional/legacy fields permitted by migration contract.
- **Explicit non-scope:** HTTP handlers, DynamoDB transactions, bulk generation workflow, client-side search implementation, `bookIds`, or broad type coercion.
- **Expected repository impact:** V4 backend/domain modules, shared public schemas where safe, unit/property tests and docs; no V3 changes.
- **Security:** Reject unknown/authority fields (`userId`, owner, role, generation, revision); validate all enum/string/URL/date boundaries; deterministic normalization prevents uniqueness bypass.
- **Data/migration:** Keep immutable IDs and revision fields distinct; migration normalization exceptions occur only in migration packages, not normal CRUD.
- **Cost:** None directly; bounds prevent unbounded DynamoDB/Lambda/API work.
- **Required automated tests:** Unit/property/fuzz tests for types, bounds, normalization, Unicode/case collisions, default-shelf invariants, moves, revision requirements, unknown fields, and no-`bookIds` shape.
- **Manual/operational verification:** Review domain rules against representative V3 fixtures and UI behavior evidence.
- **Acceptance criteria:** Invalid/over-complex payloads fail deterministically; two shelf names differing only by approved normalization collide; default shelf cannot be renamed/deleted contrary to contract; every Book has one valid canonical shelf reference; client authority fields are rejected.
- **Completion evidence:** Schema/rule matrix, property/fuzz counts and seeds, V3 evidence references, commands/results, commit hash.
- **Stop/escalate:** Stop if approved uniqueness/default-shelf rules are ambiguous for a legacy value or cannot be made transactional under WP-021/WP-031.

### WP-016 — Authoritative OpenAPI and request boundary

- **Objective:** Establish OpenAPI as the versioned authority for the resource-oriented `/api/v1` boundary, validation, compatibility, and error semantics.
- **Traceability:** ADR-011/016/020/024; architecture §§13.6, 16.2–16.6, 20.1, 21.5, 23.3; API-001–016, AZ-004/008, EDGE-007/008, TEST-003; T-03/T-06/T-07/T-12/T-25, C-02/C-04/C-06/C-07/C-19/C-24.
- **Dependencies:** WP-002, WP-007, WP-012, WP-015. AWS is not required for contract definition.
- **Scope:** Define common JSON-only schemas, IDs/revisions, pagination, idempotency header, the approved small error envelope (`code`, safe `message`, optional correlation ID, bounded field issues), request/correlation IDs, 400/401/403/404/409/415/429/503 and update-required semantics, including `Retry-After` where meaningful; define endpoint families for health, auth callbacks/session, library load, Book CRUD/move, Bookshelf CRUD/structural delete, import/export transfer initiation, operation status, invitations, self account/session/deletion, and ADMIN lifecycle commands. Use centralized BFF-session middleware in request Lambdas—not API Gateway JWT authorization or a separate Lambda authorizer. Use explicit command endpoints only for non-CRUD workflows; lock method/path/response shapes before their implementation packages.
- **Explicit non-scope:** Implementing those handlers, GraphQL/RPC, public signup, internal worker endpoints, generated client commitment, or exposing AWS/Cognito/S3 internals.
- **Expected repository impact:** V4 OpenAPI contract, validation/lint configuration, contract tests and API docs; no V3 changes.
- **Security:** Strict schemas/no broad coercion; no owner/role authority inputs; non-disclosing 404 policy where ownership applies; authenticated mutating routes declare CSRF/idempotency requirements; no secrets in examples.
- **Data/migration:** Export/import schemas reference versioned logical formats and operation resources, not table items; immutable ID and revision semantics explicit.
- **Cost:** None; request/payload bounds support cost control.
- **Required automated tests:** OpenAPI lint/parse; operation-ID/schema uniqueness; request/response example validation; route inventory; error/status matrix; JSON/content-type and bound tests; breaking-change check against last released contract.
- **Manual/operational verification:** Architecture/security review of route families and explicit commands before dependent handlers merge.
- **Acceptance criteria:** Every required workflow family has a documented path/method/auth/CSRF/idempotency/response; all errors use one envelope; ownership failures and update-required `409` are explicit; contract contains no GraphQL/RPC/public-signup or browser-token surface.
- **Completion evidence:** Contract digest/version, lint/test results, reviewed route/error matrix, requirement links, commit hash.
- **Stop/escalate:** Stop if a workflow cannot be expressed under resource-oriented HTTP/JSON or if error/compatibility semantics contradict an ADR/requirement.

### WP-017 — Idempotency protocol

- **Objective:** Make replay-sensitive commands safe across lost responses, client retries, and concurrent duplicates.
- **Traceability:** ADR-011/012/018/020; architecture §§13.5, 16.5; API-006/009/014/015, DATA-011/012/017/018, OP-004/005/008; T-07/T-08/T-11/T-25, C-05/C-11/C-14/C-24.
- **Dependencies:** WP-014–WP-016. AWS dev access required for concurrency tests.
- **Scope:** Implement owner + operation-scope + idempotency-key records; canonical request fingerprint; atomic begin/complete/fail protocol; same-key/same-input replay returns original logical result; different input returns `IDEMPOTENCY_CONFLICT`; explicit in-progress response/retry guidance; application-enforced expiry with TTL cleanup; integrate first with a synthetic bounded command before feature commands adopt it.
- **Explicit non-scope:** Client-generated resource IDs, distributed locks outside DynamoDB, infinite retention, generic caching, or operation worker behavior.
- **Expected repository impact:** Backend middleware/domain/repository, OpenAPI components, real-DynamoDB tests and docs; no V3 changes.
- **Security:** Scope keys by trusted user and command; do not store secrets/full sensitive payloads; authorization happens on every replay; result cannot cross owners.
- **Data/migration:** Fingerprint algorithm/version and retention are explicit; TTL deletion is not correctness; completed result/reference survives the approved replay window.
- **Cost:** Adds Library-table request/storage usage already modeled; record retention and duplicate-request assumptions, revalidate if materially larger.
- **Required automated tests:** Fingerprint canonicalization; same/different input; simultaneous duplicates; lost-response retry; in-progress and expired records; authorization change between attempts; transaction cancellation; real DynamoDB concurrency/idempotency suite.
- **Manual/operational verification:** Inspect redacted records/metrics for a synthetic retry and confirm no sensitive body is persisted/logged.
- **Acceptance criteria:** Concurrent same-key/same-input attempts execute one logical mutation and return the same result; same key with different input returns `409 IDEMPOTENCY_CONFLICT`; in-progress is deterministic; expired keys can be reused only per documented policy; server generates resource IDs once.
- **Completion evidence:** Race-test counts/results, canonical fingerprint vectors, representative records/logs, OpenAPI validation, cost note, commit/deployed SHA.
- **Stop/escalate:** Stop if any replay-sensitive workflow cannot atomically couple idempotency state to its durable mutation or would require client-generated IDs.

### WP-018 — Generation concurrency and writer-fence engine

- **Objective:** Implement the shared correctness primitive for ordinary writes and exclusive generation-changing operations.
- **Traceability:** ADR-004/012/018/020/025; architecture §§12.1–12.4, 13.3–13.5; DATA-002–014/017/018, API-010–015, OP-004–008; T-06–T-08/T-11, C-05/C-06/C-11/C-14/C-17/C-18.
- **Dependencies:** WP-014, WP-015, WP-017. AWS dev access is mandatory; mocks are insufficient.
- **Scope:** Implement strongly read CONTROL snapshot; ordinary mutation transaction checks active generation, expected entity revision, no live conflicting writer fence, then mutates entity and advances `libraryRevision`; implement conditional lease/fence acquire/renew/release with owner operation, fencing token and expiry; stage new generation invisibly; activate only while operation/fence/control expectations still match; abandon stale staging safely; recover expired leases without allowing stale writer activation.
- **Explicit non-scope:** Import/export/delete business logic, multi-region coordination, Step Functions, queue-primary dispatch, or user-visible operation UI.
- **Expected repository impact:** Backend coordination/domain/repository modules, integration/property tests, protocol documentation; no V3 changes.
- **Security:** Trusted server owns generation/revision/fence fields; other owners cannot interfere; stale/fenced worker cannot publish; error details do not disclose another owner.
- **Data/migration:** CONTROL remains authoritative for active generation, `libraryRevision`, and writer lease/fencing token; staged generations are inert until atomic activation; retain the prior generation for about 24 hours for rollback; cleanup/TTL is non-authoritative and never precedes proof of non-active state.
- **Cost:** DynamoDB transactions/strong reads increase usage-driven cost already anticipated; measure transaction/read amplification and revalidate the Personal model at WP-040.
- **Required automated tests:** Real-DynamoDB deterministic race suite for ordinary-write vs acquisition, two writers, lease renewal/expiry/takeover, old fencing token, crash before/after staging, activation conflict, stale generation, stale entity revision, revision advancement, and retry/idempotency; property/state-machine tests where practical.
- **Manual/operational verification:** Review transaction cancellation reasons and inspect CONTROL/staged items after injected failures.
- **Acceptance criteria:** Ordinary valid mutation atomically changes entity and increments `libraryRevision`; stale generation plus otherwise-valid entity revision returns approved `409`; stale entity revision returns approved `409`; only current fenced operation activates; expired lease is recoverable; old worker cannot activate after takeover; partially staged data is never visible.
- **Completion evidence:** Protocol state diagram/version, race/fault matrix and counts, representative CONTROL transitions, consumed-capacity measurements, cost note, commit/deployed SHA.
- **Stop/escalate:** Stop on any DynamoDB atomicity gap, transaction-limit problem, ambiguous lease clock rule, or path where stale work can become active; return to architecture rather than adding a lock service.

### WP-019 — Coherent library reads and export snapshots

- **Objective:** Guarantee that multi-page reads observe one active generation and a coherent revision boundary.
- **Traceability:** ADR-004/012/020/025; architecture §§12.1–12.4, 13.2, 14.7; DATA-002–005/008/009/014, API-004/005/013, MIG-012; T-06/T-08, C-06/C-11/C-17/C-18.
- **Dependencies:** WP-014, WP-016, WP-018. AWS dev access required.
- **Scope:** Implement an idempotent, conditional first-library initializer that creates CONTROL, the first generation, and exactly one default shelf before an active library is exposed; WP-016 must choose/document whether that is an explicit bootstrap command or a declared first-load side effect. Then implement strong CONTROL read before pagination, owner+generation-bounded page reads, strong CONTROL validation after completion, bounded retry/update-required behavior, and a reusable coherent snapshot iterator for library load/export; define cursor binding to owner/generation/query shape and response revision metadata.
- **Explicit non-scope:** Book/shelf writes, export serialization, client search, scans across owners, or cached API responses.
- **Expected repository impact:** Backend read repository/service, OpenAPI schemas, real-DynamoDB tests and docs; no V3 changes.
- **Security:** Owner/generation are server-bound; cursors are opaque/integrity-protected and cannot widen access; response does not leak inactive generations.
- **Data/migration:** Snapshot fails/retries if CONTROL changes; inactive/staged items are excluded; export consumer gets the same primitive later.
- **Cost:** Strong double-CONTROL reads and pagination are usage-driven and modeled; measure maximum supported library read cost in WP-040.
- **Required automated tests:** Multi-page real-DynamoDB reads concurrent with activation; tampered/cross-owner/stale cursors; bounded retry exhaustion; inactive generation exclusion; snapshot/export iterator equality; update-required response.
- **Manual/operational verification:** Inspect request counts/latency for representative and upper-bound synthetic libraries.
- **Acceptance criteria:** Concurrent first access creates one CONTROL/initial generation/default shelf and never exposes an active library without exactly one default; a returned library contains records from exactly one generation and reports its `libraryRevision`; generation change during pagination never yields a mixed response; invalid cursor reveals nothing; retry is bounded and terminates with approved compatibility/error semantics.
- **Completion evidence:** Concurrency results, page/count/latency/capacity measurements, contract validation, redacted trace, cost note, commit/deployed SHA.
- **Stop/escalate:** Stop if coherent reads require table-wide scans, a GSI, unbounded retry, or weaker consistency than architecture permits.

### WP-020 — Conditional Book CRUD and move

- **Objective:** Deliver owner-scoped Book create/read/update/delete and canonical shelf movement on the shared concurrency protocol.
- **Traceability:** ADR-004/011/012/015/020; architecture §§6, 12–13, 16.3–16.6, 20.1; DOM-001/004/006/007, ID-001–004, DATA-004/006/007/010/013, API-003–016, AZ-001–004; T-03–T-07/T-09, C-02–C-06/C-11/C-19.
- **Dependencies:** WP-012, WP-015–WP-019. AWS dev access required.
- **Scope:** Implement OpenAPI-conformant Book collection/item routes; server-generated UUID create; strict validation; conditional update/delete using active generation and entity revision; move by updating canonical `bookshelfId` after destination ownership/existence validation; advance `libraryRevision`; apply idempotency to replay-sensitive creates/commands; pagination/bounds.
- **Explicit non-scope:** Bookshelf CRUD, bulk import/delete, client UI, full-text server search, or `bookIds` maintenance.
- **Expected repository impact:** V4 backend handlers/services/repositories, OpenAPI completion, unit/integration/security tests; no V3 changes.
- **Security:** Principal comes only from session middleware; reject client owner/generation authority; non-owner/nonexistent responses indistinguishable; validate before DynamoDB work; safe error/log fields.
- **Data/migration:** Immutable Book ID; revision advances exactly once per logical mutation; references only active owned shelf; valid legacy fields are not normalized here.
- **Cost:** API/Lambda/DynamoDB usage is within modeled core operations; record measured request/transaction amplification.
- **Required automated tests:** Domain/unit, OpenAPI contract, real-AWS CRUD/move, ownership negatives, stale generation/revision, duplicate idempotency key, lost response, invalid shelf/default cases, pagination/bounds, direct API auth.
- **Manual/operational verification:** Exercise representative dev calls and inspect correlation/log/resource state without sensitive payloads.
- **Acceptance criteria:** Each logical mutation changes one Book and advances library revision once; stale generation + valid entity revision returns approved `409`; non-owner ID equals nonexistent behavior; duplicate create returns original server-generated ID; move leaves no reverse `bookIds` structure.
- **Completion evidence:** Route/status matrix, test counts/results, DynamoDB transaction/capacity evidence, OpenAPI digest, cost note, commit/deployed SHA.
- **Stop/escalate:** Stop if any Book mutation bypasses the shared protocol, needs a reverse membership list/index, or cannot meet non-disclosure semantics.

### WP-021 — Bookshelf CRUD and bounded structural delete

- **Objective:** Deliver protected shelf administration and small atomic delete/reassign while preserving all shelf invariants.
- **Traceability:** ADR-004/011/012/020/025; architecture §§6.2, 12–13, 16.3–16.6; DOM-002–007, DATA-003/004/006/007/010/013, API-003–016, AZ-001–004; T-03–T-09, C-02–C-06/C-11/C-14/C-19.
- **Dependencies:** WP-015–WP-020. AWS dev access required.
- **Scope:** Implement shelf collection/item routes, server-generated ID, case-insensitive unique-name reservation, exactly-one-default protection, conditional rename/update; implement delete command that strongly identifies affected active-generation Books, rejects invalid replacement, and uses one bounded transaction to reassign Books/delete shelf/advance revisions when within the approved transaction threshold; route oversized cases to a not-yet-available operation response until WP-031.
- **Explicit non-scope:** Oversized generation workflow, import/export, client UI, `bookIds`, or silent partial deletion.
- **Expected repository impact:** Backend routes/domain/repository, OpenAPI, real-DynamoDB tests and docs; no V3 changes.
- **Security:** Owner-derived keys, no disclosed foreign IDs, protected default, bounded work before transaction, conditional uniqueness/revisions/fence.
- **Data/migration:** Each affected Book keeps its ID and receives canonical replacement `bookshelfId`/revision; small delete is all-or-nothing; default shelf remains exactly one.
- **Cost:** Transaction/read cost is usage-driven and included; threshold must bound worst-case request cost and stay within DynamoDB transaction limits.
- **Required automated tests:** Unit/domain and contract; real-DynamoDB case-collision races, concurrent rename/create, default protection, replacement validation, zero/small/threshold/over-threshold delete, stale revision/generation/fence, rollback/ownership negatives, idempotent retry.
- **Manual/operational verification:** Inspect representative transaction cancellation and post-delete invariants.
- **Acceptance criteria:** Duplicate normalized shelf names cannot commit; default shelf remains exactly one/protected; eligible small delete is atomic and reassigns every affected Book; over-threshold request starts no partial work and advertises the approved async path; `libraryRevision` advances once.
- **Completion evidence:** Threshold rationale, invariant/race results, item-state evidence, OpenAPI validation, measured capacity/cost, commit/deployed SHA.
- **Stop/escalate:** Stop if uniqueness/default/delete invariants exceed transaction limits for the small path or cannot share the approved fence/generation protocol.

### WP-022 — Real-DynamoDB concurrency qualification

- **Objective:** Qualify the complete synchronous library path against actual DynamoDB semantics before frontend dependence.
- **Traceability:** ADR-004/012/018/020/025; architecture §§12–13, 20.2, 27; DATA-001–014/017/018, API-006/009–015, TEST-002/007; T-04–T-08/T-11/T-14, C-03/C-05/C-06/C-08/C-11/C-14/C-17/C-18.
- **Dependencies:** WP-017–WP-021. AWS dev integration environment is mandatory.
- **Scope:** Run deterministic concurrent/fault-injected scenarios spanning idempotency, Book/Shelf mutations, reads, CONTROL revisions, lease fencing, and staged generation; include direct API and repository tests; publish the protocol qualification matrix and measured capacity/latency.
- **Explicit non-scope:** New behavior, mocks as substitute, async business workflows, load testing production, or architectural redesign.
- **Expected repository impact:** Integration harness/fixtures, CI non-production job, evidence docs; production modules change only for defects found within approved design; no V3 changes.
- **Security:** Synthetic owners prove isolation; credentials are temporary/least-privilege; failures/logs contain no secrets or cross-owner data.
- **Data/migration:** Fixture cleanup never deletes unknown data; staged/active generations and revisions checked after every fault.
- **Cost:** Test traffic is usage-driven; record run cost, consumed capacity, and whether model assumptions remain valid.
- **Required automated tests:** Parallel write/read matrix; stale generation + current entity revision; current generation + stale entity revision; duplicate retry/lost response; lease expiry/takeover; stale worker activation; partial staging; shelf-name race; structural delete race; cross-owner probes; coherent pagination during activation.
- **Manual/operational verification:** Review DynamoDB cancellation reasons/metrics and audit a sampled final state against the formal invariants.
- **Acceptance criteria:** Every critical race has a deterministic automated assertion and passes repeatedly; no mixed-generation read, lost committed update, double logical mutation, stale activation, or ownership disclosure occurs; failures map to approved errors; capacity/latency are recorded.
- **Completion evidence:** Versioned test matrix, repeat count/seeds, commands/results, CloudWatch/DynamoDB metrics, cost actual, defects/resolutions, commit/deployed SHA.
- **Stop/escalate:** Stop planning/implementation progression if any required atomicity or consistency claim fails under real DynamoDB; do not mask it with retries or a deferred service.

## Milestone 4 packages — Usable V4 vertical slice

### WP-023 — V4 frontend shell and authenticated bootstrap

- **Objective:** Establish a separately built vanilla-JavaScript V4 PWA shell that uses only the BFF session contract.
- **Traceability:** ADR-002/006/016/024; architecture §§7.1, 9.2, 16.7–16.9, 26.2; EDGE-001/002/007–010/014, AUTH-011, API-001/002/007, GOV-004; T-01/T-12/T-15/T-21, C-01/C-04/C-07/C-20.
- **Dependencies:** WP-007, WP-013, WP-016, WP-019. Dev origin/browser access required.
- **Scope:** Build the V4-only HTML/CSS/ES-module shell; public runtime configuration; unauthenticated/authenticated/loading/update-required/error states; login/logout/session bootstrap through relative `/api/v1`; accessible navigation and bounded client state; no token-processing code.
- **Explicit non-scope:** Library editing, service worker, Netlify transforms, React/framework migration, offline writes, Cognito SDK/token storage, or V3 source reuse/refactor.
- **Expected repository impact:** V4 frontend/build/tests and static assets; V4 edge deployment inputs; no V3 changes.
- **Security:** Safe DOM APIs/escaping, no secret config, no inline unsafe script requirement, no auth state inferred from client claims, relative ordinary API calls only.
- **Data/migration:** No persisted library data; clear transient UI state on logout/account denial.
- **Cost:** Static artifact size/request usage is within CloudFront/S3 model; record built size and dev request impact.
- **Required automated tests:** Frontend unit/DOM tests, accessibility checks, build determinism, static-secret scan, CSP compatibility, browser E2E for login/session/logout and error/update-required states.
- **Manual/operational verification:** Keyboard/screen-size check and browser storage/network review on the dev origin.
- **Acceptance criteria:** Shell builds independently of V3; authenticated state comes only from session endpoint; no Cognito token/client secret is bundled or stored; untrusted strings render as text; V3 service worker never controls the page.
- **Completion evidence:** Build digest/size, test and accessibility results, browser storage/network evidence, screenshot only for UI review, cost note, commit/deployed SHA.
- **Stop/escalate:** Stop if the shell requires V3 runtime modification, browser token handling, unsafe rendering/CSP relaxation, or Netlify-specific behavior.

### WP-024 — Usable cloud-library UI slice

- **Objective:** Make the qualified library API usable for normal ShelfState Book and Bookshelf workflows end to end.
- **Traceability:** ADR-006/011/016/020/024; architecture §§6–7, 13.2, 16.3, 16.7–16.9; DOM-001–007, API-003–016, EDGE-007–010, TEST-002; T-03/T-06/T-09/T-12, C-02/C-06/C-07/C-19.
- **Dependencies:** WP-020–WP-023. AWS dev/browser access required.
- **Scope:** Load coherent library state; create/edit/delete Books; create/rename/delete eligible shelves; move Books; display conflicts/update-required and retry choices; implement bounded client-side search/filter/sort and lightweight insights from already-loaded authorized data; accessible forms/feedback.
- **Explicit non-scope:** Import/export, oversized deletion, server search/index, analytics platform, offline writes/sync, or admin UI.
- **Expected repository impact:** V4 frontend views/state/API client and browser/unit tests; OpenAPI only for defect corrections; no V3 changes.
- **Security:** Render data safely; send no identity/owner authority; CSRF/idempotency headers as specified; avoid sensitive error/log/telemetry content.
- **Data/migration:** Client honors immutable IDs/revisions and never fabricates conflict resolution; search is transient/local.
- **Cost:** No new AWS resource; normal API usage remains modeled. Record bundle and request counts for representative workflows.
- **Required automated tests:** Unit/DOM and OpenAPI-client contract tests; browser E2E for all CRUD/move/default/unique-name/conflict/ownership-safe errors; hostile-string rendering; bounded-search workload; V3 regression.
- **Manual/operational verification:** Accessibility/keyboard and responsive review; compare supported visible behavior with existing V3 evidence without changing V3.
- **Acceptance criteria:** A synthetic user completes the core library workflow through V4; all writes carry current revisions and handle `409` without overwriting; client search needs no server index; hostile content executes no script; non-owner details are not exposed.
- **Completion evidence:** E2E matrix/results, accessibility report, request/bundle measures, screenshots only for UX review, cost note, V3 regression, commit/deployed SHA.
- **Stop/escalate:** Stop if expected V3 behavior requires an unapproved API/data change, server-side search, unsafe rendering, or offline-sync semantics.

### WP-025 — V4 service worker and controlled client updates

- **Objective:** Add an origin-contained V4 service worker that accelerates static assets without weakening API/auth or release compatibility.
- **Traceability:** ADR-006/016/024; architecture §§16.2, 16.7–16.9, 21.6; EDGE-002/005–011/014, API-016; T-03/T-12/T-15/T-21, C-02/C-04/C-07/C-16/C-20.
- **Dependencies:** WP-023, WP-024. Dev origin/browser access required.
- **Scope:** Define V4 worker scope/versioned static precache/runtime strategy, activation/update notification, old-cache cleanup, and controlled opt-in update behavior; explicitly bypass `/api/*`, auth callbacks, Cognito, and presigned S3; publish hashed assets before metadata/worker and `index.html` last, retain compatible old assets/frontend during rolling release, and test unregister/recovery.
- **Explicit non-scope:** Forced reload, API/auth caching, offline writes/sync, background mutation queue, shared V3 worker/assets, or production release.
- **Expected repository impact:** V4 frontend worker/manifest/build/tests and cache-policy docs; no root V3 worker changes.
- **Security:** Never cache authenticated JSON, cookies, callbacks, transfer URLs, or secrets; restrict scope to V4 origin/path; cache keys do not mix users.
- **Data/migration:** Cached static versions are disposable; no authoritative library data in worker storage.
- **Cost:** Static cache reduces usage; no new AWS service/fixed charge. Measure artifact/request effects.
- **Required automated tests:** Worker unit/build tests; browser E2E install/upgrade/old-cache cleanup/offline-static/API-bypass/logout; assert no API/auth/presigned response in Cache Storage; V3/V4 scope isolation.
- **Manual/operational verification:** Browser Application-panel inspection across two deployed dev revisions and an interrupted update.
- **Acceptance criteria:** Existing tab is not forcibly reloaded; user can accept a controlled update; API/auth/transfer traffic is never served from worker cache; previous compatible bundle remains usable during deployment; V3 worker scope cannot overlap.
- **Completion evidence:** Two-version E2E results, cache/storage screenshots if useful, response traces, built sizes, cost note, commit/deployed SHAs.
- **Stop/escalate:** Stop if reliable isolation requires modifying V3 worker, if rollback cannot serve a compatible client, or if any authenticated response can enter Cache Storage.

### WP-026 — Edge security and rolling-client qualification

- **Objective:** Qualify CloudFront/S3/API headers, cache behavior, cross-origin exceptions, and one-prior-client compatibility as a complete delivery boundary.
- **Traceability:** ADR-005/013/014/016/021/024; architecture §§16–17, 20.1, 21.6, 23.1–23.3; EDGE-001–014, API-002/008/016, TEST-002/003/006; T-01/T-03/T-12/T-15–T-17/T-21, C-01/C-02/C-04/C-07/C-12/C-13/C-16/C-20.
- **Dependencies:** WP-007, WP-016, WP-023–WP-025. AWS dev and browser access required.
- **Scope:** Finalize explicit CloudFront behaviors/cache policies; custom CSP and security headers; narrow API CORS; SPA fallback that cannot rewrite `/api/*`; prove direct API parity; allow only intentional Cognito navigation and presigned S3 origins; deploy current and immediately prior compatible client fixtures and exercise update-required semantics without forced reload.
- **Explicit non-scope:** WAF, Lambda@Edge/CloudFront Functions, custom CloudWatch dashboard, API caching, Netlify headers/transforms, or support beyond approved compatibility window.
- **Expected repository impact:** CDK edge policies/assertions, browser/security/contract tests, compatibility fixtures/docs; no V3 changes.
- **Security:** Deny framing where approved, strict CSP, nosniff/referrer/permissions controls, credentialed CORS only exact origin/method/header set, no caching of dynamic/auth material.
- **Data/migration:** None; compatibility concerns API/client contract versions only.
- **Cost:** No new service beyond CloudFront policies; traffic remains usage-driven. Revalidate only if asset/request measurements exceed model assumptions.
- **Required automated tests:** Header/CSP scanner, CORS preflight allow/deny matrix, cache hit/age rules, SPA/API routing, direct execute-api negatives, current/prior client browser E2E, unsupported client `409` update-required, worker cache exclusion.
- **Manual/operational verification:** Inspect live response headers/cache keys and real cross-origin Cognito/presigned flows in dev.
- **Acceptance criteria:** Static assets cache only as declared; HTML update policy is explicit; API/auth responses never cache; hostile origins/methods/headers fail CORS and still cannot bypass authorization; prior client completes supported workflows; older unsupported client receives approved update-required response without forced reload.
- **Completion evidence:** Header/cache/CORS matrix, two-client E2E results, live response captures, CDK diff, cost note, commit/deployed SHAs.
- **Stop/escalate:** Stop if CSP needs unsafe exceptions beyond approved design, API safety depends on CloudFront, or rolling compatibility cannot be honored without redesign.

## Milestone 5 packages — Portability and generation workflows

### WP-027 — Asynchronous operation resource and worker dispatch

- **Objective:** Establish owned, observable, retry-safe asynchronous Library Operations without adding an orchestration platform.
- **Traceability:** ADR-008/011/012/018/020/022/025; architecture §§13.3–13.5, 14.1–14.2, 19.5; OP-001–010/012, DATA-011/012/017/018, API-006/009/014/015, AZ-003/004; T-07/T-08/T-11/T-18/T-25, C-05/C-08/C-11/C-14/C-21/C-24.
- **Dependencies:** WP-013, WP-016–WP-018, WP-022. AWS dev access required.
- **Scope:** Implement server-generated Operation items and authenticated create/status APIs; states `QUEUED/RUNNING/SUCCEEDED/FAILED`; never hold the API request open for long work; atomically combine command idempotency with operation creation, directly invoke a dedicated Library Operations Lambda asynchronously, and return `202` with operation ID/status URL; use a bounded non-secret envelope; worker claims/retries idempotently, owns progress/result/error updates, and emits failed invocations after retries to the approved failure destination/SQS failure queue; owner-only status polling with reasonable client backoff and bounded retention.
- **Explicit non-scope:** SQS as primary dispatcher, Step Functions, ECS, WebSockets/push, arbitrary jobs, business-specific import/export/delete logic, or production deployment.
- **Expected repository impact:** CDK Lambda/failure-queue/IAM resources, operation API/worker framework, OpenAPI, integration tests/docs; no V3 changes.
- **Security:** Operation owner derives from session; envelope contains identifiers only; worker re-reads authoritative state; failure payload/queue/logs exclude secrets/presigned URLs/user content; ADMIN has no content-browsing shortcut.
- **Data/migration:** Operation transitions are conditional/monotonic; duplicate invocation does not duplicate logical work; expiry/TTL is cleanup; failed queue retention/redrive procedure explicit.
- **Cost:** Adds a dedicated Lambda, async invocation usage, failure-destination SQS queue, DynamoDB/API usage, and logs. These usage-driven components are approved/model-compatible; record retention and revalidate model at WP-040.
- **Required automated tests:** State-machine/unit; OpenAPI; real-AWS async invocation, duplicate/lost-response retry, concurrent claim, crash/retry, terminal-state immutability, owner/non-owner polling, failure-destination delivery/redaction, IAM negatives, bounded envelope/payload.
- **Manual/operational verification:** Inspect one successful and one forced-failure operation plus SQS/log evidence; verify polling UX contract.
- **Acceptance criteria:** Accepted long-running command promptly returns `202` with owned operation ID/status URL; state progresses only through allowed states; duplicate same command returns original operation; duplicate worker invocation has one logical effect; failure after retries is durable/observable; owner polling backs off reasonably; no primary queue, Step Functions, or ECS exists.
- **Completion evidence:** Operation transition matrix, async/failure run IDs and logs, queue/resource settings, test counts, cost delta, commit/deployed SHA.
- **Stop/escalate:** Stop if direct async Lambda cannot meet durability/retry/bounded-work requirements, failure payload cannot be made safe, or orchestration beyond approved services becomes necessary.

### WP-028 — Private transfer bucket and presigned transfer controls

- **Objective:** Provide temporary, owner-bound import/upload and export/download transfer capability satisfying TB-10.
- **Traceability:** ADR-005/008/013/014/018/020; architecture §§14.2–14.3, 16.8, 20.1–20.2; MIG-001–003/016/017, OP-010/011, EDGE-004/011/014, PRIV-002/006; T-05/T-10/T-19/T-22, C-04/C-09/C-13/C-20/C-23.
- **Dependencies:** WP-013, WP-016, WP-017, WP-027. AWS dev access required.
- **Scope:** Provision private temporary S3 transfer bucket with public blocks, default encryption, about-24-hour lifecycle expiry, constrained CORS, non-guessable owner/operation object keys, object-size/content-type/checksum metadata rules; APIs issue short-lived single-purpose presigned PUT/GET only after authorization; worker validates exact bucket/key/owner/operation, metadata, actual size, type, and checksum before parsing; cleanup and replay rules.
- **Explicit non-scope:** Static hosting bucket reuse, permanent backup/archive, public objects, browser AWS credentials, multipart/unbounded upload, or export/import business transformation.
- **Expected repository impact:** CDK S3/IAM/lifecycle, transfer API/service, OpenAPI, security/integration tests/docs; no V3 changes.
- **Security:** Least-privilege prefixes, HTTPS, short expiry, no signed URL logging, no caller-selected bucket/key, post-upload validation, narrow explicit CORS for V4 origin/method/headers.
- **Data/migration:** Objects are temporary staging only; retention/deletion and abandoned-object behavior explicit; operation ownership is authoritative.
- **Cost:** Adds usage-driven S3 storage/requests/data transfer, already in Personal model. Revalidate object-size, retention, request, and egress assumptions; no fixed charge.
- **Required automated tests:** CDK public-access/encryption/lifecycle/IAM assertions; real S3 PUT/GET happy paths; expired/tampered/cross-owner/key/type/size/checksum/CORS negatives; log-redaction; cleanup/lifecycle configuration; browser cross-origin upload/download.
- **Manual/operational verification:** Inspect bucket policy, object metadata/expiry, browser CORS, and absence of signed values in logs.
- **Acceptance criteria:** Only approved owner/operation gets a short-lived URL for exact key/action; worker rejects every TB-10 mismatch before parsing; objects are private/encrypted/expiring; URLs are absent from normal logs; static and transfer buckets are distinct.
- **Completion evidence:** TB-10 control matrix/results, policy/lifecycle evidence, browser trace redacted, test counts, measured storage/transfer and cost delta, commit/deployed SHA.
- **Stop/escalate:** Stop if ownership cannot be revalidated after upload, safe bounds exceed Lambda/API limits, or bucket policy requires public/broad access.

### WP-029 — Coherent asynchronous export

- **Objective:** Export a complete, logical, versioned library snapshot without exposing table layout or mixed generations.
- **Traceability:** ADR-004/008/011/012/018/020/025; architecture §§13.2–13.5, 14.2/14.7, 16.3; MIG-001/002/011–013/016/017, OP-001–012, PRIV-001/006; T-05–T-08/T-10/T-11, C-05/C-06/C-09/C-11/C-14/C-17/C-18.
- **Dependencies:** WP-019, WP-027, WP-028. AWS dev access required.
- **Scope:** Define V4 logical export schema/version metadata; create idempotent export operation; use coherent snapshot iterator/double CONTROL validation; serialize only user library/account portability fields authorized by contract, preserving immutable IDs/relationships; write bounded checksum-bearing object; expose short-lived owned download; retry or fail cleanly on generation change.
- **Explicit non-scope:** DynamoDB backup format, sessions/auth transactions/IdentityMap export, email delivery, permanent export retention, or import behavior.
- **Expected repository impact:** Export domain/worker/contract, fixtures, OpenAPI, integration/browser tests/docs; no V3 changes.
- **Security:** Owner-only initiation/status/download; no credentials/internal keys/security records; safe filename/content type; signed URLs redacted.
- **Data/migration:** Format is logical/versioned and table-independent; output comes from exactly one active generation/revision; IDs and references preserved.
- **Cost:** Lambda/DynamoDB/S3/egress usage is modeled; measure upper-bound size/duration/capacity and revalidate at WP-040.
- **Required automated tests:** Schema/golden fixture; real-AWS multi-page export during concurrent ordinary write/generation activation; checksum/size; duplicate request/worker; cross-owner download/status; transfer expiry; browser download; no-internal-field assertion.
- **Manual/operational verification:** Inspect a synthetic export semantically and verify operation/log/correlation trail.
- **Acceptance criteria:** Export validates against declared format, includes one coherent generation, preserves IDs/relationships, excludes security/internal storage data, and duplicate retry returns same logical operation/result; a changed generation cannot produce mixed output.
- **Completion evidence:** Export schema/version/digest, fixture diff, concurrency/results, size/duration/capacity/egress cost, redacted logs, commit/deployed SHA.
- **Stop/escalate:** Stop if coherence cannot be maintained within bounded retries/time or if required portability data conflicts with privacy/minimization rules.

### WP-030 — Native V4 import: validate, merge, and replace

- **Objective:** Import a native supported logical export through an owned, idempotent generation workflow with explicit merge/replace semantics.
- **Traceability:** ADR-004/008/011/012/018/020/025; architecture §§13.3–13.5, 14.2–14.7; MIG-001–011/014–018, OP-001–012, DATA-003/005/007/010/013/014; T-05–T-11/T-19, C-05/C-06/C-09/C-11/C-14/C-17/C-18/C-23.
- **Dependencies:** WP-015, WP-017–WP-019, WP-027–WP-029. AWS dev access required.
- **Scope:** Accept an uploaded object reference plus explicit `replace` or `merge`; require deliberate destructive confirmation for replace; perform TB-10 and full schema/reference/invariant validation before writes; acquire writer fence; for replace stage a complete new generation; for merge match immutable IDs and require the declared `keep-current` or `use-imported` strategy for same-ID conflicts, then stage the complete resulting generation; conditionally activate and advance revision; keep the prior generation for about 24 hours for cleanup/recovery; expose operation progress/errors.
- **Explicit non-scope:** V3 schema migration, partial/best-effort import, email/name identity matching, direct writes into active generation, Step Functions/ECS, or public files.
- **Expected repository impact:** Import domain/worker/contracts, fixtures, OpenAPI, real-AWS/security tests/docs; no V3 changes.
- **Security:** Owner and object binding are revalidated; no owner/role/security-record import; parser is bounded and untrusted; error detail does not echo sensitive contents.
- **Data/migration:** Preserve valid immutable IDs; reject duplicate/dangling IDs and invalid default/name relationships; merge conflicts follow the published deterministic strategy; activation is all-or-nothing.
- **Cost:** Lambda/DynamoDB transaction/S3/log usage is modeled; measure write amplification, staged-data retention, and upper workload for WP-040 cost revalidation.
- **Required automated tests:** Parser/domain/fuzz; native golden round trip; replace/merge/conflict fixtures; malformed/oversized/reference/duplicate/default/name/version negatives; real-DynamoDB fence/lease/stale activation/crash/retry/idempotency/concurrent ordinary write; cross-owner object/operation; cleanup safety.
- **Manual/operational verification:** Inspect staged/active data around injected failures and review a synthetic merge conflict report.
- **Acceptance criteria:** Invalid input changes no active data; successful replace/merge activates one complete valid generation; stale operation cannot activate; same idempotency key cannot create two logical imports; old active generation remains recoverable until policy cleanup; all IDs/relationships obey contract.
- **Completion evidence:** Fixture/result matrix, generation transition evidence, test/fuzz counts, duration/capacity/storage/cost, redacted logs, commit/deployed SHA.
- **Stop/escalate:** Stop if full validation/activation cannot be bounded within approved Lambda/DynamoDB constraints, conflict rules are architecturally ambiguous, or atomic visibility fails.

### WP-031 — Oversized Bookshelf delete/reassign operation

- **Objective:** Complete structural shelf deletion above the synchronous transaction threshold using the same generation protocol.
- **Traceability:** ADR-004/008/012/018/020/025; architecture §§6.2, 13.3–13.5, 14.1; DOM-002–007, DATA-003/005–007/010/013/014, OP-001–010/012, API-006/009–015; T-06–T-09/T-11, C-05/C-06/C-11/C-14/C-17/C-18.
- **Dependencies:** WP-021, WP-027, WP-030. AWS dev access required.
- **Scope:** Route over-threshold delete to idempotent Operation; revalidate source/replacement/default and revisions; fence writer; construct complete generation with every affected Book reassigned and shelf removed; conditionally activate; expose progress/result/failure and safe retry; prove boundary parity with the small path.
- **Explicit non-scope:** Changing threshold ad hoc, partial batch updates, primary SQS dispatch, Step Functions/ECS, or unrelated bulk edit features.
- **Expected repository impact:** Operation command/worker logic, OpenAPI completion, real-AWS concurrency/boundary tests/docs; no V3 changes.
- **Security:** Owner-bound operation; target references validated server-side; no partial visibility; worker authority limited to owned operation context.
- **Data/migration:** Book IDs preserved; default remains; source removed exactly once; complete generation or no visible change.
- **Cost:** Generation copy/write amplification can be significant but usage-driven; benchmark upper supported size and revalidate Personal assumptions at WP-040.
- **Required automated tests:** At/below/above threshold parity; maximum supported library; duplicate/lost-response; stale source/replacement revision; ordinary write/fence race; lease expiry/takeover; worker crash; cross-owner targets; final invariants/coherent reads.
- **Manual/operational verification:** Review one threshold-boundary operation and capacity/duration metrics.
- **Acceptance criteria:** Small path remains one transaction; oversized path returns owned operation; successful operation atomically reveals all reassignments/removal; failed/stale operation reveals none; retry cannot duplicate logical change; default/unique-name invariants remain true.
- **Completion evidence:** Threshold/boundary results, generation evidence, duration/capacity/cost, operation logs/status, commit/deployed SHA.
- **Stop/escalate:** Stop if maximum approved workload cannot complete with safe Lambda timeout margin or generation cost materially changes the Personal posture.

### WP-032 — Persisted-library schema migration framework

- **Objective:** Make data-schema upgrades explicit, owned, generation-based operations rather than ad hoc request-time rewrites.
- **Traceability:** ADR-004/008/012/018/020/025; architecture §§12.1, 13.3–13.5, 14.6; DATA-003/005/010/013/014, API-015/016, OP-001–010/012, MIG-013–015; T-06–T-08/T-11, C-05/C-06/C-11/C-14/C-17/C-18.
- **Dependencies:** WP-018, WP-027, WP-030. AWS dev access required.
- **Scope:** Define supported persisted schema versions and compatibility check; return update-required for unsupported server/client combinations; add idempotent migration Operation that validates current schema, fences, transforms into a fully validated staged generation, conditionally activates, and records source/target version; provide fixture-based upgrade and failure recovery.
- **Explicit non-scope:** V3 export parsing (WP-041/WP-042), lazy per-item migration, table replacement, dual writes, or support for unspecified future schemas.
- **Expected repository impact:** Migration registry/worker/contracts/fixtures/tests/docs; no V3 changes.
- **Security:** Owner-only migration; schema/version client input is advisory only; bounded parser/transform; stale worker cannot activate.
- **Data/migration:** Immutable IDs/relationships retained unless a future approved migration explicitly says otherwise; old generation retained through recovery window; no partial activation.
- **Cost:** Generation read/write/storage/Lambda usage is modeled but version-dependent; record per-fixture amplification and require WP-040 revalidation.
- **Required automated tests:** Version matrix/golden fixtures; unsupported/newer/invalid versions; idempotency; crash/retry/lease takeover; concurrent ordinary write; coherent post-upgrade export/read; rollback-generation preservation; maximum-size benchmark input.
- **Manual/operational verification:** Review before/after logical diff and operation audit trail for a synthetic upgrade.
- **Acceptance criteria:** Supported migration produces exactly one valid active target version; unsupported version returns approved error without mutation; failure leaves source active; retry is idempotent; IDs/relationships and one-default invariant remain valid.
- **Completion evidence:** Supported-version matrix, fixture diffs/digests, concurrency/test results, capacity/duration/cost, commit/deployed SHA.
- **Stop/escalate:** Stop if any mandatory transformation is ambiguous/lossy beyond approved rules or cannot meet generation atomicity and Lambda bounds.

## Milestone 6 packages — Account administration and lifecycle

### WP-033 — Invitation and account administration API

- **Objective:** Replace dev-seeded invitations with audited, least-privilege ADMIN lifecycle commands while keeping content private.
- **Traceability:** ADR-003/008/011/015/019/023; architecture §§8.2, 10, 11.4, 14.1, 15, 20.2–20.3; AUTH-009/010/017–019, AZ-005–008, LIFE-001/004/009, PRIV-004/005, PUB-001; T-03/T-04/T-14/T-18/T-20, C-02/C-03/C-08/C-15/C-16/C-21.
- **Dependencies:** WP-011, WP-012, WP-016, WP-017. AWS dev access required.
- **Scope:** Implement server-enforced `registrationMode` values `INVITE_ONLY` and `CLOSED`; implement ADMIN-only invitation create/list/revoke and account metadata/status list/detail contracts; normalized invited email, bounded expiry/state, conditional single use, idempotent commands, audit metadata/correlation; expose only minimum metadata needed for administration; require fresh auth for sensitive role/invitation actions as specified; document and test a controlled, auditable ADMIN bootstrap/change procedure that never depends on signup order or email.
- **Explicit non-scope:** Public signup, bulk marketing/email, SES, reading/exporting another user's library, enable/disable/deletion commands, or client-assigned roles/user IDs.
- **Expected repository impact:** Backend admin domain/routes/repository, OpenAPI, minimal admin frontend if required for acceptance, security/E2E tests/docs; no V3 changes.
- **Security:** Server role from current session/account; ADMIN authorization on every request; CSRF/fresh auth/idempotency; non-sensitive audit records; invitation tokens/links (if any) never logged or broadly listed.
- **Data/migration:** Invitation lifecycle and normalized email semantics align with WP-011; consumed/revoked/expired records do not provision; TTL only cleans after authoritative status/expiry.
- **Cost:** Normal DynamoDB/API/Lambda/Cognito-email usage is modeled; record invitation retention and email usage assumptions.
- **Required automated tests:** Unit/contract; ADMIN/non-ADMIN/stale-role/security negatives; create/revoke/expire/consume races; duplicate idempotency; account-list minimization; CSRF/fresh-auth; log redaction; real Cognito invited-login E2E.
- **Manual/operational verification:** Review actual admin payloads/screens for privacy minimization and one invited-user flow.
- **Acceptance criteria:** Only current ADMIN can manage invitations/see minimal account metadata; ADMIN cannot browse library content; revoked/expired/duplicate invitation cannot provision; role/email/userId authority cannot come from client; `INVITE_ONLY` is server-enforced and `CLOSED` blocks registration/invitations without disabling existing-user sign-in; public signup remains disabled.
- **Completion evidence:** Permission/privacy matrix, race/E2E results, representative redacted audit/log entries, cost note, commit/deployed SHA.
- **Stop/escalate:** Stop if administration requires library-content access, public signup, SES, or an unresolved rule for multiple identities/email reuse.

### WP-034 — Disable, enable, and session invalidation

- **Objective:** Make account access state immediately authoritative in ShelfState, with Cognito disablement as defense in depth.
- **Traceability:** ADR-003/008/015/019/023; architecture §§10, 11.2–11.4, 15.1; AUTH-013–019, AZ-005–008, LIFE-002/003/008/009; T-01/T-03/T-04/T-14/T-18, C-01–C-03/C-05/C-08/C-15/C-21.
- **Dependencies:** WP-012, WP-013, WP-033. AWS dev access required.
- **Scope:** Implement ADMIN disable/enable commands with idempotency and fresh auth; conditionally update Account state/sessionVersion; invalidate all application sessions; perform/repair Cognito disable/enable as defense-in-depth side effect; preserve audit trail and reconcile partial external failure without granting access.
- **Explicit non-scope:** Account deletion, role redesign, library mutation/deletion, automatic email notification, or reliance on Cognito state alone.
- **Expected repository impact:** Backend lifecycle services/routes/worker-retry if needed, OpenAPI/admin UI tests/docs; no V3 changes.
- **Security:** Application Account state is checked on each authorization; fail closed if Cognito side effect fails; prevent accidental last-admin policy only if explicitly required by approved rules; no content access.
- **Data/migration:** Disable preserves library and identity mapping; enable does not create a new identity/userId; sessionVersion monotonically invalidates old sessions.
- **Cost:** Cognito admin calls plus ordinary API/Lambda/DynamoDB usage are usage-driven and modeled; no new service/fixed charge.
- **Required automated tests:** Unit/contract; ADMIN/fresh-auth/CSRF negatives; disable-vs-request race; global session invalidation; repeated command; Cognito call failure/reconciliation; enabled/disabled login E2E; non-disclosing responses.
- **Manual/operational verification:** Verify dev Cognito status and that old browser session remains unusable after re-enable.
- **Acceptance criteria:** Disable immediately prevents existing/new application access regardless of Cognito lag; all prior sessions remain invalid after enable; enable restores eligible login to same userId; commands are idempotent/audited; ADMIN gains no library read permission.
- **Completion evidence:** State/session transition matrix, Cognito/application evidence, E2E/results, redacted audit/logs, cost note, commit/deployed SHA.
- **Stop/escalate:** Stop if external Cognito failure can leave application access enabled or identity continuity after re-enable is ambiguous.

### WP-035 — Pending deletion, grace period, cancellation, and schedule

- **Objective:** Give the account owner a fresh-authenticated deletion workflow with approximately seven days to cancel before permanent deletion.
- **Traceability:** ADR-003/008/009/015/019/022/023; architecture §§11.3–11.4, 15.2, 20.2–20.3; AUTH-016–018, LIFE-004–008, PRIV-004/005/007, API-006/009; T-03/T-04/T-18/T-20/T-23, C-02/C-03/C-08/C-15/C-16/C-21/C-23.
- **Dependencies:** WP-012, WP-016, WP-017, WP-034. AWS dev access required.
- **Scope:** Implement owner delete-request and cancel commands; require fresh auth, CSRF, explicit confirmation and idempotency; atomically enter `PENDING_DELETION`, advance sessionVersion, invalidate sessions, and create an EventBridge Scheduler one-time schedule for about seven days; issue a narrowly scoped non-secret target payload; cancel/neutralize schedule on valid cancellation; re-login/cancel rules explicit.
- **Explicit non-scope:** Immediate permanent deletion, generic scheduler orchestration, public signup, email reminders/SES, or ADMIN reading user content.
- **Expected repository impact:** CDK Scheduler role/group, lifecycle API/services, OpenAPI/frontend confirmation flow, tests/runbook/docs; no V3 changes.
- **Security:** Fresh auth and deliberate confirmation; owner-only command; schedule target uses separate service principal and identifiers only; application state denies normal access while pending; no signed URLs/content in payload/log.
- **Data/migration:** Deadline/state/schedule identifier are durable and conditionally updated; cancellation cannot resurrect retired/deleted identity; expired schedule is not itself deletion authority without revalidation.
- **Cost:** Adds EventBridge Scheduler invocations/schedules plus normal usage, included as usage-driven lifecycle cost; revalidate current quotas/pricing and schedule-retention behavior.
- **Required automated tests:** State/contract; missing/stale fresh auth/CSRF; duplicate request; cancel races with target invocation; session invalidation; wrong owner; schedule payload/IAM/CDK assertions; real Scheduler dev execution with shortened synthetic deadline; failed schedule create/cleanup recovery.
- **Manual/operational verification:** Inspect one dev schedule/role and deletion/cancel browser flow; verify old sessions remain invalid.
- **Acceptance criteria:** Valid request enters pending state once, invalidates all prior sessions, and schedules one target near the approved grace deadline; ordinary access is denied while pending; timely cancel returns same identity/account to allowed state per contract and old sessions stay invalid; schedule alone cannot bypass target revalidation.
- **Completion evidence:** Transition/race matrix, schedule and IAM evidence, browser E2E/results, price/quota check, cost delta, redacted logs, commit/deployed SHA.
- **Stop/escalate:** Stop if Scheduler cannot deliver with required security/reliability, grace/cancel semantics are ambiguous, or target permissions collapse human ADMIN and deletion authority.

### WP-036 — Permanent deletion and identity retirement

- **Objective:** Permanently delete eligible account/library/session/transfer data after the grace period while preventing automatic identity resurrection.
- **Traceability:** ADR-003/004/008/009/015/018/019/022/023/025; architecture §§10.2, 11.4, 12.7, 14.1, 15.2, 20.2–20.3; AUTH-015–019, AZ-006–008, DATA-016–018, LIFE-005–011, PRIV-001/004/005/007; T-04/T-05/T-08/T-14/T-18–T-20/T-23, C-03/C-05/C-08/C-09/C-11/C-15/C-17/C-21/C-23.
- **Dependencies:** WP-014, WP-027, WP-028, WP-035. AWS dev access required.
- **Scope:** Implement dedicated lifecycle Lambda/service-principal target; strongly re-read target Account/deadline/version/state; idempotently mark deletion execution; delete owned Library partitions/generations/operations/idempotency records, sessions/auth transactions, transfer objects, and minimized account data in bounded resumable phases; disable/delete Cognito identity as approved; retain a minimal retired IdentityMap/tombstone sufficient to prevent automatic email/subject resurrection; terminal audit without content.
- **Explicit non-scope:** Human ADMIN execution authority, immediate owner delete, deleting backups outside retention policy, global scans, public signup, or reconstructing identity automatically.
- **Expected repository impact:** CDK lifecycle Lambda/IAM/Scheduler target, deletion state machine, integration/security tests, runbook/privacy docs; no V3 changes.
- **Security:** Service principal has deletion-only prefixes/actions and no general read/list/content browsing; every invocation revalidates target state; arbitrary userId/prefix is rejected; payload/logs contain no content/secrets.
- **Data/migration:** Deletion is retry-safe/resumable; target state is monotonic; backup copies expire under recovery retention; the minimal retired IdentityMap marker is not a library sync tombstone and its retention is documented; later same-email registration, if newly invited, receives a new userId and empty library unless an explicit authorized recovery/import occurs.
- **Cost:** Lifecycle Lambda, DynamoDB/S3/Cognito operations/logs are usage-driven and modeled; worst-case deletion and tombstone retention must be measured/revalidated.
- **Required automated tests:** Unit/state-machine; real-AWS scheduled target early/wrong-version/canceled/duplicate/concurrent invocation; large multi-page owned dataset; IAM negatives proving no arbitrary reads or ADMIN invoke; partial failures/resume; Cognito failure; transfer/session cleanup; no cross-owner deletion; identity re-registration denial.
- **Manual/operational verification:** Inspect a fully synthetic deletion, residual records/objects, Cognito state, CloudTrail, and minimal tombstone; never use production data.
- **Acceptance criteria:** Only eligible pending account at/after deadline is deleted; canceled/wrong/early target changes nothing; retries converge; all in-scope live data is removed without harming another owner; service role cannot browse library; former identity/email cannot automatically reclaim retired userId/data.
- **Completion evidence:** Deletion inventory and before/after counts, IAM denial/race/failure results, CloudTrail/redacted logs, duration/capacity/cost, residual-retention statement, commit/deployed SHA.
- **Stop/escalate:** Stop if target-state revalidation cannot prevent stale deletion, least-privilege deletion requires general content browse, or identity retirement rules cannot prevent resurrection.

## Milestone 7 packages — Operational and recovery hardening

### WP-037 — Structured observability, alarms, notifications, and budgets

- **Objective:** Make the system supportable with finite-retention, privacy-safe signals and a deliberately small alert set.
- **Traceability:** ADR-007/008/010/014/021/022; architecture §§18–19, 23–24; OPS-009–012/014, OP-010/012, COST-001/005, PRIV-002/003; T-05/T-11/T-13/T-18/T-20/T-22, C-07–C-09/C-16/C-21/C-23.
- **Dependencies:** WP-003, WP-006, WP-027, WP-033–WP-036. AWS dev access and notification recipient confirmation required.
- **Scope:** Standardize structured JSON logs/correlation IDs across edge/API/workers; set routine retention to about 30 days in production and 7–14 days in non-production; add redaction tests; configure approximately five high-value alarms covering availability/errors, auth abuse/failures, async terminal/failure-queue health, lifecycle failures, and backup/critical resource health as architecture permits; one SNS email path; AWS Budgets thresholds that never delete resources; document use of built-in service dashboards/metrics and alarm runbooks.
- **Explicit non-scope:** Custom CloudWatch dashboard, X-Ray, third-party observability/paging, per-feature noisy alarms, analytics/user-behavior tracking, or sensitive payload logging.
- **Expected repository impact:** Shared logging modules, CDK logs/metrics/alarms/SNS/Budget resources, runbooks/tests/docs; no V3 changes.
- **Security:** Allowlisted log fields; hash/redact identifiers where appropriate; no tokens, cookies, presigned URLs, invitation material, raw import/export/library content; alert messages contain operational metadata only.
- **Data/migration:** Log/alarm retention documented; logs are not backup or audit-content store; deletion/privacy boundary acknowledged.
- **Cost:** Log ingestion/storage, alarms, SNS, and Budgets may add usage-driven/minor recurring cost and are included in approved posture assumptions; estimate actual finite retention. A custom dashboard remains deferred until after the first billing cycle.
- **Required automated tests:** Log schema/correlation/redaction; representative failure metric/alarm synthesis; CDK count/retention assertions; alarm action and missing-data policy; synthetic alarm-to-SNS test; Budget configuration assertions; absence of dashboard/X-Ray.
- **Manual/operational verification:** Confirm SNS subscription, provoke/clear each safe dev alarm, inspect built-in dashboards and runbook links.
- **Acceptance criteria:** Requests/operations correlate end to end without sensitive data; log groups have finite retention; about five actionable alarms notify verified recipient and have owners/actions; budget alerts exist; no custom dashboard or X-Ray resource is deployed.
- **Completion evidence:** Alarm inventory/rationale, notification test, sample redacted log chain, retention and monthly estimate, CDK diff, commit/deployed SHA.
- **Stop/escalate:** Stop if useful detection requires logging sensitive content, alert count materially exceeds approved posture without review, or observability cost changes the Personal model.

### WP-038 — Privacy, retention, and user-control baseline

- **Objective:** Turn the approved privacy boundary into enforceable classifications, retention rules, notice, and verified export/delete controls.
- **Traceability:** ADR-003/008/009/013/015/019/022/023; architecture §§15, 19.4, 22; PRIV-001–007, LIFE-004–011, MIG-001/002, PUB-001/004; T-04/T-05/T-10/T-14/T-18–T-20/T-23, C-03/C-08/C-09/C-15/C-21/C-23.
- **Dependencies:** WP-028–WP-030, WP-033–WP-037. AWS dev/browser access required for enforcement proof.
- **Scope:** Maintain data inventory/classification and purpose/owner/retention table; enforce transfer/log/session/auth-transaction/invitation/operation/tombstone retention; publish V4 privacy notice before personal use; surface owner export/delete/cancel controls; document backup-deletion lag; validate ADMIN metadata-only boundary and support/recovery access procedure; establish periodic retention/access review.
- **Explicit non-scope:** Public signup, analytics/advertising, arbitrary admin content view, production-data copies to dev, legal promises beyond approved behavior, or immediate purge of locked backups.
- **Expected repository impact:** Privacy/retention docs, frontend notice/control links, CDK lifecycle/retention assertions, E2E/security tests; no V3 changes.
- **Security:** Data minimization by default; safe telemetry; least-privilege admin/recovery; export/delete requires owner/fresh auth as applicable; retention automation cannot cross owners.
- **Data/migration:** Each stored class has retention/deletion/recovery treatment; backups age out separately; identity tombstone minimum documented; synthetic non-prod only.
- **Cost:** Lifecycle expiration generally reduces cost; backup/log/tombstone retention is included but actual storage must feed WP-040 revalidation.
- **Required automated tests:** Retention configuration assertions; privacy-route/static-link check; export/delete browser E2E; ADMIN/recovery IAM and API negatives; no-production-fixture scan; log/transfer expiry tests where automatable.
- **Manual/operational verification:** Privacy/data inventory review and sampling of dev resources for retention/metadata-only access.
- **Acceptance criteria:** Every data class has purpose, sensitivity, access, retention and deletion rule; privacy notice accurately describes export/deletion/backup lag; user controls work; ADMIN cannot read library contents; non-prod suite contains no production data.
- **Completion evidence:** Dated inventory/notice review, retention/IAM/E2E results, residual-data statement, cost-storage update, commit/deployed SHA.
- **Stop/escalate:** Stop if a required operational role needs broad content access, a data class lacks enforceable retention, or notice cannot accurately describe approved deletion/recovery behavior.

### WP-039 — Backup isolation and restore foundation

- **Objective:** Protect stateful data with isolated backups and a recoverable, non-destructive restore path.
- **Traceability:** ADR-009/010/015/021/022; architecture §§20.3, 21.9, 23.1, 24; OPS-005–008/014, DATA-015/016, LIFE-009, PRIV-007, COST-005; T-14/T-18/T-20/T-22/T-23, C-08/C-09/C-16/C-21/C-23.
- **Dependencies:** WP-005, WP-006, WP-008, WP-014, WP-028. AWS dev access and separate recovery-role holder required.
- **Scope:** Enable/verify DynamoDB PITR for the full supported window, targeted at 35 days; configure weekly AWS Backup plan with approximately 90-day retention in isolated vault and Governance Vault Lock; scoped backup service role and distinct human recovery role; backup/restore notifications/health; restore only to separate table/bucket names; validate before any promotion; document Cognito configuration/user reconstruction and IdentityMap rebind process.
- **Explicit non-scope:** Multi-region, separate AWS accounts, production restore/promotion, direct restore over live table, permanent retention, custom dashboard, or backup browsing by routine ADMIN.
- **Expected repository impact:** CDK backup/vault/IAM resources, policy tests, recovery documentation and dev restore harness; no V3 changes.
- **Security:** Recovery role separation/MFA/temp credentials; Governance lock settings deliberate; restored data isolated and access-limited; CloudTrail records management actions.
- **Data/migration:** PITR plus weekly/90-day recovery layers; restore does not automatically become active; deletion/privacy backup lag documented; Cognito is reconstructed, not assumed fully backed up.
- **Cost:** AWS Backup storage/requests and restored copies introduce recurring/usage costs already estimated in Personal model; actual protected size and current pricing require revalidation before lock/deploy.
- **Required automated tests:** CDK PITR/plan/retention/vault-lock/IAM/deletion safeguards; policy simulations; backup selection; separate-name restore assertions; configuration export/validation scripts; negative routine-role access.
- **Manual/operational verification:** Create/observe a dev recovery point, execute isolated restore, validate counts/checksums/invariants, and exercise Cognito reconstruction steps with synthetic identities.
- **Acceptance criteria:** All approved state tables have PITR and weekly ~90-day locked backup coverage; routine operator/ADMIN cannot alter locked recovery points or read restored content; restore targets are separate; validation precedes documented promotion; Cognito recovery steps are executable.
- **Completion evidence:** Recovery point/restore IDs, redacted policies/CloudTrail, validation results, lock/retention settings, measured storage/cost, runbook version, commit/deployed SHA.
- **Stop/escalate:** Stop before Vault Lock if parameters/authority are uncertain, current backup cost materially differs, Cognito reconstruction cannot preserve identity ownership, or recovery separation cannot be enforced.

### WP-040 — Abuse limits, workload benchmark, and cost revalidation

- **Objective:** Prove bounded operation under the largest supported Personal workload and revalidate service limits/current non-promotional cost before migration.
- **Traceability:** ADR-007/008/010/011/012/014/021/022/025; architecture §§18.3, 19.4–19.5, 23–24, 27; API-011/012, OP-006/007/011, OPS-009–012, COST-001–005, TEST-005/008; T-03/T-05/T-10–T-13/T-18/T-22/T-25, C-02/C-07–C-09/C-16/C-19/C-21/C-23/C-24.
- **Dependencies:** WP-027–WP-032, WP-037–WP-039. AWS dev access required; current official AWS pricing/quota verification required at implementation time.
- **Scope:** Centralize request/body/collection/page/operation/concurrency/timeout limits and 429/503 behavior; reserve Lambda timeout safety margin; benchmark maximum supported library for coherent read/export/import/migration/oversized delete/deletion; inject retries/failures; measure duration, memory, request/capacity/storage/log/transfer; update Personal cost model using current pricing without free-tier assumptions; enumerate fixed versus usage costs per deployed resource and dev/prod posture.
- **Explicit non-scope:** Raising limits to arbitrary enterprise scale, WAF, Step Functions/ECS, provisioned capacity, load testing production, promotional credits/free tier, or optimization that changes architecture silently.
- **Expected repository impact:** Limit configuration/contracts, benchmark harness/fixtures, CI/manual non-prod gate, cost model/report and tests; no V3 changes.
- **Security:** Limits enforced server-side before expensive work where possible; per-owner concurrency; synthetic data only; benchmark credentials least-privilege; errors/logs bounded.
- **Data/migration:** Maximum supported counts/bytes and fixture characteristics become explicit compatibility constraints; benchmark cleanup is owner-scoped.
- **Cost:** This is the authoritative revalidation gate for all resource-bearing packages. Record fixed, usage-driven, already-modeled, delta, and sensitivity values; any material departure from approximately `$2.70/month` Personal baseline stops progression.
- **Required automated tests:** Boundary/off-by-one and bypass attempts; 429/503 contract; concurrent operation caps; timeout/cancellation/retry safety; repeatable benchmark assertions; cost inventory completeness check against synthesized resources; absence of excluded resources.
- **Manual/operational verification:** Run benchmark in dev, inspect service quotas/metrics/bill estimator/current official pricing, and review timeout margin and model with a human.
- **Acceptance criteria:** Every ingress/work unit has a documented enforced bound; upper workload completes with approved Lambda timeout/memory margin or fails before mutation with supported error; retries preserve correctness; synthesized resource inventory reconciles to cost sheet; updated non-promotional model remains acceptable.
- **Completion evidence:** Dataset definition, benchmark commands/results/metrics, quota/pricing source/date, resource-cost ledger, revised monthly estimate/sensitivities, test counts, commit/deployed SHA.
- **Stop/escalate:** Stop if upper workload lacks safe Lambda margin, needs a deferred service, bounds violate a mandatory requirement, or recurring cost materially changes the approved Personal posture.

## Milestone 8 packages — V3 migration and recovery qualification

### WP-041 — Frozen V3 schema-3 compatibility

- **Objective:** Prove mandatory migration of valid frozen V3.9 schema-3 exports into V4 without changing V3 or losing identity/relationships.
- **Traceability:** ADR-004/006/008/012/016/018/020/025; architecture §§4.2, 6.3, 7.2, 13.3–13.5, 14; `V3_EXPORT_COMPATIBILITY.md` §§1–6; MIG-001–018, DOM-001–007, ID-002–004, TEST-001/002/005; T-05–T-11/T-19, C-05/C-06/C-09/C-11/C-14/C-17–C-19/C-23.
- **Dependencies:** WP-030, WP-032, WP-040. AWS dev access required for end-to-end migration.
- **Scope:** Create immutable schema-3 fixtures from frozen `v3.9.0` and repository-produced edge cases; parse/version-check full export; validate ISO timestamps, enums, bounds, UUID uniqueness, one explicit default, unique trimmed case-insensitive shelf names, and all Book shelf references; ignore early schema-3 `bookIds` and UI-only `activeBookshelfId`; preserve valid IDs/timestamps/relationships; feed validated logical result into replace/merge generation workflows; emit approved diagnostics.
- **Explicit non-scope:** Altering V3 exporter/runtime, using `bookIds`, guessing corrupt data, schema-1/2 rules, non-UUID preservation, or automatic production migration.
- **Expected repository impact:** Versioned migration fixtures/manifest/digests, parser/normalizer, import integration/browser tests and docs; no V3 source/config changes.
- **Security:** Treat file as hostile; bound before/while parse; imported ownership/roles/generation/internal fields are ignored/rejected; owner/object revalidation; safe diagnostics/logging.
- **Data/migration:** Schema 3 is mandatory; preserve every valid legacy Book/Shelf ID and canonical `bookshelfId`; require exactly one explicit default; discard `bookIds`; never migrate `activeBookshelfId` as cloud authority.
- **Cost:** Uses existing import resources; fixture and upper-workload measurements must remain within WP-040 approved cost/time limits.
- **Required automated tests:** Golden fixtures from frozen code; export/import logical equality; early schema-3 `bookIds`; invalid/missing/multiple default, duplicate IDs/names, stale references, timestamps/enums/types/bounds; hostile JSON; replace/merge/idempotency/crash/concurrency; browser upload/status/result.
- **Manual/operational verification:** Generate/export a synthetic library using frozen V3.9 in isolation and compare semantic state after dev V4 import.
- **Acceptance criteria:** Every valid frozen schema-3 fixture imports with valid IDs, timestamps, default, and relationships preserved; `bookIds`/`activeBookshelfId` do not affect membership/authority; corrupt/unsupported input produces specified diagnostic and no active change; V3 tracked files remain byte-for-byte unchanged.
- **Completion evidence:** Fixture provenance/digests, before/after semantic diff, diagnostic matrix, test counts/results, capacity/duration/cost, V3 git diff proof, commit/deployed SHA.
- **Stop/escalate:** Stop if a valid frozen V3.9 export is rejected, required field interpretation is not covered by the compatibility contract, or preservation conflicts with V4 invariants.

### WP-042 — Deterministic V3 schema-1 and schema-2 migration

- **Objective:** Implement the approved narrower legacy conversions for schemas 1 and 2 without heuristic relationship recovery.
- **Traceability:** ADR-004/008/012/018/020/025; architecture §§6.3, 14.4–14.7; `V3_EXPORT_COMPATIBILITY.md` §§2–6; MIG-003–010/013–018, ID-002–004, TEST-005; T-05–T-11/T-19, C-05/C-06/C-09/C-11/C-14/C-17–C-19/C-23.
- **Dependencies:** WP-041. AWS dev access required for end-to-end fixtures.
- **Scope:** Add provenance-backed schema-1/2 fixtures from historical commits; apply common accepted-domain normalization; for schema 1 prefer valid canonical `bookshelfId`, otherwise use exact trimmed case-insensitive legacy shelf name or derived default and create one deterministic non-default shelf only as specified; normalize only `Poetry` to `poetry`; for schema 2 require valid canonical reference; derive/create exact historical `My Library` default; discard all `bookIds`/UI state; preserve valid UUIDs/timestamps; implement exact rejection codes.
- **Explicit non-scope:** Fuzzy matching; inference from title/author/ISBN/order/timestamps/`bookIds`; suffixing name collisions; repairing hand-edited ambiguity; changing the approved compatibility matrix; V3 runtime changes.
- **Expected repository impact:** Historical fixtures/manifest, migration registry transforms, unit/integration/browser tests/docs; no V3 changes.
- **Security:** Same hostile-input, bounds, ownership, object and logging controls as native/schema-3 import.
- **Data/migration:** Deterministic only: ambiguous default/relation, invalid IDs/timestamps/references, collisions and unsupported version reject without active mutation; accepted valid IDs/relationships are preserved.
- **Cost:** Existing import path; record schema conversion overhead and keep it within WP-040 gate.
- **Required automated tests:** Golden historical schemas; every compatibility-matrix branch and rejection code; ID-over-name precedence; missing/stale ID legacy-name outcomes; exact default derivation; `Poetry`; duplicate/collision/reference/timestamp failures; no-heuristic property cases; replace/merge/generation/idempotency.
- **Manual/operational verification:** Compare selected fixtures with the cited Git revisions and review before/after logical diffs.
- **Acceptance criteria:** Supported unambiguous schemas 1/2 convert exactly as the compatibility contract says; no relationship is inferred from forbidden fields; all rejection leaves active library unchanged; schema 1/2 output satisfies V4 one-default/canonical-reference invariants; V3 tracked files remain unchanged.
- **Completion evidence:** Commit-to-fixture provenance/digests, branch/rejection coverage matrix, semantic diffs, test/cost results, V3 diff proof, commit/deployed SHA.
- **Stop/escalate:** Stop on any historical fixture ambiguity not resolved by `V3_EXPORT_COMPATIBILITY.md`; do not invent migration heuristics.

### WP-043 — Recovery runbook and pre-launch recovery drill

- **Objective:** Prove the documented recovery path, including identity reconstruction, against isolated non-production resources before launch.
- **Traceability:** ADR-009/010/015/019/021/022/023; architecture §§21.7, 21.9, 24–25; OPS-005–008/014, LIFE-009–011, PRIV-007, TEST-006/007; T-14/T-18/T-20/T-22/T-23, C-08/C-09/C-15/C-16/C-21/C-23.
- **Dependencies:** WP-036, WP-039, WP-042. AWS dev access and separate recovery-role exercise required.
- **Scope:** Finalize incident/recovery runbook; simulate table loss/corruption using synthetic data; select PITR/weekly recovery point; restore to separate tables; validate item counts/checksums, CONTROL/generation/domain/identity/session invariants; reconstruct Cognito configuration and synthetic user, securely rebind approved IdentityMap; document controlled promotion/rollback decision without promoting over live dev; measure RPO/RTO; verify recovery access/audit and cleanup.
- **Explicit non-scope:** Destructive production drill, restore over an active table, multi-region/failover, routine ADMIN recovery authority, or claiming Cognito user-password recovery that AWS backup does not provide.
- **Expected repository impact:** Recovery runbook/checklists/validation tooling and drill report/tests; IaC corrections only within approved design; no V3 changes.
- **Security:** Separate MFA/temp recovery role; restored data isolated; no production data; CloudTrail evidence; credential reset/rebind is deliberate and prevents email-based takeover.
- **Data/migration:** Target baseline is approximately `RPO <= 15 minutes` through PITR and `RTO <= 4 hours`; backup retention/privacy lag explicit; promotion requires validated compatible schema/generation.
- **Cost:** Temporary restored tables/storage and Cognito/dev operations add short-lived usage cost; record and clean up approved drill resources, revalidating model impact.
- **Required automated tests:** Restore validation suite; schema/generation/reference checks; wrong/incomplete recovery point failure; identity rebind/tombstone negatives; IAM policy tests; release configuration comparison; cleanup target-scope tests.
- **Manual/operational verification:** Timed human runbook drill with handoffs, recovery-role login, restore/validation, synthetic authentication, decision checkpoint, and resource cleanup.
- **Acceptance criteria:** Drill restores a coherent isolated library/account state within targets or documents a blocking miss; validation catches corrupted/incomplete state before promotion; reconstructed synthetic identity maps only through approved rebind; routine ADMIN cannot perform recovery; all drill resources/accounting are recorded.
- **Completion evidence:** Dated drill report/timeline/RPO/RTO, recovery point and restored resource IDs, validation counts/digests, CloudTrail/IAM evidence, cost/cleanup record, runbook version, commit hash.
- **Stop/escalate:** Stop launch if targets are missed without accepted remediation, identity ownership cannot be safely reconstructed, validation cannot detect incoherence, or recovery authority is not isolated.

### WP-044 — Full non-production security and architecture qualification

- **Objective:** Re-run the architecture threat/control model and all system contracts as an independent pre-release evidence gate.
- **Traceability:** All ADRs; architecture §§20–27; all V4.0 requirement categories, especially AZ-001–008, TEST-001–008, GOV-005/006; threats T-01–T-25 and controls C-01–C-25.
- **Dependencies:** WP-026 and WP-033–WP-043. Complete dev environment and synthetic test identities/data required.
- **Scope:** Build a traceable threat/control/requirement test matrix; run unit/domain, OpenAPI, real-AWS integration, browser E2E, migration fixtures, concurrency/idempotency, IAM/policy, edge/CORS/CSP/cache, abuse/bounds, lifecycle, logging/privacy, backup/recovery and cost/resource-inventory suites; test direct API and CloudFront; inspect synthesized/deployed inventory for architecture exclusions; remediate defects without broadening design.
- **Explicit non-scope:** Production data/traffic, penetration testing authorization beyond owned dev system, new product features, waived critical controls, or adopting deferred services to make tests pass.
- **Expected repository impact:** Test orchestration/evidence report and scoped defect fixes; docs/OpenAPI traceability; no V3 changes.
- **Security:** Synthetic owners/roles, least-privilege temporary credentials, safe negative tests, no sensitive artifacts; each control has implementable verification evidence.
- **Data/migration:** All schema 1/2/3/native fixtures; no production data; cleanup owner-scoped; backup drill evidence included.
- **Cost:** Qualification traffic is usage-driven; reconcile actual bill/metrics and synthesized resources with WP-040 Personal model before exit.
- **Required automated tests:** Every architecture-sensitive test layer named above; coverage is risk-based, not a line-percentage substitute; deliberate negative cases for all T-01–T-25 where testable and procedural evidence where not.
- **Manual/operational verification:** Independent checklist review of procedural controls, account posture, alarm delivery, privacy notice, cost bill, recovery drill, release/rollback controls and deployed inventory.
- **Acceptance criteria:** Every mandatory requirement and C-01–C-25 has passing automated or explicit procedural evidence; no open critical/high architecture defect; all negative ownership/token/CSRF/concurrency/migration/lifecycle cases pass; no excluded/deferred resource exists; V3 regression/isolation passes; Personal cost remains approved.
- **Completion evidence:** Signed/datestamped matrix and report, exact suite counts/commands/run IDs, resource inventory/CDK diff, cost actual/model, open-risk list, root V3 regression, commit/deployed SHA.
- **Stop/escalate:** Stop on any mandatory requirement/control without evidence, architecture deviation, critical/high failure, production-data contamination, excluded resource, cost breach, or V3 isolation regression.

## Milestone 9 packages — Pre-production acceptance and deliberate release

### WP-045 — Release candidate, public-signup gate, and rollback rehearsal

- **Objective:** Produce an exact-revision release candidate and prove deployment/rollback while keeping public signup disabled and production untouched.
- **Traceability:** ADR-006/007/010/016/017/019/021/024; architecture §§21–23, 25–27; GOV-001/005/006, OPS-002–004/013/014, PUB-001–004, TEST-003/006–008, COST-001–005; T-12/T-13/T-16/T-17/T-20/T-21, C-07/C-12/C-13/C-16/C-20/C-22.
- **Dependencies:** WP-044. GitHub/AWS dev and protected-production-environment review access required; no production deploy authorization implied.
- **Scope:** Freeze exact commit/lockfile/OpenAPI/migration/asset digests; run clean CI and CDK synth/diff; verify stateful safeguards, backups, alarms, privacy notice, DNS/certificate and quotas; rehearse dev deploy of exact artifacts and rollback to recorded known-good revision; verify current/prior client; conduct the independent public-signup review across edge-abuse/WAF posture, Cognito protection, signup/recovery abuse, growth cost, email capacity, privacy/legal, monitoring, lifecycle, and incident readiness; treat any missing evidence as a decision to remain invite-only; test `registrationMode=CLOSED` without disrupting existing-user service and record launch mode `INVITE_ONLY`; prepare production checklist/change window without executing it.
- **Explicit non-scope:** Production deploy, public signup enablement, WAF/federation/SES, data migration of real users, automatic release on merge, or unreviewed fixes after candidate freeze.
- **Expected repository impact:** Release manifest/checklists/evidence and only release-blocking approved fixes; workflows/config/docs; no V3 changes.
- **Security:** Protected prod approval remains required; artifacts are SHA-bound; secrets preexist in managed stores only; rollback cannot delete/replace state; public registration path remains denied.
- **Data/migration:** Migration fixture/version matrix frozen; backup/recovery evidence current; synthetic data only in dev.
- **Cost:** Reconcile candidate resource inventory with current Personal model; estimate production activation and dual dev/prod window. Any revalidation failure blocks release.
- **Required automated tests:** Clean full WP-044 suite; artifact/SBOM-or-lock digest verification as approved; CDK diff guard; deploy/rollback smoke; old/current client; public signup denial; no-deferred-resource and V3-file/deploy-isolation tests.
- **Manual/operational verification:** Human review of exact production diff, change/rollback checklist, alarm recipient, backup/recovery status, pricing/cost, privacy notice, registration mode and release authority.
- **Acceptance criteria:** Candidate is reproducible and exact-SHA bound; dev rollback restores known-good client/API behavior without state loss; production diff has no unapproved deletion/replacement or excluded service; public signup remains disabled and readiness review records unmet/future conditions; all human gates are explicit and unsigned production action cannot run.
- **Completion evidence:** Release manifest/digests, CI/deploy/rollback run IDs, reviewed CDK diff, test counts, cost sheet, signup-gate decision, checklist approvals, candidate commit SHA.
- **Stop/escalate:** Stop if candidate is not reproducible, rollback fails, diff threatens state, any gate/evidence is stale, signup is enabled, cost changes materially, or implementation deviates from architecture.

### WP-046 — Deliberate production release and verification

- **Objective:** Under a new explicit human authorization only, deploy the approved exact revision, verify it, and retain a safe rollback path.
- **Traceability:** ADR-005–007/009/010/013/014/016/017/019/021/022/024; architecture §§17–19, 21–27; GOV-001/006, EDGE-001–014, OPS-001–014, PUB-001/002/004, TEST-003/006–008, COST-001–005; T-12–T-23, C-07–C-10/C-12/C-13/C-16/C-20–C-23.
- **Dependencies:** WP-045 plus separate written production-release authorization and completed approvals. AWS/GitHub production access required only through protected OIDC workflow.
- **Scope:** Reconfirm exact SHA/diff/backup/alarm/rollback/cost gates; deploy through protected production environment; run the focused non-destructive production smoke against a pre-authorized synthetic smoke account/data: HTTPS shell, routing/health, auth wiring, controlled login/read, service-worker lifecycle, critical assets, and direct API denial; perform no real-user or destructive production mutation; monitor high-value alarms/metrics; execute rollback if criteria fail; after the first full billing cycle compare actual spend and reconsider—but do not automatically add—a custom dashboard.
- **Explicit non-scope:** Authorization by this plan, public signup, V3 cutover/modification, production-user bulk migration without separate procedure, live-data destructive test, deferred services/features, or automatic dashboard creation.
- **Expected repository impact:** Release record/runbook evidence and narrowly scoped fixes only through a new reviewed candidate; no V3 changes.
- **Security:** Two-stage human/CI controls, temporary OIDC role, exact artifact, least-privilege smoke identity, immediate cleanup, no production secret/content in evidence.
- **Data/migration:** Stateful resources protected; restore point confirmed; synthetic smoke owner/data is isolated and pre-authorized; the smoke is read-only; no real V3 import unless separately authorized; rollback distinguishes code/config rollback from data restore.
- **Cost:** Activates production usage and any approved recurring components. Must match WP-045 ledger; first-billing-cycle actuals are compared with approximately `$2.70/month` Personal model without free-tier credit assumptions.
- **Required automated tests:** Predeploy immutable-candidate/full gate; read-only production smoke and negative auth/ownership/cache checks; deployed-template/artifact drift check; rollback verification; assertion that the smoke performed no write/destructive operation.
- **Manual/operational verification:** Human approves production diff; observes deployment/alarms; verifies certificate/DNS/privacy/support; makes go/no-go and rollback decision; reviews first bill and custom-dashboard reconsideration.
- **Acceptance criteria:** Separate authorization is recorded; exact approved SHA deploys through prod gate; read-only smoke/negative checks pass; no real-user or destructive production mutation occurs; no V3 behavior/deploy changes; backups/alarms/rollback remain ready; any failed criterion triggers documented rollback; public signup stays disabled.
- **Completion evidence:** Authorization reference, production workflow/deploy IDs, exact SHA/digests/CDK diff, smoke/negative results, alarm/log correlation, backup/rollback state, cleanup proof, cost estimate and first-bill follow-up record.
- **Stop/escalate:** Do not begin without separate authorization. Stop/rollback on artifact drift, failed smoke/security/backup/alarm check, unapproved stateful change, V3 impact, signup exposure, or cost deviation.

## F. Contract, resource, and cost ledgers

### F.1 Minimum `/api/v1` contract inventory

WP-016 owns the final method/path/schema choices and breaking-change review. The following inventory is the minimum surface to be represented; it is not permission to implement handlers early and does not introduce GraphQL or generalized RPC.

| Family | Minimum planned contract surface | Primary package |
|---|---|---|
| Health | `GET /api/v1/health` | WP-007/WP-016 |
| Login callback | login initiation and exact OAuth callback under `/api/v1/auth/*`; fresh-auth initiation/completion reuses the bound transaction pattern | WP-010/WP-012 |
| Session | current-session read, current logout, global logout/session-version invalidation | WP-012 |
| Library | coherent current-library read with generation/revision metadata | WP-019 |
| Books | collection create/list and item read/update/delete; move is an update of canonical `bookshelfId` or an explicit item command only if WP-016 shows CRUD would be misleading | WP-020 |
| Bookshelves | collection create/list and item read/update; structural delete/reassign is an explicit destructive workflow with replacement/default semantics | WP-021/WP-031 |
| Transfers | authorized import-upload URL creation and owned export-download result URL; browser uses the returned exact presigned S3 URL | WP-028 |
| Imports/exports | create owned asynchronous import/export resources with explicit replace/merge and confirmation semantics | WP-029/WP-030 |
| Operations | `GET /api/v1/operations/{operationId}` plus bounded owner list only if needed by the approved UI | WP-027 |
| Invitations | ADMIN create/list/revoke invitation resources | WP-033 |
| Account/session self-service | account metadata, export entry point, delete request, cancel deletion, logout/global logout | WP-012/WP-029/WP-035 |
| ADMIN account lifecycle | minimal account metadata/status plus enable/disable and approved role/bootstrap procedures | WP-033/WP-034 |
| Persisted migration | compatibility/readiness query if needed and owned migration command/operation | WP-032 |

Every normal API uses JSON, except redirects and direct presigned S3 transfer; unsupported media returns `415`. Infrastructure-generated responses may not use the ShelfState envelope; clients fall back safely by status. OpenAPI must identify authentication, CSRF, idempotency, revision/generation, payload bounds, success type, and every relevant 400/401/403/404/409/415/429/503 response for each operation, with `Retry-After` where meaningful.

### F.2 AWS resource and cost ledger

This table is the cross-package cost authority. “Fixed” means an expected incremental idle/monthly charge; “usage” includes requests, duration, bytes, storage, or MAU. Existing Route 53 hosted-zone/domain cost is a sunk cost in the approved architecture; if that assumption is false, WP-007 stops for revalidation. ACM public certificates, IAM, and GitHub OIDC have no expected incremental service charge. No package may rely on promotional/free-tier credits.

| WP | Resource/change eventually introduced | Expected fixed cost | Expected usage-driven cost | In approved Personal model? | Required revalidation |
|---|---|---:|---|---|---|
| WP-003 | CDK app; bootstrap artifacts only when authorized | `$0` before deploy | Small bootstrap S3/ECR storage if bootstrapped | Supporting-service reserve | Before first bootstrap/deploy |
| WP-005 | Human/recovery IAM; existing CloudTrail management-event evidence | `$0` expected | Existing audit storage only | Yes | If a new trail/storage/account restructure is proposed |
| WP-006 | GitHub OIDC and dev/prod deploy roles | `$0` | Bootstrap/artifact storage only | Yes | At first role/bootstrap deployment |
| WP-007 | Private static S3, CloudFront pay-as-you-go, HTTP API, health Lambda, Route 53 Alias, ACM | `$0` incremental under sunk hosted-zone assumption | Requests, transfer, storage, Lambda/API | Yes: Lambda/API/edge rows | Before dev deploy and again for production/dual-environment run-rate |
| WP-008 | Identity/Account and Session/Auth Transaction DynamoDB with PITR | `$0` | On-Demand requests/storage/PITR | Yes: DynamoDB + PITR | Before dev deploy and after measured item/retention sizes |
| WP-009 | Cognito Plus/Managed Login/built-in email | `$0` | MAU and email volume | Yes: Cognito row | Current price/quota/capability check before each environment |
| WP-014 | Library DynamoDB with PITR | `$0` | On-Demand requests/storage/PITR | Yes: DynamoDB + PITR | Measured item/transaction profile and production gate |
| WP-027 | Library Operations Lambda, failure destination and SQS failure queue/logs | `$0` idle | Invocation/duration, SQS only on failure, logs | Yes: async allowance/supporting rows | Workload/failure-retention benchmark at WP-040 |
| WP-028 | Temporary private transfer S3 | `$0` | Requests, ~24-hour storage, transfer/egress | Yes: transfer row | Object-size/count/egress measurement at WP-040 |
| WP-035 | EventBridge Scheduler one-time deletion schedules | `$0` expected | Schedule/invocation volume | Yes: supporting reserve | Current price/quota check before deploy |
| WP-036 | Account Lifecycle Lambda/logs | `$0` idle | Invocation/duration, storage-delete requests/logs | Yes: Lambda/supporting rows | Maximum-account deletion benchmark at WP-040 |
| WP-037 | Finite CloudWatch logs, approximately five alarms, SNS email, Budgets | Approximately the approved alarm component; no custom dashboard | Log ingestion/storage, notifications | Yes: approximately `$1.00` Personal observability row/supporting reserve | Alarm count, retention, current pricing, and actual first bill |
| WP-039 | AWS Backup plan/vault/Governance Lock and temporary restores | `$0` service minimum expected | Protected/restore storage and requests | Yes: approximately `$0.07` Personal row | Before Vault Lock, after protected-size measurement, and drill |
| WP-040 | Non-production benchmark traffic | `$0` persistent | Temporary full-stack workload usage | Test cost only | Reconcile every synthesized resource and current published price |
| WP-043 | Isolated recovery-drill restores | `$0` persistent after cleanup | Temporary table/storage/Cognito/validation usage | Recovery drill/supporting reserve | Before drill and against measured restored size/duration |
| WP-046 | Production copies/activation of all approved resources | Aggregate above | Aggregate above | Yes: approximately `$2.70/month` Personal baseline | Immediately before release, after first full bill, and before expansion |

Packages that only add code or consume resources already listed have `$0` new fixed resource cost; their individual Cost fields still require request/storage/duration measurements where material. Security, recovery, or retention may not be weakened merely to hit a round-number price. A near-term projection above approximately `$15/month`, or a material departure from the approved Personal posture/preferred `$5/month` target, requires explicit human approval or demonstrated-driver optimization.

### F.3 Stateful-resource gate

Every CDK diff that can replace/delete a DynamoDB table, Cognito pool, transfer/static bucket, backup vault/plan, or production DNS/certificate binding fails closed. A package may proceed only after its restore/rollback semantics and named resource target are reviewed. Governance Vault Lock configuration receives a separate irreversible-setting review before deployment.

## G. Requirements coverage

The mapping below is exhaustive for the current registry revision. Ranges are inclusive. A listed verification package does not defer the underlying implementation; it provides the final independent evidence gate.

| Registry range | Count | Implementation/verification mapping |
|---|---:|---|
| GOV-001–GOV-006 | 6 | WP-001–WP-004, WP-044–WP-046 |
| DOM-001–DOM-007 | 7 | WP-015, WP-020, WP-021, WP-024, WP-030, WP-031, WP-041, WP-042, WP-044 |
| AUTH-001–AUTH-020 | 20 | WP-008–WP-013, WP-023, WP-033–WP-036, WP-044–WP-046 |
| AZ-001–AZ-008 | 8 | WP-011–WP-014, WP-016, WP-020, WP-021, WP-027–WP-030, WP-033–WP-036, WP-039, WP-043, WP-044 |
| ID-001–ID-004 | 4 | WP-011, WP-015, WP-020, WP-021, WP-029–WP-032, WP-041, WP-042 |
| DATA-001–DATA-018 | 18 | WP-014, WP-015, WP-017–WP-022, WP-024, WP-027, WP-029–WP-032, WP-036, WP-039–WP-044 |
| API-001–API-016 | 16 | WP-003, WP-007, WP-010, WP-012, WP-016–WP-021, WP-027–WP-036, WP-044–WP-046 |
| OP-001–OP-012 | 12 | WP-017, WP-018, WP-027–WP-032, WP-037, WP-040, WP-044–WP-046 |
| MIG-001–MIG-018 | 18 | WP-019, WP-027–WP-032, WP-038, WP-040–WP-044 |
| EDGE-001–EDGE-014 | 14 | WP-001, WP-003, WP-007, WP-009, WP-010, WP-023–WP-026, WP-028, WP-044–WP-046 |
| OPS-001–OPS-014 | 14 | WP-002–WP-007, WP-027, WP-035–WP-040, WP-043–WP-046 |
| LIFE-001–LIFE-011 | 11 | WP-005, WP-011–WP-013, WP-033–WP-036, WP-039, WP-043–WP-046 |
| PRIV-001–PRIV-007 | 7 | WP-008, WP-010, WP-012, WP-017, WP-027–WP-030, WP-033–WP-039, WP-043–WP-046 |
| TEST-001–TEST-008 | 8 | Every package's test/evidence gate; consolidated by WP-004, WP-013, WP-022, WP-026, WP-040–WP-046 |
| COST-001–COST-005 | 5 | Every AWS Cost field; ledger §F.2; WP-003, WP-007–WP-009, WP-014, WP-027, WP-028, WP-035–WP-040, WP-044–WP-046 |
| PUB-001–PUB-004 | 4 | WP-009, WP-011, WP-033–WP-035, WP-038, WP-040, WP-044–WP-046 |
| **All current requirements** | **172** | **172 mapped; none unmapped** |

Priority accounting: all **166 MUST** requirements are mapped to implementation and/or explicit verification; all four SHOULD requirements (`AUTH-017`, `AUTH-018`, `AUTH-020`, `PRIV-007`) and both MAY requirements (`DOM-007`, `API-013`) are also mapped. MAY behavior is used only where its package acceptance criteria prove it appropriate.

At the end of each package, update a machine-checkable requirement-to-test/evidence manifest. WP-044 must fail if any current registry ID is absent, maps only to a future package, or lacks concrete evidence.

## H. Explicit deferred-feature and V3-isolation ledger

The following are not V4.0 implementation scope: WAF; GSI; DynamoDB Streams/library tombstone or sync log; server search/analytics; customer-managed VPC/NAT/endpoints; Step Functions; ECS; SQS primary dispatch; federation; SES; Identity Pool; Cognito triggers; API Gateway JWT authorizer/separate Lambda authorizer; GraphQL/general RPC; Amplify Hosting/public S3 website; Lambda@Edge solely for headers; provisioned concurrency; X-Ray; custom CloudWatch dashboard before its post-billing review; multi-region/global tables; separate AWS accounts; automated Cognito profile replication; public signup; offline sync; rich text; third-party paging.

WP-003, WP-004, WP-026, WP-040, WP-044, and WP-045 inspect dependency and synthesized/deployed resource inventories for leakage. A reconsideration trigger creates an architecture-review proposal, not implementation authority.

No package requires changing frozen V3 production code, tests, worker, manifest, headers, export behavior, root package behavior, or Netlify transformation logic. WP-001 may add the least-invasive deployment/path guard only after inspecting actual Netlify settings; if isolation needs a V3 runtime change, it stops. All later packages rerun V3 regression and path/deploy isolation at risk-appropriate checkpoints.

## I. Independent plan review

### I.1 Authority and conflict review

- Reviewed the amended `V4_ARCHITECTURE.md`, ADR-001–ADR-025, all 172 entries in `V4_REQUIREMENTS.md`, `V3_EXPORT_COMPATIBILITY.md`, `V4_ARCHITECTURE_AUDIT_2.md`, frozen V3 code/tests/history, and repository build/deploy configuration.
- No exact conflict was found among the governing sources. No affected package is stopped.
- The second audit's only remaining gate was human approval. That approval was received on 2026-09-15 and recorded in the architecture/audit status; it authorizes this plan only.
- A document-order defect placed architecture §§13.7–13.9 before §13.6. The headings were reordered without changing their content or decision semantics so references remain unambiguous.

### I.2 Completeness and verification

- Coverage result: **166/166 mandatory V4.0 requirements mapped; 172/172 current requirements mapped; 0 unmapped**.
- T-01–T-25 and C-01–C-25 are represented in package traceability and receive consolidated evidence in WP-044.
- Architecture-critical behavior has an explicit verifier: real Cognito/browser auth (WP-013); real DynamoDB concurrency/fencing (WP-022); rolling client/edge security (WP-026); transfer/import/export and duplicate delivery (WP-027–WP-032); lifecycle races/IAM (WP-033–WP-036); cost/limits (WP-040); V3 fixtures (WP-041/WP-042); recovery (WP-043); full threat/control/release gate (WP-044–WP-046).
- Manual checks remain only where account posture, protected-environment configuration, email receipt, irreversible lock settings, human release judgment, accessibility/UX inspection, or recovery operations cannot be completely proven by a unit/contract test.

### I.3 Dependency review

- Work packages are topologically ordered; no package requires a capability scheduled later. Earlier auth packages own their OpenAPI route fragments, and WP-016 consolidates the complete surface before library handlers.
- Security/session precedes protected library API. Persistence/concurrency/idempotency precede feature mutations. Direct async operation and transfer boundaries precede import/export/lifecycle consumers. Limits/cost precede legacy migration qualification. Full migration/recovery/security evidence precedes release acceptance.
- Major approved sequence is preserved. Package subdivision adds gates but does not reorder a security or persistence prerequisite.

### I.4 Architecture, cost, and isolation conclusions

- **Architecture deviations:** None.
- **Cost:** Planned production resources match the approved Personal architecture. WP-003, WP-005–WP-009, WP-014, WP-027, WP-028, WP-035–WP-040, WP-043, WP-045, and WP-046 carry explicit or conditional revalidation/checkpoint obligations; WP-040 is the integrated pre-migration cost/limit gate.
- **Deferred features:** None leaked into V4.0 scope; §H is an explicit negative inventory.
- **V3 isolation:** No planned package requires a V3 runtime behavior change. V3 remains root-hosted, independently tested/deployed, and outside the V4 worker/origin.
- **Plan review result:** **IMPLEMENTATION PLAN READY FOR HUMAN REVIEW**.

## J. Recommended first implementation slice

**Recommend authorizing WP-001 — Repository and V3/V4 isolation boundary first, and only WP-001.**

It is the prerequisite that makes every later change rollback-safe: it proves what Netlify actually publishes/triggers, reserves an independent V4 path/origin boundary, and prevents V4-only work from changing frozen V3 behavior before any new package, dependency, CDK construct, or AWS resource exists. Its exit evidence is concrete, inexpensive, and reversible. Starting with CDK or feature code first would create artifacts before the repository/deployment boundary that must contain them has been proven.

Approval of this document does not itself authorize WP-001 or any implementation. The next action is human review of this plan followed, if accepted, by a separate explicit authorization naming WP-001.
