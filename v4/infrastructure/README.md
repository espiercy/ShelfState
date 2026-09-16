# ShelfState V4 CDK environment foundation

WP-003 models the V4 infrastructure topology without creating AWS resources.
Every synthesized stack is intentionally empty. Later work packages place
approved resources into the capability boundary that owns them.

## Environments and accounts

Every synth must explicitly select `dev` or `prod`; missing or other values
fail. Both environments use `us-west-2` for ordinary runtime boundaries. The
separate CloudFront certificate boundary uses `us-east-1`.

Local synth does not require an AWS account or credentials. If a concrete
account-qualified assembly is needed later, supply the non-secret, environment-
specific `SHELFSTATE_DEV_AWS_ACCOUNT_ID` or `SHELFSTATE_PROD_AWS_ACCOUNT_ID`.
Each must be a 12-digit account ID. When omitted, the synthesized assembly
records `unknown-account` while retaining the explicit region for local review.
The model deliberately ignores default profiles,
`CDK_DEFAULT_ACCOUNT`, branch names, host names, and deployment order.

Names use `shelfstate-v4-<environment>-<capability>`. Managed resources inherit
the minimal tags `Project=ShelfState`, `Environment=<environment>`, and
`ManagedBy=AWS-CDK`. Production stacks have termination protection enabled.

## Capability stacks

- `edge-certificate` (`us-east-1`) — future CloudFront certificate ownership.
- `edge-delivery` (`us-west-2`) — future private static delivery and edge path;
  it has the topology's only dependency, on `edge-certificate`.
- `identity-session` — future identity, account, session, and auth-transaction
  persistence and authentication infrastructure.
- `library-api` — future library persistence, HTTP API, and synchronous library
  capability.
- `operations-lifecycle` — future asynchronous library operations and account
  lifecycle capability.
- `recovery-observability` — future backup, recovery, logging, alarm, and cost
  controls.

No stack contains a resource in WP-003.

## Local commands

- `npm run infra:test` validates environment selection, topology, synthesized
  templates, exclusions, and stateful-resource safeguards.
- `npm run infra:synth:dev` writes `cdk.out/dev/`.
- `npm run infra:synth:prod` writes `cdk.out/prod/`.
- `npm run infra:synth` performs both syntheses.
- `npm run infra:preview` prints an offline inventory and SHA-256 for every
  synthesized template.

`cdk.out/` is ignored and remains beneath the V4 package. No command invokes
`cdk deploy` or `cdk bootstrap`. A meaningful `cdk diff` compares against live
deployed state and may require account/bootstrap access, so an operational diff
wrapper is intentionally reserved for the later authorized deployment package.
The offline preview is the review surface for WP-003.

## Stateful-resource guardrail

Synth validation inspects future DynamoDB tables, Cognito pools, data-bearing
S3 buckets, backup configuration, and production DNS/certificate bindings.
Each must declare `Metadata.ShelfStateStatefulPolicy`:

- `retained` requires both deletion and update-replacement retention; production
  DynamoDB/Cognito/backup resources also require their service-specific
  deletion/lock protection.
- `ephemeral` is limited to S3 buckets with an enabled expiration rule.
- `destroy-approved` is allowed only in development and remains an explicit
  review signal.

The guardrail proves a convention and failure mechanism, not the final policy
for resources that later packages have not yet designed.

## Dependencies and cost

- `aws-cdk-lib` (runtime): CDK v2 constructs, stacks, synthesis, and assertions;
  native Node.js cannot model or synthesize CloudFormation constructs.
- `constructs` (runtime): required CDK construct-tree peer used by
  `aws-cdk-lib`; native Node.js has no construct model.
- `aws-cdk` (development): local CDK CLI for deterministic synth commands;
  native Node.js has no CDK cloud-assembly CLI.

WP-003 performs no AWS calls, creates no resources, and costs `$0`. A future
authorized bootstrap may create usage-driven S3/ECR support storage; bootstrap
is not part of this work package.
