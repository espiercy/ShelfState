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
import { validateFoundationAssembly, validateLocalStaticEdgeAssembly, validateLocalCertificateAssembly, validateLocalApiAssembly } from "../infrastructure/lib/template-guards.mjs";
import { assertStaticEdgeTemplate, STATIC_EDGE_REVIEW_SCHEMA, staticEdgeTypes } from "../infrastructure/bootstrap/static-edge-contract.mjs";
import { validateInitializationBundle } from "../infrastructure/bootstrap/initialization-guard.mjs";
import { executionPolicies, generatedAuthority, ACTION_INVENTORY, callerWindowCap, closureDecision } from "../infrastructure/bootstrap/initialization.mjs";
import { fixture, repin, ACCOUNT, IDS } from "./support/initialization-fixture.mjs";
import { decision } from "./support/bootstrap-policy-evaluator.mjs";
import { readAssembly, assessTransition } from "../scripts/release/assemblies.mjs";
import { credentialFreeEnvironment } from "../scripts/release/offline-environment.mjs";

const phase = "edge-static", bindings = { certificateArn: `arn:aws:acm:us-east-1:${ACCOUNT}:certificate/certificate-test` };
const config = resolveEnvironmentConfig("dev", { SHELFSTATE_DEV_AWS_ACCOUNT_ID: ACCOUNT });
let baseTemplates, staticTemplate;
async function synth(selected, callback) {
  const outdir = await mkdtemp(path.join(os.tmpdir(), "shelfstate-static-edge-"));
  try {
    const app = new App({ outdir, analyticsReporting: false });
    createEnvironmentTopology(app, config, selected ? { initializationPhase: selected, initializationBindings: bindings } : {});
    const assembly = app.synth();
    if (selected) validateLocalStaticEdgeAssembly(assembly, config, phase, bindings);
    else validateFoundationAssembly(assembly, config);
    return await callback(assembly, outdir);
  } finally { await rm(outdir, { recursive: true, force: true }); }
}
before(async () => {
  await synth(undefined, a => { baseTemplates = Object.fromEntries(a.stacks.map(s => [s.stackName, s.template])); });
  await synth(phase, a => { staticTemplate = a.stacks.find(s => s.stackName.endsWith("edge-delivery")).template; });
});
function evidence(mutate = () => {}) {
  const f = fixture("edge"), t = structuredClone(staticTemplate); mutate(t);
  f.approval.schema = STATIC_EDGE_REVIEW_SCHEMA; f.approval.phase = phase;
  f.approval.bindings = { ...bindings }; f.approval.assets = {}; f.bundle.assets = {};
  f.bundle.templateBytes = Buffer.from(JSON.stringify(t));
  f.bundle.changeSet.changes = Object.entries(t.Resources).map(([logicalId, r]) => ({ logicalId, type: r.Type, action: "Add", replacement: "False" }));
  return repin(f);
}
const check = f => validateInitializationBundle(f.approval, f.pin, f.bundle);
const reject = mutate => assert.throws(() => check(evidence(mutate)));
const bucket = t => t.Resources.StaticBucket.Properties;
const distribution = t => t.Resources.Distribution.Properties.DistributionConfig;
const behavior = t => distribution(t).DefaultCacheBehavior;
const origin = t => distribution(t).Origins[0];
const grant = t => t.Resources.StaticBucketPolicy.Properties.PolicyDocument.Statement[0];
const headers = t => t.Resources.ResponseHeadersPolicy.Properties.ResponseHeadersPolicyConfig;

