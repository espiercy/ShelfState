// Credential-free, file-only adapter for the exact WP-007 certificate CDK
// assembly. This module has no AWS SDK, subprocess, deployment, or change-set
// path. Trust inputs are supplied separately from the candidate assembly.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { CAPABILITY_DEFINITIONS } from "../lib/capabilities.mjs";
import {
  assertFoundationTemplate,
  assertNoDeferredInfrastructure,
  assertStatefulResourceSafeguards,
} from "../lib/template-guards.mjs";
import { assertEdgeCertificateTemplate } from "./edge-certificate-contract.mjs";
import { target } from "./initialization.mjs";
import { readAssembly } from "../../scripts/release/assemblies.mjs";
import { validateInventory, verifyInventory } from "../../scripts/release/artifacts.mjs";
import {
  canonical,
  digest,
  equal,
  hash,
  hashObject,
  object,
  parseEvidenceJson,
} from "../../scripts/release/schema.mjs";

export const CERTIFICATE_SYNTHESIS_CONTEXT_SCHEMA =
  "shelfstate.wp007-certificate-synthesis-context/v1";
export const CERTIFICATE_ASSEMBLY_TARGET_SCHEMA =
  "shelfstate.wp007-certificate-assembly-target/v1";
export const CERTIFICATE_ASSEMBLY_REVIEW_SCHEMA =
  "shelfstate.wp007-certificate-assembly-review-package/v1";
export const CERTIFICATE_ASSEMBLY_REVIEW_STATUS =
  "NON_EXECUTABLE_REVIEW_MATERIAL";

const CDK_SCHEMA = "54.0.0";
const MINIMUM_CLI_VERSION = "2.1144.0";
// Canonical properties emitted by the pinned aws-cdk-lib under the exact
// certificate synthesis context. Feature flags can change synthesis behavior,
// so their report is identity-pinned rather than treated as loose diagnostics.
const FEATURE_FLAG_REPORT_SHA256 =
  "7baa955d616ab67734290fe5b71410b1dad6004c54a2a971e2457fa4dd851a37";
const QUALIFIER = "hnb659fds";
const BOOTSTRAP_PARAMETER = "/cdk-bootstrap/hnb659fds/version";
const PARTITION_TOKEN = "${AWS::Partition}";

function pascal(value) {
  return value
    .split("-")
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join("");
}

function expectedStacks(account) {
  return CAPABILITY_DEFINITIONS.map((definition) => {
    const region = definition.key === "edge-certificate" ? "us-east-1" : "us-west-2";
    const id = `ShelfStateV4Dev${pascal(definition.key)}`;
    return Object.freeze({
      assetArtifactId: `${id}.assets`,
      assetManifestPath: `${id}.assets.json`,
      capability: definition.key,
      id,
      metadataPath: `${id}.metadata.json`,
      name: `shelfstate-v4-dev-${definition.key}`,
      region,
      templatePath: `${id}.template.json`,
      account,
    });
  }).sort((a, b) => a.id.localeCompare(b.id));
}

function expectedMemberPaths(stacks) {
  return [
    "cdk.out",
    "manifest.json",
    "tree.json",
    "validation-report.json",
    ...stacks.flatMap((stack) => [
      stack.assetManifestPath,
      stack.metadataPath,
      stack.templatePath,
    ]),
  ].sort();
}

export function certificateSynthesisContext() {
  return {
    schema: CERTIFICATE_SYNTHESIS_CONTEXT_SCHEMA,
    application: "node infrastructure/bin/app.mjs",
    credentialMode: "credential-free-required",
    lookups: "disabled",
    context: {
      "@aws-cdk/core:newStyleStackSynthesis": true,
      "aws:cdk:enable-path-metadata": false,
      "aws:cdk:version-reporting": false,
      shelfstateEnvironment: "dev",
      shelfstateInitializationPhase: "certificate",
    },
  };
}

export function certificateSynthesisContextBytes() {
  return Buffer.from(canonical(certificateSynthesisContext()));
}

export function certificateAssemblyTarget(account, synthesisContextSha256) {
  digest(synthesisContextSha256);
  const binding = target(account, "certificate");
  return {
    schema: CERTIFICATE_ASSEMBLY_TARGET_SCHEMA,
    account,
    environment: "dev",
    phase: "certificate",
    region: binding.region,
    stack: binding.name,
    executionRole: binding.executionRole,
    synthesisContextSha256,
  };
}

