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
import { EDGE_WAF_REVIEW_SCHEMA, edgeWafTypes, assertEdgeWafTemplate } from "./edge-waf-contract.mjs";
import { IDENTITY_SESSION_REVIEW_SCHEMA, identitySessionTypes, assertIdentitySessionReviewTemplate } from "./identity-session-contract.mjs";
import {
  COGNITO_LOGIN_PREPARATION_SCHEMA, COGNITO_LOGIN_REVIEW_SCHEMA, COGNITO_LOGIN_TYPES,
  assertCognitoLoginPhysicalArn, assertDevCognitoLoginTemplate, cognitoLoginChangeSetName,
  cognitoLoginConfig, cognitoLoginDomainPrefix,
} from "./cognito-login-contract.mjs";

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

function assertCognitoLoginPreflight(bindings, account) {
  object(bindings, ["domainPrefix", "domainAvailable", "stackAbsent", "matchingPoolArns"], "WP-009 initialization preflight");
  assert.equal(bindings.domainPrefix, cognitoLoginDomainPrefix(account), "Exact WP-009 domain prefix required");
  assert.equal(bindings.domainAvailable, true, "Confirm Cognito domain availability");
  assert.equal(bindings.stackAbsent, true, "Confirm the Cognito stack is absent");
  equal(bindings.matchingPoolArns, [], "A matching or retained pool requires human review before another creation attempt");
}

function cognitoLoginCreateRequest(approval, templateBytes) {
  return {
    StackName: approval.stack,
    ChangeSetName: cognitoLoginChangeSetName(approval.templateSha256),
    ChangeSetType: "CREATE",
    RoleARN: approval.executionRole,
    TemplateBody: Buffer.from(templateBytes).toString("utf8"),
    Parameters: [],
    ResourceTypes: Object.values(COGNITO_LOGIN_TYPES),
    IncludeNestedStacks: false,
    ImportExistingResources: false,
    OnStackFailure: "ROLLBACK",
    RollbackConfiguration: { MonitoringTimeInMinutes: 0, RollbackTriggers: [] },
  };
}

