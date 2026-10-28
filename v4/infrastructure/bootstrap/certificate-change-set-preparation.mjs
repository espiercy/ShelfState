// Bounded preparation-side operator for the exact WP-007 certificate change
// set. It requires an injected transport, creates no executor and never calls
// AWS on import. A future live invocation remains separately authorized.
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
import {
  CERTIFICATE_CHANGE_SET_PROPOSAL_SCHEMA,
  certificateChangeSetReviewTarget,
  createCertificateChangeSetReviewPackage,
  parseCertificateChangeSetReviewPackage,
} from "./certificate-change-set-review.mjs";

export const CERTIFICATE_CHANGE_SET_PREPARATION_SCHEMA =
  "shelfstate.wp007-certificate-change-set-preparation-receipt/v1";
export const CERTIFICATE_CHANGE_SET_PREPARATION_STATUS =
  "NON_EXECUTABLE_PREPARATION_REVIEW_MATERIAL";

const REGION = "us-east-1";
const TEMPLATE_LIMIT = 51_200;
const BOOTSTRAP_PARAMETER = "/cdk-bootstrap/hnb659fds/version";
const STACK_TAGS = Object.freeze([
  Object.freeze({ Key: "Environment", Value: "dev" }),
  Object.freeze({ Key: "ManagedBy", Value: "AWS-CDK" }),
  Object.freeze({ Key: "Project", Value: "ShelfState" }),
]);
const ROLLBACK_CONFIGURATION = Object.freeze({
  MonitoringTimeInMinutes: 0,
  RollbackTriggers: [],
});
const CALLER_OPERATION = "sts:GetCallerIdentity";
const CREATE_OPERATION = "cloudformation:CreateChangeSet";
const DESCRIBE_OPERATION = "cloudformation:DescribeChangeSet";
const TEMPLATE_OPERATION = "cloudformation:GetTemplate";
const STACK_OPERATION = "cloudformation:DescribeStacks";
const RESOURCES_OPERATION = "cloudformation:DescribeStackResources";
const EVIDENCE_MODES = Object.freeze([
  "LOCAL_FIXTURE",
  "AWS_CLI_SIGNED_REQUEST_PATH",
]);

function allowedKeys(value, keys, label) {
  assert.ok(value && Object.getPrototypeOf(value) === Object.prototype, `${label}: object required`);
  assert.ok(Object.keys(value).every((key) => keys.includes(key)), `${label}: unsupported field`);
  return value;
}

function rawRecord(raw, label) {
  assert.equal(typeof raw, "string", `${label}: raw UTF-8 JSON required`);
  const bytes = Buffer.from(raw, "utf8");
  assert.ok(bytes.length > 0, `${label}: bytes required`);
  parseEvidenceJson(bytes);
  return { bytes: bytes.length, sha256: hash(bytes), raw };
}

function rawValue(record, label) {
  object(record, ["bytes", "sha256", "raw"], label);
  assert.ok(Number.isSafeInteger(record.bytes) && record.bytes > 0, `${label}: positive byte count required`);
  digest(record.sha256);
  assert.equal(typeof record.raw, "string", `${label}: raw UTF-8 JSON required`);
  const bytes = Buffer.from(record.raw, "utf8");
  assert.equal(bytes.length, record.bytes, `${label}: byte count changed`);
  assert.equal(hash(bytes), record.sha256, `${label}: bytes changed`);
  return { bytes, value: parseEvidenceJson(bytes) };
}

function canonicalRecord(value) {
  return rawRecord(canonical(value), "canonical JSON record");
}

function selectedTemplate(assembly) {
  const record = assembly.review.stacks.find((stack) => stack.name === assembly.target.stack);
  assert.ok(record, "Reviewed certificate template missing");
  assert.equal(record.region, REGION);
  assert.equal(record.sha256, hash(Buffer.from(record.raw, "utf8")), "Reviewed template byte identity changed");
  assert.ok(record.bytes <= TEMPLATE_LIMIT, "Reviewed template exceeds inline CreateChangeSet limit");
  return record;
}

function trustedInputs(assemblyReviewBytes, trustedAssemblyReviewSha256, trustedTarget, trustedTargetSha256) {
  const assemblyBytes = Buffer.from(assemblyReviewBytes);
  digest(trustedAssemblyReviewSha256);
  assert.equal(hash(assemblyBytes), trustedAssemblyReviewSha256, "Independent assembly review package pin mismatch");
  digest(trustedTargetSha256);
  assert.equal(hashObject(trustedTarget), trustedTargetSha256, "Independent preparation target pin mismatch");
  const assembly = parseCertificateAssemblyReviewPackage(assemblyBytes);
  equal(
    trustedTarget,
    certificateChangeSetReviewTarget(assemblyBytes, trustedAssemblyReviewSha256),
    "Assembly/preparation target binding mismatch",
  );
  assert.equal(trustedTarget.region, REGION, "Certificate preparation region substitution");
  return { assemblyBytes, assembly, template: selectedTemplate(assembly) };
}

function expectedCaller(assembly) {
  const manifest = parseEvidenceJson(Buffer.from(assembly.source.manifest.raw, "utf8"));
  const artifact = Object.values(manifest.artifacts).find((candidate) =>
    candidate?.type === "aws:cloudformation:stack" &&
    candidate?.properties?.stackName === assembly.target.stack);
  assert.ok(artifact, "Certificate stack artifact missing from reviewed manifest");
  const tokenized = artifact.properties.assumeRoleArn;
  const roleName = `cdk-hnb659fds-deploy-role-${assembly.target.account}-${REGION}`;
  assert.equal(
    tokenized,
    `arn:\${AWS::Partition}:iam::${assembly.target.account}:role/${roleName}`,
    "Reviewed certificate caller-role binding changed",
  );
  return {
    account: assembly.target.account,
    roleArn: `arn:aws:iam::${assembly.target.account}:role/${roleName}`,
    roleName,
  };
}

function createRequest(template, target) {
  return {
    StackName: target.stack,
    ChangeSetName: target.changeSetName,
    ChangeSetType: "CREATE",
    RoleARN: target.executionRole,
    TemplateBody: template.raw,
    Parameters: [],
    Capabilities: [],
    RollbackConfiguration: structuredClone(ROLLBACK_CONFIGURATION),
    NotificationARNs: [],
    Tags: structuredClone(STACK_TAGS),
    ClientToken: target.changeSetName,
    IncludeNestedStacks: false,
    OnStackFailure: "ROLLBACK",
    ImportExistingResources: false,
  };
}

