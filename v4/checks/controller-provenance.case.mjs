import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { deflateRawSync } from "node:zlib";
import { dispatchContext, authenticateDispatch, requiredChecks, artifactEvidence, githubClient, CHECKS } from "../scripts/release/github-evidence.mjs";
import { createManifest, candidateEvidence, validateCandidateEvidence } from "../scripts/release/evidence.mjs";
import { fixtureModules } from "./support/approved-target-fixture.mjs";
const { evidence: { runtimeBinding, verifyRuntimeBinding } } = await fixtureModules();
import { pack, unpack, unwrapArtifact, decodeBundle } from "../scripts/release/payload-transfer.mjs";
import { canonical, hash, hashObject } from "../scripts/release/schema.mjs";
import { ACTION_PINS } from "../scripts/release/policy.mjs";
import { identityProof } from "../scripts/release/identity-proof.mjs";
import { outputs, assemblyEvidence } from "../scripts/release/controller.mjs";
import { CAPABILITY_DEFINITIONS } from "../infrastructure/lib/capabilities.mjs";

const candidate = "a".repeat(40), controller = "b".repeat(40), digest = "c".repeat(64), repo = "espiercy/ShelfState", prefix = `/repos/${repo}`;
const started = "2026-01-01T00:00:00.000Z";
const envFixture = () => ({ GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: repo, GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF: "refs/heads/main", GITHUB_REF_TYPE: "branch", RELEASE_ENVIRONMENT: "dev", CANDIDATE_SHA: candidate, GITHUB_WORKFLOW_SHA: controller, GITHUB_SHA: controller, GITHUB_WORKFLOW_REF: `${repo}/.github/workflows/v4-dev-release.yml@refs/heads/main`, GITHUB_RUN_ID: "100", GITHUB_RUN_ATTEMPT: "2" });
function fixtures() {
  const c = dispatchContext(envFixture());
  const run = { id: 100, run_attempt: 2, repository: { full_name: repo }, head_repository: { full_name: repo }, event: "workflow_dispatch", head_branch: "main", head_sha: controller, path: c.workflowPath, status: "in_progress", workflow_id: 42, run_started_at: started };
  const validation = { id: 90, run_attempt: 3, repository: { full_name: repo }, head_repository: { full_name: repo }, path: ".github/workflows/validation.yml", head_branch: "main", head_sha: candidate, event: "push", status: "completed", conclusion: "success", check_suite_id: 71 };
  const checks = CHECKS.map((name, i) => ({ name, id: 20 + i, app: { id: 15368 }, head_sha: candidate, check_suite: { id: 71 }, status: "completed", conclusion: "success" }));
  const jobs = checks.map(check => ({ id: check.id, name: check.name, check_run_url: `https://api.github.com${prefix}/check-runs/${check.id}`, run_attempt: 3, head_sha: candidate, conclusion: "success" }));
  const prepare = { id: 9, name: "prepare", run_attempt: 2, head_sha: controller, conclusion: "success", started_at: started, completed_at: "2026-01-01T00:02:00Z" };
  const artifact = { id: 123, name: "candidate-100-2", expired: false, digest: `sha256:${digest}`, size_in_bytes: 300, created_at: "2026-01-01T00:01:00Z", expires_at: "2099-01-01T00:00:00Z", workflow_run: { id: 100, head_sha: controller, head_branch: "main" } };
  const data = { run, validation, checks, jobs, prepare, artifact, workflow: { path: c.workflowPath, state: "active" }, main: { ref: "refs/heads/main", object: { type: "commit", sha: controller } } };
  const api = {
    async get(p) {
      if (p === prefix) return { full_name: repo, default_branch: "main", private: false };
      if (p === `${prefix}/git/ref/heads/main`) return data.main;
      if (p === `${prefix}/actions/workflows/42`) return data.workflow;
      if ([`${prefix}/actions/runs/100`, `${prefix}/actions/runs/100/attempts/2`].includes(p)) return data.run;
      if (p === `${prefix}/actions/runs/90`) return data.validation;
      if (p === `${prefix}/actions/artifacts/123`) return data.artifact;
      throw Error(`Unscripted fixture API ${p}`);
    },
    async pages(p, key) { return key === "workflow_runs" ? [data.validation] : data.checks; },
    async jobs(runId, attempt) { return String(runId) === "90" ? data.jobs : [data.prepare]; },
  };
  return { c, data, api };
}
test("fixture dispatch, exact checks and current-attempt artifact authenticate", async () => {
  const f = fixtures(); assert.equal((await authenticateDispatch(f.api, f.c)).mainSha, controller);
  assert.equal((await requiredChecks(f.api, candidate)).checks.length, 2);
  assert.equal((await artifactEvidence(f.api, f.c, "candidate", "123", started)).id, 123);
});
for (const [key, value] of Object.entries({ GITHUB_ACTIONS: "false", GITHUB_REPOSITORY: "foreign/repository", GITHUB_EVENT_NAME: "pull_request", GITHUB_REF: "refs/tags/main", GITHUB_REF_TYPE: "tag", CANDIDATE_SHA: "ABC", GITHUB_SHA: candidate, GITHUB_WORKFLOW_REF: `${repo}/foreign.yml@refs/heads/main`, GITHUB_RUN_ID: "0", GITHUB_RUN_ATTEMPT: "0" })) test(`dispatch rejects ${key}`, () => assert.throws(() => dispatchContext({ ...envFixture(), [key]: value })));
for (const [label, mutate] of [
  ["wrong controller", d => { d.run.head_sha = candidate; }],
  ["foreign repository", d => { d.run.head_repository.full_name = "foreign/repo"; }],
  ["wrong workflow", d => { d.workflow.path = "other.yml"; }],
  ["wrong run", d => { d.run.id = 99; }],
  ["wrong attempt", d => { d.run.run_attempt = 1; }],
  ["wrong main reference", d => { d.main.ref = "refs/tags/main"; }],
  ["wrong main object", d => { d.main.object.type = "tag"; }],
]) test(`service provenance rejects ${label}`, async () => { const f = fixtures(); mutate(f.data); await assert.rejects(authenticateDispatch(f.api, f.c)); });
for (const [label, mutate] of [
  ["failed audit aggregate", d => { d.validation.conclusion = "failure"; }],
  ["wrong candidate", d => { d.validation.head_sha = controller; }],
  ["foreign producer", d => { d.checks[0].app.id = 1; }],
  ["stale check suite", d => { d.checks[0].check_suite.id = 1; }],
  ["prior job attempt", d => { d.jobs[0].run_attempt = 1; }],
  ["foreign check job", d => { d.jobs[0].check_run_url += "0"; }],
  ["missing check", d => { d.checks.pop(); }],
  ["duplicate check", d => { d.checks.push(structuredClone(d.checks[0])); }],
  ["skipped check", d => { d.checks[0].conclusion = "skipped"; }],
]) test(`required checks reject ${label}`, async () => { const f = fixtures(); mutate(f.data); await assert.rejects(requiredChecks(f.api, candidate)); });
for (const [label, mutate] of [
  ["substituted artifact", d => { d.artifact.id = 999; }],
  ["foreign run", d => { d.artifact.workflow_run.id = 99; }],
  ["foreign controller", d => { d.artifact.workflow_run.head_sha = candidate; }],
  ["old attempt name", d => { d.artifact.name = "candidate-100-1"; }],
  ["prior attempt time", d => { d.artifact.created_at = "2025-01-01T00:00:00Z"; }],
  ["outside prepare window", d => { d.artifact.created_at = "2026-01-01T00:03:00Z"; }],
  ["expired artifact", d => { d.artifact.expired = true; }],
  ["elapsed expiry", d => { d.artifact.expires_at = started; }],
  ["failed prepare", d => { d.prepare.conclusion = "failure"; }],
  ["cancelled prepare", d => { d.prepare.conclusion = "cancelled"; }],
  ["old prepare attempt", d => { d.prepare.run_attempt = 1; }],
]) test(`artifact provenance rejects ${label}`, async () => { const f = fixtures(); mutate(f.data); await assert.rejects(artifactEvidence(f.api, f.c, "candidate", "123", started)); });
test("HTTP adapter rejects unauthorized endpoint and unavailable evidence without fallback", async () => {
  let calls = 0; const api = githubClient({ transport: async () => { calls++; return new Response("{}", { status: 403 }); } });
  await assert.rejects(api.get("/user"), /Unapproved/); assert.equal(calls, 0);
  await assert.rejects(api.get(prefix), /unavailable/); assert.equal(calls, 1);
});
test("pagination requires complete consistent distinct pages and rejects truncation", async () => {
  const base = `${prefix}/actions/runs?head_sha=${candidate}&event=push`;
  const api = githubClient({ transport: async url => {
    const page = new URL(url).searchParams.get("page");
    return new Response(JSON.stringify({ total_count: 101, workflow_runs: page === "1" ? Array.from({ length: 100 }, (_, i) => ({ id: i + 1 })) : [{ id: 101 }] }), { headers: page === "1" ? { link: `<https://api.github.com${base}&per_page=100&page=2>; rel="next"` } : {} });
  } });
  assert.equal((await api.pages(base, "workflow_runs")).length, 101);
  for (const data of [{ total_count: 101, workflow_runs: [{ id: 1 }] }, { total_count: 1001, workflow_runs: [] }, { total_count: 2, workflow_runs: [{ id: 1 }, { id: 1 }] }]) {
    const bad = githubClient({ transport: async () => new Response(JSON.stringify(data)) }); await assert.rejects(bad.pages(base, "workflow_runs"));
  }
});
test("artifact download never forwards job token to storage; mismatched bytes fail", async () => {
  const data = Buffer.from("fixture transport"), metadata = { id: 123, digest: `sha256:${hash(data)}` }, requests = [];
  const api = githubClient({ token: "fixture-job-token", transport: async (url, options) => {
    requests.push({ url, options }); return requests.length % 2 ? new Response(null, { status: 302, headers: { location: "https://fixture.blob.core.windows.net/fixture" } }) : new Response(data);
  } });
  assert.ok((await api.download(metadata)).equals(data)); assert.ok(requests[0].options.headers.Authorization); assert.equal(requests[1].options.headers, undefined);
  await assert.rejects(api.download({ ...metadata, digest: `sha256:${digest}` }), /digest/);
  const foreign = githubClient({ token: "fixture", transport: async () => new Response(null, { status: 302, headers: { location: "https://foreign.example/" } }) });
  await assert.rejects(foreign.download(metadata), /storage host/);
});

