import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { deflateRawSync } from "node:zlib";
import { dispatchContext, authenticateDispatch, requiredChecks, artifactEvidence, githubClient, CHECKS } from "../scripts/release/github-evidence.mjs";
import { createManifest, candidateEvidence, validateCandidateEvidence } from "../scripts/release/evidence.mjs";
import { fixtureModules } from "./support/approved-target-fixture.mjs";
const fixture = await fixtureModules();
const { evidence: { runtimeBinding, verifyRuntimeBinding }, oidc: { oppositeRuntimeTarget, proveCrossEnvironmentDenial, requestEnvironmentToken } } = fixture;
import { pack, unpack, unwrapArtifact, decodeBundle } from "../scripts/release/payload-transfer.mjs";
import { canonical, hash, hashObject } from "../scripts/release/schema.mjs";
import { ACTION_PINS } from "../scripts/release/policy.mjs";
import { identityProof } from "../scripts/release/identity-proof.mjs";
import { outputs, assemblyEvidence } from "../scripts/release/controller.mjs";
import { CAPABILITY_DEFINITIONS } from "../infrastructure/lib/capabilities.mjs";
import { readAssembly } from "../scripts/release/assemblies.mjs";
import { validatePrebuiltCliEvidence, verifyPrebuiltAssemblies } from "../scripts/release/prebuilt-cli.mjs";

const candidate = "a".repeat(40), controller = "b".repeat(40), digest = "c".repeat(64), repo = "espiercy/ShelfState", prefix = `/repos/${repo}`;
const started = "2026-01-01T00:00:00.000Z";
const account = "1".repeat(12), devRole = `arn:aws:iam::${account}:role/ShelfStateV4DevDeploy`;
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
  const { c, record } = await evidenceFixture(root), role = devRole;
  const binding = runtimeBinding(record, c, account, role), identity = { Account: account, Arn: `arn:aws:sts::${account}:assumed-role/ShelfStateV4DevDeploy/ss-100-2`, UserId: "fixture: ss-100-2".replace(" ", "") };
  const proof = identityProof(identity, binding); assert.equal(proof.requestedSessionDurationSeconds, 900); assert.equal(proof.wp006bAcceptance, "INCOMPLETE");
  assert.equal(proof.actualLifetimeEvidence, "NOT_ESTABLISHED_REQUIRES_SEPARATE_CLOUDTRAIL_REVIEW");
  assert.ok(!JSON.stringify(proof).includes(account)); assert.ok(!Object.hasOwn(proof, "expiration")); assert.ok(!Object.hasOwn(proof, "issuedDurationSeconds"));
  assert.throws(() => identityProof({ ...identity, Account: "2".repeat(12) }, binding));
  assert.throws(() => identityProof({ ...identity, Arn: identity.Arn.replace("Dev", "Prod") }, binding));
}));

