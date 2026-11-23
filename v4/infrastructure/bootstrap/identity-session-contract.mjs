import assert from "node:assert/strict";
import {
  CLEANUP_TTL_ATTRIBUTE,
  FAMILY_POLICY_DEFINITIONS,
  IDENTITY_ACCOUNT_TABLE_PURPOSE,
  SESSION_AUTH_TABLE_PURPOSE,
} from "../lib/identity-session-model.mjs";
import { equal, object } from "../../scripts/release/schema.mjs";

export const IDENTITY_SESSION_REVIEW_SCHEMA =
  "shelfstate.wp008-identity-session-review/v1";

export function identitySessionTypes(phase) {
  assert.equal(phase, "identity-session", "Unsupported identity-session phase");
  return {
    IdentityAccountTable: "AWS::DynamoDB::Table",
    SessionAuthTable: "AWS::DynamoDB::Table",
    IdentityMapPolicy: "AWS::IAM::ManagedPolicy",
    AccountPolicy: "AWS::IAM::ManagedPolicy",
    SessionPolicy: "AWS::IAM::ManagedPolicy",
    AuthTransactionPolicy: "AWS::IAM::ManagedPolicy",
  };
}

function resource(template, logicalId, type) {
  const value = template.Resources?.[logicalId];
  assert.equal(value?.Type, type, `${logicalId} must be ${type}`);
  return value;
}

function constructId(config) {
  const environment = `${config.environmentName[0].toUpperCase()}${config.environmentName.slice(1)}`;
  return `ShelfStateV4${environment}IdentitySession`;
}

function assertCdkPathMetadata(metadata, config, logicalId, requiredMetadata = {}) {
  const expectedPath = `${constructId(config)}/${logicalId}`;
  assert.deepEqual(
    metadata,
    Object.hasOwn(metadata, "aws:cdk:path")
      ? { "aws:cdk:path": expectedPath, ...requiredMetadata }
      : requiredMetadata,
  );
}

function assertTable(value, config, logicalId, tableName, hasTtl) {
  assert.deepEqual(Object.keys(value).sort(), [
    "DeletionPolicy",
    "Metadata",
    "Properties",
    "Type",
    "UpdateReplacePolicy",
  ]);
  assert.equal(value.DeletionPolicy, "Retain");
  assert.equal(value.UpdateReplacePolicy, "Retain");
  assertCdkPathMetadata(value.Metadata, config, logicalId, {
    ShelfStateStatefulPolicy: "retained",
  });
  assert.deepEqual(value.Properties.AttributeDefinitions, [
    { AttributeName: "pk", AttributeType: "S" },
  ]);
  assert.deepEqual(value.Properties.KeySchema, [
    { AttributeName: "pk", KeyType: "HASH" },
  ]);
  assert.deepEqual(
    Object.keys(value.Properties).sort(),
    [
      "AttributeDefinitions",
      "BillingMode",
      "DeletionProtectionEnabled",
      "KeySchema",
      "PointInTimeRecoverySpecification",
      "SSESpecification",
      "TableClass",
      "TableName",
      "Tags",
      ...(hasTtl ? ["TimeToLiveSpecification"] : []),
    ].sort(),
  );
  assert.equal(value.Properties.TableName, tableName);
  assert.equal(value.Properties.TableClass, "STANDARD");
  assert.equal(value.Properties.BillingMode, "PAY_PER_REQUEST");
  assert.equal(value.Properties.DeletionProtectionEnabled, true);
  assert.deepEqual(value.Properties.PointInTimeRecoverySpecification, {
    PointInTimeRecoveryEnabled: true,
    RecoveryPeriodInDays: 35,
  });
  assert.deepEqual(value.Properties.SSESpecification, {
    SSEEnabled: true,
    SSEType: "KMS",
  });
  assert.equal(Object.hasOwn(value.Properties.SSESpecification, "KMSMasterKeyId"), false);
  assert.equal(Object.hasOwn(value.Properties, "GlobalSecondaryIndexes"), false);
  assert.equal(Object.hasOwn(value.Properties, "StreamSpecification"), false);
  assert.deepEqual(value.Properties.Tags, [
    { Key: "Environment", Value: config.environmentName },
    { Key: "ManagedBy", Value: "AWS-CDK" },
    { Key: "Project", Value: "ShelfState" },
  ]);
  if (hasTtl) {
    assert.deepEqual(value.Properties.TimeToLiveSpecification, {
      AttributeName: CLEANUP_TTL_ATTRIBUTE,
      Enabled: true,
    });
  } else {
    assert.equal(Object.hasOwn(value.Properties, "TimeToLiveSpecification"), false);
  }
}

