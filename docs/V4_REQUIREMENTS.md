# ShelfState V4 Requirements Registry

**Status:** Canonical implementation requirements registry, independently reviewed 2026-09-14\
**Implementation phase:** Not started
**Authority:** subordinate to [`V4_ARCHITECTURE.md`](V4_ARCHITECTURE.md) and the [ADR set](adr/)

## 1. Governance and interpretation

The historical 196-item V4 ledger is unavailable and cannot be reliably reconstructed. This repository-controlled registry formally supersedes that lost ledger for implementation governance, but does **not** claim verbatim, numeric, or one-to-one equivalence.

The entries below were derived from the approved architecture, ADR-001–ADR-025 and amendments, A-01–A-07, TB-01–TB-10, T-01–T-25/C-01–C-25, relevant frozen V3 behavior, the first audit, and the 2026-09-14 human adjudications. An entry is material when omitting it could change behavior, trust, ownership, data integrity, compatibility, recovery, deployment authority, privacy, verification, or the approved cost posture.

Normative levels use RFC-style meanings: **MUST** is required for V4.0/production acceptance; **SHOULD** is the approved default and requires documented architecture review to vary; **MAY** is explicitly permitted. `PRE-CODE` means required but not implemented. Controls are listed for security-relevant entries; `—` means no distinct named security control is the primary provenance.

## 2. Current V4.0 requirements

### Governance (`GOV`)

| ID | Level | Normative requirement | Source/provenance | ADR / control | Planned verification | Status |
|---|---|---|---|---|---|---|
| GOV-001 | MUST | Treat `V4_ARCHITECTURE.md` as current architecture authority, ADRs as decision history, and this registry as implementation-requirement authority. | Architecture §1 | ADR-001–025 | Documentation-link/contradiction audit | PRE-CODE |
| GOV-002 | MUST | Do not claim this registry is equivalent to the unavailable historical 196-item ledger. | Architecture §1.1; F-01 | — | Documentation audit | PRE-CODE |
| GOV-003 | MUST | Obtain explicit human Pre-Code Gate approval before implementation or implementation planning begins. | Architecture §§1, 32–33 | — | Gate record review | PRE-CODE |
| GOV-004 | MUST | Amend the relevant ADR, architecture, and registry before adopting a material architecture change. | Architecture §35 | ADR-001–025 | Change-review checklist | PRE-CODE |
| GOV-005 | MUST | Keep V3 production behavior unchanged unless separately authorized. | Architecture §2.1; F-11 | ADR-006/007/024 | Git path/diff and deployment-trigger checks | PRE-CODE |
| GOV-006 | MUST | Keep deferred capabilities outside V4.0 unless their documented reconsideration gate is approved. | Architecture §31 | Relevant ADR | Scope and requirements audit | PRE-CODE |

### Domain behavior (`DOM`)

| ID | Level | Normative requirement | Source/provenance | ADR / control | Planned verification | Status |
|---|---|---|---|---|---|---|
| DOM-001 | MUST | Preserve the Book and Bookshelf domain and make `Book.bookshelfId` the sole authoritative membership relationship. | Architecture §§2.2, 11.2; V3 | ADR-001/015; C-03/C-12 | Domain unit + persistence integration tests | PRE-CODE |
| DOM-002 | MUST | Maintain exactly one explicit default Bookshelf in every active library. | Architecture §§2.2, 11.2; F-06 | ADR-001/004/015; C-03 | Invariant/property and activation tests | PRE-CODE |
| DOM-003 | MUST | Reject ordinary deletion of the default Bookshelf. | Architecture §2.2; F-06 | ADR-001/004/015; C-16 | API/domain negative tests | PRE-CODE |
| DOM-004 | MUST | Trim Bookshelf names and enforce case-insensitive uniqueness in the active owner library. | Architecture §§2.2, 11.2; V3; F-06 | ADR-001/004/015; C-03/C-12 | Unit, concurrent integration, import tests | PRE-CODE |
| DOM-005 | MUST | Never create a `Bookshelf.bookIds` or other reverse membership mirror. | Architecture §11.2; V3; F-06 | ADR-001/015; C-03 | Schema/code review + contract tests | PRE-CODE |
| DOM-006 | MUST | Delete a non-default shelf as one logical operation that reassigns all affected Books to the default before removal. | Architecture §§2.2, 11.2; F-06 | ADR-001/004/015; C-03/C-16 | Small/oversized integration tests | PRE-CODE |
| DOM-007 | MAY | Execute bounded shelf delete/reassign in-place only when the complete operation safely fits DynamoDB transaction limits; otherwise use generation activation. | Architecture §11.2; F-06 | ADR-001/015; C-03 | Boundary tests at transaction threshold | PRE-CODE |

### Identity, login, and sessions (`AUTH`)

