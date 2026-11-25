import assert from "node:assert/strict";
import test, { before } from "node:test";
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { createEnvironmentTopology } from "../infrastructure/lib/topology.mjs";
import { resolveEnvironmentConfig } from "../infrastructure/lib/environment.mjs";
import {
  IDENTITY_SESSION_REVIEW_SCHEMA,
} from "../infrastructure/bootstrap/identity-session-contract.mjs";
import {
  callerWindowCap,
  executionPolicies,
  generatedAuthority,
  target,
} from "../infrastructure/bootstrap/initialization.mjs";
import {
  identitySessionResources,
} from "../infrastructure/bootstrap/model.mjs";
import {
  validateInitializationBundle,
} from "../infrastructure/bootstrap/initialization-guard.mjs";
import { hash, hashObject } from "../scripts/release/schema.mjs";
import { allows, decision } from "./support/bootstrap-policy-evaluator.mjs";

const ACCOUNT = "123456789012";
const config = resolveEnvironmentConfig("dev", {
  SHELFSTATE_DEV_AWS_ACCOUNT_ID: ACCOUNT,
});
const changeSetName = `wp008-${"a".repeat(64)}`;
const wp007Bindings = {
  apiId: "apitest",
  integrationId: "integrationtest",
  routeId: "routetest",
  distributionId: "DISTTEST",
  oacId: "OACTEST",
  responseHeadersPolicyId: "headers-test",
  cachePolicyId: "cache-test",
  originRequestPolicyId: "origin-test",
  certificateId: "certificate-test",
  webAclId: "11111111-2222-3333-4444-555555555555",
  webAclArn: `arn:aws:wafv2:us-east-1:${ACCOUNT}:global/webacl/shelfstate-v4-dev-edge/11111111-2222-3333-4444-555555555555`,
  zoneId: "ZTESTONLY",
};
let synthesizedTemplate;

before(() => {
  const app = new App({ analyticsReporting: false });
  const topology = createEnvironmentTopology(app, config, {
    implementationPhase: "identity-session",
  });
  synthesizedTemplate = Template.fromStack(
    topology.stacks.get("identity-session"),
  ).toJSON();
});

function evidence() {
  const t = target(ACCOUNT, "identity-session");
  const templateBytes = Buffer.from(JSON.stringify(synthesizedTemplate));
  const approval = {
    schema: IDENTITY_SESSION_REVIEW_SCHEMA,
    account: ACCOUNT,
    phase: "identity-session",
    region: "us-west-2",
    stack: t.name,
    executionRole: t.executionRole,
    bindings: {},
    mode: "initialization",
    templateSha256: hash(templateBytes),
    assemblySha256: "",
    parametersSha256: hashObject({}),
    assets: {},
    changeSetSha256: "",
  };
  const assemblyBytes = Buffer.from(JSON.stringify({
    stack: t.name,
    account: ACCOUNT,
    region: t.region,
    executionRole: t.executionRole,
    templateSha256: approval.templateSha256,
  }));
  approval.assemblySha256 = hash(assemblyBytes);
  const changeSet = {
    id: `arn:aws:cloudformation:us-west-2:${ACCOUNT}:changeSet/${changeSetName}/synthetic-id`,
    name: changeSetName,
    stackArn: t.stackArn.replace("*", "synthetic-stack-id"),
    executionRole: t.executionRole,
    templateSha256: approval.templateSha256,
    parametersSha256: approval.parametersSha256,
    status: "CREATE_COMPLETE",
    executionStatus: "AVAILABLE",
    changes: Object.entries(synthesizedTemplate.Resources).map(([logicalId, resource]) => ({
      logicalId,
      type: resource.Type,
      action: "Add",
      replacement: "False",
    })),
    physicalResources: {},
    changeSetType: "CREATE",
    capabilities: ["CAPABILITY_NAMED_IAM"],
    includeNestedStacks: false,
    importExistingResources: false,
    onStackFailure: "ROLLBACK",
  };
  approval.changeSetSha256 = hashObject(changeSet);
  const bundle = {
    templateBytes,
    assemblyBytes,
    parameters: {},
    assets: {},
    changeSet,
    executeChangeSetId: changeSet.id,
    executionOptions: {
      disableRollbackSpecified: false,
      retainExceptOnCreate: false,
    },
  };
  return { approval, bundle, pin: hashObject(approval) };
}

