import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ALLOWED_WILDCARD_RESOURCE_ACTIONS,
  CONTENT_ACCESS_ACTIONS,
  createHumanAccessPermissionSets,
  HUMAN_ACCESS_ASSIGNMENTS,
  HUMAN_ACCESS_POLICY_MODEL_VERSION,
  HUMAN_ACCESS_SESSION_DURATION,
  PROHIBITED_API_CAPABILITY_AUTHORIZATION,
  RECOVERY_ACTIVATION_WORK_PACKAGE,
} from "../security/human-access-policies.mjs";

const instanceId = `ssoins-${"a".repeat(16)}`;
const identityId = (character) =>
  `${character.repeat(8)}-${character.repeat(4)}-${character.repeat(4)}-${character.repeat(4)}-${character.repeat(12)}`;
const runtimeBindings = Object.freeze({
  accountId: "1".repeat(12),
  groupIds: Object.freeze({
    ShelfStateAccountAdmins: identityId("a"),
    ShelfStateOperators: identityId("b"),
    ShelfStateRecovery: identityId("c"),
  }),
  identityCenterInstanceArn: `arn:aws:sso:::instance/${instanceId}`,
  identityStoreId: `d-${"d".repeat(10)}`,
  permissionSetArns: Object.freeze({
    ShelfStateAccountAdmin: `arn:aws:sso:::permissionSet/${instanceId}/ps-${"e".repeat(16)}`,
    ShelfStateOperator: `arn:aws:sso:::permissionSet/${instanceId}/ps-${"f".repeat(16)}`,
    ShelfStateRecovery: `arn:aws:sso:::permissionSet/${instanceId}/ps-${"a".repeat(16)}`,
  }),
  principalIds: Object.freeze({
    PrimaryHumanPrincipal: identityId("d"),
    RecoveryHumanPrincipal: identityId("e"),
  }),
});
const permissionSetMap = createHumanAccessPermissionSets(runtimeBindings);
const permissionSets = Object.values(permissionSetMap);
const forbiddenManagedPolicies = new Set([
  "AdministratorAccess",
  "PowerUserAccess",
  "ReadOnlyAccess",
]);

function statements(permissionSet, effect) {
  return permissionSet.inlinePolicy.Statement.filter(
    (statement) => statement.Effect === effect,
  );
}

function actions(permissionSet, effect) {
  return new Set(statements(permissionSet, effect).flatMap((statement) => statement.Action));
}

function resourceValues(statement) {
  return Array.isArray(statement.Resource)
    ? statement.Resource
    : [statement.Resource];
}

function actionIsDenied(action, deniedActions) {
  return [...deniedActions].some((deniedAction) => {
    if (!deniedAction.endsWith("*")) return deniedAction === action;
    return action.startsWith(deniedAction.slice(0, -1));
  });
}

test("three symbolic groups and permission sets remain distinct", () => {
  assert.equal(HUMAN_ACCESS_POLICY_MODEL_VERSION, "wp-005c1-v1");
  assert.equal(HUMAN_ACCESS_ASSIGNMENTS.length, 3);
  assert.equal(new Set(HUMAN_ACCESS_ASSIGNMENTS.map(({ group }) => group)).size, 3);
  assert.equal(
    new Set(HUMAN_ACCESS_ASSIGNMENTS.map(({ permissionSet }) => permissionSet)).size,
    3,
  );
  assert.deepEqual(
    HUMAN_ACCESS_ASSIGNMENTS.map(({ principal, permissionSet }) => ({
      permissionSet,
      principal,
    })),
    [
      {
        permissionSet: "ShelfStateAccountAdmin",
        principal: "PrimaryHumanPrincipal",
      },
      {
        permissionSet: "ShelfStateOperator",
        principal: "PrimaryHumanPrincipal",
      },
      {
        permissionSet: "ShelfStateRecovery",
        principal: "RecoveryHumanPrincipal",
      },
    ],
  );
});

test("runtime materialization fails closed on absent or malformed AWS bindings", () => {
  assert.throws(() => createHumanAccessPermissionSets({}), /accountId/);
  assert.throws(
    () => createHumanAccessPermissionSets({ ...runtimeBindings, accountId: "*" }),
    /accountId/,
  );
  assert.throws(
    () =>
      createHumanAccessPermissionSets({
        ...runtimeBindings,
        permissionSetArns: {
          ...runtimeBindings.permissionSetArns,
          ShelfStateOperator: "*",
        },
      }),
    /permissionSetArns\.ShelfStateOperator/,
  );
});

test("every human permission set has a one-hour session and no broad managed policy", () => {
  for (const permissionSet of permissionSets) {
    assert.equal(permissionSet.sessionDuration, HUMAN_ACCESS_SESSION_DURATION);
    assert.equal(permissionSet.sessionDuration, "PT1H");
    assert.deepEqual(permissionSet.managedPolicies, []);
    for (const policy of permissionSet.managedPolicies) {
      assert.equal(forbiddenManagedPolicies.has(policy), false);
    }
  }
});

