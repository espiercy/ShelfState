import assert from "node:assert/strict";
import {
  CLEANUP_TTL_ATTRIBUTE,
  FAMILY_POLICY_DEFINITIONS,
  IDENTITY_ACCOUNT_TABLE_PURPOSE,
  SESSION_AUTH_TABLE_PURPOSE,
} from "../lib/identity-session-model.mjs";

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
