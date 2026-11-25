import assert from "node:assert/strict";
import test, { before } from "node:test";
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { createEnvironmentTopology } from "../infrastructure/lib/topology.mjs";
import {
  COGNITO_LOGIN_PREPARATION_SCHEMA, COGNITO_LOGIN_REVIEW_SCHEMA, COGNITO_LOGIN_TYPES,
  cognitoLoginChangeSetName, cognitoLoginConfig, cognitoLoginDomainPrefix,
} from "../infrastructure/bootstrap/cognito-login-contract.mjs";
import {
  assertClosure, callerWindowCap, closureDecision, executionPolicies, generatedAuthority, target,
} from "../infrastructure/bootstrap/initialization.mjs";
import { deploymentPolicy } from "../infrastructure/bootstrap/model.mjs";
import {
  validateCognitoLoginPreparation, validateInitializationBundle, validateInitializationReviewMaterial,
} from "../infrastructure/bootstrap/initialization-guard.mjs";
import { hash, hashObject } from "../scripts/release/schema.mjs";
import { allows, decision } from "./support/bootstrap-policy-evaluator.mjs";
import { ACCOUNT, IDS } from "./support/initialization-fixture.mjs";

const phase = "cognito-login";
const t = target(ACCOUNT, phase);
const stackArn = t.stackArn.replace("*", "11111111-2222-3333-4444-555555555555");
const changeSetArn = name => `arn:aws:cloudformation:${t.region}:${ACCOUNT}:changeSet/${name}/55555555-4444-3333-2222-111111111111`;
const pool = `arn:aws:cognito-idp:${t.region}:${ACCOUNT}:userpool/${t.region}_Example123`;
const westBindings = { ...IDS,
  webAclArn: `arn:aws:wafv2:us-east-1:${ACCOUNT}:global/webacl/shelfstate-v4-dev-edge/11111111-2222-3333-4444-555555555555`,
};
const tags = { Project: "ShelfState", Environment: "dev", ManagedBy: "AWS-CDK", WorkPackage: "WP-009" };
const region = { "aws:RequestedRegion": t.region };
const tagged = kind => Object.fromEntries(Object.entries(tags).map(([k, v]) => [`aws:${kind}Tag/${k}`, v]));
const resourceTags = { ...region, ...tagged("Resource") };
const requestTags = { ...region, ...tagged("Request"), "aws:TagKeys": Object.keys(tags) };
const joined = (...policies) => ({ Version: "2012-10-17", Statement: policies.flatMap(policy => policy.Statement) });
const policyAllows = (policy, action, resource, context) => allows(policy, `cognito-idp:${action}`, resource, context);

let template;
before(() => {
  const app = new App({ analyticsReporting: false });
  const topology = createEnvironmentTopology(app, cognitoLoginConfig(ACCOUNT), { implementationPhase: phase });
  template = Template.fromStack(topology.stacks.get(phase)).toJSON();
});

function prepareEvidence(candidate = template) {
  const templateBytes = Buffer.from(JSON.stringify(candidate));
  const approval = {
    schema: COGNITO_LOGIN_PREPARATION_SCHEMA,
    account: ACCOUNT, phase, region: t.region, stack: t.name, executionRole: t.executionRole,
    bindings: { domainPrefix: cognitoLoginDomainPrefix(ACCOUNT), domainAvailable: true, stackAbsent: true, matchingPoolArns: [] },
    templateSha256: hash(templateBytes),
  };
  return { approval, templateBytes };
}

