import assert from "node:assert/strict";

// Test-only evaluator for this proposal's enumerated policy subset. NOT an IAM
// simulator: no SCPs, trust, cross-account or service-specific semantics. The one
// resource-policy/role-session case below is deliberately explicit and bounded.
// Unsupported syntax throws. Live effective-permission proof remains gated.
const list = value => Array.isArray(value) ? value : [value];
const matches = (pattern, value) => new RegExp("^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*").replaceAll("?", ".") + "$").test(value);

function conditionsMatch(conditions, context) {
  for (const [operator, entries] of Object.entries(conditions ?? {})) {
    assert.ok(["StringEquals", "StringLike", "ForAllValues:StringEquals", "ForAllValues:StringLike", "Null"].includes(operator), `Unsupported condition ${operator}`);
    for (const [key, expected] of Object.entries(entries)) {
      const present = Object.hasOwn(context, key) && context[key] !== null;
      if (operator === "Null") {
        if ((!present) !== (expected === "true")) return false;
        continue;
      }
      if (!present) {
        if (operator.startsWith("ForAllValues:")) continue; // AWS vacuous truth; Null guard must close it.
        return false;
      }
      const values = list(context[key]);
      const allowed = list(expected);
      const compare = operator.endsWith("Like") ? matches : (a, b) => a === b;
      if (operator.startsWith("ForAllValues:")) {
        if (!values.every(v => allowed.some(e => compare(e, v)))) return false;
      } else if (!values.some(v => allowed.some(e => compare(e, v)))) return false;
    }
  }
  return true;
}

export function decision(document, action, resource, context = {}) {
  assert.equal(document.Version, "2012-10-17");
  let permitted = false;
  for (const statement of document.Statement) {
    assert.ok(Object.keys(statement).every(k => ["Sid", "Effect", "Action", "NotAction", "Resource", "NotResource", "Condition"].includes(k)), "Unsupported statement shape");
    assert.ok(["Allow", "Deny"].includes(statement.Effect), "Unsupported effect");
    assert.notEqual(Object.hasOwn(statement, "Action"), Object.hasOwn(statement, "NotAction"), "Exactly one action selector required");
    assert.notEqual(Object.hasOwn(statement, "Resource"), Object.hasOwn(statement, "NotResource"), "Exactly one resource selector required");
    if (statement.NotAction || statement.NotResource) assert.equal(statement.Effect, "Deny", "Unsupported Allow with negative selector");
    if (statement.NotAction) assert.deepEqual(list(statement.Resource), ["*"], "Only global Deny NotAction is modeled");
    const actionMatch = list(statement.Action ?? statement.NotAction).some(a => matches(a.toLowerCase(), action.toLowerCase()));
    const resourceMatch = list(statement.Resource ?? statement.NotResource).some(r => matches(r, resource));
    if (statement.NotAction ? actionMatch : !actionMatch) continue;
    if (statement.NotResource ? resourceMatch : !resourceMatch) continue;
    if (!conditionsMatch(statement.Condition, context)) continue;
    if (statement.Effect === "Deny") return "explicitDeny";
    assert.equal(statement.Effect, "Allow");
    permitted = true;
  }
  return permitted ? "allow" : "implicitDeny";
}

export function allows(document, action, resource, context = {}) {
  return decision(document, action, resource, context) === "allow";
}

// Only same-account assumed-role sessions with a wildcard Principal and exact
// ArnEquals aws:PrincipalArn condition. This key is the IAM role ARN, NOT the STS
// session ARN. Such a grant bypasses implicit boundary denial, never explicit deny.
// Not a generic resource-policy evaluator: no direct role Principal, other keys,
// cross-account authorization, session policies, SCPs, ACLs or KMS special rules.
export function allowsRoleSession({ identity, boundary, resourcePolicy, roleArn, sessionArn, action, resource }) {
  const role = /^arn:aws:iam::([0-9]{12}):role\/(.+)$/.exec(roleArn);
  assert.ok(role, "Expected IAM role ARN");
  const session = /^arn:aws:sts::([0-9]{12}):assumed-role\/([^/]+)\/[^/]+$/.exec(sessionArn);
  assert.ok(session, "Expected temporary assumed-role session");
  assert.equal(session[1], role[1], "Same-account session required");
  assert.equal(session[2], role[2].split("/").at(-1), "Session must belong to the role");
  assert.ok(resource.startsWith(`arn:aws:s3:::`) || resource.split(":")[4] === role[1], "Same-account fixture required; S3 ownership is a test premise");
  assert.equal(resourcePolicy.Version, "2012-10-17");
  const normalized = { Version: resourcePolicy.Version, Statement: resourcePolicy.Statement.map(statement => {
    assert.equal(statement.Principal, "*", "Only wildcard Principal resource grants are modeled");
    assert.deepEqual(Object.keys(statement.Condition ?? {}), ["ArnEquals"], "Only exact principal-ARN condition is modeled");
    assert.deepEqual(Object.keys(statement.Condition.ArnEquals), ["aws:PrincipalArn"]);
    assert.equal(typeof statement.Condition.ArnEquals["aws:PrincipalArn"], "string");
    const { Principal, ...rest } = statement;
    return { ...rest, Condition: { StringEquals: statement.Condition.ArnEquals } };
  }) };
  const context = { "aws:PrincipalArn": roleArn };
  const decisions = [identity, boundary, normalized].map(p => decision(p, action, resource, context));
  if (decisions.includes("explicitDeny")) return false;
  return decisions[2] === "allow" || (decisions[0] === "allow" && decisions[1] === "allow");
}