test("five exact native resources; local review validates the emitted static-only template", () => {
  assert.deepEqual(Object.fromEntries(Object.entries(staticTemplate.Resources).map(([k,r]) => [k,r.Type])), staticEdgeTypes(phase));
  assert.equal(check(evidence()).status, "LOCAL_REVIEW_VALIDATED_NOT_DEPLOYMENT_AUTHORIZATION");
  assert.equal(distribution(staticTemplate).ViewerCertificate.AcmCertificateArn, bindings.certificateArn);
  assert.deepEqual(evidence().approval.assets, {});
});
test("six stacks, only west static edge populated; other five exactly unchanged", async () => {
  await synth(phase, a => {
    assert.equal(a.stacks.length, 6);
    assert.equal(a.stacks.reduce((n,s) => n + Object.keys(s.template.Resources ?? {}).length, 0), 5);
    for (const s of a.stacks) {
      if (s.stackName.endsWith("edge-delivery")) assert.equal(s.environment.name, `aws://${ACCOUNT}/us-west-2`);
      else assert.deepEqual(s.template, baseTemplates[s.stackName]);
    }
  });
});
test("private REST/OAC boundary, exact distribution read grant and retained bucket", () => {
  const t = staticTemplate;
  assert.ok(Object.values(bucket(t).PublicAccessBlockConfiguration).every(v => v === true));
  assert.deepEqual(bucket(t).OwnershipControls, { Rules: [{ ObjectOwnership: "BucketOwnerEnforced" }] });
  assert.deepEqual(origin(t).DomainName, { "Fn::GetAtt": ["StaticBucket", "RegionalDomainName"] });
  assert.deepEqual(origin(t).OriginAccessControlId, { "Fn::GetAtt": ["OriginAccessControl", "Id"] });
  assert.deepEqual(origin(t).S3OriginConfig, { OriginAccessIdentity: "" });
  assert.equal(t.Resources.StaticBucket.DeletionPolicy, "Retain");
  assert.equal(t.Resources.StaticBucket.UpdateReplacePolicy, "Retain");
  assert.deepEqual(grant(t).Principal, { Service: "cloudfront.amazonaws.com" });
  assert.equal(grant(t).Action, "s3:GetObject");
  assert.deepEqual(grant(t).Condition.StringEquals["AWS:SourceArn"], { "Fn::Join": ["", [`arn:aws:cloudfront::${ACCOUNT}:distribution/`, { Ref: "Distribution" }]] });
  const deny = t.Resources.StaticBucketPolicy.Properties.PolicyDocument.Statement[1];
  assert.equal(deny.Effect, "Deny"); assert.equal(deny.Principal, "*");
  assert.deepEqual(deny.Condition, { Bool: { "aws:SecureTransport": "false" } });
  assert.equal(t.Resources.StaticBucketPolicy.Properties.PolicyDocument.Statement.filter(s => s.Effect === "Allow").length, 1);
});
test("managed cache disabled, no request-policy resource, static-only custom headers", () => {
  assert.equal(behavior(staticTemplate).CachePolicyId, "4135ea2d-6df8-44a3-9df3-4b5a84be39ad");
  assert.ok(!Object.hasOwn(behavior(staticTemplate), "OriginRequestPolicyId"));
  assert.deepEqual(behavior(staticTemplate).AllowedMethods, ["GET", "HEAD"]);
  assert.deepEqual(headers(staticTemplate).CustomHeadersConfig.Items, [{ Header: "Cache-Control", Value: "no-cache", Override: true }]);
  assert.equal(headers(staticTemplate).SecurityHeadersConfig.ContentTypeOptions.Override, true);
});

