// LOCAL REVIEW MATERIAL ONLY. No SDK, CDK execution, credential or network access.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { CAPABILITY_DEFINITIONS } from "../lib/capabilities.mjs";
import { resolveEnvironmentConfig } from "../lib/environment.mjs";
import { stackName } from "../lib/naming.mjs";

export const UPSTREAM_SHA256 = "a484ad768d3446874161044d986bec096e201a54037c8ce93ed5a0d215e1dd25";
export const VARIANT = "ShelfState: Dev isolated modern bootstrap";
export const REVISION = 2;
export const REGIONS = Object.freeze(["us-west-2", "us-east-1"]);
export const QUALIFIER = "hnb659fds";
export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
export const serialize = value => JSON.stringify(value, null, 2) + "\n";
const sub = value => ({ "Fn::Sub": value });
const ref = value => ({ Ref: value });
const policy = Statement => ({ Version: "2012-10-17", Statement });
const allow = (Sid, Action, Resource, Condition) => ({ Sid, Effect: "Allow", Action, Resource, ...(Condition ? { Condition } : {}) });
const deny = (Sid, Action, Resource, Condition) => ({ ...allow(Sid, Action, Resource, Condition), Effect: "Deny" });

export function devStackNames(region) {
  assert.ok(REGIONS.includes(region), "Unsupported bootstrap region");
  const config = resolveEnvironmentConfig("dev");
  return CAPABILITY_DEFINITIONS.filter(d => config[d.regionSource] === region).map(d => stackName(config, d.key));
}

export const CHANGE_SET_ACTIONS = Object.freeze([
  "cloudformation:DescribeChangeSet", "cloudformation:ExecuteChangeSet", "cloudformation:DeleteChangeSet",
]);
export const STACK_READ_ACTIONS = Object.freeze([
  "cloudformation:DescribeStacks", "cloudformation:DescribeStackEvents",
  "cloudformation:DescribeStackResources", "cloudformation:GetTemplate",
]);

export function deploymentPolicy(region, account = "${ACCOUNT_ID}") {
  const stacks = devStackNames(region).map(name => `arn:aws:cloudformation:${region}:${account}:stack/${name}/*`);
  const bucket = `cdk-${QUALIFIER}-assets-${account}-${region}`;
  const execution = `arn:aws:iam::${account}:role/cdk-${QUALIFIER}-cfn-exec-role-${account}-${region}`;
  return policy([
    allow("PrepareReviewedDevChangeSet", ["cloudformation:CreateChangeSet"], stacks, {
      StringEquals: { "cloudformation:RoleArn": execution },
      Null: { "cloudformation:RoleArn": "false" },
    }),
    allow("DevChangeSets", [...CHANGE_SET_ACTIONS], stacks),
    allow("ReadDevStacks", [...STACK_READ_ACTIONS], stacks),
    allow("DevStackTags", ["cloudformation:TagResource", "cloudformation:UntagResource"], stacks),
    // CDK invokes this independently even for a non-executing change-set preview.
    allow("DevTerminationProtection", ["cloudformation:UpdateTerminationProtection"], stacks),
    allow("ReadToolkitOutputs", ["cloudformation:DescribeStacks"], [`arn:aws:cloudformation:${region}:${account}:stack/CDKToolkit/*`]),
    allow("PassRegionalExecutionRole", ["iam:PassRole"], [execution], {
      StringEquals: { "iam:PassedToService": "cloudformation.amazonaws.com" },
    }),
    allow("ReadBootstrapVersion", ["ssm:GetParameter", "ssm:GetParameters"], [`arn:aws:ssm:${region}:${account}:parameter/cdk-bootstrap/${QUALIFIER}/version`]),
    allow("ReadAssetBucketMetadata", ["s3:GetBucketLocation", "s3:GetEncryptionConfiguration", "s3:ListBucket"], [`arn:aws:s3:::${bucket}`]),
    allow("ReadRegionalAssets", ["s3:GetObject", "s3:GetObjectVersion"], [`arn:aws:s3:::${bucket}/*`]),
  ]);
}

