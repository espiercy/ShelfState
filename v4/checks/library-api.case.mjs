import assert from "node:assert/strict";
import test, { before } from "node:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { App } from "aws-cdk-lib";
import { createEnvironmentTopology } from "../infrastructure/lib/topology.mjs";
import { resolveEnvironmentConfig } from "../infrastructure/lib/environment.mjs";
import { validateFoundationAssembly, validateLocalApiAssembly } from "../infrastructure/lib/template-guards.mjs";
import { assertLibraryApiTemplate, LIBRARY_API_REVIEW_SCHEMA } from "../infrastructure/bootstrap/library-api-contract.mjs";
import { validateInitializationBundle } from "../infrastructure/bootstrap/initialization-guard.mjs";
import { fixture, repin, ACCOUNT } from "./support/initialization-fixture.mjs";
import { healthBoundary } from "../infrastructure/bootstrap/model.mjs";
import { decision } from "./support/bootstrap-policy-evaluator.mjs";
import { readAssembly, assessTransition } from "../scripts/release/assemblies.mjs";
import { handler } from "../backend/health.cjs";
import { credentialFreeEnvironment } from "../scripts/release/offline-environment.mjs";

const config = resolveEnvironmentConfig("dev", { SHELFSTATE_DEV_AWS_ACCOUNT_ID: ACCOUNT });
const templates = new Map();
async function synth(phase, callback) {
  const outdir = await mkdtemp(path.join(os.tmpdir(), "shelfstate-library-api-"));
  try {
    const app = new App({ outdir, analyticsReporting: false });
    createEnvironmentTopology(app, config, phase ? { initializationPhase: phase } : {});
    const assembly = app.synth();
    if (phase) validateLocalApiAssembly(assembly, config, phase);
    else validateFoundationAssembly(assembly, config);
    return await callback(assembly, outdir);
  } finally { await rm(outdir, { recursive: true, force: true }); }
}
before(async () => {
  for (const phase of [undefined, "api-parent", "api-children"]) await synth(phase, assembly => {
    assert.equal(assembly.stacks.length, 6);
    templates.set(phase, Object.fromEntries(assembly.stacks.map(s => [s.template.Metadata.ShelfState.Capability, s.template])));
  });
});
const template = phase => structuredClone(templates.get(phase)["library-api"]);
function evidence(phase, mutate = () => {}) {
  const f = fixture(phase), t = template(phase); mutate(t);
  f.approval.schema = LIBRARY_API_REVIEW_SCHEMA;
  f.approval.bindings = phase === "api-children" ? { apiId: "apitest" } : {};
  f.approval.assets = {}; f.bundle.assets = {};
  f.bundle.templateBytes = Buffer.from(JSON.stringify(t));
  f.bundle.changeSet.changes = Object.entries(t.Resources).filter(([id]) => !(phase === "api-children" && id === "Api"))
    .map(([logicalId, r]) => ({ logicalId, type: r.Type, action: "Add", replacement: "False" }));
  return repin(f); // New consistent pins; not merely rejection of old hashes.
}
const check = f => validateInitializationBundle(f.approval, f.pin, f.bundle);
const reject = (phase, mutate, pattern = /semantic representation/) => assert.throws(() => check(evidence(phase, mutate)), pattern);

test("actual parent has only the named/tagged HTTP API and no implicit children", () => {
  const t = template("api-parent");
  assert.deepEqual(Object.keys(t.Resources), ["Api"]);
  assert.deepEqual(t.Resources.Api, { Type: "AWS::ApiGatewayV2::Api", Properties: {
    Name: "shelfstate-v4-dev-health", ProtocolType: "HTTP", Tags: { Environment: "dev", ManagedBy: "AWS-CDK", Project: "ShelfState" },
  } });
  assert.equal(check(evidence("api-parent")).status, "LOCAL_REVIEW_VALIDATED_NOT_DEPLOYMENT_AUTHORIZATION");
});

test("actual child template adds exactly seven health resources and preserves parent bytes", () => {
  const t = template("api-children");
  assert.deepEqual(Object.keys(t.Resources).sort(), ["Api", "HealthLogGroup", "HealthRole", "HealthFunction", "Integration", "Route", "InvokePermission", "DefaultStage"].sort());
  assert.deepEqual(t.Resources.Api, template("api-parent").Resources.Api);
  assert.equal(check(evidence("api-children")).status, "LOCAL_REVIEW_VALIDATED_NOT_DEPLOYMENT_AUTHORIZATION");
  for (const [id, r] of Object.entries(t.Resources)) assert.ok(!r.Condition && !r.Metadata && !id.startsWith("Custom"));
});

