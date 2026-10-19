import { assert, object, sha, digest, timestamp, text, environment, equal, hashObject, REPOSITORY } from "./schema.mjs";
import { verifyManifest } from "./evidence.mjs";
import { readAssembly, requireSafeTransition } from "./assemblies.mjs";

// Offline selection only. A future GitHub adapter must authenticate the record
// and retained artifact provenance; a JSON success claim alone is not live proof.
export async function selectRollback({ record, expected, manifest, expectedContext, artifactRoot, currentAssembly, targetAssembly, now }) {
  const keys = ["schema", "id", "repository", "environment", "candidateSha", "buildControllerSha", "rollbackControllerSha", "manifestDigest", "runId", "runAttempt", "artifactId", "kind", "deployment", "smoke", "acceptance", "completedAt", "expiresAt", "safetyPolicy", "artifactRetained"];
  object(record, keys, "rollback record"); object(expected, keys, "expected independently collected record");
  equal(record, expected, "Rollback provenance mismatch");
  assert.equal(record.schema, "shelfstate.release-result/v1"); assert.equal(record.repository, REPOSITORY);
  text(record.id);
  environment(record.environment); assert.equal(record.environment, expectedContext.environment);
  for (const k of ["candidateSha", "buildControllerSha", "rollbackControllerSha"]) sha(record[k]);
  assert.equal(record.candidateSha, manifest.context.candidateSha); assert.equal(record.buildControllerSha, manifest.context.controllerSha);
  assert.equal(record.kind, "application-deployment", "Proof/test record is not known-good");
  for (const k of ["deployment", "smoke", "acceptance"]) assert.equal(record[k], "SUCCEEDED", `${k} not successful`);
  assert.equal(record.artifactRetained, true, "Artifact not retained");
  assert.equal(record.safetyPolicy, "shelfstate.offline-empty/v1", "Unsupported/current safety policy mismatch");
  timestamp(now); timestamp(record.completedAt); timestamp(record.expiresAt);
  assert.ok(record.completedAt >= manifest.context.createdAt && record.completedAt <= now && now < record.expiresAt, "Expired/future/incomplete release evidence");
  assert.ok(Date.parse(record.expiresAt) - Date.parse(record.completedAt) <= 90 * 86400000, "Unapproved retention interval");
  assert.equal(record.runId, manifest.context.runId); assert.equal(record.runAttempt, manifest.context.runAttempt);
  assert.equal(record.artifactId, manifest.context.artifactId); digest(record.manifestDigest);
  assert.equal(record.manifestDigest, hashObject(manifest), "Wrong manifest digest");
  await verifyManifest(artifactRoot, manifest, expectedContext);
  equal(targetAssembly, await readAssembly(artifactRoot, record.environment), "Rollback target is not retained artifact assembly");
  assert.equal(currentAssembly.environment, record.environment); assert.equal(targetAssembly.environment, record.environment);
  // The current safety decision is recomputed, never accepted from a historical Boolean.
  const safety = requireSafeTransition(currentAssembly, targetAssembly);
  return { schema: "shelfstate.rollback-selection/v1", mode: "offline-dry-run-only", recordId: record.id,
    candidateSha: record.candidateSha, rollbackControllerSha: record.rollbackControllerSha, manifestDigest: record.manifestDigest, safetyDigest: hashObject(safety) };
}