| ID | Level | Normative requirement | Source/provenance | ADR / control | Planned verification | Status |
|---|---|---|---|---|---|---|
| AUTH-001 | MUST | Use Cognito User Pools Plus, Managed Login, and Authorization Code + PKCE with a public client and no PWA client secret. | Architecture §9.1 | ADR-003; C-02/C-13/C-18 | IaC assertions + auth E2E | PRE-CODE |
| AUTH-002 | MUST | Enable user-enumeration resistance and initially separate production/non-production user pools. | Architecture §§9.1, 21.2 | ADR-003; C-13/C-19 | IaC and negative-flow tests | PRE-CODE |
| AUTH-003 | MUST | Own an immutable ShelfState `userId`; map Cognito `sub` server-side and never use email as ownership or automatic-linking authority. | Architecture §9.2 | ADR-003/004; C-01/C-18 | Provisioning/concurrent-link tests | PRE-CODE |
| AUTH-004 | MUST | Provision at most one account/userId conditionally after successful authentication and invitation validation. | Architecture §9.4 | ADR-003/012; C-01/C-17 | Concurrent first-login integration tests | PRE-CODE |
| AUTH-005 | MUST | Generate unpredictable OAuth state, PKCE verifier/S256 challenge, OIDC nonce, and transient browser binding for every login attempt. | Architecture §§6 TB-09, 9.3; F-08 | ADR-003/020; C-02/C-15 | Entropy/config unit + E2E tests | PRE-CODE |
| AUTH-006 | MUST | Store login state, hashed binding, verifier, nonce, allowlisted return path, timestamps, and used/status marker server-side. | Architecture §9.3; F-08 | ADR-003/020; C-02/C-09 | Persistence schema and expiry tests | PRE-CODE |
| AUTH-007 | MUST | Carry the transient browser binding only in a short-lived Secure/HttpOnly cookie and use an approximately ten-minute initial transaction lifetime. | Architecture §9.3; F-08 | ADR-003/020; C-02/C-15 | Browser cookie and expiry tests | PRE-CODE |
| AUTH-008 | MUST | Before session creation validate state, expiry, unused status, binding, code/PKCE exchange, issuer/client/lifetime, nonce, and exact allowed callback/return destination. | Architecture §9.3; F-08 | ADR-003/020; C-02/C-15/C-20 | Adversarial auth callback suite | PRE-CODE |
| AUTH-009 | MUST | Atomically consume a login transaction once and fail callback replay safely. | Architecture §9.3; F-08 | ADR-003/020; C-02/C-17 | Concurrent/replay integration tests | PRE-CODE |
| AUTH-010 | MUST | Keep Cognito tokens and PKCE verifier inaccessible to browser JavaScript. | Architecture §§9.3, 9.5 | ADR-003/020; C-02/C-09 | Browser/storage/CSP inspection | PRE-CODE |
| AUTH-011 | MUST | Give the browser only a random opaque Secure/HttpOnly host-only session cookie with narrow practical path. | Architecture §§9.5–9.6 | ADR-003/020; C-02 | Browser cookie/security tests | PRE-CODE |
| AUTH-012 | MUST | Enforce server-authoritative idle/absolute session expiry (initially 7/30 days) and account `sessionVersion` on every protected request. | Architecture §§9.5–9.7, 13.4 | ADR-003/020; C-02 | Time-control and revocation tests | PRE-CODE |
| AUTH-013 | MUST | Rotate the session identifier on login/security-boundary transitions; never elevate pre-auth state in place. | Architecture §§9.5–9.6 | ADR-003/020; C-02 | Fixation/rotation E2E tests | PRE-CODE |
| AUTH-014 | MUST | Require a separate session-bound anti-CSRF custom header plus method/origin and SameSite defenses for state changes. | Architecture §9.8 | ADR-020; C-15 | Cross-site browser/adversarial tests | PRE-CODE |
| AUTH-015 | MUST | Increment session version on global logout and disablement; normal logout deletes the current session. | Architecture §9.7 | ADR-003/020; C-02 | Multi-session integration tests | PRE-CODE |
| AUTH-016 | MUST | Require recent authentication for account deletion, identity/email changes, and privileged account-state/role operations. | Architecture §9.9 | ADR-020; C-02/C-10/C-16 | Fresh-auth positive/negative tests | PRE-CODE |
| AUTH-017 | SHOULD | Start with one-hour Cognito access/ID tokens and a rotating 30-day refresh token held only in the server-side session. | Architecture §§9.5–9.6 | ADR-003/020; C-02/C-09 | Cognito/IaC and refresh-flow tests | PRE-CODE |
| AUTH-018 | SHOULD | Start with `SameSite=Lax` session/binding cookies and vary only when tested authentication behavior requires it without weakening controls. | Architecture §9.6 | ADR-020; C-02/C-15 | Browser callback/CSRF tests | PRE-CODE |
| AUTH-019 | MUST | Use Cognito built-in email initially, with no Identity Pool and no Cognito Lambda triggers in V4.0. | Architecture §9.1 | ADR-003/023; C-06/C-18 | IaC assertions | PRE-CODE |
| AUTH-020 | SHOULD | Begin Cognito Plus threat protection in audit/observation mode before enforcement. | Architecture §9.1 | ADR-003/023; C-13 | Cognito config/review evidence | PRE-CODE |

### Authorization and ownership (`AZ`)

| ID | Level | Normative requirement | Source/provenance | ADR / control | Planned verification | Status |
|---|---|---|---|---|---|---|
| AZ-001 | MUST | Resolve trusted identity, account ACTIVE status, role, and owner `userId` only in centralized backend authentication/authorization code. | Architecture §§10, 13.4 | ADR-004; C-01/C-10/C-12/C-25 | Middleware unit + integration tests | PRE-CODE |
| AZ-002 | MUST | Construct every user-owned read/write/query partition from authenticated `userId`, never a client-supplied owner. | Architecture §10.2 | ADR-004/001; C-01/C-12/C-25 | BOLA adversarial integration tests | PRE-CODE |
| AZ-003 | MUST | Return indistinguishable 404-style results for absent and out-of-owner-scope user resources. | Architecture §§10.2, 14 | ADR-004/018; C-01/C-19 | Cross-owner negative tests | PRE-CODE |
| AZ-004 | MUST | Use only USER and ADMIN initially; do not use client claims or Cognito claims as authoritative role state. | Architecture §§10.1, 10.3 | ADR-004; C-10/C-12 | Role-forgery tests | PRE-CODE |
| AZ-005 | MUST | Prevent ADMIN from routinely reading/browsing another user's library. | Architecture §§10.1, 10.3; lifecycle clarification | ADR-004/012; C-01/C-10 | Admin cross-owner negative tests | PRE-CODE |
| AZ-006 | MUST | Bootstrap/change ADMIN only through controlled, auditable privileged procedure; never by signup order or email. | Architecture §10.3 | ADR-004; C-10/C-21 | IaC/runbook and audit-event test | PRE-CODE |
| AZ-007 | MUST | Scope lifecycle/recovery workload authority to an already-authorized target/workflow and never expose it as general browsing authority. | Architecture §§10.3, 19.5; clarification | ADR-004/009/012; C-01/C-08/C-10 | IAM assertions + target-escape tests | PRE-CODE |
| AZ-008 | MUST | Permit no anonymous cloud library; every library/import/export/operation resource requires a valid active ShelfState session and owned scope. | Architecture §§9–10, 13.4 | ADR-003/004/011; C-01/C-02/C-23 | Unauthenticated/cross-owner API tests | PRE-CODE |

### Resource identifiers (`ID`)