async function temporary(fn) { const root = await mkdtemp(path.join(os.tmpdir(), "shelfstate-activation-")); try { return await fn(root); } finally { await rm(root, { recursive: true, force: true }); } }
function ctx() { return { ...dispatchContext(envFixture()), checkoutSha: candidate, mainSha: controller, workflowDigest: digest, createdAt: started, nodeVersion: "24.13.0", npmVersion: "11.6.2", lockfileDigest: digest, configurationDigest: digest, baselineDigest: digest, previewDigest: digest, actionPins: { ...ACTION_PINS }, artifactId: "123" }; }
async function evidenceFixture(root) {
  const payload = path.join(root, "payload"); await mkdir(payload); await writeFile(path.join(payload, "file.json"), "{}");
  const c = ctx(), manifest = await createManifest(payload, c), bytes = await pack(payload), f = fixtures();
  const record = candidateEvidence(manifest, { attemptStartedAt: started, ...await requiredChecks(f.api, candidate) }, hash(bytes));
  return { c, record, bytes };
}
test("immutable candidate round trip and separate runtime binding never rewrite candidate", () => temporary(async root => {
  const { c, record } = await evidenceFixture(root), before = canonical(record), account = "1".repeat(12), role = `arn:aws:iam::${account}:role/ShelfStateV4DevDeploy`;
  const runtime = runtimeBinding(record, c, account, role); assert.equal(canonical(record), before);
  assert.equal(runtime.schema, "shelfstate.runtime-binding/v2");
  assert.equal(runtime.approvedTargetDigest, "d968249625ec86974988b95b9bc2d1792ad4a66b1905abbf86f95bc66ac3389c");
  assert.ok(!before.includes(account)); assert.equal(runtime.candidateEvidenceDigest, record.evidenceDigest);
  assert.deepEqual(verifyRuntimeBinding(runtime, record, c, account, role), runtime);
  const { runtimeDigest: ignored, ...forgedBody } = { ...runtime, approvedTargetDigest: "0".repeat(64) };
  assert.throws(() => verifyRuntimeBinding({ ...forgedBody, runtimeDigest: hashObject(forgedBody) }, record, c, account, role), /Runtime binding mismatch/);
  for (const [key, value] of Object.entries({ candidateSha: controller, controllerSha: candidate, mainSha: candidate, runId: "999", runAttempt: 9, environment: "production", artifactId: "999" })) await assert.rejects(async () => runtimeBinding(record, { ...c, [key]: value }, account, role));
  for (const wrong of ["*", role.replace("Dev", "Prod"), role.replace(account, "2".repeat(12))]) assert.throws(() => runtimeBinding(record, c, account, wrong));
  assert.throws(() => validateCandidateEvidence({ ...record, account }));
  assert.throws(() => verifyRuntimeBinding({ ...runtime, runAttempt: 1 }, record, c, account, role));
}));
test("identity result redacts live bindings and records request, never issued lifetime", () => temporary(async root => {
  const { c, record } = await evidenceFixture(root), account = "1".repeat(12), role = `arn:aws:iam::${account}:role/ShelfStateV4DevDeploy`;
  const binding = runtimeBinding(record, c, account, role), identity = { Account: account, Arn: `arn:aws:sts::${account}:assumed-role/ShelfStateV4DevDeploy/ss-100-2`, UserId: "fixture: ss-100-2".replace(" ", "") };
  const proof = identityProof(identity, binding); assert.equal(proof.requestedSessionDurationSeconds, 900); assert.equal(proof.wp006bAcceptance, "INCOMPLETE");
  assert.equal(proof.actualLifetimeEvidence, "NOT_ESTABLISHED_REQUIRES_SEPARATE_CLOUDTRAIL_REVIEW");
  assert.ok(!JSON.stringify(proof).includes(account)); assert.ok(!Object.hasOwn(proof, "expiration")); assert.ok(!Object.hasOwn(proof, "issuedDurationSeconds"));
  assert.throws(() => identityProof({ ...identity, Account: "2".repeat(12) }, binding));
  assert.throws(() => identityProof({ ...identity, Arn: identity.Arn.replace("Dev", "Prod") }, binding));
}));
test("payload validates complete raw-byte inventory before writing into new staging", () => temporary(async root => {
  const { record, bytes } = await evidenceFixture(root), files = record.manifest.files;
  const extracted = await unpack(bytes, files, record.payloadDigest, root); assert.equal(await readFile(path.join(extracted, "file.json"), "utf8"), "{}");
  const before = await readdir(root);
  for (const mutate of [b => { b.entries[0].path = "../escape"; }, b => { b.entries.push(b.entries[0]); }, b => { b.entries = []; }, b => { b.entries[0].data = "AAAA"; }, b => { b.files[0].path = "C:/escape"; }, b => { b.extra = true; }]) {
    const b = JSON.parse(bytes); mutate(b); const bad = Buffer.from(canonical(b));
    await assert.rejects(unpack(bad, files, hash(bad), root)); assert.deepEqual(await readdir(root), before);
  }
  assert.throws(() => decodeBundle(bytes, files, digest), /digest/);
}));