const b64 = value => Buffer.from(JSON.stringify(value)).toString("base64url");
function oidcToken(c, nowSeconds, changes = {}, headerChanges = {}) {
  const claims = { iss: "https://token.actions.githubusercontent.com", aud: "sts.amazonaws.com",
    sub: `repo:${repo}:environment:${c.environment}`, repository: repo, environment: c.environment,
    ref: "refs/heads/main", ref_type: "branch", event_name: "workflow_dispatch",
    workflow_ref: `${repo}/${c.workflowPath}@refs/heads/main`, workflow_sha: c.controllerSha, sha: c.controllerSha,
    run_id: c.runId, run_attempt: String(c.runAttempt), iat: nowSeconds - 5, nbf: nowSeconds - 5, exp: nowSeconds + 300, ...changes };
  return `${b64({ alg: "RS256", typ: "JWT", kid: "fixture-key", ...headerChanges })}.${b64(claims)}.${Buffer.from("fixture-signature").toString("base64url")}`;
}
function stsResponse(status, code, requestId = "00000000-1111-2222-3333-444444444444", options = {}) {
  const body = options.body ?? `<ErrorResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/"><Error><Type>Sender</Type><Code>${code}</Code><Message>redacted fixture</Message></Error><RequestId>${requestId}</RequestId></ErrorResponse>`;
  return { status, url: options.url ?? "https://sts.us-west-2.amazonaws.com/", redirected: options.redirected ?? false,
    headers: new Headers({ "content-type": options.contentType ?? "text/xml; charset=utf-8", "x-amzn-requestid": options.headerId ?? requestId }),
    body: { cancel: async () => { options.cancelled && (options.cancelled.value = true); } },
    arrayBuffer: async () => Buffer.from(body) };
}
function oidcEnvironment() {
  return { ACTIONS_ID_TOKEN_REQUEST_URL: "https://pipelines.actions.githubusercontent.com/fixture?api-version=2.0",
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: "github-runtime-request-secret" };
}
function oidcTransport(c, token, sts) {
  let calls = 0;
  const transport = async (url, options) => {
    calls++;
    if (calls === 1) {
      assert.equal(new URL(url).searchParams.get("audience"), "sts.amazonaws.com");
      assert.equal(options.headers.Authorization, "Bearer github-runtime-request-secret");
      return new Response(JSON.stringify({ value: token }), { status: 200, headers: { "content-type": "application/json" } });
    }
    assert.equal(String(url), "https://sts.us-west-2.amazonaws.com/");
    assert.equal(options.method, "POST"); assert.equal(options.redirect, "error"); assert.equal(options.credentials, "omit");
    assert.equal(options.body.get("RoleArn"), `arn:aws:iam::${account}:role/ShelfStateV4ProdDeploy`);
    assert.equal(options.body.get("WebIdentityToken"), token);
    return typeof sts === "function" ? sts(options) : sts;
  };
  return { transport, calls: () => calls };
}
test("cross-environment proof derives the opposite pinned role and retains only redacted AccessDenied evidence", async () => {
  const c = dispatchContext(envFixture()), now = Date.parse(started), token = oidcToken(c, Math.floor(now / 1000));
  const runtime = { environment: "dev", account }, target = oppositeRuntimeTarget("dev", account);
  assert.equal(target.environment, "production"); assert.equal(target.roleName, "ShelfStateV4ProdDeploy");
  const reverse = oppositeRuntimeTarget("production", account);
  assert.equal(reverse.environment, "dev"); assert.equal(reverse.roleName, "ShelfStateV4DevDeploy");
  const t = oidcTransport(c, token, stsResponse(403, "AccessDenied"));
  const proof = await proveCrossEnvironmentDenial(c, runtime, oidcEnvironment(), t.transport, () => now);
  assert.equal(t.calls(), 2); assert.equal(proof.result, "AccessDenied"); assert.equal(proof.sourceEnvironment, "dev"); assert.equal(proof.targetEnvironment, "production");
  const retained = JSON.stringify(proof); for (const secret of [token, account, devRole, target.roleArn, "github-runtime-request-secret", "00000000-1111-2222-3333-444444444444"])
    assert.ok(!retained.includes(secret));
});
test("opposite target fails before remote access and every token binding fails before STS", async () => {
  const c = dispatchContext(envFixture()), now = Date.parse(started), valid = oidcToken(c, Math.floor(now / 1000));
  let calls = 0; const unreachable = async () => { calls++; throw Error("must not run"); };
  await assert.rejects(proveCrossEnvironmentDenial(c, { environment: "production", account }, oidcEnvironment(), unreachable, () => now), /environment mismatch/);
  await assert.rejects(proveCrossEnvironmentDenial(c, { environment: "dev", account: "2".repeat(12) }, oidcEnvironment(), unreachable, () => now), /Controller-pinned/);
  assert.equal(calls, 0);
  const nowSeconds = Math.floor(now / 1000), invalid = [
    oidcToken(c, nowSeconds, { iss: "https://issuer.invalid" }),
    oidcToken(c, nowSeconds, { aud: "other" }),
    oidcToken(c, nowSeconds, { sub: `repo:${repo}:environment:production` }),
    oidcToken(c, nowSeconds, { repository: "other/ShelfState" }),
    oidcToken(c, nowSeconds, { environment: "production" }),
    oidcToken(c, nowSeconds, { ref: "refs/heads/other" }),
    oidcToken(c, nowSeconds, { ref_type: "tag" }),
    oidcToken(c, nowSeconds, { event_name: "pull_request" }),
    oidcToken(c, nowSeconds, { workflow_ref: `${repo}/.github/workflows/v4-dev-release.yml@refs/heads/other` }),
    oidcToken(c, nowSeconds, { workflow_sha: candidate }),
    oidcToken(c, nowSeconds, { sha: candidate }),
    oidcToken(c, nowSeconds, { run_id: "101" }),
    oidcToken(c, nowSeconds, { run_attempt: "3" }),
    oidcToken(c, nowSeconds, { exp: nowSeconds - 1 }),
    oidcToken(c, nowSeconds, { iat: nowSeconds + 31 }),
    oidcToken(c, nowSeconds, { nbf: nowSeconds + 31 }),
    oidcToken(c, nowSeconds, { exp: nowSeconds + 601 }),
    oidcToken(c, nowSeconds, {}, { alg: "HS256" }),
    oidcToken(c, nowSeconds, {}, { typ: "JOSE" }),
    oidcToken(c, nowSeconds, {}, { kid: "" }),
  ];
  for (const token of invalid) {
    const t = oidcTransport(c, token, assert.fail);
    await assert.rejects(requestEnvironmentToken(c, oidcEnvironment(), t.transport, () => now)); assert.equal(t.calls(), 1);
  }
  assert.ok(valid.length > 64);
});
test("cross-environment proof accepts only authentic AccessDenied and suppresses unexpected credentials", async () => {
  const c = dispatchContext(envFixture()), now = Date.parse(started), token = oidcToken(c, Math.floor(now / 1000)), runtime = { environment: "dev", account };
  for (const [status, code] of [[400, "InvalidIdentityToken"], [400, "ExpiredToken"], [403, "IDPRejectedClaim"], [403, "RegionDisabled"], [403, "AccessDeniedException"]]) {
    const t = oidcTransport(c, token, stsResponse(status, code));
    await assert.rejects(proveCrossEnvironmentDenial(c, runtime, oidcEnvironment(), t.transport, () => now));
  }
  for (const response of [stsResponse(403, "AccessDenied", "short"), stsResponse(403, "AccessDenied", undefined, { headerId: "different-request-identity" }),
    stsResponse(403, "AccessDenied", undefined, { url: "https://example.invalid/" }), stsResponse(302, "AccessDenied", undefined, { redirected: true })]) {
    const t = oidcTransport(c, token, response); await assert.rejects(proveCrossEnvironmentDenial(c, runtime, oidcEnvironment(), t.transport, () => now));
  }
  const cancelled = { value: false }, success = stsResponse(200, "", undefined, { cancelled,
    body: "<Credentials><AccessKeyId>credential-output-canary</AccessKeyId></Credentials>" });
  success.arrayBuffer = async () => assert.fail("unexpected success body must not be read");
  const t = oidcTransport(c, token, success);
  let error; try { await proveCrossEnvironmentDenial(c, runtime, oidcEnvironment(), t.transport, () => now); } catch (caught) { error = caught; }
  assert.match(error?.message ?? "", /unexpectedly succeeded/); assert.equal(cancelled.value, true); assert.ok(!error.message.includes("credential-output-canary"));
  const network = oidcTransport(c, token, () => { throw Error(`network ${token}`); });
  await assert.rejects(proveCrossEnvironmentDenial(c, runtime, oidcEnvironment(), network.transport, () => now), error => {
    assert.equal(error.message, "Cross-environment STS request failed"); assert.ok(!error.message.includes(token)); return true;
  });
});
test("OIDC token transport has no file, child-process, argument or logging sink", async () => {
  const source = await readFile(new URL("../scripts/release/oidc-denial.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /node:child_process|\b(?:exec|execFile|spawn|fork)(?:Sync)?\s*\(/);
  assert.doesNotMatch(source, /\b(?:writeFile|appendFile|createWriteStream|console\.)/);
  assert.doesNotMatch(source, /process\.argv|GITHUB_OUTPUT|upload/i);
  assert.match(source, /body: form/); assert.match(source, /headers: \{ Authorization:/);
});
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

async function prebuiltFixture(root) {
  const payload = path.join(root, "payload"), packageRoot = path.join(root, "package"), outputs = new Map();
  for (const side of ["baseline", "candidate"]) for (const env of ["dev", "production"]) {
    const dir = path.join(payload, side, env); await mkdir(dir, { recursive: true });
    const artifacts = {}, cdkEnv = env === "dev" ? "dev" : "prod";
    for (const [i, cap] of CAPABILITY_DEFINITIONS.entries()) {
      const region = cap.key === "edge-certificate" ? "us-east-1" : "us-west-2", id = `Stack${i}`, templateFile = `${id}.template.json`;
      await writeFile(path.join(dir, templateFile), canonical({ Metadata: { ShelfState: { Capability: cap.key, Environment: cdkEnv, Region: region } }, Resources: {} }));
      artifacts[id] = { type: "aws:cloudformation:stack", environment: `aws://unknown-account/${region}`,
        properties: { stackName: `shelfstate-v4-${cdkEnv}-${cap.key}`, templateFile, terminationProtection: env === "production" } };
    }
    await writeFile(path.join(dir, "manifest.json"), canonical({ version: "54.0.0", minimumCliVersion: "2.1144.0", artifacts }));
    const snapshot = await readAssembly(dir, env);
    outputs.set(dir, snapshot.stacks.map(stack => `${stack.id} (${stack.name})`).join("\n") + "\n");
  }
  await mkdir(path.join(packageRoot, "node_modules", "aws-cdk", "bin"), { recursive: true });
  await writeFile(path.join(packageRoot, "package.json"), canonical({ devDependencies: { "aws-cdk": "2.1141.0" } }));
  await writeFile(path.join(packageRoot, "node_modules", "aws-cdk", "package.json"), canonical({ name: "aws-cdk", version: "2.1141.0" }));
  await writeFile(path.join(packageRoot, "node_modules", "aws-cdk", "bin", "cdk"), "fixture");
  return { payload, packageRoot, outputs };
}
test("pinned CLI reads all retained prebuilt assemblies without changing bytes or context", () => temporary(async root => {
  const f = await prebuiltFixture(root), calls = [];
  const evidence = await verifyPrebuiltAssemblies(f.payload, f.packageRoot, async (command, args, cwd, env) => {
    calls.push({ command, args, cwd, env }); return f.outputs.get(args[args.indexOf("--app") + 1]);
  });
  assert.doesNotThrow(() => validatePrebuiltCliEvidence(evidence)); assert.equal(calls.length, 4);
  assert.deepEqual(calls.map(call => path.relative(f.payload, call.args[call.args.indexOf("--app") + 1]).replaceAll("\\", "/")),
    ["baseline/dev", "baseline/production", "candidate/dev", "candidate/production"]);
  for (const call of calls) {
    assert.equal(call.command, process.execPath); assert.equal(call.cwd, f.packageRoot);
    assert.deepEqual(call.args.slice(1), ["list", "--app", call.args[3], "--no-lookups"]);
    assert.equal(call.env.AWS_ACCESS_KEY_ID, undefined); assert.equal(call.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN, undefined);
    assert.equal(call.env.AWS_EC2_METADATA_DISABLED, "true");
  }
  assert.equal(evidence.assemblies.length, 4); evidence.assemblies.forEach(entry => assert.equal(entry.stacks.length, 6));
  const inputs = path.join(f.payload, "inputs"); await mkdir(inputs); await writeFile(path.join(inputs, "prebuilt-cli.json"), canonical(evidence));
  const manifest = await createManifest(f.payload, ctx()), bytes = await pack(f.payload), restored = await unpack(bytes, manifest.files, hash(bytes), root);
  assert.deepEqual(JSON.parse(await readFile(path.join(restored, "inputs", "prebuilt-cli.json"), "utf8")), evidence);
  assert.deepEqual(await assemblyEvidence(restored), await assemblyEvidence(f.payload));
}));
test("prebuilt CLI evidence rejects output, byte, context and pin changes", () => temporary(async root => {
  let f = await prebuiltFixture(path.join(root, "output"));
  await assert.rejects(verifyPrebuiltAssemblies(f.payload, f.packageRoot, async () => "Stack0 (shelfstate-v4-dev-edge-certificate)\n"), /stack count/);
  f = await prebuiltFixture(path.join(root, "bytes")); let calls = 0;
  await assert.rejects(verifyPrebuiltAssemblies(f.payload, f.packageRoot, async (...args) => {
    const directory = args[1][args[1].indexOf("--app") + 1], output = f.outputs.get(directory);
    if (calls++ === 0) await writeFile(path.join(directory, "manifest.json"), "{}"); return output;
  }));
  f = await prebuiltFixture(path.join(root, "context")); calls = 0;
  await assert.rejects(verifyPrebuiltAssemblies(f.payload, f.packageRoot, async (...args) => {
    if (calls++ === 0) await writeFile(path.join(f.packageRoot, "cdk.context.json"), "{}");
    return f.outputs.get(args[1][args[1].indexOf("--app") + 1]);
  }), /changed context/);
  f = await prebuiltFixture(path.join(root, "pin"));
  await writeFile(path.join(f.packageRoot, "node_modules", "aws-cdk", "package.json"), canonical({ name: "aws-cdk", version: "2.1144.0" }));
  await assert.rejects(verifyPrebuiltAssemblies(f.payload, f.packageRoot, async () => assert.fail("CLI must not run")), /differs from lock pin/);
}));