| ID | Level | Normative requirement | Source/provenance | ADR / control | Planned verification | Status |
|---|---|---|---|---|---|---|
| ID-001 | MUST | Make Book and Bookshelf IDs opaque, immutable, non-semantic, and independent of owner/authorization. | Architecture §12 | ADR-025; C-01/C-12 | Domain/schema and authorization tests | PRE-CODE |
| ID-002 | MUST | Generate new online V4 Book and Bookshelf IDs on the backend as UUID v4 values. | Architecture §12 | ADR-025; C-12/C-17 | API/create/idempotency tests | PRE-CODE |
| ID-003 | MUST | Encode no userId, email, shelf name, time/order, or privilege in resource IDs and never treat possession of an ID as authority. | Architecture §12 | ADR-004/025; C-01/C-12 | Format and BOLA tests | PRE-CODE |
| ID-004 | MUST | Preserve valid supported V3 IDs even when later V4 creation rules are stricter and retain a future globally unique offline-ID path. | Architecture §12; F-04/F-05 | ADR-011/025; C-03/C-24 | Compatibility fixtures/design review | PRE-CODE |

### Persistence and concurrency (`DATA`)

| ID | Level | Normative requirement | Source/provenance | ADR / control | Planned verification | Status |
|---|---|---|---|---|---|---|
| DATA-001 | MUST | Use DynamoDB Standard On-Demand as V4 authoritative persistence with owner-partitioned Book/Shelf data. | Architecture §§11.1–11.2 | ADR-001; C-01/C-03 | IaC + repository integration tests | PRE-CODE |
| DATA-002 | MUST | Include server-managed `activeGeneration`, monotonic `libraryRevision`, and optional writer-lease metadata in each library CONTROL record. | Architecture §11.3; F-02 | ADR-001/011/015; C-03/C-17 | Schema and state-machine tests | PRE-CODE |
| DATA-003 | MUST | Give mutable entities server-managed integer revisions and authoritative server timestamps. | Architecture §11.4 | ADR-001/015; C-03/C-12 | Persistence unit/integration tests | PRE-CODE |
| DATA-004 | MUST | Require `expectedGeneration` plus `expectedEntityRevision` for an existing-entity mutation; entity revision alone is insufficient. | Architecture §11.4; F-02 | ADR-001/015; C-03/C-17/C-24 | Stale generation/entity tests | PRE-CODE |
| DATA-005 | MUST | Atomically verify active generation, incompatible-fence absence, and expected entity revision, apply an ordinary mutation, and increment library revision. | Architecture §11.4; F-02 | ADR-001/015; C-03/C-17 | Transaction/concurrency integration tests | PRE-CODE |
| DATA-006 | MUST | Make creates participate in active-generation/fence/library-revision checks even though no prior entity revision exists. | Architecture §11.4; F-02 | ADR-001/015; C-03/C-17 | Create-vs-rebuild race tests | PRE-CODE |
| DATA-007 | MUST | Bind an exclusive generation lease to operation ID, source generation, source library revision, attempt/owner marker, and expiry/recovery metadata. | Architecture §11.3; F-02 | ADR-001/011/015; C-03/C-17 | Lease state-machine/property tests | PRE-CODE |
| DATA-008 | MUST | Acquire/recover the lease conditionally so a dead worker cannot permanently lock a library and two workers cannot activate. | Architecture §11.3; F-02 | ADR-001/011/015; C-03/C-17 | Crash/recovery/concurrent-worker tests | PRE-CODE |
| DATA-009 | MUST | Reject incompatible ordinary mutations with a stable 409-class conflict while the generation fence is owned. | Architecture §§11.3, 14; F-02 | ADR-001/015/018; C-03/C-17 | Concurrent API integration tests | PRE-CODE |
| DATA-010 | MUST | Stage and fully validate a complete generation before making it active. | Architecture §§11.3, 18 | ADR-001/011/015/019; C-03/C-11 | Fault-injection and validation tests | PRE-CODE |
| DATA-011 | MUST | Activate only when the same operation still owns a valid fence and source generation/revision still match; increment library revision and release the fence atomically. | Architecture §11.3; F-02 | ADR-001/011/015; C-03/C-17 | Activation-race/fault tests | PRE-CODE |
| DATA-012 | MUST | For coherent whole reads/exports, read CONTROL, read all captured-generation pages, reread CONTROL, and accept only unchanged generation and library revision. | Architecture §§11.3, 18.2; F-02 | ADR-001/011/015; C-03 | Mid-read mutation/activation tests | PRE-CODE |
| DATA-013 | MUST | Never claim DynamoDB strongly consistent item reads provide multi-item snapshot isolation. | Architecture §§11.3, 11.5 | ADR-001 | Design/code review + read-race tests | PRE-CODE |
| DATA-014 | MUST | Retain the prior generation about 24 hours for rollback and make cleanup/TTL non-authoritative. | Architecture §11.3 | ADR-001/015; C-03/C-16 | Lifecycle and rollback tests | PRE-CODE |
| DATA-015 | MUST | Use strongly consistent base-table reads by default for authoritative entity/library state. | Architecture §11.5 | ADR-001; C-03 | SDK-call assertions + integration tests | PRE-CODE |
| DATA-016 | MUST | Keep DynamoDB Streams, tombstones, and a sync/change-log engine out of V4.0. | Architecture §§3.1, 11.6, 31 | ADR-001 | IaC/scope inspection | PRE-CODE |
| DATA-017 | MUST | Keep Book/Shelf items within explicit bounds and use S3 only for file-like transfer concerns. | Architecture §§11.7, 15 | ADR-001/019; C-06 | Boundary/size tests | PRE-CODE |
| DATA-018 | MUST | Perform search, filtering, grouping, and Insights client-side over the bounded loaded library; add no GSI/search/analytics service absent an approved concrete requirement. | Architecture §§11.2, 31 | ADR-001; C-06 | Query/IaC absence and UI behavior tests | PRE-CODE |

### API, validation, errors, and idempotency (`API`)

