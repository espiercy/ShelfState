import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, rm, cp, symlink, link, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { canonical, hashObject, hash, parseEvidenceJson } from "../scripts/release/schema.mjs";
import { artifactPath, inventory, validateInventory, verifyInventory } from "../scripts/release/artifacts.mjs";
import { createManifest, verifyManifest, validateManifest } from "../scripts/release/evidence.mjs";
import { verifyLocalRevision } from "../scripts/release/revisions.mjs";
import { readAssembly, assessTransition, requireSafeTransition } from "../scripts/release/assemblies.mjs";
import { selectRollback } from "../scripts/release/rollback.mjs";
import { ACTION_PINS } from "../scripts/release/policy.mjs";
import { inertRole, validateRoleReadback, expectedRuleset, expectedEnvironment, validateSettings } from "../security/oidc-release-policies.mjs";
import { trustDesign } from "./support/release-control-design.mjs";
import { validateWorkflowSource } from "../scripts/release/workflow-source.mjs";
import devWorkflow from "../scripts/release/templates/v4-dev-release.mjs";
import prodWorkflow from "../scripts/release/templates/v4-production-release.mjs";
import { CAPABILITY_DEFINITIONS } from "../infrastructure/lib/capabilities.mjs";

const v4 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scratch = path.join(v4, "cdk.out");
const clone = structuredClone, sha = "a".repeat(40), controller = "b".repeat(40), digest = "c".repeat(64);
async function temporary(fn) {
  await mkdir(scratch, { recursive: true }); const root = await mkdtemp(path.join(scratch, "wp006b-test-"));
  try { return await fn(root); } finally { await rm(root, { recursive: true, force: true }); }
}
const json = (file, value) => writeFile(file, JSON.stringify(value));
const fixtureBytes = new WeakMap();
async function rememberFixture(root, env) {
  const snapshot = await readAssembly(root, env);
  fixtureBytes.set(snapshot, new Map(await Promise.all(snapshot.files.map(async f => [f.path, await readFile(path.join(root, f.path))]))));
  return snapshot;
}
// Safety fixtures must pass through the same byte-backed reader as production
// callers. Never mint a semantic snapshot by changing its canonical digest.
async function reviseFiles(snapshot, mutate) {
  const files = new Map([...fixtureBytes.get(snapshot)].map(([name, bytes]) => [name, Buffer.from(bytes)]));
  const edit = (name, fn) => { const value = JSON.parse(files.get(name)); fn(value); files.set(name, Buffer.from(JSON.stringify(value))); };
  mutate(edit, files);
  return temporary(async root => {
    for (const [name, bytes] of files) await writeFile(path.join(root, name), bytes);
    return rememberFixture(root, snapshot.environment);
  });
}
function context(env = "dev") {
  return { repository: "espiercy/ShelfState", candidateSha: sha, checkoutSha: sha, controllerSha: controller, mainSha: controller,
    workflowPath: `.github/workflows/v4-${env}-release.yml`, workflowDigest: digest, environment: env,
    runId: "123", runAttempt: 1, createdAt: "2026-10-01T10:00:00.000Z", nodeVersion: "24.13.0", npmVersion: "11.6.2",
    lockfileDigest: digest, configurationDigest: digest, baselineDigest: digest, previewDigest: digest, actionPins: { ...ACTION_PINS }, artifactId: "456" };
}
async function assemblyFixture(root, env = "dev") {
  const artifacts = {}, cdkEnv = env === "production" ? "prod" : env;
  for (const [i, capability] of CAPABILITY_DEFINITIONS.entries()) {
    const id = `Stack${i}`, templateFile = `${id}.template.json`, region = i === 0 ? "us-east-1" : "us-west-2";
    const template = { Metadata: { ShelfState: { Capability: capability.key, Environment: cdkEnv, Region: region, WorkPackage: "WP-003" } }, Resources: {} };
    await json(path.join(root, templateFile), template);
    artifacts[id] = { type: "aws:cloudformation:stack", environment: `aws://unknown-account/${region}`,
      properties: { templateFile, stackName: `shelfstate-v4-${cdkEnv}-${capability.key}`, terminationProtection: env === "production" }, dependencies: [] };
  }
  await json(path.join(root, "manifest.json"), { version: "54.0.0", artifacts, minimumCliVersion: "2.1141.0" });
  return rememberFixture(root, env);
}
async function reviseTemplate(snapshot, fn, stack = 0) {
  return reviseFiles(snapshot, edit => edit(snapshot.stacks[stack].templatePath, fn));
}
const retainedTable = () => ({ Type: "AWS::DynamoDB::Table", Metadata: { ShelfStateStatefulPolicy: "retained" },
  DeletionPolicy: "Retain", UpdateReplacePolicy: "Retain", Properties: { DeletionProtectionEnabled: true } });

