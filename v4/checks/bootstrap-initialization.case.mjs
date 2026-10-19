import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { ACTION_INVENTORY, PHASES, target, generatedAuthority, assertGeneratedAuthority, executionPolicies, callerWindowCap, closureDecision, assertClosure } from "../infrastructure/bootstrap/initialization.mjs";
import { validateInitializationBundle } from "../infrastructure/bootstrap/initialization-guard.mjs";
import { deploymentPolicy } from "../infrastructure/bootstrap/model.mjs";
import { decision, allows } from "./support/bootstrap-policy-evaluator.mjs";
import { ACCOUNT, IDS, fixture, repin, mutateTemplate } from "./support/initialization-fixture.mjs";
import { hashObject } from "../scripts/release/schema.mjs";
const check = f => validateInitializationBundle(f.approval, f.pin, f.bundle);
const join = (...policies) => ({ Version: "2012-10-17", Statement: policies.flatMap(p => p.Statement) });
const name = `wp007-${"a".repeat(64)}`;

test("eight action classes distinguish rollback/update and preserve handler proof obligations", () => {
  assert.equal(ACTION_INVENTORY.length, 8);
  for (const r of ACTION_INVENTORY) { assert.ok(r.create.length && r.read.length && r.rollback.length && r.update.length && r.proof && r.replacement); }
  const initial = generatedAuthority(ACCOUNT, "edge", "initialization");
  assert.equal(allows(initial, "cloudfront:UpdateOriginAccessControl", `arn:aws:cloudfront::${ACCOUNT}:origin-access-control/ANY`), false);
  assert.equal(allows(initial, "cloudfront:UpdateDistribution", `arn:aws:cloudfront::${ACCOUNT}:distribution/NEW`, {
    "aws:ResourceTag/Project": "ShelfState", "aws:ResourceTag/Environment": "dev", "aws:ResourceTag/ManagedBy": "AWS-CDK",
  }), true);
});

for (const phase of Object.keys(PHASES)) {
  test(`${phase}: reviewed synthetic assembly passes without enabling deployment`, () => {
    // Actual edge phases have no historical synthetic representation. Their
    // positive emitted-template fixtures live in their dedicated suites.
    if (["edge-static", "edge-routing"].includes(phase)) return assert.throws(() => check(fixture(phase)), /Unsupported phase for review schema/);
    assert.equal(check(fixture(phase)).status, "LOCAL_REVIEW_VALIDATED_NOT_DEPLOYMENT_AUTHORIZATION");
  });
  test(`${phase}: exact single-stack cap defeats old six-stack allow and opposite-region role`, () => {
    const t = target(ACCOUNT, phase), cap = callerWindowCap(ACCOUNT, phase, t.region, name, "execute");
    const p = join(deploymentPolicy(t.region, ACCOUNT), cap);
    const ctx = { "cloudformation:ChangeSetName": name };
    assert.equal(allows(p, "cloudformation:ExecuteChangeSet", t.stackArn.replace("*", "x"), ctx), true);
    const other = `arn:aws:cloudformation:${t.region}:${ACCOUNT}:stack/shelfstate-v4-dev-identity-session/x`;
    assert.equal(decision(p, "cloudformation:ExecuteChangeSet", other, ctx), "explicitDeny");
    assert.equal(decision(p, "cloudformation:CreateChangeSet", t.stackArn.replace("*", "x"), ctx), "explicitDeny");
    for (const bad of [{}, { "cloudformation:ChangeSetName": name + "-other" }]) assert.equal(decision(p, "cloudformation:ExecuteChangeSet", t.stackArn.replace("*", "x"), bad), "explicitDeny");
    const opposite = t.region === "us-west-2" ? "us-east-1" : "us-west-2";
    assert.equal(decision(join(deploymentPolicy(opposite, ACCOUNT), callerWindowCap(ACCOUNT, phase, opposite, name, "execute")), "cloudformation:ExecuteChangeSet", other, ctx), "explicitDeny");
  });
  test(`${phase}: exact steady fragment rejects stale init grants and unrelated resources`, () => {
    const steady = generatedAuthority(ACCOUNT, phase, "steady", IDS);
    assertGeneratedAuthority(steady, ACCOUNT, phase, "steady", IDS);
    assert.throws(() => assertGeneratedAuthority(join(steady, generatedAuthority(ACCOUNT, phase, "initialization", IDS)), ACCOUNT, phase, "steady", IDS));
    for (const s of steady.Statement) for (const action of s.Action) for (const resource of s.Resource) {
      assert.equal(allows(steady, action, resource), true);
      assert.equal(allows(steady, action, resource + "-unrelated"), false);
      assert.equal(resource.includes("*"), false);
    }
    const changed = structuredClone(steady); changed.Statement[0].Resource[0] += "-unrelated";
    assert.throws(() => assertGeneratedAuthority(changed, ACCOUNT, phase, "steady", IDS));
  });
}

