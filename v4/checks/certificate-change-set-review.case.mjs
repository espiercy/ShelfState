import assert from "node:assert/strict";
import test, { before } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { App } from "aws-cdk-lib";
import { createEnvironmentTopology } from "../infrastructure/lib/topology.mjs";
import { resolveEnvironmentConfig } from "../infrastructure/lib/environment.mjs";
import { validateLocalCertificateAssembly } from "../infrastructure/lib/template-guards.mjs";
import {
  certificateAssemblyTarget,
  certificateSynthesisContext,
  certificateSynthesisContextBytes,
  createCertificateAssemblyReviewPackage,
} from "../infrastructure/bootstrap/certificate-assembly-adapter.mjs";
import {
  CERTIFICATE_CHANGE_SET_PROPOSAL_SCHEMA,
  CERTIFICATE_CHANGE_SET_REVIEW_STATUS,
  certificateChangeSetReviewTarget,
  createCertificateChangeSetReviewPackage,
  parseCertificateChangeSetReviewPackage,
} from "../infrastructure/bootstrap/certificate-change-set-review.mjs";
import { canonical, hash, hashObject } from "../scripts/release/schema.mjs";
import { ACCOUNT } from "./support/initialization-fixture.mjs";

const config = resolveEnvironmentConfig("dev", { SHELFSTATE_DEV_AWS_ACCOUNT_ID: ACCOUNT });
let assemblyReviewBytes, assemblyReviewSha256, reviewTarget, trustedTargetSha256, proposal;

before(async () => {
  const outdir = await mkdtemp(path.join(os.tmpdir(), "shelfstate-certificate-change-set-"));
  try {
    const contextBytes = certificateSynthesisContextBytes();
    const assemblyTarget = certificateAssemblyTarget(ACCOUNT, hash(contextBytes));
    const app = new App({
      outdir,
      analyticsReporting: false,
      context: certificateSynthesisContext().context,
    });
    createEnvironmentTopology(app, config, { initializationPhase: "certificate" });
    const assembly = app.synth();
    validateLocalCertificateAssembly(assembly, config, "certificate");
    assemblyReviewBytes = await createCertificateAssemblyReviewPackage(
      outdir,
      contextBytes,
      assemblyTarget,
      hashObject(assemblyTarget),
    );
    assemblyReviewSha256 = hash(assemblyReviewBytes);
    reviewTarget = certificateChangeSetReviewTarget(assemblyReviewBytes, assemblyReviewSha256);
    trustedTargetSha256 = hashObject(reviewTarget);
    const changeSetId = `arn:aws:cloudformation:us-east-1:${ACCOUNT}:changeSet/${reviewTarget.changeSetName}/local-fixture-id`;
    proposal = {
      schema: CERTIFICATE_CHANGE_SET_PROPOSAL_SCHEMA,
      createRequest: {
        stackName: reviewTarget.stack,
        changeSetName: reviewTarget.changeSetName,
        changeSetType: "CREATE",
        roleArn: reviewTarget.executionRole,
        templateSha256: reviewTarget.templateSha256,
        parameters: {},
        parametersSha256: reviewTarget.parametersSha256,
        capabilities: [],
        includeNestedStacks: false,
        importExistingResources: false,
        notificationArns: [],
        onStackFailure: "ROLLBACK",
        rollbackConfiguration: { monitoringTimeInMinutes: 0, rollbackTriggers: [] },
      },
      describeReadback: {
        changeSetId,
        changeSetName: reviewTarget.changeSetName,
        stackId: `arn:aws:cloudformation:us-east-1:${ACCOUNT}:stack/${reviewTarget.stack}/local-fixture-stack-id`,
        stackName: reviewTarget.stack,
        changeSetType: "CREATE",
        roleArn: reviewTarget.executionRole,
        templateSha256: reviewTarget.templateSha256,
        parameters: {},
        parametersSha256: reviewTarget.parametersSha256,
        capabilities: [],
        includeNestedStacks: false,
        importExistingResources: false,
        notificationArns: [],
        onStackFailure: "ROLLBACK",
        rollbackConfiguration: { monitoringTimeInMinutes: 0, rollbackTriggers: [] },
        status: "CREATE_COMPLETE",
        executionStatus: "AVAILABLE",
        paginationComplete: true,
        changes: [{
          logicalId: "Certificate",
          type: "AWS::CertificateManager::Certificate",
          action: "Add",
          replacement: "False",
        }],
        physicalResources: {},
      },
      futureExecution: {
        authorized: false,
        changeSetId,
        stackName: reviewTarget.stack,
        disableRollback: "MUST_BE_OMITTED",
        retainExceptOnCreate: false,
      },
    };
  } finally {
    await rm(outdir, { recursive: true, force: true });
  }
});