| ID | Level | Normative requirement | Source/provenance | ADR / control | Planned verification | Status |
|---|---|---|---|---|---|---|
| API-001 | MUST | Use API Gateway HTTP API with Node.js/JavaScript request Lambdas and no always-on compute. | Architecture §13.1 | ADR-005; C-06 | IaC assertions | PRE-CODE |
| API-002 | MUST | Separate Auth/Session, Library API, Library Operations, Admin/Account, and Account Lifecycle capabilities with least-privilege IAM. | Architecture §§5, 13.2 | ADR-004/005; C-01/C-10 | IaC policy tests | PRE-CODE |
| API-003 | MUST | Use resource-oriented versioned HTTP/JSON under `/api/v1`, adding command endpoints only where CRUD is misleading. | Architecture §13.5 | ADR-005 | OpenAPI lint/contract tests | PRE-CODE |
| API-004 | MUST | Maintain a version-controlled OpenAPI document as the external API contract and keep implementation/tests consistent. | Architecture §13.6 | ADR-005/017 | CI contract verification | PRE-CODE |
| API-005 | MUST | Validate every request with explicit server-side schemas before domain/persistence work and reject unexpected properties by default. | Architecture §15.1 | ADR-019; C-11/C-12/C-25 | Schema/adversarial tests | PRE-CODE |
| API-006 | MUST | Enforce strict types, enums, formats, supported media types, lengths/ranges, and application bounds for bodies and collections. | Architecture §§15.1–15.3 | ADR-019; C-06/C-11 | Boundary/fuzz tests | PRE-CODE |
| API-007 | MUST | Treat user content as plain text and render through safe text APIs; do not support rich text in V4.0. | Architecture §15.4 | ADR-006/019; C-05 | XSS/browser tests | PRE-CODE |
| API-008 | MUST | Return correct status and a small sanitized error envelope with stable code, safe message, optional correlation ID, and bounded field issues. | Architecture §14 | ADR-018; C-14/C-19 | Contract and leakage tests | PRE-CODE |
| API-009 | MUST | Never expose raw AWS errors, stack traces, table keys, tokens, session data, config, or private bodies in API errors. | Architecture §14 | ADR-018/022; C-09/C-14 | Fault-injection response tests | PRE-CODE |
| API-010 | MUST | Require idempotency for create Book/Shelf/invitation, import, structural/generation operations, migrations, and commands with duplicate-side-effect risk. | Architecture §13.7; F-07 | ADR-005/011/018; C-17 | Replay/concurrency tests | PRE-CODE |
| API-011 | MUST | Scope idempotency by authenticated user, operation type, and key; store canonical request fingerprint, result/status, and authoritative timestamps/expiry without unnecessary full bodies. | Architecture §13.7; F-07 | ADR-005/011/018; C-09/C-14/C-17 | Persistence/privacy/replay tests | PRE-CODE |
| API-012 | MUST | Return/resume the original result for same key/same request; return `IDEMPOTENCY_CONFLICT` for same key/different request; retain server-generated IDs. | Architecture §§13.7, 14; F-07 | ADR-005/018/025; C-17 | Concurrent duplicate tests | PRE-CODE |
| API-013 | MAY | Omit idempotency keys for naturally idempotent reads and safe resource-addressed updates unless semantics add replay risk. | Architecture §13.7; F-07 | ADR-005/018 | API review + contract tests | PRE-CODE |
| API-014 | MUST | Use server-authoritative record expiry; TTL is eventual cleanup only. | Architecture §§9.3, 13.7 | ADR-003/005/020; C-17 | Time-control tests | PRE-CODE |
| API-015 | MUST | Introduce neither GraphQL nor a generalized RPC framework in V4.0. | Architecture §13.5 | ADR-005 | Dependency/OpenAPI review | PRE-CODE |
| API-016 | MUST | Validate opaque BFF sessions in centralized backend middleware, not API Gateway JWT authorization or a separate Lambda authorizer. | Architecture §§13.4, 9.5 | ADR-003/005/020; C-01/C-02 | IaC/handler/auth integration tests | PRE-CODE |

### Asynchronous operations and workflows (`OP`)

| ID | Level | Normative requirement | Source/provenance | ADR / control | Planned verification | Status |
|---|---|---|---|---|---|---|
| OP-001 | MUST | Never hold API Gateway requests open for potentially long-running work. | Architecture §13.8; F-10 | ADR-005/011/015; C-06 | Timeout/contract tests | PRE-CODE |
| OP-002 | MUST | After auth, validation, and idempotency, create an owned Operation in `QUEUED`, invoke the worker asynchronously, and return `202` with ID/status URL. | Architecture §13.8; F-10 | ADR-005/011; C-01/C-17 | API/AWS integration tests | PRE-CODE |
| OP-003 | MUST | Expose authenticated owner-scoped `GET /api/v1/operations/{operationId}` and support reasonable-backoff polling. | Architecture §13.8 | ADR-005/011; C-01/C-06 | Cross-owner and polling tests | PRE-CODE |
| OP-004 | MUST | Make worker state transitions, duplicate deliveries, retries, side effects, and terminal results idempotent and concurrency-safe. | Architecture §13.8; AWS async semantics | ADR-005/011/015; C-03/C-17 | Duplicate/fault-injection tests | PRE-CODE |
| OP-005 | MUST | Make the worker participate in writer-fence/source-binding rules and validate before activation when rebuilding a generation. | Architecture §§11.3, 13.8 | ADR-001/011/015; C-03/C-17 | State-machine/race tests | PRE-CODE |
| OP-006 | MUST | Use async operations for import, export generation, whole-library migration, oversized shelf deletion, and other generation rebuilds. | Architecture §13.8; F-10 | ADR-005/011/015 | Workflow contract/E2E tests | PRE-CODE |
| OP-007 | MUST | Keep ordinary CRUD synchronous. | Architecture §13.8 | ADR-005 | OpenAPI/behavior tests | PRE-CODE |
| OP-008 | MUST | Use direct asynchronous Lambda invocation as primary dispatch and configure a durable low-volume SQS on-failure destination after retries. | Architecture §§5, 13.8; F-10 | ADR-005; C-03/C-06 | IaC + forced-failure tests | PRE-CODE |
| OP-009 | MUST | Keep worker inputs and execution within normal Lambda bounds and reserved-concurrency/resource ceilings. | Architecture §§13.3, 13.8, 15 | ADR-005/019/021; C-06 | Load/limit tests | PRE-CODE |
| OP-010 | MUST | Benchmark maximum supported workloads in the real non-production AWS stack with substantial Lambda-limit margin before production. | Architecture §13.8; F-10 | ADR-005/017; C-03/C-06 | Recorded benchmark gate | PRE-CODE |
| OP-011 | MUST | Stop for architecture review if approved maximum operations lack substantial Lambda-limit margin; do not silently add Step Functions/ECS/another platform. | Architecture §13.8; F-10 | ADR-005/015 | Release/gate checklist | PRE-CODE |
| OP-012 | MUST | Put only a bounded non-secret operation reference/routing envelope in async invocation and protect the failure queue with least privilege and bounded retention. | Architecture §13.8; privacy/logging baseline | ADR-005/008/022; C-09/C-14 | IaC/payload/leakage tests | PRE-CODE |

