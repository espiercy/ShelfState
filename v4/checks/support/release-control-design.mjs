// WP-006A executable design assertions ONLY. No AWS/GitHub client, workflow,
// credential handling, token verification, or deployment implementation.
import assert from "node:assert/strict";
import { assertStatefulResourceSafeguards } from "../../infrastructure/lib/template-guards.mjs";

export const REPOSITORY = "espiercy/ShelfState";
export const AUDIENCE = "sts.amazonaws.com";
export const ACTION_PINS = Object.freeze({
  checkout: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
  setupNode: "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
  credentials: "aws-actions/configure-aws-credentials@e1253824e5c10ff9df46874f81ed3ec929e19cfd",
  upload: "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
  download: "actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c",
});
const environments = new Set(["dev", "production"]);
const protectedTypes = new Set([
  "AWS::Backup::BackupPlan", "AWS::Backup::BackupVault",
  "AWS::CertificateManager::Certificate", "AWS::Cognito::UserPool",
  "AWS::DynamoDB::Table", "AWS::Route53::RecordSet",
  "AWS::Route53::RecordSetGroup", "AWS::S3::Bucket",
]);
const clone = (v) => structuredClone(v);
const canonical = (v) => JSON.stringify(sortKeys(v));
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") return Object.fromEntries(
    Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sortKeys(x)]),
  );
  return v;
}
function environment(value) {
  assert.ok(environments.has(value), "Unknown environment");
}

export function trustDesign(account, env) {
  assert.match(account, /^\d{12}$/, "Runtime account binding required");
  environment(env);
  return { Version: "2012-10-17", Statement: [{
    Effect: "Allow",
    Principal: { Federated: `arn:aws:iam::${account}:oidc-provider/token.actions.githubusercontent.com` },
    Action: "sts:AssumeRoleWithWebIdentity",
    Condition: { StringEquals: {
      "token.actions.githubusercontent.com:aud": AUDIENCE,
      "token.actions.githubusercontent.com:sub": `repo:${REPOSITORY}:environment:${env}`,
    } },
  }] };
}

// Tests a parsed claim fixture against this exact trust shape, NOT a JWT/IAM verifier.
export function fixtureTrustAllows(policy, account, env, claims) {
  assert.deepEqual(policy, trustDesign(account, env), "Unexpected trust shape/scope");
  const equals = policy.Statement[0].Condition.StringEquals;
  return claims.iss === "https://token.actions.githubusercontent.com" &&
    claims.aud === equals["token.actions.githubusercontent.com:aud"] &&
    claims.sub === equals["token.actions.githubusercontent.com:sub"];
}

export function workflowDesign(env) {
  environment(env);
  // Each modeled use binds the action identity separately from required inputs.
  const setupNode = () => ({ uses: ACTION_PINS.setupNode,
    with: { "node-version-file": "v4/.nvmrc", "package-manager-cache": false } });
  return {
    repository: REPOSITORY, environment: env,
    triggers: ["workflow_dispatch"], ref: "refs/heads/main", refType: "branch",
    shaInputRequired: true, permissions: { contents: "read" },
    concurrency: { group: `shelfstate-v4-${env}`, cancelInProgress: false },
    branchPolicy: { protected_branches: false, custom_branch_policies: true,
      rules: [{ name: "main", type: "branch" }] },
    protection: { reviewers: env === "production" ? ["repository-owner"] : [],
      preventSelfReview: false, canAdminsBypass: false },
    prepare: { permissions: { contents: "read" }, environment: null, credentials: false,
      setupNode: setupNode() },
    deploy: { permissions: { contents: "read", actions: "read", "id-token": "write" },
      environment: env, needs: ["prepare"], requestOidcAfterEnvironmentGate: true,
      steps: ["verify-evidence", "assume-oidc", "verify-live-state", "recheck-destructive-gate", "identity-proof-only"],
      role: env === "production" ? "ShelfStateV4ProdDeploy" : "ShelfStateV4DevDeploy",
      setupNode: setupNode() },
    actionPins: clone(ACTION_PINS), persistCredentials: false, staticAwsSecrets: [],
    dependencyCache: { restore: false, save: false },
    initialApplicationPermissions: [],
  };
}

export function assertWorkflowDesign(value, env) {
  // Strict baseline is deliberate: modifications require explicit design review.
  assert.deepEqual(value, workflowDesign(env), "Unreviewed workflow authority or gate");
}

