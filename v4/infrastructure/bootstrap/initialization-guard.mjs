// Separate LOCAL-ONLY validation capability. Not imported by proof workflows or
// deployment controllers. Trusted review pins must never come from the candidate.
import assert from "node:assert/strict";
import { object, hash, hashObject, equal, digest, parseEvidenceJson } from "../../scripts/release/schema.mjs";
import { target } from "./initialization.mjs";
import { LIBRARY_API_REVIEW_SCHEMA, libraryApiTypes, assertLibraryApiTemplate } from "./library-api-contract.mjs";
import { EDGE_CERTIFICATE_REVIEW_SCHEMA, edgeCertificateTypes, assertEdgeCertificateTemplate } from "./edge-certificate-contract.mjs";
import { parseCertificateAssemblyReviewPackage } from "./certificate-assembly-adapter.mjs";
import { STATIC_EDGE_REVIEW_SCHEMA, staticEdgeTypes, assertStaticEdgeBindings, assertStaticEdgeTemplate } from "./static-edge-contract.mjs";
import { EDGE_ROUTING_REVIEW_SCHEMA, edgeRoutingTypes, assertEdgeRoutingBindings, assertEdgeRoutingTemplate } from "./edge-routing-contract.mjs";

const TYPES = Object.freeze({
  edge: { Distribution: "AWS::CloudFront::Distribution", OriginAccessControl: "AWS::CloudFront::OriginAccessControl",
    CachePolicy: "AWS::CloudFront::CachePolicy", OriginRequestPolicy: "AWS::CloudFront::OriginRequestPolicy",
    ResponseHeadersPolicy: "AWS::CloudFront::ResponseHeadersPolicy", AliasA: "AWS::Route53::RecordSet", AliasAAAA: "AWS::Route53::RecordSet" },
  "api-parent": { Api: "AWS::ApiGatewayV2::Api" },
  "api-children": { Api: "AWS::ApiGatewayV2::Api", Integration: "AWS::ApiGatewayV2::Integration", Route: "AWS::ApiGatewayV2::Route", DefaultStage: "AWS::ApiGatewayV2::Stage", InvokePermission: "AWS::Lambda::Permission" },
  certificate: { Certificate: "AWS::CertificateManager::Certificate" },
});