function repin(value) {
  value.approval.templateSha256 = hash(value.bundle.templateBytes);
  value.bundle.assemblyBytes = Buffer.from(JSON.stringify({
    stack: value.approval.stack,
    account: value.approval.account,
    region: value.approval.region,
    executionRole: value.approval.executionRole,
    templateSha256: value.approval.templateSha256,
  }));
  value.approval.assemblySha256 = hash(value.bundle.assemblyBytes);
  value.bundle.changeSet.templateSha256 = value.approval.templateSha256;
  value.approval.changeSetSha256 = hashObject(value.bundle.changeSet);
  value.pin = hashObject(value.approval);
  return value;
}

const check = value => validateInitializationBundle(
  value.approval,
  value.pin,
  value.bundle,
);
const joined = policies => ({
  Version: "2012-10-17",
  Statement: policies.flatMap(policy => policy.Statement),
});

test("actual WP-008 synthesis passes the exact CREATE review contract", () => {
  const value = evidence();
  assert.equal(
    check(value).status,
    "LOCAL_REVIEW_VALIDATED_NOT_DEPLOYMENT_AUTHORIZATION",
  );
  assert.deepEqual(
    value.bundle.changeSet.changes.map(change => change.type).sort(),
    [
      "AWS::DynamoDB::Table",
      "AWS::DynamoDB::Table",
      "AWS::IAM::ManagedPolicy",
      "AWS::IAM::ManagedPolicy",
      "AWS::IAM::ManagedPolicy",
      "AWS::IAM::ManagedPolicy",
    ].sort(),
  );
});

test("identity-session authority is exact, data-plane-free, and has no table deletion", () => {
  const resources = identitySessionResources(ACCOUNT);
  const initial = generatedAuthority(ACCOUNT, "identity-session", "initialization");
  const steady = generatedAuthority(ACCOUNT, "identity-session", "steady");
  const createContext = {
    "aws:RequestTag/Project": "ShelfState",
    "aws:RequestTag/Environment": "dev",
    "aws:RequestTag/ManagedBy": "AWS-CDK",
    "aws:TagKeys": [
      "Project",
      "Environment",
      "ManagedBy",
      "aws:cloudformation:logical-id",
      "aws:cloudformation:stack-id",
      "aws:cloudformation:stack-name",
    ],
  };
  for (const table of resources.tables) {
    assert.equal(allows(initial, "dynamodb:CreateTable", table, createContext), true);
    assert.equal(allows(initial, "dynamodb:CreateTable", table, {}), false);
    assert.equal(allows(initial, "dynamodb:CreateTable", table, {
      ...createContext,
      "aws:RequestTag/Environment": "prod",
    }), false);
    assert.equal(allows(initial, "dynamodb:TagResource", table), true,
      "Existing-resource tagging is exact-ARN scoped, not request-tag scoped");
    for (const action of ["dynamodb:DescribeTable", "dynamodb:UpdateTable",
      "dynamodb:DescribeContinuousBackups", "dynamodb:UpdateContinuousBackups",
      "dynamodb:DescribeTimeToLive", "dynamodb:ListTagsOfResource"]) {
      assert.equal(allows(initial, action, table), true, action);
    }
    for (const action of ["dynamodb:DeleteTable", "dynamodb:GetItem", "dynamodb:PutItem",
      "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan"]) {
      assert.equal(allows(initial, action, table, createContext), false, action);
      assert.equal(allows(steady, action, table, createContext), false, action);
    }
    assert.equal(allows(steady, "dynamodb:CreateTable", table, createContext), false);
  }
  assert.equal(allows(initial, "dynamodb:UpdateTimeToLive", resources.sessionAuthTable), true);
  assert.equal(allows(initial, "dynamodb:UpdateTimeToLive", resources.tables[0]), false);
  assert.equal(allows(initial, "dynamodb:CreateTable",
    resources.tables[0].replace("dev", "prod"), createContext), false);
  assert.equal(allows(initial, "dynamodb:TagResource",
    resources.tables[0].replace("dev", "prod")), false);
  assert.equal(allows(initial, "dynamodb:CreateTable",
    resources.tables[0].replace(ACCOUNT, "999999999999"), createContext), false);

  for (const policy of resources.policies) {
    assert.equal(allows(initial, "iam:CreatePolicy", policy), true);
    assert.equal(allows(steady, "iam:CreatePolicy", policy), false);
    assert.equal(allows(initial, "iam:DeletePolicy", policy), true);
    assert.equal(allows(steady, "iam:DeletePolicy", policy), false);
    for (const action of ["iam:GetPolicy", "iam:GetPolicyVersion", "iam:ListPolicyVersions",
      "iam:ListEntitiesForPolicy", "iam:CreatePolicyVersion", "iam:SetDefaultPolicyVersion",
      "iam:DeletePolicyVersion"]) {
      assert.equal(allows(initial, action, policy), true, action);
      assert.equal(allows(steady, action, policy), true, action);
    }
    for (const action of ["iam:AttachRolePolicy", "iam:AttachUserPolicy", "iam:AttachGroupPolicy",
      "iam:DetachRolePolicy", "iam:TagPolicy", "iam:CreateRole", "iam:PassRole"]) {
      assert.equal(allows(initial, action, policy), false, action);
    }
  }
  assert.equal(allows(initial, "iam:CreatePolicy",
    resources.policies[0].replace("dev", "prod")), false);
});

