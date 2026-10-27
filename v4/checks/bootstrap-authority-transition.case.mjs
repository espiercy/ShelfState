import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  BOOTSTRAP_AUTHORITY_TRANSITION_STATUS,
  BOOTSTRAP_BASELINE_TEMPLATE_SHA256,
  assertBootstrapAuthorityTransitionChangeSet,
  createBootstrapAuthorityTransitionReviewPackage,
  parseBootstrapAuthorityTransitionReviewPackage,
} from "../infrastructure/bootstrap/bootstrap-authority-transition.mjs";
import {
  CERTIFICATE_CHANGE_SET_TARGET_SCHEMA,
} from "../infrastructure/bootstrap/certificate-change-set-review.mjs";
import { callerWindowCap, target } from "../infrastructure/bootstrap/initialization.mjs";
import { hash, hashObject } from "../scripts/release/schema.mjs";

const ACCOUNT = "123456789012"; // Synthetic AWS documentation account, never live.
const base = new URL("../infrastructure/bootstrap/", import.meta.url);
const baselineBytes = await readFile(new URL("bootstrap-template.json", base));
const certificate = target(ACCOUNT, "certificate");
const DIGESTS = Object.freeze({
  assemblyReviewSha256: "1".repeat(64),
  assemblyTargetSha256: "2".repeat(64),
  templateSha256: "3".repeat(64),
  parametersSha256: hashObject({}),
});

function certificateTarget() {
  const core = {
    schema: CERTIFICATE_CHANGE_SET_TARGET_SCHEMA,
    account: ACCOUNT,
    environment: "dev",
    phase: "certificate",
    region: certificate.region,
    stack: certificate.name,
    executionRole: certificate.executionRole,
    ...DIGESTS,
  };
  return { ...core, changeSetName: `wp007-${hashObject(core)}` };
}

function packageFor(state = "prepare") {
  const targetValue = certificateTarget();
  const trustedExecutionBinding = state === "execute" ? {
    changeSetId: `arn:aws:cloudformation:us-east-1:${ACCOUNT}:changeSet/${targetValue.changeSetName}/fixture-certificate-change-set-id`,
    certificateChangeSetReviewSha256: "4".repeat(64),
  } : null;
  return createBootstrapAuthorityTransitionReviewPackage(
    baselineBytes,
    state,
    targetValue,
    hashObject(targetValue),
    trustedExecutionBinding,
  );
}

function parsedFor(state = "prepare") {
  return parseBootstrapAuthorityTransitionReviewPackage(packageFor(state));
}

function proposedTemplate(reviewPackage) {
  return JSON.parse(reviewPackage.source.proposedTemplate.raw);
}

function replaceRaw(record, value) {
  const raw = `${JSON.stringify(value, null, 2)}\n`;
  record.raw = raw;
  record.bytes = Buffer.byteLength(raw);
  record.sha256 = hash(Buffer.from(raw));
}

function projection(reviewPackage) {
  const request = reviewPackage.review.proposedTransition.changeSetRequest;
  const role = reviewPackage.review.deploymentRole.physicalName;
  return {
    stackId: `arn:aws:cloudformation:us-east-1:${ACCOUNT}:stack/CDKToolkit/fixture-stack-id`,
    stackName: "CDKToolkit",
    changeSetId: `arn:aws:cloudformation:us-east-1:${ACCOUNT}:changeSet/${request.changeSetName}/fixture-change-set-id`,
    changeSetName: request.changeSetName,
    changeSetType: "UPDATE",
    status: "CREATE_COMPLETE",
    executionStatus: "AVAILABLE",
    templateSha256: request.templateSha256,
    parameters: structuredClone(request.parameters),
    parametersSha256: request.parametersSha256,
    capabilities: [...request.capabilities],
    includeNestedStacks: false,
    importExistingResources: false,
    paginationComplete: true,
    changes: [{
      action: "Modify",
      logicalResourceId: "DeploymentActionRole",
      physicalResourceId: role,
      resourceType: "AWS::IAM::Role",
      replacement: "False",
      scope: ["Properties"],
      details: [{ attribute: "Properties", name: "Policies", requiresRecreation: "Never" }],
    }],
  };
}

