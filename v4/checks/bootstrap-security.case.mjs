import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
// Reuse ONLY the already bundled YAML parser; do not load the CDK runtime here.
// No new dependency. The installed upstream bytes are digest-checked before parse.
import YAML from "../node_modules/aws-cdk-lib/node_modules/yaml/index.js";
import {
  UPSTREAM_SHA256, VARIANT, REVISION, REGIONS, QUALIFIER, sha256, serialize,
  devStackNames, deploymentPolicy, customizeBootstrap, artifactModels,
  bootstrapIntent, assertBootstrapIntent, assertDevAliasTargets,
} from "../infrastructure/bootstrap/model.mjs";
import { allows, decision, allowsRoleSession } from "./support/bootstrap-policy-evaluator.mjs";

const base = new URL("../infrastructure/bootstrap/", import.meta.url);
const readJson = async name => JSON.parse(await readFile(new URL(name, base), "utf8"));
const raw = await readFile(new URL("../node_modules/aws-cdk/lib/api/bootstrap/bootstrap-template.yaml", import.meta.url));
assert.equal(sha256(raw), UPSTREAM_SHA256, "Stop: installed upstream template digest mismatch");
const upstream = YAML.parse(raw.toString("utf8"));
const template = await readJson("bootstrap-template.json");
const account = "123456789012"; // Synthetic AWS documentation account, never live.
const values = { ACCOUNT_ID: account, SELECTED_ZONE_ID: "ZTESTONLY", DISTRIBUTION_ID: "EDISTTEST", OAC_ID: "EOACTEST", CACHE_POLICY_ID: "cache-test", ORIGIN_REQUEST_POLICY_ID: "origin-test", RESPONSE_HEADERS_POLICY_ID: "headers-test", API_ID: "apitest", INTEGRATION_ID: "integrationtest", ROUTE_ID: "routetest", CERTIFICATE_ID: "certificate-test", VALIDATION_RECORD_NAME: "_synthetic.dev.shelfstate.codecorax.com" };
const bind = data => JSON.parse(JSON.stringify(data).replace(/\$\{([A-Z_]+)\}/g, (_, name) => {
  assert.ok(Object.hasOwn(values, name), `Unknown test binding ${name}`); return values[name];
}));
const westParts = await Promise.all(["execution-west.policy.json", "execution-west-edge.policy.json"].map(readJson));
const west = bind({ Version: "2012-10-17", Statement: westParts.flatMap(p => p.Statement) });
const east = bind(await readJson("execution-east.policy.json"));
const boundary = bind(await readJson("health-runtime-boundary.policy.json"));
const assumptions = bind(await readJson("github-dev-assumptions.policy.json"));
const statement = (p, sid) => p.Statement.find(s => s.Sid === sid);
const stackArn = (region, name) => `arn:aws:cloudformation:${region}:${account}:stack/${name}/synthetic-stack-id`;
const roleArn = (region, role) => `arn:aws:iam::${account}:role/cdk-${QUALIFIER}-${role}-role-${account}-${region}`;

// Interpret only this pinned CloudFormation intrinsic subset, not arbitrary CFN.
function resolveTemplate(region) {
  const refs = { ...Object.fromEntries(Object.entries(template.Parameters).map(([k, v]) => [k, v.Default])),
    ...bootstrapIntent(region, account).parameters, "AWS::Region": region, "AWS::AccountId": account,
    "AWS::Partition": "aws", "AWS::NoValue": undefined,
    StagingBucket: `cdk-${QUALIFIER}-assets-${account}-${region}`,
    CdkBootstrapVersion: `/cdk-bootstrap/${QUALIFIER}/version`,
  };
  for (const name of ["TrustedAccounts", "TrustedAccountsForLookup", "CloudFormationExecutionPolicies"]) refs[name] = refs[name].split(",");
  const cond = name => resolve(template.Conditions[name]);
  function resolve(v) {
    if (Array.isArray(v)) return v.map(resolve).filter(i => i !== undefined);
    if (!v || typeof v !== "object") return v;
    if (Object.hasOwn(v, "Ref")) { assert.ok(Object.hasOwn(refs, v.Ref)); return refs[v.Ref]; }
    if (v["Fn::If"]) { const [c, yes, no] = v["Fn::If"]; return resolve(cond(c) ? yes : no); }
    if (v["Fn::Equals"]) { const [a, b] = v["Fn::Equals"].map(resolve); return a === b; }
    if (v["Fn::Not"]) return !resolve(v["Fn::Not"][0]);
    if (v["Fn::Join"]) return resolve(v["Fn::Join"][1]).join(v["Fn::Join"][0]);
    if (v["Fn::FindInMap"]) { const [m, k, f] = v["Fn::FindInMap"].map(resolve); assert.ok(template.Mappings[m]?.[k]); return template.Mappings[m][k][f]; }
    if (v["Fn::Sub"]) {
      const [s, extra = {}] = Array.isArray(v["Fn::Sub"]) ? v["Fn::Sub"] : [v["Fn::Sub"]];
      return s.replace(/\$\{([^}]+)\}/g, (_, key) => {
        if (Object.hasOwn(extra, key)) return resolve(extra[key]);
        if (key === "StagingBucket.Arn") return `arn:aws:s3:::${refs.StagingBucket}`;
        if (key === "CloudFormationExecutionRole.Arn") return roleArn(region, "cfn-exec");
        assert.ok(Object.hasOwn(refs, key), `Unknown substitution ${key}`); return refs[key];
      });
    }
    return Object.fromEntries(Object.entries(v).map(([k, value]) => [k, resolve(value)]));
  }
  return { resolve, cond };
}