test("identity-session execution composition excludes every WP-007 application surface", () => {
  const policy = joined(executionPolicies(
    ACCOUNT,
    "identity-session",
    "initialization",
    {},
  ));
  const resources = identitySessionResources(ACCOUNT);
  assert.equal(allows(policy, "dynamodb:DescribeTable", resources.tables[0]), true);
  assert.equal(allows(policy, "iam:GetPolicy", resources.policies[0]), true);
  for (const [action, resource] of [
    ["s3:CreateBucket", `arn:aws:s3:::shelfstate-v4-dev-static-${ACCOUNT}-us-west-2`],
    ["lambda:CreateFunction", `arn:aws:lambda:us-west-2:${ACCOUNT}:function:shelfstate-v4-dev-health`],
    ["cloudfront:CreateDistribution", "*"],
    ["route53:ChangeResourceRecordSets", "arn:aws:route53:::hostedzone/ZTESTONLY"],
    ["iam:CreateRole", `arn:aws:iam::${ACCOUNT}:role/shelfstate-v4-dev-health`],
  ]) assert.equal(allows(policy, action, resource), false, action);
  assert.throws(() => executionPolicies(
    ACCOUNT,
    "identity-session",
    "initialization",
    {},
    ["api-parent"],
  ), /cannot retain unrelated/);
});