function intrinsicPolicy(region) {
  // Convert only the fixed symbolic account token; no caller-controlled template fragments.
  const visit = value => typeof value === "string" && value.includes("${ACCOUNT_ID}")
    ? sub(value.replaceAll("${ACCOUNT_ID}", "${AWS::AccountId}"))
    : Array.isArray(value) ? value.map(visit)
    : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, visit(v)])) : value;
  return visit(deploymentPolicy(region));
}

export function customizeBootstrap(upstream, rawBytes) {
  assert.equal(sha256(rawBytes), UPSTREAM_SHA256, "Upstream bootstrap bytes changed: human review required");
  const template = structuredClone(upstream);
  const p = template.Parameters;
  // Keep CLI parameters, but reject non-reviewed variants rather than trusting defaults.
  for (const name of ["TrustedAccounts", "TrustedAccountsForLookup", "FileAssetsBucketName", "ContainerAssetsRepositoryName", "InputPermissionsBoundary"]) p[name].AllowedValues = [""];
  p.Qualifier.AllowedValues = [QUALIFIER];
  p.FileAssetsBucketKmsKeyId.Default = "AWS_MANAGED_KEY";
  p.FileAssetsBucketKmsKeyId.AllowedValues = ["AWS_MANAGED_KEY"];
  p.UseExamplePermissionsBoundary.AllowedValues = ["false"];
  p.PublicAccessBlockConfiguration.AllowedValues = ["true"];
  p.DenyExternalId.AllowedValues = ["true"];
  p.BootstrapVariant.Default = VARIANT;
  p.BootstrapVariant.AllowedValues = [VARIANT];
  p.CloudFormationExecutionPolicies.AllowedPattern = "^arn:aws:iam::[0-9]{12}:policy/ShelfStateV4DevCfnExecution(West|WestEdge|East)$";
  // No AdministratorAccess fallback and no caller-selected union of execution policies.
  // CLI parameter retained; exact expected argument is separately checked in intent below.
  template.Mappings = { ShelfStateRegions: {
    "us-west-2": { ExecutionPolicyName: "ShelfStateV4DevCfnExecutionWest" },
    "us-east-1": { ExecutionPolicyName: "ShelfStateV4DevCfnExecutionEast" },
  } };
  template.Conditions.ShelfStateWest = { "Fn::Equals": [ref("AWS::Region"), "us-west-2"] };
  const deploy = template.Resources.DeploymentActionRole.Properties;
  deploy.AssumeRolePolicyDocument.Statement = deploy.AssumeRolePolicyDocument.Statement.slice(0, 2);
  deploy.Policies = [{ PolicyName: "shelfstate-dev-only", PolicyDocument: {
    "Fn::If": ["ShelfStateWest", intrinsicPolicy("us-west-2"), intrinsicPolicy("us-east-1")],
  } }];
  delete deploy.ManagedPolicyArns;
  template.Resources.CloudFormationExecutionRole.Properties.ManagedPolicyArns = [{ "Fn::Sub": [
    "arn:${AWS::Partition}:iam::${AWS::AccountId}:policy/${ExecutionPolicyName}",
    { ExecutionPolicyName: { "Fn::FindInMap": ["ShelfStateRegions", ref("AWS::Region"), "ExecutionPolicyName"] } },
  ] }, { "Fn::If": ["ShelfStateWest", sub("arn:${AWS::Partition}:iam::${AWS::AccountId}:policy/ShelfStateV4DevCfnExecutionWestEdge"), ref("AWS::NoValue")] }];
  // Other-region deployment fails FindInMap. Conditional upstream KMS/example resources
  // remain in the contract but cannot be enabled by the constrained parameters.
  template.Metadata = { ShelfStateBootstrap: { UpstreamVersion: 32, UpstreamSha256: UPSTREAM_SHA256, Variant: VARIANT, Revision: REVISION } };
  template.Outputs.ShelfStateVariant = { Value: VARIANT };
  template.Outputs.ShelfStateVariantRevision = { Value: String(REVISION) };
  return template;
}