test("manifest round trip hashes raw bytes and is deterministic without self-reference", () => temporary(async root => {
  await writeFile(path.join(root, "payload.bin"), Buffer.from([0, 255, 13, 10]));
  const m = await createManifest(root, context());
  assert.equal(canonical(m), canonical(await createManifest(root, context())));
  assert.equal(m.files[0].sha256, hash(Buffer.from([0, 255, 13, 10])));
  assert.equal((await verifyManifest(root, m, context())).manifestDigest, hashObject(m));
}));

test("JSON ingress rejects duplicate keys, malformed UTF-8 and ambiguous/non-JSON data", () => {
  assert.deepEqual(parseEvidenceJson(Buffer.from('{"x":[1,true,null,"a\\\"b"]}')), { x: [1, true, null, 'a"b'] });
  for (const input of ['{"x":1,"x":2}', '{"a":{"x":1,"x":2}}', '{"x":1,}', '[1,]', 'true false', '{"__proto__":{}}', '1e999', '"unterminated'])
    assert.throws(() => parseEvidenceJson(Buffer.from(input)));
  assert.throws(() => parseEvidenceJson(Buffer.from([0xff])));
});

for (const [label, mutate] of [
  ["short SHA", c => { c.candidateSha = "abc"; }],
  ["shell SHA", c => { c.candidateSha = sha + ";echo"; }],
  ["uppercase SHA", c => { c.candidateSha = "A".repeat(40); }],
  ["wrong candidate", c => { c.candidateSha = controller; }],
  ["wrong controller", c => { c.controllerSha = sha; }],
  ["changed controller file", c => { c.workflowDigest = "d".repeat(64); }],
  ["wrong environment", c => { c.environment = "production"; }],
  ["wrong run attempt", c => { c.runAttempt = 2; }],
  ["wrong run", c => { c.runId = "999"; }],
  ["wrong artifact producer identity", c => { c.artifactId = "999"; }],
  ["missing provenance", c => { delete c.mainSha; }],
  ["extra field", c => { c.allowUnsafe = true; }],
  ["mutable action", c => { c.actionPins.upload = "actions/upload-artifact@main"; }],
  ["unsupported Node", c => { c.nodeVersion = "22.0.0"; }],
  ["invalid timestamp", c => { c.createdAt = "2026-02-30T10:00:00.000Z"; }],
]) test(`manifest rejects ${label}`, () => temporary(async root => {
  await writeFile(path.join(root, "a"), "one"); const m = await createManifest(root, context()); mutate(m.context);
  await assert.rejects(verifyManifest(root, m, context()));
}));

test("manifest rejects unsupported schemas and missing/unknown fields", () => temporary(async root => {
  await writeFile(path.join(root, "a"), "one"); const m = await createManifest(root, context());
  for (const patch of [{ schema: "v2" }, { files: [] }, { unknown: true }]) assert.throws(() => validateManifest({ ...m, ...patch }));
  const incomplete = clone(m); delete incomplete.files; assert.throws(() => validateManifest(incomplete));
}));

for (const unsafe of ["../a", "a/../b", "/a", "C:/a", "C:a", "a\\b", "a//b", "./a", "a/.", "a/CON.txt", "a/file.", "a:stream", "a\u0000b"])
  test(`artifact path rejects ${JSON.stringify(unsafe)}`, () => assert.throws(() => artifactPath(unsafe)));

test("inventory rejects duplicate/case-alias paths, unsorted entries and file-directory confusion", () => {
  const a = { path: "a", bytes: 1, sha256: digest };
  for (const files of [[a, a], [{ ...a, path: "A" }, a], [{ ...a, path: "z" }, a], [a, { ...a, path: "a/b" }]]) assert.throws(() => validateInventory(files));
});
for (const mode of ["missing", "extra", "changed", "directory"])
  test(`artifact verification rejects ${mode}`, () => temporary(async root => {
    await writeFile(path.join(root, "a"), "one"); const files = await inventory(root);
    if (mode === "extra") await writeFile(path.join(root, "b"), "two");
    if (mode === "changed") await writeFile(path.join(root, "a"), "two");
    if (["missing", "directory"].includes(mode)) await rm(path.join(root, "a"));
    if (mode === "directory") { await mkdir(path.join(root, "a")); await writeFile(path.join(root, "a", "nested"), "one"); }
    await assert.rejects(verifyInventory(root, files));
  }));