test("identity-session steady preserves the exact WP-007 baseline and west partition", () => {
  const policies = executionPolicies(ACCOUNT, "identity-session", "steady", wp007Bindings);
  assert.equal(policies.length, 2);
  assert.deepEqual(policies, executionPolicies(ACCOUNT, "identity-session", "steady", wp007Bindings,
    ["api-parent", "api-children", "edge-routing"]));
  const identitySids = [
    ["ReadConfigureIdentitySessionTables", "TagIdentitySessionTables"],
    ["ConfigureSessionAuthTtl", "ManageIdentitySessionPolicies"],
  ];
  const allIdentitySids = identitySids.flat();
  const expectedWp007 = [
    "77ccfb3278b0780b4ef24904bb6199f3d3a6700702f9a2c87c2e55849ddfb3c2",
    "eb5a49c4f42ed953ec915fdf08344ea9278a26145ce381f1b30f551012d1d97b",
  ];
  for (const [index, policy] of policies.entries()) {
    const names = policy.Statement.map(s => s.Sid);
    assert.equal(new Set(names).size, names.length);
    assert.ok(names.every(sid => /^[A-Za-z0-9]+$/.test(sid)));
    assert.deepEqual(names.filter(sid => allIdentitySids.includes(sid)), identitySids[index]);
    const wp007 = { ...policy, Statement: policy.Statement.filter(s => !allIdentitySids.includes(s.Sid)) };
    // Canonical WP-007 steady-policy pair for the synthetic bindings above.
    assert.equal(hashObject(wp007), expectedWp007[index]);
    assert.ok(JSON.stringify(policy).length <= 6144);
  }
  const widestBindings = Object.fromEntries(Object.entries(wp007Bindings)
    .map(([key, value]) => [key, key === "webAclArn" ? value : "x".repeat(64)]));
  for (const policy of executionPolicies(ACCOUNT, "identity-session", "steady", widestBindings)) {
    assert.ok(JSON.stringify(policy).length <= 6144);
  }
  assert.throws(() => executionPolicies(ACCOUNT, "identity-session", "steady", {}));
  assert.throws(() => executionPolicies(ACCOUNT, "identity-session", "steady", wp007Bindings, ["api-parent"]));
  assert.throws(() => executionPolicies(ACCOUNT, "identity-session", "steady", wp007Bindings, ["certificate"]));
  assert.throws(() => executionPolicies(ACCOUNT, "identity-session", "steady", {
    ...wp007Bindings, webAclArn: wp007Bindings.webAclArn.replace(ACCOUNT, "999999999999"),
  }));
});

test("combined steady state grants only approved management in representative policy evaluations", () => {
  const policy = joined(executionPolicies(ACCOUNT, "identity-session", "steady", wp007Bindings));
  const { tables, sessionAuthTable, policies } = identitySessionResources(ACCOUNT);
  const healthRole = `arn:aws:iam::${ACCOUNT}:role/shelfstate-v4-dev-health`;
  const api = `arn:aws:apigateway:us-west-2::/apis/${wp007Bindings.apiId}`;
  const distribution = `arn:aws:cloudfront::${ACCOUNT}:distribution/${wp007Bindings.distributionId}`;
  const lambda = { "iam:PassedToService": "lambda.amazonaws.com" };
  const allowed = [
    ...tables.flatMap(table => [["dynamodb:DescribeTable", table], ["dynamodb:UpdateContinuousBackups", table]]),
    ...policies.flatMap(arn => [["iam:GetPolicy", arn], ["iam:CreatePolicyVersion", arn],
      ["iam:SetDefaultPolicyVersion", arn], ["iam:DeletePolicyVersion", arn]]),
    ["dynamodb:UpdateTimeToLive", sessionAuthTable],
    ["cloudfront:UpdateDistribution", distribution],
    ["cloudfront:UpdateOriginAccessControl", `arn:aws:cloudfront::${ACCOUNT}:origin-access-control/${wp007Bindings.oacId}`],
    ["cloudfront:UpdateResponseHeadersPolicy", `arn:aws:cloudfront::${ACCOUNT}:response-headers-policy/${wp007Bindings.responseHeadersPolicyId}`],
    ["s3:GetBucketPolicy", `arn:aws:s3:::shelfstate-v4-dev-static-${ACCOUNT}-us-west-2`],
    ["apigateway:PATCH", `${api}/routes/${wp007Bindings.routeId}`],
    ["lambda:GetFunction", `arn:aws:lambda:us-west-2:${ACCOUNT}:function:shelfstate-v4-dev-health`],
    ["logs:PutRetentionPolicy", `arn:aws:logs:us-west-2:${ACCOUNT}:log-group:/aws/lambda/shelfstate-v4-dev-health`],
    ["iam:GetRole", healthRole],
    ["iam:PassRole", healthRole, lambda],
    ["wafv2:GetWebACL", wp007Bindings.webAclArn],
  ];
  for (const [action, resource, context] of allowed) assert.ok(allows(policy, action, resource, context), action);
  const denied = [
    ...tables.flatMap(table => ["CreateTable", "DeleteTable", "GetItem", "PutItem", "UpdateItem", "DeleteItem", "Query", "Scan"]
      .map(action => [`dynamodb:${action}`, table, {
        "aws:RequestTag/Project": "ShelfState", "aws:RequestTag/Environment": "dev", "aws:RequestTag/ManagedBy": "AWS-CDK",
      }])),
    ...policies.flatMap(arn => [["iam:CreatePolicy", arn], ["iam:DeletePolicy", arn]]),
    ["iam:AttachRolePolicy", healthRole], ["iam:DetachRolePolicy", healthRole], ["iam:CreateRole", healthRole],
    ["iam:PassRole", healthRole, { "iam:PassedToService": "ecs-tasks.amazonaws.com" }],
    ["iam:PassRole", `${healthRole}-unrelated`, lambda],
    ["iam:CreatePolicyVersion", policies[0].replace("dev", "prod")],
    ["dynamodb:DescribeTable", tables[0].replace("dev", "prod")],
    ["dynamodb:UpdateTable", tables[0].replace(ACCOUNT, "999999999999")],
    ["dynamodb:UpdateTimeToLive", tables[0]],
    ["cloudfront:UpdateDistribution", `${distribution}-unrelated`], ["cloudfront:CreateDistribution", "*"],
    ["apigateway:PATCH", `${api}-unrelated`], ["apigateway:POST", "arn:aws:apigateway:us-west-2::/apis"],
    ["wafv2:GetWebACL", wp007Bindings.webAclArn.replace(ACCOUNT, "999999999999")],
    ["wafv2:UpdateWebACL", wp007Bindings.webAclArn],
  ];
  for (const [action, resource, context] of denied) assert.equal(allows(policy, action, resource, context), false, action);
  assert.equal(decision(policy, "iam:DeleteRolePermissionsBoundary", healthRole), "explicitDeny");
  assert.equal(decision(policy, "iam:DeletePolicy", `arn:aws:iam::${ACCOUNT}:policy/ShelfStateV4DevHealthBoundary`), "explicitDeny");
});