test("prepare cannot execute; execute cannot recreate/delete a change set; closed revokes caller operations", () => {
  const t = target(ACCOUNT, "edge"), arn = t.stackArn.replace("*", "x"), ctx = { "cloudformation:RoleArn": t.executionRole, "cloudformation:ChangeSetName": name };
  const prepare = callerWindowCap(ACCOUNT, "edge", t.region, name, "prepare");
  assert.equal(allows(prepare, "cloudformation:CreateChangeSet", arn, ctx), true);
  assert.equal(decision(prepare, "cloudformation:ExecuteChangeSet", arn, ctx), "explicitDeny");
  assert.equal(allows(prepare, "cloudformation:CreateChangeSet", arn, { ...ctx, "cloudformation:RoleArn": "other" }), false);
  for (const action of ["CreateChangeSet", "DeleteChangeSet", "UpdateStack", "DeleteStack", "ContinueUpdateRollback"]) assert.equal(decision(callerWindowCap(ACCOUNT, "edge", t.region, name, "execute"), `cloudformation:${action}`, arn, ctx), "explicitDeny");
  assert.equal(decision(callerWindowCap(ACCOUNT, "edge", t.region, name, "closed"), "cloudformation:ExecuteChangeSet", arn, ctx), "explicitDeny");
});

test("temporary tag/lifecycle reach is exposed, not falsely called unrelated-resource isolation", () => {
  const p = generatedAuthority(ACCOUNT, "edge", "initialization");
  const unrelated = `arn:aws:cloudfront::${ACCOUNT}:distribution/UNRELATED`;
  const tags = { "aws:RequestTag/Project": "ShelfState", "aws:RequestTag/Environment": "dev", "aws:RequestTag/ManagedBy": "AWS-CDK" };
  assert.equal(allows(p, "cloudfront:TagResource", unrelated, tags), true); // Accepted residual, NOT a denial claim.
  assert.equal(allows(p, "cloudfront:TagResource", unrelated, {}), false);
  assert.equal(allows(p, "cloudfront:DeleteDistribution", unrelated), false);
  assert.equal(allows(p, "cloudfront:DeleteDistribution", unrelated, { "aws:ResourceTag/Project": "ShelfState", "aws:ResourceTag/Environment": "dev", "aws:ResourceTag/ManagedBy": "AWS-CDK" }), true); // Relabeling defeats tag isolation.
  assert.equal(allows(generatedAuthority(ACCOUNT, "edge", "steady", IDS), "cloudfront:TagResource", unrelated, tags), false);
  const f = fixture("edge"); f.bundle.changeSet.physicalResources = { Distribution: "UNRELATED" }; repin(f);
  assert.throws(() => check(f), /pre-existing/);
});

test("HTTP child authority never reaches another API; parent initialization residual remains explicit", () => {
  const p = generatedAuthority(ACCOUNT, "api-children", "initialization", IDS);
  const base = `arn:aws:apigateway:us-west-2::/apis/${IDS.apiId}`;
  assert.equal(allows(p, "apigateway:POST", `${base}/routes`), true);
  assert.equal(allows(p, "apigateway:DELETE", `${base}/routes/new`), true);
  assert.equal(allows(p, "apigateway:DELETE", base), false);
  assert.equal(allows(p, "apigateway:DELETE", `${base}-other/routes/new`), false);
  assert.throws(() => generatedAuthority(ACCOUNT, "api-children", "initialization"));
});