function assertTarget(value, trustedDigest) {
  object(value, [
    "schema",
    "account",
    "environment",
    "phase",
    "region",
    "stack",
    "executionRole",
    "synthesisContextSha256",
  ], "certificate assembly target");
  assert.equal(value.schema, CERTIFICATE_ASSEMBLY_TARGET_SCHEMA);
  assert.equal(value.environment, "dev", "Certificate target/authority binding mismatch");
  assert.equal(value.phase, "certificate", "Certificate target/authority binding mismatch");
  digest(value.synthesisContextSha256);
  const expected = certificateAssemblyTarget(value.account, value.synthesisContextSha256);
  equal(value, expected, "Certificate target/authority binding mismatch");
  if (trustedDigest !== undefined) {
    digest(trustedDigest);
    assert.equal(hashObject(value), trustedDigest, "Independent certificate target pin mismatch");
  }
}

function parseRawJson(raw, label) {
  assert.equal(typeof raw, "string", `${label}: raw UTF-8 JSON required`);
  return parseEvidenceJson(Buffer.from(raw, "utf8"));
}

function assertSynthesisContext(record, expectedSha256) {
  digest(expectedSha256);
  object(record, ["bytes", "sha256", "raw"], "synthesis context identity");
  assert.ok(Number.isSafeInteger(record.bytes) && record.bytes > 0);
  digest(record.sha256);
  const bytes = Buffer.from(record.raw, "utf8");
  assert.equal(bytes.length, record.bytes, "Synthesis context byte count mismatch");
  assert.equal(hash(bytes), record.sha256, "Synthesis context substitution");
  assert.equal(record.sha256, expectedSha256, "Untrusted synthesis context identity");
  equal(
    parseRawJson(record.raw, "synthesis context"),
    certificateSynthesisContext(),
    "Unsupported or substituted synthesis context",
  );
}

function inventoryRecord(files, memberPath) {
  const record = files.find((file) => file.path === memberPath);
  assert.ok(record, `Missing assembly member identity: ${memberPath}`);
  return record;
}

function assertRawRecord(record, files, label) {
  object(record, ["path", "bytes", "sha256", "raw"], label);
  const inventory = inventoryRecord(files, record.path);
  assert.equal(record.bytes, inventory.bytes, `${label}: byte identity mismatch`);
  assert.equal(record.sha256, inventory.sha256, `${label}: digest identity mismatch`);
  const bytes = Buffer.from(record.raw, "utf8");
  assert.equal(bytes.length, record.bytes, `${label}: raw byte count mismatch`);
  assert.equal(hash(bytes), record.sha256, `${label}: raw content substitution`);
  return parseEvidenceJson(bytes);
}

function exactRole(account, region, kind) {
  return `arn:${PARTITION_TOKEN}:iam::${account}:role/cdk-${QUALIFIER}-${kind}-${account}-${region}`;
}

function assertAssetManifest(data, rawSha256, stack) {
  object(data, ["version", "files", "dockerImages"], `${stack.id} asset manifest`);
  assert.equal(data.version, CDK_SCHEMA);
  equal(data.dockerImages, {}, "Docker assets are unsupported");
  object(data.files, [rawSha256], `${stack.id} exact template asset`);
  const file = data.files[rawSha256];
  object(file, ["displayName", "source", "destinations"], `${stack.id} file asset`);
  assert.equal(file.displayName, `${stack.name} Template`);
  equal(file.source, { path: stack.templatePath, packaging: "file" }, "Only the exact stack template asset is supported");
  const destinations = Object.entries(file.destinations);
  assert.equal(destinations.length, 1, "Exactly one template publication destination required");
  const [destinationId, destination] = destinations[0];
  assert.match(destinationId, new RegExp(`^${stack.account}-${stack.region}-[a-f0-9]{8}$`));
  equal(destination, {
    bucketName: `cdk-${QUALIFIER}-assets-${stack.account}-${stack.region}`,
    objectKey: `${rawSha256}.json`,
    region: stack.region,
    assumeRoleArn: exactRole(stack.account, stack.region, "file-publishing-role"),
  }, `${stack.id} template publication binding mismatch`);
}