export function buildCertificateCreateChangeSetRequest(
  assemblyReviewBytes,
  trustedAssemblyReviewSha256,
  trustedTarget,
  trustedTargetSha256,
) {
  const { template } = trustedInputs(
    assemblyReviewBytes,
    trustedAssemblyReviewSha256,
    trustedTarget,
    trustedTargetSha256,
  );
  return createRequest(template, trustedTarget);
}

function assertTransport(transport) {
  allowedKeys(transport, ["kind", "evidenceMode", "region", "operations", "call"], "preparation transport");
  assert.match(transport.kind, /^[a-z][a-z0-9-]{1,63}$/, "Invalid transport kind");
  assert.ok(EVIDENCE_MODES.includes(transport.evidenceMode), "Unsupported transport evidence mode");
  assert.equal(transport.region, REGION, "Transport region substitution");
  assert.equal(typeof transport.call, "function", "Transport call function required");
  if (transport.operations !== undefined) {
    assert.ok(Array.isArray(transport.operations), "Transport operation inventory required");
    for (const operation of [CALLER_OPERATION, CREATE_OPERATION, DESCRIBE_OPERATION, TEMPLATE_OPERATION, STACK_OPERATION, RESOURCES_OPERATION]) {
      assert.ok(transport.operations.includes(operation), `Transport lacks ${operation}`);
    }
    assert.ok(!transport.operations.includes("cloudformation:ExecuteChangeSet"), "Preparation transport must not expose ExecuteChangeSet");
  }
  return transport;
}

function normalizePolling(options = {}) {
  allowedKeys(options, ["intervalMs", "maxAttempts", "maxPages", "perCallTimeoutMs", "totalTimeoutMs", "now", "sleep"], "polling options");
  const value = {
    intervalMs: options.intervalMs ?? 2_000,
    maxAttempts: options.maxAttempts ?? 30,
    maxPages: options.maxPages ?? 100,
    perCallTimeoutMs: options.perCallTimeoutMs ?? 60_000,
    totalTimeoutMs: options.totalTimeoutMs ?? 300_000,
    now: options.now ?? (() => performance.now()),
    sleep: options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))),
  };
  assert.ok(Number.isSafeInteger(value.intervalMs) && value.intervalMs >= 0 && value.intervalMs <= 30_000, "Invalid polling interval");
  assert.ok(Number.isSafeInteger(value.maxAttempts) && value.maxAttempts >= 1 && value.maxAttempts <= 100, "Invalid polling attempt bound");
  assert.ok(Number.isSafeInteger(value.maxPages) && value.maxPages >= 1 && value.maxPages <= 100, "Invalid pagination bound");
  assert.ok(Number.isSafeInteger(value.perCallTimeoutMs) && value.perCallTimeoutMs >= 1_000 && value.perCallTimeoutMs <= 120_000, "Invalid call timeout");
  assert.ok(Number.isSafeInteger(value.totalTimeoutMs) && value.totalTimeoutMs >= 1_000 && value.totalTimeoutMs <= 600_000, "Invalid total timeout");
  assert.equal(typeof value.now, "function");
  assert.equal(typeof value.sleep, "function");
  return value;
}

export class CertificateChangeSetPreparationError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "CertificateChangeSetPreparationError";
    this.code = code;
  }
}