export function bootstrapIntent(region, account = "${ACCOUNT_ID}") {
  devStackNames(region);
  return {
    status: "LOCAL_REVIEW_ONLY_NOT_AUTHORIZED", region, account,
    stackName: "CDKToolkit", terminationProtection: true, execute: false,
    authority: "AccountMaintenanceAdmin", explicitMfa: true, maximumSessionSeconds: 3600,
    parameters: { Qualifier: QUALIFIER, BootstrapVariant: VARIANT,
      CloudFormationExecutionPolicies: (region === "us-west-2" ? ["West", "WestEdge"] : ["East"])
        .map(suffix => `arn:aws:iam::${account}:policy/ShelfStateV4DevCfnExecution${suffix}`).join(","),
      FileAssetsBucketKmsKeyId: "AWS_MANAGED_KEY", TrustedAccounts: "", TrustedAccountsForLookup: "",
      FileAssetsBucketName: "", ContainerAssetsRepositoryName: "", InputPermissionsBoundary: "",
      UseExamplePermissionsBoundary: "false", PublicAccessBlockConfiguration: "true", DenyExternalId: "true" },
    requiredGates: ["dependency-security", "WP-006B-live-proof", "generated-id-adjudication", "dns-validation-adjudication", "policy-review", "policy-creation-authorization", "bootstrap-authorization"],
  };
}

export function assertBootstrapIntent(candidate, region, account = "${ACCOUNT_ID}") {
  assert.deepEqual(candidate, bootstrapIntent(region, account), "Bootstrap intent differs from reviewed local model");
}

export function githubDevAssumptions(account = "${ACCOUNT_ID}") {
  return policy([allow("ExactRegionalDevBootstrapRoles", ["sts:AssumeRole"], REGIONS.flatMap(region =>
    ["deploy", "file-publishing"].map(role => `arn:aws:iam::${account}:role/cdk-${QUALIFIER}-${role}-role-${account}-${region}`)))]);
}

const account = "${ACCOUNT_ID}";
const zone = "arn:aws:route53:::hostedzone/${SELECTED_ZONE_ID}";
const healthRole = `arn:aws:iam::${account}:role/shelfstate-v4-dev-health`;
const boundaryArn = `arn:aws:iam::${account}:policy/ShelfStateV4DevHealthBoundary`;
const logGroup = `arn:aws:logs:us-west-2:${account}:log-group:/aws/lambda/shelfstate-v4-dev-health`;
const tags = { "aws:RequestTag/Project": "ShelfState", "aws:RequestTag/Environment": "dev", "aws:RequestTag/ManagedBy": "AWS-CDK" };

export function route53Changes(east = false, boundedPattern = false) {
  const names = east ? (boundedPattern ? "_*.dev.shelfstate.codecorax.com" : "${VALIDATION_RECORD_NAME}") : "dev.shelfstate.codecorax.com";
  const nameKey = "route53:ChangeResourceRecordSetsNormalizedRecordNames";
  const typesKey = "route53:ChangeResourceRecordSetsRecordTypes";
  const actionsKey = "route53:ChangeResourceRecordSetsActions";
  return allow(east ? "CertificateValidationOnly" : "DevAliasesOnly", ["route53:ChangeResourceRecordSets"], [zone], {
    [boundedPattern ? "ForAllValues:StringLike" : "ForAllValues:StringEquals"]: { [nameKey]: [names] },
    "ForAllValues:StringEquals": { ...(!boundedPattern ? { [nameKey]: [names] } : {}), [typesKey]: east ? ["CNAME"] : ["A", "AAAA"], [actionsKey]: east ? ["CREATE", "UPSERT"] : ["CREATE", "UPSERT", "DELETE"] },
    Null: { [nameKey]: "false", [typesKey]: "false", [actionsKey]: "false" },
  });
}

function supportReads(region) {
  return [
    allow("ReadSelectedZone", ["route53:GetHostedZone", "route53:ListResourceRecordSets"], [zone]),
    allow("PollDnsChange", ["route53:GetChange"], ["arn:aws:route53:::change/*"]),
    allow("ReadRegionalTemplateAssets", ["s3:GetObject", "s3:GetObjectVersion"], [`arn:aws:s3:::cdk-${QUALIFIER}-assets-${account}-${region}/*`]),
    allow("ResolveBootstrapVersion", ["ssm:GetParameters"], [`arn:aws:ssm:${region}:${account}:parameter/cdk-bootstrap/${QUALIFIER}/version`]),
  ];
}