for (const [label, mutate] of [
  ["public ACL", t => { bucket(t).AccessControl = "PublicRead"; }],
  ["website configuration", t => { bucket(t).WebsiteConfiguration = { IndexDocument: "index.html" }; }],
  ["website origin", t => { origin(t).DomainName = `shelfstate-v4-dev-static-${ACCOUNT}-us-west-2.s3-website-us-west-2.amazonaws.com`; }],
  ["ACL-enabled ownership", t => { bucket(t).OwnershipControls.Rules[0].ObjectOwnership = "BucketOwnerPreferred"; }],
  ["unrelated bucket", t => { bucket(t).BucketName = "unrelated"; }],
  ["unrelated origin bucket", t => { origin(t).DomainName = "unrelated.s3.us-west-2.amazonaws.com"; }],
  ["missing OAC", t => { delete origin(t).OriginAccessControlId; }],
  ["wrong OAC", t => { origin(t).OriginAccessControlId = "other"; }],
  ["OAI substitution", t => { origin(t).S3OriginConfig.OriginAccessIdentity = "origin-access-identity/cloudfront/OTHER"; }],
  ["unsigned OAC", t => { t.Resources.OriginAccessControl.Properties.OriginAccessControlConfig.SigningBehavior = "never"; }],
  ["viewer authorization passthrough", t => { t.Resources.OriginAccessControl.Properties.OriginAccessControlConfig.SigningBehavior = "no-override"; }],
  ["OAC protocol change", t => { t.Resources.OriginAccessControl.Properties.OriginAccessControlConfig.SigningProtocol = "other"; }],
  ["non-S3 OAC", t => { t.Resources.OriginAccessControl.Properties.OriginAccessControlConfig.OriginAccessControlOriginType = "lambda"; }],
  ["public bucket principal", t => { grant(t).Principal = "*"; }],
  ["additional bucket principal", t => { grant(t).Principal.AWS = "*"; }],
  ["broad S3 action", t => { grant(t).Action = "s3:*"; }],
  ["broad S3 resource", t => { grant(t).Resource = "*"; }],
  ["missing distribution condition", t => { delete grant(t).Condition; }],
  ["wrong distribution condition", t => { grant(t).Condition.StringEquals["AWS:SourceArn"] = `arn:aws:cloudfront::${ACCOUNT}:distribution/other`; }],
  ["pattern distribution condition", t => { grant(t).Condition = { StringLike: { "AWS:SourceArn": `arn:aws:cloudfront::${ACCOUNT}:distribution/*` } }; }],
  ["policy on unrelated bucket", t => { t.Resources.StaticBucketPolicy.Properties.Bucket = "unrelated"; }],
  ["public read extra statement", t => { t.Resources.StaticBucketPolicy.Properties.PolicyDocument.Statement.push({ Effect: "Allow", Action: "s3:GetObject", Principal: "*", Resource: "*" }); }],
  ["missing transport denial", t => { t.Resources.StaticBucketPolicy.Properties.PolicyDocument.Statement.pop(); }],
  ["weakened transport denial", t => { t.Resources.StaticBucketPolicy.Properties.PolicyDocument.Statement[1].Condition.Bool["aws:SecureTransport"] = "true"; }],
  ["alternate certificate", t => { distribution(t).ViewerCertificate.AcmCertificateArn = bindings.certificateArn.replace("certificate-test", "other"); }],
  ["certificate import", t => { distribution(t).ViewerCertificate.AcmCertificateArn = { "Fn::ImportValue": "east-cert" }; }],
  ["wildcard alias", t => { distribution(t).Aliases = ["*.shelfstate.codecorax.com"]; }],
  ["additional alias", t => { distribution(t).Aliases.push("other.codecorax.com"); }],
  ["HTTP viewers", t => { behavior(t).ViewerProtocolPolicy = "allow-all"; }],
  ["weak TLS", t => { distribution(t).ViewerCertificate.MinimumProtocolVersion = "TLSv1"; }],
  ["write methods", t => { behavior(t).AllowedMethods.push("PUT"); }],
  ["extra origin", t => { distribution(t).Origins.push({ Id: "api", DomainName: "other.example.com" }); }],
  ["extra API behavior", t => { distribution(t).CacheBehaviors = [{ ...behavior(t), PathPattern: "/api/*" }]; }],
  ["Lambda@Edge", t => { behavior(t).LambdaFunctionAssociations = [{ EventType: "viewer-request", LambdaFunctionARN: "unreviewed" }]; }],
  ["CloudFront Function", t => { behavior(t).FunctionAssociations = [{ EventType: "viewer-request", FunctionARN: "unreviewed" }]; }],
  ["custom origin bypass", t => { origin(t).CustomOriginConfig = { OriginProtocolPolicy: "http-only" }; }],
  ["origin headers", t => { origin(t).OriginCustomHeaders = [{ HeaderName: "Authorization", HeaderValue: "unreviewed" }]; }],
  ["unrelated target", t => { behavior(t).TargetOriginId = "other"; }],
  ["unrelated cache policy", t => { behavior(t).CachePolicyId = "other"; }],
  ["origin request policy", t => { behavior(t).OriginRequestPolicyId = "other"; }],
  ["unrelated header policy", t => { behavior(t).ResponseHeadersPolicyId = "other"; }],
  ["legacy forwarding", t => { behavior(t).ForwardedValues = { QueryString: true }; }],
  ["positive minimum TTL", t => { behavior(t).MinTTL = 1; }],
  ["CSP script allowance", t => { headers(t).SecurityHeadersConfig.ContentSecurityPolicy.ContentSecurityPolicy = "default-src * 'unsafe-inline'"; }],
  ["CORS expansion", t => { headers(t).CorsConfig = { AccessControlAllowOrigins: { Items: ["*"] } }; }],
  ["header removal", t => { headers(t).RemoveHeadersConfig = { Items: [{ Header: "Content-Security-Policy" }] }; }],
  ["response cache weakening", t => { headers(t).CustomHeadersConfig.Items[0].Value = "public, max-age=31536000"; }],
  ["logging destination", t => { distribution(t).Logging = { Bucket: "other", Prefix: "" }; }],
  ["origin shield", t => { origin(t).OriginShield = { Enabled: true, OriginShieldRegion: "us-west-2" }; }],
  ["error fallback", t => { distribution(t).CustomErrorResponses = [{ ErrorCode: 403, ResponseCode: 200, ResponsePagePath: "/index.html" }]; }],
  ["WAF", t => { distribution(t).WebACLId = "unreviewed"; }],
  ["KMS substitution", t => { bucket(t).BucketEncryption.ServerSideEncryptionConfiguration[0].ServerSideEncryptionByDefault = { SSEAlgorithm: "aws:kms", KMSMasterKeyID: "other" }; }],
  ["bucket expiry", t => { bucket(t).LifecycleConfiguration = { Rules: [{ Status: "Enabled", ExpirationInDays: 1 }] }; }],
  ["bucket destruction", t => { t.Resources.StaticBucket.DeletionPolicy = "Delete"; }],
  ["bucket replacement destruction", t => { t.Resources.StaticBucket.UpdateReplacePolicy = "Delete"; }],
  ["retained public grant", t => { t.Resources.StaticBucketPolicy.DeletionPolicy = "Retain"; }],
]) test(`fresh valid pins reject ${label}`, () => reject(mutate));