function preserveFailureTranscript(error, state) {
  if (error && typeof error === "object" && state.calls.length > 0 && !Object.hasOwn(error, "preparationTranscript")) {
    // Operational responses can contain private identifiers. Keep recovery
    // evidence available to an explicit caller without making it enumerable or
    // adding it to the error message/log representation.
    Object.defineProperty(error, "preparationTranscript", {
      value: structuredClone(state.calls),
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }
  if (error && typeof error === "object" && state.failedAttempt && !Object.hasOwn(error, "preparationFailedAttempt")) {
    Object.defineProperty(error, "preparationFailedAttempt", {
      value: structuredClone(state.failedAttempt),
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }
  return error;
}

function assertRequestId(value) {
  if (value === null) return;
  assert.equal(typeof value, "string");
  assert.match(value, /^[A-Za-z0-9-]{8,128}$/, "Invalid service request ID");
}

async function transportCall(state, operation, input) {
  const elapsed = state.polling.now() - state.startedAt;
  const remaining = state.polling.totalTimeoutMs - elapsed;
  if (remaining < 1_000) {
    throw new CertificateChangeSetPreparationError("TOTAL_TIMEOUT", "Certificate change-set preparation exceeded its total timeout");
  }
  let result;
  try {
    result = await state.transport.call({
      operation,
      region: REGION,
      input: structuredClone(input),
      timeoutMs: Math.min(state.polling.perCallTimeoutMs, remaining),
    });
  } catch (cause) {
    if (cause instanceof CertificateChangeSetPreparationError) throw cause;
    const code = typeof cause?.code === "string" && /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(cause.code)
      ? cause.code
      : "TRANSPORT_FAILURE";
    const requestId = typeof cause?.requestId === "string" && /^[A-Za-z0-9-]{8,128}$/.test(cause.requestId)
      ? cause.requestId
      : null;
    state.failedAttempt = {
      sequence: state.calls.length + 1,
      operation,
      region: REGION,
      request: canonicalRecord(input),
      error: { code, requestId },
    };
    throw new CertificateChangeSetPreparationError("TRANSPORT_FAILURE", `Certificate preparation transport failed during ${operation}`);
  }
  object(result, ["requestId", "raw", "response"], `${operation} transport response`);
  assertRequestId(result.requestId);
  assert.equal(typeof result.raw, "string", `${operation}: raw response required`);
  allowedKeys(result.response, Object.keys(result.response), `${operation} response`);
  const parsed = parseEvidenceJson(Buffer.from(result.raw, "utf8"));
  equal(parsed, result.response, `${operation}: raw/parsed response mismatch`);
  state.calls.push({
    sequence: state.calls.length + 1,
    operation,
    region: REGION,
    request: canonicalRecord(input),
    response: {
      requestId: result.requestId,
      body: rawRecord(result.raw, `${operation} raw response`),
    },
  });
  return result.response;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertCreateResponse(response, target) {
  object(response, ["Id", "StackId"], "CreateChangeSet response");
  assert.match(response.Id, new RegExp(`^arn:aws:cloudformation:${REGION}:${target.account}:changeSet/${escapeRegExp(target.changeSetName)}/[A-Za-z0-9-]+$`));
  assert.match(response.StackId, new RegExp(`^arn:aws:cloudformation:${REGION}:${target.account}:stack/${escapeRegExp(target.stack)}/[A-Za-z0-9-]+$`));
  return response;
}

function assertCallerResponse(response, expected) {
  object(response, ["UserId", "Account", "Arn"], "GetCallerIdentity response");
  assert.equal(response.Account, expected.account, "AWS caller account substitution");
  assert.equal(typeof response.UserId, "string");
  assert.ok(response.UserId.length > 0 && response.UserId.length <= 256 && !/[\x00-\x1f]/.test(response.UserId), "Invalid AWS caller user ID");
  assert.match(
    response.Arn,
    new RegExp(`^arn:aws:sts::${expected.account}:assumed-role/${escapeRegExp(expected.roleName)}/[A-Za-z0-9+=,.@_-]{1,64}$`),
    "AWS caller role substitution",
  );
  return {
    account: response.Account,
    arn: response.Arn,
    userId: response.UserId,
    expectedRoleArn: expected.roleArn,
  };
}

function assertDefaultParameters(value, label) {
  assert.ok(Array.isArray(value) && value.length === 1, `${label}: exact resolved bootstrap parameter required`);
  const parameter = allowedKeys(value[0], ["ParameterKey", "ParameterValue", "ResolvedValue", "UsePreviousValue"], `${label} bootstrap parameter`);
  assert.equal(parameter.ParameterKey, "BootstrapVersion");
  assert.equal(parameter.ParameterValue, BOOTSTRAP_PARAMETER);
  if (Object.hasOwn(parameter, "UsePreviousValue")) assert.equal(parameter.UsePreviousValue, false);
  assert.equal(typeof parameter.ResolvedValue, "string", `${label}: resolved bootstrap version required`);
  assert.match(parameter.ResolvedValue, /^(?:[6-9]|[1-9]\d+)$/, `${label}: incompatible bootstrap version`);
}

function assertRollback(value, label) {
  equal(value, ROLLBACK_CONFIGURATION, `${label}: rollback configuration substitution`);
}

function assertStackTags(value, label) {
  assert.ok(Array.isArray(value), `${label}: tags array required`);
  assert.equal(value.length, STACK_TAGS.length, `${label}: exact tag count required`);
  const entries = value.map((tag) => {
    allowedKeys(tag, ["Key", "Value"], `${label} tag`);
    assert.equal(typeof tag.Key, "string", `${label}: tag key required`);
    assert.equal(typeof tag.Value, "string", `${label}: tag value required`);
    return [tag.Key, tag.Value];
  });
  assert.equal(new Set(entries.map(([key]) => key)).size, entries.length, `${label}: duplicate tag key`);
  equal(Object.fromEntries(entries), Object.fromEntries(STACK_TAGS.map(({ Key, Value }) => [Key, Value])),
    `${label}: tag substitution`);
}

function assertPlaceholderStackTags(stack) {
  if (!Object.hasOwn(stack, "Tags")) {
    return {
      proposedTagsSource: "DESCRIBE_CHANGE_SET",
      stackTagsObservation: "OMITTED",
      applicationClaim: "NOT_CLAIMED_BEFORE_EXECUTION",
    };
  }
  assert.ok(Array.isArray(stack.Tags), "DescribeStacks: tags array required");
  if (stack.Tags.length === 0) {
    return {
      proposedTagsSource: "DESCRIBE_CHANGE_SET",
      stackTagsObservation: "EMPTY_PLACEHOLDER_ARRAY",
      applicationClaim: "NOT_CLAIMED_BEFORE_EXECUTION",
    };
  }
  assertStackTags(stack.Tags, "DescribeStacks");
  return {
    proposedTagsSource: "DESCRIBE_CHANGE_SET",
    stackTagsObservation: "MATCHING_REVIEWED_TAGS",
    applicationClaim: "NOT_CLAIMED_BEFORE_EXECUTION",
  };
}

function deploymentConfig(response, label) {
  if (!Object.hasOwn(response, "DeploymentConfig")) return null;
  const deployment = allowedKeys(
    response.DeploymentConfig,
    ["DisableRollback", "Mode"],
    `${label} deployment configuration`,
  );
  const hasMode = Object.hasOwn(deployment, "Mode");
  const hasDisableRollback = Object.hasOwn(deployment, "DisableRollback");
  const mode = hasMode ? deployment.Mode : "STANDARD";
  const disableRollback = hasDisableRollback ? deployment.DisableRollback : false;
  assert.equal(mode, "STANDARD", "Express deployment mode is unsupported");
  assert.equal(disableRollback, false, "Deployment configuration cannot disable rollback");
  return {
    value: { mode, disableRollback },
    provenance: {
      fieldSource: label,
      modeSource: hasMode ? label : "AWS_DOCUMENTED_DEFAULT_STANDARD",
      disableRollbackSource: hasDisableRollback ? label : "AWS_DOCUMENTED_DEFAULT_FALSE",
    },
  };
}

function describeChangeSetProviderCompatibility(response) {
  const documentedOptionalNullFields = [];
  for (const field of [
    "DeploymentMode",
    "Description",
    "ParentChangeSetId",
    "RootChangeSetId",
    "StackDriftStatus",
  ]) {
    if (!Object.hasOwn(response, field)) continue;
    assert.equal(response[field], null, `DescribeChangeSet ${field} substitution`);
    documentedOptionalNullFields.push(field);
  }
  return { documentedOptionalNullFields };
}

function assertDescribeBase(response, created, target) {
  allowedKeys(response, [
    "Capabilities",
    "Changes",
    "ChangeSetId",
    "ChangeSetName",
    "CreationTime",
    "DeploymentConfig",
    "DeploymentMode",
    "Description",
    "ExecutionStatus",
    "ImportExistingResources",
    "IncludeNestedStacks",
    "NextToken",
    "NotificationARNs",
    "OnStackFailure",
    "Parameters",
    "ParentChangeSetId",
    "RollbackConfiguration",
    "RootChangeSetId",
    "StackDriftStatus",
    "StackId",
    "StackName",
    "Status",
    "StatusReason",
    "Tags",
  ], "DescribeChangeSet response");
  assert.equal(response.ChangeSetId, created.Id, "DescribeChangeSet identity substitution");
  assert.equal(response.ChangeSetName, target.changeSetName);
  assert.equal(response.StackId, created.StackId, "DescribeChangeSet stack identity substitution");
  assert.equal(response.StackName, target.stack);
  equal(response.Capabilities ?? [], [], "Unexpected capabilities");
  assert.equal(response.IncludeNestedStacks, false, "Nested change-set substitution");
  assert.equal(response.ImportExistingResources, false, "Import change-set substitution");
  equal(response.NotificationARNs ?? [], [], "Unexpected notification ARNs");
  assert.equal(response.OnStackFailure, "ROLLBACK", "Rollback-mode substitution");
  assertRollback(response.RollbackConfiguration, "DescribeChangeSet");
  assertStackTags(response.Tags, "DescribeChangeSet");
  assertDefaultParameters(response.Parameters, "DescribeChangeSet");
  assert.ok(Array.isArray(response.Changes), "DescribeChangeSet changes array required");
  if (Object.hasOwn(response, "NextToken")) {
    assert.equal(typeof response.NextToken, "string", "Invalid pagination token");
    assert.ok(response.NextToken.length >= 1 && response.NextToken.length <= 1024 && !/[\x00-\x1f]/.test(response.NextToken), "Invalid pagination token");
  }
  return {
    deploymentConfig: deploymentConfig(response, "DESCRIBE_CHANGE_SET"),
    providerCompatibility: describeChangeSetProviderCompatibility(response),
  };
}

function describeRequest(created, nextToken) {
  return {
    ChangeSetName: created.Id,
    StackName: created.StackId,
    ...(nextToken === undefined ? {} : { NextToken: nextToken }),
  };
}

function assertSuccessfulChange(change) {
  object(change, ["Type", "ResourceChange"], "certificate change");
  assert.equal(change.Type, "Resource");
  const resource = allowedKeys(change.ResourceChange, [
    "Action",
    "Details",
    "LogicalResourceId",
    "Replacement",
    "ResourceType",
    "Scope",
  ], "certificate resource change");
  assert.equal(resource.Action, "Add", "Certificate initialization requires Add");
  assert.equal(resource.LogicalResourceId, "Certificate");
  assert.equal(resource.ResourceType, "AWS::CertificateManager::Certificate");
  if (Object.hasOwn(resource, "Replacement")) assert.equal(resource.Replacement, "False", "Certificate replacement unsupported");
  if (Object.hasOwn(resource, "Scope")) equal(resource.Scope, [], "Unexpected Add scope");
  if (Object.hasOwn(resource, "Details")) equal(resource.Details, [], "Unexpected Add details");
  return {
    normalized: {
      logicalId: resource.LogicalResourceId,
      type: resource.ResourceType,
      action: resource.Action,
      replacement: "False",
    },
    replacementSource: Object.hasOwn(resource, "Replacement")
      ? "DESCRIBE_CHANGE_SET"
      : "DERIVED_FALSE_FOR_ADD_WITHOUT_PRIOR_RESOURCE",
  };
}

function assertTemplateResponse(response, template) {
  object(response, ["TemplateBody", "StagesAvailable"], "GetTemplate response");
  let comparison;
  if (typeof response.TemplateBody === "string") {
    assert.equal(response.TemplateBody, template.raw, "Service-held template bytes differ from reviewed template");
    assert.equal(hash(Buffer.from(response.TemplateBody, "utf8")), template.sha256, "Service-held template digest mismatch");
    comparison = "EXACT_GET_TEMPLATE_ORIGINAL_UTF8_BYTES";
  } else {
    allowedKeys(response.TemplateBody, Object.keys(response.TemplateBody ?? {}), "AWS CLI decoded GetTemplate body");
    equal(
      response.TemplateBody,
      parseEvidenceJson(Buffer.from(template.raw, "utf8")),
      "AWS CLI decoded service-held template differs from reviewed template semantics",
    );
    comparison = "AWS_CLI_JSON_DECODED_CANONICAL_TEMPLATE_EQUIVALENCE";
  }
  assert.ok(Array.isArray(response.StagesAvailable));
  assert.ok(response.StagesAvailable.includes("Original"), "Original template stage unavailable");
  assert.ok(response.StagesAvailable.every((stage) => ["Original", "Processed"].includes(stage)), "Unexpected template stage");
  assert.equal(new Set(response.StagesAvailable).size, response.StagesAvailable.length, "Duplicate template stage");
  return comparison;
}

function assertStackResponse(response, created, target) {
  allowedKeys(response, ["Stacks"], "DescribeStacks response");
  assert.ok(Array.isArray(response.Stacks) && response.Stacks.length === 1, "Exact prepared stack readback required");
  const stack = response.Stacks[0];
  allowedKeys(stack, [
    "Capabilities",
    "ChangeSetId",
    "CreationTime",
    "Description",
    "DisableRollback",
    "DeploymentConfig",
    "DriftInformation",
    "EnableTerminationProtection",
    "LastUpdatedTime",
    "NotificationARNs",
    "Outputs",
    "Parameters",
    "RetainExceptOnCreate",
    "RoleARN",
    "RollbackConfiguration",
    "StackId",
    "StackName",
    "StackStatus",
    "StackStatusReason",
    "Tags",
    "TimeoutInMinutes",
  ], "prepared stack");
  assert.equal(stack.StackId, created.StackId);
  assert.equal(stack.StackName, target.stack);
  const hasChangeSetId = Object.hasOwn(stack, "ChangeSetId");
  if (hasChangeSetId) {
    assert.equal(stack.ChangeSetId, created.Id, "Prepared stack/change-set correspondence mismatch");
  }
  assert.equal(stack.StackStatus, "REVIEW_IN_PROGRESS", "Preparation must stop at REVIEW_IN_PROGRESS");
  assert.equal(stack.RoleARN, target.executionRole, "Prepared stack execution-role substitution");
  assert.equal(stack.DisableRollback, false, "Prepared stack rollback disabled");
  assert.equal(stack.RetainExceptOnCreate ?? false, false, "Prepared stack retains create resources on rollback");
  assert.equal(stack.EnableTerminationProtection, false, "Unexpected termination-protection state");
  equal(stack.Capabilities ?? [], [], "Unexpected prepared stack capabilities");
  equal(stack.NotificationARNs ?? [], [], "Unexpected prepared stack notification ARNs");
  equal(stack.Outputs ?? [], [], "Unexecuted prepared stack must not have outputs");
  const tagReadback = assertPlaceholderStackTags(stack);
  assertRollback(stack.RollbackConfiguration, "DescribeStacks");
  const hasParameters = Object.hasOwn(stack, "Parameters");
  if (hasParameters) assertDefaultParameters(stack.Parameters, "DescribeStacks");
  return {
    deploymentConfig: deploymentConfig(stack, "DESCRIBE_STACKS"),
    providerCompatibility: {
      changeSetIdentitySource: hasChangeSetId
        ? "DESCRIBE_STACKS_CHANGE_SET_ID"
        : "DESCRIBE_CHANGE_SET_ID_WITH_MATCHING_DESCRIBE_STACKS_STACK_ID",
      parametersSource: hasParameters
        ? "DESCRIBE_STACKS"
        : "DESCRIBE_CHANGE_SET",
      tagReadback,
    },
  };
}

function assertResourcesResponse(response) {
  object(response, ["StackResources"], "DescribeStackResources response");
  equal(response.StackResources, [], "Unexecuted preparation has unexpected physical resources");
}

function parseCall(call, expectedSequence) {
  object(call, ["sequence", "operation", "region", "request", "response"], "preparation call record");
  assert.equal(call.sequence, expectedSequence, "Preparation call sequence changed");
  assert.equal(call.region, REGION);
  object(call.response, ["requestId", "body"], "preparation response record");
  assertRequestId(call.response.requestId);
  return {
    operation: call.operation,
    request: rawValue(call.request, "preparation request").value,
    response: rawValue(call.response.body, "preparation response").value,
  };
}

function normalizeTranscript(calls, assembly, template, target, create) {
  assert.ok(Array.isArray(calls) && calls.length >= 6, "Complete preparation transcript required");
  const parsed = calls.map((call, index) => parseCall(call, index + 1));
  assert.equal(parsed[0].operation, CALLER_OPERATION);
  equal(parsed[0].request, {}, "GetCallerIdentity must have no candidate input");
  const caller = assertCallerResponse(parsed[0].response, expectedCaller(assembly));
  assert.equal(parsed[1].operation, CREATE_OPERATION);
  equal(parsed[1].request, create, "Submitted CreateChangeSet request correspondence changed");
  const created = assertCreateResponse(parsed[1].response, target);

  const templateIndex = parsed.findIndex((call, index) => index >= 2 && call.operation === TEMPLATE_OPERATION);
  assert.ok(templateIndex >= 3, "DescribeChangeSet polling missing");
  assert.equal(parsed[templateIndex + 1]?.operation, STACK_OPERATION, "DescribeStacks must follow GetTemplate");
  assert.equal(parsed[templateIndex + 2]?.operation, RESOURCES_OPERATION, "DescribeStackResources must finish preparation readback");
  assert.equal(templateIndex + 3, parsed.length, "Unexpected operation after preparation readback");
  assert.ok(parsed.slice(2, templateIndex).every((call) => call.operation === DESCRIBE_OPERATION), "Unsupported operation in change-set polling");

  let terminal;
  let terminalDeploymentConfig;
  let terminalProviderCompatibility;
  let nextToken;
  let paginating = false;
  let pollingAttempts = 0;
  const paginationTokens = new Set();
  const terminalChanges = [];
  for (const call of parsed.slice(2, templateIndex)) {
    assert.ok(!terminal || paginating, "Unexpected DescribeChangeSet call after complete pagination");
    if (!terminal) {
      pollingAttempts += 1;
      assert.ok(pollingAttempts <= 100, "DescribeChangeSet polling exceeds supported bound");
    }
    const expectedRequest = describeRequest(created, paginating ? nextToken : undefined);
    equal(call.request, expectedRequest, "DescribeChangeSet request/pagination correspondence changed");
    const describeReadback = assertDescribeBase(call.response, created, target);
    const deploymentConfig = describeReadback.deploymentConfig;
    if (!terminal) {
      if (call.response.Status === "FAILED") {
        throw new CertificateChangeSetPreparationError("CHANGE_SET_FAILED", "CloudFormation reported failed change-set preparation");
      }
      if (call.response.Status === "CREATE_COMPLETE") {
        assert.equal(call.response.ExecutionStatus, "AVAILABLE", "Prepared change set unavailable");
        terminal = call.response;
        terminalDeploymentConfig = deploymentConfig;
        terminalProviderCompatibility = describeReadback.providerCompatibility;
        terminalChanges.push(...call.response.Changes);
        nextToken = call.response.NextToken;
        paginating = nextToken !== undefined;
      } else {
        assert.ok(["CREATE_PENDING", "CREATE_IN_PROGRESS"].includes(call.response.Status), "Unexpected change-set status while polling");
        assert.equal(call.response.ExecutionStatus, "UNAVAILABLE", "In-progress change set unexpectedly executable");
        assert.equal(call.response.NextToken, undefined, "Pagination before terminal preparation unsupported");
      }
    } else {
      assert.ok(!paginationTokens.has(call.request.NextToken), "Repeated DescribeChangeSet pagination token");
      paginationTokens.add(call.request.NextToken);
      assert.ok(paginationTokens.size <= 100, "DescribeChangeSet pagination exceeds supported bound");
      assert.equal(call.response.Status, "CREATE_COMPLETE");
      assert.equal(call.response.ExecutionStatus, "AVAILABLE");
      equal(deploymentConfig, terminalDeploymentConfig, "DescribeChangeSet deployment configuration changed across pages");
      terminalChanges.push(...call.response.Changes);
      nextToken = call.response.NextToken;
      paginating = nextToken !== undefined;
    }
  }
  assert.ok(terminal, "Terminal prepared change set missing");
  assert.equal(nextToken, undefined, "Incomplete DescribeChangeSet pagination");
  assert.equal(terminalChanges.length, 1, "Exact single certificate change required");
  const change = assertSuccessfulChange(terminalChanges[0]);

  const templateCall = parsed[templateIndex];
  equal(templateCall.request, {
    ChangeSetName: created.Id,
    StackName: created.StackId,
    TemplateStage: "Original",
  }, "GetTemplate request correspondence changed");
  const templateComparison = assertTemplateResponse(templateCall.response, template);

  const stackCall = parsed[templateIndex + 1];
  equal(stackCall.request, { StackName: created.StackId }, "DescribeStacks request correspondence changed");
  const stackReadback = assertStackResponse(stackCall.response, created, target);
  equal(
    stackReadback.deploymentConfig?.value ?? { mode: "STANDARD", disableRollback: false },
    terminalDeploymentConfig?.value ?? { mode: "STANDARD", disableRollback: false },
    "DescribeStacks/DescribeChangeSet deployment configuration mismatch",
  );

  const resourcesCall = parsed[templateIndex + 2];
  equal(resourcesCall.request, { StackName: created.StackId }, "DescribeStackResources request correspondence changed");
  assertResourcesResponse(resourcesCall.response);

  const proposal = {
    schema: CERTIFICATE_CHANGE_SET_PROPOSAL_SCHEMA,
    createRequest: {
      stackName: target.stack,
      changeSetName: target.changeSetName,
      changeSetType: "CREATE",
      roleArn: target.executionRole,
      templateSha256: target.templateSha256,
      parameters: {},
      parametersSha256: target.parametersSha256,
      capabilities: [],
      includeNestedStacks: false,
      importExistingResources: false,
      notificationArns: [],
      onStackFailure: "ROLLBACK",
      rollbackConfiguration: { monitoringTimeInMinutes: 0, rollbackTriggers: [] },
    },
    describeReadback: {
      changeSetId: created.Id,
      changeSetName: target.changeSetName,
      stackId: created.StackId,
      stackName: target.stack,
      changeSetType: "CREATE",
      roleArn: target.executionRole,
      templateSha256: target.templateSha256,
      parameters: {},
      parametersSha256: target.parametersSha256,
      capabilities: [],
      includeNestedStacks: false,
      importExistingResources: false,
      notificationArns: [],
      onStackFailure: "ROLLBACK",
      rollbackConfiguration: { monitoringTimeInMinutes: 0, rollbackTriggers: [] },
      ...(terminalDeploymentConfig === null ? {} : {
        deploymentConfig: structuredClone(terminalDeploymentConfig.value),
      }),
      status: terminal.Status,
      executionStatus: terminal.ExecutionStatus,
      paginationComplete: true,
      changes: [change.normalized],
      physicalResources: {},
    },
    futureExecution: {
      authorized: false,
      changeSetId: created.Id,
      stackName: target.stack,
      disableRollback: "MUST_BE_OMITTED",
      retainExceptOnCreate: false,
    },
  };
  return {
    caller,
    proposal,
    normalization: {
      changeSetTypeSource: "SUBMITTED_CREATE_CHANGE_SET_REQUEST",
      executionRoleSource: "DESCRIBE_STACKS_ROLE_ARN",
      parameterOverridesSource: "SUBMITTED_EMPTY_OVERRIDE_SET",
      replacementSource: change.replacementSource,
      templateComparison,
      providerCompatibility: {
        describeChangeSetDocumentedOptionalNullFields:
          structuredClone(terminalProviderCompatibility.documentedOptionalNullFields),
        stackChangeSetIdentitySource:
          stackReadback.providerCompatibility.changeSetIdentitySource,
        stackParametersSource:
          stackReadback.providerCompatibility.parametersSource,
        tagReadback:
          structuredClone(stackReadback.providerCompatibility.tagReadback),
      },
      ...(terminalDeploymentConfig === null ? {} : {
        deploymentConfig: structuredClone(terminalDeploymentConfig.provenance),
      }),
    },
  };
}

function limitations(transport, calls, templateComparison) {
  const values = [
    "HUMAN_EXECUTION_APPROVAL_NOT_GRANTED",
    "CHANGE_SET_EXECUTION_NOT_PERFORMED",
    "EFFECTIVE_IAM_PERMISSIONS_UNRESOLVED",
    "POST_EXECUTION_RESOURCE_STATE_UNRESOLVED",
  ];
  if (transport.evidenceMode === "LOCAL_FIXTURE") {
    values.push("LOCAL_FIXTURE_RESPONSES_NOT_AUTHENTIC_AWS_EVIDENCE");
  } else {
    values.push("AWS_CLI_RESPONSE_AUTHENTICITY_REQUIRES_RECEIPT_REVIEW");
    if (calls.some((call) => call.response.requestId === null)) values.push("AWS_REQUEST_IDS_UNAVAILABLE_FOR_ONE_OR_MORE_CLI_RESPONSES");
  }
  if (templateComparison === "AWS_CLI_JSON_DECODED_CANONICAL_TEMPLATE_EQUIVALENCE") {
    values.push("AWS_CLI_GET_TEMPLATE_EXACT_BYTES_UNAVAILABLE");
  }
  return values;
}

function transportRecord(transport) {
  return { kind: transport.kind, evidenceMode: transport.evidenceMode, region: transport.region };
}

function assertTransportRecord(value) {
  object(value, ["kind", "evidenceMode", "region"], "preparation transport identity");
  assert.match(value.kind, /^[a-z][a-z0-9-]{1,63}$/);
  assert.ok(EVIDENCE_MODES.includes(value.evidenceMode));
  assert.equal(value.region, REGION);
  return value;
}

function finishReceipt(inputs, transport, calls, create) {
  const normalized = normalizeTranscript(calls, inputs.assembly, inputs.template, inputs.target, create);
  const proposalBytes = Buffer.from(canonical(normalized.proposal));
  const reviewPackageBytes = createCertificateChangeSetReviewPackage(
    inputs.assemblyBytes,
    inputs.assemblyReviewSha256,
    inputs.target,
    inputs.trustedTargetSha256,
    proposalBytes,
  );
  const value = {
    schema: CERTIFICATE_CHANGE_SET_PREPARATION_SCHEMA,
    status: CERTIFICATE_CHANGE_SET_PREPARATION_STATUS,
    executionAuthorized: false,
    authority: {
      createChangeSetTransportInvoked: true,
      executeChangeSetAuthorized: false,
      executeChangeSetInvoked: false,
    },
    target: structuredClone(inputs.target),
    trustedTargetSha256: inputs.trustedTargetSha256,
    source: {
      assemblyReview: rawRecord(inputs.assemblyBytes.toString("utf8"), "assembly review package"),
      createRequest: canonicalRecord(create),
    },
    transport: transportRecord(transport),
    caller: normalized.caller,
    calls: structuredClone(calls),
    normalization: {
      proposal: rawRecord(proposalBytes.toString("utf8"), "normalized change-set proposal"),
      provenance: normalized.normalization,
    },
    reviewPackage: rawRecord(reviewPackageBytes.toString("utf8"), "certificate change-set review package"),
    limitations: limitations(transport, calls, normalized.normalization.templateComparison),
  };
  assertCertificateChangeSetPreparationReceipt(value);
  return Buffer.from(canonical(value));
}

export function assertCertificateChangeSetPreparationReceipt(value) {
  object(value, [
    "schema",
    "status",
    "executionAuthorized",
    "authority",
    "target",
    "trustedTargetSha256",
    "source",
    "transport",
    "caller",
    "calls",
    "normalization",
    "reviewPackage",
    "limitations",
  ], "certificate change-set preparation receipt");
  assert.equal(value.schema, CERTIFICATE_CHANGE_SET_PREPARATION_SCHEMA);
  assert.equal(value.status, CERTIFICATE_CHANGE_SET_PREPARATION_STATUS);
  assert.equal(value.executionAuthorized, false, "Preparation receipt cannot authorize execution");
  equal(value.authority, {
    createChangeSetTransportInvoked: true,
    executeChangeSetAuthorized: false,
    executeChangeSetInvoked: false,
  }, "Preparation authority boundary changed");
  object(value.source, ["assemblyReview", "createRequest"], "preparation source");
  const assemblyRecord = rawValue(value.source.assemblyReview, "assembly review source");
  const createRecord = rawValue(value.source.createRequest, "CreateChangeSet request source");
  const inputs = trustedInputs(
    assemblyRecord.bytes,
    value.target.assemblyReviewSha256,
    value.target,
    value.trustedTargetSha256,
  );
  const create = createRequest(inputs.template, value.target);
  equal(createRecord.value, create, "CreateChangeSet request source substitution");
  const transport = assertTransportRecord(value.transport);
  const normalized = normalizeTranscript(value.calls, inputs.assembly, inputs.template, value.target, create);
  equal(value.caller, normalized.caller, "Caller evidence substitution");
  object(value.normalization, ["proposal", "provenance"], "preparation normalization");
  const proposal = rawValue(value.normalization.proposal, "normalized proposal source");
  equal(proposal.value, normalized.proposal, "Normalized proposal substitution");
  equal(value.normalization.provenance, normalized.normalization, "Normalization provenance substitution");
  const expectedReview = createCertificateChangeSetReviewPackage(
    inputs.assemblyBytes,
    value.target.assemblyReviewSha256,
    value.target,
    value.trustedTargetSha256,
    proposal.bytes,
  );
  const review = rawValue(value.reviewPackage, "review package source");
  assert.deepEqual(review.bytes, expectedReview, "Certificate change-set review package substitution");
  parseCertificateChangeSetReviewPackage(review.bytes);
  equal(value.limitations, limitations(transport, value.calls, normalized.normalization.templateComparison), "Preparation limitations changed");
  return value;
}

export function parseCertificateChangeSetPreparationReceipt(bytes) {
  return assertCertificateChangeSetPreparationReceipt(parseEvidenceJson(bytes));
}

async function collectPreparedChangeSet(state, createResponse, trusted) {
  let terminal;
  for (let attempt = 1; attempt <= state.polling.maxAttempts; attempt++) {
    const response = await transportCall(state, DESCRIBE_OPERATION, describeRequest(createResponse));
    assertDescribeBase(response, createResponse, trusted.target);
    if (response.Status === "FAILED") {
      throw new CertificateChangeSetPreparationError("CHANGE_SET_FAILED", "CloudFormation reported failed change-set preparation");
    }
    if (response.Status === "CREATE_COMPLETE") {
      assert.equal(response.ExecutionStatus, "AVAILABLE", "Prepared change set unavailable");
      terminal = response;
      break;
    }
    assert.ok(["CREATE_PENDING", "CREATE_IN_PROGRESS"].includes(response.Status), "Unexpected change-set status while polling");
    assert.equal(response.ExecutionStatus, "UNAVAILABLE", "In-progress change set unexpectedly executable");
    if (attempt < state.polling.maxAttempts) await state.polling.sleep(state.polling.intervalMs);
  }
  if (!terminal) {
    throw new CertificateChangeSetPreparationError("POLLING_EXHAUSTED", "Change-set preparation did not complete within the bounded polling attempts");
  }

  const terminalChanges = [...terminal.Changes];
  let nextToken = terminal.NextToken;
  const paginationTokens = new Set();
  while (nextToken !== undefined) {
    if (paginationTokens.has(nextToken)) {
      throw new CertificateChangeSetPreparationError("PAGINATION_CYCLE", "DescribeChangeSet returned a repeated pagination token");
    }
    if (paginationTokens.size >= state.polling.maxPages) {
      throw new CertificateChangeSetPreparationError("PAGINATION_EXHAUSTED", "DescribeChangeSet exceeded the bounded pagination limit");
    }
    paginationTokens.add(nextToken);
    const page = await transportCall(state, DESCRIBE_OPERATION, describeRequest(createResponse, nextToken));
    assertDescribeBase(page, createResponse, trusted.target);
    assert.equal(page.Status, "CREATE_COMPLETE");
    assert.equal(page.ExecutionStatus, "AVAILABLE");
    terminalChanges.push(...page.Changes);
    nextToken = page.NextToken;
  }
  assert.equal(terminalChanges.length, 1, "Exact single certificate change required");
  assertSuccessfulChange(terminalChanges[0]);

  const templateResponse = await transportCall(state, TEMPLATE_OPERATION, {
    ChangeSetName: createResponse.Id,
    StackName: createResponse.StackId,
    TemplateStage: "Original",
  });
  assertTemplateResponse(templateResponse, trusted.template);
  const stackResponse = await transportCall(state, STACK_OPERATION, { StackName: createResponse.StackId });
  assertStackResponse(stackResponse, createResponse, trusted.target);
  const resourcesResponse = await transportCall(state, RESOURCES_OPERATION, { StackName: createResponse.StackId });
  assertResourcesResponse(resourcesResponse);
}

function preservedPreparationTranscript(bytes, trusted, create, expectedChangeSetId, expectedStackId) {
  const transcriptBytes = Buffer.from(bytes);
  const calls = parseEvidenceJson(transcriptBytes);
  assert.ok(Array.isArray(calls) && calls.length >= 2, "Preserved preparation transcript requires caller and CreateChangeSet evidence");
  const parsed = calls.map((call, index) => parseCall(call, index + 1));
  assert.equal(parsed[0].operation, CALLER_OPERATION);
  equal(parsed[0].request, {}, "Preserved GetCallerIdentity request changed");
  assertCallerResponse(parsed[0].response, expectedCaller(trusted.assembly));
  assert.equal(parsed[1].operation, CREATE_OPERATION);
  equal(parsed[1].request, create, "Preserved CreateChangeSet request changed");
  const created = assertCreateResponse(parsed[1].response, trusted.target);
  assert.equal(created.Id, expectedChangeSetId, "Existing change-set identity changed");
  assert.equal(created.StackId, expectedStackId, "Existing prepared-stack identity changed");
  for (const call of parsed.slice(2)) {
    assert.equal(call.operation, DESCRIBE_OPERATION, "Preserved transcript contains unsupported post-create operation");
    equal(call.request, describeRequest(created, call.request.NextToken), "Preserved DescribeChangeSet request changed");
    assertDescribeBase(call.response, created, trusted.target);
    assert.ok(["CREATE_PENDING", "CREATE_IN_PROGRESS", "CREATE_COMPLETE", "FAILED"].includes(call.response.Status),
      "Preserved transcript has unsupported change-set state");
  }
  return { calls, created, transcriptBytes };
}

function resequence(calls) {
  return calls.map((call, index) => ({ ...structuredClone(call), sequence: index + 1 }));
}

export async function reviewExistingCertificateChangeSet({
  assemblyReviewBytes,
  trustedAssemblyReviewSha256,
  trustedTarget,
  trustedTargetSha256,
  preservedTranscriptBytes,
  expectedChangeSetId,
  expectedStackId,
  transport,
  polling,
}) {
  assertTransport(transport);
  const settings = normalizePolling(polling);
  const trusted = trustedInputs(
    assemblyReviewBytes,
    trustedAssemblyReviewSha256,
    trustedTarget,
    trustedTargetSha256,
  );
  const inputs = {
    ...trusted,
    assemblyReviewSha256: trustedAssemblyReviewSha256,
    target: trustedTarget,
    trustedTargetSha256,
  };
  const create = createRequest(trusted.template, trustedTarget);
  const preserved = preservedPreparationTranscript(
    preservedTranscriptBytes,
    inputs,
    create,
    expectedChangeSetId,
    expectedStackId,
  );
  const state = {
    calls: [],
    failedAttempt: null,
    polling: settings,
    startedAt: settings.now(),
    transport,
  };
  try {
    const callerResponse = await transportCall(state, CALLER_OPERATION, {});
    assertCallerResponse(callerResponse, expectedCaller(trusted.assembly));
    await collectPreparedChangeSet(state, preserved.created, inputs);
    const freshCallerCall = structuredClone(state.calls[0]);
    const freshReadbackCalls = state.calls.slice(1);
    const receiptCalls = resequence([
      preserved.calls[0],
      preserved.calls[1],
      ...freshReadbackCalls,
    ]);
    const receiptBytes = finishReceipt(inputs, transport, receiptCalls, create);
    const continuation = {
      schema: "shelfstate.wp007-certificate-change-set-review-continuation/v1",
      executionAuthorized: false,
      authority: {
        createChangeSetInvoked: false,
        executeChangeSetAuthorized: false,
        executeChangeSetInvoked: false,
      },
      existing: {
        changeSetId: preserved.created.Id,
        stackId: preserved.created.StackId,
      },
      preservedTranscript: {
        bytes: preserved.transcriptBytes.length,
        sha256: hash(preserved.transcriptBytes),
        retainedCallCount: 2,
        supersededReadbackSequences: preserved.calls.slice(2).map((call) => call.sequence),
      },
      freshCallerCall,
      freshReadbackCallCount: freshReadbackCalls.length,
      receiptCallSources: receiptCalls.map((call, index) => ({
        receiptSequence: call.sequence,
        source: index < 2 ? "PRESERVED_AUTHENTICATED_PREPARATION" : "FRESH_AUTHENTICATED_READBACK",
        sourceSequence: index < 2 ? preserved.calls[index].sequence : freshReadbackCalls[index - 2].sequence,
        operation: call.operation,
      })),
      receiptSha256: hash(receiptBytes),
    };
    return {
      receiptBytes,
      continuationEvidenceBytes: Buffer.from(canonical(continuation)),
    };
  } catch (error) {
    throw preserveFailureTranscript(error, state);
  }
}

export async function prepareCertificateChangeSet({
  assemblyReviewBytes,
  trustedAssemblyReviewSha256,
  trustedTarget,
  trustedTargetSha256,
  transport,
  polling,
}) {
  assertTransport(transport);
  const settings = normalizePolling(polling);
  const trusted = trustedInputs(
    assemblyReviewBytes,
    trustedAssemblyReviewSha256,
    trustedTarget,
    trustedTargetSha256,
  );
  const inputs = {
    ...trusted,
    assemblyReviewSha256: trustedAssemblyReviewSha256,
    target: trustedTarget,
    trustedTargetSha256,
  };
  const create = createRequest(trusted.template, trustedTarget);
  const state = {
    calls: [],
    failedAttempt: null,
    polling: settings,
    startedAt: settings.now(),
    transport,
  };
  try {
    const callerResponse = await transportCall(state, CALLER_OPERATION, {});
    assertCallerResponse(callerResponse, expectedCaller(trusted.assembly));
    const createResponse = assertCreateResponse(
      await transportCall(state, CREATE_OPERATION, create),
      trustedTarget,
    );

    await collectPreparedChangeSet(state, createResponse, inputs);
    return finishReceipt(inputs, transport, state.calls, create);
  } catch (error) {
    throw preserveFailureTranscript(error, state);
  }
}