function create(candidate = proposal, target = reviewTarget, targetPin = trustedTargetSha256) {
  return createCertificateChangeSetReviewPackage(
    assemblyReviewBytes,
    assemblyReviewSha256,
    target,
    targetPin,
    Buffer.from(canonical(candidate)),
  );
}

function rejectProposal(mutate) {
  const candidate = structuredClone(proposal);
  mutate(candidate);
  assert.throws(() => create(candidate));
}

test("canonical certificate assembly and proposed change set produce deterministic non-executable review material", () => {
  const first = create();
  const second = create();
  assert.deepEqual(first, second);
  const value = parseCertificateChangeSetReviewPackage(first);
  assert.equal(value.status, CERTIFICATE_CHANGE_SET_REVIEW_STATUS);
  assert.equal(value.executionAuthorized, false);
  assert.deepEqual(value.authority, { createChangeSetAuthorized: false, executeChangeSetAuthorized: false });
  assert.equal(value.target.assemblyReviewSha256, assemblyReviewSha256);
  assert.equal(value.trustedTargetSha256, trustedTargetSha256);
  assert.equal(value.review.changeSetId, proposal.describeReadback.changeSetId);
  assert.deepEqual(value.review.resourceChanges, proposal.describeReadback.changes);
  assert.deepEqual(value.review.rollback, {
    onStackFailure: "ROLLBACK",
    rollbackConfiguration: { monitoringTimeInMinutes: 0, rollbackTriggers: [] },
    disableRollback: "MUST_BE_OMITTED",
    retainExceptOnCreate: false,
  });
  assert.deepEqual(value.limitations, [
    "AWS_RESPONSE_AUTHENTICITY_UNRESOLVED",
    "ACTUAL_REQUEST_CORRESPONDENCE_UNRESOLVED",
    "STORED_TEMPLATE_READBACK_AUTHENTICITY_UNRESOLVED",
    "PHYSICAL_RESOURCE_STATE_UNRESOLVED",
    "EFFECTIVE_IAM_PERMISSIONS_UNRESOLVED",
  ]);
});

test("independently supplied assembly and target pins reject substitution", () => {
  assert.throws(() => certificateChangeSetReviewTarget(assemblyReviewBytes, "0".repeat(64)));
  assert.throws(() => create(proposal, reviewTarget, "0".repeat(64)));
  for (const mutate of [
    t => { t.region = "us-west-2"; },
    t => { t.stack = "shelfstate-v4-dev-library-api"; },
    t => { t.executionRole = t.executionRole.replace("us-east-1", "us-west-2"); },
    t => { t.assemblyReviewSha256 = "0".repeat(64); },
    t => { t.assemblyTargetSha256 = "0".repeat(64); },
    t => { t.templateSha256 = "0".repeat(64); },
    t => { t.parametersSha256 = "0".repeat(64); },
    t => { t.changeSetName = `wp007-${"0".repeat(64)}`; },
  ]) {
    const candidate = structuredClone(reviewTarget);
    mutate(candidate);
    assert.throws(() => create(proposal, candidate, hashObject(candidate)));
  }
  rejectProposal(p => { p.trustedTargetSha256 = trustedTargetSha256; });
});

