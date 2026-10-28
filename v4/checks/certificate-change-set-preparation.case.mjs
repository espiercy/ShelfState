import assert from "node:assert/strict";
import test, { before } from "node:test";
import { existsSync, readFileSync } from "node:fs";
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
  parseCertificateAssemblyReviewPackage,
} from "../infrastructure/bootstrap/certificate-assembly-adapter.mjs";
import {
  certificateChangeSetReviewTarget,
  parseCertificateChangeSetReviewPackage,
} from "../infrastructure/bootstrap/certificate-change-set-review.mjs";
import {
  CERTIFICATE_CHANGE_SET_PREPARATION_STATUS,
  CertificateChangeSetPreparationError,
  buildCertificateCreateChangeSetRequest,
  parseCertificateChangeSetPreparationReceipt,
  prepareCertificateChangeSet,
  reviewExistingCertificateChangeSet,
} from "../infrastructure/bootstrap/certificate-change-set-preparation.mjs";
import {
  AWS_CLOUDFORMATION_CLI_OPERATIONS,
  AwsCloudFormationCliError,
  awsCliInputFileReference,
  createAwsCloudFormationCliTransport,
} from "../infrastructure/bootstrap/aws-cloudformation-cli.mjs";
import { canonical, hash, hashObject } from "../scripts/release/schema.mjs";
import { ACCOUNT } from "./support/initialization-fixture.mjs";

const config = resolveEnvironmentConfig("dev", { SHELFSTATE_DEV_AWS_ACCOUNT_ID: ACCOUNT });
const region = "us-east-1";
const bootstrapParameter = "/cdk-bootstrap/hnb659fds/version";
const tags = [
  { Key: "Environment", Value: "dev" },
  { Key: "ManagedBy", Value: "AWS-CDK" },
  { Key: "Project", Value: "ShelfState" },
];
const rollback = { MonitoringTimeInMinutes: 0, RollbackTriggers: [] };
let assemblyReviewBytes;
let assemblyReviewSha256;
let reviewTarget;
let trustedTargetSha256;
let templateRaw;
let changeSetId;
let stackId;

before(async () => {
  const outdir = await mkdtemp(path.join(os.tmpdir(), "shelfstate-certificate-preparation-"));
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
    const parsedAssembly = parseCertificateAssemblyReviewPackage(assemblyReviewBytes);
    templateRaw = parsedAssembly.review.stacks.find((stack) => stack.name === reviewTarget.stack).raw;
    changeSetId = `arn:aws:cloudformation:${region}:${ACCOUNT}:changeSet/${reviewTarget.changeSetName}/fixture-change-set-id`;
    stackId = `arn:aws:cloudformation:${region}:${ACCOUNT}:stack/${reviewTarget.stack}/fixture-stack-id`;
  } finally {
    await rm(outdir, { recursive: true, force: true });
  }
});

function parameters() {
  return [{
    ParameterKey: "BootstrapVersion",
    ParameterValue: bootstrapParameter,
    ResolvedValue: "25",
  }];
}

function callerResponse() {
  return {
    UserId: "AROAFIXTURE:wp007-certificate-preparation",
    Account: ACCOUNT,
    Arn: `arn:aws:sts::${ACCOUNT}:assumed-role/cdk-hnb659fds-deploy-role-${ACCOUNT}-${region}/wp007-certificate-preparation`,
  };
}

function createResponse() {
  return { Id: changeSetId, StackId: stackId };
}

function describeResponse({
  status = "CREATE_COMPLETE",
  executionStatus = status === "CREATE_COMPLETE" ? "AVAILABLE" : "UNAVAILABLE",
  changes = [],
  deploymentConfig = { Mode: "STANDARD", DisableRollback: false },
  nextToken,
} = {}) {
  return {
    Capabilities: [],
    Changes: changes,
    ChangeSetId: changeSetId,
    ChangeSetName: reviewTarget.changeSetName,
    ExecutionStatus: executionStatus,
    ImportExistingResources: false,
    IncludeNestedStacks: false,
    NotificationARNs: [],
    OnStackFailure: "ROLLBACK",
    Parameters: parameters(),
    RollbackConfiguration: structuredClone(rollback),
    StackId: stackId,
    StackName: reviewTarget.stack,
    Status: status,
    Tags: structuredClone([...tags].reverse()),
    ...(deploymentConfig === null ? {} : { DeploymentConfig: structuredClone(deploymentConfig) }),
    ...(nextToken === undefined ? {} : { NextToken: nextToken }),
  };
}

