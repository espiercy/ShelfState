import assert from "node:assert/strict";
import test, { before } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { App } from "aws-cdk-lib";
import { createEnvironmentTopology } from "../infrastructure/lib/topology.mjs";
import { resolveEnvironmentConfig } from "../infrastructure/lib/environment.mjs";
import { validateFoundationAssembly, validateLocalEdgeWafAssembly } from "../infrastructure/lib/template-guards.mjs";
import { EDGE_WAF_REVIEW_SCHEMA, assertEdgeWafTemplate, edgeWafTypes } from "../infrastructure/bootstrap/edge-waf-contract.mjs";
import { validateInitializationBundle } from "../infrastructure/bootstrap/initialization-guard.mjs";
import { callerWindowCap, executionPolicies, generatedAuthority, target } from "../infrastructure/bootstrap/initialization.mjs";
import { ACCOUNT, IDS, fixture, repin } from "./support/initialization-fixture.mjs";
import { decision } from "./support/bootstrap-policy-evaluator.mjs";
import { readAssembly, assessTransition } from "../scripts/release/assemblies.mjs";
import { credentialFreeEnvironment } from "../scripts/release/offline-environment.mjs";

const phase = "edge-waf";
const config = resolveEnvironmentConfig("dev", { SHELFSTATE_DEV_AWS_ACCOUNT_ID: ACCOUNT });
let baseTemplates, wafTemplate;

async function synth(selector, callback) {
  const outdir = await mkdtemp(path.join(os.tmpdir(), "shelfstate-edge-waf-"));
  try {
    const app = new App({ outdir, analyticsReporting: false });
    createEnvironmentTopology(app, config, selector ? { initializationPhase: selector } : {});
    const assembly = app.synth();
    if (selector) validateLocalEdgeWafAssembly(assembly, config, selector);
    else validateFoundationAssembly(assembly, config);
    return await callback(assembly, outdir);
  } finally { await rm(outdir, { recursive: true, force: true }); }
}

before(async () => {
  await synth(undefined, assembly => { baseTemplates = Object.fromEntries(assembly.stacks.map(stack => [stack.stackName, stack.template])); });
  await synth(phase, assembly => { wafTemplate = assembly.stacks.find(stack => stack.stackName.endsWith("edge-waf")).template; });
});

function evidence(mutate = () => {}) {
  const f = fixture(phase);
  const template = structuredClone(wafTemplate);
  mutate(template);
  f.approval.schema = EDGE_WAF_REVIEW_SCHEMA;
  f.approval.bindings = {};
  f.approval.assets = {};
  f.bundle.assets = {};
  f.bundle.templateBytes = Buffer.from(JSON.stringify(template));
  f.bundle.changeSet.changes = Object.entries(template.Resources).map(([logicalId, resource]) => ({
    logicalId, type: resource.Type, action: "Add", replacement: "False",
  }));
  return repin(f);
}
const check = candidate => validateInitializationBundle(candidate.approval, candidate.pin, candidate.bundle);
const reject = mutate => assert.throws(() => check(evidence(mutate)));

test("east WAF phase emits exactly one CloudFront-scope Web ACL", () => {
  assert.deepEqual(Object.fromEntries(Object.entries(wafTemplate.Resources).map(([id, resource]) => [id, resource.Type])), edgeWafTypes(phase));
  assertEdgeWafTemplate(wafTemplate, ACCOUNT, phase);
  assert.equal(check(evidence()).status, "LOCAL_REVIEW_VALIDATED_NOT_DEPLOYMENT_AUTHORIZATION");
  assert.equal(JSON.stringify(wafTemplate).includes("AWS::WAFv2::WebACLAssociation"), false);
});

