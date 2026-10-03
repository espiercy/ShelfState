import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm, access, symlink, unlink } from "node:fs/promises";
import os from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { credentialFreeEnvironment } from "../scripts/release/offline-environment.mjs";
import { snapshotContextFile, assertContextFileUnchanged } from "../scripts/release/controller.mjs";
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const stripped = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_SECURITY_TOKEN", "AWS_PROFILE", "AWS_DEFAULT_PROFILE",
  "AWS_ROLE_ARN", "AWS_WEB_IDENTITY_TOKEN_FILE", "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI", "AWS_CONTAINER_CREDENTIALS_FULL_URI",
  "AWS_CONTAINER_AUTHORIZATION_TOKEN", "AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE", "CDK_DEFAULT_ACCOUNT", "CDK_DEFAULT_REGION"];

async function contextFixture(check) {
  const root = await mkdtemp(path.join(os.tmpdir(), "shelfstate-context-state-"));
  try { await check(path.join(root, "cdk.context.json"), root); }
  finally { await rm(root, { recursive: true, force: true }); }
}
test("context absent to absent passes", () => contextFixture(async file => {
  assert.deepEqual(snapshotContextFile(file), { type: "absent" });
  assert.doesNotThrow(() => assertContextFileUnchanged(file, { type: "absent" }));
}));
test("context absent to regular rejects", () => contextFixture(async file => {
  const before = snapshotContextFile(file); await writeFile(file, "{}");
  assert.throws(() => assertContextFileUnchanged(file, before), /context-file state\/content change/);
}));
test("context unchanged regular bytes pass using an independent literal digest", () => contextFixture(async file => {
  await writeFile(file, "{}");
  const expected = { type: "regular", digest: "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a" };
  assert.deepEqual(snapshotContextFile(file), expected);
  assert.doesNotThrow(() => assertContextFileUnchanged(file, expected));
  await unlink(file); await writeFile(file, "{}"); // inode identity is deliberately not required
  assert.doesNotThrow(() => assertContextFileUnchanged(file, expected));
}));
for (const mutation of ["changed", "deleted", "directory"]) test(`context regular to ${mutation} rejects`, () => contextFixture(async file => {
  await writeFile(file, "{}"); const before = snapshotContextFile(file);
  if (mutation === "changed") await writeFile(file, "{\"changed\":true}");
  else { await unlink(file); if (mutation === "directory") await mkdir(file); }
  assert.throws(() => assertContextFileUnchanged(file, before), mutation === "directory" ? /context path type: non-regular/ : /context-file state\/content change/);
}));
test("context initial directory and absent to directory reject", () => contextFixture(async file => {
  await mkdir(file);
  assert.throws(() => snapshotContextFile(file), /context path type: non-regular/);
  assert.throws(() => assertContextFileUnchanged(file, { type: "absent" }), /context path type: non-regular/);
}));
for (const type of ["symbolic-link", "dangling-link", "junction", "directory", "fifo", "socket", "device"]) {
  test(`context mocked ${type} rejects before reading target bytes`, () => {
    let reads = 0;
    const linked = ["symbolic-link", "dangling-link", "junction"].includes(type);
    const io = { lstatSync: () => ({ isSymbolicLink: () => linked, isFile: () => false }), readFileSync: () => { reads++; return Buffer.from("{}"); } };
    const reason = linked ? /context path type: symbolic-link/ : /context path type: non-regular/;
    assert.throws(() => snapshotContextFile("fixture", io), reason);
    for (const before of [{ type: "absent" }, { type: "regular", digest: "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a" }])
      assert.throws(() => assertContextFileUnchanged("fixture", before, io), reason);
    assert.equal(reads, 0, "Must not follow a link or read a nonregular object");
  });
}
test("context lstat permission errors do not masquerade as absence", () => {
  const io = { lstatSync: () => { throw Object.assign(new Error("denied"), { code: "EACCES" }); }, readFileSync: () => assert.fail("must not read") };
  assert.throws(() => snapshotContextFile("fixture", io), { code: "EACCES" });
});
for (const kind of ["file", "dangling", "junction"]) test(`context real filesystem ${kind} link rejects when supported`, async t => contextFixture(async (file, root) => {
  const target = path.join(root, "target");
  if (kind === "file") await writeFile(target, "{}");
  if (kind === "junction") await mkdir(target);
  await writeFile(file, "{}"); const before = snapshotContextFile(file); await unlink(file);
  try { await symlink(target, file, kind === "junction" ? "junction" : "file"); }
  catch (error) {
    if (process.platform === "win32" && ["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
      t.skip(`Windows ${kind} creation unavailable (${error.code}); mocked classification remains mandatory`); return;
    }
    throw error;
  }
  assert.throws(() => snapshotContextFile(file), /context path type: symbolic-link/);
  assert.throws(() => assertContextFileUnchanged(file, before), /context path type: symbolic-link/);
  assert.throws(() => assertContextFileUnchanged(file, { type: "absent" }), /context path type: symbolic-link/);
}));
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