test("east initialization enforces certificate request conditions and never grants DNS publication", () => {
  const p = generatedAuthority(ACCOUNT, "certificate", "initialization");
  const ctx = { "aws:RequestTag/Project": "ShelfState", "aws:RequestTag/Environment": "dev", "aws:RequestTag/ManagedBy": "AWS-CDK",
    "aws:RequestedRegion": "us-east-1", "acm:ValidationMethod": "DNS", "acm:Export": "DISABLED", "acm:DomainNames": ["dev.shelfstate.codecorax.com"] };
  assert.equal(allows(p, "acm:RequestCertificate", "*", ctx), true);
  for (const delta of [{ "acm:DomainNames": ["*.dev.shelfstate.codecorax.com"] }, { "acm:DomainNames": ["dev.shelfstate.codecorax.com", "other.example"] },
    { "aws:RequestedRegion": "us-west-2" }, { "acm:CertificateAuthority": "private" }, { "acm:Export": "ENABLED" }]) assert.equal(allows(p, "acm:RequestCertificate", "*", { ...ctx, ...delta }), false);
  const missing = { ...ctx }; delete missing["acm:DomainNames"]; assert.equal(allows(p, "acm:RequestCertificate", "*", missing), false);
  for (const full of executionPolicies(ACCOUNT, "certificate", "initialization", IDS)) assert.equal(full.Statement.some(s => s.Action.some(a => a.startsWith("route53:"))), false);
});

test("full steady compositions do not retain legacy creation statements or unresolved bindings", () => {
  const b = { ...IDS, zoneId: "ZTESTONLY" };
  for (const phase of Object.keys(PHASES)) {
    for (const p of executionPolicies(ACCOUNT, phase, "steady", b, phase === "api-children" ? ["api-parent"] : [])) {
      assert.equal(JSON.stringify(p).includes("${"), false);
      for (const s of p.Statement.filter(s => s.Effect === "Allow")) assert.equal(s.Action.some(a => /:(Create|RequestCertificate)/.test(a) || a === "apigateway:POST"), false);
    }
  }
  assert.throws(() => executionPolicies(ACCOUNT, "api-children", "initialization", b), /parent/);
  assert.throws(() => executionPolicies(ACCOUNT, "edge", "initialization", b, ["certificate"]));
});

for (const [label, mutate] of [
  ["wrong stack", f => { f.approval.stack += "-other"; }],
  ["wrong account", f => { f.approval.account = "999999999999"; }],
  ["wrong region", f => { f.approval.region = "us-east-1"; }],
  ["wrong execution role", f => { f.approval.executionRole += "-other"; }],
]) test(label, () => { const f = fixture(); mutate(f); repin(f); assert.throws(() => check(f)); });

for (const [label, mutate] of [
  ["extra deterministic resource", t => { t.Resources.Extra = structuredClone(t.Resources.Distribution); }],
  ["nested stack", t => { t.Resources.OriginAccessControl.Type = "AWS::CloudFormation::Stack"; }],
  ["custom resource", t => { t.Resources.OriginAccessControl.Type = "Custom::Anything"; }],
  ["macro", t => { t.Transform = "Macro"; }],
  ["unexpected logical ID", t => { t.Resources.Renamed = t.Resources.Distribution; delete t.Resources.Distribution; }],
  ["wrong DNS target", t => { t.Resources.AliasA.Properties.AliasTarget.DNSName = "unrelated.example"; }],
  ["wrong origin", t => { t.Resources.Distribution.Properties.DistributionConfig.Origins[0].DomainName = "unrelated.example"; }],
]) test(label, () => assert.throws(() => check(mutateTemplate(fixture("edge"), mutate))));