test("only the dev library-api changes; other five capability templates are identical", () => {
  for (const phase of ["api-parent", "api-children"]) {
    let resources = 0;
    for (const [capability, t] of Object.entries(templates.get(phase))) {
      resources += Object.keys(t.Resources ?? {}).length;
      if (capability !== "library-api") assert.deepEqual(t, templates.get(undefined)[capability]);
    }
    assert.equal(resources, phase === "api-parent" ? 1 : 8);
  }
});

test("actual health handler and inline emitted code return exact no-store contract", async () => {
  const expected = { statusCode: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: '{"status":"ok"}', isBase64Encoded: false };
  const poison = new Proxy({}, { get() { throw new Error("Input must not be inspected"); } });
  assert.deepEqual(await handler(poison, poison), expected);
  const code = template("api-children").Resources.HealthFunction.Properties.Code;
  assert.deepEqual(Object.keys(code), ["ZipFile"]);
  const sandbox = { exports: {} }; // No process/require/network/AWS capabilities.
  vm.runInNewContext(code.ZipFile, sandbox, { timeout: 1000 });
  assert.deepEqual(JSON.parse(JSON.stringify(await sandbox.exports.handler(poison, poison))), expected);
  assert.equal(code.ZipFile, (await readFile(new URL("../backend/health.cjs", import.meta.url), "utf8")).replace(/\r\n/g, "\n"));
});

test("actual API route/integration/stage and resource-based invoke grant are exact", () => {
  const r = template("api-children").Resources;
  assert.equal(r.Route.Properties.RouteKey, "GET /api/v1/health");
  assert.equal(r.Route.Properties.AuthorizationType, "NONE");
  assert.deepEqual(r.Integration.Properties.ApiId, { Ref: "Api" });
  assert.deepEqual(r.Integration.Properties.IntegrationUri, { "Fn::GetAtt": ["HealthFunction", "Arn"] });
  assert.equal(r.Integration.Properties.PayloadFormatVersion, "2.0");
  assert.equal(r.Integration.Properties.CredentialsArn, undefined);
  assert.equal(r.DefaultStage.Properties.StageName, "$default");
  assert.deepEqual(r.DefaultStage.DependsOn, ["InvokePermission", "Route"]);
  assert.deepEqual(r.InvokePermission.Properties, { Action: "lambda:InvokeFunction", FunctionName: { "Fn::GetAtt": ["HealthFunction", "Arn"] },
    Principal: "apigateway.amazonaws.com", SourceAccount: ACCOUNT,
    SourceArn: { "Fn::Join": ["", [`arn:aws:execute-api:us-west-2:${ACCOUNT}:`, { Ref: "Api" }, "/$default/GET/api/v1/health"]] } });
});

test("actual runtime role uses the independent boundary and only exact precreated log streams", () => {
  const r = template("api-children").Resources, role = r.HealthRole.Properties;
  assert.equal(role.RoleName, "shelfstate-v4-dev-health");
  assert.equal(role.PermissionsBoundary, `arn:aws:iam::${ACCOUNT}:policy/ShelfStateV4DevHealthBoundary`);
  assert.deepEqual(role.AssumeRolePolicyDocument.Statement, [{ Effect: "Allow", Action: "sts:AssumeRole", Principal: { Service: "lambda.amazonaws.com" } }]);
  assert.equal(role.Policies.length, 1);
  const identity = role.Policies[0].PolicyDocument;
  const boundary = JSON.parse(JSON.stringify(healthBoundary()).replaceAll("${ACCOUNT_ID}", ACCOUNT));
  const stream = `arn:aws:logs:us-west-2:${ACCOUNT}:log-group:/aws/lambda/shelfstate-v4-dev-health:log-stream:test`;
  for (const action of ["logs:CreateLogStream", "logs:PutLogEvents"]) {
    assert.equal(decision(identity, action, stream), "allow");
    assert.equal(decision(boundary, action, stream), "allow");
    const unrelated = stream.replace("-health:", "-unrelated:");
    assert.equal(decision(identity, action, unrelated), "implicitDeny");
    assert.equal(decision(boundary, action, unrelated), "explicitDeny");
  }
  for (const action of ["logs:CreateLogGroup", "s3:GetObject", "dynamodb:GetItem", "sts:AssumeRole", "iam:PassRole", "lambda:InvokeFunction"]) {
    assert.equal(decision(identity, action, "*"), "implicitDeny");
    assert.equal(decision(boundary, action, "*"), "explicitDeny");
  }
  assert.deepEqual(r.HealthFunction.DependsOn, ["HealthLogGroup"]);
  assert.deepEqual(r.HealthFunction.Properties.LoggingConfig, { LogGroup: { Ref: "HealthLogGroup" } });
  assert.equal(r.HealthLogGroup.Properties.RetentionInDays, 7);
  assert.equal(Object.values(r).some(v => v.Type === "AWS::IAM::ManagedPolicy"), false);
});

