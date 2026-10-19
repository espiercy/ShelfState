import assert from "node:assert/strict";
import test, { before } from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { App } from "aws-cdk-lib";
import { createEnvironmentTopology } from "../infrastructure/lib/topology.mjs";
import { resolveEnvironmentConfig } from "../infrastructure/lib/environment.mjs";
import {
  validateFoundationAssembly,
  validateLocalApiAssembly,
  validateLocalCertificateAssembly,
  validateLocalStaticEdgeAssembly,
  validateLocalEdgeRoutingAssembly,
} from "../infrastructure/lib/template-guards.mjs";
import {
  ALL_VIEWER_EXCEPT_HOST_HEADER_POLICY_ID,
  CACHING_DISABLED_POLICY_ID,
  EDGE_ROUTING_REVIEW_SCHEMA,
  assertEdgeRoutingTemplate,
  edgeRoutingTypes,
} from "../infrastructure/bootstrap/edge-routing-contract.mjs";
import { validateInitializationBundle } from "../infrastructure/bootstrap/initialization-guard.mjs";
import { callerWindowCap, executionPolicies, generatedAuthority } from "../infrastructure/bootstrap/initialization.mjs";
import { fixture, repin, ACCOUNT, IDS } from "./support/initialization-fixture.mjs";
import { decision } from "./support/bootstrap-policy-evaluator.mjs";
import { readAssembly, assessTransition } from "../scripts/release/assemblies.mjs";
import { credentialFreeEnvironment } from "../scripts/release/offline-environment.mjs";
import { handler } from "../backend/health.cjs";

const phase = "edge-routing";
const bindings = {
  certificateArn: `arn:aws:acm:us-east-1:${ACCOUNT}:certificate/certificate-test`,
  apiId: "apitest",
};
const config = resolveEnvironmentConfig("dev", { SHELFSTATE_DEV_AWS_ACCOUNT_ID: ACCOUNT });
const staticBindings = { certificateArn: bindings.certificateArn };
const cases = ["dev", "prod", "api-parent", "api-children", "certificate", "edge-static"];
const templates = new Map();
let routingTemplate;

async function synth(selector, callback) {
  const outdir = await mkdtemp(path.join(os.tmpdir(), "shelfstate-edge-routing-"));
  try {
    const environmentName = selector === "prod" ? "prod" : "dev";
    const env = environmentName === "prod"
      ? { SHELFSTATE_PROD_AWS_ACCOUNT_ID: ACCOUNT }
      : { SHELFSTATE_DEV_AWS_ACCOUNT_ID: ACCOUNT };
    const selected = ["dev", "prod"].includes(selector) ? undefined : selector;
    const app = new App({ outdir, analyticsReporting: false });
    const selectedConfig = resolveEnvironmentConfig(environmentName, env);
    const options = selected === undefined ? {} : {
      initializationPhase: selected,
      ...(["edge-static", phase].includes(selected)
        ? { initializationBindings: selected === phase ? bindings : staticBindings }
        : {}),
    };
    createEnvironmentTopology(app, selectedConfig, options);
    const assembly = app.synth();
    if (selected === phase) validateLocalEdgeRoutingAssembly(assembly, selectedConfig, phase, bindings);
    else if (selected === "edge-static") validateLocalStaticEdgeAssembly(assembly, selectedConfig, selected, staticBindings);
    else if (selected === "certificate") validateLocalCertificateAssembly(assembly, selectedConfig, selected);
    else if (["api-parent", "api-children"].includes(selected)) validateLocalApiAssembly(assembly, selectedConfig, selected);
    else validateFoundationAssembly(assembly, selectedConfig);
    return await callback(assembly, outdir);
  } finally {
    await rm(outdir, { recursive: true, force: true });
  }
}

before(async () => {
  for (const selector of cases) await synth(selector, assembly => {
    templates.set(selector, Object.fromEntries(assembly.stacks.map(stack => [stack.template.Metadata.ShelfState.Capability, stack.template])));
  });
  await synth(phase, assembly => {
    routingTemplate = assembly.stacks.find(stack => stack.stackName.endsWith("edge-delivery")).template;
  });
});