export function healthBoundary() {
  const actions = ["logs:CreateLogStream", "logs:PutLogEvents"];
  const resources = [`${logGroup}:log-stream:*`];
  // Infrastructure creates the group. Explicit denies also cap same-account
  // resource-policy grants to role sessions; implicit boundary denial cannot.
  return policy([
    allow("WriteHealthLogsOnly", actions, resources),
    { Sid: "DenyNonRuntimeLogActions", Effect: "Deny", NotAction: actions, Resource: "*" },
    { Sid: "DenyOtherLogResources", Effect: "Deny", Action: actions, NotResource: resources },
  ]);
}

export function westExecutionPolicy() {
  const bucket = `arn:aws:s3:::shelfstate-v4-dev-static-${account}-us-west-2`;
  const distribution = `arn:aws:cloudfront::${account}:distribution/\${DISTRIBUTION_ID}`;
  const api = "arn:aws:apigateway:us-west-2::/apis/${API_ID}";
  const fn = `arn:aws:lambda:us-west-2:${account}:function:shelfstate-v4-dev-health`;
  return policy([
    allow("CreateStaticBucket", ["s3:CreateBucket"], [bucket], { StringEquals: { "s3:LocationConstraint": "us-west-2" } }),
    allow("ConfigureStaticBucket", ["s3:GetBucketLocation", "s3:ListBucket", "s3:GetBucketPolicy", "s3:PutBucketPolicy", "s3:DeleteBucketPolicy", "s3:GetBucketPublicAccessBlock", "s3:PutBucketPublicAccessBlock", "s3:GetBucketOwnershipControls", "s3:PutBucketOwnershipControls", "s3:GetEncryptionConfiguration", "s3:PutEncryptionConfiguration", "s3:GetBucketTagging", "s3:PutBucketTagging", "s3:DeleteBucket"], [bucket]),
    allow("CreateTaggedDistribution", ["cloudfront:CreateDistribution"], ["*"], { StringEquals: tags }),
    allow("ManageDevDistribution", ["cloudfront:GetDistribution", "cloudfront:GetDistributionConfig", "cloudfront:UpdateDistribution", "cloudfront:DeleteDistribution", "cloudfront:ListTagsForResource", "cloudfront:TagResource", "cloudfront:UntagResource"], [distribution]),
    allow("CreateOacAndPoliciesPendingAdjudication", ["cloudfront:CreateOriginAccessControl", "cloudfront:CreateCachePolicy", "cloudfront:CreateOriginRequestPolicy", "cloudfront:CreateResponseHeadersPolicy"], ["*"]),
    ...[["OriginAccessControl", "origin-access-control", "OAC_ID"], ["CachePolicy", "cache-policy", "CACHE_POLICY_ID"], ["OriginRequestPolicy", "origin-request-policy", "ORIGIN_REQUEST_POLICY_ID"], ["ResponseHeadersPolicy", "response-headers-policy", "RESPONSE_HEADERS_POLICY_ID"]].map(([name, type, id]) =>
      allow(`Manage${name}`, [`cloudfront:Get${name}`, `cloudfront:Get${name}Config`, `cloudfront:Update${name}`, `cloudfront:Delete${name}`], [`arn:aws:cloudfront::${account}:${type}/\${${id}}`])),
    route53Changes(),
    allow("CreateNamedHttpApi", ["apigateway:POST"], ["arn:aws:apigateway:us-west-2::/apis"], { StringEquals: { "apigateway:Request/ApiName": "shelfstate-v4-dev-health", ...tags } }),
    allow("ManageHttpApi", ["apigateway:GET", "apigateway:PATCH", "apigateway:DELETE"], [api]),
    allow("CreateHttpChildren", ["apigateway:POST"], [`${api}/integrations`, `${api}/routes`, `${api}/stages`]),
    allow("ManageHttpChildren", ["apigateway:GET", "apigateway:PATCH", "apigateway:DELETE"], [`${api}/integrations/\${INTEGRATION_ID}`, `${api}/routes/\${ROUTE_ID}`, `${api}/stages/$default`]),
    allow("CreateHealthFunction", ["lambda:CreateFunction"], [fn], { StringEquals: tags }),
    allow("ManageHealthFunction", ["lambda:GetFunction", "lambda:GetFunctionConfiguration", "lambda:UpdateFunctionCode", "lambda:UpdateFunctionConfiguration", "lambda:DeleteFunction", "lambda:GetPolicy", "lambda:RemovePermission", "lambda:ListTags", "lambda:TagResource", "lambda:UntagResource"], [fn]),
    allow("ApiMayInvokeHealth", ["lambda:AddPermission"], [fn], { StringEquals: { "lambda:Principal": "apigateway.amazonaws.com" } }),
    allow("HealthLogGroup", ["logs:CreateLogGroup", "logs:DeleteLogGroup", "logs:PutRetentionPolicy", "logs:DeleteRetentionPolicy", "logs:ListTagsForResource", "logs:TagResource", "logs:UntagResource"], [logGroup, `${logGroup}:*`]),
    allow("FindLogGroupMetadata", ["logs:DescribeLogGroups"], ["*"], { StringEquals: { "aws:RequestedRegion": "us-west-2" } }),
    allow("CreateBoundedHealthRole", ["iam:CreateRole"], [healthRole], { StringEquals: { "iam:PermissionsBoundary": boundaryArn, ...tags } }),
    allow("ManageHealthRole", ["iam:GetRole", "iam:DeleteRole", "iam:GetRolePolicy", "iam:ListRolePolicies", "iam:ListAttachedRolePolicies", "iam:PutRolePolicy", "iam:DeleteRolePolicy", "iam:UpdateAssumeRolePolicy", "iam:TagRole", "iam:UntagRole"], [healthRole]),
    deny("NeverChangeApplicationBoundary", ["iam:PutRolePermissionsBoundary", "iam:DeleteRolePermissionsBoundary"], [healthRole]),
    deny("NeverEditBoundaryPolicy", ["iam:CreatePolicy", "iam:CreatePolicyVersion", "iam:SetDefaultPolicyVersion", "iam:DeletePolicyVersion", "iam:DeletePolicy"], [boundaryArn]),
    allow("PassHealthToLambdaOnly", ["iam:PassRole"], [healthRole], { StringEquals: { "iam:PassedToService": "lambda.amazonaws.com" } }),
    ...supportReads("us-west-2"),
  ]);
}