function certificateChange(replacement = undefined) {
  return {
    Type: "Resource",
    ResourceChange: {
      Action: "Add",
      LogicalResourceId: "Certificate",
      ResourceType: "AWS::CertificateManager::Certificate",
      ...(replacement === undefined ? {} : { Replacement: replacement }),
    },
  };
}

function stackResponse() {
  return {
    Stacks: [{
      ChangeSetId: changeSetId,
      DeploymentConfig: { Mode: "STANDARD", DisableRollback: false },
      DisableRollback: false,
      EnableTerminationProtection: false,
      Parameters: parameters(),
      RetainExceptOnCreate: false,
      RoleARN: reviewTarget.executionRole,
      RollbackConfiguration: structuredClone(rollback),
      StackId: stackId,
      StackName: reviewTarget.stack,
      StackStatus: "REVIEW_IN_PROGRESS",
      Tags: structuredClone([...tags].reverse()),
    }],
  };
}

function successfulResponses() {
  return [
    callerResponse(),
    createResponse(),
    describeResponse({ status: "CREATE_IN_PROGRESS" }),
    describeResponse({ nextToken: "fixture-next-token" }),
    describeResponse({ changes: [certificateChange()] }),
    { TemplateBody: templateRaw, StagesAvailable: ["Original", "Processed"] },
    stackResponse(),
    { StackResources: [] },
  ];
}

function fakeTransport(responses = successfulResponses()) {
  const queued = responses.map((response) => response instanceof Error ? response : structuredClone(response));
  const calls = [];
  const transport = {
    kind: "local-fixture",
    evidenceMode: "LOCAL_FIXTURE",
    region,
    operations: [...AWS_CLOUDFORMATION_CLI_OPERATIONS],
    async call(candidate) {
      calls.push(structuredClone(candidate));
      const response = queued.shift();
      if (response instanceof Error) throw response;
      assert.ok(response, `Unexpected fake transport call ${candidate.operation}`);
      return {
        requestId: `fixture-request-${String(calls.length).padStart(2, "0")}`,
        raw: canonical(response),
        response,
      };
    },
  };
  Object.defineProperty(transport, "calls", { value: calls, enumerable: false });
  return transport;
}

function operatorInput(transport, polling = {}) {
  return {
    assemblyReviewBytes,
    trustedAssemblyReviewSha256: assemblyReviewSha256,
    trustedTarget: reviewTarget,
    trustedTargetSha256,
    transport,
    polling: {
      intervalMs: 0,
      maxAttempts: 4,
      perCallTimeoutMs: 10_000,
      totalTimeoutMs: 30_000,
      sleep: async () => {},
      ...polling,
    },
  };
}

function record(value) {
  const raw = canonical(value);
  return { bytes: Buffer.byteLength(raw), sha256: hash(Buffer.from(raw)), raw };
}

test("constructs the exact bounded CreateChangeSet request", () => {
  const request = buildCertificateCreateChangeSetRequest(
    assemblyReviewBytes,
    assemblyReviewSha256,
    reviewTarget,
    trustedTargetSha256,
  );
  assert.deepEqual(request, {
    StackName: reviewTarget.stack,
    ChangeSetName: reviewTarget.changeSetName,
    ChangeSetType: "CREATE",
    RoleARN: reviewTarget.executionRole,
    TemplateBody: templateRaw,
    Parameters: [],
    Capabilities: [],
    RollbackConfiguration: rollback,
    NotificationARNs: [],
    Tags: tags,
    ClientToken: reviewTarget.changeSetName,
    IncludeNestedStacks: false,
    OnStackFailure: "ROLLBACK",
    ImportExistingResources: false,
  });
  assert.ok(Buffer.byteLength(request.TemplateBody) <= 51_200);
  assert.equal(hash(Buffer.from(request.TemplateBody)), reviewTarget.templateSha256);
});