// Pure request projection. A separately authorized operator must authenticate
// the preflight evidence and use the projected request without alteration.
export function validateCognitoLoginPreparation(approval, trustedApprovalDigest, templateBytes) {
  digest(trustedApprovalDigest);
  assert.equal(hashObject(approval), trustedApprovalDigest, "Preparation pin mismatch");
  object(approval, ["schema", "account", "phase", "region", "stack", "executionRole", "bindings", "templateSha256"]);
  assert.equal(approval.schema, COGNITO_LOGIN_PREPARATION_SCHEMA);
  assert.equal(approval.phase, "cognito-login");
  const t = target(approval.account, approval.phase);
  assert.equal(approval.region, t.region);
  assert.equal(approval.stack, t.name);
  assert.equal(approval.executionRole, t.executionRole);
  assertCognitoLoginPreflight(approval.bindings, t.account);
  assert.equal(hash(templateBytes), approval.templateSha256, "Template byte substitution");
  assertDevCognitoLoginTemplate(parseEvidenceJson(templateBytes), cognitoLoginConfig(t.account));
  return cognitoLoginCreateRequest(approval, templateBytes);
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
  const actualWaf = approval.schema === EDGE_WAF_REVIEW_SCHEMA;
  const actualIdentity = approval.schema === IDENTITY_SESSION_REVIEW_SCHEMA;
  const actualCognito = approval.schema === COGNITO_LOGIN_REVIEW_SCHEMA;
  assert.ok(actualApi || actualCertificate || actualStatic || actualRouting || actualWaf || actualIdentity || actualCognito || approval.schema === "shelfstate.wp007-initialization-review/v1", "Unsupported review schema");
  if (actualCognito) assert.equal(approval.phase, "cognito-login");
  const expectedTypes = actualCognito ? COGNITO_LOGIN_TYPES : actualApi ? libraryApiTypes(approval.phase) : actualCertificate ? edgeCertificateTypes(approval.phase) : actualStatic ? staticEdgeTypes(approval.phase) : actualRouting ? edgeRoutingTypes(approval.phase) : actualWaf ? edgeWafTypes(approval.phase) : actualIdentity ? identitySessionTypes(approval.phase) : TYPES[approval.phase];
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
  } else if (actualWaf) {
    object(b, [], "WAF initialization has no candidate-supplied resource binding");
    equal(approval.assets, {}, "Edge WAF initialization has no external assets");
  } else if (actualIdentity) {
    object(b, [], "Identity-session initialization has no candidate-supplied resource binding");
    equal(approval.assets, {}, "Identity-session initialization has no external assets");
  } else if (actualCognito) {
    assertCognitoLoginPreflight(b, t.account);
    equal(approval.assets, {}, "Cognito login initialization has no external assets");
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
  else if (actualWaf) assertEdgeWafTemplate(template, approval.account, approval.phase);
  else if (actualIdentity) assertIdentitySessionReviewTemplate(template, approval.account, approval.phase);
  else if (actualCognito) assertDevCognitoLoginTemplate(template, cognitoLoginConfig(t.account));
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
  object(cs, ["id", "name", "stackArn", "executionRole", "templateSha256", "parametersSha256", "status", "executionStatus", "changes", "physicalResources",
    ...(actualIdentity || actualCognito ? ["changeSetType", "capabilities", "includeNestedStacks", "importExistingResources", "onStackFailure"] : []),
    ...(actualCognito ? ["createRequest", "paginationComplete", "stackStatus", "storedTemplate", "rollbackConfiguration", "bootstrapParameter"] : [])]);
  assert.equal(hashObject(cs), approval.changeSetSha256, "Inspected change-set substitution");
  const changeSetArnPrefix = `arn:aws:cloudformation:${t.region}:${t.account}:changeSet/`;
  if (actualCognito) {
    assert.equal(cs.name, cognitoLoginChangeSetName(approval.templateSha256), "WP-009 change-set name must bind the reviewed template digest");
    assertCognitoLoginPhysicalArn(cs.id, `${changeSetArnPrefix}${cs.name}/`);
    assertCognitoLoginPhysicalArn(cs.stackArn, t.stackArn.slice(0, -1));
  } else {
    assert.match(cs.name, new RegExp(`^${actualIdentity ? "wp008" : "wp007"}-[a-f0-9]{64}$`));
    assert.match(cs.id, new RegExp(`^${changeSetArnPrefix}${cs.name}/[a-zA-Z0-9-]+$`));
    assert.match(cs.stackArn, new RegExp(`^arn:aws:cloudformation:${t.region}:${t.account}:stack/${t.name}/[a-zA-Z0-9-]+$`));
  }
  assert.equal(cs.executionRole, t.executionRole); assert.equal(cs.templateSha256, approval.templateSha256);
  assert.equal(cs.parametersSha256, approval.parametersSha256);
  assert.equal(cs.status, "CREATE_COMPLETE"); assert.equal(cs.executionStatus, "AVAILABLE");
  if (actualIdentity || actualCognito) {
    assert.equal(cs.changeSetType, "CREATE", "Stateful initialization requires a CREATE change set");
    equal(cs.capabilities, actualIdentity ? ["CAPABILITY_NAMED_IAM"] : [], "Exact change-set capabilities required");
    assert.equal(cs.includeNestedStacks, false, "Nested stacks are not supported");
    assert.equal(cs.importExistingResources, false, "Automatic import is not supported");
    assert.equal(cs.onStackFailure, "ROLLBACK", "Stateful initialization requires reviewed rollback behavior");
  }
  if (actualCognito) {
    const createRequest = cognitoLoginCreateRequest(approval, bundle.templateBytes);
    equal(cs.createRequest, createRequest, "WP-009 CreateChangeSet request differs from the reviewed projection");
    assert.equal(cs.paginationComplete, true, "Complete DescribeChangeSet readback required");
    assert.equal(cs.stackStatus, "REVIEW_IN_PROGRESS", "Expected a new unexecuted stack");
    equal(cs.storedTemplate, template, "Stored change-set template differs from the reviewed template");
    equal(cs.rollbackConfiguration, createRequest.RollbackConfiguration, "Unexpected rollback triggers or monitoring");
    const parameter = cs.bootstrapParameter;
    object(parameter, ["ParameterKey", "ParameterValue", "ResolvedValue"], "Expected the CDK bootstrap parameter readback");
    assert.equal(parameter.ParameterKey, "BootstrapVersion");
    assert.equal(parameter.ParameterValue, template.Parameters.BootstrapVersion.Default);
    assert.match(parameter.ResolvedValue ?? "", /^[1-9]\d*$/);
    assert.ok(Number.isSafeInteger(Number(parameter.ResolvedValue)) && Number(parameter.ResolvedValue) >= 6,
      "Resolved CDK bootstrap version must be at least 6");
  }
  const seen = new Set();
  for (const change of cs.changes) {
    // DescribeChangeSet documents Replacement for Modify only. For a WP-009
    // Add, allow omission or the explicit non-replacing projection.
    const mayOmitReplacement = actualCognito && change?.action === "Add" && !Object.hasOwn(change, "replacement");
    object(change, ["logicalId", "type", "action", ...(!mayOmitReplacement ? ["replacement"] : [])]);
    assert.ok(!seen.has(change.logicalId), "Duplicate change"); seen.add(change.logicalId);
    assert.equal(change.type, expectedTypes[change.logicalId], "Unexpected changed resource");
    assert.ok(["Add", "Modify"].includes(change.action), "Removal needs separate review");
    if (!mayOmitReplacement) assert.equal(change.replacement, "False", "Replacement requires separate re-initialization review");
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
  const actualCognito = approval.schema === COGNITO_LOGIN_REVIEW_SCHEMA;
  const statefulCreation = actualCognito || approval.schema === IDENTITY_SESSION_REVIEW_SCHEMA;
  object(bundle, ["templateBytes", "assemblyBytes", "parameters", "assets", "changeSet", "executeChangeSetId",
    ...(statefulCreation ? ["executionOptions"] : [])]);
  const result = validateInitializationReviewMaterial(approval, trustedApprovalDigest, {
    templateBytes: bundle.templateBytes,
    assemblyBytes: bundle.assemblyBytes,
    parameters: bundle.parameters,
    assets: bundle.assets,
    changeSet: bundle.changeSet,
  });
  assert.equal(bundle.executeChangeSetId, result.changeSetId, "Execute must use inspected immutable change-set ID");
  if (statefulCreation) {
    object(bundle.executionOptions, ["disableRollbackSpecified", "retainExceptOnCreate"]);
    assert.equal(bundle.executionOptions.disableRollbackSpecified, false,
      "DisableRollback must be omitted when OnStackFailure is bound on the change set");
    assert.equal(bundle.executionOptions.retainExceptOnCreate, false,
      "RetainExceptOnCreate must not override stateful rollback protection");
  }
  return {
    status: "LOCAL_REVIEW_VALIDATED_NOT_DEPLOYMENT_AUTHORIZATION",
    changeSetId: result.changeSetId,
    ...(actualCognito ? { executionRequest: {
      ChangeSetName: result.changeSetId, StackName: bundle.changeSet.stackArn, RetainExceptOnCreate: false,
    } } : {}),
  };
}
