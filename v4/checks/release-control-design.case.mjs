import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createHumanAccessPermissionSets } from "../security/human-access-policies.mjs";
import {
  ACTION_PINS, AUDIENCE, REPOSITORY, assertKnownGoodRollback,
  assertRevisionBinding, assertTransition, assertWorkflowDesign,
  fixtureTrustAllows, trustDesign, workflowDesign,
} from "./support/release-control-design.mjs";

const account = "1".repeat(12);
const sha = "a".repeat(40), controller = "b".repeat(40), digest = "c".repeat(64);
const clone = (v) => structuredClone(v);
function binding() {
  const manifest = { repository: REPOSITORY, environment: "production",
    requestedSha: sha, checkoutSha: sha, workflowSha: controller,
    runId: "123", runAttempt: 1, createdAt: "2026-09-29T12:00:00Z",
    baselineDigest: digest, files: [{ path: "templates/library.json", sha256: digest }] };
  const evidence = { environment: "production", approvedWorkflowSha: controller,
    ref: "refs/heads/main", refType: "branch", mainHistory: [sha, controller],
    runId: "123", runAttempt: 1, actualFiles: clone(manifest.files), liveBaselineDigest: digest };
  return { manifest, evidence };
}
function template(type = "AWS::DynamoDB::Table", properties = { DeletionProtectionEnabled: true }) {
  return { Resources: { Durable: { Type: type, DeletionPolicy: "Retain",
    UpdateReplacePolicy: "Retain", Metadata: { ShelfStateStatefulPolicy: "retained" },
    Properties: properties } } };
}
const modify = [{ logicalId: "Durable", action: "Modify", replacement: "False", resolved: true }];

test("design trust accepts only exact repo, audience and matching environment", () => {
  for (const env of ["dev", "production"]) {
    const policy = trustDesign(account, env);
    const claims = { iss: "https://token.actions.githubusercontent.com", aud: AUDIENCE,
      sub: `repo:${REPOSITORY}:environment:${env}` };
    assert.equal(fixtureTrustAllows(policy, account, env, claims), true);
    for (const sub of [
      `repo:other/ShelfState:environment:${env}`, `repo:espiercy/Other:environment:${env}`,
      `repo:${REPOSITORY}:pull_request`, `repo:${REPOSITORY}:ref:refs/heads/main`,
      `repo:${REPOSITORY}:ref:refs/tags/main`, `repo:${REPOSITORY}:environment:preview`,
      `repo:${REPOSITORY}:environment:${env === "dev" ? "production" : "dev"}`,
    ]) assert.equal(fixtureTrustAllows(policy, account, env, { ...claims, sub }), false, sub);
    assert.equal(fixtureTrustAllows(policy, account, env, { ...claims, aud: "other" }), false);
    assert.equal(fixtureTrustAllows(policy, account, env, { ...claims, aud: [AUDIENCE, "other"] }), false);
    assert.equal(fixtureTrustAllows(policy, account, env, { ...claims, iss: "https://example.com" }), false);
  }
});