for (const [key, value] of [["Target", "https://unrelated.example"], ["RouteKey", "ANY /{proxy+}"], ["Body", { openapi: "3.0.1", paths: {} }],
  ["BodyS3Location", { Bucket: "unrelated", Key: "mutable.json" }], ["CorsConfiguration", { AllowOrigins: ["*"] }]]) {
  test(`actual API rejects ${key} even under a valid new review pin`, () => {
    for (const phase of ["api-parent", "api-children"]) reject(phase, t => { t.Resources.Api.Properties[key] = value; });
  });
}

for (const [label, id, delta] of [
  ["wrong route", "Route", { RouteKey: "ANY /{proxy+}" }],
  ["authorizer", "Route", { AuthorizationType: "JWT", AuthorizerId: "unrelated" }],
  ["wrong parent", "Integration", { ApiId: "other-api" }],
  ["alternate intrinsic parent", "Integration", { ApiId: { "Fn::Sub": "${Api}" } }],
  ["wrong Lambda", "Integration", { IntegrationUri: `arn:aws:lambda:us-west-2:${ACCOUNT}:function:unrelated` }],
  ["CredentialsArn", "Integration", { CredentialsArn: `arn:aws:iam::${ACCOUNT}:role/unrelated` }],
  ["payload version", "Integration", { PayloadFormatVersion: "1.0" }],
  ["response header rewrite", "Integration", { ResponseParameters: { "200": { "overwrite:header.Cache-Control": "public" } } }],
  ["other stage", "DefaultStage", { StageName: "other" }],
  ["stage variables", "DefaultStage", { StageVariables: { target: "unrelated" } }],
  ["arbitrary runtime policy", "HealthRole", { ManagedPolicyArns: [`arn:aws:iam::aws:policy/AdministratorAccess`] }],
  ["boundary substitution", "HealthRole", { PermissionsBoundary: `arn:aws:iam::${ACCOUNT}:policy/unrelated` }],
  ["code substitution", "HealthFunction", { Code: { ZipFile: "exports.handler = async () => process.env;" } }],
  ["external code", "HealthFunction", { Code: { S3Bucket: "unrelated", S3Key: "mutable.zip" } }],
  ["environment disclosure", "HealthFunction", { Environment: { Variables: { EXAMPLE: "unreviewed" } } }],
  ["other log surface", "HealthFunction", { LoggingConfig: { LogGroup: "unrelated" } }],
  ["wildcard invocation", "InvokePermission", { SourceArn: "*" }],
  ["other invoke target", "InvokePermission", { FunctionName: "unrelated" }],
  ["other invoke principal", "InvokePermission", { Principal: "*" }],
]) test(`actual child contract rejects ${label}`, () => reject("api-children", t => Object.assign(t.Resources[id].Properties, delta)));

test("extra API, route, integration, stage, authorizer or supporting resource fails inventory", () => {
  for (const id of ["Api", "Route", "Integration", "DefaultStage", "HealthRole"]) reject("api-children", t => {
    t.Resources.Extra = structuredClone(t.Resources[id]);
  }, /inventory/);
  reject("api-children", t => { t.Resources.Authorizer = { Type: "AWS::ApiGatewayV2::Authorizer", Properties: {} }; }, /inventory/);
  reject("api-parent", t => { t.Resources.Route = template("api-children").Resources.Route; }, /inventory/);
});