function assertStackArtifact(artifact, stack, templateSha256) {
  object(artifact, [
    "type",
    "environment",
    "properties",
    "dependencies",
    "additionalMetadataFile",
    "displayName",
  ], `${stack.id} stack artifact`);
  assert.equal(artifact.type, "aws:cloudformation:stack");
  assert.equal(artifact.environment, `aws://${stack.account}/${stack.region}`, `${stack.id} environment binding mismatch`);
  assert.equal(artifact.displayName, stack.id);
  assert.equal(artifact.additionalMetadataFile, stack.metadataPath);
  const dependencies = stack.capability === "edge-delivery"
    ? ["ShelfStateV4DevEdgeCertificate", stack.assetArtifactId]
    : [stack.assetArtifactId];
  equal(artifact.dependencies, dependencies, `${stack.id} dependency graph mismatch`);
  object(artifact.properties, [
    "templateFile",
    "terminationProtection",
    "tags",
    "validateOnSynth",
    "assumeRoleArn",
    "cloudFormationExecutionRoleArn",
    "stackTemplateAssetObjectUrl",
    "requiresBootstrapStackVersion",
    "bootstrapStackVersionSsmParameter",
    "additionalDependencies",
    "lookupRole",
    "stackName",
  ], `${stack.id} stack properties`);
  equal(artifact.properties, {
    templateFile: stack.templatePath,
    terminationProtection: false,
    tags: { Environment: "dev", ManagedBy: "AWS-CDK", Project: "ShelfState" },
    validateOnSynth: false,
    assumeRoleArn: exactRole(stack.account, stack.region, "deploy-role"),
    cloudFormationExecutionRoleArn: exactRole(stack.account, stack.region, "cfn-exec-role"),
    stackTemplateAssetObjectUrl:
      `s3://cdk-${QUALIFIER}-assets-${stack.account}-${stack.region}/${templateSha256}.json`,
    requiresBootstrapStackVersion: 6,
    bootstrapStackVersionSsmParameter: BOOTSTRAP_PARAMETER,
    additionalDependencies: [stack.assetArtifactId],
    lookupRole: {
      arn: exactRole(stack.account, stack.region, "lookup-role"),
      requiresBootstrapStackVersion: 8,
      bootstrapStackVersionSsmParameter: BOOTSTRAP_PARAMETER,
    },
    stackName: stack.name,
  }, `${stack.id} target/execution configuration mismatch`);
}

function assertManifest(manifest, stacks, templateRecords, assetRecords) {
  object(manifest, ["version", "artifacts", "minimumCliVersion"], "certificate assembly manifest");
  assert.equal(manifest.version, CDK_SCHEMA);
  assert.equal(manifest.minimumCliVersion, MINIMUM_CLI_VERSION);
  const expectedArtifactIds = [
    ...stacks.flatMap((stack) => [stack.assetArtifactId, stack.id]),
    "Tree",
    "aws-cdk-lib/feature-flag-report",
  ];
  object(manifest.artifacts, expectedArtifactIds, "exact certificate assembly artifact inventory");
  for (const stack of stacks) {
    const template = templateRecords.find((record) => record.id === stack.id);
    const asset = assetRecords.find((record) => record.artifactId === stack.assetArtifactId);
    assert.ok(template && asset, `${stack.id}: incomplete review package`);
    const assetArtifact = manifest.artifacts[stack.assetArtifactId];
    object(assetArtifact, ["type", "properties"], `${stack.id} asset artifact`);
    equal(assetArtifact, {
      type: "cdk:asset-manifest",
      properties: {
        file: stack.assetManifestPath,
        requiresBootstrapStackVersion: 6,
        bootstrapStackVersionSsmParameter: BOOTSTRAP_PARAMETER,
      },
    }, `${stack.id} asset artifact mismatch`);
    assertStackArtifact(manifest.artifacts[stack.id], stack, template.sha256);
    assertAssetManifest(parseRawJson(asset.raw, `${stack.id} asset manifest`), template.sha256, stack);
  }
  equal(manifest.artifacts.Tree, {
    type: "cdk:tree",
    properties: { file: "tree.json" },
  }, "Unexpected construct-tree artifact");
  const feature = manifest.artifacts["aws-cdk-lib/feature-flag-report"];
  object(feature, ["type", "properties"], "feature flag artifact");
  assert.equal(feature.type, "cdk:feature-flag-report");
  assert.equal(feature.properties?.module, "aws-cdk-lib");
  assert.ok(feature.properties?.flags && Object.getPrototypeOf(feature.properties.flags) === Object.prototype);
  assert.equal(
    hashObject(feature.properties),
    FEATURE_FLAG_REPORT_SHA256,
    "Pinned CDK feature flag report identity mismatch",
  );
}