test("prepare transition is deterministic and replaces the exact CloudFormation-owned policy", () => {
  assert.equal(hash(baselineBytes), BOOTSTRAP_BASELINE_TEMPLATE_SHA256);
  const first = packageFor("prepare");
  const second = packageFor("prepare");
  assert.deepEqual(first, second);
  const reviewPackage = parseBootstrapAuthorityTransitionReviewPackage(first);
  const proposed = proposedTemplate(reviewPackage);
  const baseline = JSON.parse(baselineBytes);
  const actualRole = proposed.Resources.DeploymentActionRole;
  const originalRole = baseline.Resources.DeploymentActionRole;
  assert.equal(actualRole.Properties.Policies.length, 1);
  assert.equal(actualRole.Properties.Policies[0].PolicyName, "shelfstate-dev-only");
  assert.deepEqual(
    actualRole.Properties.Policies[0].PolicyDocument,
    callerWindowCap(ACCOUNT, "certificate", "us-east-1", certificateTarget().changeSetName, "prepare"),
  );
  const restored = structuredClone(proposed);
  restored.Resources.DeploymentActionRole.Properties.Policies[0].PolicyDocument =
    originalRole.Properties.Policies[0].PolicyDocument;
  assert.deepEqual(restored, baseline, "Only the existing policy document may change");
});

test("role identity, trust, attachments, boundary and all unrelated resources remain byte-model identical", () => {
  const reviewPackage = parsedFor();
  const baseline = JSON.parse(baselineBytes);
  const proposed = proposedTemplate(reviewPackage);
  const before = baseline.Resources.DeploymentActionRole.Properties;
  const after = proposed.Resources.DeploymentActionRole.Properties;
  for (const key of Object.keys(before).filter((key) => key !== "Policies"))
    assert.deepEqual(after[key], before[key], key);
  assert.deepEqual(Object.keys(proposed.Resources), Object.keys(baseline.Resources));
  for (const logicalId of Object.keys(baseline.Resources).filter((id) => id !== "DeploymentActionRole"))
    assert.deepEqual(proposed.Resources[logicalId], baseline.Resources[logicalId], logicalId);
  for (const key of ["Parameters", "Conditions", "Mappings", "Outputs", "Metadata"])
    assert.deepEqual(proposed[key], baseline[key], key);
  assert.deepEqual(reviewPackage.review.proposedTransition.exactMutation, {
    action: "Modify",
    logicalResourceId: "DeploymentActionRole",
    resourceType: "AWS::IAM::Role",
    property: "Policies",
    replacement: "False",
    resourceAdditions: 0,
    resourceDeletions: 0,
  });
});

test("prepare, execute and closed remain distinct reviewed states and never authorize an operation", () => {
  const documents = new Map();
  for (const state of ["prepare", "execute", "closed"]) {
    const reviewPackage = parsedFor(state);
    const policy = proposedTemplate(reviewPackage).Resources.DeploymentActionRole.Properties.Policies[0].PolicyDocument;
    assert.deepEqual(policy, callerWindowCap(ACCOUNT, "certificate", "us-east-1", certificateTarget().changeSetName, state));
    assert.equal(reviewPackage.status, BOOTSTRAP_AUTHORITY_TRANSITION_STATUS);
    assert.equal(reviewPackage.executionAuthorized, false);
    assert.equal(reviewPackage.review.certificate.executionBinding === null, state !== "execute");
    assert.deepEqual(reviewPackage.review.authority, {
      createChangeSetAuthorized: false,
      executeChangeSetAuthorized: false,
      updateStackAuthorized: false,
      effectiveIamVerified: false,
      requiredBeforeOperation: state === "prepare"
        ? "AUTHENTIC_BOOTSTRAP_BASELINE_AND_TRANSITION_CHANGE_SET_REVIEW_REQUIRED"
        : state === "execute"
          ? "AUTHENTIC_REVIEWED_CERTIFICATE_CHANGE_SET_ID_AND_DISTINCT_HUMAN_AUTHORIZATION_REQUIRED"
          : "TERMINAL_CERTIFICATE_OPERATION_AND_EFFECTIVE_CLOSED_POLICY_READBACK_REQUIRED",
    });
    documents.set(state, hashObject(policy));
  }
  assert.equal(new Set(documents.values()).size, 3);
  assert.throws(() => packageFor("ordinary"), /Unsupported bootstrap authority state/);
  assert.throws(() => packageFor("open"), /Unsupported bootstrap authority state/);
  const targetValue = certificateTarget();
  assert.throws(() => createBootstrapAuthorityTransitionReviewPackage(
    baselineBytes,
    "execute",
    targetValue,
    hashObject(targetValue),
  ), /execution binding/iu);
  assert.throws(() => createBootstrapAuthorityTransitionReviewPackage(
    baselineBytes,
    "execute",
    targetValue,
    hashObject(targetValue),
    {
      changeSetId: `arn:aws:cloudformation:us-east-1:${ACCOUNT}:changeSet/wp007-${"f".repeat(64)}/fixture-id`,
      certificateChangeSetReviewSha256: "4".repeat(64),
    },
  ), /change-set ID substitution/iu);
});