test("existing deployment phase policy outputs and caller transitions retain their baseline digests", () => {
  const phaseDigests = ["api-parent", "api-children", "edge", "edge-static", "edge-routing", "edge-waf", "certificate"].flatMap(phase =>
    ["initialization", "steady"].map(mode => hashObject(executionPolicies(ACCOUNT, phase, mode, wp007Bindings,
      phase === "api-children" ? ["api-parent"] : []))));
  const initDigest = hashObject(executionPolicies(ACCOUNT, "identity-session", "initialization", {}));
  const callerDigest = hashObject(["us-west-2", "us-east-1"].flatMap(region =>
    ["prepare", "execute", "closed"].map(state => callerWindowCap(ACCOUNT, "identity-session", region, changeSetName, state))));
  assert.equal(hashObject([...phaseDigests, initDigest, callerDigest]),
    "4028d12b98b089bc0bd81b8aa6af4adb17b223091bf1ef7df66af8861dcf1eac");
});

test("WP-007 phase compositions do not inherit WP-008 table or policy authority", () => {
  for (const phase of ["edge", "edge-static", "edge-routing", "edge-waf",
    "api-parent", "api-children", "certificate"]) {
    const retained = phase === "api-children" ? ["api-parent"] : [];
    const serialized = JSON.stringify(executionPolicies(
      ACCOUNT,
      phase,
      "initialization",
      wp007Bindings,
      retained,
    ));
    assert.equal(serialized.includes("shelfstate-v4-dev-identity-account"), false, phase);
    assert.equal(serialized.includes("shelfstate-v4-dev-session-auth"), false, phase);
    assert.equal(serialized.includes("identity-map-persistence"), false, phase);
    assert.equal(serialized.includes("auth-transaction-persistence"), false, phase);
  }
});

