import { assert, object, environment, equal, REPOSITORY } from "../scripts/release/schema.mjs";

export function inertRole(account, env) {
  assert.equal(typeof account, "string"); assert.match(account, /^\d{12}$/); environment(env);
  return {
    RoleName: env === "dev" ? "ShelfStateV4DevDeploy" : "ShelfStateV4ProdDeploy",
    Path: "/", MaxSessionDuration: 3600,
    AssumeRolePolicyDocument: { Version: "2012-10-17", Statement: [{ Effect: "Allow",
      Principal: { Federated: `arn:aws:iam::${account}:oidc-provider/token.actions.githubusercontent.com` },
      Action: "sts:AssumeRoleWithWebIdentity", Condition: { StringEquals: {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": `repo:${REPOSITORY}:environment:${env}`,
      } } }] },
    Tags: [{ Key: "Project", Value: "shelfstate-v4" }, { Key: "Environment", Value: env === "production" ? "prod" : "dev" }, { Key: "ManagedBy", Value: "ShelfStateBootstrap" }],
    AttachedPolicies: [], InlinePolicies: [],
  };
}
// Input is an explicitly projected, fully paginated readback envelope. This
// validates its contents, not the authenticity of a caller's JSON or AWS session.
export function validateRoleReadback(readback, account, env) {
  object(readback, ["complete", "account", "role"]);
  assert.equal(readback.complete, true); assert.equal(readback.account, account);
  equal(readback.role, inertRole(account, env), "Role/trust/permissions differ from approved inert role");
}
export function expectedEnvironment(env, ownerId) {
  environment(env); assert.ok(Number.isSafeInteger(ownerId) && ownerId > 0);
  return { name: env, deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
    branchPolicies: [{ name: "main", type: "branch" }], reviewers: env === "production" ? [{ type: "User", id: ownerId }] : [],
    prevent_self_review: false, can_admins_bypass: false, wait_timer: 0 };
}
export function expectedRuleset(actionsIntegrationId) {
  assert.ok(Number.isSafeInteger(actionsIntegrationId) && actionsIntegrationId > 0);
  return { name: "shelfstate-main-validation", target: "branch", enforcement: "active",
    conditions: { ref_name: { include: ["refs/heads/main"], exclude: [] } }, bypass_actors: [],
    rules: [
      { type: "pull_request", parameters: { required_approving_review_count: 0, dismiss_stale_reviews_on_push: false, require_code_owner_review: false, require_last_push_approval: false, required_review_thread_resolution: true } },
      { type: "required_status_checks", parameters: { strict_required_status_checks_policy: true, required_status_checks: [
        { context: "V3 and repository boundary", integration_id: actionsIntegrationId },
        { context: "V4 install and verification", integration_id: actionsIntegrationId },
      ] } }, { type: "non_fast_forward" }, { type: "deletion" },
    ] };
}
export function validateSettings(readback, ownerId, actionsIntegrationId) {
  object(readback, ["complete", "ruleset", "environments"]); assert.equal(readback.complete, true);
  equal(readback.ruleset, expectedRuleset(actionsIntegrationId), "Main ruleset mismatch");
  equal(readback.environments, [expectedEnvironment("dev", ownerId), expectedEnvironment("production", ownerId)], "Environment gate mismatch");
}