// Independent ZIP32 fixture builder: neither GitHub nor upload credentials are
// involved. Includes the streaming deflate descriptor used by artifact uploads.
function zipFixture(name = "payload.json", data = Buffer.from("{}"), streaming = true) {
  let crc = 0xffffffff;
  for (const b of data) { crc ^= b; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } crc = (crc ^ 0xffffffff) >>> 0;
  const n = Buffer.from(name), packed = streaming ? deflateRawSync(data) : data, local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22), descriptor = Buffer.alloc(streaming ? 16 : 0);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(streaming ? 8 : 0, 6); local.writeUInt16LE(streaming ? 8 : 0, 8); local.writeUInt16LE(n.length, 26);
  if (streaming) { descriptor.writeUInt32LE(0x08074b50); descriptor.writeUInt32LE(crc, 4); descriptor.writeUInt32LE(packed.length, 8); descriptor.writeUInt32LE(data.length, 12); }
  else { local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); }
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 6); central.writeUInt16LE(streaming ? 8 : 0, 8); central.writeUInt16LE(streaming ? 8 : 0, 10); central.writeUInt32LE(crc, 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(n.length, 28);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(46 + n.length, 12); end.writeUInt32LE(30 + n.length + packed.length + descriptor.length, 16);
  return Buffer.concat([local, n, packed, descriptor, central, n, end]);
}
test("transport ZIP accepts only one fixed-named store/streaming-deflate regular file", () => {
  for (const streaming of [false, true]) assert.equal(unwrapArtifact(zipFixture("payload.json", Buffer.from("{}"), streaming), "payload.json").toString(), "{}");
  for (const name of ["../payload.json", "/payload.json", "C:/payload.json", "\\\\host\\payload.json", "other.json"]) assert.throws(() => unwrapArtifact(zipFixture(name), "payload.json"));
});
for (const [label, mutate] of [
  ["duplicate entries", (b, c, e) => b.writeUInt16LE(2, e + 10)],
  ["symlink", (b, c) => b.writeUInt32LE(0xa1ff0000, c + 38)],
  ["directory", (b, c) => b.writeUInt32LE(0x10, c + 38)],
  ["encrypted", (b, c) => b.writeUInt16LE(1, c + 8)],
  ["zip64/extra", (b, c) => b.writeUInt16LE(20, c + 30)],
  ["local name mismatch", b => { b[30] = 65; }],
  ["oversized inflated data", (b, c) => b.writeUInt32LE(0x7fffffff, c + 24)],
  ["overlap", (b, c) => b.writeUInt32LE(999, c + 20)],
  ["CRC mismatch", (b, c) => b.writeUInt32LE(42, c + 16)],
]) test(`transport ZIP rejects ${label} before extraction`, () => { const b = zipFixture(), e = b.length - 22, c = b.readUInt32LE(e + 16); mutate(b, c, e); assert.throws(() => unwrapArtifact(b, "payload.json")); });
test("controller outputs contain actual one-line bindings and require existing hosted output file", () => temporary(async root => {
  const file = path.join(root, "output"); await writeFile(file, ""); await outputs(file, { manifestDigest: digest, payloadId: "123" });
  assert.equal(await readFile(file, "utf8"), `manifestDigest=${digest}\npayloadId=123\n`);
  await assert.rejects(outputs(undefined, { value: "x" })); await assert.rejects(outputs(file, { value: "x\ninjected=y" }));
}));