test("rule is one IP aggregate, 120 requests per 60 seconds, block-only with metrics and no sampling", () => {
  const resource = wafTemplate.Resources.WebAcl.Properties;
  assert.deepEqual(resource.DefaultAction, { Allow: {} });
  assert.deepEqual(resource.Rules, [{
    Action: { Block: {} }, Name: "RateLimitPerIp", Priority: 0,
    Statement: { RateBasedStatement: { AggregateKeyType: "IP", EvaluationWindowSec: 60, Limit: 120 } },
    VisibilityConfig: { CloudWatchMetricsEnabled: true, MetricName: "ShelfStateV4DevEdgeRateLimit", SampledRequestsEnabled: false },
  }]);
  assert.deepEqual(resource.VisibilityConfig, { CloudWatchMetricsEnabled: true, MetricName: "ShelfStateV4DevEdgeWebAcl", SampledRequestsEnabled: false });
  assert.equal(JSON.stringify(resource).includes("Body"), false);
  assert.equal(JSON.stringify(resource).includes("Logging"), false);
});

test("WAF selector adds one local-only stack while all accepted six foundation templates remain unchanged", async () => {
  await synth(phase, assembly => {
    assert.equal(assembly.stacks.length, 7);
    assert.equal(assembly.stacks.reduce((count, stack) => count + Object.keys(stack.template.Resources ?? {}).length, 0), 1);
    for (const stack of assembly.stacks) {
      if (stack.stackName.endsWith("edge-waf")) assert.equal(stack.environment.name, `aws://${ACCOUNT}/us-east-1`);
      else assert.deepEqual(stack.template, baseTemplates[stack.stackName]);
    }
  });
});

for (const [label, mutate] of [
  ["regional scope", t => { t.Resources.WebAcl.Properties.Scope = "REGIONAL"; }],
  ["default block", t => { t.Resources.WebAcl.Properties.DefaultAction = { Block: {} }; }],
  ["rate limit change", t => { t.Resources.WebAcl.Properties.Rules[0].Statement.RateBasedStatement.Limit = 121; }],
  ["longer window", t => { t.Resources.WebAcl.Properties.Rules[0].Statement.RateBasedStatement.EvaluationWindowSec = 120; }],
  ["forwarded IP", t => { t.Resources.WebAcl.Properties.Rules[0].Statement.RateBasedStatement.AggregateKeyType = "FORWARDED_IP"; }],
  ["count action", t => { t.Resources.WebAcl.Properties.Rules[0].Action = { Count: {} }; }],
  ["scope-down statement", t => { t.Resources.WebAcl.Properties.Rules[0].Statement.RateBasedStatement.ScopeDownStatement = {}; }],
  ["request sampling", t => { t.Resources.WebAcl.Properties.VisibilityConfig.SampledRequestsEnabled = true; }],
  ["logging resource", t => { t.Resources.Logging = { Type: "AWS::WAFv2::LoggingConfiguration", Properties: {} }; }],
  ["association resource", t => { t.Resources.Association = { Type: "AWS::WAFv2::WebACLAssociation", Properties: {} }; }],
  ["second rule", t => { t.Resources.WebAcl.Properties.Rules.push(structuredClone(t.Resources.WebAcl.Properties.Rules[0])); }],
  ["unreviewed property", t => { t.Resources.WebAcl.Properties.Description = "other"; }],
]) test(`complete WAF contract rejects ${label}`, () => reject(mutate));

test("WAF initialization and steady authority are exact and exclude association or unrelated services", () => {
  const initial = executionPolicies(ACCOUNT, phase, "initialization", {});
  assert.equal(initial.length, 1);
  assert.ok(JSON.stringify(initial[0]).length <= 6144);
  const actions = initial[0].Statement.flatMap(statement => statement.Action);
  assert.ok(actions.every(action => /^(s3|ssm|wafv2):/.test(action)));
  for (const action of ["wafv2:AssociateWebACL", "cloudfront:UpdateDistribution", "acm:RequestCertificate", "route53:ChangeResourceRecordSets"])
    assert.equal(decision(initial[0], action, "*"), "implicitDeny");

  const steady = generatedAuthority(ACCOUNT, phase, "steady", IDS);
  const exact = `arn:aws:wafv2:us-east-1:${ACCOUNT}:global/webacl/shelfstate-v4-dev-edge/${IDS.webAclId}`;
  assert.ok(steady.Statement.every(statement => statement.Resource.every(resource => resource === exact)));
  assert.throws(() => executionPolicies(ACCOUNT, phase, "initialization", {}, ["certificate"]));
});