function evidence(mutate = () => {}) {
  const f = fixture("edge");
  const template = structuredClone(routingTemplate);
  mutate(template);
  f.approval.schema = EDGE_ROUTING_REVIEW_SCHEMA;
  f.approval.phase = phase;
  f.approval.bindings = { ...bindings };
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
const distribution = template => template.Resources.Distribution.Properties.DistributionConfig;
const apiOrigin = template => distribution(template).Origins[1];
const apiBehavior = template => distribution(template).CacheBehaviors[0];
const digest = template => createHash("sha256").update(JSON.stringify(template)).digest("hex");

test("prospective combined edge template has exactly five existing logical resources", () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(routingTemplate.Resources).map(([id, resource]) => [id, resource.Type])),
    edgeRoutingTypes(phase),
  );
  assert.equal(check(evidence()).status, "LOCAL_REVIEW_VALIDATED_NOT_DEPLOYMENT_AUTHORIZATION");
});

test("six stacks; only edge-delivery is resource-bearing with exactly five resources", async () => {
  await synth(phase, assembly => {
    assert.equal(assembly.stacks.length, 6);
    assert.equal(assembly.stacks.reduce((count, stack) => count + Object.keys(stack.template.Resources ?? {}).length, 0), 5);
    for (const stack of assembly.stacks) {
      const capability = stack.template.Metadata.ShelfState.Capability;
      if (capability === "edge-delivery") assert.equal(Object.keys(stack.template.Resources).length, 5);
      else assert.deepEqual(stack.template, templates.get("dev")[capability]);
    }
  });
});

test("all 36 prior phase templates preserve their starting content identities", () => {
  const expected = {
    "dev/edge-certificate": "f7914a9fbce807be8b24e6f75ce315a53a56eadd39b0f5687357a48b9d354ffc",
    "dev/edge-delivery": "a7ccd4270620a908456ada6ef08dee755d8bd91918e2c2a020850b7e87827e3e",
    "dev/identity-session": "d094bdf5d3a604a0368d39fb8f887a5a9e60335ee1bca18e25a22841a4daf5c0",
    "dev/library-api": "34cc2e5b00496b01851ddce603f37b861d53c7677a72743ba9eb4c4e237573eb",
    "dev/operations-lifecycle": "8a4931e2ff493704b7bc33aa7dbf14be3688cf0437d38105f26f6385dc434fe0",
    "dev/recovery-observability": "a8f268a0b6f4bba125cc6a0c2b413a2ddd947932f7b72eb05bfc18463ea3f002",
    "prod/edge-certificate": "27a5a5e29b6debc16e97b9ee78266f5f4678386d7bfa68bd8bdd3ea2fc2a7ffe",
    "prod/edge-delivery": "2ce8d8da6c7dab2bc8cb063a80d3993d7a6cb19bf7343d4ea3a5832d6c76a764",
    "prod/identity-session": "4b1ff6990239dc6171e6c67bed5b75d0c6e4e885a73cdd960ffc246c77bbea77",
    "prod/library-api": "64e47da643b2f8d09cdd213e44965a568586e3543816a32de714c7c83a0a5f05",
    "prod/operations-lifecycle": "73388e205186b034c9d5495a8ea473e0bc1bd794d2f7ac2a4898247ac897dcf7",
    "prod/recovery-observability": "9042ded548a50248b66096db10c0c043bb079a8eea52b95b14d27c85e42befeb",
    "api-parent/library-api": "c6f573f02da51d4029e09ce33ab46c6e35fd4ef146300bd042d5c546ed354b0a",
    "api-children/library-api": "fb1aaf1de3307aafc452d5006dd47418ef77b62af848b625f511f777c72cf4a3",
    "certificate/edge-certificate": "c4579dd6b934976acf97b6e65760b36e3349a53c6abb1f3e2f5ee7bd1151bfc4",
    "edge-static/edge-delivery": "bc10ef5979ea49e0ad923f953b510570cdc659946aa9d1a2cc0d4f2348d6a247",
  };
  for (const selector of cases) for (const [capability, template] of Object.entries(templates.get(selector))) {
    const inherited = selector === "prod" ? `prod/${capability}` : `dev/${capability}`;
    const key = `${selector}/${capability}`;
    assert.equal(digest(template), expected[key] ?? expected[inherited], key);
  }
});