test("prepares, paginates, reads back and emits deterministic non-executable review material", async () => {
  const firstTransport = fakeTransport();
  const first = await prepareCertificateChangeSet(operatorInput(firstTransport));
  const second = await prepareCertificateChangeSet(operatorInput(fakeTransport()));
  assert.deepEqual(first, second, "Fixed inputs and responses must produce deterministic output");
  const receipt = parseCertificateChangeSetPreparationReceipt(first);
  assert.equal(receipt.status, CERTIFICATE_CHANGE_SET_PREPARATION_STATUS);
  assert.equal(receipt.executionAuthorized, false);
  assert.deepEqual(receipt.authority, {
    createChangeSetTransportInvoked: true,
    executeChangeSetAuthorized: false,
    executeChangeSetInvoked: false,
  });
  assert.deepEqual(firstTransport.calls.map((call) => call.operation), [
    "sts:GetCallerIdentity",
    "cloudformation:CreateChangeSet",
    "cloudformation:DescribeChangeSet",
    "cloudformation:DescribeChangeSet",
    "cloudformation:DescribeChangeSet",
    "cloudformation:GetTemplate",
    "cloudformation:DescribeStacks",
    "cloudformation:DescribeStackResources",
  ]);
  assert.ok(firstTransport.calls.every((call) => call.region === region));
  assert.deepEqual(firstTransport.calls[4].input, {
    ChangeSetName: changeSetId,
    StackName: stackId,
    NextToken: "fixture-next-token",
  });
  assert.ok(firstTransport.calls
    .filter((call) => call.operation === "cloudformation:DescribeChangeSet")
    .every((call) => !Object.hasOwn(call.input, "IncludePropertyValues")));
  assert.equal(receipt.normalization.provenance.replacementSource, "DERIVED_FALSE_FOR_ADD_WITHOUT_PRIOR_RESOURCE");
  assert.deepEqual(receipt.normalization.provenance.deploymentConfig, {
    fieldSource: "DESCRIBE_CHANGE_SET",
    modeSource: "DESCRIBE_CHANGE_SET",
    disableRollbackSource: "DESCRIBE_CHANGE_SET",
  });
  assert.ok(receipt.limitations.includes("LOCAL_FIXTURE_RESPONSES_NOT_AUTHENTIC_AWS_EVIDENCE"));
  const review = parseCertificateChangeSetReviewPackage(Buffer.from(receipt.reviewPackage.raw));
  assert.equal(review.executionAuthorized, false);
  assert.equal(review.review.changeSetId, changeSetId);
  assert.deepEqual(review.review.resourceChanges, [{
    logicalId: "Certificate",
    type: "AWS::CertificateManager::Certificate",
    action: "Add",
    replacement: "False",
  }]);
  assert.deepEqual(review.review.rollback.deploymentConfig, {
    mode: "STANDARD",
    disableRollback: false,
  });
});