export function eastExecutionPolicy() {
  const cert = `arn:aws:acm:us-east-1:${account}:certificate/\${CERTIFICATE_ID}`;
  return policy([
    allow("RequestExactPublicCertificate", ["acm:RequestCertificate"], ["*"], {
      StringEquals: { ...tags, "aws:RequestedRegion": "us-east-1", "acm:ValidationMethod": "DNS", "acm:Export": "DISABLED" },
      "ForAllValues:StringEquals": { "acm:DomainNames": ["dev.shelfstate.codecorax.com"] },
      Null: { "acm:DomainNames": "false", "acm:CertificateAuthority": "true" },
    }),
    allow("ManageExactCertificate", ["acm:DescribeCertificate", "acm:DeleteCertificate", "acm:ListTagsForCertificate", "acm:AddTagsToCertificate", "acm:RemoveTagsFromCertificate", "acm:UpdateCertificateOptions"], [cert]),
    route53Changes(true), ...supportReads("us-east-1"),
  ]);
}

// Proposals, NOT merged into an effective policy. Generated IDs/record names are
// intentionally unresolved in the policy snapshots until a human selects a process.
export function pendingDecisions() {
  return {
    status: "HUMAN_ADJUDICATION_REQUIRED_NOT_DEPLOYABLE",
    generatedIds: {
      choices: ["staged exact-ID binding (current lifecycle policy placeholders)", "separately approved bounded initial-ID patterns followed by exact-ID tightening"],
      initialPatterns: { cloudfront: ["distribution/* (ownership tags required)", "origin-access-control/*", "cache-policy/*", "origin-request-policy/*", "response-headers-policy/*"], api: ["/apis/* and selected integration/route/stage child paths"], certificate: ["certificate/* (ownership tags required)"] },
      residual: "Untagged CloudFront policy/OAC IDs cannot be name-isolated. Broader initial lifecycle patterns can reach unrelated resources. No blanket pattern policy is selected or emitted.",
    },
    dnsValidation: { choices: ["staged exact name", "bounded pattern with explicit residual-risk approval"], boundedPatternCandidate: route53Changes(true, true),
      residual: "IAM glob is not an ACM-token grammar; record-value/alias-target restrictions need reviewed template/evidence checks. DELETE of validation CNAME is not proposed." },
    createAndReadWildcards: [
      { actions: ["cloudfront:CreateDistribution"], conditions: "Project/Environment/ManagedBy request tags; no exact future ID", residual: "Additional tagged distributions and spend are possible" },
      { actions: ["cloudfront:CreateOriginAccessControl", "cloudfront:CreateCachePolicy", "cloudfront:CreateOriginRequestPolicy", "cloudfront:CreateResponseHeadersPolicy"], conditions: "No supported name/tag creation restriction", residual: "Account-wide creation for these types; not an update/delete grant" },
      { actions: ["acm:RequestCertificate"], conditions: "Exact domain set, DNS, public/non-exportable, east region, request tags", residual: "Multiple certificates for the same name are possible" },
      { actions: ["logs:DescribeLogGroups"], conditions: "west endpoint only", residual: "Log-group metadata listing, not log content" },
    ],
  };
}

