import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { credentialFreeEnvironment } from "../scripts/release/offline-environment.mjs";
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const stripped = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_SECURITY_TOKEN", "AWS_PROFILE", "AWS_DEFAULT_PROFILE",
  "AWS_ROLE_ARN", "AWS_WEB_IDENTITY_TOKEN_FILE", "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI", "AWS_CONTAINER_CREDENTIALS_FULL_URI",
  "AWS_CONTAINER_AUTHORIZATION_TOKEN", "AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE", "CDK_DEFAULT_ACCOUNT", "CDK_DEFAULT_REGION"];
test("credential isolation strips keys, profiles, web identity, containers and CDK defaults", () => {
  const env = credentialFreeEnvironment(Object.fromEntries(stripped.map(k => [k, "must-not-inherit"])));
  for (const k of stripped) assert.equal(env[k], undefined, k);
  assert.equal(env.AWS_EC2_METADATA_DISABLED, "true");
  assert.equal(env.AWS_CONFIG_FILE, process.platform === "win32" ? "NUL" : "/dev/null");
  assert.equal(env.AWS_SHARED_CREDENTIALS_FILE, env.AWS_CONFIG_FILE);
  assert.equal(env.AWS_SDK_LOAD_CONFIG, "0");
  assert.equal(credentialFreeEnvironment({ NODE_OPTIONS: "unsafe" }).NODE_OPTIONS, undefined);
});
test("both synth scripts explicitly disable lookups and preserve environment selection", async () => {
  const pkg = JSON.parse(await readFile(path.join(packageRoot, "package.json")));
  for (const env of ["dev", "prod"]) assert.equal(pkg.scripts[`infra:synth:${env}`],
    `npm run check:runtime && cdk synth --no-lookups --quiet --context shelfstateEnvironment=${env} --output cdk.out/${env}`);
});
test("native CDK --no-lookups fails on a synthetic context-provider request without writing context", { timeout: 90000 }, async () => {
  const parent = path.join(packageRoot, "cdk.out"); await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, "lookup-denial-"));
  try {
    const app = `const {App,Stack,aws_ssm}=require(${JSON.stringify(path.join(packageRoot, "node_modules/aws-cdk-lib"))});
const app=new App(); const stack=new Stack(app,'Fixture',{env:{account:'111111111111',region:'us-west-2'}});
aws_ssm.StringParameter.valueFromLookup(stack,'/shelfstate-offline-fixture'); app.synth();`;
    await writeFile(path.join(root, "app.cjs"), app);
    const result = spawnSync(process.execPath, [path.join(packageRoot, "node_modules/aws-cdk/bin/cdk"), "synth", "--no-lookups", "--app", "node app.cjs", "--output", "assembly", "--notices", "false"],
      { cwd: root, env: credentialFreeEnvironment(), encoding: "utf8", timeout: 75000 });
    assert.ifError(result.error); assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /Context lookups have been disabled/);
    const manifest = JSON.parse(await readFile(path.join(root, "assembly/manifest.json")));
    assert.ok(manifest.missing.some(m => m.provider === "ssm"));
    await assert.rejects(access(path.join(root, "cdk.context.json")), { code: "ENOENT" });
  } finally { await rm(root, { recursive: true, force: true }); }
});