function reviewEvidence() {
  const { approval: preparation, templateBytes } = prepareEvidence();
  const createRequest = validateCognitoLoginPreparation(preparation, hashObject(preparation), templateBytes);
  const templateSha256 = preparation.templateSha256;
  const parametersSha256 = hashObject({});
  const assemblyBytes = Buffer.from(JSON.stringify({ stack: t.name, account: ACCOUNT, region: t.region, executionRole: t.executionRole, templateSha256 }));
  const changeSet = {
    createRequest, templateSha256, parametersSha256,
    id: changeSetArn(createRequest.ChangeSetName), name: createRequest.ChangeSetName, stackArn, executionRole: t.executionRole,
    status: "CREATE_COMPLETE", executionStatus: "AVAILABLE", paginationComplete: true, stackStatus: "REVIEW_IN_PROGRESS",
    storedTemplate: structuredClone(template),
    bootstrapParameter: { ParameterKey: "BootstrapVersion", ParameterValue: template.Parameters.BootstrapVersion.Default, ResolvedValue: "32" },
    changes: Object.entries(COGNITO_LOGIN_TYPES).map(([logicalId, type]) => ({ logicalId, type, action: "Add", replacement: "False" })),
    physicalResources: {}, changeSetType: "CREATE", capabilities: [], includeNestedStacks: false, importExistingResources: false,
    onStackFailure: "ROLLBACK", rollbackConfiguration: structuredClone(createRequest.RollbackConfiguration),
  };
  const approval = {
    ...preparation, schema: COGNITO_LOGIN_REVIEW_SCHEMA, mode: "initialization", assets: {}, parametersSha256,
    assemblySha256: hash(assemblyBytes), changeSetSha256: hashObject(changeSet),
  };
  return { approval, bundle: { templateBytes, assemblyBytes, parameters: {}, assets: {}, changeSet } };
}

test("Cognito preparation builds one deterministic inline CREATE request from the independently pinned dev template and preflight", () => {
  const { approval, templateBytes } = prepareEvidence();
  const pin = hashObject(approval);
  const request = validateCognitoLoginPreparation(approval, pin, templateBytes);
  assert.deepEqual(request, {
    StackName: t.name, ChangeSetName: `wp009-${hash(templateBytes)}`, ChangeSetType: "CREATE",
    RoleARN: t.executionRole, TemplateBody: templateBytes.toString("utf8"), Parameters: [],
    ResourceTypes: Object.values(COGNITO_LOGIN_TYPES), IncludeNestedStacks: false, ImportExistingResources: false,
    OnStackFailure: "ROLLBACK", RollbackConfiguration: { MonitoringTimeInMinutes: 0, RollbackTriggers: [] },
  });
  assert.deepEqual(request, validateCognitoLoginPreparation(approval, pin, templateBytes));
  assert.throws(() => validateCognitoLoginPreparation(approval, hashObject({}), templateBytes), /pin mismatch/);
  assert.throws(() => validateCognitoLoginPreparation(approval, pin, Buffer.from("{}")), /byte substitution/);
  for (const delta of [
    { domainAvailable: false }, { domainPrefix: "shelfstate-v4-prod-auth" }, { stackAbsent: false }, { matchingPoolArns: [pool] },
  ]) {
    const candidate = { ...approval, bindings: { ...approval.bindings, ...delta } };
    assert.throws(() => validateCognitoLoginPreparation(candidate, hashObject(candidate), templateBytes));
  }
});

test("Cognito preparation rejects re-pinned resource, protection, and OAuth drift", () => {
  for (const mutate of [
    r => { r.Nested = { Type: "AWS::CloudFormation::Stack" }; },
    r => { r.AppClient.Properties.GenerateSecret = true; },
    r => { r.AppClient.Properties.CallbackURLs.push("https://dev.shelfstate.codecorax.com/other"); },
    r => { r.AppClient.Properties.LogoutURLs = ["https://dev.shelfstate.codecorax.com/other"]; },
    r => { r.AppClient.Properties.ExplicitAuthFlows.push("ALLOW_USER_PASSWORD_AUTH"); },
    r => { r.UserPool.Properties.DeletionProtection = "INACTIVE"; },
    r => { delete r.UserPool.UpdateReplacePolicy; },
    r => { delete r.UserPool.DeletionPolicy; },
    r => { r.UserPool.Properties.AdminCreateUserConfig.AllowAdminCreateUserOnly = false; },
    r => { r.UserPool.Properties.UserPoolTier = "ESSENTIALS"; },
    r => { r.LoginDomain.Properties.Domain = "unapproved-name"; },
  ]) {
    const candidate = structuredClone(template);
    mutate(candidate.Resources);
    const { approval, templateBytes } = prepareEvidence(candidate);
    assert.throws(() => validateCognitoLoginPreparation(approval, hashObject(approval), templateBytes), /exact WP-009 contract/);
  }
});

