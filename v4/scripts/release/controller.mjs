import { appendFile, readFile, writeFile, mkdir, mkdtemp, cp, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { readFileSync, lstatSync } from "node:fs";
import { assert, sha, canonical, equal, hash, hashObject, parseEvidenceJson, REPOSITORY } from "./schema.mjs";
import { dispatchContext, githubClient, authenticateDispatch, requiredChecks, artifactEvidence } from "./github-evidence.mjs";
import { createManifest, verifyManifest, candidateEvidence, validateCandidateEvidence, runtimeTarget, runtimeBinding, verifyRuntimeBinding } from "./evidence.mjs";
import { pack, unpack, unwrapArtifact } from "./payload-transfer.mjs";
import { readAssembly, requireSafeTransition } from "./assemblies.mjs";
import { ACTION_PINS } from "./policy.mjs";
import { verifyLocalRevision } from "./revisions.mjs";
import { credentialFreeEnvironment } from "./offline-environment.mjs";
import { identityProof } from "./identity-proof.mjs";

const parse = async file => parseEvidenceJson(await readFile(file));
const json = (file, value) => writeFile(file, canonical(value), { flag: "wx", mode: 0o600 });
export async function outputs(file, values) {
  assert.ok(file && path.isAbsolute(file), "GITHUB_OUTPUT file required"); assert.ok((await stat(file)).isFile());
  for (const [key, value] of Object.entries(values)) {
    assert.match(key, /^[A-Za-z][A-Za-z0-9]*$/); assert.equal(typeof value, "string"); assert.ok(value && !/[\r\n\0]/.test(value));
    await appendFile(file, `${key}=${value}\n`);
  }
}
function run(command, args, cwd, env, capture = false) {
  return execFileSync(command, args, { cwd, env, shell: false, timeout: 600000, maxBuffer: 8 * 1024 * 1024,
    encoding: "utf8", stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit" });
}
function git(cwd, ...args) {
  return run("git", ["--no-replace-objects", ...args], cwd, { ...credentialFreeEnvironment(), GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null", GIT_NO_LAZY_FETCH: "1" }, true).trim();
}
// Only this context path is checked. No inode persistence or general filesystem
// sandbox is claimed. The optional filesystem adapter is for isolated tests.
export function snapshotContextFile(contextFile, io = { lstatSync, readFileSync }) {
  let metadata;
  try { metadata = io.lstatSync(contextFile); }
  catch (error) {
    if (error.code === "ENOENT") return { type: "absent" };
    throw error;
  }
  const type = metadata.isSymbolicLink() ? "symbolic-link" : metadata.isFile() ? "regular" : "non-regular";
  assert.equal(type, "regular", `Unsupported CDK context path type: ${type}`);
  return { type, digest: hash(io.readFileSync(contextFile)) };
}
export function assertContextFileUnchanged(contextFile, before, io) {
  assert.deepEqual(snapshotContextFile(contextFile, io), before, "Unexpected CDK context-file state/content change");
}
function npm(cwd, args, offline = false) {
  const contextFile = path.join(cwd, "cdk.context.json");
  const before = offline ? snapshotContextFile(contextFile) : undefined;
  if (offline) {
    const pkg = JSON.parse(readFileSync(path.join(cwd, "package.json")));
    for (const env of ["dev", "prod"]) assert.equal(pkg.scripts[`infra:synth:${env}`],
      `npm run check:runtime && cdk synth --no-lookups --quiet --context shelfstateEnvironment=${env} --output cdk.out/${env}`, "Credential-isolated synth requires disabled context lookups");
  }
  const result = process.platform === "win32"
    ? run(process.execPath, [path.join(path.dirname(process.execPath), "node_modules/corepack/dist/corepack.js"), "npm", ...args], cwd, credentialFreeEnvironment())
    : run("corepack", ["npm", ...args], cwd, credentialFreeEnvironment());
  if (offline) {
    assertContextFileUnchanged(contextFile, before);
    for (const env of ["dev", "prod"]) {
      const manifest = JSON.parse(readFileSync(path.join(cwd, "cdk.out", env, "manifest.json")));
      assert.equal((manifest.missing ?? []).length, 0, "Unresolved CDK context");
      for (const artifact of Object.values(manifest.artifacts)) if (artifact.type === "aws:cloudformation:stack")
        assert.match(artifact.environment, /^aws:\/\/unknown-account\/(us-west-2|us-east-1)$/, "Offline account must remain unresolved");
    }
  }
  return result;
}
export const CANDIDATE_GATES = Object.freeze([
  ["node", ["--test"], "root", false],
  ["node", ["scripts/check-ci-secrets.mjs"], "root", false],
  ["node", ["--test", "test/deployment/v3-v4-isolation.test.js"], "root", false],
  ["npm", ["ci"], "v4", false],
  ["npm", ["audit", "--audit-level=high"], "v4", false],
  ["npm", ["audit", "signatures"], "v4", false],
  ["npm", ["run", "verify"], "v4", true],
].map(v => Object.freeze([v[0], Object.freeze(v[1]), v[2], v[3]])));
export function candidateGates(execute) { for (const gate of CANDIDATE_GATES) execute(...gate); }
export async function assemblyEvidence(root) {
  const results = {};
  for (const env of ["dev", "production"]) {
    const before = await readAssembly(path.join(root, "baseline", env), env);
    const after = await readAssembly(path.join(root, "candidate", env), env);
    results[env] = requireSafeTransition(before, after);
  }
  return results;
}
async function context(root, c, mainSha, attemptStartedAt, artifactId) {
  const preview = await assemblyEvidence(root);
  const configuration = {};
  for (const name of ["package.json", "cdk.json", "node-version.txt"]) configuration[name] = hash(await readFile(path.join(root, "inputs", name)));
  return { ...c, checkoutSha: c.candidateSha, mainSha, createdAt: attemptStartedAt, artifactId,
    workflowDigest: hash(await readFile(c.workflowPath)), nodeVersion: process.versions.node, npmVersion: "11.6.2",
    lockfileDigest: hash(await readFile(path.join(root, "inputs", "package-lock.json"))), configurationDigest: hashObject(configuration),
    baselineDigest: hashObject(Object.fromEntries(Object.entries(preview).map(([e, p]) => [e, p.previousDigest]))),
    previewDigest: hashObject(preview), actionPins: { ...ACTION_PINS } };
}
async function assertController(c) {
  assert.equal(git(process.cwd(), "rev-parse", "HEAD"), c.controllerSha);
  assert.equal(git(process.cwd(), "rev-parse", "--is-shallow-repository"), "false");
}
async function recordPath() {
  assert.ok(process.env.RUNNER_TEMP && path.isAbsolute(process.env.RUNNER_TEMP));
  return path.join(process.env.RUNNER_TEMP, "shelfstate-release-state.json");
}
// Hosted commands cannot be selected through workflow input. The negative
// controller-entry fixture must stop at target validation, before remote I/O.
export async function main(operation) {
  if (operation === "offline-verify") {
    npm(path.resolve("v4"), ["run", "verify"], true); return;
  }
  const c = dispatchContext(process.env); await assertController(c);
  assert.ok(process.env.GITHUB_OUTPUT, "Hosted output context missing");
  const statePath = await recordPath();
  if (operation === "prepare") {
    assert.ok(!process.env.GH_TOKEN && !process.env.SHELFSTATE_AWS_ACCOUNT_ID && !process.env.SHELFSTATE_DEPLOY_ROLE_ARN, "Prepare received runtime configuration");
    for (const key of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_PROFILE", "ACTIONS_ID_TOKEN_REQUEST_TOKEN"]) assert.ok(!process.env[key], "Prepare credential boundary");
    const api = githubClient(), remote = await authenticateDispatch(api, c), checks = await requiredChecks(api, c.candidateSha);
    const root = await mkdtemp(path.join(process.env.RUNNER_TEMP, "shelfstate-prepare-"));
    const candidate = path.join(root, "checkout"), payload = path.join(root, "payload");
    git(process.cwd(), "clone", "--no-hardlinks", "--no-checkout", "--", process.cwd(), candidate);
    // checkout action fetched complete main history at the controller revision.
    git(candidate, "fetch", "--no-tags", `https://github.com/${REPOSITORY}.git`, "refs/heads/main:refs/heads/main");
    assert.equal(git(candidate, "rev-parse", "refs/heads/main"), remote.mainSha, "Main moved during prepare; rerun");
    git(candidate, "checkout", "--detach", c.candidateSha);
    verifyLocalRevision(candidate, { candidateSha: c.candidateSha, controllerSha: c.controllerSha, mainSha: remote.mainSha });
    // Trusted controller baseline is separate from candidate execution, and is
    // explicitly offline evidence, never described as deployed account state.
    npm(path.resolve("v4"), ["ci"]); npm(path.resolve("v4"), ["run", "infra:synth"], true);
    await mkdir(payload);
    for (const [env, dir] of [["dev", "dev"], ["production", "prod"]]) await cp(path.resolve("v4/cdk.out", dir), path.join(payload, "baseline", env), { recursive: true, dereference: false });
    const packageDir = path.join(candidate, "v4");
    candidateGates((kind, args, area, offline) => {
      const cwd = area === "v4" ? packageDir : candidate;
      if (kind === "npm") npm(cwd, args, offline);
      else run(process.execPath, args, cwd, credentialFreeEnvironment());
    }); // fail closed: no catch/continuation past the audit
    for (const [env, dir] of [["dev", "dev"], ["production", "prod"]]) await cp(path.join(packageDir, "cdk.out", dir), path.join(payload, "candidate", env), { recursive: true, dereference: false });
    await mkdir(path.join(payload, "inputs"));
    for (const [source, target] of [["package.json", "package.json"], ["package-lock.json", "package-lock.json"], ["cdk.json", "cdk.json"], [".nvmrc", "node-version.txt"]]) {
      // read from the exact Git object, not mutable install/build output
      await writeFile(path.join(payload, "inputs", target), execFileSync("git", ["show", `${c.candidateSha}:v4/${source}`], { cwd: candidate }));
    }
    await assemblyEvidence(payload);
    const payloadBytes = await pack(payload), transport = path.join(root, "payload.json");
    await writeFile(transport, payloadBytes, { flag: "wx" });
    await json(statePath, { c, remote, checks, root, payload, payloadDigest: hash(payloadBytes) });
    await outputs(process.env.GITHUB_OUTPUT, { payloadPath: transport, candidateSha: c.candidateSha }); return;
  }
  if (operation === "seal") {
    const s = await parse(statePath); equal(s.c, c, "Changed prepare context");
    assert.match(process.env.PAYLOAD_ID ?? "", /^[1-9][0-9]*$/);
    const expected = await context(s.payload, c, s.remote.mainSha, s.remote.attemptStartedAt, process.env.PAYLOAD_ID);
    const manifest = await createManifest(s.payload, expected);
    assert.equal(hash(await pack(s.payload)), s.payloadDigest, "Payload changed after upload");
    const evidence = candidateEvidence(manifest, { attemptStartedAt: s.remote.attemptStartedAt, ...s.checks }, s.payloadDigest);
    const file = path.join(s.root, "evidence.json"); await json(file, evidence);
    await outputs(process.env.GITHUB_OUTPUT, { evidencePath: file, manifestDigest: evidence.evidenceDigest }); return;
  }
  if (operation === "pre-oidc") {
    runtimeTarget(c.environment, process.env.SHELFSTATE_AWS_ACCOUNT_ID, process.env.SHELFSTATE_DEPLOY_ROLE_ARN);
    assert.ok(process.env.GH_TOKEN, "Own job token required");
    const api = githubClient({ token: process.env.GH_TOKEN });
    // Public repository metadata needs no checks:read permission. Do not send
    // the narrowly scoped Actions token to check endpoints or fall back to PAT.
    const metadata = githubClient();
    const remote = await authenticateDispatch(metadata, c), checks = await requiredChecks(metadata, c.candidateSha);
    const payloadMeta = await artifactEvidence(api, c, "candidate", process.env.PAYLOAD_ID, remote.attemptStartedAt);
    const evidenceMeta = await artifactEvidence(api, c, "evidence", process.env.EVIDENCE_ID, remote.attemptStartedAt);
    const evidence = validateCandidateEvidence(parseEvidenceJson(unwrapArtifact(await api.download(evidenceMeta), "evidence.json")));
    assert.equal(evidence.evidenceDigest, process.env.MANIFEST_DIGEST, "Prepare output mismatch");
    equal(evidence.provenance, { attemptStartedAt: remote.attemptStartedAt, ...checks }, "Required-check/attempt provenance changed");
    const expectedMain = evidence.manifest.context.mainSha; sha(expectedMain);
    for (const revision of [c.candidateSha, c.controllerSha, expectedMain]) {
      sha(revision); git(process.cwd(), "merge-base", "--is-ancestor", revision, remote.mainSha);
    }
    for (const revision of [c.candidateSha, c.controllerSha]) git(process.cwd(), "merge-base", "--is-ancestor", revision, expectedMain);
    const root = await unpack(unwrapArtifact(await api.download(payloadMeta), "payload.json"), evidence.manifest.files, evidence.payloadDigest, process.env.RUNNER_TEMP);
    for (const [source, target] of [["package.json", "package.json"], ["package-lock.json", "package-lock.json"], ["cdk.json", "cdk.json"], [".nvmrc", "node-version.txt"]]) {
      const bound = execFileSync("git", ["show", `${c.candidateSha}:v4/${source}`]);
      assert.equal(hash(await readFile(path.join(root, "inputs", target))), hash(bound), "Candidate input substitution");
    }
    const expected = await context(root, c, expectedMain, remote.attemptStartedAt, process.env.PAYLOAD_ID);
    await verifyManifest(root, evidence.manifest, expected);
    const runtime = runtimeBinding(evidence, expected, process.env.SHELFSTATE_AWS_ACCOUNT_ID, process.env.SHELFSTATE_DEPLOY_ROLE_ARN);
    await json(statePath, { evidence, expected, runtime });
    await outputs(process.env.GITHUB_OUTPUT, { roleArn: runtime.roleArn, accountId: runtime.account, runtimeDigest: runtime.runtimeDigest }); return;
  }
  if (operation === "identity") {
    const s = await parse(statePath);
    for (const key of Object.keys(c)) assert.equal(s.expected[key], c[key], "Proof context changed");
    verifyRuntimeBinding(s.runtime, s.evidence, s.expected, process.env.SHELFSTATE_AWS_ACCOUNT_ID, process.env.SHELFSTATE_DEPLOY_ROLE_ARN);
    const identity = parseEvidenceJson(Buffer.from(run("aws", ["sts", "get-caller-identity", "--region", "us-west-2", "--output", "json", "--no-cli-pager"], process.cwd(), process.env, true)));
    const proof = identityProof(identity, s.runtime); console.log(canonical(proof));
    assert.ok(process.env.GITHUB_STEP_SUMMARY); await appendFile(process.env.GITHUB_STEP_SUMMARY, `Identity-only proof (not WP-006B acceptance):\n\n\`\`\`json\n${canonical(proof)}\n\`\`\`\n`); return;
  }
  assert.fail("Unknown controller operation");
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv[2]).catch(() => { console.error("Release controller failed closed; no subsequent credential/proof step is permitted. Inspect the failed gate without printing credentials."); process.exitCode = 1; });
}