### Import, export, and compatibility (`MIG`)

| ID | Level | Normative requirement | Source/provenance | ADR / control | Planned verification | Status |
|---|---|---|---|---|---|---|
| MIG-001 | MUST | Define a versioned implementation-independent logical export excluding physical keys, identity/session, and infrastructure/recovery state. | Architecture §18.1 | ADR-011; C-23 | Golden schema/contract tests | PRE-CODE |
| MIG-002 | MUST | Produce exports only from a coherent double-CONTROL read and discard/retry/fail on revision/generation change. | Architecture §18.2; F-02 | ADR-001/011/015; C-03/C-23 | Concurrent export tests | PRE-CODE |
| MIG-003 | MUST | Completely parse, bound, and validate imports before activation; failure leaves the library unchanged. | Architecture §18.3 | ADR-011/019; C-03/C-11 | Malicious/fault import tests | PRE-CODE |
| MIG-004 | MUST | Make replace and merge explicit; replace requires destructive confirmation. | Architecture §18.4 | ADR-011; C-11/C-16 | API/E2E confirmation tests | PRE-CODE |
| MIG-005 | MUST | In merge, use immutable IDs only; never fuzzy-match metadata or automatically choose by timestamps; require keep-current/use-imported strategy for same-ID conflict. | Architecture §18.4 | ADR-011/025; C-03/C-11 | Merge matrix tests | PRE-CODE |
| MIG-006 | MUST | Use a private temporary S3 transfer area and randomized operation-specific keys with about-24-hour object lifecycle. | Architecture §18.6 | ADR-006/011/022; C-09/C-11/C-23 | IaC/lifecycle tests | PRE-CODE |
| MIG-007 | MUST | Limit presigned URLs to short lifetime, exact key/action/method, bounded size, and restricted content type where practical; never log them. | Architecture §§6 TB-10, 18.6; F-14 | ADR-006/011/022; C-09/C-11/C-14/C-23 | S3/CORS/policy and log tests | PRE-CODE |
| MIG-008 | MUST | Restrict transfer CORS to required V4 origin/methods/headers and grant no listing, general bucket, browser AWS credential, or session-cookie authority. | Architecture §6 TB-10; F-14 | ADR-006/011; C-04/C-09/C-20/C-23 | IaC/browser adversarial tests | PRE-CODE |
| MIG-009 | MUST | Treat uploads as untrusted until backend validation and never make transfer objects authoritative. | Architecture §§6 TB-10, 18.6 | ADR-011/019; C-11/C-12 | Activation negative tests | PRE-CODE |
| MIG-010 | MUST | Migrate frozen V3.9 schema 3 without changing V3 and preserve valid Book/Shelf IDs, Book fields, canonical relationships, and explicit default. | Architecture §18.7; compatibility matrix; F-04/F-05 | ADR-011/015/025; C-03/C-11/C-24 | Frozen fixture golden tests | PRE-CODE |
| MIG-011 | MUST | Support schema 1 only through the matrix's deterministic ID/legacy-name/default conversion; reject ambiguity. | Compatibility matrix §4.1 | ADR-011/015; C-03/C-11 | Historical fixture/ambiguity tests | PRE-CODE |
| MIG-012 | MUST | Support schema 2 only with valid canonical Book references, ignore shelf `bookIds`, and derive/create default only by documented rule. | Compatibility matrix §4.2 | ADR-011/015; C-03/C-11 | Historical fixture/corruption tests | PRE-CODE |
| MIG-013 | MUST | For schema 3 require exactly one explicit default and valid canonical relationships; tolerate/ignore early schema-3 `bookIds`. | Compatibility matrix §4.3 | ADR-011/015; C-03/C-11 | Early/frozen v3 fixture tests | PRE-CODE |
| MIG-014 | MUST | Never use legacy `bookIds`, metadata, array order, timestamps, or active UI shelf to invent relationships. | Compatibility matrix §§3–5 | ADR-011/015; C-03/C-11 | Adversarial fixtures | PRE-CODE |
| MIG-015 | MUST | Do not persist V3 `activeBookshelfId` as cloud-authoritative library state. | Architecture §18.7; matrix | ADR-011; C-12 | Import state assertions | PRE-CODE |
| MIG-016 | MUST | Normalize only documented historical values/omissions/timestamps and distinguish legitimate history from stricter new-creation rules. | Architecture §18.7; matrix §3 | ADR-011/015/025; C-03/C-11 | Compatibility boundary fixtures | PRE-CODE |
| MIG-017 | MUST | Reject corrupt files with bounded path-specific diagnostics and unsupported versions with `UNSUPPORTED_IMPORT_VERSION`. | Architecture §18.7; matrix §5 | ADR-011/018/019; C-11/C-14 | Error-contract fixtures | PRE-CODE |
| MIG-018 | MUST | Apply persisted schema changes using explicit versions and expand–migrate–contract where compatible; use owned fenced generations for incompatible whole-library changes. | Architecture §18.8 | ADR-015; C-03/C-17/C-24 | Migration rollout/state tests | PRE-CODE |

### Frontend, PWA, edge, and network (`EDGE`)