test("binds documented DeploymentConfig defaults and rejects unsupported deployment behavior", async (t) => {
  await t.test("observed STANDARD with rollback enabled", async () => {
    const receipt = parseCertificateChangeSetPreparationReceipt(
      await prepareCertificateChangeSet(operatorInput(fakeTransport())),
    );
    const proposal = JSON.parse(receipt.normalization.proposal.raw);
    assert.deepEqual(proposal.describeReadback.deploymentConfig, {
      mode: "STANDARD",
      disableRollback: false,
    });
  });
  for (const [name, deploymentConfig, pattern] of [
    ["EXPRESS", { Mode: "EXPRESS", DisableRollback: false }, /Express deployment mode/],
    ["disabled rollback", { Mode: "STANDARD", DisableRollback: true }, /cannot disable rollback/],
    ["unknown field", { Mode: "STANDARD", DisableRollback: false, Other: true }, /unsupported field/],
    ["malformed object", "STANDARD", /object required/],
    ["malformed mode", { Mode: 1, DisableRollback: false }, /Express deployment mode/],
    ["malformed rollback", { Mode: "STANDARD", DisableRollback: "false" }, /cannot disable rollback/],
  ]) await t.test(name, async () => {
    const responses = successfulResponses();
    for (const response of responses.filter((value) => Object.hasOwn(value, "DeploymentConfig"))) {
      response.DeploymentConfig = structuredClone(deploymentConfig);
    }
    await assert.rejects(
      () => prepareCertificateChangeSet(operatorInput(fakeTransport(responses))),
      pattern,
    );
  });
  for (const [name, deploymentConfig, expectedSources] of [
    ["both documented defaults", {}, ["AWS_DOCUMENTED_DEFAULT_STANDARD", "AWS_DOCUMENTED_DEFAULT_FALSE"]],
    ["default rollback", { Mode: "STANDARD" }, ["DESCRIBE_CHANGE_SET", "AWS_DOCUMENTED_DEFAULT_FALSE"]],
    ["default mode", { DisableRollback: false }, ["AWS_DOCUMENTED_DEFAULT_STANDARD", "DESCRIBE_CHANGE_SET"]],
  ]) await t.test(name, async () => {
    const responses = successfulResponses();
    for (const response of responses.filter((value) => Object.hasOwn(value, "DeploymentConfig"))) {
      response.DeploymentConfig = structuredClone(deploymentConfig);
    }
    const receipt = parseCertificateChangeSetPreparationReceipt(
      await prepareCertificateChangeSet(operatorInput(fakeTransport(responses))),
    );
    assert.deepEqual(receipt.normalization.provenance.deploymentConfig, {
      fieldSource: "DESCRIBE_CHANGE_SET",
      modeSource: expectedSources[0],
      disableRollbackSource: expectedSources[1],
    });
  });
  await t.test("legacy absent field", async () => {
    const responses = successfulResponses();
    for (const response of responses.filter((value) => Object.hasOwn(value, "DeploymentConfig"))) {
      delete response.DeploymentConfig;
    }
    const receipt = parseCertificateChangeSetPreparationReceipt(
      await prepareCertificateChangeSet(operatorInput(fakeTransport(responses))),
    );
    const proposal = JSON.parse(receipt.normalization.proposal.raw);
    assert.equal(Object.hasOwn(proposal.describeReadback, "deploymentConfig"), false);
    assert.equal(Object.hasOwn(receipt.normalization.provenance, "deploymentConfig"), false);
  });
});

test("accepts service tag reordering while rejecting tag substitution", async (t) => {
  const accepted = parseCertificateChangeSetPreparationReceipt(
    await prepareCertificateChangeSet(operatorInput(fakeTransport())),
  );
  assert.equal(accepted.status, CERTIFICATE_CHANGE_SET_PREPARATION_STATUS);
  for (const [name, mutate, pattern] of [
    ["changed value", value => { value[0].Value = "production"; }, /tag substitution/],
    ["duplicate key", value => { value[1].Key = value[0].Key; }, /duplicate tag key/],
    ["extra tag", value => { value.push({ Key: "Other", Value: "other" }); }, /exact tag count/],
    ["unknown field", value => { value[0].Other = true; }, /unsupported field/],
  ]) await t.test(name, async () => {
    const responses = successfulResponses();
    mutate(responses[4].Tags);
    await assert.rejects(
      () => prepareCertificateChangeSet(operatorInput(fakeTransport(responses))),
      pattern,
    );
  });
});