// Historical synthetic contracts stay separate from the explicit actual API
// schema. New representations require their own complete contract, never detection
// based on candidate fields or relaxed checks in the original synthetic schema.
function checkTemplate(template, approval) {
  const rejectTransforms = value => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) { assert.ok(!["Transform", "Fn::Transform"].includes(key), "No macros at any depth"); rejectTransforms(child); }
  };
  rejectTransforms(template);
  assert.ok(Object.keys(template).every(k => ["AWSTemplateFormatVersion", "Description", "Resources"].includes(k)), "No macros, conditions, parameters, nested or unresolved template semantics");
  if (Object.hasOwn(template, "AWSTemplateFormatVersion")) assert.equal(template.AWSTemplateFormatVersion, "2010-09-09");
  if (Object.hasOwn(template, "Description")) assert.equal(typeof template.Description, "string", "Literal description required");
  const expected = TYPES[approval.phase];
  object(template.Resources, Object.keys(expected), "Exact logical IDs/count required");
  for (const [logicalId, resource] of Object.entries(template.Resources)) {
    object(resource, ["Type", "Properties"], "Native unconditional resource required");
    assert.equal(resource.Type, expected[logicalId], "Unexpected type/nested/custom resource");
  }
  const ref = name => ({ Ref: name });
  const b = approval.bindings;
  let properties;
  if (approval.phase.startsWith("api-")) {
    properties = { Api: { Name: "shelfstate-v4-dev-health", ProtocolType: "HTTP" } };
    if (approval.phase === "api-children") {
      Object.assign(properties, {
        Integration: { ApiId: ref("Api"), IntegrationType: "AWS_PROXY", IntegrationUri: b.healthFunctionArn },
        Route: { ApiId: ref("Api"), RouteKey: "GET /health", Target: { "Fn::Join": ["/", ["integrations", ref("Integration")]] } },
        DefaultStage: { ApiId: ref("Api"), StageName: "$default", AutoDeploy: true },
        InvokePermission: { Action: "lambda:InvokeFunction", FunctionName: b.healthFunctionArn,
          Principal: "apigateway.amazonaws.com", SourceArn: { "Fn::Join": ["", [`arn:aws:execute-api:us-west-2:${approval.account}:`, ref("Api"), "/*/GET/health"]] } },
      });
    }
  } else if (approval.phase === "certificate") {
    properties = { Certificate: { DomainName: "dev.shelfstate.codecorax.com", ValidationMethod: "DNS", CertificateExport: "DISABLED" } };
  } else {
    properties = {
      Distribution: { DistributionConfig: {
        Aliases: ["dev.shelfstate.codecorax.com"], ViewerCertificate: { AcmCertificateArn: b.certificateArn },
        Origins: [{ Id: "static", DomainName: b.staticBucketDomain,
          OriginAccessControlId: ref("OriginAccessControl"), S3OriginConfig: { OriginAccessIdentity: "" } }],
        DefaultCacheBehavior: { TargetOriginId: "static", CachePolicyId: ref("CachePolicy"),
          OriginRequestPolicyId: ref("OriginRequestPolicy"), ResponseHeadersPolicyId: ref("ResponseHeadersPolicy") },
      } },
      // Empty-only synthetic placeholders, NOT deployable policy configurations.
      // No arbitrary configuration is accepted until its semantic contract is reviewed.
      OriginAccessControl: {}, CachePolicy: {}, OriginRequestPolicy: {}, ResponseHeadersPolicy: {},
      ...Object.fromEntries(["A", "AAAA"].map(Type => [`Alias${Type}`, {
        Name: "dev.shelfstate.codecorax.com.", Type, HostedZoneId: b.zoneId,
        AliasTarget: { DNSName: { "Fn::GetAtt": ["Distribution", "DomainName"] }, HostedZoneId: "Z2FDTNDATAQYW2" },
      }])),
    };
  }
  // Positive contract, not a dangerous-field blacklist. Canonical equality permits
  // object-key reordering only; extra/missing properties, arrays, alternate intrinsic
  // forms and external content all fail, even under a separately valid review pin.
  object(properties, Object.keys(expected), "Every supported resource needs a complete contract");
  for (const [logicalId, required] of Object.entries(properties)) {
    equal(template.Resources[logicalId].Properties, required, `${logicalId}: unsupported WP-007 semantic representation`);
  }
}