test("tagged WAF creation grants the exact dependent tagging action and CloudFormation keys", () => {
  const initial = executionPolicies(ACCOUNT, phase, "initialization", {})[0];
  const webAcl = `arn:aws:wafv2:us-east-1:${ACCOUNT}:global/webacl/shelfstate-v4-dev-edge/pending-web-acl`;
  const ownership = {
    "aws:RequestTag/Project": "ShelfState",
    "aws:RequestTag/Environment": "dev",
    "aws:RequestTag/ManagedBy": "AWS-CDK",
  };
  const context = {
    ...ownership,
    "aws:RequestedRegion": "us-east-1",
    "aws:TagKeys": ["Project", "Environment", "ManagedBy", "aws:cloudformation:logical-id", "aws:cloudformation:stack-id", "aws:cloudformation:stack-name"],
  };

  for (const action of ["wafv2:CreateWebACL", "wafv2:TagResource"])
    assert.equal(decision(initial, action, webAcl, context), "allow", action);

  for (const changed of [
    { ...context, "aws:RequestTag/Environment": "production" },
    { ...context, "aws:RequestedRegion": "us-west-2" },
    { ...context, "aws:TagKeys": [...context["aws:TagKeys"], "Unreviewed"] },
  ]) for (const action of ["wafv2:CreateWebACL", "wafv2:TagResource"])
    assert.equal(decision(initial, action, webAcl, changed), "implicitDeny", action);

  for (const resource of [
    webAcl.replace(ACCOUNT, "999999999999"),
    webAcl.replace("us-east-1", "us-west-2"),
    webAcl.replace("shelfstate-v4-dev-edge", "other"),
  ]) assert.equal(decision(initial, "wafv2:TagResource", resource, context), "implicitDeny");

  for (const action of ["wafv2:UntagResource", "wafv2:AssociateWebACL", "payments:GetConnectedAccount"])
    assert.equal(decision(initial, action, webAcl, context), "implicitDeny", action);
});

test("caller window targets only the explicit east WAF stack", () => {
  const t = target(ACCOUNT, phase);
  assert.equal(t.name, "shelfstate-v4-dev-edge-waf");
  assert.equal(t.region, "us-east-1");
  const cap = callerWindowCap(ACCOUNT, phase, "us-east-1", `wp007-${"a".repeat(64)}`, "execute");
  assert.equal(decision(cap, "cloudformation:ExecuteChangeSet", `arn:aws:cloudformation:us-east-1:${ACCOUNT}:stack/shelfstate-v4-dev-edge-certificate/x`, { "cloudformation:ChangeSetName": `wp007-${"a".repeat(64)}` }), "explicitDeny");
});

test("ordinary release validation rejects the WAF assembly", async () => {
  await synth(phase, async (assembly, outdir) => {
    assert.throws(() => validateFoundationAssembly(assembly, config), /Expected 6 capability stacks/);
    const snapshot = await readAssembly(outdir, "dev");
    assert.equal(assessTransition(snapshot, snapshot).allowed, false);
  });
});

test("real app entry selects only explicit local WAF phase", async () => {
  const outdir = await mkdtemp(path.join(os.tmpdir(), "shelfstate-waf-entry-"));
  try {
    const env = {
      ...credentialFreeEnvironment(), SHELFSTATE_DEV_AWS_ACCOUNT_ID: ACCOUNT, CDK_OUTDIR: outdir,
      CDK_CONTEXT_JSON: JSON.stringify({ shelfstateEnvironment: "dev", shelfstateInitializationPhase: phase,
        "aws:cdk:version-reporting": false, "aws:cdk:enable-path-metadata": false }),
    };
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("../infrastructure/bin/app.mjs", import.meta.url))], { env, encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, 0, result.stderr);
    const actual = JSON.parse(await readFile(path.join(outdir, "ShelfStateV4DevEdgeWaf.template.json"), "utf8"));
    assert.deepEqual(actual, wafTemplate);
  } finally { await rm(outdir, { recursive: true, force: true }); }
});