test("continues review of the existing change set without another CreateChangeSet", async () => {
  let preservedTranscript;
  const interrupted = fakeTransport([
    callerResponse(),
    createResponse(),
    describeResponse({ status: "CREATE_IN_PROGRESS" }),
  ]);
  await assert.rejects(
    () => prepareCertificateChangeSet(operatorInput(interrupted, { maxAttempts: 1 })),
    (error) => {
      preservedTranscript = error.preparationTranscript;
      return error instanceof CertificateChangeSetPreparationError &&
        error.code === "POLLING_EXHAUSTED" &&
        preservedTranscript.length === 3;
    },
  );

  const continuationTransport = fakeTransport([
    callerResponse(),
    describeResponse({ changes: [certificateChange()] }),
    { TemplateBody: JSON.parse(templateRaw), StagesAvailable: ["Original", "Processed"] },
    stackResponse(),
    { StackResources: [] },
  ]);
  const result = await reviewExistingCertificateChangeSet({
    ...operatorInput(continuationTransport),
    preservedTranscriptBytes: Buffer.from(canonical(preservedTranscript)),
    expectedChangeSetId: changeSetId,
    expectedStackId: stackId,
  });
  const receipt = parseCertificateChangeSetPreparationReceipt(result.receiptBytes);
  const continuation = JSON.parse(result.continuationEvidenceBytes.toString("utf8"));
  assert.equal(receipt.executionAuthorized, false);
  assert.equal(continuation.executionAuthorized, false);
  assert.deepEqual(continuation.authority, {
    createChangeSetInvoked: false,
    executeChangeSetAuthorized: false,
    executeChangeSetInvoked: false,
  });
  assert.deepEqual(continuationTransport.calls.map((call) => call.operation), [
    "sts:GetCallerIdentity",
    "cloudformation:DescribeChangeSet",
    "cloudformation:GetTemplate",
    "cloudformation:DescribeStacks",
    "cloudformation:DescribeStackResources",
  ]);
  assert.equal(continuationTransport.calls.some((call) =>
    ["cloudformation:CreateChangeSet", "cloudformation:ExecuteChangeSet"].includes(call.operation)), false);
  assert.deepEqual(receipt.calls.map((call) => call.operation), [
    "sts:GetCallerIdentity",
    "cloudformation:CreateChangeSet",
    "cloudformation:DescribeChangeSet",
    "cloudformation:GetTemplate",
    "cloudformation:DescribeStacks",
    "cloudformation:DescribeStackResources",
  ]);
  assert.deepEqual(continuation.preservedTranscript.supersededReadbackSequences, [3]);
  assert.equal(continuation.freshReadbackCallCount, 4);
  const review = parseCertificateChangeSetReviewPackage(Buffer.from(receipt.reviewPackage.raw));
  assert.deepEqual(review.review.rollback.deploymentConfig, {
    mode: "STANDARD",
    disableRollback: false,
  });
});

test("rejects wrong caller identity before CreateChangeSet", async () => {
  const wrong = callerResponse();
  wrong.Arn = `arn:aws:sts::${ACCOUNT}:assumed-role/other-role/session`;
  const transport = fakeTransport([wrong]);
  await assert.rejects(() => prepareCertificateChangeSet(operatorInput(transport)), /caller role substitution/);
  assert.deepEqual(transport.calls.map((call) => call.operation), ["sts:GetCallerIdentity"]);
});

test("rejects substituted target and template identities before transport use", async () => {
  const transport = fakeTransport();
  await assert.rejects(() => prepareCertificateChangeSet({
    ...operatorInput(transport),
    trustedTargetSha256: "0".repeat(64),
  }));
  assert.equal(transport.calls.length, 0);
  const target = structuredClone(reviewTarget);
  target.templateSha256 = "0".repeat(64);
  await assert.rejects(() => prepareCertificateChangeSet({
    ...operatorInput(transport),
    trustedTarget: target,
    trustedTargetSha256: hashObject(target),
  }));
  assert.equal(transport.calls.length, 0);
});

test("rejects changed service-held template bytes", async () => {
  const responses = successfulResponses();
  responses[5].TemplateBody = `${templateRaw} `;
  const transport = fakeTransport(responses);
  await assert.rejects(() => prepareCertificateChangeSet(operatorInput(transport)), /template bytes differ/);
  assert.equal(transport.calls.at(-1).operation, "cloudformation:GetTemplate");
});

test("binds AWS CLI decoded GetTemplate semantics while preserving the exact-byte limitation", async () => {
  const responses = successfulResponses();
  responses[5].TemplateBody = JSON.parse(templateRaw);
  const receipt = parseCertificateChangeSetPreparationReceipt(
    await prepareCertificateChangeSet(operatorInput(fakeTransport(responses))),
  );
  assert.equal(
    receipt.normalization.provenance.templateComparison,
    "AWS_CLI_JSON_DECODED_CANONICAL_TEMPLATE_EQUIVALENCE",
  );
  assert.ok(receipt.limitations.includes("AWS_CLI_GET_TEMPLATE_EXACT_BYTES_UNAVAILABLE"));

  const substituted = successfulResponses();
  substituted[5].TemplateBody = JSON.parse(templateRaw);
  substituted[5].TemplateBody.Description = "substituted";
  await assert.rejects(
    () => prepareCertificateChangeSet(operatorInput(fakeTransport(substituted))),
    /differs from reviewed template semantics/,
  );
});