export function assertIdentitySessionTemplate(template, config) {
  assert.equal(Object.keys(template.Resources ?? {}).length, 6);
  const identityAccount = resource(template, "IdentityAccountTable", "AWS::DynamoDB::Table");
  const sessionAuth = resource(template, "SessionAuthTable", "AWS::DynamoDB::Table");
  assertTable(
    identityAccount,
    config,
    "IdentityAccountTable",
    `${config.namePrefix}-${IDENTITY_ACCOUNT_TABLE_PURPOSE}`,
    false,
  );
  assertTable(
    sessionAuth,
    config,
    "SessionAuthTable",
    `${config.namePrefix}-${SESSION_AUTH_TABLE_PURPOSE}`,
    true,
  );

  for (const definition of FAMILY_POLICY_DEFINITIONS) {
    const policy = resource(template, definition.logicalId, "AWS::IAM::ManagedPolicy");
    assert.deepEqual(
      Object.keys(policy).sort(),
      ["DependsOn", ...(Object.hasOwn(policy, "Metadata") ? ["Metadata"] : []), "Properties", "Type"].sort(),
    );
    if (policy.Metadata) {
      assertCdkPathMetadata(policy.Metadata, config, definition.logicalId);
    }
    assert.deepEqual(Object.keys(policy.Properties).sort(), [
      "Description",
      "ManagedPolicyName",
      "PolicyDocument",
    ]);
    assert.equal(policy.Properties.Roles, undefined);
    assert.equal(policy.Properties.Users, undefined);
    assert.equal(policy.Properties.Groups, undefined);
    assert.deepEqual(Object.keys(policy.Properties.PolicyDocument).sort(), ["Statement", "Version"]);
    assert.equal(policy.Properties.PolicyDocument.Statement.length, 1);
    const [statement] = policy.Properties.PolicyDocument.Statement;
    assert.deepEqual(Object.keys(statement).sort(), ["Action", "Condition", "Effect", "Resource"]);
    assert.deepEqual(statement.Action, [...definition.actions]);
    assert.equal(statement.Effect, "Allow");
    assert.deepEqual(statement.Condition, {
      "ForAllValues:StringLike": {
        "dynamodb:LeadingKeys": [`${definition.keyPrefix}*`],
      },
    });
    assert.deepEqual(statement.Resource, {
      "Fn::GetAtt": [
        definition.table === "identityAccount"
          ? "IdentityAccountTable"
          : "SessionAuthTable",
        "Arn",
      ],
    });
  }
}

export function assertIdentitySessionReviewTemplate(template, account, phase) {
  assert.match(account, /^\d{12}$/, "Exact development account required");
  identitySessionTypes(phase);
  object(template, ["Description", "Metadata", "Resources", "Parameters", "Rules"],
    "Exact identity-session template envelope");
  assert.equal(template.Description,
    "ShelfState V4 dev identity/session persistence (WP-008 repository candidate; not deployed)");
  equal(template.Metadata, { ShelfState: {
    Capability: "identity-session",
    Environment: "dev",
    Region: "us-west-2",
    WorkPackage: "WP-008",
    ImplementationPhase: "identity-session",
  } }, "Exact identity-session topology metadata");
  equal(template.Parameters, { BootstrapVersion: {
    Type: "AWS::SSM::Parameter::Value<String>",
    Default: "/cdk-bootstrap/hnb659fds/version",
    Description: "Version of the CDK Bootstrap resources in this environment, automatically retrieved from SSM Parameter Store. [cdk:skip]",
  } }, "Exact bootstrap parameter");
  equal(template.Rules, { CheckBootstrapVersion: { Assertions: [{
    Assert: { "Fn::Not": [{ "Fn::Contains": [["1", "2", "3", "4", "5"], { Ref: "BootstrapVersion" }] }] },
    AssertDescription: "CDK bootstrap stack version 6 required. Please run 'cdk bootstrap' with a recent version of the CDK CLI.",
  }] } }, "Exact bootstrap rule");
  assertIdentitySessionTemplate(template, {
    accountId: account,
    accountSource: "SHELFSTATE_DEV_AWS_ACCOUNT_ID",
    edgeCertificateRegion: "us-east-1",
    environmentName: "dev",
    namePrefix: "shelfstate-v4-dev",
    primaryRegion: "us-west-2",
    project: "ShelfState",
  });
}
