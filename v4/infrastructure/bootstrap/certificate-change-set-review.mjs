// Credential-free, file-only binding between the accepted certificate assembly
// review package and a proposed CloudFormation change-set representation. This
// module authenticates neither AWS responses nor callers and has no SDK,
// subprocess, credential, create, execute, or deployment path.
import assert from "node:assert/strict";
import {
  canonical,
  digest,
  equal,
  hash,
  hashObject,
  object,
  parseEvidenceJson,
} from "../../scripts/release/schema.mjs";
import {
  parseCertificateAssemblyReviewPackage,
} from "./certificate-assembly-adapter.mjs";
import { EDGE_CERTIFICATE_REVIEW_SCHEMA } from "./edge-certificate-contract.mjs";
import { validateInitializationReviewMaterial } from "./initialization-guard.mjs";
import { target } from "./initialization.mjs";

export const CERTIFICATE_CHANGE_SET_TARGET_SCHEMA =
  "shelfstate.wp007-certificate-change-set-target/v1";
export const CERTIFICATE_CHANGE_SET_PROPOSAL_SCHEMA =
  "shelfstate.wp007-certificate-change-set-proposal/v1";
export const CERTIFICATE_CHANGE_SET_REVIEW_SCHEMA =
  "shelfstate.wp007-certificate-change-set-review-package/v1";
export const CERTIFICATE_CHANGE_SET_REVIEW_STATUS =
  "LOCAL_INPUT_VALIDATED_NON_EXECUTABLE_REVIEW_MATERIAL";

const PARAMETERS = Object.freeze({});
const ROLLBACK_CONFIGURATION = Object.freeze({
  monitoringTimeInMinutes: 0,
  rollbackTriggers: [],
});
const LIMITATIONS = Object.freeze([
  "AWS_RESPONSE_AUTHENTICITY_UNRESOLVED",
  "ACTUAL_REQUEST_CORRESPONDENCE_UNRESOLVED",
  "STORED_TEMPLATE_READBACK_AUTHENTICITY_UNRESOLVED",
  "PHYSICAL_RESOURCE_STATE_UNRESOLVED",
  "EFFECTIVE_IAM_PERMISSIONS_UNRESOLVED",
]);

function rawRecord(bytes, label) {
  const value = Buffer.from(bytes);
  assert.ok(value.length > 0, `${label}: bytes required`);
  const raw = new TextDecoder("utf-8", { fatal: true }).decode(value);
  return { bytes: value.length, sha256: hash(value), raw };
}

function parseRaw(record, label) {
  object(record, ["bytes", "sha256", "raw"], label);
  assert.ok(Number.isSafeInteger(record.bytes) && record.bytes > 0, `${label}: positive byte count required`);
  digest(record.sha256);
  assert.equal(typeof record.raw, "string", `${label}: raw UTF-8 JSON required`);
  const bytes = Buffer.from(record.raw, "utf8");
  assert.equal(bytes.length, record.bytes, `${label}: changed byte count`);
  assert.equal(hash(bytes), record.sha256, `${label}: changed bytes`);
  return { bytes, value: parseEvidenceJson(bytes) };
}

function certificateTemplateRecord(assembly) {
  const record = assembly.review.stacks.find((stack) => stack.name === assembly.target.stack);
  assert.ok(record, "Certificate stack template missing from assembly review package");
  assert.equal(record.region, assembly.target.region, "Certificate template region substitution");
  assert.equal(record.resourceCount, 1, "Certificate template must remain the only resource-bearing stack");
  assert.equal(hash(Buffer.from(record.raw, "utf8")), record.sha256, "Reviewed certificate template bytes changed");
  return record;
}

function targetCore(assembly, assemblyReviewSha256) {
  digest(assemblyReviewSha256);
  const template = certificateTemplateRecord(assembly);
  return {
    schema: CERTIFICATE_CHANGE_SET_TARGET_SCHEMA,
    account: assembly.target.account,
    environment: assembly.target.environment,
    phase: assembly.target.phase,
    region: assembly.target.region,
    stack: assembly.target.stack,
    executionRole: assembly.target.executionRole,
    assemblyReviewSha256,
    assemblyTargetSha256: assembly.trustedTargetSha256,
    templateSha256: template.sha256,
    parametersSha256: hashObject(PARAMETERS),
  };
}