test("rejects unexpected resource changes, execution role and physical resources", async (t) => {
  await t.test("additional change", async () => {
    const responses = successfulResponses();
    responses[4].Changes.push({
      Type: "Resource",
      ResourceChange: { Action: "Add", LogicalResourceId: "Other", ResourceType: "AWS::Route53::RecordSet" },
    });
    await assert.rejects(() => prepareCertificateChangeSet(operatorInput(fakeTransport(responses))), /single certificate change/);
  });
  await t.test("wrong execution role", async () => {
    const responses = successfulResponses();
    responses[6].Stacks[0].RoleARN = responses[6].Stacks[0].RoleARN.replace("cfn-exec-role", "other-role");
    await assert.rejects(() => prepareCertificateChangeSet(operatorInput(fakeTransport(responses))), /execution-role substitution/);
  });
  await t.test("existing physical resource", async () => {
    const responses = successfulResponses();
    responses[7].StackResources.push({
      LogicalResourceId: "Certificate",
      PhysicalResourceId: "fixture",
      ResourceType: "AWS::CertificateManager::Certificate",
    });
    await assert.rejects(() => prepareCertificateChangeSet(operatorInput(fakeTransport(responses))), /unexpected physical resources/);
  });
  await t.test("unsupported stack deployment configuration", async () => {
    const responses = successfulResponses();
    responses[6].Stacks[0].DeploymentConfig = { Mode: "EXPRESS", DisableRollback: false };
    await assert.rejects(
      () => prepareCertificateChangeSet(operatorInput(fakeTransport(responses))),
      /Express deployment mode/,
    );
  });
});

test("fails closed on service failure, bounded polling exhaustion and transport error", async (t) => {
  await t.test("CloudFormation failure", async () => {
    const responses = [callerResponse(), createResponse(), describeResponse({ status: "FAILED" })];
    await assert.rejects(
      () => prepareCertificateChangeSet(operatorInput(fakeTransport(responses))),
      (error) => error instanceof CertificateChangeSetPreparationError &&
        error.code === "CHANGE_SET_FAILED" &&
        error.preparationTranscript.length === 3 &&
        !Object.keys(error).includes("preparationTranscript"),
    );
  });
  await t.test("polling exhaustion", async () => {
    const responses = [
      callerResponse(),
      createResponse(),
      describeResponse({ status: "CREATE_IN_PROGRESS" }),
      describeResponse({ status: "CREATE_IN_PROGRESS" }),
    ];
    const transport = fakeTransport(responses);
    await assert.rejects(
      () => prepareCertificateChangeSet(operatorInput(transport, { maxAttempts: 2 })),
      (error) => error instanceof CertificateChangeSetPreparationError && error.code === "POLLING_EXHAUSTED",
    );
    assert.equal(transport.calls.length, 4);
  });
  await t.test("pagination cycle", async () => {
    const responses = [
      callerResponse(),
      createResponse(),
      describeResponse({ nextToken: "repeated-token" }),
      describeResponse({ nextToken: "repeated-token" }),
    ];
    await assert.rejects(
      () => prepareCertificateChangeSet(operatorInput(fakeTransport(responses))),
      (error) => error instanceof CertificateChangeSetPreparationError && error.code === "PAGINATION_CYCLE",
    );
  });
  await t.test("transport failure", async () => {
    const failure = new Error("fixture secret detail");
    failure.code = "RequestTimeout";
    failure.requestId = "fixture-failed-request-01";
    const transport = fakeTransport([callerResponse(), failure]);
    await assert.rejects(
      () => prepareCertificateChangeSet(operatorInput(transport)),
      (error) => error instanceof CertificateChangeSetPreparationError &&
        error.code === "TRANSPORT_FAILURE" &&
        !error.message.includes("fixture secret detail") &&
        error.preparationTranscript.length === 1 &&
        error.preparationFailedAttempt.operation === "cloudformation:CreateChangeSet" &&
        error.preparationFailedAttempt.error.code === "RequestTimeout" &&
        error.preparationFailedAttempt.error.requestId === "fixture-failed-request-01" &&
        JSON.parse(error.preparationFailedAttempt.request.raw).ChangeSetName === reviewTarget.changeSetName &&
        !Object.keys(error).includes("preparationFailedAttempt"),
    );
  });
});