test("pinned upstream, custom provenance and canonical serialization agree", async () => {
  const provenance = await readJson("provenance.json");
  const bytes = await readFile(new URL("bootstrap-template.json", base));
  assert.equal(provenance.upstreamPackage, "aws-cdk@2.1141.0");
  assert.equal(provenance.upstreamVersion, 32);
  assert.equal(provenance.upstreamSha256, sha256(raw));
  assert.equal(provenance.customTemplateSha256, sha256(bytes));
  assert.equal(provenance.variant, VARIANT); assert.equal(provenance.revision, REVISION);
  assert.match(await readFile(new URL(".gitattributes", base), "utf8"), /^\*\.json text eol=lf$/m);
  assert.equal(bytes.toString(), serialize(customizeBootstrap(upstream, raw)));
  assert.throws(() => customizeBootstrap(upstream, Buffer.concat([raw, Buffer.from("\n")])), /Upstream/);
});

test("all policy/intent/adjudication snapshots exactly match deterministic definitions", async () => {
  for (const [name, expected] of Object.entries(artifactModels())) {
    assert.equal(await readFile(new URL(name, base), "utf8"), serialize(expected), name);
  }
});

test("structural upstream comparison permits only the enumerated customizations", () => {
  const restored = structuredClone(template);
  for (const [name, p] of Object.entries(upstream.Parameters)) {
    const changed = restored.Parameters[name];
    const allowedFields = new Set(["AllowedValues", ...(name === "CloudFormationExecutionPolicies" ? ["AllowedPattern"] : []), ...(["FileAssetsBucketKmsKeyId", "BootstrapVariant"].includes(name) ? ["Default"] : [])]);
    for (const key of allowedFields) {
      if (Object.hasOwn(p, key)) changed[key] = p[key]; else delete changed[key];
    }
  }
  delete restored.Metadata; delete restored.Mappings;
  delete restored.Conditions.ShelfStateWest;
  const deploy = restored.Resources.DeploymentActionRole.Properties;
  const original = upstream.Resources.DeploymentActionRole.Properties;
  for (const key of ["AssumeRolePolicyDocument", "Policies", "ManagedPolicyArns"]) deploy[key] = original[key];
  restored.Resources.CloudFormationExecutionRole.Properties.ManagedPolicyArns = upstream.Resources.CloudFormationExecutionRole.Properties.ManagedPolicyArns;
  delete restored.Outputs.ShelfStateVariant; delete restored.Outputs.ShelfStateVariantRevision;
  assert.deepEqual(restored, upstream, "Unreviewed fork drift");
});

test("all canonical resources/outputs and version 32 remain, without application resources", () => {
  assert.deepEqual(Object.keys(template.Resources), Object.keys(upstream.Resources));
  assert.equal(Object.keys(template.Resources).length, 14);
  for (const [name, output] of Object.entries(upstream.Outputs)) assert.deepEqual(template.Outputs[name], output);
  assert.deepEqual(Object.keys(template.Parameters), Object.keys(upstream.Parameters));
  assert.equal(template.Resources.CdkBootstrapVersion.Properties.Value, "32");
  assert.equal(template.Outputs.BootstrapVersion.Value, "32");
  for (const [name, resource] of Object.entries(upstream.Resources)) {
    if (resource.Type === "AWS::IAM::Role") assert.deepEqual(template.Resources[name].Properties.RoleName, resource.Properties.RoleName);
  }
  assert.equal(Object.values(template.Resources).some(r => /Lambda|CloudFront|ApiGateway|EC2/.test(r.Type)), false);
});

test("parameter constraints exclude alternate qualifier, trust, KMS and example boundary", () => {
  const expected = { Qualifier: ["hnb659fds"], TrustedAccounts: [""], TrustedAccountsForLookup: [""], FileAssetsBucketKmsKeyId: ["AWS_MANAGED_KEY"], UseExamplePermissionsBoundary: ["false"], PublicAccessBlockConfiguration: ["true"], DenyExternalId: ["true"], FileAssetsBucketName: [""], ContainerAssetsRepositoryName: [""], InputPermissionsBoundary: [""] };
  for (const [key, allowed] of Object.entries(expected)) assert.deepEqual(template.Parameters[key].AllowedValues, allowed);
  assert.equal(template.Parameters.FileAssetsBucketKmsKeyId.Default, "AWS_MANAGED_KEY");
  for (const region of REGIONS) {
    const { cond } = resolveTemplate(region);
    for (const disabled of ["CreateNewKey", "ShouldCreatePermissionsBoundary", "HasTrustedAccounts", "HasTrustedAccountsForLookup"]) assert.equal(cond(disabled), false);
    assert.equal(Object.values(template.Resources).filter(r => !r.Condition || cond(r.Condition)).length, 11);
  }
});

test("same-account trust and unchanged file/image/lookup contract are preserved", () => {
  for (const name of ["FilePublishingRole", "FilePublishingRoleDefaultPolicy", "ImagePublishingRole", "ImagePublishingRoleDefaultPolicy", "LookupRole", "StagingBucket", "StagingBucketPolicy", "ContainerAssetsRepository"]) assert.deepEqual(template.Resources[name], upstream.Resources[name]);
  assert.deepEqual(template.Resources.DeploymentActionRole.Properties.AssumeRolePolicyDocument.Statement, upstream.Resources.DeploymentActionRole.Properties.AssumeRolePolicyDocument.Statement.slice(0, 2));
});

test("exact six names come from existing topology, not a broad prefix", () => {
  assert.deepEqual(devStackNames("us-west-2"), ["shelfstate-v4-dev-edge-delivery", "shelfstate-v4-dev-identity-session", "shelfstate-v4-dev-library-api", "shelfstate-v4-dev-operations-lifecycle", "shelfstate-v4-dev-recovery-observability"]);
  assert.deepEqual(devStackNames("us-east-1"), ["shelfstate-v4-dev-edge-certificate"]);
  assert.throws(() => devStackNames("eu-west-1"));
});