function assertTemplateRecords(records, stacks, files, expectedTemplateSha256) {
  assert.ok(Array.isArray(records));
  assert.equal(records.length, stacks.length, "Exactly six stack templates required");
  const ids = records.map((record) => record.id);
  equal(ids, stacks.map((stack) => stack.id), "Template review inventory mismatch");
  const parsed = new Map();
  for (const stack of stacks) {
    const record = records.find((candidate) => candidate.id === stack.id);
    object(record, [
      "id",
      "name",
      "environment",
      "region",
      "templatePath",
      "bytes",
      "sha256",
      "raw",
      "resourceCount",
    ], `${stack.id} template review`);
    assert.equal(record.name, stack.name);
    assert.equal(record.environment, "dev");
    assert.equal(record.region, stack.region);
    assert.equal(record.templatePath, stack.templatePath);
    const template = assertRawRecord({
      path: record.templatePath,
      bytes: record.bytes,
      sha256: record.sha256,
      raw: record.raw,
    }, files, `${stack.id} template`);
    assert.equal(record.resourceCount, Object.keys(template.Resources ?? {}).length);
    parsed.set(stack.id, template);
  }
  const selectedStack = stacks.find((stack) => stack.capability === "edge-certificate");
  const selectedRecord = records.find((record) => record.id === selectedStack.id);
  if (expectedTemplateSha256 !== undefined) {
    digest(expectedTemplateSha256);
    assert.equal(selectedRecord.sha256, expectedTemplateSha256, "Reviewed template/assembly substitution");
  }
  const selectedTemplate = parsed.get(selectedStack.id);
  assertEdgeCertificateTemplate(selectedTemplate, selectedStack.account, "certificate");
  let resources = 0;
  for (const stack of stacks) {
    const template = parsed.get(stack.id);
    resources += Object.keys(template.Resources ?? {}).length;
    assertNoDeferredInfrastructure(template);
    assertStatefulResourceSafeguards(template, "dev");
    if (stack.capability === "edge-certificate") continue;
    object(template, ["Description", "Metadata", "Parameters", "Rules"], `${stack.id} foundation template`);
    assert.equal(template.Description, `${CAPABILITY_DEFINITIONS.find((item) => item.key === stack.capability).label} for ShelfState V4 dev (WP-003; no service resources)`);
    equal(template.Metadata, { ShelfState: {
      Capability: stack.capability,
      Environment: "dev",
      Region: stack.region,
      WorkPackage: "WP-003",
    } }, `${stack.id} topology metadata mismatch`);
    equal(template.Parameters, selectedTemplate.Parameters, `${stack.id} bootstrap parameter mismatch`);
    equal(template.Rules, selectedTemplate.Rules, `${stack.id} bootstrap rule mismatch`);
    equal(template.Resources ?? {}, {}, `${stack.id} must remain resource empty`);
    assertFoundationTemplate(template, "dev");
  }
  assert.equal(resources, 1, "Only the selected certificate stack may contain one resource");
}