test("every resource envelope/property/nested object is closed, including newly supported fields", () => {
  const base = template("api-children");
  const paths = [];
  const visit = (value, p) => {
    if (!value || typeof value !== "object") return;
    if (!Array.isArray(value)) paths.push(p);
    for (const [key, child] of Object.entries(value)) visit(child, [...p, key]);
  };
  for (const [id, r] of Object.entries(base.Resources)) visit(r, ["Resources", id]);
  assert.ok(paths.length > 40);
  for (const p of paths) reject("api-children", t => {
    p.reduce((value, key) => value[key], t).Unreviewed = true;
  });
  for (const [id, resource] of Object.entries(base.Resources)) for (const key of Object.keys(resource.Properties)) {
    reject("api-children", t => { delete t.Resources[id].Properties[key]; });
  }
  reject("api-children", t => { delete t.Resources.HealthFunction.DependsOn; });
  reject("api-children", t => { t.Resources.DefaultStage.DependsOn = []; });
});

test("bootstrap and topology envelope cannot add arbitrary input/indirection", () => {
  for (const mutate of [t => { t.Parameters.BootstrapVersion.Default = "/unrelated"; }, t => { t.Rules = {}; },
    t => { t.Metadata.ShelfState.Environment = "prod"; }, t => { t.Outputs = {}; }, t => { t.Transform = "Macro"; },
    t => { t.Resources.Api.Condition = "Maybe"; }]) assert.throws(() => check(evidence("api-parent", mutate)));
});

test("real child evidence requires exact physical parent binding, no parent replacement, no parameter/asset escape", () => {
  for (const mutate of [f => { f.approval.bindings = {}; }, f => { f.bundle.changeSet.physicalResources.Api = "wrong"; },
    f => { f.bundle.changeSet.changes.push({ logicalId: "Api", type: "AWS::ApiGatewayV2::Api", action: "Modify", replacement: "False" }); },
    f => { f.bundle.changeSet.changes[0].replacement = "True"; },
    f => { f.bundle.parameters.BootstrapVersion = "/unrelated"; },
    f => { f.approval.assets.external = { sha256: "a".repeat(64), versionId: "version" }; },
    f => { f.approval.mode = "steady"; }, f => { f.approval.schema = "shelfstate.wp007-initialization-review/v1"; },
  ]) { const f = evidence("api-children"); mutate(f); repin(f); assert.throws(() => check(f)); }
});

test("phase selection fails closed for prod, absent account, unsupported phase/options", () => {
  for (const [cfg, options] of [
    [resolveEnvironmentConfig("prod", { SHELFSTATE_PROD_AWS_ACCOUNT_ID: ACCOUNT }), { initializationPhase: "api-parent" }],
    [resolveEnvironmentConfig("dev"), { initializationPhase: "api-parent" }],
    [config, { initializationPhase: "edge" }], [config, { initializationPhase: "api-parent", force: true }],
  ]) assert.throws(() => createEnvironmentTopology(new App({ analyticsReporting: false }), cfg, options));
  assert.throws(() => assertLibraryApiTemplate(template("api-parent"), ACCOUNT, "edge"));
});

test("normal foundation and release transition gates still reject real nonempty assemblies", async () => {
  await synth("api-children", async (assembly, outdir) => {
    assert.throws(() => validateFoundationAssembly(assembly, config), /zero resources/);
    const snapshot = await readAssembly(outdir, "dev");
    const assessment = assessTransition(snapshot, snapshot);
    assert.equal(assessment.allowed, false);
    assert.ok(assessment.issues.some(x => x.includes("non-empty assembly requires separately supported")));
    assert.throws(() => validateLocalApiAssembly(assembly, config, "api-parent"));
  });
});

test("existing app entry selects the two explicit local phases without credentials/lookups", async () => {
  for (const phase of ["api-parent", "api-children"]) {
    const outdir = await mkdtemp(path.join(os.tmpdir(), "shelfstate-api-entry-"));
    try {
      const env = { ...credentialFreeEnvironment(), SHELFSTATE_DEV_AWS_ACCOUNT_ID: ACCOUNT, CDK_OUTDIR: outdir,
        CDK_CONTEXT_JSON: JSON.stringify({ shelfstateEnvironment: "dev", shelfstateInitializationPhase: phase,
          "aws:cdk:version-reporting": false, "aws:cdk:enable-path-metadata": false }) };
      const result = spawnSync(process.execPath, [fileURLToPath(new URL("../infrastructure/bin/app.mjs", import.meta.url))], { env, encoding: "utf8", timeout: 30000 });
      assert.equal(result.status, 0, result.stderr);
      const actual = JSON.parse(await readFile(path.join(outdir, "ShelfStateV4DevLibraryApi.template.json"), "utf8"));
      assert.deepEqual(actual, template(phase));
    } finally { await rm(outdir, { recursive: true, force: true }); }
  }
});