for (const region of REGIONS) {
  const resolved = resolveTemplate(region).resolve(template.Resources.DeploymentActionRole.Properties.Policies[0].PolicyDocument);
  const exec = roleArn(region, "cfn-exec");
  test(`${region}: actual template policy allows reviewed names and exact execution RoleArn`, () => {
    assert.deepEqual(resolved, deploymentPolicy(region, account));
    for (const name of devStackNames(region)) {
      const arn = stackArn(region, name);
      assert.equal(allows(resolved, "cloudformation:CreateChangeSet", arn, { "cloudformation:RoleArn": exec }), true);
      assert.equal(allows(resolved, "cloudformation:CreateChangeSet", arn), false);
      assert.equal(allows(resolved, "cloudformation:CreateChangeSet", arn, { "cloudformation:RoleArn": `${exec}-other` }), false);
      for (const action of ["DescribeStacks", "DescribeStackEvents", "DescribeStackResources", "GetTemplate", "DescribeChangeSet", "ExecuteChangeSet", "DeleteChangeSet", "UpdateTerminationProtection", "TagResource", "UntagResource"]) assert.equal(allows(resolved, `cloudformation:${action}`, arn), true, action);
    }
  });
  test(`${region}: production, unrelated, bootstrap, extra-dev and cross-region/account stack mutations denied`, () => {
    const resources = ["shelfstate-v4-prod-edge-delivery", "unrelated", "CDKToolkit", "shelfstate-v4-dev-unreviewed", "shelfstate-v4-dev-edge-delivery-extra"].map(n => stackArn(region, n));
    resources.push(stackArn(region === "us-west-2" ? "us-east-1" : "us-west-2", devStackNames(region)[0]), stackArn(region, devStackNames(region)[0]).replace(account, "999999999999"));
    for (const arn of resources) for (const action of ["CreateChangeSet", "ExecuteChangeSet", "DeleteChangeSet", "UpdateTerminationProtection", "DeleteStack", "CreateStack", "UpdateStack"]) assert.equal(allows(resolved, `cloudformation:${action}`, arn, { "cloudformation:RoleArn": exec }), false, `${action} ${arn}`);
    assert.equal(allows(resolved, "cloudformation:DescribeStacks", stackArn(region, "CDKToolkit")), true);
    assert.equal(allows(resolved, "cloudformation:GetTemplate", stackArn(region, "CDKToolkit")), false);
    assert.equal(allows(resolved, "cloudformation:DescribeStacks", "*"), false);
  });
  test(`${region}: unsupported direct/destroy/repair/refactor/account reads fail closed`, () => {
    for (const action of ["CreateStack", "UpdateStack", "DeleteStack", "RollbackStack", "ContinueUpdateRollback", "CreateStackRefactor", "ExecuteStackRefactor", "ListStacks", "GetTemplateSummary", "GetStackPolicy", "SetStackPolicy", "ListExports", "ValidateTemplate"]) assert.equal(allows(resolved, `cloudformation:${action}`, stackArn(region, devStackNames(region)[0])), false);
    assert.equal(resolved.Statement.some(s => s.Resource.includes("*") || s.Action.some(a => a.includes("*"))), false);
    assert.equal(template.Resources.DeploymentActionRole.Properties.ManagedPolicyArns, undefined);
  });
  test(`${region}: PassRole is exact and service-constrained`, () => {
    assert.equal(allows(resolved, "iam:PassRole", exec, { "iam:PassedToService": "cloudformation.amazonaws.com" }), true);
    for (const service of [undefined, "lambda.amazonaws.com", "ec2.amazonaws.com"]) assert.equal(allows(resolved, "iam:PassRole", exec, service ? { "iam:PassedToService": service } : {}), false);
    for (const role of ["deploy", "file-publishing", "image-publishing", "lookup"]) assert.equal(allows(resolved, "iam:PassRole", roleArn(region, role), { "iam:PassedToService": "cloudformation.amazonaws.com" }), false);
    for (const name of ["AccountMaintenanceAdmin", "ShelfStateAccountAdmin", "ShelfStateOperator", "ShelfStateRecovery", "ShelfStateV4DevDeploy", "ShelfStateV4ProdDeploy", "shelfstate-v4-dev-health", "shelfstate-v4-prod-health"]) assert.equal(allows(resolved, "iam:PassRole", `arn:aws:iam::${account}:role/${name}`, { "iam:PassedToService": "cloudformation.amazonaws.com" }), false);
  });
  test(`${region}: version and asset reads cannot reach application/other-region resources`, () => {
    const parameter = `arn:aws:ssm:${region}:${account}:parameter/cdk-bootstrap/hnb659fds/version`;
    for (const action of ["ssm:GetParameter", "ssm:GetParameters"]) {
      assert.equal(allows(resolved, action, parameter), true);
      for (const resource of [parameter + "/extra", parameter.replace("hnb659fds", "prod"), parameter.replace("cdk-bootstrap/hnb659fds/version", "shelfstate/secret")]) assert.equal(allows(resolved, action, resource), false);
    }
    const object = `arn:aws:s3:::cdk-hnb659fds-assets-${account}-${region}/hash.template.json`;
    assert.equal(allows(resolved, "s3:GetObject", object), true);
    assert.equal(allows(resolved, "s3:PutObject", object), false);
    assert.equal(allows(resolved, "s3:GetObject", "arn:aws:s3:::unrelated/object"), false);
    assert.equal(allows(resolved, "ssm:GetParametersByPath", parameter), false);
    assert.equal(allows(resolved, "kms:Decrypt", "*"), false);
  });
  test(`${region}: execution policy is fixed by region, not AdministratorAccess or caller union`, () => {
    const result = resolveTemplate(region).resolve(template.Resources.CloudFormationExecutionRole.Properties.ManagedPolicyArns);
    assert.deepEqual(result, (region === "us-west-2" ? ["West", "WestEdge"] : ["East"]).map(suffix => `arn:aws:iam::${account}:policy/ShelfStateV4DevCfnExecution${suffix}`));
    assert.equal(JSON.stringify(template.Resources.CloudFormationExecutionRole).includes("AdministratorAccess"), false);
    const intent = bootstrapIntent(region, account); assertBootstrapIntent(intent, region, account);
    for (const key of ["terminationProtection", "execute"]) { const changed = structuredClone(intent); changed[key] = !changed[key]; assert.throws(() => assertBootstrapIntent(changed, region, account)); }
    const changed = structuredClone(intent); changed.parameters.CloudFormationExecutionPolicies += ",arn:aws:iam::aws:policy/AdministratorAccess";
    assert.throws(() => assertBootstrapIntent(changed, region, account));
  });
}