test("certificate has no SAN/wildcard/private/export/automatic DNS alternative", () => {
  for (const delta of [{ DomainName: "other.example" }, { SubjectAlternativeNames: ["*.codecorax.com"] }, { CertificateExport: "ENABLED" }, { ValidationMethod: "EMAIL" }, { CertificateAuthorityArn: "private" }, { DomainValidationOptions: [{ HostedZoneId: "ZTESTONLY" }] }]) {
    assert.throws(() => check(mutateTemplate(fixture("certificate"), t => Object.assign(t.Resources.Certificate.Properties, delta))));
  }
});
test("unrelated API, integration, Lambda source and retained parent substitution fail", () => {
  for (const mutate of [t => { t.Resources.Route.Properties.ApiId = "other-api"; }, t => { t.Resources.Route.Properties.Target = "integrations/other"; },
    t => { t.Resources.Integration.Properties.IntegrationUri += "-other"; }, t => { t.Resources.InvokePermission.Properties.SourceArn = "*"; }]) assert.throws(() => check(mutateTemplate(fixture("api-children"), mutate)));
  const f = fixture("api-children"); f.bundle.changeSet.physicalResources.Api = "other"; repin(f); assert.throws(() => check(f));
});
// These attacks are repinned: failure must be semantic, not a stale digest/pin.
for (const [label, delta] of [
  ["API Target quick-create", { Target: "https://unrelated.example/" }],
  ["API RouteKey quick-create", { RouteKey: "ANY /{proxy+}" }],
  ["OpenAPI Body", { Body: { openapi: "3.0.1", paths: { "/unreviewed": { get: {
    "x-amazon-apigateway-integration": { type: "http_proxy", uri: "https://unrelated.example/", httpMethod: "GET" },
  } } } } }],
  ["external BodyS3Location", { BodyS3Location: { Bucket: "unreviewed-specification", Key: "mutable.json" } }],
]) test(`R1 rejects ${label} under a new valid pin in both API phases`, () => {
  for (const phase of ["api-parent", "api-children"]) assert.throws(() => check(mutateTemplate(fixture(phase), t => {
    Object.assign(t.Resources.Api.Properties, delta);
  })), /Api: unsupported WP-007 semantic representation/);
});

for (const [label, mutate] of [
  ["extra cache behavior/unrelated policy", c => { c.CacheBehaviors = [{ PathPattern: "/unreviewed/*", TargetOriginId: "static", CachePolicyId: "unrelated-policy", ViewerProtocolPolicy: "allow-all" }]; }],
  ["Lambda@Edge association", c => { c.DefaultCacheBehavior.LambdaFunctionAssociations = [{ EventType: "viewer-request", LambdaFunctionARN: `arn:aws:lambda:us-east-1:${ACCOUNT}:function:unrelated:1` }]; }],
]) test(`R1 rejects ${label} under a new valid pin`, () => {
  assert.throws(() => check(mutateTemplate(fixture("edge"), t => mutate(t.Resources.Distribution.Properties.DistributionConfig))), /Distribution: unsupported WP-007 semantic representation/);
});

test("R1 rejects integration CredentialsArn under a new valid pin", () => {
  assert.throws(() => check(mutateTemplate(fixture("api-children"), t => {
    t.Resources.Integration.Properties.CredentialsArn = `arn:aws:iam::${ACCOUNT}:role/unrelated`;
  })), /Integration: unsupported WP-007 semantic representation/);
});

// Novel fields and deletions exercise EVERY resource, including empty placeholders.
for (const phase of Object.keys(PHASES).filter(p => !["edge-static", "edge-routing"].includes(p))) {
  const resources = JSON.parse(fixture(phase).bundle.templateBytes).Resources;
  for (const [logicalId, resource] of Object.entries(resources)) {
    test(`${phase}/${logicalId}: closed property set and required values`, () => {
      const reject = mutate => assert.throws(() => check(mutateTemplate(fixture(phase), t => mutate(t.Resources[logicalId]))), /unsupported WP-007 semantic representation/);
      reject(r => { r.Properties.UnreviewedFutureProperty = { Enabled: true }; });
      for (const key of Object.keys(resource.Properties)) {
        reject(r => { delete r.Properties[key]; });
        reject(r => { r.Properties[key] = null; });
      }
      for (const replacement of [null, [], "external-specification", { "Fn::Transform": { Name: "AWS::Include", Parameters: { Location: "s3://unreviewed/spec.json" } } }]) {
        assert.throws(() => check(mutateTemplate(fixture(phase), t => { t.Resources[logicalId].Properties = replacement; })));
      }
    });
  }
  if (["edge", "api-children"].includes(phase)) test(`${phase}: novel keys at every nested object fail under newly pinned evidence`, () => {
    const paths = [];
    function visit(value, path) {
      if (!value || typeof value !== "object") return;
      if (!Array.isArray(value) && path.length > 2) paths.push(path);
      for (const [key, child] of Object.entries(value)) visit(child, [...path, key]);
    }
    for (const [id, r] of Object.entries(resources)) visit(r.Properties, [id, "Properties"]);
    assert.ok(paths.length > 0, "Nested-object coverage must not be vacuous");
    for (const path of paths) assert.throws(() => check(mutateTemplate(fixture(phase), t => {
      const nested = path.reduce((v, key) => v[key], t.Resources);
      nested.UnreviewedNestedBehavior = true;
    })), /unsupported WP-007 semantic representation/, path.join("."));
  });
  test(`${phase}: supported benign key order and literal template description remain accepted`, () => {
    const reorder = value => Array.isArray(value) ? value.map(reorder) : value && typeof value === "object"
      ? Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reorder(child)])) : value;
    const f = fixture(phase);
    f.bundle.templateBytes = Buffer.from(JSON.stringify(reorder({ ...JSON.parse(f.bundle.templateBytes), AWSTemplateFormatVersion: "2010-09-09", Description: "Synthetic local-only review fixture" })));
    repin(f);
    assert.equal(check(f).status, "LOCAL_REVIEW_VALIDATED_NOT_DEPLOYMENT_AUTHORIZATION");
  });
}