test("review rejects inventory, protection, attachment, capability, and failure-mode changes", () => {
  const mutations = [
    value => {
      const template = JSON.parse(value.bundle.templateBytes);
      template.Resources.Extra = structuredClone(template.Resources.IdentityAccountTable);
      value.bundle.templateBytes = Buffer.from(JSON.stringify(template));
    },
    value => {
      const template = JSON.parse(value.bundle.templateBytes);
      template.Resources.IdentityAccountTable.Properties.DeletionProtectionEnabled = false;
      value.bundle.templateBytes = Buffer.from(JSON.stringify(template));
    },
    value => {
      const template = JSON.parse(value.bundle.templateBytes);
      template.Resources.SessionAuthTable.DeletionPolicy = "Delete";
      value.bundle.templateBytes = Buffer.from(JSON.stringify(template));
    },
    value => {
      const template = JSON.parse(value.bundle.templateBytes);
      template.Resources.IdentityMapPolicy.Properties.Roles = ["ExistingRole"];
      value.bundle.templateBytes = Buffer.from(JSON.stringify(template));
    },
    value => { value.bundle.changeSet.capabilities = ["CAPABILITY_IAM"]; },
    value => { value.bundle.changeSet.changeSetType = "UPDATE"; },
    value => { value.bundle.changeSet.onStackFailure = "DELETE"; },
    value => { value.bundle.changeSet.changes[0].replacement = "True"; },
    value => { value.bundle.changeSet.changes[0].action = "Remove"; },
    value => { value.bundle.executionOptions.retainExceptOnCreate = true; },
    value => { value.bundle.executionOptions.disableRollbackSpecified = true; },
  ];
  for (const mutate of mutations) {
    const value = evidence();
    mutate(value);
    repin(value);
    assert.throws(() => check(value));
  }
});

test("review rejects account, region, stack, and wp007 change-set substitutions", () => {
  for (const mutate of [
    value => { value.approval.account = "999999999999"; },
    value => { value.approval.region = "us-east-1"; },
    value => { value.approval.stack = "shelfstate-v4-prod-identity-session"; },
    value => {
      const oldName = value.bundle.changeSet.name;
      const newName = `wp007-${"a".repeat(64)}`;
      value.bundle.changeSet.name = newName;
      value.bundle.changeSet.id = value.bundle.changeSet.id.replace(oldName, newName);
      value.bundle.executeChangeSetId = value.bundle.changeSet.id;
    },
  ]) {
    const value = evidence();
    mutate(value);
    repin(value);
    assert.throws(() => check(value));
  }
});

test("wp008 caller windows separate preparation, execution, and closure", () => {
  const t = target(ACCOUNT, "identity-session");
  const stack = t.stackArn.replace("*", "synthetic-stack-id");
  const context = {
    "cloudformation:RoleArn": t.executionRole,
    "cloudformation:ChangeSetName": changeSetName,
  };
  const prepare = callerWindowCap(
    ACCOUNT,
    "identity-session",
    "us-west-2",
    changeSetName,
    "prepare",
  );
  assert.equal(allows(prepare, "cloudformation:CreateChangeSet", stack, context), true);
  assert.equal(decision(prepare, "cloudformation:ExecuteChangeSet", stack, context), "explicitDeny");
  const execute = callerWindowCap(
    ACCOUNT,
    "identity-session",
    "us-west-2",
    changeSetName,
    "execute",
  );
  assert.equal(allows(execute, "cloudformation:ExecuteChangeSet", stack, context), true);
  assert.equal(decision(execute, "cloudformation:CreateChangeSet", stack, context), "explicitDeny");
  const closed = callerWindowCap(
    ACCOUNT,
    "identity-session",
    "us-west-2",
    changeSetName,
    "closed",
  );
  assert.equal(decision(closed, "cloudformation:ExecuteChangeSet", stack, context), "explicitDeny");
  assert.throws(() => callerWindowCap(
    ACCOUNT,
    "identity-session",
    "us-west-2",
    `wp007-${"a".repeat(64)}`,
    "prepare",
  ));
});