test("future GitHub proposal assumes exactly four roles, never lookup/image/execution/prod", () => {
  assert.equal(assumptions.Statement[0].Resource.length, 4);
  for (const region of REGIONS) {
    for (const role of ["deploy", "file-publishing"]) assert.equal(allows(assumptions, "sts:AssumeRole", roleArn(region, role)), true);
    for (const role of ["lookup", "image-publishing", "cfn-exec"]) assert.equal(allows(assumptions, "sts:AssumeRole", roleArn(region, role)), false);
  }
  for (const action of ["iam:PassRole", "cloudformation:CreateChangeSet", "ssm:GetParameter", "s3:GetObject", "sts:TagSession"]) assert.equal(allows(assumptions, action, "*"), false);
  assert.equal(allows(assumptions, "sts:AssumeRole", `arn:aws:iam::${account}:role/ShelfStateV4ProdDeploy`), false);
  assert.equal(allows(assumptions, "sts:AssumeRole", roleArn("us-west-2", "deploy").replace(account, "999999999999")), false);
});

const dnsContext = (name, type, action = "UPSERT") => ({
  "route53:ChangeResourceRecordSetsNormalizedRecordNames": [name],
  "route53:ChangeResourceRecordSetsRecordTypes": [type],
  "route53:ChangeResourceRecordSetsActions": [action],
});
test("west DNS requires all exact names/types/actions and denies mixed-batch escape", () => {
  const zone = "arn:aws:route53:::hostedzone/ZTESTONLY";
  for (const type of ["A", "AAAA"]) for (const action of ["CREATE", "UPSERT", "DELETE"]) assert.equal(allows(west, "route53:ChangeResourceRecordSets", zone, dnsContext("dev.shelfstate.codecorax.com", type, action)), true);
  for (const [name, type] of [["shelfstate.codecorax.com", "A"], ["dev.shelfstate.codecorax.com", "NS"], ["dev.shelfstate.codecorax.com", "CNAME"]]) assert.equal(allows(west, "route53:ChangeResourceRecordSets", zone, dnsContext(name, type)), false);
  const valid = dnsContext("dev.shelfstate.codecorax.com", "A");
  for (const key of Object.keys(valid)) { const missing = structuredClone(valid); delete missing[key]; assert.equal(allows(west, "route53:ChangeResourceRecordSets", zone, missing), false); }
  const mixed = structuredClone(valid); mixed["route53:ChangeResourceRecordSetsNormalizedRecordNames"].push("unrelated.codecorax.com");
  assert.equal(allows(west, "route53:ChangeResourceRecordSets", zone, mixed), false);
  assert.equal(allows(west, "route53:ChangeResourceRecordSets", zone + "OTHER", valid), false);
});

test("east exact DNS proposal and unselected bounded candidate remain distinct", async () => {
  const zone = "arn:aws:route53:::hostedzone/ZTESTONLY";
  const valid = dnsContext("_synthetic.dev.shelfstate.codecorax.com", "CNAME");
  assert.equal(allows(east, "route53:ChangeResourceRecordSets", zone, valid), true);
  for (const ctx of [dnsContext("_other.dev.shelfstate.codecorax.com", "CNAME"), dnsContext("dev.shelfstate.codecorax.com", "A"), dnsContext("_synthetic.dev.shelfstate.codecorax.com", "CNAME", "DELETE"), {}]) assert.equal(allows(east, "route53:ChangeResourceRecordSets", zone, ctx), false);
  const pending = await readJson("pending-decisions.json");
  assert.match(pending.status, /HUMAN_ADJUDICATION/);
  const candidate = bind({ Version: "2012-10-17", Statement: [pending.dnsValidation.boundedPatternCandidate] });
  assert.equal(allows(candidate, "route53:ChangeResourceRecordSets", zone, dnsContext("_not.an.acm.token.dev.shelfstate.codecorax.com", "CNAME")), true, "Document the actual glob residual, do not pretend it is a token grammar");
  assert.equal(JSON.stringify(east).includes("_*.dev"), false);
});

test("synthetic future alias templates must target the intended distribution", () => {
  const fixture = { Resources: { Distribution: { Type: "AWS::CloudFront::Distribution" }, ...Object.fromEntries(["A", "AAAA"].map(type => [type, { Type: "AWS::Route53::RecordSet", Properties: { Name: "dev.shelfstate.codecorax.com.", Type: type, HostedZoneId: "ZTESTONLY", AliasTarget: { DNSName: { "Fn::GetAtt": ["Distribution", "DomainName"] }, HostedZoneId: "Z2FDTNDATAQYW2" } } }])) } };
  assertDevAliasTargets(fixture, "Distribution", "ZTESTONLY");
  for (const mutate of [p => { p.AliasTarget.DNSName = "attacker.example"; }, p => { p.AliasTarget["DNSName"] = { "Fn::GetAtt": ["Other", "DomainName"] }; }, p => { p.ResourceRecords = ["192.0.2.1"]; }, p => { p.Name = "shelfstate.codecorax.com."; }]) {
    const changed = structuredClone(fixture); mutate(changed.Resources.A.Properties);
    assert.throws(() => assertDevAliasTargets(changed, "Distribution", "ZTESTONLY"));
  }
});