test("CreateChangeSet projection rejects substituted target, template, parameters and unsupported options", () => {
  for (const mutate of [
    p => { p.createRequest.stackName = "other"; },
    p => { p.createRequest.changeSetName = `wp007-${"0".repeat(64)}`; },
    p => { p.createRequest.changeSetType = "UPDATE"; },
    p => { p.createRequest.changeSetType = "IMPORT"; },
    p => { p.createRequest.roleArn = p.createRequest.roleArn.replace("us-east-1", "us-west-2"); },
    p => { p.createRequest.templateSha256 = "0".repeat(64); },
    p => { p.createRequest.parameters = { BootstrapVersion: "6" }; },
    p => { p.createRequest.parametersSha256 = "0".repeat(64); },
    p => { p.createRequest.capabilities = ["CAPABILITY_IAM"]; },
    p => { p.createRequest.includeNestedStacks = true; },
    p => { p.createRequest.importExistingResources = true; },
    p => { p.createRequest.notificationArns = ["arn:aws:sns:us-east-1:123456789012:other"]; },
    p => { p.createRequest.onStackFailure = "DO_NOTHING"; },
    p => { p.createRequest.onStackFailure = "DELETE"; },
    p => { p.createRequest.rollbackConfiguration.monitoringTimeInMinutes = 5; },
    p => { p.createRequest.rollbackConfiguration.rollbackTriggers = [{ arn: "other", type: "AWS::CloudWatch::Alarm" }]; },
    p => { p.createRequest.disableRollback = false; },
  ]) rejectProposal(mutate);
});

test("DescribeChangeSet projection rejects incomplete, substituted or unsupported readback", () => {
  for (const mutate of [
    p => { p.describeReadback.changeSetId = p.describeReadback.changeSetId.replace("us-east-1", "us-west-2"); },
    p => { p.describeReadback.changeSetName = `wp007-${"0".repeat(64)}`; },
    p => { p.describeReadback.stackId = p.describeReadback.stackId.replace("us-east-1", "us-west-2"); },
    p => { p.describeReadback.stackName = "other"; },
    p => { p.describeReadback.changeSetType = "UPDATE"; },
    p => { p.describeReadback.roleArn = p.describeReadback.roleArn.replace("us-east-1", "us-west-2"); },
    p => { p.describeReadback.templateSha256 = "0".repeat(64); },
    p => { p.describeReadback.parameters = { BootstrapVersion: "6" }; },
    p => { p.describeReadback.parametersSha256 = "0".repeat(64); },
    p => { p.describeReadback.capabilities = ["CAPABILITY_AUTO_EXPAND"]; },
    p => { p.describeReadback.includeNestedStacks = true; },
    p => { p.describeReadback.importExistingResources = true; },
    p => { p.describeReadback.notificationArns = ["other"]; },
    p => { p.describeReadback.onStackFailure = "DO_NOTHING"; },
    p => { p.describeReadback.rollbackConfiguration.monitoringTimeInMinutes = 5; },
    p => { p.describeReadback.status = "CREATE_IN_PROGRESS"; },
    p => { p.describeReadback.executionStatus = "UNAVAILABLE"; },
    p => { p.describeReadback.paginationComplete = false; },
    p => { p.describeReadback.changes = []; },
    p => { p.describeReadback.changes[0].logicalId = "Other"; },
    p => { p.describeReadback.changes[0].type = "AWS::Route53::RecordSet"; },
    p => { p.describeReadback.changes[0].action = "Modify"; },
    p => { p.describeReadback.changes[0].replacement = "True"; },
    p => { p.describeReadback.changes.push(structuredClone(p.describeReadback.changes[0])); },
    p => { p.describeReadback.physicalResources.Certificate = "guessed"; },
  ]) rejectProposal(mutate);
});

test("future execution remains separate and prohibits DisableRollback or retained create resources", () => {
  for (const mutate of [
    p => { p.futureExecution.authorized = true; },
    p => { p.futureExecution.changeSetId = p.futureExecution.changeSetId.replace("local-fixture-id", "other"); },
    p => { p.futureExecution.stackName = "other"; },
    p => { p.futureExecution.disableRollback = true; },
    p => { p.futureExecution.disableRollback = false; },
    p => { p.futureExecution.disableRollback = "OMITTED"; },
    p => { p.futureExecution.retainExceptOnCreate = true; },
    p => { p.futureExecution.clientRequestToken = "execute"; },
  ]) rejectProposal(mutate);
});

test("package parser revalidates raw source identities and unresolved limitations", () => {
  const value = JSON.parse(create().toString("utf8"));
  value.source.proposal.raw = value.source.proposal.raw.replace("local-fixture-id", "other-fixture-id");
  assert.throws(() => parseCertificateChangeSetReviewPackage(Buffer.from(canonical(value))));
  const other = JSON.parse(create().toString("utf8"));
  other.limitations = [];
  assert.throws(() => parseCertificateChangeSetReviewPackage(Buffer.from(canonical(other))));
});