// Validate the report separately because violations is an array; keeping this
// accepted diagnostic fields explicit without binding stack-trace text.
function assertValidationReportSemantics(report, stacks) {
  object(report, ["version", "title", "pluginReports"], "CDK validation report");
  assert.equal(report.version, CDK_SCHEMA);
  assert.equal(report.title, "Validation Report");
  assert.ok(Array.isArray(report.pluginReports) && report.pluginReports.length === 1);
  const plugin = report.pluginReports[0];
  object(plugin, ["pluginName", "pluginVersion", "conclusion", "violations", "suppressedViolations"], "CDK validation plugin report");
  assert.equal(plugin.pluginName, "CloudFormation Validate");
  assert.equal(plugin.pluginVersion, "1.12.1");
  assert.equal(plugin.conclusion, "success");
  equal(plugin.violations, [], "CDK validation violations are unsupported");
  assert.ok(Array.isArray(plugin.suppressedViolations) && plugin.suppressedViolations.length === 1);
  const suppression = plugin.suppressedViolations[0];
  assert.equal(suppression.ruleName, "F0001");
  assert.equal(suppression.severity, "warning");
  assert.equal(suppression.acknowledgedId, "CloudFormation-Validate::F0001");
  assert.equal(suppression.reason, "WP-003 deliberately synthesizes resource-empty capability boundaries; service resources require later authorization.");
  const expectedEmpty = stacks.filter((stack) => stack.capability !== "edge-certificate").map((stack) => stack.id).sort();
  assert.ok(Array.isArray(suppression.violatingConstructs));
  equal(suppression.violatingConstructs.map((item) => item.constructPath).sort(), expectedEmpty, "Only the five empty stacks may suppress F0001");
  for (const item of suppression.violatingConstructs) {
    assert.equal(item.constructFqn, "aws-cdk-lib.Stack");
    assert.equal(item.libraryVersion, "2.273.0");
    assert.ok(Array.isArray(item.stackTraces));
  }
}

export function assertCertificateAssemblyReviewPackage(value, expected = {}) {
  object(value, ["schema", "status", "executionAuthorized", "target", "trustedTargetSha256", "source", "review"], "certificate assembly review package");
  assert.equal(value.schema, CERTIFICATE_ASSEMBLY_REVIEW_SCHEMA);
  assert.equal(value.status, CERTIFICATE_ASSEMBLY_REVIEW_STATUS);
  assert.equal(value.executionAuthorized, false, "Review material must never authorize execution");
  assertTarget(value.target);
  digest(value.trustedTargetSha256);
  assert.equal(value.trustedTargetSha256, hashObject(value.target), "Certificate target pin substitution");
  for (const key of ["account", "environment", "phase", "region", "stack", "executionRole"])
    if (Object.hasOwn(expected, key)) assert.equal(value.target[key], expected[key], `Review package ${key} binding mismatch`);
  object(value.source, ["assemblySha256", "files", "manifest", "synthesisContext"], "review source identities");
  validateInventory(value.source.files);
  const stacks = expectedStacks(value.target.account);
  equal(value.source.files.map((file) => file.path), expectedMemberPaths(stacks), "Unexpected or missing CDK assembly member");
  digest(value.source.assemblySha256);
  assert.equal(value.source.assemblySha256, hashObject(value.source.files), "Raw assembly inventory identity mismatch");
  assertSynthesisContext(value.source.synthesisContext, value.target.synthesisContextSha256);
  assert.equal(value.source.manifest.path, "manifest.json", "Raw manifest path substitution");
  const manifest = assertRawRecord(value.source.manifest, value.source.files, "raw CDK manifest");
  object(value.review, ["cdkSchema", "minimumCliVersion", "stackCount", "resourceCount", "assetManifests", "stacks"], "certificate review material");
  assert.equal(value.review.cdkSchema, CDK_SCHEMA);
  assert.equal(value.review.minimumCliVersion, MINIMUM_CLI_VERSION);
  assert.equal(value.review.stackCount, 6);
  assert.equal(value.review.resourceCount, 1, "Only the selected certificate stack may contain one resource");
  assert.ok(Array.isArray(value.review.assetManifests));
  assert.equal(value.review.assetManifests.length, 6);
  const assetRecords = value.review.assetManifests;
  for (const stack of stacks) {
    const record = assetRecords.find((candidate) => candidate.artifactId === stack.assetArtifactId);
    assert.ok(record, `${stack.id}: missing asset manifest review`);
    object(record, ["artifactId", "path", "bytes", "sha256", "raw"], `${stack.id} asset manifest identity`);
    assert.equal(record.path, stack.assetManifestPath);
    assertRawRecord({ path: record.path, bytes: record.bytes, sha256: record.sha256, raw: record.raw }, value.source.files, `${stack.id} asset manifest`);
  }
  assertTemplateRecords(value.review.stacks, stacks, value.source.files, expected.templateSha256);
  assertManifest(manifest, stacks, value.review.stacks, assetRecords);
  return value;
}