test("every public-access block must stay true", () => {
  for (const key of Object.keys(bucket(staticTemplate).PublicAccessBlockConfiguration)) reject(t => { bucket(t).PublicAccessBlockConfiguration[key] = false; });
});
test("all object keys including deeply nested resource semantics are closed; missing keys reject", () => {
  const walk = (value, path = []) => {
    if (!value || typeof value !== "object") return;
    if (!Array.isArray(value)) {
      reject(t => { const at = path.reduce((a,k) => a[k], t); at.Unreviewed = true; });
      for (const key of Object.keys(value)) reject(t => { const at = path.reduce((a,k) => a[k], t); delete at[key]; });
    }
    for (const [key, child] of Object.entries(value)) walk(child, [...path, key]);
  };
  walk(staticTemplate);
});
test("resource substitution and helpers reject even when change list and pins agree", () => {
  for (const Type of ["AWS::CloudFront::CachePolicy", "AWS::CloudFront::OriginRequestPolicy", "AWS::CloudFront::Distribution",
    "AWS::Route53::RecordSet", "AWS::CertificateManager::Certificate", "AWS::ApiGatewayV2::Api", "AWS::CloudFormation::Stack",
    "Custom::AWSCDK-EKS-KubernetesResource", "Custom::CDKBucketDeployment", "Custom::S3AutoDeleteObjects", "Custom::CrossRegionExportReader", "AWS::KMS::Key"]) {
    reject(t => { t.Resources.Extra = { Type, Properties: {} }; });
    reject(t => { t.Resources.StaticBucket.Type = Type; });
  }
  reject(t => { t.Resources.Renamed = t.Resources.Distribution; delete t.Resources.Distribution; });
});
test("bound target, certificate handoff, parameters, assets, changes and review schema reject substitution", () => {
  for (const mutate of [
    f => { f.approval.region = "us-east-1"; }, f => { f.approval.account = "210987654321"; },
    f => { f.approval.stack = "shelfstate-v4-dev-library-api"; }, f => { f.approval.executionRole += "-other"; },
    f => { f.approval.phase = "edge"; }, f => { f.approval.schema = "shelfstate.wp007-initialization-review/v1"; },
    f => { f.approval.bindings.certificateArn = bindings.certificateArn.replace("us-east-1", "us-west-2"); },
    f => { f.approval.bindings.certificateArn = bindings.certificateArn.replace(ACCOUNT, "210987654321"); },
    f => { f.approval.bindings.certificateArn = { Ref: "Certificate" }; },
    f => { f.approval.bindings.zoneId = "ZTESTONLY"; }, f => { delete f.approval.bindings.certificateArn; },
    f => { f.bundle.parameters = { CertificateArn: "other" }; },
    f => { f.bundle.assets.extra = { bytes: Buffer.from("anything"), versionId: "v" }; },
    f => { f.approval.assets.extra = { sha256: "a".repeat(64), versionId: "v" }; },
    f => { f.bundle.changeSet.physicalResources.Distribution = "DISTTEST"; },
    f => { f.bundle.changeSet.changes[0].replacement = "True"; }, f => { f.bundle.changeSet.changes[0].action = "Modify"; },
    f => { f.bundle.changeSet.changes.pop(); }, f => { f.approval.mode = "steady"; },
  ]) { const f = evidence(); mutate(f); repin(f); assert.throws(() => check(f)); }
  const f = evidence(); f.bundle.templateBytes = Buffer.from("{}"); assert.throws(() => check(f), /Template byte substitution/);
});
test("same-account alternative certificate requires an independently changed trusted review, not candidate self-repinning", () => {
  const f = evidence(); const oldPin = f.pin;
  f.approval.bindings.certificateArn = bindings.certificateArn.replace("certificate-test", "different-reviewed-id");
  const t = JSON.parse(f.bundle.templateBytes); distribution(t).ViewerCertificate.AcmCertificateArn = f.approval.bindings.certificateArn;
  f.bundle.templateBytes = Buffer.from(JSON.stringify(t)); repin(f);
  assert.throws(() => validateInitializationBundle(f.approval, oldPin, f.bundle), /Review pin mismatch/);
  // The general handoff accepts independently reviewed same-account east ARNs;
  // it cannot establish issuance/domain/physical provenance from a string.
  assert.equal(check(f).status, "LOCAL_REVIEW_VALIDATED_NOT_DEPLOYMENT_AUTHORIZATION");
});
test("reordered object keys pass, array order and extra template semantics do not", () => {
  assert.equal(check(evidence(t => { t.Resources = Object.fromEntries(Object.entries(t.Resources).reverse()); })).status, "LOCAL_REVIEW_VALIDATED_NOT_DEPLOYMENT_AUTHORIZATION");
  reject(t => { t.Resources.StaticBucketPolicy.Properties.PolicyDocument.Statement.reverse(); });
  for (const key of ["Transform", "Conditions", "Outputs", "Mappings"]) reject(t => { t[key] = {}; });
  reject(t => { t.Metadata.ShelfState.Region = "us-east-1"; });
  reject(t => { t.Resources.Distribution.Condition = "Maybe"; });
});
test("only three accepted generated action classes; exact steady IDs and no speculative authority", () => {
  const rows = ACTION_INVENTORY.filter(r => ["distribution", "origin-access-control", "response-headers-policy"].includes(r.kind));
  const initial = generatedAuthority(ACCOUNT, phase, "initialization");
  const steady = generatedAuthority(ACCOUNT, phase, "steady", IDS);
  const actions = p => [...new Set(p.Statement.flatMap(s => s.Action))].sort();
  assert.deepEqual(actions(initial), [...new Set(rows.flatMap(r => [...r.create, ...r.read, ...r.rollback]))].sort());
  for (const row of rows) {
    const arn = `arn:aws:cloudfront::${ACCOUNT}:${row.type}/${IDS[row.id]}`;
    for (const a of [...row.read, ...row.rollback, ...row.update]) {
      assert.equal(decision(steady, a, arn), "allow");
      assert.equal(decision(steady, a, arn.replace(IDS[row.id], "unrelated")), "implicitDeny");
    }
  }
  for (const a of ["cloudfront:CreateDistribution", "cloudfront:CreateOriginAccessControl", "cloudfront:CreateResponseHeadersPolicy"]) assert.equal(decision(steady, a, "*"), "implicitDeny");
  for (const a of ["cloudfront:CreateCachePolicy", "cloudfront:CreateOriginRequestPolicy", "cloudfront:UpdateOriginAccessControl", "cloudfront:UpdateResponseHeadersPolicy", "cloudfront:CreateInvalidation"])
    assert.equal(decision(initial, a, `arn:aws:cloudfront::${ACCOUNT}:origin-access-control/other`), "implicitDeny");
  assert.throws(() => generatedAuthority(ACCOUNT, phase, "steady", { distributionId: IDS.distributionId }));
});
test("initial wildcard residual is explicit, not mistaken for IAM ownership isolation", () => {
  const p = generatedAuthority(ACCOUNT, phase, "initialization");
  assert.equal(decision(p, "cloudfront:GetOriginAccessControl", `arn:aws:cloudfront::${ACCOUNT}:origin-access-control/unrelated`), "allow");
  assert.equal(decision(p, "cloudfront:DeleteResponseHeadersPolicy", `arn:aws:cloudfront::${ACCOUNT}:response-headers-policy/unrelated`), "allow");
  const arn = `arn:aws:cloudfront::${ACCOUNT}:distribution/unrelated`;
  assert.equal(decision(p, "cloudfront:UpdateDistribution", arn), "implicitDeny");
  const owned = { "aws:ResourceTag/Project": "ShelfState", "aws:ResourceTag/Environment": "dev", "aws:ResourceTag/ManagedBy": "AWS-CDK" };
  assert.equal(decision(p, "cloudfront:UpdateDistribution", arn, owned), "allow");
  const request = Object.fromEntries(Object.entries(owned).map(([k,v]) => [k.replace("ResourceTag", "RequestTag"),v]));
  assert.equal(decision(p, "cloudfront:TagResource", arn, request), "allow");
  assert.equal(closureDecision("CREATE_IN_PROGRESS"), "KEEP_AUTHORITY_NO_NEXT_OPERATION");
});
test("full static policies keep exact named S3/support, remove DNS/API/health authority, stay within sizes", () => {
  const sizedIds = Object.fromEntries(Object.keys(IDS).map(k => [k, "X".repeat(64)]));
  for (const mode of ["initialization", "steady"]) {
    const policies = executionPolicies(ACCOUNT, phase, mode, sizedIds);
    assert.equal(policies.length, 2);
    for (const p of policies) assert.ok(JSON.stringify(p).length <= 6144);
    const all = { Version: "2012-10-17", Statement: policies.flatMap(p => p.Statement) };
    assert.ok(all.Statement.flatMap(s => s.Action).every(a => /^(s3|ssm|cloudfront):/.test(a)));
    assert.equal(decision(all, "s3:PutBucketPolicy", `arn:aws:s3:::shelfstate-v4-dev-static-${ACCOUNT}-us-west-2`), "allow");
    assert.equal(decision(all, "s3:PutBucketPolicy", "arn:aws:s3:::unrelated"), "implicitDeny");
    assert.equal(decision(all, "s3:PutObject", `arn:aws:s3:::shelfstate-v4-dev-static-${ACCOUNT}-us-west-2/index.html`), "implicitDeny");
    assert.equal(decision(all, "s3:DeleteObject", `arn:aws:s3:::shelfstate-v4-dev-static-${ACCOUNT}-us-west-2/index.html`), "implicitDeny");
    assert.equal(decision(all, "route53:ChangeResourceRecordSets", "arn:aws:route53:::hostedzone/ZTESTONLY"), "implicitDeny");
    assert.equal(decision(all, "s3:CreateBucket", `arn:aws:s3:::shelfstate-v4-dev-static-${ACCOUNT}-us-west-2`, { "s3:LocationConstraint": "us-west-2" }), mode === "steady" ? "implicitDeny" : "allow");
  }
  assert.throws(() => executionPolicies(ACCOUNT, phase, "initialization", IDS, ["api-parent"]));
  for (const state of ["prepare", "execute", "closed"]) for (const region of ["us-west-2", "us-east-1"]) {
    const p = callerWindowCap(ACCOUNT, phase, region, `wp007-${"a".repeat(64)}`, state);
    assert.ok(JSON.stringify(p).length <= 6144);
    assert.notEqual(decision(p, "cloudfront:CreateDistribution", "*"), "allow");
    assert.equal(decision(p, "cloudformation:ExecuteChangeSet", `arn:aws:cloudformation:us-west-2:${ACCOUNT}:stack/unrelated/test`), "explicitDeny");
  }
});
test("invalid phase/environment/account/region and external bindings reject before synth", () => {
  const good = { initializationPhase: phase, initializationBindings: bindings };
  for (const [cfg, options] of [
    [resolveEnvironmentConfig("prod", { SHELFSTATE_PROD_AWS_ACCOUNT_ID: ACCOUNT }), good], [resolveEnvironmentConfig("dev"), good],
    [{ ...config, primaryRegion: "us-east-1" }, good], [{ ...config, edgeCertificateRegion: "us-west-2" }, good],
    [config, { initializationPhase: phase }], [config, { ...good, crossRegionReferences: true }],
    [config, { initializationPhase: "certificate", initializationBindings: bindings }], [config, { initializationBindings: bindings }],
    [config, { ...good, initializationPhase: [phase, "api-children"] }],
    [config, { ...good, initializationBindings: { ...bindings, apiId: "apitest" } }],
    [config, { ...good, initializationBindings: { certificateArn: bindings.certificateArn.replace("us-east-1", "us-west-2") } }],
  ]) assert.throws(() => createEnvironmentTopology(new App({ analyticsReporting: false }), cfg, options));
  assert.throws(() => assertStaticEdgeTemplate(staticTemplate, ACCOUNT, "edge", bindings));
});
test("static resource assembly cannot pass foundation, other phase or ordinary release acceptance", async () => {
  await synth(phase, async (assembly, outdir) => {
    assert.throws(() => validateFoundationAssembly(assembly, config), /zero resources/);
    assert.throws(() => validateLocalApiAssembly(assembly, config, "api-parent"));
    assert.throws(() => validateLocalCertificateAssembly(assembly, config, "certificate"));
    const snapshot = await readAssembly(outdir, "dev"), assessment = assessTransition(snapshot, snapshot);
    assert.equal(assessment.allowed, false);
    assert.ok(assessment.issues.some(x => x.includes("non-empty assembly requires separately supported")));
  });
});
test("real app entry accepts only the explicit local static phase and certificate binding", async () => {
  const outdir = await mkdtemp(path.join(os.tmpdir(), "shelfstate-static-entry-"));
  try {
    const env = { ...credentialFreeEnvironment(), SHELFSTATE_DEV_AWS_ACCOUNT_ID: ACCOUNT, CDK_OUTDIR: outdir,
      CDK_CONTEXT_JSON: JSON.stringify({ shelfstateEnvironment: "dev", shelfstateInitializationPhase: phase, shelfstateInitializationBindings: bindings,
        "aws:cdk:version-reporting": false, "aws:cdk:enable-path-metadata": false }) };
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("../infrastructure/bin/app.mjs", import.meta.url))], { env, encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(await readFile(path.join(outdir, "ShelfStateV4DevEdgeDelivery.template.json"), "utf8")), staticTemplate);
  } finally { await rm(outdir, { recursive: true, force: true }); }
});
test("inert page has no script, links, assets, manifest, service worker or application state", async () => {
  const html = await readFile(new URL("../frontend/static-proof/index.html", import.meta.url), "utf8");
  const expected = `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>ShelfState V4 non-production static proof</title>\n</head>\n<body>\n  <h1>ShelfState V4 static delivery proof</h1>\n  <p>Non-production infrastructure verification only. No application or user data.</p>\n</body>\n</html>\n`;
  assert.equal(html.replaceAll("\r\n", "\n"), expected);
  assert.ok(!JSON.stringify(staticTemplate).includes("static-proof/index.html"), "No publication reference in stack");
});