test("health role requires immutable boundary and exact Lambda PassRole", () => {
  const role = `arn:aws:iam::${account}:role/shelfstate-v4-dev-health`;
  const bound = `arn:aws:iam::${account}:policy/ShelfStateV4DevHealthBoundary`;
  const context = { "iam:PermissionsBoundary": bound, "aws:RequestTag/Project": "ShelfState", "aws:RequestTag/Environment": "dev", "aws:RequestTag/ManagedBy": "AWS-CDK" };
  assert.equal(allows(west, "iam:CreateRole", role, context), true);
  for (const value of [undefined, bound + "Other"]) { const c = { ...context }; if (value) c["iam:PermissionsBoundary"] = value; else delete c["iam:PermissionsBoundary"]; assert.equal(allows(west, "iam:CreateRole", role, c), false); }
  for (const action of ["iam:PutRolePermissionsBoundary", "iam:DeleteRolePermissionsBoundary"]) assert.equal(allows(west, action, role, context), false);
  for (const action of ["iam:CreatePolicy", "iam:CreatePolicyVersion", "iam:SetDefaultPolicyVersion", "iam:DeletePolicy"]) assert.equal(allows(west, action, bound), false);
  assert.equal(allows(west, "iam:PassRole", role, { "iam:PassedToService": "lambda.amazonaws.com" }), true);
  assert.equal(allows(west, "iam:PassRole", role, { "iam:PassedToService": "cloudformation.amazonaws.com" }), false);
  for (const name of ["AccountMaintenanceAdmin", "ShelfStateAccountAdmin", "ShelfStateOperator", "ShelfStateRecovery", "ShelfStateV4DevDeploy", "ShelfStateV4ProdDeploy", "shelfstate-v4-prod-health", `cdk-hnb659fds-deploy-role-${account}-us-west-2`]) for (const action of ["iam:CreateRole", "iam:PutRolePolicy", "iam:UpdateAssumeRolePolicy", "iam:DeleteRole", "iam:PassRole"]) assert.equal(allows(west, action, `arn:aws:iam::${account}:role/${name}`, context), false);
});

test("runtime boundary permits only health log-stream writes", () => {
  const stream = `arn:aws:logs:us-west-2:${account}:log-group:/aws/lambda/shelfstate-v4-dev-health:log-stream:test`;
  for (const action of ["logs:CreateLogStream", "logs:PutLogEvents"]) {
    assert.equal(allows(boundary, action, stream), true);
    assert.equal(allows(boundary, action, stream.replace("dev-health", "prod-health")), false);
  }
  for (const action of ["logs:CreateLogGroup", "logs:GetLogEvents", "s3:GetObject", "dynamodb:GetItem", "iam:PassRole", "sts:AssumeRole", "kms:Decrypt", "secretsmanager:GetSecretValue", "apigateway:POST"]) assert.equal(allows(boundary, action, "*"), false);
});

test("execution policies keep named resources and generated-ID lifecycle bindings separated", () => {
  const tags = { "aws:RequestTag/Project": "ShelfState", "aws:RequestTag/Environment": "dev", "aws:RequestTag/ManagedBy": "AWS-CDK" };
  const bucket = `arn:aws:s3:::shelfstate-v4-dev-static-${account}-us-west-2`;
  assert.equal(allows(west, "s3:CreateBucket", bucket, { "s3:LocationConstraint": "us-west-2" }), true);
  assert.equal(allows(west, "s3:CreateBucket", bucket, { "s3:LocationConstraint": "us-east-1" }), false);
  assert.equal(allows(west, "s3:PutBucketPolicy", bucket.replace("dev-static", "prod-static")), false);
  const api = "arn:aws:apigateway:us-west-2::/apis";
  assert.equal(allows(west, "apigateway:POST", api, { ...tags, "apigateway:Request/ApiName": "shelfstate-v4-dev-health" }), true);
  assert.equal(allows(west, "apigateway:POST", api, { ...tags, "apigateway:Request/ApiName": "unrelated" }), false);
  assert.equal(allows(west, "apigateway:POST", api), false);
  for (const [action, resource] of [
    ["cloudfront:UpdateDistribution", `arn:aws:cloudfront::${account}:distribution/EDISTTEST`],
    ["cloudfront:UpdateOriginAccessControl", `arn:aws:cloudfront::${account}:origin-access-control/EOACTEST`],
    ["apigateway:PATCH", `${api}/apitest/routes/routetest`],
    ["lambda:UpdateFunctionCode", `arn:aws:lambda:us-west-2:${account}:function:shelfstate-v4-dev-health`],
  ]) {
    assert.equal(allows(west, action, resource), true);
    assert.equal(allows(west, action, resource + "-unrelated"), false);
    assert.equal(allows(east, action, resource), false);
  }
  const cert = `arn:aws:acm:us-east-1:${account}:certificate/certificate-test`;
  assert.equal(allows(east, "acm:DeleteCertificate", cert), true);
  assert.equal(allows(east, "acm:DeleteCertificate", cert + "-unrelated"), false);
  assert.equal(allows(west, "acm:DeleteCertificate", cert), false);
});

