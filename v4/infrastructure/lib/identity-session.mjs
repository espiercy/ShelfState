import assert from "node:assert/strict";
import { RemovalPolicy } from "aws-cdk-lib";
import { CfnTable } from "aws-cdk-lib/aws-dynamodb";
import { CfnManagedPolicy } from "aws-cdk-lib/aws-iam";
import { resourceName } from "./naming.mjs";
import {
  CLEANUP_TTL_ATTRIBUTE,
  FAMILY_POLICY_DEFINITIONS,
  IDENTITY_ACCOUNT_TABLE_PURPOSE,
  SESSION_AUTH_TABLE_PURPOSE,
} from "./identity-session-model.mjs";

export {
  CLEANUP_TTL_ATTRIBUTE,
  FAMILY_POLICY_DEFINITIONS,
  IDENTITY_ACCOUNT_TABLE_PURPOSE,
  SESSION_AUTH_TABLE_PURPOSE,
} from "./identity-session-model.mjs";

function stable(resource, logicalId) {
  resource.overrideLogicalId(logicalId);
  return resource;
}

function addTable(stack, logicalId, tableName, ttlAttribute) {
  const table = stable(
    new CfnTable(stack, logicalId, {
      attributeDefinitions: [{ attributeName: "pk", attributeType: "S" }],
      billingMode: "PAY_PER_REQUEST",
      deletionProtectionEnabled: true,
      keySchema: [{ attributeName: "pk", keyType: "HASH" }],
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
        recoveryPeriodInDays: 35,
      },
      sseSpecification: {
        sseEnabled: true,
        sseType: "KMS",
      },
      tableClass: "STANDARD",
      tableName,
      ...(ttlAttribute
        ? {
            timeToLiveSpecification: {
              attributeName: ttlAttribute,
              enabled: true,
            },
          }
        : {}),
    }),
    logicalId,
  );
  table.applyRemovalPolicy(RemovalPolicy.RETAIN);
  table.addMetadata("ShelfStateStatefulPolicy", "retained");
  return table;
}

function addFamilyPolicy(stack, config, definition, table) {
  const policy = stable(
    new CfnManagedPolicy(stack, definition.logicalId, {
      description: `ShelfState V4 ${config.environmentName} ${definition.family} persistence access; unattached until its owning application component exists.`,
      managedPolicyName: resourceName(
        config,
        `${definition.family}-persistence`,
        128,
      ),
      policyDocument: {
        Statement: [
          {
            Action: [...definition.actions],
            Condition: {
              "ForAllValues:StringLike": {
                "dynamodb:LeadingKeys": [`${definition.keyPrefix}*`],
              },
            },
            Effect: "Allow",
            Resource: table.attrArn,
          },
        ],
        Version: "2012-10-17",
      },
    }),
    definition.logicalId,
  );
  policy.addResourceDependency(table);
  return policy;
}

export function addIdentitySessionPersistence(stack, config) {
  assert.equal(stack.region, config.primaryRegion);
  assert.ok(["dev", "prod"].includes(config.environmentName));

  const identityAccount = addTable(
    stack,
    "IdentityAccountTable",
    resourceName(config, IDENTITY_ACCOUNT_TABLE_PURPOSE, 255),
  );
  const sessionAuth = addTable(
    stack,
    "SessionAuthTable",
    resourceName(config, SESSION_AUTH_TABLE_PURPOSE, 255),
    CLEANUP_TTL_ATTRIBUTE,
  );
  const tables = { identityAccount, sessionAuth };

  const policies = new Map();
  for (const definition of FAMILY_POLICY_DEFINITIONS) {
    policies.set(
      definition.family,
      addFamilyPolicy(stack, config, definition, tables[definition.table]),
    );
  }

  return Object.freeze({ identityAccount, policies, sessionAuth });
}
