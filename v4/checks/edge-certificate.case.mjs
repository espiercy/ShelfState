import assert from "node:assert/strict";
import test, { before } from "node:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { App } from "aws-cdk-lib";
import { createEnvironmentTopology } from "../infrastructure/lib/topology.mjs";
import { resolveEnvironmentConfig } from "../infrastructure/lib/environment.mjs";
import { validateFoundationAssembly, validateLocalCertificateAssembly, validateLocalApiAssembly } from "../infrastructure/lib/template-guards.mjs";
import { assertEdgeCertificateTemplate, EDGE_CERTIFICATE_REVIEW_SCHEMA } from "../infrastructure/bootstrap/edge-certificate-contract.mjs";
import { validateInitializationBundle } from "../infrastructure/bootstrap/initialization-guard.mjs";
import { executionPolicies, generatedAuthority, ACTION_INVENTORY, closureDecision, assertClosure } from "../infrastructure/bootstrap/initialization.mjs";
import { fixture, repin, ACCOUNT, IDS } from "./support/initialization-fixture.mjs";
import { decision } from "./support/bootstrap-policy-evaluator.mjs";
import { readAssembly, assessTransition } from "../scripts/release/assemblies.mjs";
import { credentialFreeEnvironment } from "../scripts/release/offline-environment.mjs";

const config = resolveEnvironmentConfig("dev", { SHELFSTATE_DEV_AWS_ACCOUNT_ID: ACCOUNT });
let baseTemplates, certificateTemplate;
async function synth(phase, callback) {
  const outdir = await mkdtemp(path.join(os.tmpdir(), "shelfstate-certificate-"));
  try {
    const app = new App({ outdir, analyticsReporting: false });
    createEnvironmentTopology(app, config, phase ? { initializationPhase: phase } : {});
    const assembly = app.synth();
    if (phase) validateLocalCertificateAssembly(assembly, config, phase);
    else validateFoundationAssembly(assembly, config);
    return await callback(assembly, outdir);
  } finally { await rm(outdir, { recursive: true, force: true }); }
}
before(async () => {
  await synth(undefined, a => { baseTemplates = Object.fromEntries(a.stacks.map(s => [s.stackName, s.template])); });
  await synth("certificate", a => { certificateTemplate = a.stacks.find(s => s.stackName.endsWith("edge-certificate")).template; });
});
function evidence(mutate = () => {}) {
  const f = fixture("certificate"), t = structuredClone(certificateTemplate); mutate(t);
  f.approval.schema = EDGE_CERTIFICATE_REVIEW_SCHEMA;
  f.approval.bindings = {}; f.approval.assets = {}; f.bundle.assets = {};
  f.bundle.templateBytes = Buffer.from(JSON.stringify(t));
  f.bundle.changeSet.changes = Object.entries(t.Resources).map(([logicalId, r]) => ({ logicalId, type: r.Type, action: "Add", replacement: "False" }));
  return repin(f);
}
const check = f => validateInitializationBundle(f.approval, f.pin, f.bundle);
const reject = mutate => assert.throws(() => check(evidence(mutate)));

test("actual east certificate has exact single public non-exportable DNS domain, tags and handoff", () => {
  const t = certificateTemplate;
  assert.deepEqual(t.Resources, { Certificate: { Type: "AWS::CertificateManager::Certificate", Properties: {
    DomainName: "dev.shelfstate.codecorax.com", ValidationMethod: "DNS", CertificateExport: "DISABLED",
    Tags: [{ Key: "Environment", Value: "dev" }, { Key: "ManagedBy", Value: "AWS-CDK" }, { Key: "Project", Value: "ShelfState" }],
  }, Metadata: { ShelfStateStatefulPolicy: "destroy-approved" } } });
  assert.deepEqual(t.Outputs, { CertificateArn: { Value: { Ref: "Certificate" } } });
  assert.equal(t.Metadata.ShelfState.Region, "us-east-1");
  assert.equal(check(evidence()).status, "LOCAL_REVIEW_VALIDATED_NOT_DEPLOYMENT_AUTHORIZATION");
});