export function assertRevisionBinding(manifest, evidence) {
  environment(manifest.environment);
  assert.equal(manifest.repository, REPOSITORY, "Wrong repository");
  for (const key of ["requestedSha", "checkoutSha", "workflowSha"]) {
    assert.match(manifest[key] ?? "", /^[a-f0-9]{40}$/, `Full SHA required: ${key}`);
  }
  assert.equal(manifest.requestedSha, manifest.checkoutSha, "Checkout mismatch");
  assert.equal(manifest.workflowSha, evidence.approvedWorkflowSha, "Workflow revision mismatch");
  assert.equal(manifest.environment, evidence.environment, "Environment mismatch");
  assert.equal(evidence.ref, "refs/heads/main", "Main ref required");
  assert.equal(evidence.refType, "branch", "Tags rejected");
  assert.ok(evidence.mainHistory.includes(manifest.requestedSha), "Revision outside main history");
  assert.match(manifest.runId ?? "", /^\d+$/, "Run identity required");
  assert.equal(manifest.runId, evidence.runId, "Wrong artifact producer run");
  assert.equal(manifest.runAttempt, evidence.runAttempt, "Wrong run attempt");
  assert.ok(Number.isInteger(manifest.runAttempt) && manifest.runAttempt > 0);
  assert.match(manifest.createdAt ?? "", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.ok(Number.isFinite(Date.parse(manifest.createdAt)));
  assert.ok(Array.isArray(manifest.files) && manifest.files.length > 0, "Missing artifact inventory");
  const paths = new Set();
  for (const file of manifest.files) {
    assert.match(file.path ?? "", /^[A-Za-z0-9_-]+(?:[/.][A-Za-z0-9_-]+)*$/, "Unsafe artifact path");
    assert.ok(!paths.has(file.path), "Duplicate artifact path"); paths.add(file.path);
    assert.match(file.sha256 ?? "", /^[a-f0-9]{64}$/, "Invalid content digest");
  }
  assert.equal(canonical(manifest.files), canonical(evidence.actualFiles), "Artifact/template mismatch");
  assert.equal(manifest.baselineDigest, evidence.liveBaselineDigest, "Live baseline drift");
  assert.match(manifest.baselineDigest ?? "", /^[a-f0-9]{64}$/, "Missing baseline digest");
}

// Conservative structured transition sketch. Inputs represent already parsed,
// independently bound evidence; live collection/CFN pagination are WP-006B+ work.
export function assertTransition(before, after, changes, env) {
  environment(env);
  const cdkEnv = env === "production" ? "prod" : "dev";
  assert.ok(before && after && Array.isArray(changes), "Missing structured evidence");
  assertStatefulResourceSafeguards(before, cdkEnv);
  assertStatefulResourceSafeguards(after, cdkEnv);
  const old = before.Resources ?? {}, next = after.Resources ?? {};
  const expected = new Set();
  for (const [id, resource] of Object.entries(old)) {
    assert.ok(Object.hasOwn(next, id), "Resource removal requires separate authorization");
    assert.equal(next[id].Type, resource.Type, "Resource type replacement");
    for (const key of ["DeletionPolicy", "UpdateReplacePolicy"]) {
      if (resource[key] === "Retain") assert.equal(next[id][key], "Retain", "Retention weakening");
    }
    assert.equal(next[id].Metadata?.ShelfStateStatefulPolicy, resource.Metadata?.ShelfStateStatefulPolicy,
      "Stateful reclassification requires separate authorization");
    if (resource.Properties?.DeletionProtectionEnabled === true)
      assert.equal(next[id].Properties?.DeletionProtectionEnabled, true, "DynamoDB protection weakening");
    if (resource.Properties?.DeletionProtection === "ACTIVE")
      assert.equal(next[id].Properties?.DeletionProtection, "ACTIVE", "Cognito protection weakening");
    if (resource.Type.startsWith("AWS::Backup::"))
      assert.equal(canonical(next[id]), canonical(resource), "Backup/lock change requires separate authorization");
    if (canonical(resource) !== canonical(next[id])) expected.add(id);
  }
  for (const id of Object.keys(next)) if (!Object.hasOwn(old, id)) expected.add(id);
  for (const change of changes) {
    assert.ok(expected.delete(change.logicalId), "Unexpected/duplicate change or stale evidence");
    assert.equal(change.action, Object.hasOwn(old, change.logicalId) ? "Modify" : "Add", "Destructive/unknown action");
    assert.equal(change.replacement, "False", "Replacement or indeterminate replacement");
    assert.equal(change.resolved, true, "Unresolved dynamic/nested change");
    if (protectedTypes.has(next[change.logicalId].Type))
      assert.ok(next[change.logicalId].Metadata?.ShelfStateStatefulPolicy, "Missing stateful classification");
  }
  assert.equal(expected.size, 0, "Incomplete change evidence");
}

export function assertKnownGoodRollback(record, manifest, evidence, before, after, changes) {
  assertRevisionBinding(manifest, evidence);
  assert.equal(record.repository, REPOSITORY);
  assert.equal(record.environment, manifest.environment, "Cross-environment rollback");
  assert.equal(record.sha, manifest.requestedSha, "Unknown rollback revision");
  assert.equal(record.result, "SUCCEEDED", "Unsuccessful deployment is not known-good");
  assert.equal(record.smoke, "PASSED", "Unverified revision is not known-good");
  assert.equal(record.retained, true, "Missing retained evidence");
  assert.equal(canonical(record.files), canonical(manifest.files), "Rollback artifact mismatch");
  assertTransition(before, after, changes, manifest.environment);
}