test("the Cognito change-set review pins four additions, complete readback, and the immutable execution request", () => {
  const { approval, bundle } = reviewEvidence();
  delete bundle.changeSet.changes[0].replacement; // Documented AWS omission for Add
  approval.changeSetSha256 = hashObject(bundle.changeSet);
  const pin = hashObject(approval);
  const id = bundle.changeSet.id;
  assert.deepEqual(validateInitializationReviewMaterial(approval, pin, bundle), {
    status: "LOCAL_REVIEW_MATERIAL_VALIDATED_NOT_DEPLOYMENT_AUTHORIZATION", changeSetId: id,
  });
  const executionOptions = { disableRollbackSpecified: false, retainExceptOnCreate: false };
  const execute = { ...bundle, executeChangeSetId: id, executionOptions };
  assert.deepEqual(validateInitializationBundle(approval, pin, execute), {
    status: "LOCAL_REVIEW_VALIDATED_NOT_DEPLOYMENT_AUTHORIZATION", changeSetId: id,
    executionRequest: { ChangeSetName: id, StackName: stackArn, RetainExceptOnCreate: false },
  });
  assert.throws(() => validateInitializationBundle(approval, pin, { ...execute, executeChangeSetId: bundle.changeSet.name }), /immutable/);
  for (const flag of Object.keys(executionOptions)) {
    assert.throws(() => validateInitializationBundle(approval, pin, { ...execute, executionOptions: { ...executionOptions, [flag]: true } }));
  }
});

test("Cognito review rejects re-pinned changes, request substitution, and incomplete or inconsistent readback", () => {
  for (const mutate of [
    cs => { cs.changeSetType = "UPDATE"; },
    cs => { cs.changeSetType = "IMPORT"; },
    cs => { cs.changes[0].action = "Remove"; },
    cs => { cs.changes[0].action = "Modify"; },
    cs => { cs.changes[0].replacement = "True"; },
    cs => { cs.changes[0].replacement = "Conditional"; },
    cs => { cs.changes[0].action = "Modify"; delete cs.changes[0].replacement; },
    cs => { cs.changes.pop(); },
    cs => { cs.changes.push(cs.changes[0]); },
    cs => { cs.physicalResources.UserPool = pool; },
    cs => { cs.includeNestedStacks = true; },
    cs => { cs.importExistingResources = true; },
    cs => { cs.onStackFailure = "DELETE"; },
    cs => { cs.rollbackConfiguration.MonitoringTimeInMinutes = 1; },
    cs => { cs.executionRole = t.executionRole + "-other"; },
    cs => { cs.stackArn = cs.stackArn.replace("-dev-", "-prod-"); },
    cs => { cs.id = cs.id.replace(ACCOUNT, "999999999999"); },
    cs => { cs.name = `wp009-${"a".repeat(64)}`; cs.id = changeSetArn(cs.name); },
    cs => { cs.paginationComplete = false; },
    cs => { cs.stackStatus = "CREATE_COMPLETE"; },
    cs => { cs.storedTemplate.Resources.UserPool.Properties.UserPoolTier = "LITE"; },
    cs => { cs.bootstrapParameter.ResolvedValue = "5"; },
    cs => { cs.bootstrapParameter.ParameterValue = "/unapproved/version"; },
    cs => { cs.createRequest.TemplateBody = "{}"; },
    cs => { cs.createRequest.Capabilities = ["CAPABILITY_NAMED_IAM"]; },
  ]) {
    const { approval, bundle } = reviewEvidence();
    mutate(bundle.changeSet);
    approval.changeSetSha256 = hashObject(bundle.changeSet);
    assert.throws(() => validateInitializationReviewMaterial(approval, hashObject(approval), bundle));
  }
});