test("hard-linked artifact files are rejected", () => temporary(async root => {
  await writeFile(path.join(root, "a"), "one"); await link(path.join(root, "a"), path.join(root, "b"));
  await assert.rejects(inventory(root), /Linked/);
}));
test("linked directory/junction and linked artifact root are rejected", () => temporary(async root => {
  await mkdir(path.join(root, "real")); await writeFile(path.join(root, "real", "a"), "one");
  await symlink(path.join(root, "real"), path.join(root, "linked"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(inventory(root), /Linked/); await assert.rejects(inventory(path.join(root, "linked")), /Linked/);
}));

test("local Git verifies exact clean checkout/ancestry without changing repository", () => temporary(async root => {
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null" } }).trim();
  git("init", "-b", "main"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
  await writeFile(path.join(root, "a"), "one"); git("add", "a"); git("commit", "-m", "fixture"); const first = git("rev-parse", "HEAD");
  await writeFile(path.join(root, "a"), "two"); git("commit", "-am", "fixture two"); const tip = git("rev-parse", "HEAD");
  const binding = { candidateSha: tip, controllerSha: first, mainSha: tip };
  assert.throws(() => verifyLocalRevision(root, binding), /Detached/);
  git("checkout", "--detach", tip);
  assert.equal(verifyLocalRevision(root, binding).evidenceKind, "local-git-only");
  git("update-index", "--assume-unchanged", "a");
  assert.throws(() => verifyLocalRevision(root, binding), /Hidden/);
  git("update-index", "--no-assume-unchanged", "a");
  assert.throws(() => verifyLocalRevision(root, { ...binding, candidateSha: first }), /Wrong checkout/);
  assert.throws(() => verifyLocalRevision(root, { ...binding, mainSha: first }), /Wrong recorded main/);
  assert.throws(() => verifyLocalRevision(root, { ...binding, controllerSha: "main" }));
  git("checkout", "--orphan", "unrelated"); git("commit", "-am", "unrelated"); const unrelated = git("rev-parse", "HEAD"); git("checkout", "--detach", tip);
  assert.throws(() => verifyLocalRevision(root, { ...binding, controllerSha: unrelated }));
  await writeFile(path.join(root, "untracked"), "x"); assert.throws(() => verifyLocalRevision(root, binding), /Dirty/);
}));

test("offline assembly reader/preview accepts exactly the empty foundation in either environment", () => temporary(async root => {
  for (const env of ["dev", "production"]) {
    const dir = path.join(root, env); await mkdir(dir); const s = await assemblyFixture(dir, env);
    const p = requireSafeTransition(s, s); assert.equal(s.stacks.length, 6); assert.equal(p.allowed, true);
    assert.equal(p.evidenceKind, "offline-recorded-only"); assert.ok(p.stackChanges.every(c => c.action === "Unchanged"));
    assert.equal(canonical(p), canonical(assessTransition(s, s)));
  }
}));
test("assembly reader rejects unsupported schema, missing context, nested assemblies and missing templates", () => temporary(async root => {
  await assemblyFixture(root); const file = path.join(root, "manifest.json"), m = JSON.parse(await readFile(file));
  for (const mutate of [x => { x.version = "55.0.0"; }, x => { x.missing = [{ key: "lookup" }]; },
    x => { x.artifacts.Nested = { type: "cdk:cloud-assembly" }; }, x => { x.artifacts.Stack0.properties.templateFile = "missing.json"; },
    x => { x.artifacts.Stack0.properties.templateFile = "../outside"; }, x => { x.artifacts.Stack0.dependencies = ["Absent"]; }]) {
    const value = clone(m); mutate(value); await json(file, value); await assert.rejects(readAssembly(root, "dev"));
  }
}));
test("preview inventories added/changed/removed stacks and rejects incomplete topology", () => temporary(async root => {
  const before = await assemblyFixture(root);
  const removed = await reviseFiles(before, edit => edit("manifest.json", m => { delete m.artifacts.Stack5; }));
  const removal = assessTransition(before, removed); assert.equal(removal.allowed, false); assert.ok(removal.stackChanges.some(c => c.action === "Remove"));
  const addition = assessTransition(removed, before); assert.equal(addition.allowed, false); assert.ok(addition.stackChanges.some(c => c.action === "Add"));
  const changed = await reviseTemplate(before, t => { t.Description = "reviewable metadata change"; });
  assert.ok(assessTransition(before, changed).stackChanges.some(c => c.action === "Modify"));
  await assert.rejects(reviseFiles(before, edit => edit("manifest.json", m => { m.artifacts.Duplicate = clone(m.artifacts.Stack0); })), /duplicate/i);
}));
test("non-empty fixtures cannot establish safe resource/replacement semantics", () => temporary(async root => {
  const empty = await assemblyFixture(root, "production");
  const before = await reviseTemplate(empty, t => { t.Resources.Durable = retainedTable(); });
  assert.equal(assessTransition(before, before).allowed, false);
  for (const mutate of [
    t => { delete t.Resources.Durable; }, t => { t.Resources.Durable.Type = "AWS::S3::Bucket"; },
    t => { t.Resources.Durable.DeletionPolicy = "Delete"; }, t => { t.Resources.Durable.UpdateReplacePolicy = "Delete"; },
    t => { t.Resources.Durable.Properties.DeletionProtectionEnabled = false; }, t => { delete t.Resources.Durable.Metadata; },
    t => { t.Transform = "UnknownMacro"; }, t => { t.Resources.Nested = { Type: "AWS::CloudFormation::Stack" }; },
    t => { t.Resources.Durable.Properties.UnknownConditionalReplacement = { "Fn::If": ["x", 1, 2] }; },
  ]) {
    const after = await reviseTemplate(before, mutate); assert.equal(assessTransition(before, after).allowed, false);
    assert.throws(() => requireSafeTransition(before, after), /blocked/);
  }
}));
test("Governance lock and backup changes remain blocked", () => temporary(async root => {
  const empty = await assemblyFixture(root, "production");
  const before = await reviseTemplate(empty, t => { t.Resources.Vault = { ...retainedTable(), Type: "AWS::Backup::BackupVault", Properties: { LockConfiguration: { MinRetentionDays: 90 } } }; });
  const after = await reviseTemplate(before, t => { t.Resources.Vault.Properties.LockConfiguration.ChangeableForDays = 3; });
  const p = assessTransition(before, after); assert.equal(p.allowed, false); assert.ok(p.issues.some(i => i.includes("Governance")));
}));
test("snapshot mismatch and unknown evidence fail before safety assessment", () => temporary(async root => {
  const before = await assemblyFixture(root);
  for (const mutate of [s => { s.schema = "v2"; }, s => { s.stacks[0].template.Description = "not bound"; }, s => { delete s.files; }, s => { s.environment = "production"; }, s => { s.approved = true; }]) {
    const value = clone(before); mutate(value); assert.throws(() => assessTransition(before, value));
  }
}));

for (const [label, mutate] of [
  ["parsed template plus recomputed canonical digest", s => { s.stacks[0].template.Description = "substituted"; s.stacks[0].templateDigest = hashObject(s.stacks[0].template); }],
  ["falsified raw template hash", s => { s.files.find(f => f.path === s.stacks[0].templatePath).sha256 = "f".repeat(64); }],
  ["stack inventory inconsistent with manifest", s => { s.stacks.pop(); }],
  ["template path redirected to different retained bytes", s => { s.stacks[0].templatePath = s.stacks[1].templatePath; s.stacks[0].properties.templateFile = s.stacks[1].templatePath; }],
  ["template digest copied from different bytes", s => { s.stacks[0].templateDigest = s.stacks[1].templateDigest; }],
  ["self-consistent semantic and raw-hash substitution without retained bytes", s => {
    s.stacks[0].template.Description = "unretained substitution";
    s.stacks[0].templateDigest = hashObject(s.stacks[0].template);
    const bytes = Buffer.from(JSON.stringify(s.stacks[0].template));
    Object.assign(s.files.find(f => f.path === s.stacks[0].templatePath), { bytes: bytes.length, sha256: hash(bytes) });
  }],
]) test(`R1 rejects ${label} on either transition side`, () => temporary(async root => {
  const verified = await assemblyFixture(root), supplied = clone(verified); mutate(supplied);
  assert.throws(() => assessTransition(verified, supplied), /reader-issued/);
  assert.throws(() => assessTransition(supplied, verified), /reader-issued/);
}));

test("R1 reader snapshots are deeply immutable and a fresh byte reload remains valid", () => temporary(async root => {
  const verified = await assemblyFixture(root);
  function checkFrozen(value) {
    if (value && typeof value === "object") { assert.ok(Object.isFrozen(value)); Object.values(value).forEach(checkFrozen); }
  }
  checkFrozen(verified);
  assert.throws(() => { verified.stacks[0].template.Description = "substituted"; }, TypeError);
  assert.throws(() => { verified.files[0].sha256 = digest; }, TypeError);
  assert.throws(() => { verified.stacks.pop(); }, TypeError);
  assert.equal(requireSafeTransition(verified, await readAssembly(root, "dev")).allowed, true);
  assert.throws(() => assessTransition(verified, JSON.parse(JSON.stringify(verified))), /reader-issued/);
}));

// Shape taken from the actual schema-54 foundation asset manifest: file source,
// opaque destination ID, bucket/object/region/role. Account is represented in
// destination ID and ARN/bucket interpolation, NOT an invented accountId field.
async function assetAssemblyFixture(root, env = "dev") {
  const initial = await assemblyFixture(root, env), source = initial.stacks[0].templatePath;
  const assetId = hash(await readFile(path.join(root, source)));
  const asset = { version: "54.0.0", files: { [assetId]: {
    displayName: "Foundation template", source: { path: source, packaging: "file" },
    destinations: { "current_account-us-east-1-fixture": {
      bucketName: "cdk-hnb659fds-assets-${AWS::AccountId}-us-east-1", objectKey: `${assetId}.json`, region: "us-east-1",
      assumeRoleArn: "arn:${AWS::Partition}:iam::${AWS::AccountId}:role/cdk-hnb659fds-file-publishing-role-${AWS::AccountId}-us-east-1",
    } },
  } }, dockerImages: {} };
  await json(path.join(root, "Stack0.assets.json"), asset);
  const manifest = JSON.parse(await readFile(path.join(root, "manifest.json")));
  manifest.artifacts["Stack0.assets"] = { type: "cdk:asset-manifest", properties: {
    file: "Stack0.assets.json", requiresBootstrapStackVersion: 6, bootstrapStackVersionSsmParameter: "/cdk-bootstrap/hnb659fds/version",
  } };
  manifest.artifacts.Stack0.dependencies = ["Stack0.assets"];
  await json(path.join(root, "manifest.json"), manifest);
  return rememberFixture(root, env);
}
const firstAsset = a => Object.values(a.files)[0];
const firstDestination = a => Object.values(firstAsset(a).destinations)[0];

test("R2 unchanged supported asset configuration passes in both environments", () => temporary(async root => {
  for (const env of ["dev", "production"]) {
    const dir = path.join(root, env); await mkdir(dir);
    const verified = await assetAssemblyFixture(dir, env), reloaded = await readAssembly(dir, env);
    assert.equal(requireSafeTransition(verified, reloaded).allowed, true);
    assert.deepEqual(verified.assetManifests["Stack0.assets"], JSON.parse(await readFile(path.join(dir, "Stack0.assets.json"))));
    assert.ok(Object.isFrozen(firstDestination(verified.assetManifests["Stack0.assets"])));
  }
}));

for (const [label, mutate] of [
  ["bucket", a => { firstDestination(a).bucketName = "different-fixture-bucket"; }],
  ["account in role ARN", a => { firstDestination(a).assumeRoleArn = firstDestination(a).assumeRoleArn.replace("${AWS::AccountId}", "1".repeat(12)); }],
  ["account in destination identifier", a => { const d = firstAsset(a).destinations, key = Object.keys(d)[0]; d["1".repeat(12) + "-us-east-1-fixture"] = d[key]; delete d[key]; }],
  ["region", a => { firstDestination(a).region = "us-west-2"; }],
  ["publishing role", a => { firstDestination(a).assumeRoleArn += "-different"; }],
  ["object key", a => { firstDestination(a).objectKey = "different.json"; }],
  ["destination identifier", a => { const d = firstAsset(a).destinations; d.second = clone(firstDestination(a)); delete d[Object.keys(d)[0]]; }],
]) test(`R2 rejects changed asset ${label}`, () => temporary(async root => {
  const before = await assetAssemblyFixture(root);
  const after = await reviseFiles(before, edit => edit("Stack0.assets.json", mutate));
  const result = assessTransition(before, after);
  assert.equal(result.allowed, false);
  assert.ok(result.issues.includes("Asset publishing configuration change requires separate review"));
  assert.throws(() => requireSafeTransition(before, after), /Asset publishing/);
}));

for (const [label, file, mutate] of [
  ["stack artifact field", "manifest.json", m => { m.artifacts.Stack0.unknownExecution = true; }],
  ["asset artifact field", "manifest.json", m => { m.artifacts["Stack0.assets"].unknownExecution = true; }],
  ["asset artifact property", "manifest.json", m => { m.artifacts["Stack0.assets"].properties.unknownExecution = true; }],
  ["asset-manifest field", "Stack0.assets.json", a => { a.unknownExecution = true; }],
  ["file-asset field", "Stack0.assets.json", a => { firstAsset(a).unknownExecution = true; }],
  ["destination field", "Stack0.assets.json", a => { firstDestination(a).unknownExecution = true; }],
  ["unsupported STS options", "Stack0.assets.json", a => { firstDestination(a).assumeRoleAdditionalOptions = {}; }],
  ["unsupported external ID", "Stack0.assets.json", a => { firstDestination(a).assumeRoleExternalId = "fixture"; }],
  ["source executable", "Stack0.assets.json", a => { firstAsset(a).source.executable = ["untrusted"]; }],
  ["unknown lookup-role option", "manifest.json", m => { m.artifacts.Stack0.properties.lookupRole = { arn: "fixture", unknownExecution: true }; }],
  ["unsupported metadata semantics", "manifest.json", m => { m.artifacts.Stack0.metadata = { "/Stack0": [{ type: "aws:cdk:asset", data: {} }] }; }],
  ["tree artifact field", "manifest.json", m => { m.artifacts.Tree = { type: "cdk:tree", properties: { file: "tree.json" }, unknownExecution: true }; }],
  ["feature report field", "manifest.json", m => { m.artifacts.Flags = { type: "cdk:feature-flag-report", properties: { module: "fixture", flags: {}, unknownExecution: true } }; }],
]) test(`R2 rejects ${label} at byte ingestion`, () => temporary(async root => {
  const before = await assetAssemblyFixture(root);
  await assert.rejects(reviseFiles(before, edit => edit(file, mutate)), /unsupported/i);
}));

test("R2 rejects destination omission and malformed destination types", () => temporary(async root => {
  const before = await assetAssemblyFixture(root);
  for (const mutate of [a => { firstAsset(a).destinations = {}; }, a => { delete firstDestination(a).region; }, a => { firstDestination(a).bucketName = 42; }])
    await assert.rejects(reviseFiles(before, edit => edit("Stack0.assets.json", mutate)));
}));

test("R2 rejects malformed optional fields and changed CLI requirements", () => temporary(async root => {
  const before = await assetAssemblyFixture(root);
  for (const mutate of [m => { m.minimumCliVersion = "999.0.0"; }, m => { m.missing = false; },
    m => { m.artifacts.Stack0.metadata = null; }, m => { m.artifacts.Stack0.additionalMetadataFile = ""; },
    m => { m.artifacts.Stack0.properties.lookupRole = false; }, m => { m.artifacts.Stack0.properties.tags = null; },
    m => { m.artifacts.Stack0.properties.additionalDependencies = false; }])
    await assert.rejects(reviseFiles(before, edit => edit("manifest.json", mutate)));
}));

test("R2 retains artifact selection/dependency settings and blocks their changes", () => temporary(async root => {
  const before = await assetAssemblyFixture(root);
  for (const mutate of [m => { m.artifacts.Stack0.displayName = "different-selector"; }, m => { m.artifacts.Stack0.dependencies = []; },
    m => { m.artifacts["Stack0.assets"].properties.requiresBootstrapStackVersion = 7; }]) {
    const after = await reviseFiles(before, edit => edit("manifest.json", mutate));
    assert.throws(() => requireSafeTransition(before, after), /artifact\/execution/);
  }
}));

async function rollbackFixture(root) {
  const assembly = await assemblyFixture(root); const c = context(); const manifest = await createManifest(root, c);
  const record = { schema: "shelfstate.release-result/v1", id: "synthetic-record", repository: c.repository, environment: "dev",
    candidateSha: c.candidateSha, buildControllerSha: c.controllerSha, rollbackControllerSha: "d".repeat(40), manifestDigest: hashObject(manifest),
    runId: c.runId, runAttempt: c.runAttempt, artifactId: c.artifactId, kind: "application-deployment", deployment: "SUCCEEDED", smoke: "SUCCEEDED", acceptance: "SUCCEEDED",
    completedAt: "2026-10-01T11:00:00.000Z", expiresAt: "2026-10-02T11:00:00.000Z", safetyPolicy: "shelfstate.offline-empty/v1", artifactRetained: true };
  return { record, expected: clone(record), manifest, expectedContext: c, artifactRoot: root, currentAssembly: assembly, targetAssembly: assembly, now: "2026-10-01T12:00:00.000Z" };
}
test("synthetic known-good record selects retained bytes for offline dry run only", () => temporary(async root => {
  const f = await rollbackFixture(root), result = await selectRollback(f);
  assert.equal(result.mode, "offline-dry-run-only"); assert.equal(result.candidateSha, sha);
}));
for (const [label, patch] of [
  ["failed", { deployment: "FAILED" }], ["canceled", { deployment: "CANCELED" }], ["failed smoke", { smoke: "FAILED" }],
  ["incomplete acceptance", { acceptance: "PENDING" }], ["proof only", { kind: "identity-proof" }],
  ["expired", { expiresAt: "2026-10-01T11:30:00.000Z" }], ["wrong environment", { environment: "production" }],
  ["wrong SHA", { candidateSha: controller }], ["wrong build controller", { buildControllerSha: sha }],
  ["wrong safety policy", { safetyPolicy: "older-policy" }], ["not retained", { artifactRetained: false }],
  ["wrong attempt", { runAttempt: 2 }], ["wrong hash", { manifestDigest: "e".repeat(64) }],
]) test(`rollback rejects ${label} even in consistent supplied record`, () => temporary(async root => {
  const f = await rollbackFixture(root); Object.assign(f.record, patch); f.expected = clone(f.record);
  await assert.rejects(selectRollback(f));
}));
test("rollback rejects changed controller provenance, missing bytes and current unsafe state", () => temporary(async root => {
  const f = await rollbackFixture(root); const mismatch = clone(f.record); mismatch.rollbackControllerSha = sha;
  await assert.rejects(selectRollback({ ...f, record: mismatch }), /provenance/);
  const unsafe = await reviseTemplate(f.currentAssembly, t => { t.Resources.Durable = retainedTable(); });
  await assert.rejects(selectRollback({ ...f, currentAssembly: unsafe }), /blocked/);
  await writeFile(path.join(root, "Stack0.template.json"), "{}"); await assert.rejects(selectRollback(f));
  await rm(path.join(root, "Stack0.template.json")); await assert.rejects(selectRollback(f));
}));

test("inert role materialization equals WP-006A exact trust in both environments", () => {
  const account = "1".repeat(12);
  for (const env of ["dev", "production"]) {
    const role = inertRole(account, env); assert.deepEqual(role.AssumeRolePolicyDocument, trustDesign(account, env));
    assert.doesNotThrow(() => validateRoleReadback({ complete: true, account, role }, account, env));
    for (const mutate of [r => { r.AttachedPolicies.push("AdministratorAccess"); }, r => { r.InlinePolicies.push({}); },
      r => { r.MaxSessionDuration = 7200; }, r => { r.Path = "/other/"; }, r => { r.AssumeRolePolicyDocument.Statement[0].Principal.Federated = "*"; },
      r => { r.AssumeRolePolicyDocument.Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"] = "repo:*"; }]) {
      const bad = clone(role); mutate(bad); assert.throws(() => validateRoleReadback({ complete: true, account, role: bad }, account, env));
    }
    assert.throws(() => validateRoleReadback({ complete: false, account, role }, account, env));
  }
});
test("settings validator rejects broadened/partial controls and preserves one-human approval", () => {
  const settings = { complete: true, ruleset: expectedRuleset(42), environments: [expectedEnvironment("dev", 7), expectedEnvironment("production", 7)] };
  assert.doesNotThrow(() => validateSettings(settings, 7, 42));
  for (const mutate of [s => { s.complete = false; }, s => { s.ruleset.enforcement = "disabled"; }, s => { s.ruleset.bypass_actors = [{ actor_id: 7 }]; },
    s => { s.ruleset.rules[1].parameters.required_status_checks.pop(); }, s => { s.environments[1].reviewers = []; },
    s => { s.environments[1].can_admins_bypass = true; }, s => { s.environments[1].branchPolicies[0].type = "tag"; },
    s => { s.environments[1].branchPolicies[0].name = "*"; }, s => { s.environments[1].reviewers[0].id = 8; }]) {
    const bad = clone(settings); mutate(bad); assert.throws(() => validateSettings(bad, 7, 42));
  }
});

test("exactly two source entries validate effective proof-only job structure", async () => {
  assert.deepEqual((await readdir(path.join(v4, "scripts/release/templates"))).sort(), ["v4-dev-release.mjs", "v4-production-release.mjs"]);
  for (const [env, source] of [["dev", devWorkflow], ["production", prodWorkflow]]) {
    assert.doesNotThrow(() => validateWorkflowSource(source, env)); assert.equal(source.activation, "local-yaml-review-only");
    assert.equal(source.jobs.proof.environment, env);
    assert.deepEqual(source.jobs.proof.needs, ["prepare"]);
    assert.equal(source.jobs.prepare.steps[1].with["node-version-file"], "v4/.nvmrc");
  }
});
for (const [label, mutate] of [
  ["PR trigger", w => { w.on.pull_request = {}; }], ["top-level OIDC", w => { w.permissions["id-token"] = "write"; }],
  ["prepare OIDC", w => { w.jobs.prepare.permissions["id-token"] = "write"; }], ["prepare environment", w => { w.jobs.prepare.environment = "production"; }],
  ["permission broadening", w => { w.jobs.proof.permissions.contents = "write"; }], ["gate bypass", w => { delete w.jobs.proof.environment; }],
  ["mutable action", w => { w.jobs.prepare.steps[0].uses = "actions/checkout@main"; }], ["wrong controller checkout", w => { w.jobs.proof.steps[0].with.ref = "${{ inputs.commit_sha }}"; }],
  ["automatic cache", w => { w.jobs.prepare.steps[1].with["package-manager-cache"] = true; }], ["missing cache input", w => { delete w.jobs.proof.steps[1].with["package-manager-cache"]; }],
  ["cache action", w => { w.jobs.prepare.steps.push({ uses: "actions/cache@" + sha }); }], ["ad hoc cache", w => { w.jobs.prepare.steps.push({ run: "restore-cache" }); }],
  ["continue on error", w => { w.jobs.prepare["continue-on-error"] = true; }], ["missing audit controller", w => { w.jobs.prepare.steps.splice(3, 1); }],
  ["unbound artifact", w => { w.jobs.proof.env.PAYLOAD_ID = "latest"; }], ["application deployment", w => { w.jobs.proof.steps.push({ run: "cdk deploy" }); }],
  ["automatic cancellation", w => { w.concurrency["cancel-in-progress"] = true; }],
]) test(`inactive workflow rejects ${label}`, () => {
  for (const [env, source] of [["dev", devWorkflow], ["production", prodWorkflow]]) {
    const bad = clone(source); mutate(bad); assert.throws(() => validateWorkflowSource(bad, env));
  }
});

test("security processing import graph loads only pure local modules and Node built-ins", async () => {
  const visited = new Set();
  async function walk(file) {
    if (visited.has(file)) return; visited.add(file); const source = await readFile(file, "utf8");
    for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["']([^"']+)["']/g)) {
      const specifier = match[1]; if (specifier.startsWith("node:")) continue;
      assert.ok(specifier.startsWith("."), `External dependency: ${specifier}`);
      const target = path.resolve(path.dirname(file), specifier); assert.ok(target.startsWith(v4 + path.sep)); await walk(target);
    }
    assert.ok(!/\b(?:fetch|eval)\s*\(/.test(source), "Network/evaluation in offline security processing");
  }
  for (const name of ["artifacts", "evidence", "revisions", "assemblies", "rollback", "workflow-source"]) await walk(path.join(v4, `scripts/release/${name}.mjs`));
  await walk(path.join(v4, "security/oidc-release-policies.mjs"));
  await walk(path.join(v4, "checks/support/release-control-design.mjs"));
  assert.ok(![...visited].some(f => f.endsWith("topology.mjs")));
});