test("east certificate request is exact-name, DNS, public, non-exportable and regional", () => {
  const context = { "aws:RequestedRegion": "us-east-1", "acm:DomainNames": ["dev.shelfstate.codecorax.com"], "acm:ValidationMethod": "DNS", "acm:Export": "DISABLED", "aws:RequestTag/Project": "ShelfState", "aws:RequestTag/Environment": "dev", "aws:RequestTag/ManagedBy": "AWS-CDK" };
  assert.equal(allows(east, "acm:RequestCertificate", "*", context), true);
  for (const [key, value] of [["acm:DomainNames", ["*.codecorax.com"]], ["acm:DomainNames", ["dev.shelfstate.codecorax.com", "shelfstate.codecorax.com"]], ["acm:ValidationMethod", "EMAIL"], ["acm:Export", "ENABLED"], ["aws:RequestedRegion", "us-west-2"], ["acm:CertificateAuthority", "private-ca"]]) assert.equal(allows(east, "acm:RequestCertificate", "*", { ...context, [key]: value }), false);
  const missing = { ...context }; delete missing["acm:DomainNames"];
  assert.equal(allows(east, "acm:RequestCertificate", "*", missing), false);
  for (const action of ["iam:CreateRole", "lambda:CreateFunction", "apigateway:POST", "s3:CreateBucket", "cloudfront:CreateDistribution", "acm:ExportCertificate", "acm:ImportCertificate"]) assert.equal(allows(east, action, "*"), false);
});

test("every execution-policy Resource star has an explicit pending decision and negative test", async () => {
  const pending = await readJson("pending-decisions.json");
  const actual = [...west.Statement, ...east.Statement].filter(s => s.Resource.includes("*")).flatMap(s => s.Action).sort();
  assert.deepEqual(actual, pending.createAndReadWildcards.flatMap(s => s.actions).sort());
  assert.equal(allows(west, "cloudfront:CreateDistribution", "*", {}), false);
  assert.equal(allows(west, "cloudfront:CreateDistribution", "*", { "aws:RequestTag/Project": "ShelfState", "aws:RequestTag/Environment": "prod", "aws:RequestTag/ManagedBy": "AWS-CDK" }), false);
  assert.equal(allows(west, "logs:DescribeLogGroups", "*", { "aws:RequestedRegion": "us-east-1" }), false);
  assert.equal(allows(west, "cloudfront:UpdateOriginAccessControl", `arn:aws:cloudfront::${account}:origin-access-control/UNRELATED`), false);
  assert.equal(allows(west, "apigateway:PATCH", "arn:aws:apigateway:us-west-2::/apis/unrelated"), false);
  for (const action of ["cloudfront:CreateFunction", "cloudfront:CreateVpcOrigin", "cloudfront:CreateStreamingDistribution", "cloudfront:CreateMonitoringSubscription", "wafv2:CreateWebACL", "ec2:CreateVpc", "cognito-idp:CreateUserPool", "dynamodb:CreateTable", "secretsmanager:CreateSecret"]) assert.equal(allows(west, action, "*"), false);
});

test("limited evaluator rejects unknown constructs rather than silently approving", () => {
  assert.throws(() => allows({ Version: "2012-10-17", Statement: [{ Effect: "Allow", NotAction: "*", Resource: "*" }] }, "s3:GetObject", "*"), /Unsupported/);
  assert.throws(() => allows({ Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: "*", Resource: "*", Condition: { Bool: { unknown: "true" } } }] }, "s3:GetObject", "*"), /Unsupported/);
});

test("R1: each bound managed policy fits 6144 characters with conservative ID allowances", async t => {
  // Deliberately longer than typical service IDs, not a claim of AWS maxima.
  // UUID policy/certificate IDs use 36 chars; token length has a 64-hex allowance.
  // Future bindings exceeding these allowances require a fresh concrete size check.
  const sized = { ...values, SELECTED_ZONE_ID: "Z".repeat(32), DISTRIBUTION_ID: "E".repeat(32), OAC_ID: "E".repeat(32),
    CACHE_POLICY_ID: "00000000-0000-4000-8000-000000000001", ORIGIN_REQUEST_POLICY_ID: "00000000-0000-4000-8000-000000000002",
    RESPONSE_HEADERS_POLICY_ID: "00000000-0000-4000-8000-000000000003", CERTIFICATE_ID: "00000000-0000-4000-8000-000000000004",
    API_ID: "a".repeat(32), INTEGRATION_ID: "b".repeat(32), ROUTE_ID: "c".repeat(32), VALIDATION_RECORD_NAME: `_${"a".repeat(64)}.dev.shelfstate.codecorax.com` };
  for (const name of ["execution-west.policy.json", "execution-west-edge.policy.json", "execution-east.policy.json", "health-runtime-boundary.policy.json", "github-dev-assumptions.policy.json"]) {
    const symbolic = JSON.stringify(await readJson(name));
    const concrete = symbolic.replace(/\$\{([A-Z_]+)\}/g, (_, key) => { assert.ok(Object.hasOwn(sized, key)); return sized[key]; });
    assert.ok(!concrete.includes("${"));
    assert.equal(concrete, JSON.stringify(JSON.parse(concrete)), "Minified JSON size, not pretty-print size");
    // These documents contain no whitespace inside strings: JSON.stringify removes all counted formatting whitespace.
    assert.ok(!/\s/.test(concrete));
    assert.ok(concrete.length <= 6144, `${name}: ${concrete.length} exceeds IAM limit`);
    t.diagnostic(`${name}: symbolic=${symbolic.length}, bound=${concrete.length}, limit=6144`);
  }
});

test("R1: partitioned west statements exactly preserve the pre-remediation authority", () => {
  const combined = westParts.flatMap(p => p.Statement).sort((a, b) => a.Sid.localeCompare(b.Sid, "en"));
  // Independently captured before remediation, not derived from the current constructor.
  assert.equal(sha256(JSON.stringify(combined)), "64efd611ef5b7e8ab8f0092a72a90f0b883c73fccc0e41dbc7d3768343db3f41");
  assert.equal(new Set(combined.map(s => s.Sid)).size, combined.length);
  assert.ok(westParts[0].Statement.every(s => s.Action.every(a => /^(s3|apigateway|lambda|logs|ssm):/.test(a))));
  assert.ok(westParts[1].Statement.every(s => s.Action.every(a => /^(cloudfront|route53|iam):/.test(a))));
});

