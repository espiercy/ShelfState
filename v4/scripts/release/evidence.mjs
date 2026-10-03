import { assert, object, sha, digest, environment, timestamp, text, equal, hashObject, REPOSITORY } from "./schema.mjs";
import { inventory, validateInventory, verifyInventory } from "./artifacts.mjs";
import { ACTION_PINS } from "./policy.mjs";
import { runtimeTarget } from "./approved-targets.mjs";
export { runtimeTarget } from "./approved-targets.mjs";

const fields = ["repository", "candidateSha", "checkoutSha", "controllerSha", "mainSha", "workflowPath", "workflowDigest", "environment", "runId", "runAttempt", "createdAt", "nodeVersion", "npmVersion", "lockfileDigest", "configurationDigest", "baselineDigest", "previewDigest", "actionPins", "artifactId"];
export function validateContext(c) {
  object(c, fields, "release context"); assert.equal(c.repository, REPOSITORY);
  for (const k of ["candidateSha", "checkoutSha", "controllerSha", "mainSha"]) sha(c[k]);
  assert.equal(c.candidateSha, c.checkoutSha, "Candidate/checkout mismatch"); environment(c.environment);
  assert.equal(c.workflowPath, `.github/workflows/v4-${c.environment === "dev" ? "dev" : "production"}-release.yml`, "Wrong workflow identity");
  for (const k of ["workflowDigest", "lockfileDigest", "configurationDigest", "baselineDigest", "previewDigest"]) digest(c[k]);
  for (const k of ["runId", "artifactId"]) { assert.equal(typeof c[k], "string"); assert.match(c[k], /^[1-9][0-9]*$/); }
  assert.ok(Number.isSafeInteger(c.runAttempt) && c.runAttempt > 0, "Run attempt required");
  timestamp(c.createdAt); assert.match(c.nodeVersion, /^24\.\d+\.\d+$/); assert.equal(c.npmVersion, "11.6.2");
  object(c.actionPins, ["checkout", "setupNode", "credentials", "upload", "download"]);
  for (const pin of Object.values(c.actionPins)) { text(pin); assert.match(pin, /^[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+@[a-f0-9]{40}$/); }
  equal(c.actionPins, ACTION_PINS, "Unapproved action inventory");
}
export function validateManifest(m) {
  object(m, ["schema", "context", "files"], "manifest");
  assert.equal(m.schema, "shelfstate.release-candidate/v1", "Unsupported manifest schema");
  validateContext(m.context); validateInventory(m.files); return m;
}
// Metadata (including service-issued artifactId) is supplied explicitly by a
// future provenance adapter; this module does not authenticate JSON assertions.
// The manifest lives OUTSIDE its payload root, avoiding recursive self-hashing.
export async function createManifest(root, context) {
  validateContext(context);
  return validateManifest({ schema: "shelfstate.release-candidate/v1", context: structuredClone(context), files: await inventory(root) });
}
export async function verifyManifest(root, manifest, expectedContext) {
  validateManifest(manifest); validateContext(expectedContext);
  equal(manifest.context, expectedContext, "Candidate/controller/run/provenance mismatch");
  await verifyInventory(root, manifest.files);
  return { manifestDigest: hashObject(manifest), evidenceKind: "offline-byte-verification" };
}

// v1 remains available to offline rollback fixtures. Hosted proof uses this
// separate, immutable envelope; runtime account/role values are never inputs.
export function candidateEvidence(manifest, provenance, payloadDigest) {
  validateManifest(manifest); digest(payloadDigest);
  object(provenance, ["attemptStartedAt", "checks", "validationRunId", "validationRunAttempt"]);
  timestamp(provenance.attemptStartedAt);
  assert.match(provenance.validationRunId, /^[1-9][0-9]*$/);
  assert.ok(Number.isSafeInteger(provenance.validationRunAttempt) && provenance.validationRunAttempt > 0);
  assert.equal(provenance.checks.length, 2);
  for (const [i, name] of ["V3 and repository boundary", "V4 install and verification"].entries()) {
    const check = provenance.checks[i];
    object(check, ["name", "id", "producer", "headSha", "conclusion"]);
    assert.equal(check.name, name); assert.equal(check.producer, 15368);
    assert.match(check.id, /^[1-9][0-9]*$/);
    assert.equal(check.headSha, manifest.context.candidateSha); assert.equal(check.conclusion, "success");
  }
  const body = { schema: "shelfstate.candidate-offline/v2", manifest: structuredClone(manifest), provenance: structuredClone(provenance), payloadDigest };
  return { ...body, evidenceDigest: hashObject(body) };
}
export function validateCandidateEvidence(value) {
  object(value, ["schema", "manifest", "provenance", "payloadDigest", "evidenceDigest"]);
  equal(value, candidateEvidence(value.manifest, value.provenance, value.payloadDigest), "Candidate evidence altered");
  return value;
}
export function runtimeBinding(candidate, expected, account, roleArn) {
  validateCandidateEvidence(candidate); validateContext(expected);
  equal(candidate.manifest.context, expected, "Independent candidate context mismatch");
  const { roleName, approvedTargetDigest } = runtimeTarget(expected.environment, account, roleArn);
  const body = { schema: "shelfstate.runtime-binding/v2", environment: expected.environment,
    candidateSha: expected.candidateSha, controllerSha: expected.controllerSha, runId: expected.runId, runAttempt: expected.runAttempt,
    candidateEvidenceDigest: candidate.evidenceDigest, payloadArtifactId: expected.artifactId, payloadDigest: candidate.payloadDigest,
    repository: REPOSITORY, approvedTargetDigest,
    account, roleArn, roleName, audience: "sts.amazonaws.com", region: "us-west-2" };
  return { ...body, runtimeDigest: hashObject(body) };
}
export function verifyRuntimeBinding(record, candidate, expected, account, roleArn) {
  equal(record, runtimeBinding(candidate, expected, account, roleArn), "Runtime binding mismatch"); return record;
}