for (const [label, mutate] of [
  ["extra origin", c => { c.Origins.push({ ...c.Origins[0], Id: "unrelated", DomainName: "unrelated.example" }); }],
  ["CloudFront Function association", c => { c.DefaultCacheBehavior.FunctionAssociations = [{ EventType: "viewer-request", FunctionARN: `arn:aws:cloudfront::${ACCOUNT}:function/unrelated` }]; }],
  ["viewer certificate extension", c => { c.ViewerCertificate.CloudFrontDefaultCertificate = true; }],
  ["origin relationship intrinsic", c => { c.Origins[0].OriginAccessControlId = { "Fn::Sub": "${OriginAccessControl}" }; }],
  ["custom origin configuration", c => { c.Origins[0].CustomOriginConfig = { OriginProtocolPolicy: "http-only" }; }],
  ...["CachePolicyId", "OriginRequestPolicyId", "ResponseHeadersPolicyId"].map(key => [`unrelated ${key}`, c => { c.DefaultCacheBehavior[key] = "unrelated-policy"; }]),
]) test(`adjacent edge representation rejected: ${label}`, () => {
  assert.throws(() => check(mutateTemplate(fixture("edge"), t => mutate(t.Resources.Distribution.Properties.DistributionConfig))), /unsupported WP-007 semantic representation/);
});

test("adjacent child/DNS/certificate representations fail closed", () => {
  for (const [phase, id, delta] of [
    ["api-children", "Integration", { ApiId: { "Fn::Sub": "${Api}" } }],
    ["api-children", "Integration", { IntegrationType: "HTTP_PROXY", IntegrationUri: "https://unrelated.example/" }],
    ["api-children", "Integration", { RequestParameters: { "overwrite:path": "/unreviewed" } }],
    ["api-children", "Route", { Target: { "Fn::Sub": "integrations/${Integration}" } }],
    ["api-children", "DefaultStage", { StageVariables: { target: "unrelated" } }],
    ["api-children", "InvokePermission", { FunctionUrlAuthType: "NONE" }],
    ["edge", "AliasA", { AliasTarget: { DNSName: { "Fn::Sub": "${Distribution.DomainName}" }, HostedZoneId: "Z2FDTNDATAQYW2" } }],
    ["certificate", "Certificate", { Tags: [{ Key: "Unreviewed", Value: "ownership" }] }],
  ]) assert.throws(() => check(mutateTemplate(fixture(phase), t => Object.assign(t.Resources[id].Properties, delta))), /unsupported WP-007 semantic representation/);
});

test("synthetic CloudFront placeholders never accept unreviewed policy/OAC configuration", () => {
  for (const [id, key] of [["OriginAccessControl", "OriginAccessControlConfig"], ["CachePolicy", "CachePolicyConfig"],
    ["OriginRequestPolicy", "OriginRequestPolicyConfig"], ["ResponseHeadersPolicy", "ResponseHeadersPolicyConfig"]]) {
    assert.throws(() => check(mutateTemplate(fixture("edge"), t => { t.Resources[id].Properties[key] = { Name: "unreviewed" }; })), /unsupported WP-007 semantic representation/);
  }
});

test("template-level indirect/external semantics and resource attributes are unsupported", () => {
  for (const delta of [{ Description: { "Fn::Sub": "${Unreviewed}" } }, { AWSTemplateFormatVersion: "unreviewed" },
    { Metadata: { External: "s3://unreviewed/template.json" } }, { Parameters: {} }, { Conditions: {} }]) {
    assert.throws(() => check(mutateTemplate(fixture(), t => Object.assign(t, delta))));
  }
  for (const delta of [{ Condition: "Unreviewed" }, { Metadata: {} }, { DependsOn: "Unreviewed" }]) {
    assert.throws(() => check(mutateTemplate(fixture(), t => Object.assign(t.Resources.Api, delta))));
  }
});