test("receipt validation detects broken pagination and raw correspondence", async () => {
  const bytes = await prepareCertificateChangeSet(operatorInput(fakeTransport()));
  const value = JSON.parse(bytes.toString("utf8"));
  const paginated = value.calls.find((call) =>
    call.operation === "cloudformation:DescribeChangeSet" &&
    JSON.parse(call.request.raw).NextToken);
  const request = JSON.parse(paginated.request.raw);
  request.NextToken = "substituted-token";
  paginated.request = record(request);
  assert.throws(() => parseCertificateChangeSetPreparationReceipt(Buffer.from(canonical(value))), /pagination correspondence/);

  const other = JSON.parse(bytes.toString("utf8"));
  other.calls[0].response.body.raw = canonical({ ...callerResponse(), Account: "000000000000" });
  assert.throws(() => parseCertificateChangeSetPreparationReceipt(Buffer.from(canonical(other))), /bytes changed/);
});

test("AWS CLI transport uses a private structured input file, explicit region and no shell", async () => {
  assert.equal(createAwsCloudFormationCliTransport().region, region, "Default process environment must be accepted without invoking the CLI");
  let captured;
  let inputPath;
  const transport = createAwsCloudFormationCliTransport({
    command: "aws-fixture",
    cwd: process.cwd(),
    environment: {},
    timeoutMs: 10_000,
    execute(command, args, options) {
      captured = { command, args, options };
      const inputReference = args[args.indexOf("--cli-input-json") + 1];
      assert.ok(inputReference.startsWith("file://"));
      inputPath = inputReference.slice("file://".length);
      assert.equal(inputReference, awsCliInputFileReference(inputPath));
      assert.deepEqual(JSON.parse(readFileSync(inputPath, "utf8")), {});
      return { stdout: canonical(callerResponse()), requestId: "fixture-request-cli" };
    },
  });
  const result = await transport.call({
    operation: "sts:GetCallerIdentity",
    region,
    input: {},
    timeoutMs: 10_000,
  });
  assert.deepEqual(result.response, callerResponse());
  assert.equal(captured.command, "aws-fixture");
  assert.deepEqual(captured.args.slice(0, 2), ["sts", "get-caller-identity"]);
  assert.equal(captured.args[captured.args.indexOf("--region") + 1], region);
  assert.ok(captured.args.includes("--no-paginate"));
  assert.ok(captured.args.includes("--no-cli-pager"));
  assert.equal(captured.options.shell, false);
  assert.equal(captured.options.env.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS, "true");
  assert.equal(existsSync(inputPath), false, "Temporary AWS CLI input must be removed");
  await assert.rejects(() => transport.call({
    operation: "cloudformation:ExecuteChangeSet",
    region,
    input: {},
  }), /Unsupported AWS CLI operation/);
  assert.ok(!AWS_CLOUDFORMATION_CLI_OPERATIONS.includes("cloudformation:ExecuteChangeSet"));
});

test("AWS CLI paramfile references preserve native Windows paths", () => {
  const windowsPath = String.raw`C:\Users\Example\AppData\Local\Temp\shelfstate-wp007-aws-cli\input.json`;
  const reference = awsCliInputFileReference(windowsPath);
  assert.equal(reference, `file://${windowsPath}`);
  assert.equal(reference.slice("file://".length), windowsPath);
  assert.doesNotMatch(reference, /^file:\/\/\/[A-Za-z]:\//);
});

test("AWS CLI errors are bounded and do not expose captured stderr", async () => {
  const transport = createAwsCloudFormationCliTransport({
    environment: {},
    timeoutMs: 10_000,
    execute() {
      const error = new Error("process failed");
      error.stderr = "An error occurred (AccessDenied) when calling operation: secret-token x-amzn-requestid: request-12345678";
      throw error;
    },
  });
  await assert.rejects(
    () => transport.call({ operation: "sts:GetCallerIdentity", region, input: {} }),
    (error) => error instanceof AwsCloudFormationCliError &&
      error.code === "AccessDenied" &&
      error.requestId === "request-12345678" &&
      !error.message.includes("secret-token"),
  );
});
