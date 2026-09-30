# V3 delivery-incident dependency-security exception

Status: HUMAN-APPROVED / UNRESOLVED VULNERABILITY / DELIVERY NOT YET AUTHORIZED

## Authority and scope

- Record ID: V3-DELIVERY-2026-09-30.
- Human approval recorded: September 30, 2026, in the repository-agent conversation.
- Approver and remediation owner: the human repository owner who explicitly approved this exception.
- Authority: [ADR-016](adr/ADR-016-supply-chain.md), [V4 architecture §26.4](V4_ARCHITECTURE.md#264-vulnerability-gate), and [CI supply-chain policy](V4_CI_SUPPLY_CHAIN.md#dependency-and-credential-gates).
- Bound V3 correction: `0bec052ecf4471b91a37219424817608f9a57484` (`Handle Netlify comment-only app shell transform`).
- Purpose: complete only that reviewed V3 delivery-incident correction. This governance record does not amend the correction or reopen finalized WP-006A.

The human explicitly approved the proposed V3-only, time-bounded exception.
The current execution authorization is **exception documentation and one local
governance commit only**. Push, publication, production verification, and a patch
tag/release still require separate explicit authorization. This record is not
evidence that any delivery action has occurred or that a release gate is green.

## Exact unresolved findings

Installed dependency chain:

`aws-cdk-lib@2.269.0 -> minimatch@10.2.5 -> brace-expansion@5.0.9`

Affected installed path:

`v4/node_modules/aws-cdk-lib/node_modules/brace-expansion`

| Advisory | Published severity | Behavior | First fixed brace-expansion version on the affected branch |
| --- | --- | --- | --- |
| [CVE-2026-102276 / GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) | High | Crafted comma/brace patterns can exhaust recursion or argument limits and terminate an uncaught Node process. | 5.0.10 |
| [CVE-2026-102278 / GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) | High | Crafted nested braces can exhaust the stack and terminate an uncaught Node process. | 5.0.11 |
| [CVE-2026-102277 / GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) | Moderate | Quadratic expansion can consume CPU, block the event loop, and cause timeouts. | 5.0.12 |

All three require attacker influence over a pattern reaching expansion. Their
published impacts are availability, not confidentiality or integrity. Published
severities are not downgraded by this exception. Version `5.0.12` is required to
clear all three. No other advisory, package version, dependency change, or release
is covered.

The accepted eligibility review found that official CDK releases through
`2.271.0` still bundle `5.0.9`; ordinary consumer overrides cannot replace the
bundled copy. [AWS issue #38932](https://github.com/aws/aws-cdk/issues/38932) and
[PR #38929](https://github.com/aws/aws-cdk/pull/38929) track repair. This is dated
review evidence, not a permanent assertion of upstream status; rechecks below
are mandatory before consequential delivery actions.

## Rationale and current reachability

The V3 correction does not change any dependency or lockfile. Releasing the
reviewed V3 correction does not ship the affected CDK dependency in V3.

Inspection of the installed CDK found minimatch calls for asset-exclusion
patterns, construct ID/path selectors, and stack-bundling context patterns.
Minimatch passes its pattern argument into brace-expansion; matched filenames
and construct paths are not automatically treated as expansion patterns.
The stack-bundling default is `**`. The pattern-length limit is not a sufficient
mitigation for these advisories.

The current ShelfState baseline has no direct brace-expansion/minimatch use,
configured asset-exclusion/construct-selector input path, or identified path
from public application data, network input, or AWS-returned identifiers into
the affected pattern argument. Source/configuration changes or untrusted
repository inputs could introduce such a path. Tooling-only does not mean
unexploitable.

- The 42-file V3 publication contains neither V4 nor CDK/node_modules content.
- V4 frontend/backend remain placeholders; the existing V4 build contains no application code.
- Dev/prod assemblies each contain six stacks and zero resources. Their file assets are stack templates, not Lambda/application packages.
- The vulnerable dependency exists in developer node_modules and the V4 CI installation and is available to CDK tooling.
- No current unauthenticated V3 production-user path to vulnerable expansion was identified. This is repository/artifact evidence against the established deployment baseline, not a new AWS inventory.

Current validation is credential-free. A future credentialed CDK deployment
could already have performed AWS operations before a crash or timeout; retries
could compound partial-state problems. Such deployment and retry scenarios are
not covered by this exception.

## Covered actions, subject to separate execution authorization

Exception coverage is limited to the minimum V3 incident-release sequence:

1. Push/review the bound correction with this documentation and collect hosted validation evidence.
2. Perform one Netlify V3 patch publication and its production/browser/service-worker verification.
3. After successful verification, create the corresponding V3 patch tag/release.

A push connected to automatic Netlify publication must be authorized as a
production-affecting action. Successful completion of the authorized incident
release sequence ends the exception; it does not cover another release.

## Prohibited actions

- WP-006B or WP-007 work, CDK bootstrap, or V4/AWS deployment.
- Dependency modification, node_modules patching, lockfile surgery, private vendoring, postinstall replacement, or using the unmerged upstream PR.
- Audit suppression, advisory allowlisting, lower severity thresholds, fabricated passing checks, disabling security jobs, or workflow weakening.
- Branch-protection bypass, removal of required checks, or unauthorized GitHub configuration changes.
- New untrusted/generated glob inputs or other scope/reachability changes under this exception.
- Altering the bound correction commit or creating, moving, or modifying `v3.9.0`.
- Any unrelated application, infrastructure, account, identity, or deployment change.

## Compensating controls and delivery gates

1. Preserve the exact reviewed correction, dependency graph, and V3 publication allowlist. Require all non-excepted checks to pass.
2. Keep V4 verification credential-free and the V3 build isolated from CDK dependencies. Do not introduce new pattern inputs or execute unreviewed input through the affected tooling under this exception.
3. Keep `npm audit --audit-level=high` unchanged and visibly failing for these unresolved findings. The exception is human risk acceptance, not a technical fix or a passing audit.
4. Before each consequential push, publication, tag, or release action, recheck official CDK availability and current audit findings. Confirm the bound revision, dependency graph, scope, and reachability remain unchanged. Stop on a new relevant vulnerability or any non-excepted failure.
5. Record hosted results accurately. A V4 job failing at audit may skip later signature/full-verification steps; skipped steps are not passing evidence. Separately collected verification must be clearly distinguished from hosted results.
6. If effective branch protection or another delivery gate requires the failed check to pass, stop for human review. This exception supplies no technical bypass and authorizes no protection/workflow change.
7. Verify the V3 publication boundary and production behavior before completing the incident release. No later V4/AWS work inherits this exception.

## Expiration and remediation obligation

Absolute expiry: **October 7, 2026, 23:59 America/Phoenix (UTC-07:00)**.

The exception expires earlier upon any of:

- An official suitable `aws-cdk-lib` release actually bundling the complete fix for all three advisories; a merged PR alone is not sufficient evidence.
- Completion of the V3 incident release.
- A change in scope or reachability.
- A new relevant vulnerability.
- Human revocation.

There is no automatic renewal. After expiry, no further exception-dependent
action is permitted. Expiry does not authorize an automatic rollback, dependency
upgrade, or other mutation.

The human repository owner is responsible for reviewing upstream repair and
arranging prompt, separately authorized remediation once a suitable official
release exists. Remediation must verify the actual bundled fixed version and
rerun clean-install, dependency audit, signature/attestation, full verification,
and infrastructure checks. The exception must then be closed with evidence;
the vulnerability must not be described as fixed merely because a release exists.

## Publication preservation evidence

Documentation recording is based on the reviewed correction state, without
regenerating the artifact:

- Publication source and existing `v3-dist/`: exactly 42 files with matching file inventories and bytes.
- Reviewed correction's normalized frozen-runtime digest: `a4b25c4da79431dedb37a1213d74bac55d8df42e86eecac296a7d88c06cd8caa`.
- Raw path-qualified aggregate digest of both local source and existing artifact: `eb98f7b19583e3e20734eae7c2b9abf9a0a1a907a00235f66fdc5803f3bb3585`.
- Aggregate method: SHA-256 over sorted relative path, NUL, file SHA-256 hex, and newline for each publication file. The normalized digest uses the existing deployment-boundary text-normalization rule; the raw digest uses exact local bytes.

These values describe the local reviewed correction, not a new production
publication or any change to the historical `v3.9.0` artifact.

**The dependency vulnerability remains unresolved. The audit remains failing and
must never be represented as passing.**