test("Cognito caller windows permit only the scoped CREATE or the exact prepared stack and name", () => {
  const name = cognitoLoginChangeSetName(hashObject(template));
  const binding = { stackArn, changeSetId: changeSetArn(name) };
  const prepare = joined(deploymentPolicy(t.region, ACCOUNT), callerWindowCap(ACCOUNT, phase, t.region, name, "prepare"));
  const execute = joined(deploymentPolicy(t.region, ACCOUNT), callerWindowCap(ACCOUNT, phase, t.region, name, "execute", binding));
  const ctx = { "cloudformation:ChangeSetName": name, "cloudformation:RoleArn": t.executionRole,
    "cloudformation:ResourceTypes": Object.values(COGNITO_LOGIN_TYPES) };
  assert.equal(allows(prepare, "cloudformation:CreateChangeSet", stackArn, ctx), true);
  assert.equal(allows(prepare, "cloudformation:DescribeChangeSet", stackArn, ctx), true);
  assert.equal(allows(prepare, "iam:PassRole", t.executionRole, { "iam:PassedToService": "cloudformation.amazonaws.com" }), true);
  assert.equal(allows(prepare, "iam:PassRole", t.executionRole, { "iam:PassedToService": "lambda.amazonaws.com" }), false);
  for (const delta of [
    { "cloudformation:RoleArn": t.executionRole + "-other" }, { "cloudformation:ChangeSetName": name + "-other" },
    { "cloudformation:ResourceTypes": ["AWS::Cognito::IdentityPool"] }, { "cloudformation:ResourceTypes": null },
    { "cloudformation:ImportResourceTypes": [COGNITO_LOGIN_TYPES.UserPool] }, { "cloudformation:TemplateUrl": "https://example.invalid" },
    { "aws:TagKeys": ["Project"] }, { "cloudformation:DisableValidation": "true" },
  ]) assert.equal(allows(prepare, "cloudformation:CreateChangeSet", stackArn, { ...ctx, ...delta }), false);
  assert.equal(allows(prepare, "cloudformation:CreateChangeSet", stackArn, { ...ctx, "cloudformation:DisableValidation": "false" }), true);
  assert.equal(decision(prepare, "cloudformation:ExecuteChangeSet", stackArn, ctx), "explicitDeny");
  assert.equal(decision(prepare, "cloudformation:UpdateTerminationProtection", stackArn), "explicitDeny");
  assert.equal(allows(execute, "cloudformation:ExecuteChangeSet", stackArn, ctx), true);
  assert.equal(allows(execute, "cloudformation:UpdateTerminationProtection", stackArn), true);
  for (const action of ["cloudformation:TagResource", "cloudformation:UntagResource"]) {
    const preparing = { "cloudformation:CreateAction": "CreateChangeSet" };
    const executing = { "cloudformation:CreateAction": "ExecuteChangeSet" };
    assert.equal(allows(prepare, action, stackArn, preparing), true);
    assert.equal(allows(execute, action, stackArn, executing), true);
    for (const [policy, invalid] of [[prepare, executing], [execute, preparing], [prepare, {}], [execute, {}]]) {
      assert.equal(decision(policy, action, stackArn, invalid), "explicitDeny");
    }
    assert.equal(decision(execute, action, stackArn.replace(/5$/, "6"), executing), "explicitDeny");
  }
  assert.equal(decision(execute, "cloudformation:ExecuteChangeSet", stackArn.replace(/5$/, "6"), ctx), "explicitDeny");
  assert.equal(decision(execute, "cloudformation:ExecuteChangeSet", stackArn, { ...ctx, "cloudformation:ChangeSetName": name + "-other" }), "explicitDeny");
  for (const action of ["CreateChangeSet", "DeleteChangeSet", "UpdateStack", "DeleteStack", "ContinueUpdateRollback"]) {
    assert.equal(decision(execute, `cloudformation:${action}`, stackArn, ctx), "explicitDeny");
  }
  assert.equal(decision(execute, "iam:PassRole", t.executionRole), "explicitDeny");
  assert.throws(() => callerWindowCap(ACCOUNT, phase, t.region, name, "execute"));
  assert.throws(() => callerWindowCap(ACCOUNT, phase, t.region, name, "execute", { ...binding, changeSetId: name }));
  for (const [regionalRole, state] of [[t.region, "closed"], ["us-east-1", "prepare"], ["us-east-1", "execute"]]) {
    const closed = callerWindowCap(ACCOUNT, phase, regionalRole, name, state);
    assert.equal(decision(closed, "cloudformation:CreateChangeSet", stackArn, ctx), "explicitDeny");
    assert.equal(decision(closed, "cloudformation:ExecuteChangeSet", stackArn, ctx), "explicitDeny");
    assert.equal(decision(closed, "iam:PassRole", t.executionRole), "explicitDeny");
    assert.ok(JSON.stringify(closed).length <= 6144);
  }
});