test("the content-access deny invariant applies to every permission set", () => {
  for (const permissionSet of permissionSets) {
    const denied = actions(permissionSet, "Deny");
    for (const action of CONTENT_ACCESS_ACTIONS) {
      assert.equal(
        denied.has(action),
        true,
        `${permissionSet.name} must deny ${action}`,
      );
    }
  }
});

test("prohibited API capabilities map to valid IAM authorization actions", () => {
  assert.deepEqual(
    PROHIBITED_API_CAPABILITY_AUTHORIZATION["dynamodb:TransactGetItems"],
    ["dynamodb:GetItem"],
  );
  assert.deepEqual(
    PROHIBITED_API_CAPABILITY_AUTHORIZATION["dynamodb:ExecuteStatement"],
    [
      "dynamodb:PartiQLSelect",
      "dynamodb:PartiQLInsert",
      "dynamodb:PartiQLUpdate",
      "dynamodb:PartiQLDelete",
    ],
  );
  assert.deepEqual(
    PROHIBITED_API_CAPABILITY_AUTHORIZATION["dynamodb:BatchExecuteStatement"],
    PROHIBITED_API_CAPABILITY_AUTHORIZATION["dynamodb:ExecuteStatement"],
  );
  assert.deepEqual(
    PROHIBITED_API_CAPABILITY_AUTHORIZATION["dynamodb:ExecuteTransaction"],
    PROHIBITED_API_CAPABILITY_AUTHORIZATION["dynamodb:ExecuteStatement"],
  );
  assert.deepEqual(
    PROHIBITED_API_CAPABILITY_AUTHORIZATION["s3:SelectObjectContent"],
    ["s3:GetObject"],
  );

  const invalidApiOperationNames = [
    "dynamodb:TransactGetItems",
    "dynamodb:ExecuteStatement",
    "dynamodb:BatchExecuteStatement",
    "dynamodb:ExecuteTransaction",
    "s3:SelectObjectContent",
  ];
  for (const invalidAction of invalidApiOperationNames) {
    assert.equal(CONTENT_ACCESS_ACTIONS.includes(invalidAction), false);
  }

  for (const permissionSet of permissionSets) {
    const denied = actions(permissionSet, "Deny");
    for (const authorizationActions of Object.values(
      PROHIBITED_API_CAPABILITY_AUTHORIZATION,
    )) {
      for (const authorizationAction of authorizationActions) {
        assert.equal(
          actionIsDenied(authorizationAction, denied),
          true,
          `${permissionSet.name} must deny ${authorizationAction}`,
        );
      }
    }
  }
});

test("AccountAdmin permits scoped identity control but not application or recovery authority", () => {
  const permissionSet = permissionSetMap.ShelfStateAccountAdmin;
  const allowed = actions(permissionSet, "Allow");
  const denied = actions(permissionSet, "Deny");

  for (const action of [
    "iam:CreateRole",
    "iam:CreatePolicy",
    "identitystore:CreateGroupMembership",
    "sso:CreateAccountAssignment",
    "sso:PutInlinePolicyToPermissionSet",
    "access-analyzer:ValidatePolicy",
  ]) {
    assert.equal(allowed.has(action), true, `AccountAdmin must allow ${action}`);
  }

  for (const action of [
    "backup:StartRestoreJob",
    "cloudformation:CreateStack",
    "iam:PassRole",
    "sts:AssumeRole",
  ]) {
    assert.equal(allowed.has(action), false, `AccountAdmin must not allow ${action}`);
    assert.equal(denied.has(action), true, `AccountAdmin must deny ${action}`);
  }
});

test("AccountAdmin resource-scopes all mutable IAM and identity administration", () => {
  const permissionSet = permissionSetMap.ShelfStateAccountAdmin;
  const mutablePrefixes = new Set(["iam", "identitystore", "sso"]);
  const wildcardAllowlist = new Set(ALLOWED_WILDCARD_RESOURCE_ACTIONS);

  for (const statement of statements(permissionSet, "Allow")) {
    const resources = resourceValues(statement);
    for (const action of statement.Action) {
      const [prefix] = action.split(":");
      if (!mutablePrefixes.has(prefix) || wildcardAllowlist.has(action)) continue;
      assert.equal(
        resources.includes("*"),
        false,
        `${action} must use runtime-bound resource ARNs`,
      );
    }
  }

  const rolePolicyAdmin = permissionSet.inlinePolicy.Statement.find(
    ({ Sid }) => Sid === "AllowShelfStateRolePolicyAdministration",
  );
  assert.ok(rolePolicyAdmin);
  assert.deepEqual(resourceValues(rolePolicyAdmin), [
    `arn:aws:iam::${runtimeBindings.accountId}:policy/ShelfState*`,
    `arn:aws:iam::${runtimeBindings.accountId}:role/ShelfState*`,
  ]);

  const membershipAdmin = permissionSet.inlinePolicy.Statement.find(
    ({ Sid }) => Sid === "AllowShelfStateMembershipAdministration",
  );
  assert.ok(membershipAdmin);
  const membershipResources = resourceValues(membershipAdmin);
  for (const id of [
    ...Object.values(runtimeBindings.groupIds),
    ...Object.values(runtimeBindings.principalIds),
  ]) {
    assert.equal(membershipResources.some((resource) => resource.endsWith(`/${id}`)), true);
  }
});