export function parseCertificateAssemblyReviewPackage(bytes, expected = {}) {
  const value = parseEvidenceJson(bytes);
  return assertCertificateAssemblyReviewPackage(value, expected);
}

async function boundRawRecord(root, files, memberPath) {
  const identity = inventoryRecord(files, memberPath);
  const bytes = await readFile(path.join(root, ...memberPath.split("/")));
  assert.equal(bytes.length, identity.bytes, `${memberPath}: changed byte count`);
  assert.equal(hash(bytes), identity.sha256, `${memberPath}: changed after assembly inventory`);
  const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return { path: memberPath, bytes: bytes.length, sha256: identity.sha256, raw };
}

export async function createCertificateAssemblyReviewPackage(
  assemblyRoot,
  synthesisContextBytes,
  trustedTarget,
  trustedTargetDigest,
) {
  assertTarget(trustedTarget, trustedTargetDigest);
  const contextBytes = Buffer.from(synthesisContextBytes);
  assert.equal(hash(contextBytes), trustedTarget.synthesisContextSha256, "Synthesis context substitution");
  equal(parseEvidenceJson(contextBytes), certificateSynthesisContext(), "Unsupported synthesis context");
  const snapshot = await readAssembly(assemblyRoot, "dev");
  const stacks = expectedStacks(trustedTarget.account);
  equal(snapshot.files.map((file) => file.path), expectedMemberPaths(stacks), "Unexpected or missing CDK assembly member");
  const manifestRecord = await boundRawRecord(assemblyRoot, snapshot.files, "manifest.json");
  const templateRecords = [];
  const assetRecords = [];
  for (const stack of stacks) {
    const templateRecord = await boundRawRecord(assemblyRoot, snapshot.files, stack.templatePath);
    const template = parseRawJson(templateRecord.raw, `${stack.id} template`);
    templateRecords.push({
      id: stack.id,
      name: stack.name,
      environment: "dev",
      region: stack.region,
      templatePath: stack.templatePath,
      bytes: templateRecord.bytes,
      sha256: templateRecord.sha256,
      raw: templateRecord.raw,
      resourceCount: Object.keys(template.Resources ?? {}).length,
    });
    const assetRecord = await boundRawRecord(assemblyRoot, snapshot.files, stack.assetManifestPath);
    assetRecords.push({ artifactId: stack.assetArtifactId, ...assetRecord });
  }
  const cdkOut = parseRawJson((await boundRawRecord(assemblyRoot, snapshot.files, "cdk.out")).raw, "cdk.out");
  equal(cdkOut, { version: CDK_SCHEMA }, "Unsupported CDK assembly marker");
  const validationReport = parseRawJson(
    (await boundRawRecord(assemblyRoot, snapshot.files, "validation-report.json")).raw,
    "validation report",
  );
  assertValidationReportSemantics(validationReport, stacks);
  const sourceContextRaw = new TextDecoder("utf-8", { fatal: true }).decode(contextBytes);
  const value = {
    schema: CERTIFICATE_ASSEMBLY_REVIEW_SCHEMA,
    status: CERTIFICATE_ASSEMBLY_REVIEW_STATUS,
    executionAuthorized: false,
    target: structuredClone(trustedTarget),
    trustedTargetSha256: trustedTargetDigest,
    source: {
      assemblySha256: hashObject(snapshot.files),
      files: structuredClone(snapshot.files),
      manifest: manifestRecord,
      synthesisContext: {
        bytes: contextBytes.length,
        sha256: hash(contextBytes),
        raw: sourceContextRaw,
      },
    },
    review: {
      cdkSchema: CDK_SCHEMA,
      minimumCliVersion: MINIMUM_CLI_VERSION,
      stackCount: templateRecords.length,
      resourceCount: templateRecords.reduce((total, record) => total + record.resourceCount, 0),
      assetManifests: assetRecords,
      stacks: templateRecords,
    },
  };
  assertCertificateAssemblyReviewPackage(value);
  await verifyInventory(assemblyRoot, snapshot.files);
  return Buffer.from(canonical(value));
}