test("R1: fixed regional attachments and intent enforce the whole policy set", () => {
  for (const region of REGIONS) {
    const actual = resolveTemplate(region).resolve(template.Resources.CloudFormationExecutionRole.Properties.ManagedPolicyArns);
    assert.equal(actual.length, region === "us-west-2" ? 2 : 1);
    assert.ok(actual.length <= 10, "Conservative attachment ceiling, below AWS role quota");
    const intent = bootstrapIntent(region, account);
    assert.deepEqual(intent.parameters.CloudFormationExecutionPolicies.split(","), actual);
    for (const bad of [actual.slice(0, -1), [...actual, ...bootstrapIntent(region === "us-west-2" ? "us-east-1" : "us-west-2", account).parameters.CloudFormationExecutionPolicies.split(",")]]) {
      const changed = structuredClone(intent); changed.parameters.CloudFormationExecutionPolicies = bad.join(",");
      assert.throws(() => assertBootstrapIntent(changed, region, account));
    }
  }
});

const runtimeRole = `arn:aws:iam::${account}:role/shelfstate-v4-dev-health`;
const runtimeSession = `arn:aws:sts::${account}:assumed-role/shelfstate-v4-dev-health/synthetic-session`;
const runtimeStream = `arn:aws:logs:us-west-2:${account}:log-group:/aws/lambda/shelfstate-v4-dev-health:log-stream:test`;
const emptyPolicy = { Version: "2012-10-17", Statement: [] };
const logIdentity = { Version: "2012-10-17", Statement: [boundary.Statement[0]] };
const resourceGrant = (action, resource, principal = runtimeRole) => ({ Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: action, Resource: resource, Principal: "*", Condition: { ArnEquals: { "aws:PrincipalArn": principal } } }] });
const runtimeRequest = (action, resource, overrides = {}) => ({ identity: logIdentity, boundary, resourcePolicy: resourceGrant(action, resource), roleArn: runtimeRole, sessionArn: runtimeSession, action, resource, ...overrides });

test("R2: reviewed S3 wildcard-Principal attack bypasses old implicit boundary but not explicit deny", () => {
  const action = "s3:GetObject", resource = `arn:aws:s3:::shelfstate-v4-dev-static-${account}-us-west-2/index.html`;
  assert.equal(decision(logIdentity, action, resource), "implicitDeny");
  assert.equal(allowsRoleSession(runtimeRequest(action, resource, { boundary: logIdentity })), true, "Reproduce old boundary weakness");
  assert.equal(decision(boundary, action, resource), "explicitDeny");
  assert.equal(allowsRoleSession(runtimeRequest(action, resource)), false);
});

test("R2: minimum pre-created-group logging remains functional; boundary alone grants nothing", () => {
  for (const action of ["logs:CreateLogStream", "logs:PutLogEvents"]) {
    assert.equal(allowsRoleSession(runtimeRequest(action, runtimeStream, { resourcePolicy: emptyPolicy })), true);
    assert.equal(allowsRoleSession(runtimeRequest(action, runtimeStream)), true);
    assert.equal(allowsRoleSession(runtimeRequest(action, runtimeStream, { identity: emptyPolicy, resourcePolicy: emptyPolicy })), false);
  }
  assert.equal(decision(boundary, "logs:CreateLogGroup", runtimeStream.split(":log-stream:")[0]), "explicitDeny");
});

test("R2: non-log authority stays explicitly denied even under hypothetical resource grants", () => {
  // Resource-grant fixtures are adversarial upper bounds, not claims each service accepts bucket-policy syntax.
  for (const [action, resource] of [
    ["s3:PutObject", `arn:aws:s3:::shelfstate-v4-dev-static-${account}-us-west-2/other`],
    ["s3:DeleteObject", "arn:aws:s3:::unrelated/object"],
    ["secretsmanager:GetSecretValue", `arn:aws:secretsmanager:us-west-2:${account}:secret:synthetic`],
    ["kms:Decrypt", `arn:aws:kms:us-west-2:${account}:key/synthetic`],
    ["sts:AssumeRole", `arn:aws:iam::${account}:role/other`],
    ["dynamodb:GetItem", `arn:aws:dynamodb:us-west-2:${account}:table/synthetic`],
    ["iam:PassRole", runtimeRole], ["iam:PutRolePolicy", runtimeRole], ["logs:GetLogEvents", runtimeStream],
  ]) {
    assert.equal(decision(boundary, action, resource), "explicitDeny", action);
    assert.equal(allowsRoleSession(runtimeRequest(action, resource)), false, action);
  }
});

test("R2: permitted actions on every out-of-scope logging fixture remain explicitly denied", () => {
  for (const action of ["logs:CreateLogStream", "logs:PutLogEvents"]) for (const resource of [
    runtimeStream.replace("dev-health", "prod-health"), runtimeStream.replace("dev-health:", "dev-health-extra:"),
    runtimeStream.replace("us-west-2", "us-east-1"), runtimeStream.split(":log-stream:")[0],
  ]) {
    assert.equal(decision(boundary, action, resource), "explicitDeny");
    assert.equal(allowsRoleSession(runtimeRequest(action, resource)), false);
  }
  assert.equal(decision(boundary, "logs:PutLogEvents", runtimeStream.replace(account, "999999999999")), "explicitDeny");
});