test("Operator is limited to current safe metadata and lacks privileged authority", () => {
  const permissionSet = permissionSetMap.ShelfStateOperator;
  const allowed = actions(permissionSet, "Allow");
  const denied = actions(permissionSet, "Deny");

  assert.deepEqual(
    [...allowed].sort(),
    [
      "cloudtrail:LookupEvents",
      "cloudwatch:DescribeAlarmHistory",
      "cloudwatch:DescribeAlarms",
      "cloudwatch:ListMetrics",
    ],
  );

  for (const action of [
    "backup:StartRestoreJob",
    "cloudformation:CreateStack",
    "iam:PassRole",
    "sts:AssumeRole",
  ]) {
    assert.equal(allowed.has(action), false, `Operator must not allow ${action}`);
    assert.equal(denied.has(action), true, `Operator must deny ${action}`);
  }
  for (const prefix of [
    "account:*",
    "iam:*",
    "identitystore:*",
    "organizations:*",
    "sso:*",
  ]) {
    assert.equal(denied.has(prefix), true, `Operator must deny ${prefix}`);
  }
});

test("Recovery is deny-only until WP-039 and cannot restore, administer, or deploy", () => {
  const permissionSet = permissionSetMap.ShelfStateRecovery;
  const allowed = actions(permissionSet, "Allow");
  const denied = actions(permissionSet, "Deny");

  assert.equal(allowed.size, 0);
  assert.equal(RECOVERY_ACTIVATION_WORK_PACKAGE, "WP-039");
  assert.match(permissionSet.deferredCapabilities.join(" "), /WP-039/);
  for (const action of [
    "backup:StartRestoreJob",
    "cloudformation:CreateStack",
    "iam:PassRole",
    "sts:AssumeRole",
  ]) {
    assert.equal(denied.has(action), true, `Recovery must deny ${action}`);
  }
  for (const prefix of [
    "account:*",
    "iam:*",
    "identitystore:*",
    "organizations:*",
    "sso:*",
  ]) {
    assert.equal(denied.has(prefix), true, `Recovery must deny ${prefix}`);
  }
});

test("no permission set grants unrestricted role use or an unreviewed future resource", () => {
  const wildcardAllowlist = new Set(ALLOWED_WILDCARD_RESOURCE_ACTIONS);

  for (const permissionSet of permissionSets) {
    const allowed = actions(permissionSet, "Allow");
    assert.equal(allowed.has("sts:AssumeRole"), false);
    assert.equal(allowed.has("iam:PassRole"), false);

    for (const statement of statements(permissionSet, "Allow")) {
      if (!resourceValues(statement).includes("*")) continue;
      for (const action of statement.Action) {
        assert.equal(
          wildcardAllowlist.has(action),
          true,
          `${permissionSet.name} grants unreviewed wildcard-resource action ${action}`,
        );
      }
    }
  }
});

test("materialized inline policies fit the Identity Center inline-policy quota", () => {
  for (const permissionSet of permissionSets) {
    const compactPolicy = JSON.stringify(permissionSet.inlinePolicy);
    assert.ok(
      compactPolicy.length <= 10_240,
      `${permissionSet.name} policy is ${compactPolicy.length} non-whitespace bytes`,
    );
  }
});

test("committed policy sources contain no personal or live AWS identifiers", async () => {
  const sources = await Promise.all([
    readFile(new URL("../security/human-access-policies.mjs", import.meta.url), "utf8"),
    readFile(new URL(import.meta.url), "utf8"),
  ]);
  const serialized = sources.join("\n");

  assert.doesNotMatch(serialized, /\b\d{12}\b/);
  assert.doesNotMatch(serialized, /@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  assert.doesNotMatch(serialized, /ssoins-[A-Za-z0-9-]{16}/);
  assert.doesNotMatch(serialized, /d-[0-9a-f]{10}/);
  assert.doesNotMatch(serialized, /AWSReservedSSO_[A-Za-z0-9_]+/);
});