export function certificateChangeSetReviewTarget(assemblyReviewBytes, trustedAssemblyReviewSha256) {
  const bytes = Buffer.from(assemblyReviewBytes);
  digest(trustedAssemblyReviewSha256);
  assert.equal(hash(bytes), trustedAssemblyReviewSha256, "Independent assembly review package pin mismatch");
  const assembly = parseCertificateAssemblyReviewPackage(bytes);
  const core = targetCore(assembly, trustedAssemblyReviewSha256);
  return { ...core, changeSetName: `wp007-${hashObject(core)}` };
}

function assertTarget(value, trustedTargetSha256) {
  object(value, [
    "schema",
    "account",
    "environment",
    "phase",
    "region",
    "stack",
    "executionRole",
    "assemblyReviewSha256",
    "assemblyTargetSha256",
    "templateSha256",
    "parametersSha256",
    "changeSetName",
  ], "certificate change-set review target");
  assert.equal(value.schema, CERTIFICATE_CHANGE_SET_TARGET_SCHEMA);
  assert.equal(value.environment, "dev");
  assert.equal(value.phase, "certificate");
  for (const key of ["assemblyReviewSha256", "assemblyTargetSha256", "templateSha256", "parametersSha256"])
    digest(value[key]);
  const binding = target(value.account, value.phase);
  assert.equal(value.region, binding.region, "Certificate change-set region substitution");
  assert.equal(value.stack, binding.name, "Certificate change-set stack substitution");
  assert.equal(value.executionRole, binding.executionRole, "Certificate execution-role substitution");
  assert.equal(value.parametersSha256, hashObject(PARAMETERS), "Certificate parameter-set substitution");
  const { changeSetName: ignored, ...core } = value;
  assert.equal(value.changeSetName, `wp007-${hashObject(core)}`, "Deterministic change-set name substitution");
  if (trustedTargetSha256 !== undefined) {
    digest(trustedTargetSha256);
    assert.equal(hashObject(value), trustedTargetSha256, "Independent change-set target pin mismatch");
  }
  return value;
}

function assertRollbackConfiguration(value, label) {
  object(value, ["monitoringTimeInMinutes", "rollbackTriggers"], label);
  equal(value, ROLLBACK_CONFIGURATION, `${label}: unsupported rollback monitoring or trigger`);
}

