// Credential-free, file-only construction and review of a proposed CDKToolkit
// deployment-role authority transition. This module has no AWS SDK, subprocess,
// credential, change-set creation, update, or execution path.
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
  assertCertificateChangeSetReviewTarget,
} from "./certificate-change-set-review.mjs";
import { bootstrapIntent, QUALIFIER, serialize, VARIANT, REVISION } from "./model.mjs";
import { callerWindowCap, target } from "./initialization.mjs";

export const BOOTSTRAP_AUTHORITY_TRANSITION_SCHEMA =
  "shelfstate.wp007-bootstrap-authority-transition-review/v1";
export const BOOTSTRAP_AUTHORITY_TRANSITION_STATUS =
  "LOCAL_INPUT_VALIDATED_NON_EXECUTABLE_TRANSITION_REVIEW_MATERIAL";
export const BOOTSTRAP_BASELINE_TEMPLATE_SHA256 =
  "f7cb2367b0f9f61a16b3e8d20374560efc5030b0c9f07ed6756f1b20a391c273";

const REGION = "us-east-1";
const STACK_NAME = "CDKToolkit";
const LOGICAL_ID = "DeploymentActionRole";
const RESOURCE_TYPE = "AWS::IAM::Role";
const POLICY_NAME = "shelfstate-dev-only";
const POLICY_PATH = "Properties.Policies[0].PolicyDocument";
const STATES = Object.freeze(["prepare", "execute", "closed"]);
const CAPABILITIES = Object.freeze(["CAPABILITY_NAMED_IAM"]);
const LIMITATIONS = Object.freeze([
  "AUTHENTIC_CLOUDFORMATION_CHANGE_SET_UNRESOLVED",
  "ACTUAL_REQUEST_CORRESPONDENCE_UNRESOLVED",
  "CURRENT_STACK_TEMPLATE_AND_PARAMETER_READBACK_UNRESOLVED",
  "CLOUDFORMATION_REPLACEMENT_EVALUATION_UNRESOLVED",
  "EFFECTIVE_IAM_STATE_UNRESOLVED",
  "TRANSITION_EXECUTION_NOT_AUTHORIZED",
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

function exactRoleName(account) {
  assert.match(account, /^\d{12}$/);
  return `cdk-${QUALIFIER}-deploy-role-${account}-${REGION}`;
}

function assertBaselineTemplate(bytes) {
  assert.equal(hash(bytes), BOOTSTRAP_BASELINE_TEMPLATE_SHA256,
    "Accepted bootstrap baseline template identity changed");
  const template = parseEvidenceJson(bytes);
  assert.ok(template.Resources && Object.getPrototypeOf(template.Resources) === Object.prototype,
    "Bootstrap Resources object required");
  const role = template.Resources[LOGICAL_ID];
  assert.ok(role, "Reviewed deployment role missing");
  assert.equal(role.Type, RESOURCE_TYPE);
  assert.deepEqual(role.Properties.RoleName, {
    "Fn::Sub": "cdk-${Qualifier}-deploy-role-${AWS::AccountId}-${AWS::Region}",
  }, "Deployment role physical identity changed");
  assert.ok(Array.isArray(role.Properties.Policies));
  assert.equal(role.Properties.Policies.length, 1, "Exactly one CloudFormation-owned deployment inline policy required");
  assert.equal(role.Properties.Policies[0].PolicyName, POLICY_NAME, "Deployment inline-policy identity changed");
  assert.ok(role.Properties.Policies[0].PolicyDocument, "Deployment inline-policy document missing");
  assert.equal(template.Metadata?.ShelfStateBootstrap?.Variant, VARIANT, "Bootstrap variant changed");
  assert.equal(template.Metadata?.ShelfStateBootstrap?.Revision, REVISION, "Bootstrap revision changed");
  return template;
}

function configuration(account) {
  const intent = bootstrapIntent(REGION, account);
  return {
    stackName: STACK_NAME,
    region: REGION,
    account,
    parameters: structuredClone(intent.parameters),
    parametersSha256: hashObject(intent.parameters),
    capabilities: [...CAPABILITIES],
    terminationProtectionRequired: true,
  };
}

function statePrerequisite(state) {
  if (state === "prepare") return "AUTHENTIC_BOOTSTRAP_BASELINE_AND_TRANSITION_CHANGE_SET_REVIEW_REQUIRED";
  if (state === "execute") return "AUTHENTIC_REVIEWED_CERTIFICATE_CHANGE_SET_ID_AND_DISTINCT_HUMAN_AUTHORIZATION_REQUIRED";
  return "TERMINAL_CERTIFICATE_OPERATION_AND_EFFECTIVE_CLOSED_POLICY_READBACK_REQUIRED";
}

function executionBinding(state, certificateTarget, value) {
  if (state !== "execute") {
    assert.equal(value, null, "Certificate execution identity is valid only for the execute authority state");
    return null;
  }
  object(value, ["changeSetId", "certificateChangeSetReviewSha256"],
    "trusted certificate execution binding");
  digest(value.certificateChangeSetReviewSha256);
  assert.equal(typeof value.changeSetId, "string", "Certificate change-set ID required");
  const prefix =
    `arn:aws:cloudformation:${certificateTarget.region}:${certificateTarget.account}:changeSet/${certificateTarget.changeSetName}/`;
  assert.ok(value.changeSetId.startsWith(prefix), "Certificate change-set ID substitution");
  assert.match(value.changeSetId.slice(prefix.length), /^[A-Za-z0-9-]{1,128}$/,
    "Immutable certificate change-set ID suffix required");
  return structuredClone(value);
}

function transitionTemplate(baseline, account, certificateTarget, state) {
  assert.ok(STATES.includes(state), "Unsupported bootstrap authority state");
  const certificate = target(account, "certificate");
  assert.equal(certificateTarget.account, account, "Certificate account substitution");
  assert.equal(certificateTarget.phase, "certificate", "Certificate phase substitution");
  assert.equal(certificateTarget.region, certificate.region, "Certificate region substitution");
  assert.equal(certificateTarget.stack, certificate.name, "Certificate stack substitution");
  assert.equal(certificateTarget.executionRole, certificate.executionRole, "Certificate execution-role substitution");

  const proposed = structuredClone(baseline);
  const role = proposed.Resources[LOGICAL_ID];
  const policyDocument = callerWindowCap(
    account,
    "certificate",
    REGION,
    certificateTarget.changeSetName,
    state,
  );
  role.Properties.Policies[0].PolicyDocument = policyDocument;

  assert.equal(role.Properties.Policies.length, 1, "Transition must replace rather than add an inline policy");
  assert.equal(role.Properties.Policies[0].PolicyName, POLICY_NAME);
  const restored = structuredClone(proposed);
  restored.Resources[LOGICAL_ID].Properties.Policies[0].PolicyDocument =
    structuredClone(baseline.Resources[LOGICAL_ID].Properties.Policies[0].PolicyDocument);
  equal(restored, baseline, "Transition changed bootstrap content outside the exact policy document");
  return { policyDocument, templateBytes: Buffer.from(serialize(proposed)) };
}

function expectedReview(
  baselineBytes,
  account,
  certificateTarget,
  trustedCertificateTargetSha256,
  state,
  trustedExecutionBinding,
) {
  const baseline = assertBaselineTemplate(baselineBytes);
  assertCertificateChangeSetReviewTarget(certificateTarget, trustedCertificateTargetSha256);
  const boundExecution = executionBinding(state, certificateTarget, trustedExecutionBinding);
  const { policyDocument, templateBytes } = transitionTemplate(baseline, account, certificateTarget, state);
  const config = configuration(account);
  const identity = {
    baselineTemplateSha256: BOOTSTRAP_BASELINE_TEMPLATE_SHA256,
    proposedTemplateSha256: hash(templateBytes),
    parametersSha256: config.parametersSha256,
    certificateTargetSha256: trustedCertificateTargetSha256,
    certificateExecutionBindingSha256: boundExecution === null ? null : hashObject(boundExecution),
    authorityState: state,
    stackName: STACK_NAME,
    region: REGION,
    deploymentRole: exactRoleName(account),
  };
  const transitionChangeSetName = `wp007-bootstrap-${state}-${hashObject(identity)}`;
  return {
    authorityState: state,
    ordinaryBaseline: {
      templateSha256: BOOTSTRAP_BASELINE_TEMPLATE_SHA256,
      authority: "ORDINARY_BOOTSTRAP_DEPLOYMENT_POLICY",
    },
    stack: config,
    deploymentRole: {
      logicalId: LOGICAL_ID,
      physicalName: exactRoleName(account),
      resourceType: RESOURCE_TYPE,
      inlinePolicyName: POLICY_NAME,
      replacementPropertyPath: POLICY_PATH,
      replacementPolicySha256: hashObject(policyDocument),
    },
    certificate: {
      trustedTargetSha256: trustedCertificateTargetSha256,
      phase: certificateTarget.phase,
      stackName: certificateTarget.stack,
      region: certificateTarget.region,
      executionRole: certificateTarget.executionRole,
      changeSetName: certificateTarget.changeSetName,
      templateSha256: certificateTarget.templateSha256,
      parametersSha256: certificateTarget.parametersSha256,
      executionBinding: boundExecution,
    },
    proposedTransition: {
      templateSha256: hash(templateBytes),
      policySha256: hashObject(policyDocument),
      exactMutation: {
        action: "Modify",
        logicalResourceId: LOGICAL_ID,
        resourceType: RESOURCE_TYPE,
        property: "Policies",
        replacement: "False",
        resourceAdditions: 0,
        resourceDeletions: 0,
      },
      changeSetRequest: {
        stackName: STACK_NAME,
        changeSetName: transitionChangeSetName,
        changeSetType: "UPDATE",
        templateSha256: hash(templateBytes),
        parameters: structuredClone(config.parameters),
        parametersSha256: config.parametersSha256,
        capabilities: [...CAPABILITIES],
        includeNestedStacks: false,
        importExistingResources: false,
      },
    },
    authority: {
      createChangeSetAuthorized: false,
      executeChangeSetAuthorized: false,
      updateStackAuthorized: false,
      effectiveIamVerified: false,
      requiredBeforeOperation: statePrerequisite(state),
    },
  };
}

export function assertBootstrapAuthorityTransitionReviewPackage(value) {
  object(value, [
    "schema",
    "status",
    "executionAuthorized",
    "trustedCertificateTargetSha256",
    "trustedExecutionBinding",
    "certificateTarget",
    "source",
    "review",
    "limitations",
  ], "bootstrap authority transition review package");
  assert.equal(value.schema, BOOTSTRAP_AUTHORITY_TRANSITION_SCHEMA);
  assert.equal(value.status, BOOTSTRAP_AUTHORITY_TRANSITION_STATUS);
  assert.equal(value.executionAuthorized, false, "Transition review material cannot authorize execution");
  digest(value.trustedCertificateTargetSha256);
  assertCertificateChangeSetReviewTarget(value.certificateTarget, value.trustedCertificateTargetSha256);
  object(value.source, ["baselineTemplate", "proposedTemplate"], "bootstrap transition source material");
  const baseline = parseRaw(value.source.baselineTemplate, "bootstrap baseline template");
  const proposed = parseRaw(value.source.proposedTemplate, "bootstrap proposed transition template");
  assert.equal(value.source.baselineTemplate.sha256, BOOTSTRAP_BASELINE_TEMPLATE_SHA256,
    "Bootstrap baseline template pin changed");
  assert.ok(STATES.includes(value.review?.authorityState), "Unsupported bootstrap authority state");
  const expected = expectedReview(
    baseline.bytes,
    value.certificateTarget.account,
    value.certificateTarget,
    value.trustedCertificateTargetSha256,
    value.review.authorityState,
    value.trustedExecutionBinding,
  );
  equal(value.review, expected, "Bootstrap authority transition review substitution");
  const regenerated = transitionTemplate(
    baseline.value,
    value.certificateTarget.account,
    value.certificateTarget,
    value.review.authorityState,
  );
  assert.equal(value.source.proposedTemplate.sha256, hash(regenerated.templateBytes),
    "Proposed transition template identity changed");
  assert.equal(value.source.proposedTemplate.raw, regenerated.templateBytes.toString("utf8"),
    "Proposed transition template bytes changed");
  equal(value.limitations, LIMITATIONS, "Unresolved live transition limitations must remain explicit");
  return value;
}

export function parseBootstrapAuthorityTransitionReviewPackage(bytes) {
  return assertBootstrapAuthorityTransitionReviewPackage(parseEvidenceJson(bytes));
}

export function createBootstrapAuthorityTransitionReviewPackage(
  baselineTemplateBytes,
  authorityState,
  trustedCertificateTarget,
  trustedCertificateTargetSha256,
  trustedExecutionBinding = null,
) {
  const baselineBytes = Buffer.from(baselineTemplateBytes);
  const certificateTarget = structuredClone(trustedCertificateTarget);
  assertCertificateChangeSetReviewTarget(certificateTarget, trustedCertificateTargetSha256);
  const review = expectedReview(
    baselineBytes,
    certificateTarget.account,
    certificateTarget,
    trustedCertificateTargetSha256,
    authorityState,
    trustedExecutionBinding,
  );
  const baseline = assertBaselineTemplate(baselineBytes);
  const proposed = transitionTemplate(baseline, certificateTarget.account, certificateTarget, authorityState);
  const value = {
    schema: BOOTSTRAP_AUTHORITY_TRANSITION_SCHEMA,
    status: BOOTSTRAP_AUTHORITY_TRANSITION_STATUS,
    executionAuthorized: false,
    trustedCertificateTargetSha256,
    trustedExecutionBinding: trustedExecutionBinding === null ? null : structuredClone(trustedExecutionBinding),
    certificateTarget,
    source: {
      baselineTemplate: rawRecord(baselineBytes, "bootstrap baseline template"),
      proposedTemplate: rawRecord(proposed.templateBytes, "bootstrap proposed transition template"),
    },
    review,
    limitations: [...LIMITATIONS],
  };
  assertBootstrapAuthorityTransitionReviewPackage(value);
  return Buffer.from(canonical(value));
}

// Compare a normalized, independently authenticated CloudFormation readback
// against the local review package. This function authenticates neither the
// projection nor its source and cannot create or execute a change set.
export function assertBootstrapAuthorityTransitionChangeSet(reviewPackage, projection) {
  assertBootstrapAuthorityTransitionReviewPackage(reviewPackage);
  object(projection, [
    "stackId",
    "stackName",
    "changeSetId",
    "changeSetName",
    "changeSetType",
    "status",
    "executionStatus",
    "templateSha256",
    "parameters",
    "parametersSha256",
    "capabilities",
    "includeNestedStacks",
    "importExistingResources",
    "paginationComplete",
    "changes",
  ], "bootstrap authority change-set projection");
  const expected = reviewPackage.review;
  const account = reviewPackage.certificateTarget.account;
  const request = expected.proposedTransition.changeSetRequest;
  assert.equal(projection.stackName, STACK_NAME, "Bootstrap stack substitution");
  assert.ok(projection.stackId.startsWith(`arn:aws:cloudformation:${REGION}:${account}:stack/${STACK_NAME}/`),
    "Bootstrap stack identity substitution");
  assert.equal(projection.changeSetName, request.changeSetName, "Bootstrap transition change-set substitution");
  assert.ok(projection.changeSetId.startsWith(`arn:aws:cloudformation:${REGION}:${account}:changeSet/${request.changeSetName}/`),
    "Bootstrap transition change-set ID substitution");
  assert.equal(projection.changeSetType, "UPDATE");
  assert.equal(projection.status, "CREATE_COMPLETE", "Transition change set is not ready for review");
  assert.equal(projection.executionStatus, "AVAILABLE", "Transition change set is not available");
  assert.equal(projection.templateSha256, request.templateSha256, "Transition template substitution");
  equal(projection.parameters, request.parameters, "Bootstrap parameter substitution");
  assert.equal(projection.parametersSha256, request.parametersSha256);
  equal(projection.capabilities, request.capabilities, "Bootstrap capability substitution");
  assert.equal(projection.includeNestedStacks, false, "Nested stack transition unsupported");
  assert.equal(projection.importExistingResources, false, "Resource import unsupported");
  assert.equal(projection.paginationComplete, true, "Complete change-set pagination required");
  assert.ok(Array.isArray(projection.changes));
  assert.equal(projection.changes.length, 1, "Exactly one deployment-role policy modification required");
  const change = projection.changes[0];
  object(change, [
    "action",
    "logicalResourceId",
    "physicalResourceId",
    "resourceType",
    "replacement",
    "scope",
    "details",
  ], "bootstrap deployment-role resource change");
  assert.equal(change.action, "Modify", "Resource creation or deletion is forbidden");
  assert.equal(change.logicalResourceId, LOGICAL_ID);
  assert.equal(change.physicalResourceId, expected.deploymentRole.physicalName,
    "Deployment role physical identity substitution");
  assert.equal(change.resourceType, RESOURCE_TYPE);
  assert.equal(change.replacement, "False", "Deployment role replacement is forbidden");
  equal(change.scope, ["Properties"], "Only deployment-role properties may change");
  assert.ok(Array.isArray(change.details) && change.details.length === 1,
    "Exactly one CloudFormation property-level change detail required");
  for (const detail of change.details) {
    object(detail, ["attribute", "name", "requiresRecreation"], "deployment-role change detail");
    assert.equal(detail.attribute, "Properties");
    assert.equal(detail.name, "Policies", "Only the inline Policies property may change");
    assert.equal(detail.requiresRecreation, "Never", "Deployment role recreation is forbidden");
  }
  return "LOCAL_PROJECTION_CONSISTENT_NOT_AUTHENTICATED_OR_AUTHORIZED";
}