// Partition whole, unchanged statements; no action/resource/condition widening.
export function westExecutionPolicies() {
  const regional = [], edge = [];
  for (const statement of westExecutionPolicy().Statement) {
    const services = new Set(statement.Action.map(action => action.split(":")[0]));
    assert.equal(services.size, 1, "Review mixed-service statement before partitioning");
    const [service] = services;
    assert.ok(["s3", "apigateway", "lambda", "logs", "ssm", "cloudfront", "route53", "iam"].includes(service));
    (["cloudfront", "route53", "iam"].includes(service) ? edge : regional).push(statement);
  }
  return [policy(regional), policy(edge)];
}

export function artifactModels() {
  const [west, westEdge] = westExecutionPolicies();
  return {
    "execution-west.policy.json": west,
    "execution-west-edge.policy.json": westEdge,
    "execution-east.policy.json": eastExecutionPolicy(),
    "health-runtime-boundary.policy.json": healthBoundary(),
    "github-dev-assumptions.policy.json": githubDevAssumptions(),
    "pending-decisions.json": pendingDecisions(),
    "bootstrap-intent.json": REGIONS.map(region => bootstrapIntent(region)),
  };
}

// A future WP-007 west template MUST pass this guard; this slice creates no such
// template. IAM record-name/type restrictions cannot validate an alias target.
export function assertDevAliasTargets(template, distributionLogicalId, selectedZoneId) {
  assert.ok(!Object.hasOwn(template, "Transform"), "Template transforms cannot prove native alias representation");
  assert.ok(template.Resources && !Array.isArray(template.Resources), "Native Resources map required");
  assert.equal(template.Resources?.[distributionLogicalId]?.Type, "AWS::CloudFront::Distribution");
  assert.ok(!Object.hasOwn(template.Resources[distributionLogicalId], "Condition"), "Intended distribution must be unconditional");
  for (const resource of Object.values(template.Resources)) {
    assert.equal(typeof resource?.Type, "string", "Unknown resource representation");
    assert.ok(!["AWS::Route53::RecordSetGroup", "AWS::CloudFormation::Stack", "AWS::CloudFormation::CustomResource"].includes(resource.Type)
      && !resource.Type.startsWith("Custom::"), "Grouped, nested or custom records are not supported in the guarded stack");
  }
  const records = Object.values(template.Resources).filter(r => r.Type === "AWS::Route53::RecordSet");
  assert.equal(records.length, 2, "Exactly dev A/AAAA alias records are required");
  assert.deepEqual(records.map(r => r.Properties.Type).sort(), ["A", "AAAA"]);
  for (const record of records) {
    assert.ok(!Object.hasOwn(record, "Condition"), "Required dev aliases must be unconditional");
    assert.deepEqual(record.Properties, {
      Name: "dev.shelfstate.codecorax.com.", Type: record.Properties.Type, HostedZoneId: selectedZoneId,
      AliasTarget: { DNSName: { "Fn::GetAtt": [distributionLogicalId, "DomainName"] }, HostedZoneId: "Z2FDTNDATAQYW2" },
    }, "Alias must target the intended CloudFront distribution; arbitrary values are forbidden");
  }
}