test("only certificate stack populated; other five templates unchanged with no cross-region bridge", async () => {
  await synth("certificate", assembly => {
    assert.equal(assembly.stacks.length, 6);
    let resources = 0;
    for (const artifact of assembly.stacks) {
      resources += Object.keys(artifact.template.Resources ?? {}).length;
      if (artifact.stackName === "shelfstate-v4-dev-edge-certificate") {
        assert.equal(artifact.environment.name, `aws://${ACCOUNT}/us-east-1`);
      } else assert.deepEqual(artifact.template, baseTemplates[artifact.stackName]);
      assert.ok(!JSON.stringify(artifact.template).includes("Fn::ImportValue"));
      assert.ok(!JSON.stringify(artifact.template).includes("Custom::"));
    }
    assert.equal(resources, 1);
  });
});

for (const [label, delta] of [
  ["different domain", { DomainName: "other.codecorax.com" }],
  ["wildcard domain", { DomainName: "*.shelfstate.codecorax.com" }],
  ["additional SAN", { SubjectAlternativeNames: ["other.codecorax.com"] }],
  ["redundant SAN", { SubjectAlternativeNames: ["dev.shelfstate.codecorax.com"] }],
  ["email validation", { ValidationMethod: "EMAIL" }],
  ["HTTP validation", { ValidationMethod: "HTTP" }],
  ["export enabled", { CertificateExport: "ENABLED" }],
  ["private CA", { CertificateAuthorityArn: `arn:aws:acm-pca:us-east-1:${ACCOUNT}:certificate-authority/synthetic` }],
  ["key algorithm", { KeyAlgorithm: "EC_prime256v1" }],
  ["explicit default algorithm", { KeyAlgorithm: "RSA_2048" }],
  ["transparency disabled", { CertificateTransparencyLoggingPreference: "DISABLED" }],
  ["unreviewed transparency field", { CertificateTransparencyLoggingPreference: "ENABLED" }],
  ["automatic hosted zone", { DomainValidationOptions: [{ DomainName: "dev.shelfstate.codecorax.com", HostedZoneId: "ZTESTONLY" }] }],
  ["other validation options", { DomainValidationOptions: [{ DomainName: "dev.shelfstate.codecorax.com" }] }],
  ["intrinsic name", { DomainName: { "Fn::Sub": "dev.shelfstate.codecorax.com" } }],
  ["dynamic external name", { DomainName: "{{resolve:ssm:/unreviewed}}" }],
  ["changed ownership", { Tags: [{ Key: "Environment", Value: "prod" }] }],
  ["unknown property", { Unreviewed: true }],
]) test(`new valid review pin still rejects ${label}`, () => reject(t => Object.assign(t.Resources.Certificate.Properties, delta)));

test("all required properties, tags and resource attributes are closed", () => {
  for (const key of Object.keys(certificateTemplate.Resources.Certificate.Properties)) reject(t => { delete t.Resources.Certificate.Properties[key]; });
  for (const mutate of [
    t => { t.Resources.Certificate.Properties.Tags[0].Value = "other"; },
    t => { t.Resources.Certificate.Properties.Tags[0].Extra = "unreviewed"; },
    t => { t.Resources.Certificate.Properties.Tags.push({ Key: "Name", Value: "other" }); },
    t => { t.Resources.Certificate.Metadata.ShelfStateStatefulPolicy = "retained"; },
    t => { t.Resources.Certificate.Metadata.Other = true; },
    t => { t.Resources.Certificate.Condition = "Maybe"; },
    t => { t.Resources.Certificate.DeletionPolicy = "Retain"; },
    t => { t.Resources.Certificate.UpdateReplacePolicy = "Retain"; },
    t => { t.Resources.Certificate.DependsOn = ["Extra"] ; },
  ]) reject(mutate);
});