test("static origin, default behavior, bucket policy, OAC and headers remain byte-identical", () => {
  const projection = structuredClone(routingTemplate);
  projection.Metadata.ShelfState.InitializationPhase = "edge-static";
  projection.Resources.Distribution.Properties.DistributionConfig.Origins.pop();
  delete projection.Resources.Distribution.Properties.DistributionConfig.CacheBehaviors;
  assert.deepEqual(projection, templates.get("edge-static")["edge-delivery"]);
});

test("API origin and ordered behavior use exact HTTPS, TLS, path, managed policies and read-only methods", () => {
  assert.deepEqual(apiOrigin(routingTemplate), {
    Id: "api",
    DomainName: `${bindings.apiId}.execute-api.us-west-2.amazonaws.com`,
    CustomOriginConfig: { OriginProtocolPolicy: "https-only", OriginSSLProtocols: ["TLSv1.2"] },
  });
  assert.deepEqual(apiBehavior(routingTemplate), {
    PathPattern: "/api/*", TargetOriginId: "api", AllowedMethods: ["GET", "HEAD"], CachedMethods: ["GET", "HEAD"],
    ViewerProtocolPolicy: "https-only", CachePolicyId: CACHING_DISABLED_POLICY_ID,
    OriginRequestPolicyId: ALL_VIEWER_EXCEPT_HOST_HEADER_POLICY_ID,
  });
});

test("health no-store response is preserved and no API response-header policy can overwrite it", async () => {
  const expected = { statusCode: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: '{"status":"ok"}', isBase64Encoded: false };
  const poison = new Proxy({}, { get() { throw new Error("Input must not be inspected"); } });
  assert.deepEqual(await handler(poison, poison), expected);
  assert.equal(Object.hasOwn(apiBehavior(routingTemplate), "ResponseHeadersPolicyId"), false);
});

for (const [label, mutate] of [
  ["wrong routing phase marker", t => { t.Metadata.ShelfState.InitializationPhase = "wrong"; }],
  ["static phase marker", t => { t.Metadata.ShelfState.InitializationPhase = "edge-static"; }],
  ["missing routing phase marker", t => { delete t.Metadata.ShelfState.InitializationPhase; }],
  ["wrong API binding", t => { apiOrigin(t).DomainName = "other.execute-api.us-west-2.amazonaws.com"; }],
  ["wrong API region", t => { apiOrigin(t).DomainName = `${bindings.apiId}.execute-api.us-east-1.amazonaws.com`; }],
  ["HTTP origin", t => { apiOrigin(t).CustomOriginConfig.OriginProtocolPolicy = "http-only"; }],
  ["viewer-matched origin", t => { apiOrigin(t).CustomOriginConfig.OriginProtocolPolicy = "match-viewer"; }],
  ["weak origin TLS", t => { apiOrigin(t).CustomOriginConfig.OriginSSLProtocols = ["TLSv1"]; }],
  ["extra origin TLS", t => { apiOrigin(t).CustomOriginConfig.OriginSSLProtocols.push("TLSv1.1"); }],
  ["origin path", t => { apiOrigin(t).OriginPath = "/prod"; }],
  ["custom origin header", t => { apiOrigin(t).OriginCustomHeaders = [{ HeaderName: "X-Test", HeaderValue: "unreviewed" }]; }],
  ["wrong path pattern", t => { apiBehavior(t).PathPattern = "/api*"; }],
  ["unrelated target", t => { apiBehavior(t).TargetOriginId = "static"; }],
  ["viewer HTTP redirect", t => { apiBehavior(t).ViewerProtocolPolicy = "redirect-to-https"; }],
  ["viewer HTTP allowed", t => { apiBehavior(t).ViewerProtocolPolicy = "allow-all"; }],
  ["caching enabled", t => { apiBehavior(t).CachePolicyId = "658327ea-f89d-4fab-a63d-7e88639e58f6"; }],
  ["viewer Host forwarding", t => { apiBehavior(t).OriginRequestPolicyId = "216adef6-5c7f-47e4-b989-5492eafa07d3"; }],
  ["missing origin request policy", t => { delete apiBehavior(t).OriginRequestPolicyId; }],
  ["write method", t => { apiBehavior(t).AllowedMethods.push("POST"); }],
  ["OPTIONS method", t => { apiBehavior(t).AllowedMethods.push("OPTIONS"); }],
  ["extra cached method", t => { apiBehavior(t).CachedMethods.push("OPTIONS"); }],
  ["static response headers on API", t => { apiBehavior(t).ResponseHeadersPolicyId = { "Fn::GetAtt": ["ResponseHeadersPolicy", "Id"] }; }],
  ["legacy forwarding", t => { apiBehavior(t).ForwardedValues = { QueryString: true }; }],
  ["positive minimum TTL", t => { apiBehavior(t).MinTTL = 1; }],
  ["CloudFront Function", t => { apiBehavior(t).FunctionAssociations = [{ EventType: "viewer-request", FunctionARN: "unreviewed" }]; }],
  ["Lambda at edge", t => { apiBehavior(t).LambdaFunctionAssociations = [{ EventType: "viewer-request", LambdaFunctionARN: "unreviewed" }]; }],
  ["extra behavior", t => { distribution(t).CacheBehaviors.push(structuredClone(apiBehavior(t))); }],
  ["extra origin", t => { distribution(t).Origins.push(structuredClone(apiOrigin(t))); }],
  ["unknown API behavior field", t => { apiBehavior(t).Unreviewed = true; }],
  ["unknown API origin field", t => { apiOrigin(t).Unreviewed = true; }],
]) test(`positive contract rejects ${label} under fresh consistent pins`, () => reject(mutate));