test("offline two-environment assembly evidence survives payload round trip and rejects changed resources", () => temporary(async root => {
  const payload = path.join(root, "assemblies"); await mkdir(payload);
  for (const side of ["baseline", "candidate"]) for (const env of ["dev", "production"]) {
    const dir = path.join(payload, side, env); await mkdir(dir, { recursive: true });
    const artifacts = {}, cdkEnv = env === "dev" ? "dev" : "prod";
    for (const [i, cap] of CAPABILITY_DEFINITIONS.entries()) {
      const region = cap.key === "edge-certificate" ? "us-east-1" : "us-west-2", name = `Stack${i}`, templateFile = `${name}.template.json`;
      await writeFile(path.join(dir, templateFile), canonical({ Metadata: { ShelfState: { Capability: cap.key, Environment: cdkEnv, Region: region } }, Resources: {} }));
      artifacts[name] = { type: "aws:cloudformation:stack", environment: `aws://unknown-account/${region}`, properties: { stackName: `shelfstate-v4-${cdkEnv}-${cap.key}`, templateFile, terminationProtection: env === "production" } };
    }
    await writeFile(path.join(dir, "manifest.json"), canonical({ version: "54.0.0", artifacts }));
  }
  const preview = await assemblyEvidence(payload), manifest = await createManifest(payload, ctx()), data = await pack(payload);
  const restored = await unpack(data, manifest.files, hash(data), root);
  assert.deepEqual(await assemblyEvidence(restored), preview);
  for (const env of ["dev", "production"]) { assert.equal(preview[env].allowed, true); assert.equal(preview[env].stackChanges.length, 6); }
  const template = path.join(restored, "candidate", "dev", "Stack0.template.json"), changed = JSON.parse(await readFile(template));
  changed.Resources.NewResource = { Type: "AWS::S3::Bucket" }; await writeFile(template, canonical(changed));
  await assert.rejects(assemblyEvidence(restored), /blocked/);
}));
