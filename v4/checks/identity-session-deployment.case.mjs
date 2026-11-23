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
    for (const action of ["iam:GetPolicy", "iam:GetPolicyVersion", "iam:ListPolicyVersions",
      "iam:ListEntitiesForPolicy", "iam:CreatePolicyVersion", "iam:SetDefaultPolicyVersion",
      "iam:DeletePolicyVersion", "iam:DeletePolicy"]) {
      assert.equal(allows(initial, action, policy), true, action);
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

test("WP-007 phase compositions do not inherit WP-008 table or policy authority", () => {
  const bindings = {
    apiId: "apitest",
    integrationId: "integrationtest",
    routeId: "routetest",
    distributionId: "DISTTEST",
    oacId: "OACTEST",
    responseHeadersPolicyId: "headers-test",
    certificateId: "certificate-test",
    webAclId: "11111111-2222-3333-4444-555555555555",
    webAclArn: `arn:aws:wafv2:us-east-1:${ACCOUNT}:global/webacl/shelfstate-v4-dev-edge/11111111-2222-3333-4444-555555555555`,
    zoneId: "ZTESTONLY",
  };
  for (const phase of ["edge", "edge-static", "edge-routing", "edge-waf",
    "api-parent", "api-children", "certificate"]) {
    const retained = phase === "api-children" ? ["api-parent"] : [];
    const serialized = JSON.stringify(executionPolicies(
      ACCOUNT,
      phase,
      "initialization",
      bindings,
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
