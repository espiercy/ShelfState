import { assert, object, environment, hashObject, REPOSITORY } from "./schema.mjs";

// Controller-owned pins, independently computed from the approved account binding.
// Deliberately retain no live account ID/ARN. Changing a pin requires review.
export const APPROVED_TARGET_DIGESTS = Object.freeze({
  dev: "38f1c7758183a5bb5c13c91c8fb0ee1fbd3db40dcb5559d3c7c0060f6608651f",
  production: "b4b8e1b9c1973f90a20811ac2a92b6c499f56430764c6e18d319511d380489ca",
});

export function validateApprovedTarget(target) {
  object(target, ["schema", "repository", "environment", "account", "roleArn", "roleName", "audience", "region"], "runtime target");
  environment(target.environment);
  assert.equal(target.schema, "shelfstate.approved-target/v1");
  assert.equal(target.repository, REPOSITORY);
  assert.equal(typeof target.account, "string");
  assert.match(target.account, /^[0-9]{12}$/, "Invalid runtime account syntax");
  const roleName = target.environment === "dev" ? "ShelfStateV4DevDeploy" : "ShelfStateV4ProdDeploy";
  assert.equal(target.roleName, roleName, "Runtime role name mismatch");
  assert.equal(target.roleArn, `arn:aws:iam::${target.account}:role/${roleName}`, "Runtime role/account syntax mismatch");
  assert.equal(target.audience, "sts.amazonaws.com", "Runtime audience mismatch");
  assert.equal(target.region, "us-west-2", "Runtime region mismatch");
  const approvedTargetDigest = hashObject(target);
  assert.equal(approvedTargetDigest, APPROVED_TARGET_DIGESTS[target.environment], "Controller-pinned AWS target mismatch");
  return { ...target, approvedTargetDigest };
}

export function runtimeTarget(env, account, roleArn) {
  environment(env);
  return validateApprovedTarget({ schema: "shelfstate.approved-target/v1", repository: REPOSITORY,
    environment: env, account, roleArn,
    roleName: env === "dev" ? "ShelfStateV4DevDeploy" : "ShelfStateV4ProdDeploy",
    audience: "sts.amazonaws.com", region: "us-west-2" });
}