test("temporary Cognito authorities separate request tags, owned lifecycle, and safe rollback", () => {
  const initial = generatedAuthority(ACCOUNT, phase, "initialization");
  assert.equal(policyAllows(initial, "CreateUserPool", "*", requestTags), true);
  assert.equal(policyAllows(initial, "CreateUserPool", "*", resourceTags), false);
  assert.equal(policyAllows(initial, "CreateUserPool", "*", { ...requestTags, "aws:RequestTag/WorkPackage": undefined }), false);
  assert.equal(policyAllows(initial, "CreateUserPool", "*", { ...requestTags, "aws:RequestedRegion": "us-east-1" }), false);
  assert.equal(policyAllows(initial, "CreateUserPool", "*", { ...requestTags, "aws:TagKeys": [...Object.keys(tags), "Other"] }), false);
  assert.equal(policyAllows(initial, "TagResource", pool, requestTags), true);
  assert.equal(policyAllows(initial, "TagResource", pool, { ...requestTags, "aws:ResourceTag/Environment": "prod" }), false);
  assert.equal(policyAllows(initial, "TagResource", pool, { ...requestTags, "aws:ResourceTag/WorkPackage": "WP-008" }), false);
  assert.equal(policyAllows(initial, "UntagResource", pool, { ...resourceTags, "aws:TagKeys": ["WorkPackage"] }), false);
  assert.equal(policyAllows(initial, "UntagResource", pool, { ...resourceTags, "aws:TagKeys": ["aws:cloudformation:stack-id"] }), true);
  for (const action of ["CreateUserPoolClient", "CreateUserPoolDomain", "CreateManagedLoginBranding", "DescribeUserPool",
    "DescribeUserPoolClient", "DescribeManagedLoginBrandingByClient", "GetUserPoolMfaConfig", "ListTagsForResource",
    "DeleteUserPoolClient", "DeleteUserPoolDomain", "DeleteManagedLoginBranding"]) {
    assert.equal(policyAllows(initial, action, pool, resourceTags), true, action);
    assert.equal(policyAllows(initial, action, pool, requestTags), false, action);
    assert.equal(policyAllows(initial, action, pool.replace(ACCOUNT, "999999999999"), resourceTags), false, action);
    assert.equal(policyAllows(initial, action, pool.replaceAll("us-west-2", "us-east-1"), resourceTags), false, action);
    assert.equal(policyAllows(initial, action, pool, { ...resourceTags, "aws:ResourceTag/Environment": "prod" }), false, action);
  }
  assert.equal(policyAllows(initial, "DescribeUserPoolDomain", "*", region), true);
  assert.equal(policyAllows(initial, "DescribeUserPoolDomain", "*", { "aws:RequestedRegion": "us-east-1" }), false);
  for (const action of ["DeleteUserPool", "UpdateUserPool", "CreateIdentityProvider", "AdminCreateUser", "ListUsers", "SetUserPoolMfaConfig", "ListUserPoolClientSecrets"]) {
    assert.equal(policyAllows(initial, action, pool, resourceTags), false, action);
  }
  assert.throws(() => generatedAuthority(ACCOUNT, phase, "initialization", { userPoolArn: pool }), /No physical/);
});

test("Cognito steady state narrows to the verified exact pool and drops creation and rollback grants", () => {
  const steady = generatedAuthority(ACCOUNT, phase, "steady", { userPoolArn: pool });
  for (const action of ["DescribeUserPool", "UpdateUserPool", "UpdateUserPoolClient", "UpdateUserPoolDomain", "UpdateManagedLoginBranding"]) {
    assert.equal(policyAllows(steady, action, pool, resourceTags), true, action);
    assert.equal(policyAllows(steady, action, pool + "Other", resourceTags), false, action);
  }
  for (const action of ["CreateUserPool", "CreateUserPoolClient", "CreateUserPoolDomain", "CreateManagedLoginBranding",
    "DeleteUserPool", "DeleteUserPoolClient", "DeleteUserPoolDomain", "DeleteManagedLoginBranding"]) {
    assert.equal(policyAllows(steady, action, pool, { ...resourceTags, ...requestTags }), false, action);
  }
  assert.equal(policyAllows(steady, "TagResource", pool, requestTags), false);
  assert.equal(policyAllows(steady, "TagResource", pool, { ...requestTags, ...resourceTags }), true);
  assert.equal(policyAllows(steady, "TagResource", pool, { ...requestTags, ...resourceTags, "aws:RequestTag/Environment": "prod" }), false);
  for (const arn of [undefined, pool.replace(ACCOUNT, "999999999999"), pool.replaceAll("us-west-2", "us-east-1"), pool + "*"]) {
    assert.throws(() => generatedAuthority(ACCOUNT, phase, "steady", { userPoolArn: arn }), /Exact west/);
  }
});