test("R2: regression model distinguishes role ARN from session ARN and rejects unsupported cases", () => {
  const action = "s3:GetObject", resource = "arn:aws:s3:::synthetic/object";
  const old = { boundary: logIdentity };
  for (const principal of [runtimeRole + "-other", runtimeSession]) assert.equal(allowsRoleSession(runtimeRequest(action, resource, { ...old, resourcePolicy: resourceGrant(action, resource, principal) })), false);
  assert.throws(() => allowsRoleSession(runtimeRequest(action, resource, { sessionArn: runtimeSession.replace(account, "999999999999") })), /Same-account/);
  assert.throws(() => allowsRoleSession(runtimeRequest(action, resource, { sessionArn: runtimeSession.replace("dev-health/", "other/") })), /belong/);
  const unsupported = resourceGrant(action, resource); unsupported.Statement[0].Principal = { AWS: runtimeRole };
  assert.throws(() => allowsRoleSession(runtimeRequest(action, resource, { resourcePolicy: unsupported })), /wildcard/);
});

const aliasFixture = () => ({ Resources: { Distribution: { Type: "AWS::CloudFront::Distribution" }, ...Object.fromEntries(["A", "AAAA"].map(type => [type, { Type: "AWS::Route53::RecordSet", Properties: { Name: "dev.shelfstate.codecorax.com.", Type: type, HostedZoneId: "ZTESTONLY", AliasTarget: { DNSName: { "Fn::GetAtt": ["Distribution", "DomainName"] }, HostedZoneId: "Z2FDTNDATAQYW2" } } }])) } });
const checkAliases = fixture => assertDevAliasTargets(fixture, "Distribution", "ZTESTONLY");

test("R3: unconditional native A and AAAA aliases pass", () => checkAliases(aliasFixture()));

test("R3: review reproduction with disabled aliases and active wrong-target RecordSetGroup fails", () => {
  const fixture = aliasFixture(); fixture.Conditions = { Disabled: { "Fn::Equals": ["yes", "no"] } };
  for (const type of ["A", "AAAA"]) fixture.Resources[type].Condition = "Disabled";
  fixture.Resources.Competing = { Type: "AWS::Route53::RecordSetGroup", Properties: { HostedZoneId: "ZTESTONLY", RecordSets: ["A", "AAAA"].map(Type => ({ Name: "dev.shelfstate.codecorax.com.", Type, AliasTarget: { DNSName: "wrong.cloudfront.net", HostedZoneId: "Z2FDTNDATAQYW2" } })) } };
  assert.throws(() => checkAliases(fixture), /Grouped/);
});

test("R3: any RecordSetGroup fails independently of required-record conditions", () => {
  const fixture = aliasFixture(); fixture.Resources.Group = { Type: "AWS::Route53::RecordSetGroup", Properties: { RecordSets: [fixture.Resources.A.Properties] } };
  assert.throws(() => checkAliases(fixture), /Grouped/);
});

for (const type of ["A", "AAAA"]) {
  test(`R3: ${type} condition fails regardless of truth, missing record fails, wrong targets fail`, () => {
    for (const value of ["Enabled", "Disabled", false, null]) {
      const fixture = aliasFixture(); fixture.Conditions = { Enabled: { "Fn::Equals": ["x", "x"] }, Disabled: { "Fn::Equals": ["x", "y"] } }; fixture.Resources[type].Condition = value;
      assert.throws(() => checkAliases(fixture), /unconditional/);
    }
    const missing = aliasFixture(); delete missing.Resources[type]; assert.throws(() => checkAliases(missing));
    for (const mutate of [p => { p.AliasTarget.DNSName = { "Fn::GetAtt": ["WrongDistribution", "DomainName"] }; }, p => { p.AliasTarget.HostedZoneId = "WRONG"; }, p => { delete p.AliasTarget; p.ResourceRecords = ["192.0.2.1"]; p.TTL = "60"; }]) {
      const fixture = aliasFixture(); mutate(fixture.Resources[type].Properties); assert.throws(() => checkAliases(fixture));
    }
  });
}

test("R3: duplicate, intrinsic, macro, nested and custom representations fail closed", () => {
  for (const mutate of [
    f => { f.Resources.Duplicate = structuredClone(f.Resources.A); },
    f => { f.Resources.A.Properties.Name = { "Fn::Sub": "dev.shelfstate.codecorax.com." }; },
    f => { f.Resources.A.Properties = { "Fn::If": ["Enabled", f.Resources.A.Properties, { Ref: "AWS::NoValue" }] }; },
    f => { f.Resources.A = { "Fn::If": ["Enabled", f.Resources.A, { Ref: "AWS::NoValue" }] }; },
    f => { f.Resources.Distribution.Condition = "Enabled"; }, f => { f.Transform = "CustomMacro"; },
    f => { f.Resources.Nested = { Type: "AWS::CloudFormation::Stack" }; },
    f => { f.Resources.Custom = { Type: "Custom::Records" }; },
  ]) { const fixture = aliasFixture(); mutate(fixture); assert.throws(() => checkAliases(fixture)); }
});

test("installed source confirms role-before-version checks and template file publication", async () => {
  const cli = await readFile(new URL("../node_modules/aws-cdk/lib/index.js", import.meta.url), "utf8");
  const synth = await readFile(new URL("../node_modules/aws-cdk-lib/core/lib/stack-synthesizers/default-synthesizer.js", import.meta.url), "utf8");
  assert.match(cli, /async deployStack\(options\)\s*\{\s*const env3 = await this\.envs\.accessStackForMutableStackOperations\(options\.stack\);\s*await this\.validateBootstrapStackVersion/);
  assert.match(cli, /async accessStackForReadOnlyStackOperations\(stack\)\s*\{\s*return this\.accessStackForStackOperations/);
  assert.match(synth, /templateAsset=this\.addFileAsset\(templateAssetSource\)/);
  assert.match(cli, /async directDeployment\(\)/);
  assert.match(cli, /async updateTerminationProtection\(\)/);
  assert.match(cli, /async cleanupChangeSet\(stack, changeSetName, stackEventPollingInterval\)/);
  assert.match(raw.toString(), /ssm:GetParameters # CreateChangeSet uses this/);
});