test("binding shape, account, regions, exact keys and phase selection fail closed", () => {
  const good = { initializationPhase: phase, initializationBindings: bindings };
  for (const [candidateConfig, options] of [
    [resolveEnvironmentConfig("prod", { SHELFSTATE_PROD_AWS_ACCOUNT_ID: ACCOUNT }), good],
    [resolveEnvironmentConfig("dev"), good],
    [{ ...config, primaryRegion: "us-east-1" }, good],
    [{ ...config, edgeCertificateRegion: "us-west-2" }, good],
    [config, { initializationPhase: phase }],
    [config, { ...good, initializationBindings: { certificateArn: bindings.certificateArn } }],
    [config, { ...good, initializationBindings: { ...bindings, apiId: "API-UPPER" } }],
    [config, { ...good, initializationBindings: { ...bindings, apiId: "api.test" } }],
    [config, { ...good, initializationBindings: { ...bindings, extra: true } }],
    [config, { ...good, initializationBindings: { ...bindings, certificateArn: bindings.certificateArn.replace("us-east-1", "us-west-2") } }],
    [config, { ...good, initializationPhase: [phase, "api-children"] }],
  ]) assert.throws(() => createEnvironmentTopology(new App({ analyticsReporting: false }), candidateConfig, options));
  assert.throws(() => assertEdgeRoutingTemplate(routingTemplate, ACCOUNT, "edge-static", bindings));
});

test("binding formats are not mistaken for authentic physical-resource provenance", () => {
  const f = evidence();
  const trustedPin = f.pin;
  f.approval.bindings.apiId = "differentapi";
  const template = JSON.parse(f.bundle.templateBytes);
  apiOrigin(template).DomainName = "differentapi.execute-api.us-west-2.amazonaws.com";
  f.bundle.templateBytes = Buffer.from(JSON.stringify(template));
  repin(f);
  assert.throws(() => validateInitializationBundle(f.approval, trustedPin, f.bundle), /Review pin mismatch/);
  assert.equal(check(f).status, "LOCAL_REVIEW_VALIDATED_NOT_DEPLOYMENT_AUTHORIZATION");
});

