# V4 CI and initial supply-chain controls

Status: WP-004 validation baseline; hosted GitHub execution awaits review and push.

`.github/workflows/validation.yml` runs on every pull request and every push to
`main`. There are no path filters: `.github/**` and other shared paths must not
silently evade validation. The two read-only jobs keep failures attributable to
either repository/V3 verification or V4 install and verification. No release,
deployment, AWS credentials, GitHub secrets, or OIDC token permission is used.

The repository/V3 job runs the root `node --test`, the focused WP-001 isolation
tests, the tracked-file credential tripwire, and the frozen V3 boundary build.
The boundary build checks the frozen runtime digest and prepares only the 42
allowlisted V3 publish files. `.github/**` is a shared/root path under WP-001,
so a future push of this CI configuration may legitimately cause a Netlify V3
build containing the unchanged frozen artifact.

The V4 job reads Node 24 from `v4/.nvmrc`, explicitly establishes npm 11.6.2,
checks that no ambient AWS credential or account setting is present, and runs
`npm ci` from `v4/`. `npm run verify` then exercises package and contract tests,
infrastructure tests, credential-free dev/prod CDK synthesis, offline preview,
and the inert V4 build. The infrastructure tests and synthesis guards require
six stacks and zero resources in each environment. No bootstrap, live CDK diff,
or AWS deployment is attempted. Live CDK diff belongs to the later deliberate
release workflow, when authorized AWS roles and resources exist. Actual hosted
CI execution and repository branch-protection settings must be checked after
the reviewed commit is pushed; local tests do not prove those settings.

## Immutable actions

| Action | Full SHA used in workflow | Verified release | Purpose |
| --- | --- | --- | --- |
| `actions/checkout` | `3d3c42e5aac5ba805825da76410c181273ba90b1` | `v7.0.1` | Fresh checkout with credential persistence disabled |
| `actions/setup-node` | `820762786026740c76f36085b0efc47a31fe5020` | `v7.0.0` | Establish the repository's Node 24 line |

The release-to-SHA mapping was checked against the upstream Git tags at
implementation time. Workflow references use only full SHAs. Updates proposed
by Dependabot must retain immutable pins and pass the repository policy tests.

## Dependency and credential gates

The committed `v4/package-lock.json` and `npm ci` prevent opportunistic lock
updates during validation. `npm audit --audit-level=high` includes both runtime
and development dependencies in the lockfile, and fails the job on high or
critical advisories. There is no blanket suppression or automatic dependency
upgrade. Any exception requires human governance.

`npm audit signatures` checks npm registry signatures and any available
provenance attestations for installed packages. At WP-004 implementation time,
all 26 audited packages had verified registry signatures and 9 had verified
attestations. This does **not** prove that every package has provenance, nor
does it audit project source. The tripwire in `scripts/check-ci-secrets.mjs`
checks tracked NUL-free UTF-8/ASCII-compatible text for obvious AWS access-key
IDs, GitHub token shapes, and private-key headers; it prints only file names
and signal types. Files containing a NUL byte, including UTF-16 text, are
deliberately outside this narrow guard's detection boundary. It is not
comprehensive secret detection. Any real leaked credential still requires
rotation and incident handling.

Dependabot checks npm dependencies under `/v4` and GitHub Actions under `/`
weekly, with at most three open PRs per ecosystem. It does not auto-merge or
deploy. No formal SBOM or paid supply-chain service is part of this baseline.
OpenAPI linting is deferred until the authorized API contract exists; the
current contract-reservation test remains in `npm run verify`. GitHub OIDC,
environment approvals, AWS roles, and deployment workflows belong to later
authorized work packages.

This package creates no AWS resources and introduces $0 AWS recurring cost.
GitHub Actions minute/billing implications depend on the owner's plan and are
not established by this repository configuration.