| ID | Level | Normative requirement | Source/provenance | ADR / control | Planned verification | Status |
|---|---|---|---|---|---|---|
| EDGE-001 | MUST | Host V4 static files in private S3 behind CloudFront OAC, Route 53 Alias, and a non-exportable `us-east-1` ACM certificate. | Architecture §16.1 | ADR-006/013; C-04/C-20 | IaC/policy/TLS tests | PRE-CODE |
| EDGE-002 | MUST | Use one V4 origin for ordinary static and `/api/*` traffic and do not cache authenticated API responses. | Architecture §§5.1, 16.2–16.3 | ADR-006; C-02/C-04 | CloudFront behavior tests | PRE-CODE |
| EDGE-003 | MUST | Revalidate mutable shell/service worker; cache hashed assets immutable; publish assets before metadata and `index.html` last; retain old assets temporarily. | Architecture §§16.3, 16.5 | ADR-006/024; C-24 | Deployment and rollback E2E | PRE-CODE |
| EDGE-004 | MUST | Apply IaC-managed CSP, HSTS, nosniff, referrer, and framing protections without Lambda@Edge solely for headers. | Architecture §16.4 | ADR-006; C-04/C-05 | Header/CSP browser tests | PRE-CODE |
| EDGE-005 | MUST | Permit TB-09 browser/IdP navigation only over HTTPS with exact redirect/logout URLs and required CSP navigation/connect policy. | Architecture §6 TB-09; F-14 | ADR-003/006/020; C-02/C-15/C-20 | Cognito config + CSP E2E | PRE-CODE |
| EDGE-006 | MUST | Treat TB-10 as the only direct browser/storage exception and enforce all MIG-007/008 controls. | Architecture §6 TB-10; F-14 | ADR-006/011; C-04/C-09/C-23 | S3/browser boundary tests | PRE-CODE |
| EDGE-007 | MUST | Keep V3 and V4 in one repo but independently buildable/deployable; V4 deploys only to AWS and V4-only changes cannot trigger/alter V3 Netlify production. | Architecture §16.7; F-11 | ADR-006/007/024; C-07/C-24 | CI path-filter/deploy evidence | PRE-CODE |
| EDGE-008 | MUST | Give V4 a distinct hostname/origin and service worker scoped only there, so V3 workers can never control V4. | Architecture §16.7; F-11 | ADR-006/024; C-05/C-24 | Browser scope/install tests | PRE-CODE |
| EDGE-009 | MUST | Preserve controlled worker lifecycle, no forced reload, release coherence, cache ownership, API/auth precache bypass, and safe update behavior. | Architecture §16.7; F-13 | ADR-006/024; C-02/C-24 | Service-worker lifecycle E2E | PRE-CODE |
| EDGE-010 | MUST | Do not copy Netlify canonicalization, V3 unversioned inventory, V3-specific cache policy, or Netlify-only behavior into V4. | Architecture §16.7; F-13 | ADR-006/024; C-24 | Build/config review | PRE-CODE |
| EDGE-011 | MUST | Support at least the immediately previous production client within API v1, use a non-sensitive build ID, and safely block incompatible mutations with `CLIENT_UPDATE_REQUIRED`. | Architecture §16.6 | ADR-024; C-24 | Rolling-client compatibility tests | PRE-CODE |
| EDGE-012 | MUST | Use `us-west-2` for primary dev/prod state/runtime with distinct resources and only documented global/edge exceptions. | Architecture §§17.1, 21.2 | ADR-013 | IaC assertions | PRE-CODE |
| EDGE-013 | MUST | Use no customer-managed VPC/NAT/endpoints initially; keep direct API endpoint secure independently of CloudFront. | Architecture §§17.2–17.3 | ADR-014; C-04/C-20/C-25 | IaC and direct-endpoint security tests | PRE-CODE |
| EDGE-014 | MUST | Use CloudFront pay-as-you-go over the private S3 REST origin; do not use a public S3 website endpoint or Amplify Hosting for V4.0. | Architecture §16.1 | ADR-006/021; C-04/C-06 | IaC/origin/config assertions | PRE-CODE |

### Delivery, administration, and operations (`OPS`)

| ID | Level | Normative requirement | Source/provenance | ADR / control | Planned verification | Status |
|---|---|---|---|---|---|---|
| OPS-001 | MUST | Define AWS resources in CDK v2 JavaScript/CloudFormation and keep production IaC-authoritative. | Architecture §§21.1, 21.8 | ADR-007; C-04/C-07 | Synth/snapshot/drift checks | PRE-CODE |
| OPS-002 | MUST | Authenticate GitHub Actions to environment-specific deployment roles through OIDC temporary credentials; store no long-lived AWS keys. | Architecture §21.3 | ADR-007/010; C-07/C-09 | IAM/workflow static tests | PRE-CODE |
| OPS-003 | MUST | Require explicit human-triggered production release of the exact reviewed revision, rerun checks, and generate human-reviewable infrastructure change preview. | Architecture §§21.4–21.5 | ADR-007/017; C-07/C-16 | Protected-environment release rehearsal | PRE-CODE |
| OPS-004 | MUST | Support rollback to an approved revision and protect durable resources from routine stack destruction/replacement. | Architecture §§21.6–21.7 | ADR-007/009; C-03/C-16 | Rollback rehearsal + IaC assertions | PRE-CODE |
| OPS-005 | MUST | Use root only as MFA-protected break-glass, create no root access keys, and do no routine ShelfState work as root. | Architecture §21.9; F-09 | ADR-007/009; C-21 | Account-security evidence review | PRE-CODE |
| OPS-006 | MUST | Use MFA-protected temporary roles for human access; prefer Identity Center where suitable without forcing unrelated account restructuring. | Architecture §21.9; F-09 | ADR-007/009; C-21 | Credential/config review | PRE-CODE |
| OPS-007 | MUST | Separate narrow routine ShelfState operator authority from exceptional recovery/backup/Vault Lock/destructive/account authority. | Architecture §§20.3, 21.9 | ADR-007/009; C-08/C-10/C-21 | IAM authorization matrix tests | PRE-CODE |
| OPS-008 | MUST | Retain auditable AWS management activity through CloudTrail and periodically review/remove unnecessary roles, credentials, and permissions. | Architecture §21.9; F-09 | ADR-007/009; C-21 | Audit/config periodic checklist | PRE-CODE |
| OPS-009 | MUST | Emit structured sanitized JSON logs with correlation IDs and only bounded operational context. | Architecture §22.2 | ADR-008/018/022; C-14 | Log capture/leakage tests | PRE-CODE |
| OPS-010 | MUST | Retain routine logs about 30 days production and 7–14 days non-production unless a specific longer audit need is approved. | Architecture §22.3 | ADR-008/022; C-14 | IaC retention assertions | PRE-CODE |
| OPS-011 | MUST | Configure approximately five actionable alarms and SNS email for sustained service failure/throttling, including async destination delivery failure where applicable. | Architecture §22.4 | ADR-008; C-06 | Alarm forced-failure tests | PRE-CODE |
| OPS-012 | MUST | Apply API throttles, Lambda reserved-concurrency ceilings, bounded bulk work, DynamoDB On-Demand, and budget alerts; budgets never auto-delete production. | Architecture §§13.3, 22.5 | ADR-005/021; C-06 | IaC/load/budget config tests | PRE-CODE |
| OPS-013 | MUST | Minimize dependencies, commit lockfiles, use clean reproducible installs, pin Actions immutably, and gate exploitable production vulnerabilities. | Architecture §26 | ADR-016; C-22 | CI/supply-chain policy tests | PRE-CODE |
| OPS-014 | MUST | Prefer IAM and managed identities; classify configuration and use Secrets Manager only for unavoidable rotatable secrets. | Architecture §24 | ADR-010; C-09 | IaC/secret scanning tests | PRE-CODE |