test("substituted logical ID/type, extra certificate, DNS record and cross-region custom resource reject", () => {
  reject(t => { t.Resources.Other = t.Resources.Certificate; delete t.Resources.Certificate; });
  reject(t => { t.Resources.Certificate.Type = "Custom::Certificate"; });
  for (const Type of ["AWS::CertificateManager::Certificate", "AWS::Route53::RecordSet", "AWS::CloudFormation::Stack", "Custom::CrossRegionExportReader"]) {
    reject(t => { t.Resources.Extra = { Type, Properties: {} }; });
  }
});

test("certificate output is local Ref only, no export/import/foreign ARN/extra output", () => {
  for (const mutate of [
    t => { t.Outputs.CertificateArn.Export = { Name: "cross-region" }; },
    t => { t.Outputs.CertificateArn.Value = { "Fn::ImportValue": "unrelated" }; },
    t => { t.Outputs.CertificateArn.Value = { "Fn::GetAtt": ["Other", "Arn"] }; },
    t => { t.Outputs.CertificateArn.Value = `arn:aws:acm:us-west-2:${ACCOUNT}:certificate/other`; },
    t => { t.Outputs.Extra = { Value: "unreviewed" }; },
    t => { delete t.Outputs; },
  ]) reject(mutate);
});

test("topology/bootstrap envelope and evidence cannot add input/indirection or substitute target", () => {
  for (const mutate of [
    t => { t.Metadata.ShelfState.Region = "us-west-2"; },
    t => { t.Metadata.ShelfState.Environment = "prod"; },
    t => { t.Metadata.ShelfState.Capability = "library-api"; },
    t => { t.Metadata.ShelfState.InitializationPhase = "api-parent"; },
    t => { t.Parameters.BootstrapVersion.Default = "/unrelated"; },
    t => { t.Rules = {}; }, t => { t.Conditions = {}; }, t => { t.Transform = "Macro"; },
  ]) reject(mutate);
  for (const mutate of [
    f => { f.approval.region = "us-west-2"; },
    f => { f.approval.stack = "shelfstate-v4-dev-library-api"; },
    f => { f.approval.executionRole = f.approval.executionRole.replace("us-east-1", "us-west-2"); },
    f => { f.approval.phase = "api-parent"; },
    f => { f.approval.schema = "shelfstate.wp007-library-api-review/v1"; },
    f => { f.approval.schema = "shelfstate.wp007-initialization-review/v1"; },
    f => { f.approval.bindings = { certificateArn: "guessed" }; },
    f => { f.approval.assets = { external: { sha256: "a".repeat(64), versionId: "version" } }; },
    f => { f.bundle.parameters = { BootstrapVersion: "6" }; },
    f => { f.bundle.changeSet.physicalResources.Certificate = "guessed"; },
    f => { f.bundle.changeSet.changes[0].replacement = "True"; },
    f => { f.bundle.changeSet.changes[0].action = "Modify"; },
    f => { f.approval.mode = "steady"; },
  ]) { const f = evidence(); mutate(f); repin(f); assert.throws(() => check(f)); }
});

test("certificate initialization and exact steady composition have zero Route53 authority", () => {
  const actions = p => p.Statement.flatMap(s => s.Action);
  const initial = executionPolicies(ACCOUNT, "certificate", "initialization", {});
  const steady = executionPolicies(ACCOUNT, "certificate", "steady", { certificateId: IDS.certificateId });
  assert.equal(initial.length, 1); assert.equal(steady.length, 1);
  for (const p of [...initial, ...steady]) {
    assert.ok(actions(p).every(a => !a.toLowerCase().startsWith("route53:")));
    assert.equal(decision(p, "route53:ChangeResourceRecordSets", "arn:aws:route53:::hostedzone/ZTESTONLY"), "implicitDeny");
  }
  const inventory = ACTION_INVENTORY.find(r => r.phase === "certificate");
  assert.deepEqual(actions(generatedAuthority(ACCOUNT, "certificate", "initialization")), [...inventory.create, ...inventory.read, ...inventory.rollback]);
  assert.ok(!actions(steady[0]).includes("acm:RequestCertificate"));
  const arn = `arn:aws:acm:us-east-1:${ACCOUNT}:certificate/${IDS.certificateId}`;
  const policy = generatedAuthority(ACCOUNT, "certificate", "steady", { certificateId: IDS.certificateId });
  for (const action of [...inventory.read, ...inventory.rollback, ...inventory.update]) {
    assert.equal(decision(policy, action, arn), "allow");
    assert.equal(decision(policy, action, arn.replace(IDS.certificateId, "unrelated")), "implicitDeny");
  }
});