function assertProposal(value, reviewTarget) {
  object(value, ["schema", "createRequest", "describeReadback", "futureExecution"], "certificate change-set proposal");
  assert.equal(value.schema, CERTIFICATE_CHANGE_SET_PROPOSAL_SCHEMA);
  const request = value.createRequest;
  object(request, [
    "stackName",
    "changeSetName",
    "changeSetType",
    "roleArn",
    "templateSha256",
    "parameters",
    "parametersSha256",
    "capabilities",
    "includeNestedStacks",
    "importExistingResources",
    "notificationArns",
    "onStackFailure",
    "rollbackConfiguration",
  ], "CreateChangeSet request projection");
  assert.equal(request.stackName, reviewTarget.stack);
  assert.equal(request.changeSetName, reviewTarget.changeSetName);
  assert.equal(request.changeSetType, "CREATE", "Certificate initialization requires a new-stack CREATE change set");
  assert.equal(request.roleArn, reviewTarget.executionRole);
  assert.equal(request.templateSha256, reviewTarget.templateSha256);
  equal(request.parameters, PARAMETERS, "Certificate initialization has no runtime parameter overrides");
  assert.equal(request.parametersSha256, reviewTarget.parametersSha256);
  equal(request.capabilities, [], "Certificate change set requires no capability acknowledgement");
  assert.equal(request.includeNestedStacks, false, "Nested change sets are unsupported");
  assert.equal(request.importExistingResources, false, "Resource import is unsupported");
  equal(request.notificationArns, [], "Notification side effects are unsupported");
  assert.equal(request.onStackFailure, "ROLLBACK", "Certificate initialization must roll back on create failure");
  assertRollbackConfiguration(request.rollbackConfiguration, "CreateChangeSet rollback configuration");

  const readback = value.describeReadback;
  object(readback, [
    "changeSetId",
    "changeSetName",
    "stackId",
    "stackName",
    "changeSetType",
    "roleArn",
    "templateSha256",
    "parameters",
    "parametersSha256",
    "capabilities",
    "includeNestedStacks",
    "importExistingResources",
    "notificationArns",
    "onStackFailure",
    "rollbackConfiguration",
    "status",
    "executionStatus",
    "paginationComplete",
    "changes",
    "physicalResources",
  ], "DescribeChangeSet readback projection");
  assert.equal(readback.changeSetName, request.changeSetName);
  assert.equal(readback.stackName, request.stackName);
  assert.equal(readback.changeSetType, request.changeSetType);
  assert.equal(readback.roleArn, request.roleArn);
  assert.equal(readback.templateSha256, request.templateSha256);
  equal(readback.parameters, request.parameters, "DescribeChangeSet parameter substitution");
  assert.equal(readback.parametersSha256, request.parametersSha256);
  equal(readback.capabilities, request.capabilities, "DescribeChangeSet capability substitution");
  assert.equal(readback.includeNestedStacks, request.includeNestedStacks);
  assert.equal(readback.importExistingResources, request.importExistingResources);
  equal(readback.notificationArns, request.notificationArns, "DescribeChangeSet notification substitution");
  assert.equal(readback.onStackFailure, request.onStackFailure, "DescribeChangeSet rollback-mode substitution");
  equal(readback.rollbackConfiguration, request.rollbackConfiguration, "DescribeChangeSet rollback-configuration substitution");
  assert.equal(readback.paginationComplete, true, "Complete change-set pagination required");
  assert.ok(Array.isArray(readback.changes), "DescribeChangeSet changes must be an array");
  object(readback.physicalResources, [], "Certificate initialization must not trust a pre-existing physical resource");

  const future = value.futureExecution;
  object(future, ["authorized", "changeSetId", "stackName", "disableRollback", "retainExceptOnCreate"], "future execution constraint");
  assert.equal(future.authorized, false, "Review material cannot authorize execution");
  assert.equal(future.changeSetId, readback.changeSetId, "Future execution identity substitution");
  assert.equal(future.stackName, readback.stackName);
  assert.equal(future.disableRollback, "MUST_BE_OMITTED", "DisableRollback cannot accompany reviewed OnStackFailure");
  assert.equal(future.retainExceptOnCreate, false, "Rollback must not retain newly created resources");
  return value;
}

function normalizedChangeSet(proposal) {
  const readback = proposal.describeReadback;
  return {
    id: readback.changeSetId,
    name: readback.changeSetName,
    stackArn: readback.stackId,
    executionRole: readback.roleArn,
    templateSha256: readback.templateSha256,
    parametersSha256: readback.parametersSha256,
    status: readback.status,
    executionStatus: readback.executionStatus,
    changes: structuredClone(readback.changes),
    physicalResources: structuredClone(readback.physicalResources),
  };
}

function validateBoundReview(assemblyBytes, trustedAssemblyReviewSha256, reviewTarget, trustedTargetSha256, proposal) {
  assertTarget(reviewTarget, trustedTargetSha256);
  assert.equal(hash(assemblyBytes), trustedAssemblyReviewSha256, "Assembly review package substitution");
  const assembly = parseCertificateAssemblyReviewPackage(assemblyBytes, {
    account: reviewTarget.account,
    environment: reviewTarget.environment,
    phase: reviewTarget.phase,
    region: reviewTarget.region,
    stack: reviewTarget.stack,
    executionRole: reviewTarget.executionRole,
    templateSha256: reviewTarget.templateSha256,
  });
  assert.equal(assembly.trustedTargetSha256, reviewTarget.assemblyTargetSha256, "Assembly target identity substitution");
  equal(reviewTarget, certificateChangeSetReviewTarget(assemblyBytes, trustedAssemblyReviewSha256), "Assembly/change-set target binding mismatch");
  assertProposal(proposal, reviewTarget);
  const template = certificateTemplateRecord(assembly);
  const changeSet = normalizedChangeSet(proposal);
  const approval = {
    schema: EDGE_CERTIFICATE_REVIEW_SCHEMA,
    account: reviewTarget.account,
    phase: reviewTarget.phase,
    region: reviewTarget.region,
    stack: reviewTarget.stack,
    executionRole: reviewTarget.executionRole,
    bindings: {},
    mode: "initialization",
    templateSha256: reviewTarget.templateSha256,
    assemblySha256: reviewTarget.assemblyReviewSha256,
    parametersSha256: reviewTarget.parametersSha256,
    assets: {},
    changeSetSha256: hashObject(changeSet),
  };
  const result = validateInitializationReviewMaterial(approval, hashObject(approval), {
    templateBytes: Buffer.from(template.raw, "utf8"),
    assemblyBytes,
    parameters: {},
    assets: {},
    changeSet,
  });
  return {
    changeSetId: result.changeSetId,
    changeSetName: changeSet.name,
    stackArn: changeSet.stackArn,
    templateSha256: changeSet.templateSha256,
    parametersSha256: changeSet.parametersSha256,
    resourceChanges: structuredClone(changeSet.changes),
    rollback: {
      onStackFailure: proposal.createRequest.onStackFailure,
      rollbackConfiguration: structuredClone(proposal.createRequest.rollbackConfiguration),
      disableRollback: proposal.futureExecution.disableRollback,
      retainExceptOnCreate: proposal.futureExecution.retainExceptOnCreate,
    },
  };
}