test("review evidence rejects wrong binding, target, schema, parameters, assets and change list", () => {
  for (const mutate of [
    f => { f.approval.region = "us-east-1"; },
    f => { f.approval.account = "210987654321"; },
    f => { f.approval.stack = "shelfstate-v4-dev-library-api"; },
    f => { f.approval.schema = "shelfstate.wp007-static-edge-review/v1"; },
    f => { f.approval.bindings.apiId = "wrong.api"; },
    f => { delete f.approval.bindings.certificateArn; },
    f => { f.bundle.parameters = { ApiId: "other" }; },
    f => { f.approval.assets.external = { sha256: "a".repeat(64), versionId: "v" }; },
    f => { f.bundle.changeSet.physicalResources.Distribution = "DISTTEST"; },
    f => { f.bundle.changeSet.changes[0].replacement = "True"; },
    f => { f.bundle.changeSet.changes.pop(); },
    f => { f.approval.mode = "steady"; },
  ]) {
    const f = evidence(); mutate(f); repin(f); assert.throws(() => check(f));
  }
});

test("routing phase adds no service action, execution attachment or authority breadth", () => {
  const sized = Object.fromEntries(Object.keys(IDS).map(key => [key, "X".repeat(64)]));
  for (const mode of ["initialization", "steady"]) {
    assert.deepEqual(generatedAuthority(ACCOUNT, phase, mode, sized), generatedAuthority(ACCOUNT, "edge-static", mode, sized));
    const routingPolicies = executionPolicies(ACCOUNT, phase, mode, sized);
    assert.deepEqual(routingPolicies, executionPolicies(ACCOUNT, "edge-static", mode, sized));
    assert.equal(routingPolicies.length, 2);
    for (const policy of routingPolicies) assert.ok(JSON.stringify(policy).length <= 6144);
    const combined = { Version: "2012-10-17", Statement: routingPolicies.flatMap(policy => policy.Statement) };
    assert.ok(combined.Statement.flatMap(statement => statement.Action).every(action => /^(s3|ssm|cloudfront):/.test(action)));
    for (const action of ["apigateway:GET", "apigateway:POST", "lambda:CreateFunction", "iam:PassRole", "route53:ChangeResourceRecordSets"])
      assert.equal(decision(combined, action, "*"), "implicitDeny");
  }
  assert.deepEqual(
    callerWindowCap(ACCOUNT, phase, "us-west-2", `wp007-${"a".repeat(64)}`, "prepare"),
    callerWindowCap(ACCOUNT, "edge-static", "us-west-2", `wp007-${"a".repeat(64)}`, "prepare"),
  );
  assert.throws(() => executionPolicies(ACCOUNT, phase, "initialization", IDS, ["api-parent"]));
});

test("ordinary foundation/release guards and other local selectors reject routing assembly", async () => {
  await synth(phase, async (assembly, outdir) => {
    assert.throws(() => validateFoundationAssembly(assembly, config), /zero resources/);
    assert.throws(() => validateLocalApiAssembly(assembly, config, "api-parent"));
    assert.throws(() => validateLocalCertificateAssembly(assembly, config, "certificate"));
    assert.throws(() => validateLocalStaticEdgeAssembly(assembly, config, "edge-static", staticBindings));
    const snapshot = await readAssembly(outdir, "dev");
    const assessment = assessTransition(snapshot, snapshot);
    assert.equal(assessment.allowed, false);
    assert.ok(assessment.issues.some(issue => issue.includes("non-empty assembly requires separately supported")));
  });
});

test("real app entry selects only the explicit local routing phase and bindings", async () => {
  const outdir = await mkdtemp(path.join(os.tmpdir(), "shelfstate-routing-entry-"));
  try {
    const env = {
      ...credentialFreeEnvironment(), SHELFSTATE_DEV_AWS_ACCOUNT_ID: ACCOUNT, CDK_OUTDIR: outdir,
      CDK_CONTEXT_JSON: JSON.stringify({
        shelfstateEnvironment: "dev", shelfstateInitializationPhase: phase, shelfstateInitializationBindings: bindings,
        "aws:cdk:version-reporting": false, "aws:cdk:enable-path-metadata": false,
      }),
    };
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("../infrastructure/bin/app.mjs", import.meta.url))], { env, encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, 0, result.stderr);
    const actual = JSON.parse(await readFile(path.join(outdir, "ShelfStateV4DevEdgeDelivery.template.json"), "utf8"));
    assert.deepEqual(actual, routingTemplate);
  } finally {
    await rm(outdir, { recursive: true, force: true });
  }
});