### Account lifecycle and recovery (`LIFE`)

| ID | Level | Normative requirement | Source/provenance | ADR / control | Planned verification | Status |
|---|---|---|---|---|---|---|
| LIFE-001 | MUST | Launch with server-enforced `INVITE_ONLY` registration; the client is never enforcement. | Architecture §19.1 | ADR-012/023; C-10/C-12 | API/config bypass tests | PRE-CODE |
| LIFE-002 | MUST | Make invitations expiring, revocable, single-use, auditable, verified-email-conditioned, and replay-safe. | Architecture §19.2; F-07 | ADR-005/012; C-10/C-17/C-19 | Invite replay/expiry tests | PRE-CODE |
| LIFE-003 | MUST | Make disablement reversible, retain data, revoke access immediately, increment session version, and disable Cognito sign-in where practical. | Architecture §19.3 | ADR-003/012; C-02/C-10 | Multi-session lifecycle E2E | PRE-CODE |
| LIFE-004 | MUST | Require fresh auth or audited privileged authorization for deletion, immediately revoke access, and provide an approximately seven-day cancellable `PENDING_DELETION` grace period. | Architecture §19.4 | ADR-012/020; C-02/C-16 | Lifecycle/time-control E2E | PRE-CODE |
| LIFE-005 | MUST | Treat EventBridge schedule only as a trigger; worker must recheck status, request/version, due time, target scope, execute idempotently, and audit. | Architecture §19.5; clarification | ADR-004/012; C-01/C-16/C-17 | Stale/cancel/cross-target tests | PRE-CODE |
| LIFE-006 | MUST | Retire a deleted ShelfState userId forever; later same-email registration gets a new ID/empty library unless explicit authorized recovery/import occurs. | Architecture §19.6 | ADR-003/012; C-01/C-18 | Re-registration tests | PRE-CODE |
| LIFE-007 | MUST | Enable DynamoDB PITR to the full supported window, target 35 days, and restore to separate tables for validation. | Architecture §20.1 | ADR-009; C-03/C-08 | Recovery drill | PRE-CODE |
| LIFE-008 | MUST | Add approximately weekly AWS Backup points, about 90-day retention, dedicated vault, and Governance Vault Lock. | Architecture §20.2 | ADR-009; C-03/C-08 | IaC assertions + recovery drill | PRE-CODE |
| LIFE-009 | MUST | Deny normal application roles recovery-point deletion/vault administration/recovery and limit those to separate recovery authority. | Architecture §20.3 | ADR-009; C-08/C-21 | IAM negative tests | PRE-CODE |
| LIFE-010 | MUST | Protect/reproduce Cognito configuration and require independent identity proof for rebind; same email alone never authorizes it. | Architecture §20.4 | ADR-003/009; C-01/C-18 | Runbook/tabletop recovery test | PRE-CODE |
| LIFE-011 | MUST | Meet engineering targets of roughly ≤15-minute RPO and ≤4-hour RTO through prelaunch and periodic end-to-end recovery drills/runbook. | Architecture §20 | ADR-009/017; C-03/C-08 | Timed recovery evidence | PRE-CODE |

### Privacy and data handling (`PRIV`)

| ID | Level | Normative requirement | Source/provenance | ADR / control | Planned verification | Status |
|---|---|---|---|---|---|---|
| PRIV-001 | MUST | Minimize data to application, security, and operational purpose and classify library, identity, session, transfer, logs, and recovery data. | Architecture §§22.2, 25 | ADR-022; C-14 | Data inventory/privacy review | PRE-CODE |
| PRIV-002 | MUST | Never log passwords, Cognito tokens, cookies/session IDs, CSRF tokens, PKCE verifier, presigned URLs, secrets, full bodies, or routine private Book/notes content. | Architecture §22.2 | ADR-008/010/022; C-09/C-14 | Automated log redaction/leak tests | PRE-CODE |
| PRIV-003 | MUST | Keep login, session, idempotency, and operation validity governed by server checks; use TTL only as delayed cleanup. | Architecture §§9, 13.7, 25 | ADR-003/005/020/022; C-02/C-17 | Expired-record authorization tests | PRE-CODE |
| PRIV-004 | MUST | Provide ordinary-user complete export and account-deletion flows with fresh-auth/destructive safeguards as specified. | Architecture §§18, 19 | ADR-011/012/020/022; C-16/C-23 | E2E privacy workflows | PRE-CODE |
| PRIV-005 | MUST | Age backup copies out through declared recovery retention instead of promising immediate backup erasure. | Architecture §§19.4, 20, 25 | ADR-009/012/022; C-08 | Policy/runbook review | PRE-CODE |
| PRIV-006 | MUST | Use only synthetic isolated data in tests and never copy production private data to non-production. | Architecture §27.3 | ADR-017/022; C-14 | Fixture/CI review | PRE-CODE |
| PRIV-007 | SHOULD | Retain longer audit data only for a specifically justified purpose and bounded period. | Architecture §§22.3, 25 | ADR-008/022; C-14 | Retention review | PRE-CODE |

