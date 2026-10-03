import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { credentialFreeEnvironment } from "../scripts/release/offline-environment.mjs";
import { fixtureModules, fixturePins } from "./support/approved-target-fixture.mjs";
import { runtimeTarget as livePinnedTarget } from "../scripts/release/approved-targets.mjs";
const { targets: { runtimeTarget, validateApprovedTarget } } = await fixtureModules();
const account = "111111111111";
const role = env => `arn:aws:iam::${account}:role/ShelfStateV4${env === "dev" ? "Dev" : "Prod"}Deploy`;
const record = env => ({ schema: "shelfstate.approved-target/v1", repository: "espiercy/ShelfState", environment: env,
  account, roleArn: role(env), roleName: env === "dev" ? "ShelfStateV4DevDeploy" : "ShelfStateV4ProdDeploy",
  audience: "sts.amazonaws.com", region: "us-west-2" });

test("literal fixture pins use an independent canonical SHA-256 oracle", () => {
  for (const env of ["dev", "production"]) {
    const r = record(env), bytes = JSON.stringify(Object.fromEntries(Object.keys(r).sort().map(k => [k, r[k]])));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), fixturePins[env]);
    assert.equal(runtimeTarget(env, account, role(env)).approvedTargetDigest, fixturePins[env]);
  }
  assert.throws(() => livePinnedTarget("dev", account, role("dev")), /Controller-pinned AWS target mismatch/);
});
test("exact repository fallback has the same authority as the approved environment value", () => {
  const repository = { account, roleArn: role("dev") }, environment = {};
  const input = { ...repository, ...environment };
  assert.deepEqual(runtimeTarget("dev", input.account, input.roleArn), validateApprovedTarget(record("dev")));
});
for (const [label, input, env, pattern] of [
  ["repository-only wrong account", { account: "222222222222", roleArn: role("dev").replace(account, "222222222222") }, "dev", /Controller-pinned AWS target mismatch/],
  ["repository-only wrong role", { account, roleArn: role("dev").replace("Dev", "Other") }, "dev", /syntax mismatch/],
  ["organization/repository conflict", { account: "222222222222", roleArn: role("dev") }, "dev", /syntax mismatch/],
  ["environment wrong target", { account: "333333333333", roleArn: role("dev").replace(account, "333333333333") }, "dev", /Controller-pinned AWS target mismatch/],
  ["missing account", { roleArn: role("dev") }, "dev", /string/],
  ["missing role", { account }, "dev", /syntax mismatch/],
  ["malformed account", { account: "123", roleArn: role("dev") }, "dev", /account syntax/],
  ["dev target in production", { account, roleArn: role("dev") }, "production", /syntax mismatch/],
  ["production target in dev", { account, roleArn: role("production") }, "dev", /syntax mismatch/],
  ["role path", { account, roleArn: role("dev").replace("role/", "role/other/") }, "dev", /syntax mismatch/],
  ["alternate partition", { account, roleArn: role("dev").replace("arn:aws:", "arn:aws-cn:") }, "dev", /syntax mismatch/],
]) test(`target identity rejects ${label} before credential eligibility`, () => {
  let eligible = false;
  assert.throws(() => { runtimeTarget(env, input.account, input.roleArn); eligible = true; }, pattern);
  assert.equal(eligible, false);
});
for (const [key, value, pattern] of [["audience", "other", /audience/], ["region", "us-east-1", /region/], ["approvedTargetDigest", fixturePins.dev, /unsupported fields/]]) {
  test(`target rejects incoming ${key}`, () => assert.throws(() => validateApprovedTarget({ ...record("dev"), [key]: value }), pattern));
}
test("changing the independent controller pin rejects the previously valid target", async () => {
  const changed = await fixtureModules({ ...fixturePins, dev: "0".repeat(64) });
  assert.throws(() => changed.targets.runtimeTarget("dev", account, role("dev")), /Controller-pinned AWS target mismatch/);
});
test("real pre-oidc controller rejects a wrong pinned account before GitHub or credentials", () => {
  const cwd = fileURLToPath(new URL("../../", import.meta.url));
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
  const script = `import assert from 'node:assert/strict'; import {main} from './v4/scripts/release/controller.mjs';
globalThis.fetch=()=>{throw Error('Unexpected remote request')};
await assert.rejects(main('pre-oidc'), /Controller-pinned AWS target mismatch/);`;
  const env = { ...credentialFreeEnvironment(), GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "espiercy/ShelfState",
    GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF: "refs/heads/main", GITHUB_REF_TYPE: "branch", RELEASE_ENVIRONMENT: "dev",
    CANDIDATE_SHA: head, GITHUB_WORKFLOW_SHA: head, GITHUB_SHA: head,
    GITHUB_WORKFLOW_REF: "espiercy/ShelfState/.github/workflows/v4-dev-release.yml@refs/heads/main",
    GITHUB_RUN_ID: "100", GITHUB_RUN_ATTEMPT: "1", RUNNER_TEMP: cwd, GITHUB_OUTPUT: "unused-negative-fixture",
    SHELFSTATE_AWS_ACCOUNT_ID: account, SHELFSTATE_DEPLOY_ROLE_ARN: role("dev") };
  execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd, env, stdio: "pipe", timeout: 15000 });
});
