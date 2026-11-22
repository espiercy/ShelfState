import assert from "node:assert/strict";
import test from "node:test";
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { assertIdentitySessionTemplate } from "../infrastructure/bootstrap/identity-session-contract.mjs";
import {
  FAMILY_POLICY_DEFINITIONS,
} from "../infrastructure/lib/identity-session.mjs";
import { resolveEnvironmentConfig } from "../infrastructure/lib/environment.mjs";
import { createEnvironmentTopology } from "../infrastructure/lib/topology.mjs";

function synthesizedPolicies() {
  const app = new App();
  const config = resolveEnvironmentConfig("dev");
  const topology = createEnvironmentTopology(app, config, {
    implementationPhase: "identity-session",
  });
  const resources = Template.fromStack(topology.stacks.get("identity-session")).toJSON().Resources;
  return new Map(
    FAMILY_POLICY_DEFINITIONS.map((definition) => [
      definition.family,
      resources[definition.logicalId].Properties.PolicyDocument.Statement[0],
    ]),
  );
}

function allows(statement, action, tableLogicalId, leadingKey) {
  const expectedResource = statement.Resource?.["Fn::GetAtt"]?.[0];
  const patterns = statement.Condition?.["ForAllValues:StringLike"]?.["dynamodb:LeadingKeys"] ?? [];
  return (
    statement.Effect === "Allow" &&
    statement.Action.includes(action) &&
    expectedResource === tableLogicalId &&
    patterns.some((pattern) => {
      const prefix = pattern.endsWith("*") ? pattern.slice(0, -1) : pattern;
      return leadingKey.startsWith(prefix);
    })
  );
}

test("each logical family policy permits only its table, prefix, and minimum actions", () => {
  const policies = synthesizedPolicies();
  assert.equal(
    allows(policies.get("identity-map"), "dynamodb:GetItem", "IdentityAccountTable", "IDENTITY#abc"),
    true,
  );
  assert.equal(
    allows(policies.get("account"), "dynamodb:UpdateItem", "IdentityAccountTable", "ACCOUNT#abc"),
    true,
  );
  assert.equal(
    allows(policies.get("session"), "dynamodb:DeleteItem", "SessionAuthTable", "SESSION#abc"),
    true,
  );
  assert.equal(
    allows(policies.get("auth-transaction"), "dynamodb:UpdateItem", "SessionAuthTable", "AUTH_TRANSACTION#abc"),
    true,
  );
});

test("simulated IAM evaluation denies cross-family, cross-table, scan, query, and administration", () => {
  const policies = synthesizedPolicies();
  const cases = [
    ["identity-map", "dynamodb:GetItem", "IdentityAccountTable", "ACCOUNT#abc"],
    ["account", "dynamodb:GetItem", "SessionAuthTable", "ACCOUNT#abc"],
    ["session", "dynamodb:GetItem", "SessionAuthTable", "AUTH_TRANSACTION#abc"],
    ["auth-transaction", "dynamodb:GetItem", "IdentityAccountTable", "AUTH_TRANSACTION#abc"],
    ["identity-map", "dynamodb:Scan", "IdentityAccountTable", "IDENTITY#abc"],
    ["account", "dynamodb:Query", "IdentityAccountTable", "ACCOUNT#abc"],
    ["session", "dynamodb:UpdateTable", "SessionAuthTable", "SESSION#abc"],
    ["auth-transaction", "dynamodb:DeleteItem", "SessionAuthTable", "AUTH_TRANSACTION#abc"],
  ];
  for (const [family, action, table, key] of cases) {
    assert.equal(allows(policies.get(family), action, table, key), false, `${family} unexpectedly allowed ${action}`);
  }
});

test("policies are unattached definitions and grant no recovery or backup authority", () => {
  const policies = synthesizedPolicies();
  for (const statement of policies.values()) {
    assert.equal(statement.Action.some((action) => action.includes("*")), false);
    assert.equal(statement.Action.some((action) => action.startsWith("backup:")), false);
    assert.equal(statement.Action.some((action) => action === "dynamodb:RestoreTableToPointInTime"), false);
    assert.deepEqual(Object.keys(statement.Condition), ["ForAllValues:StringLike"]);
  }
});

test("IAM template contract rejects an appended broad allow statement", () => {
  const app = new App();
  const config = resolveEnvironmentConfig("dev");
  const topology = createEnvironmentTopology(app, config, {
    implementationPhase: "identity-session",
  });
  const template = Template.fromStack(topology.stacks.get("identity-session")).toJSON();
  template.Resources.IdentityMapPolicy.Properties.PolicyDocument.Statement.push({
    Action: "dynamodb:*",
    Effect: "Allow",
    Resource: "*",
  });
  assert.throws(
    () => assertIdentitySessionTemplate(template, config),
    /2 !== 1/,
  );
});