test("complete policy generation preserves every installed WP-007 and WP-008 statement and fits IAM limits", () => {
  const widest = { ...westBindings, ...Object.fromEntries(Object.keys(IDS).filter(k => k !== "webAclArn").map(k => [k, "x".repeat(64)])) };
  const base = executionPolicies(ACCOUNT, "identity-session", "steady", widest);
  for (const mode of ["initialization", "steady"]) {
    const bindings = mode === "steady" ? { ...widest, userPoolArn: pool.replace(/Example123$/, "x".repeat(45)) } : widest;
    const pair = executionPolicies(ACCOUNT, phase, mode, bindings);
    assert.deepEqual(pair, executionPolicies(ACCOUNT, phase, mode, bindings));
    for (const [index, policy] of pair.entries()) {
      assert.deepEqual(policy.Statement.slice(0, base[index].Statement.length), base[index].Statement);
      const added = policy.Statement.slice(base[index].Statement.length);
      assert.ok(added.every(s => s.Action.every(action => action.startsWith("cognito-idp:"))));
      assert.equal(new Set(policy.Statement.map(s => s.Sid)).size, policy.Statement.length);
      assert.ok(JSON.stringify(policy).length <= 6144);
    }
  }
  for (const earlier of ["identity-session", "edge-routing", "edge-waf"]) {
    assert.ok(executionPolicies(ACCOUNT, earlier, "steady", westBindings).every(p => !JSON.stringify(p).includes("cognito-idp:")));
  }
  assert.throws(() => executionPolicies(ACCOUNT, phase, "initialization", {}));
  assert.throws(() => executionPolicies(ACCOUNT, phase, "initialization", westBindings, ["edge-routing"]));
});

test("rollback or any retained pool blocks WP-009 retries and closeout requires successful authenticated readback", () => {
  for (const state of ["ROLLBACK_COMPLETE", "ROLLBACK_FAILED", "CREATE_FAILED", "UPDATE_COMPLETE", "REVIEW_IN_PROGRESS"]) {
    assert.equal(closureDecision(state, phase), "STOP_HUMAN_RECOVERY_REQUIRED");
  }
  for (const state of ["CREATE_IN_PROGRESS", "ROLLBACK_IN_PROGRESS"]) {
    assert.equal(closureDecision(state, phase), "KEEP_AUTHORITY_NO_NEXT_OPERATION");
  }
  const userPoolId = pool.split("/").at(-1);
  const resources = {
    UserPool: { arn: pool },
    AppClient: { userPoolId, clientId: "clientId" },
    LoginDomain: { userPoolId, prefix: cognitoLoginDomainPrefix(ACCOUNT) },
    LoginBranding: { userPoolId, clientId: "clientId", brandingId: "11111111-2222-4333-8444-555555555555" },
  };
  const evidence = { status: "CREATE_COMPLETE", resources, narrowedPolicyMatches: true, effectiveReadbackMatches: true, otherWindowOpen: false };
  assert.equal(assertClosure(evidence, resources, phase, ACCOUNT), "LOCAL_EVIDENCE_CONSISTENT_NOT_LIVE_ATTESTATION");
  assert.throws(() => assertClosure({ ...evidence, status: "ROLLBACK_COMPLETE" }, resources, phase, ACCOUNT));
  for (const bad of [{}, { UserPool: { arn: pool } }, { ...resources, LoginBranding: { ...resources.LoginBranding, clientId: "unrelated" } },
    { ...resources, LoginDomain: { ...resources.LoginDomain, userPoolId: "us-west-2_Unrelated" } },
    { ...resources, UserPool: { arn: pool.replace(ACCOUNT, "999999999999") } }]) {
    assert.throws(() => assertClosure({ ...evidence, resources: bad }, bad, phase, ACCOUNT));
  }
});
