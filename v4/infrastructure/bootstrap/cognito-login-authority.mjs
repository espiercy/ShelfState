// Local execution-policy fragments for the accepted development template.
import assert from "node:assert/strict";
import { resolveEnvironmentConfig } from "../lib/environment.mjs";
import { requiredTags } from "../lib/naming.mjs";
import { assertCognitoLoginPoolArn, cognitoLoginPoolArnPrefix } from "./cognito-login-contract.mjs";

const cognito = actions => actions.map(action => `cognito-idp:${action}`);
const reads = cognito([
  "DescribeUserPool", "GetUserPoolMfaConfig", "ListTagsForResource", "DescribeUserPoolClient",
  "DescribeManagedLoginBrandingByClient", "DescribeManagedLoginBranding",
]);
const createChildren = cognito(["CreateUserPoolClient", "CreateUserPoolDomain", "CreateManagedLoginBranding"]);
const rollback = cognito(["DeleteUserPoolClient", "DeleteUserPoolDomain", "DeleteManagedLoginBranding"]);
const updates = cognito(["UpdateUserPool", "UpdateUserPoolClient", "UpdateUserPoolDomain", "UpdateManagedLoginBranding"]);
const systemTagKeys = ["aws:cloudformation:logical-id", "aws:cloudformation:stack-id", "aws:cloudformation:stack-name"];
const regionCondition = { "aws:RequestedRegion": "us-west-2" };

export const COGNITO_LOGIN_ACTION_INVENTORY = Object.freeze({
  kind: "cognito-login", phase: "cognito-login",
  create: [...cognito(["CreateUserPool"]), ...createChildren, ...cognito(["TagResource", "UntagResource"])],
  read: [...reads, ...cognito(["DescribeUserPoolDomain"])],
  rollback,
  update: [...updates, ...cognito(["TagResource", "UntagResource"])],
  proof: "Tagged pool creation, stabilization, and child rollback only. Provider-specific calls beyond this inventory require live evidence and separate review.",
  replacement: "A retained pool or failed initialization requires human review before another create.",
});

export function cognitoLoginExecutionStatements(account, mode, bindings) {
  const initial = mode === "initialization";
  let poolArn = `${cognitoLoginPoolArnPrefix(account)}*`;
  if (initial) {
    assert.equal(bindings.userPoolArn, undefined, "No physical pool binding during initialization");
  } else {
    poolArn = bindings.userPoolArn;
    assertCognitoLoginPoolArn(account, poolArn);
  }

  const tags = { ...requiredTags(resolveEnvironmentConfig("dev")), WorkPackage: "WP-009" };
  const tagged = context => Object.fromEntries(Object.entries(tags).map(([key, value]) => [`aws:${context}Tag/${key}`, value]));
  const requestTags = tagged("Request");
  const resourceTags = tagged("Resource");
  const tagKeys = [...Object.keys(tags), ...systemTagKeys];
  const keyScope = keys => ({ "ForAllValues:StringEquals": { "aws:TagKeys": keys }, Null: { "aws:TagKeys": "false" } });
  const allow = (Sid, Action, Resource, Condition) => ({ Sid, Effect: "Allow", Action, Resource: [Resource], Condition });

  const west = [
    ...(initial ? [allow("Wp009CreatePool", cognito(["CreateUserPool"]), "*", {
      StringEquals: { ...regionCondition, ...requestTags }, ...keyScope(tagKeys),
    })] : []),
    allow("Wp009PoolLifecycle", [...reads, ...(initial ? [...createChildren, ...rollback] : updates)], poolArn, {
      StringEquals: { ...regionCondition, ...resourceTags },
    }),
    // DescribeUserPoolDomain has no resource ARN or domain condition key.
    allow("Wp009ReadPrefixDomain", cognito(["DescribeUserPoolDomain"]), "*", { StringEquals: regionCondition }),
  ];

  // Keep all installed statements in their existing attachments. The two
  // Cognito tag statements fit in WestEdge within the managed-policy size cap.
  const westEdge = [
    allow("Wp009TagPool", cognito(["TagResource"]), poolArn, initial ? {
      StringEquals: { ...regionCondition, ...requestTags },
      StringEqualsIfExists: resourceTags,
      ...keyScope(tagKeys),
    } : {
      StringEquals: { ...regionCondition, ...resourceTags },
      StringEqualsIfExists: requestTags,
      ...keyScope(tagKeys),
    }),
    // CloudFormation documents untag permission for tag propagation. Only
    // its system keys may be removed. Keep the four ownership tags intact.
    allow("Wp009UntagPool", cognito(["UntagResource"]), poolArn, {
      StringEquals: { ...regionCondition, ...resourceTags }, ...keyScope(systemTagKeys),
    }),
  ];
  return [west, westEdge];
}