// Validate reviewed material without accepting or emitting execution authority.
// The legacy bundle wrapper below adds the separately supplied execution ID for
// older local design checks; new preparation adapters must use this boundary.
export function validateInitializationReviewMaterial(approval, trustedApprovalDigest, bundle) {
  digest(trustedApprovalDigest); assert.equal(hashObject(approval), trustedApprovalDigest, "Review pin mismatch");
  object(approval, ["schema", "account", "phase", "region", "stack", "executionRole", "bindings", "mode", "templateSha256", "assemblySha256", "parametersSha256", "assets", "changeSetSha256"]);
  const actualApi = approval.schema === LIBRARY_API_REVIEW_SCHEMA;
  const actualCertificate = approval.schema === EDGE_CERTIFICATE_REVIEW_SCHEMA;
  const actualStatic = approval.schema === STATIC_EDGE_REVIEW_SCHEMA;
  const actualRouting = approval.schema === EDGE_ROUTING_REVIEW_SCHEMA;
  assert.ok(actualApi || actualCertificate || actualStatic || actualRouting || approval.schema === "shelfstate.wp007-initialization-review/v1", "Unsupported review schema");
  const expectedTypes = actualApi ? libraryApiTypes(approval.phase) : actualCertificate ? edgeCertificateTypes(approval.phase) : actualStatic ? staticEdgeTypes(approval.phase) : actualRouting ? edgeRoutingTypes(approval.phase) : TYPES[approval.phase];
  assert.ok(expectedTypes, "Unsupported phase for review schema");
  const t = target(approval.account, approval.phase);
  assert.equal(approval.region, t.region); assert.equal(approval.stack, t.name); assert.equal(approval.executionRole, t.executionRole);
  assert.equal(approval.mode, "initialization", "Resource-bearing steady updates remain separately gated");
  const b = approval.bindings;
  if (actualApi) {
    object(b, approval.phase === "api-children" ? ["apiId"] : [], "Phase-specific API bindings");
    if (approval.phase === "api-children") assert.match(b.apiId, /^[a-z0-9]{1,32}$/);
    equal(approval.assets, {}, "Inline health code has no external assets");
  } else if (actualCertificate) {
    object(b, [], "No generated certificate/zone binding exists before initialization");
    equal(approval.assets, {}, "Native certificate has no external assets");
  } else if (actualStatic) {
    assertStaticEdgeBindings(b, approval.account);
    equal(approval.assets, {}, "Static resource initialization does not publish objects");
  } else if (actualRouting) {
    assertEdgeRoutingBindings(b, approval.account);
    equal(approval.assets, {}, "Edge routing initialization does not publish objects");
  } else {
    object(b, ["apiId", "healthFunctionArn", "zoneId", "certificateArn", "staticBucketDomain"]);
    assert.match(b.apiId, /^[a-z0-9]{1,32}$/);
    assert.equal(b.healthFunctionArn, `arn:aws:lambda:us-west-2:${t.account}:function:shelfstate-v4-dev-health`);
    assert.match(b.zoneId, /^Z[A-Z0-9]{1,32}$/);
    assert.match(b.certificateArn, new RegExp(`^arn:aws:acm:us-east-1:${t.account}:certificate/[a-zA-Z0-9-]{1,64}$`));
    assert.equal(b.staticBucketDomain, `shelfstate-v4-dev-static-${t.account}-us-west-2.s3.us-west-2.amazonaws.com`);
  }
  object(bundle, ["templateBytes", "assemblyBytes", "parameters", "assets", "changeSet"]);
  assert.equal(hash(bundle.templateBytes), approval.templateSha256, "Template byte substitution");
  assert.equal(hash(bundle.assemblyBytes), approval.assemblySha256, "Assembly byte substitution");
  assert.equal(hashObject(bundle.parameters), approval.parametersSha256, "Parameter substitution");
  equal(bundle.parameters, {}, "This bounded contract has no runtime template parameters");
  const template = parseEvidenceJson(bundle.templateBytes);
  if (actualApi) assertLibraryApiTemplate(template, approval.account, approval.phase);
  else if (actualCertificate) assertEdgeCertificateTemplate(template, approval.account, approval.phase);
  else if (actualStatic) assertStaticEdgeTemplate(template, approval.account, approval.phase, b);
  else if (actualRouting) assertEdgeRoutingTemplate(template, approval.account, approval.phase, b);
  else checkTemplate(template, approval);
  if (actualCertificate) {
    parseCertificateAssemblyReviewPackage(bundle.assemblyBytes, {
      account: t.account,
      environment: "dev",
      phase: approval.phase,
      region: t.region,
      stack: t.name,
      executionRole: t.executionRole,
      templateSha256: approval.templateSha256,
    });
  } else {
    const assembly = parseEvidenceJson(bundle.assemblyBytes);
    equal(assembly, { stack: t.name, account: t.account, region: t.region, executionRole: t.executionRole, templateSha256: approval.templateSha256 }, "Assembly binding mismatch");
  }
  object(bundle.assets, Object.keys(approval.assets), "Asset inventory mismatch");
  for (const [name, reviewed] of Object.entries(approval.assets)) {
    object(reviewed, ["sha256", "versionId"]); digest(reviewed.sha256);
    assert.ok(typeof reviewed.versionId === "string" && reviewed.versionId.length > 0, "Immutable asset version required");
    object(bundle.assets[name], ["bytes", "versionId"]);
    assert.equal(hash(bundle.assets[name].bytes), reviewed.sha256, "Asset substitution");
    assert.equal(bundle.assets[name].versionId, reviewed.versionId, "Asset version substitution");
  }
  const cs = bundle.changeSet;
  object(cs, ["id", "name", "stackArn", "executionRole", "templateSha256", "parametersSha256", "status", "executionStatus", "changes", "physicalResources"]);
  assert.equal(hashObject(cs), approval.changeSetSha256, "Inspected change-set substitution");
  assert.match(cs.name, /^wp007-[a-f0-9]{64}$/);
  assert.match(cs.id, new RegExp(`^arn:aws:cloudformation:${t.region}:${t.account}:changeSet/${cs.name}/[a-zA-Z0-9-]+$`));
  assert.match(cs.stackArn, new RegExp(`^arn:aws:cloudformation:${t.region}:${t.account}:stack/${t.name}/[a-zA-Z0-9-]+$`));
  assert.equal(cs.executionRole, t.executionRole); assert.equal(cs.templateSha256, approval.templateSha256);
  assert.equal(cs.parametersSha256, approval.parametersSha256);
  assert.equal(cs.status, "CREATE_COMPLETE"); assert.equal(cs.executionStatus, "AVAILABLE");
  const seen = new Set();
  for (const change of cs.changes) {
    object(change, ["logicalId", "type", "action", "replacement"]);
    assert.ok(!seen.has(change.logicalId), "Duplicate change"); seen.add(change.logicalId);
    assert.equal(change.type, expectedTypes[change.logicalId], "Unexpected changed resource");
    assert.ok(["Add", "Modify"].includes(change.action), "Removal needs separate review");
    assert.equal(change.replacement, "False", "Replacement requires separate re-initialization review");
    if (approval.mode === "steady") assert.equal(change.action, "Modify", "Creation is not steady state");
  }
  if (approval.phase === "api-children") {
    object(cs.physicalResources, ["Api"]); assert.equal(cs.physicalResources.Api, b.apiId, "Wrong existing API binding");
    assert.ok(!cs.changes.some(c => c.logicalId === "Api"), "Child phase cannot alter/replace parent");
  } else equal(cs.physicalResources, {}, "Unexpected pre-existing resources for initialization contract");
  if (approval.mode === "initialization") {
    const added = Object.keys(expectedTypes).filter(k => !(approval.phase === "api-children" && k === "Api"));
    equal(cs.changes.map(c => c.logicalId).sort(), added.sort(), "Complete deterministic initialization change list required");
    assert.ok(cs.changes.every(c => c.action === "Add"), "Initialization requires reviewed additions");
  }
  return { status: "LOCAL_REVIEW_MATERIAL_VALIDATED_NOT_DEPLOYMENT_AUTHORIZATION", changeSetId: cs.id };
}

export function validateInitializationBundle(approval, trustedApprovalDigest, bundle) {
  object(bundle, ["templateBytes", "assemblyBytes", "parameters", "assets", "changeSet", "executeChangeSetId"]);
  const result = validateInitializationReviewMaterial(approval, trustedApprovalDigest, {
    templateBytes: bundle.templateBytes,
    assemblyBytes: bundle.assemblyBytes,
    parameters: bundle.parameters,
    assets: bundle.assets,
    changeSet: bundle.changeSet,
  });
  assert.equal(bundle.executeChangeSetId, result.changeSetId, "Execute must use inspected immutable change-set ID");
  return { status: "LOCAL_REVIEW_VALIDATED_NOT_DEPLOYMENT_AUTHORIZATION", changeSetId: result.changeSetId };
}
