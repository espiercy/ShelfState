import { assert, object, hashObject } from "./schema.mjs";
export function identityProof(identity, binding) {
  object(identity, ["UserId", "Account", "Arn"]);
  const { runtimeDigest, ...body } = binding;
  assert.equal(runtimeDigest, hashObject(body), "Changed runtime evidence");
  assert.equal(identity.Account, binding.account, "Unexpected assumed account");
  const session = `ss-${binding.runId}-${binding.runAttempt}`;
  assert.equal(identity.Arn, `arn:aws:sts::${binding.account}:assumed-role/${binding.roleName}/${session}`, "Unexpected assumed role/session");
  assert.equal(typeof identity.UserId, "string"); assert.ok(identity.UserId.endsWith(`:${session}`));
  return { schema: "shelfstate.identity-proof/v1", environment: binding.environment, identityMatched: true,
    requestedSessionDurationSeconds: 900, actualLifetimeEvidence: "NOT_ESTABLISHED_REQUIRES_SEPARATE_CLOUDTRAIL_REVIEW",
    candidateEvidenceDigest: binding.candidateEvidenceDigest, runtimeBindingDigest: runtimeDigest,
    approvedTargetDigest: binding.approvedTargetDigest,
    runId: binding.runId, runAttempt: binding.runAttempt, candidateSha: binding.candidateSha, controllerSha: binding.controllerSha,
    evidenceKind: "identity-only-not-deployment", wp006bAcceptance: "INCOMPLETE" };
}