### Verification and release acceptance (`TEST`)

| ID | Level | Normative requirement | Source/provenance | ADR / control | Planned verification | Status |
|---|---|---|---|---|---|---|
| TEST-001 | MUST | Layer unit, API contract, real non-production AWS integration, browser E2E, IaC, and production smoke verification. | Architecture §27 | ADR-017 | CI/release pipeline evidence | PRE-CODE |
| TEST-002 | MUST | Provide comprehensive behavioral/branch coverage for session, ownership, concurrency, activation, idempotency, import/migration, and lifecycle critical logic. | Architecture §27.2 | ADR-017; C-01/C-02/C-03/C-17 | Coverage thresholds/review | PRE-CODE |
| TEST-003 | MUST | Verify OpenAPI and tested behavior remain consistent; make breaking contract changes explicit. | Architecture §§13.6, 27.4 | ADR-005/017; C-24 | CI schema/contract comparison | PRE-CODE |
| TEST-004 | MUST | Namespace/run-scope fixtures and tolerate orphaned non-production state from interrupted tests. | Architecture §27.3 | ADR-017 | Parallel/retry CI tests | PRE-CODE |
| TEST-005 | MUST | Run a focused live production smoke suite for shell, routing/health, auth wiring, controlled login/read, service worker, and critical assets without real-user/destructive mutation. | Architecture §27.5 | ADR-017; C-03/C-07 | Release smoke evidence | PRE-CODE |
| TEST-006 | MUST | Treat smoke failure as unaccepted release requiring rollback/incident handling. | Architecture §27.5 | ADR-007/017; C-03/C-07 | Failed-release rehearsal | PRE-CODE |
| TEST-007 | MUST | Verify T-01–T-25 controls, including T-16 recovery/concurrency, T-24 idempotency, T-02/T-05 session/login/CSRF, and T-14 human AWS administration. | Architecture §29.1; second audit | ADR set; C-01–C-25 | Threat/control test matrix | PRE-CODE |
| TEST-008 | MUST | Revalidate mutable AWS limits/capabilities/pricing before implementation where they affect design and again before scale/public-signup changes. | Architecture §§23, 34 | ADR-005/021/023 | Dated evidence review | PRE-CODE |

### Cost posture (`COST`)

| ID | Level | Normative requirement | Source/provenance | ADR / control | Planned verification | Status |
|---|---|---|---|---|---|---|
| COST-001 | MUST | Keep the conservative no-free-tier Personal projection near the approved `$2.70/month` and preferred `$5/month` target. | Architecture §23; 2026-09-14 revalidation | ADR-021; C-06 | Pricing model rerun + first bill | PRE-CODE |
| COST-002 | MUST | Require explicit approval/optimization review before near-term projected spend above about `$15/month` or material expansion toward the ~20-user scenario. | Architecture §§23.1, 23.4 | ADR-021; C-06 | Cost gate record | PRE-CODE |
| COST-003 | MUST | Review actual spend after the first full production billing cycle and before material expansion. | Architecture §23.4 | ADR-021; C-06 | Billing review artifact | PRE-CODE |
| COST-004 | MUST | Keep the custom CloudWatch dashboard deferred until one full billing cycle plus explicit value/cost reconsideration. | Architecture §§22.1, 23.4 | ADR-008/021; C-06 | IaC absence + review record | PRE-CODE |
| COST-005 | MUST | Do not weaken security/recovery solely to reach a round-number target and do not make budget alerts destructive. | Architecture §§22.5, 23.4 | ADR-009/021; C-03/C-06/C-08 | Architecture/IaC review | PRE-CODE |

### Public-signup gate (`PUB`)

| ID | Level | Normative requirement | Source/provenance | ADR / control | Planned verification | Status |
|---|---|---|---|---|---|---|
| PUB-001 | MUST | Keep public self-service registration disabled until the independent readiness review passes with evidence. | Architecture §28 | ADR-023; C-06/C-10/C-13 | Server config and gate review | PRE-CODE |
| PUB-002 | MUST | Review edge-abuse/WAF posture, Cognito protection, signup/recovery abuse, growth cost, email capacity, privacy/legal, monitoring, lifecycle, and incident readiness. | Architecture §28 | ADR-003/021/022/023; C-06/C-13/C-19 | Public-readiness checklist | PRE-CODE |
| PUB-003 | MUST | Treat missing evidence as a decision to remain invite-only. | Architecture §28 | ADR-023 | Gate logic/review | PRE-CODE |
| PUB-004 | MUST | Allow registration to switch to `CLOSED` without disabling existing-user sign-in/ordinary service. | Architecture §§19.1, 28 | ADR-012/023; C-10/C-12 | Configuration/E2E tests | PRE-CODE |

## 3. Deferred / reconsideration items (not V4.0 requirements)

The following are intentionally non-mandatory until their ADR/architecture trigger is approved: WAF, custom CloudWatch dashboard, provisioned concurrency, multi-region application, cross-account/cross-region backup, separate AWS accounts, automated Cognito profile replication, X-Ray/distributed tracing, formal SBOM, rich text, GSI/dedicated search, analytics platform, offline writes/sync/change log/tombstones/Streams, federated login, SES, public signup, private admin access plane, edge-origin bypass enforcement, customer VPC/NAT/endpoints, field-level merge UI, and per-client API usage plans.

## 4. Completeness and maintenance rule

The 2026-09-14 independent pass compared every baseline section, all 25 ADRs, all 25 threats/controls, all ten trust boundaries, the V3 compatibility matrix, and the approved audit adjudications to this registry. No material current V4.0 architecture/control was found without an implementation requirement, and no registry entry lacks architecture/ADR provenance or a planned verification mechanism. The result and category counts are recorded in [`V4_ARCHITECTURE_AUDIT_2.md`](V4_ARCHITECTURE_AUDIT_2.md).

Future changes must preserve stable IDs. Requirements may be amended or retired with an ADR/baseline reason; IDs are not silently reused.
