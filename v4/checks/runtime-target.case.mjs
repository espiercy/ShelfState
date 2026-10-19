import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
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
function git(cwd, ...args) {
  const env = { ...credentialFreeEnvironment(), GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null" };
  return execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function withRepositoryFixture(shallow, run) {
  const root = mkdtempSync(path.join(os.tmpdir(), "shelfstate-runtime-target-"));
  try {
    const source = path.join(root, "source");
    mkdirSync(source);
    git(source, "init", "--quiet", "--initial-branch=main");
    writeFileSync(path.join(source, "fixture.txt"), "controlled fixture\n");
    git(source, "add", "fixture.txt");
    execFileSync("git", ["-c", "user.name=ShelfState fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "fixture"], {
      cwd: source, env: { ...credentialFreeEnvironment(), GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
        GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const cwd = shallow ? path.join(root, "checkout") : source;
    if (shallow) git(root, "clone", "--quiet", "--depth=1", "--no-local", "--no-tags", pathToFileURL(source).href, cwd);
    assert.equal(git(cwd, "rev-parse", "--is-shallow-repository"), String(shallow));
    return run({ cwd, head: git(cwd, "rev-parse", "HEAD") });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
function runWrongTargetFixture(shallow, expected) {
  return withRepositoryFixture(shallow, ({ cwd, head }) => {
    const controller = new URL("../scripts/release/controller.mjs", import.meta.url).href;
    const script = `import assert from 'node:assert/strict'; import {main} from ${JSON.stringify(controller)};
let fetched=false; globalThis.fetch=()=>{fetched=true; throw Error('Unexpected remote request')};
await assert.rejects(main('pre-oidc'), ${expected}); assert.equal(fetched,false);`;
    const env = { ...credentialFreeEnvironment(), GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "espiercy/ShelfState",
      GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF: "refs/heads/main", GITHUB_REF_TYPE: "branch", RELEASE_ENVIRONMENT: "dev",
      CANDIDATE_SHA: head, GITHUB_WORKFLOW_SHA: head, GITHUB_SHA: head,
      GITHUB_WORKFLOW_REF: "espiercy/ShelfState/.github/workflows/v4-dev-release.yml@refs/heads/main",
      GITHUB_RUN_ID: "100", GITHUB_RUN_ATTEMPT: "1", RUNNER_TEMP: cwd, GITHUB_OUTPUT: path.join(cwd, "unused-negative-fixture"),
      SHELFSTATE_AWS_ACCOUNT_ID: account, SHELFSTATE_DEPLOY_ROLE_ARN: role("dev") };
    execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd, env, stdio: "pipe", timeout: 15000 });
  });
}
test("real pre-oidc controller rejects a wrong pinned account before GitHub or credentials", () => {
  runWrongTargetFixture(false, "/Controller-pinned AWS target mismatch/");
});
test("real pre-oidc controller rejects shallow history before target validation or remote access", () => {
  runWrongTargetFixture(true, "/Incomplete Git history/");
});