test("template, assembly, parameters, asset bytes/version, approval and change-set substitutions fail", () => {
  for (const mutate of [
    f => { f.bundle.templateBytes = Buffer.from("{}"); }, f => { f.bundle.assemblyBytes = Buffer.from("{}"); },
    f => { f.bundle.parameters.extra = "x"; }, f => { f.bundle.assets.fixtureAsset.bytes = Buffer.from("bad"); },
    f => { f.bundle.assets.fixtureAsset.versionId = "changed"; }, f => { f.approval.mode = "steady"; },
    f => { f.bundle.changeSet.id += "-other"; }, f => { f.bundle.executeChangeSetId += "-other"; },
  ]) { const f = fixture(); mutate(f); assert.throws(() => check(f)); }
});
test("replacement and steady-state creation fail even with internally consistent new pins", () => {
  const f = fixture(); f.bundle.changeSet.changes[0].replacement = "True"; repin(f); assert.throws(() => check(f), /Replacement/);
  const s = fixture(); s.approval.mode = "steady"; repin(s); assert.throws(() => check(s), /steady/);
});
test("closure cannot remove authority during stabilization/rollback or declare failed rollback complete", () => {
  for (const s of ["CREATE_IN_PROGRESS", "ROLLBACK_IN_PROGRESS", "UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS"]) assert.equal(closureDecision(s), "KEEP_AUTHORITY_NO_NEXT_OPERATION");
  for (const s of ["ROLLBACK_FAILED", "UPDATE_ROLLBACK_FAILED", "CREATE_FAILED", "UNKNOWN"]) assert.equal(closureDecision(s), "STOP_HUMAN_RECOVERY_REQUIRED");
  assert.equal(closureDecision("ROLLBACK_COMPLETE"), "VERIFY_ABSENCE_OR_REVIEWED_REMNANTS_THEN_CLOSE");
  const e = { status: "CREATE_COMPLETE", resources: { Api: "apitest" }, narrowedPolicyMatches: true, effectiveReadbackMatches: true, otherWindowOpen: false };
  assertClosure(e, { Api: "apitest" });
  for (const delta of [{ status: "ROLLBACK_IN_PROGRESS" }, { resources: {} }, { effectiveReadbackMatches: false }, { narrowedPolicyMatches: false }, { otherWindowOpen: true }]) assert.throws(() => assertClosure({ ...e, ...delta }, { Api: "apitest" }));
});
test("conservatively bound managed policy fragments/caps stay under 6144 characters", () => {
  const sized = { ...Object.fromEntries(Object.keys(IDS).map(k => [k, "x".repeat(64)])), zoneId: "Z".repeat(32) };
  for (const phase of Object.keys(PHASES)) {
    for (const mode of ["initialization", "steady"]) {
      const p = generatedAuthority(ACCOUNT, phase, mode, sized);
      assert.ok(JSON.stringify(p).length <= 6144, `${phase}/${mode}`);
      const retained = phase === "api-children" ? ["api-parent", "edge"] : phase === "edge" ? ["api-parent", "api-children"] : [];
      for (const full of executionPolicies(ACCOUNT, phase, mode, sized, retained)) assert.ok(JSON.stringify(full).length <= 6144, `Full composition ${phase}/${mode}: ${JSON.stringify(full).length}`);
    }
    for (const region of ["us-west-2", "us-east-1"]) for (const state of ["prepare", "execute", "closed"]) assert.ok(JSON.stringify(callerWindowCap(ACCOUNT, phase, region, name, state)).length <= 6144);
  }
});
test("existing release guard still rejects resource-bearing assemblies; no workflow imports this guard", async () => {
  const source = await readFile(new URL("../scripts/release/assemblies.mjs", import.meta.url), "utf8");
  assert.match(source, /non-empty assembly requires separately supported resource\/replacement semantics/);
  const controller = await readFile(new URL("../scripts/release/controller.mjs", import.meta.url), "utf8");
  assert.equal(controller.includes("initialization-guard"), false);
});