test("pending certificate is not closure and output does not attest issued/live identity", () => {
  assert.equal(closureDecision("CREATE_IN_PROGRESS"), "KEEP_AUTHORITY_NO_NEXT_OPERATION");
  assert.throws(() => assertClosure({ status: "CREATE_IN_PROGRESS", resources: {}, narrowedPolicyMatches: true,
    effectiveReadbackMatches: true, otherWindowOpen: false }, {}), /Not terminal/);
  // Only logical identity exists here; no synthesized fake ARN/CNAME/status.
  assert.deepEqual(evidence().approval.bindings, {});
  assert.deepEqual(Object.keys(certificateTemplate.Outputs), ["CertificateArn"]);
});

test("production, missing account, wrong region, options and mixed phases fail before synthesis", () => {
  for (const [cfg, options] of [
    [resolveEnvironmentConfig("prod", { SHELFSTATE_PROD_AWS_ACCOUNT_ID: ACCOUNT }), { initializationPhase: "certificate" }],
    [resolveEnvironmentConfig("dev"), { initializationPhase: "certificate" }],
    [{ ...config, edgeCertificateRegion: "us-west-2" }, { initializationPhase: "certificate" }],
    [config, { initializationPhase: ["certificate", "api-children"] }],
    [config, { initializationPhase: "certificate", crossRegionReferences: true }],
  ]) assert.throws(() => createEnvironmentTopology(new App({ analyticsReporting: false }), cfg, options));
  assert.throws(() => assertEdgeCertificateTemplate(certificateTemplate, ACCOUNT, "api-parent"));
});

test("foundation/API/release acceptance still rejects the certificate resource assembly", async () => {
  await synth("certificate", async (assembly, outdir) => {
    assert.throws(() => validateFoundationAssembly(assembly, config), /zero resources/);
    assert.throws(() => validateLocalApiAssembly(assembly, config, "api-parent"));
    const snapshot = await readAssembly(outdir, "dev");
    const assessment = assessTransition(snapshot, snapshot);
    assert.equal(assessment.allowed, false);
    assert.ok(assessment.issues.some(x => x.includes("non-empty assembly requires separately supported")));
  });
});

test("actual app entry selects only the certificate phase without credentials/lookups", async () => {
  const outdir = await mkdtemp(path.join(os.tmpdir(), "shelfstate-certificate-entry-"));
  try {
    const env = { ...credentialFreeEnvironment(), SHELFSTATE_DEV_AWS_ACCOUNT_ID: ACCOUNT, CDK_OUTDIR: outdir,
      CDK_CONTEXT_JSON: JSON.stringify({ shelfstateEnvironment: "dev", shelfstateInitializationPhase: "certificate",
        "aws:cdk:version-reporting": false, "aws:cdk:enable-path-metadata": false }) };
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("../infrastructure/bin/app.mjs", import.meta.url))], { env, encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, 0, result.stderr);
    const actual = JSON.parse(await readFile(path.join(outdir, "ShelfStateV4DevEdgeCertificate.template.json"), "utf8"));
    assert.deepEqual(actual, certificateTemplate);
  } finally { await rm(outdir, { recursive: true, force: true }); }
});