export function assertCertificateChangeSetReviewPackage(value) {
  object(value, [
    "schema",
    "status",
    "executionAuthorized",
    "authority",
    "target",
    "trustedTargetSha256",
    "source",
    "review",
    "limitations",
  ], "certificate change-set review package");
  assert.equal(value.schema, CERTIFICATE_CHANGE_SET_REVIEW_SCHEMA);
  assert.equal(value.status, CERTIFICATE_CHANGE_SET_REVIEW_STATUS);
  assert.equal(value.executionAuthorized, false, "Review package must never authorize execution");
  object(value.authority, ["createChangeSetAuthorized", "executeChangeSetAuthorized"], "operation authority boundary");
  equal(value.authority, { createChangeSetAuthorized: false, executeChangeSetAuthorized: false }, "Review package cannot grant CloudFormation authority");
  assertTarget(value.target, value.trustedTargetSha256);
  object(value.source, ["assemblyReview", "proposal"], "certificate change-set source material");
  const assembly = parseRaw(value.source.assemblyReview, "assembly review package");
  assert.equal(value.source.assemblyReview.sha256, value.target.assemblyReviewSha256, "Trusted assembly source identity substitution");
  const proposal = parseRaw(value.source.proposal, "change-set proposal");
  const expectedReview = validateBoundReview(
    assembly.bytes,
    value.target.assemblyReviewSha256,
    value.target,
    value.trustedTargetSha256,
    proposal.value,
  );
  equal(value.review, expectedReview, "Certificate change-set review summary substitution");
  equal(value.limitations, LIMITATIONS, "Unresolved live-service limitations must remain explicit");
  return value;
}

export function parseCertificateChangeSetReviewPackage(bytes) {
  return assertCertificateChangeSetReviewPackage(parseEvidenceJson(bytes));
}

export function createCertificateChangeSetReviewPackage(
  assemblyReviewBytes,
  trustedAssemblyReviewSha256,
  trustedTarget,
  trustedTargetSha256,
  proposedChangeSetBytes,
) {
  const assemblyBytes = Buffer.from(assemblyReviewBytes);
  const proposalBytes = Buffer.from(proposedChangeSetBytes);
  const proposal = parseEvidenceJson(proposalBytes);
  const review = validateBoundReview(
    assemblyBytes,
    trustedAssemblyReviewSha256,
    trustedTarget,
    trustedTargetSha256,
    proposal,
  );
  const value = {
    schema: CERTIFICATE_CHANGE_SET_REVIEW_SCHEMA,
    status: CERTIFICATE_CHANGE_SET_REVIEW_STATUS,
    executionAuthorized: false,
    authority: { createChangeSetAuthorized: false, executeChangeSetAuthorized: false },
    target: structuredClone(trustedTarget),
    trustedTargetSha256,
    source: {
      assemblyReview: rawRecord(assemblyBytes, "assembly review package"),
      proposal: rawRecord(proposalBytes, "change-set proposal"),
    },
    review,
    limitations: [...LIMITATIONS],
  };
  assertCertificateChangeSetReviewPackage(value);
  return Buffer.from(canonical(value));
}