test("tampered permissions, extra policies and unrelated template changes are rejected", () => {
  const permission = parsedFor();
  const permissionTemplate = proposedTemplate(permission);
  permissionTemplate.Resources.DeploymentActionRole.Properties.Policies[0].PolicyDocument.Statement.push({
    Sid: "Unreviewed",
    Effect: "Allow",
    Action: "cloudformation:*",
    Resource: "*",
  });
  replaceRaw(permission.source.proposedTemplate, permissionTemplate);
  assert.throws(() => parseBootstrapAuthorityTransitionReviewPackage(Buffer.from(JSON.stringify(permission))), /template/iu);

  const extraPolicy = parsedFor();
  const extraPolicyTemplate = proposedTemplate(extraPolicy);
  extraPolicyTemplate.Resources.DeploymentActionRole.Properties.Policies.push({
    PolicyName: "additional",
    PolicyDocument: { Version: "2012-10-17", Statement: [] },
  });
  replaceRaw(extraPolicy.source.proposedTemplate, extraPolicyTemplate);
  assert.throws(() => parseBootstrapAuthorityTransitionReviewPackage(Buffer.from(JSON.stringify(extraPolicy))), /template/iu);

  const unrelated = parsedFor();
  const unrelatedTemplate = proposedTemplate(unrelated);
  unrelatedTemplate.Resources.StagingBucket.Properties.Tags = [];
  replaceRaw(unrelated.source.proposedTemplate, unrelatedTemplate);
  assert.throws(() => parseBootstrapAuthorityTransitionReviewPackage(Buffer.from(JSON.stringify(unrelated))), /template/iu);
});

test("stack, region, role and certificate target substitutions are rejected", () => {
  for (const [field, replacement] of [
    ["stack", "shelfstate-v4-dev-other"],
    ["region", "us-west-2"],
    ["executionRole", `arn:aws:iam::${ACCOUNT}:role/other`],
    ["changeSetName", `wp007-${"f".repeat(64)}`],
  ]) {
    const value = parsedFor();
    value.certificateTarget[field] = replacement;
    value.trustedCertificateTargetSha256 = hashObject(value.certificateTarget);
    assert.throws(() => parseBootstrapAuthorityTransitionReviewPackage(Buffer.from(JSON.stringify(value))));
  }
  const account = parsedFor();
  account.certificateTarget.account = "999999999999";
  account.trustedCertificateTargetSha256 = hashObject(account.certificateTarget);
  assert.throws(() => parseBootstrapAuthorityTransitionReviewPackage(Buffer.from(JSON.stringify(account))));
});

test("exact non-replacing CloudFormation projection passes and additions, deletions or replacements fail", () => {
  const reviewPackage = parsedFor();
  const exact = projection(reviewPackage);
  assert.equal(
    assertBootstrapAuthorityTransitionChangeSet(reviewPackage, exact),
    "LOCAL_PROJECTION_CONSISTENT_NOT_AUTHENTICATED_OR_AUTHORIZED",
  );
  for (const mutate of [
    (value) => { value.changes[0].action = "Add"; },
    (value) => { value.changes[0].action = "Remove"; },
    (value) => { value.changes[0].replacement = "True"; },
    (value) => { value.changes[0].logicalResourceId = "StagingBucket"; },
    (value) => { value.changes[0].physicalResourceId = `${value.changes[0].physicalResourceId}-other`; },
    (value) => { value.changes[0].details[0].name = "AssumeRolePolicyDocument"; },
    (value) => { value.changes.push(structuredClone(value.changes[0])); },
  ]) {
    const changed = structuredClone(exact);
    mutate(changed);
    assert.throws(() => assertBootstrapAuthorityTransitionChangeSet(reviewPackage, changed));
  }
});