test("design trust rejects wildcard/alternate operators, principals and actions", () => {
  for (const mutate of [
    p => { p.Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"] = "repo:espiercy/*"; },
    p => { p.Statement[0].Condition.StringLike = p.Statement[0].Condition.StringEquals; delete p.Statement[0].Condition.StringEquals; },
    p => { p.Statement[0].Principal = { AWS: "*" }; },
    p => { p.Statement[0].Action = "sts:AssumeRole"; },
    p => { p.Statement.push(clone(p.Statement[0])); },
  ]) { const policy = trustDesign(account, "production"); mutate(policy);
    assert.throws(() => fixtureTrustAllows(policy, account, "production", {})); }
  assert.throws(() => trustDesign("*", "production"));
  assert.throws(() => trustDesign(account, "prod"));
});

test("workflow design keeps production approval and OIDC confined to deploy job", () => {
  for (const env of ["dev", "production"]) assert.doesNotThrow(() => assertWorkflowDesign(workflowDesign(env), env));
  const mutations = [
    w => { w.triggers.push("push"); }, w => { w.triggers = ["pull_request_target"]; },
    w => { w.permissions["id-token"] = "write"; }, w => { w.prepare.permissions["id-token"] = "write"; },
    w => { w.prepare.credentials = true; }, w => { w.deploy.environment = "dev"; },
    w => { w.protection.reviewers = []; }, w => { w.protection.canAdminsBypass = true; },
    w => { w.deploy.requestOidcAfterEnvironmentGate = false; },
    w => { w.deploy.steps.reverse(); }, w => { w.shaInputRequired = false; },
    w => { w.branchPolicy.rules = [{ name: "*", type: "branch" }]; },
    w => { w.branchPolicy.rules.push({ name: "main", type: "tag" }); },
    w => { w.concurrency.cancelInProgress = true; }, w => { w.staticAwsSecrets = ["synthetic-key-name"]; },
    w => { w.actionPins.credentials = "aws-actions/configure-aws-credentials@main"; },
    w => { w.initialApplicationPermissions = ["cloudformation:*"]; },
    w => { w.persistCredentials = true; }, w => { w.deploy.needs = []; },
  ];
  for (const mutate of mutations) { const value = workflowDesign("production"); mutate(value);
    assert.throws(() => assertWorkflowDesign(value, "production")); }
  assert.ok(Object.values(ACTION_PINS).every(pin => /@[a-f0-9]{40}$/.test(pin)));
});

for (const [label, mutate] of [
  ["missing package-manager-cache", step => { delete step.with["package-manager-cache"]; }],
  ["enabled package-manager-cache", step => { step.with["package-manager-cache"] = true; }],
  ["different Node version file", step => { step.with["node-version-file"] = ".nvmrc"; }],
  ["pinned setup-node without inputs", step => { delete step.with; }],
  ["different setup-node revision", step => { step.uses = `actions/setup-node@${"d".repeat(40)}`; }],
]) {
  test(`release setup-node rejects ${label} in either job/environment`, () => {
    for (const env of ["dev", "production"]) for (const job of ["prepare", "deploy"]) {
      const value = workflowDesign(env);
      assert.equal(value[job].setupNode.uses,
        "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020");
      assert.deepEqual(value[job].setupNode.with,
        { "node-version-file": "v4/.nvmrc", "package-manager-cache": false });
      assert.doesNotThrow(() => assertWorkflowDesign(value, env));
      mutate(value[job].setupNode);
      assert.throws(() => assertWorkflowDesign(value, env), /Unreviewed workflow authority or gate/);
    }
  });
}

test("release inventory rejects cache actions and ad-hoc dependency cache steps", () => {
  for (const env of ["dev", "production"]) {
    for (const mutate of [
      w => { w.actionPins.cache = `actions/cache@${"d".repeat(40)}`; },
      w => { w.actionPins.cache = `other/dependency-cache@${"d".repeat(40)}`; },
      w => { w.dependencyCache.restore = true; },
      w => { w.dependencyCache.save = true; },
      w => { w.prepare.steps = ["restore-dependency-cache"]; },
      w => { w.deploy.steps.push("save-dependency-cache"); },
      w => { w.prepare.setupNode.with.cache = "npm"; },
      w => { w.deploy.setupNode.with.cache = "npm"; },
    ]) {
      const value = workflowDesign(env); mutate(value);
      assert.throws(() => assertWorkflowDesign(value, env), /Unreviewed workflow authority or gate/);
    }
  }
});

test("revision binding accepts a main-history candidate distinct from workflow revision", () => {
  const { manifest, evidence } = binding();
  assert.notEqual(manifest.requestedSha, manifest.workflowSha);
  assert.doesNotThrow(() => assertRevisionBinding(manifest, evidence));
});

test("revision binding rejects symbolic/short revisions and mismatched evidence", () => {
  for (const bad of ["main", "v1.0", sha.slice(0, 7), `${sha};echo`, "g".repeat(40), ""]) {
    const { manifest, evidence } = binding(); manifest.requestedSha = bad;
    assert.throws(() => assertRevisionBinding(manifest, evidence));
  }
  for (const mutate of [
    (m) => { m.checkoutSha = controller; }, (m) => { m.workflowSha = sha; },
    (m) => { m.repository = "espiercy/Other"; }, (m) => { m.environment = "dev"; },
    (m) => { m.files[0].sha256 = "d".repeat(64); }, (m) => { m.files = []; },
    (m) => { m.files.push(clone(m.files[0])); }, (m) => { m.files[0].path = "../outside"; },
    (m) => { m.runId = "other"; }, (m) => { m.runAttempt = 2; },
    (_, e) => { e.mainHistory = []; }, (_, e) => { e.ref = "refs/pull/1/merge"; },
    (_, e) => { e.refType = "tag"; }, (_, e) => { e.liveBaselineDigest = "e".repeat(64); },
    (_, e) => { e.actualFiles.push({ path: "extra.json", sha256: digest }); },
  ]) { const { manifest, evidence } = binding(); mutate(manifest, evidence);
    assert.throws(() => assertRevisionBinding(manifest, evidence)); }
});

test("structured transition requires complete resolved non-replacing evidence", () => {
  const before = template(), after = clone(before); after.Resources.Durable.Properties.Tags = [{ Key: "Project", Value: "ShelfState" }];
  assert.doesNotThrow(() => assertTransition(before, after, modify, "production"));
  for (const bad of [[], null, [...modify, ...modify], [{ ...modify[0], replacement: "True" }],
    [{ ...modify[0], replacement: "Conditional" }], [{ ...modify[0], resolved: false }],
    [{ ...modify[0], action: "Remove" }], [{ ...modify[0], logicalId: "Unknown" }]])
    assert.throws(() => assertTransition(before, after, bad, "production"));
  assert.doesNotThrow(() => assertTransition({ Resources: {} }, { Resources: {} }, [], "dev"));
  assert.doesNotThrow(() => assertTransition({ Resources: {} }, before,
    [{ ...modify[0], action: "Add" }], "production"));
});

test("structured gate rejects removal/replacement/retention/protection/reclassification", () => {
  for (const mutate of [
    t => { delete t.Resources.Durable; }, t => { t.Resources.Durable.Type = "AWS::S3::Bucket"; },
    t => { t.Resources.Durable.DeletionPolicy = "Delete"; },
    t => { t.Resources.Durable.UpdateReplacePolicy = "Snapshot"; },
    t => { t.Resources.Durable.Properties.DeletionProtectionEnabled = false; },
    t => { delete t.Resources.Durable.Metadata; },
    t => { t.Resources.Durable.Metadata.ShelfStateStatefulPolicy = "destroy-approved"; },
  ]) { const before = template(), after = clone(before); mutate(after);
    assert.throws(() => assertTransition(before, after, modify, "production")); }
  const before = template("AWS::Cognito::UserPool", { DeletionProtection: "ACTIVE" });
  const after = clone(before); after.Resources.Durable.Properties.DeletionProtection = "INACTIVE";
  assert.throws(() => assertTransition(before, after, modify, "production"));
});

test("backup policy/lock changes fail closed including Governance to Compliance", () => {
  const before = template("AWS::Backup::BackupVault", { LockConfiguration: { MinRetentionDays: 90 } });
  for (const mutate of [
    t => { delete t.Resources.Durable.Properties.LockConfiguration; },
    t => { t.Resources.Durable.Properties.LockConfiguration.MinRetentionDays = 1; },
    t => { t.Resources.Durable.Properties.LockConfiguration.ChangeableForDays = 3; },
    t => { delete t.Resources.Durable; },
  ]) { const after = clone(before); mutate(after);
    assert.throws(() => assertTransition(before, after, modify, "production")); }
  const plan = template("AWS::Backup::BackupPlan", { BackupPlan: { BackupPlanName: "synthetic" } });
  const changed = clone(plan); changed.Resources.Durable.Properties.BackupPlan.BackupPlanName = "changed";
  assert.throws(() => assertTransition(plan, changed, modify, "production"));
});

test("rollback requires retained successful verified exact-environment evidence and same gate", () => {
  const { manifest, evidence } = binding();
  const record = { repository: REPOSITORY, environment: "production", sha,
    result: "SUCCEEDED", smoke: "PASSED", retained: true, files: clone(manifest.files) };
  const before = template();
  assert.doesNotThrow(() => assertKnownGoodRollback(record, manifest, evidence, before, before, []));
  for (const patch of [{ sha: controller }, { result: "FAILED" }, { smoke: "PENDING" },
    { retained: false }, { environment: "dev" }, { files: [] }])
    assert.throws(() => assertKnownGoodRollback({ ...record, ...patch }, manifest, evidence, before, before, []));
  assert.throws(() => assertKnownGoodRollback(record, manifest, evidence, before, { Resources: {} }, []));
});

test("existing AccountAdmin covers inert deployment-role establishment without provider expansion", () => {
  const id = c => `${c.repeat(8)}-${c.repeat(4)}-${c.repeat(4)}-${c.repeat(4)}-${c.repeat(12)}`;
  const instance = `ssoins-${"a".repeat(16)}`;
  const sets = createHumanAccessPermissionSets({ accountId: account,
    identityCenterInstanceArn: `arn:aws:sso:::instance/${instance}`, identityStoreId: `d-${"a".repeat(10)}`,
    groupIds: { ShelfStateAccountAdmins: id("a"), ShelfStateOperators: id("b"), ShelfStateRecovery: id("c") },
    principalIds: { PrimaryHumanPrincipal: id("d"), RecoveryHumanPrincipal: id("e") },
    permissionSetArns: Object.fromEntries(["ShelfStateAccountAdmin", "ShelfStateOperator", "ShelfStateRecovery"].map((n, i) =>
      [n, `arn:aws:sso:::permissionSet/${instance}/ps-${String(i).repeat(16)}`])),
  });
  const policy = sets.ShelfStateAccountAdmin.inlinePolicy;
  const match = (pattern, value) => new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`).test(value);
  const permits = (action, resource) => {
    const matches = policy.Statement.filter(s => s.Action.some(a => match(a.toLowerCase(), action.toLowerCase())) &&
      (Array.isArray(s.Resource) ? s.Resource : [s.Resource]).some(r => match(r, resource)));
    return matches.some(s => s.Effect === "Allow") && !matches.some(s => s.Effect === "Deny");
  };
  for (const name of ["ShelfStateV4DevDeploy", "ShelfStateV4ProdDeploy"]) {
    const arn = `arn:aws:iam::${account}:role/${name}`;
    for (const action of ["iam:CreateRole", "iam:UpdateAssumeRolePolicy", "iam:TagRole"])
      assert.equal(permits(action, arn), true, action);
    // These broader existing capabilities are not used by initial inert roles.
    for (const action of ["iam:PutRolePolicy", "iam:AttachRolePolicy"])
      assert.equal(permits(action, arn), true);
    assert.equal(permits("iam:PassRole", arn), false);
    assert.equal(permits("sts:AssumeRole", arn), false);
    assert.equal(permits("iam:CreateRole", arn.replace(account, "2".repeat(12))), false);
  }
  assert.equal(permits("iam:CreateRole", `arn:aws:iam::${account}:role/OtherDeploy`), false);
  assert.equal(permits("iam:CreateOpenIDConnectProvider", `arn:aws:iam::${account}:oidc-provider/token.actions.githubusercontent.com`), false);
});

test("design assertions remain in verification without activating another workflow", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(pkg.scripts.verify, /npm run test:design/);
  assert.match(pkg.scripts["test:design"], /checks\/release-control-design.case.mjs/);
});
