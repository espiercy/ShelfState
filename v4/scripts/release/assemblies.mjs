import { readFile } from "node:fs/promises";
import path from "node:path";
import { assert, object, environment, hash, hashObject, equal, parseEvidenceJson, text } from "./schema.mjs";
import { artifactPath, inventory, verifyInventory, validateInventory } from "./artifacts.mjs";
import { CAPABILITY_DEFINITIONS } from "../../infrastructure/lib/capabilities.mjs";
import { assertStatefulResourceSafeguards, assertNoDeferredInfrastructure } from "../../infrastructure/lib/template-guards.mjs";

const assemblyVersion = "54.0.0";
const allowedArtifactTypes = ["aws:cloudformation:stack", "cdk:asset-manifest", "cdk:tree", "cdk:feature-flag-report"];
// Identity is deliberately process-local and cannot be serialized or copied.
// Reload retained bytes through readAssembly after crossing a process boundary.
const issuedSnapshots = new WeakSet();
function freeze(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function map(value, label) { assert.ok(value && Object.getPrototypeOf(value) === Object.prototype, `${label}: object required`); }
function allowedKeys(value, allowed, label) {
  map(value, label); assert.ok(Object.keys(value).every(k => allowed.includes(k)), `${label}: unsupported field`);
}
function strings(values) { assert.ok(Array.isArray(values)); values.forEach(text); }
function bootstrapProperties(p) {
  if (Object.hasOwn(p, "requiresBootstrapStackVersion")) assert.ok(Number.isSafeInteger(p.requiresBootstrapStackVersion) && p.requiresBootstrapStackVersion > 0);
  if (Object.hasOwn(p, "bootstrapStackVersionSsmParameter")) text(p.bootstrapStackVersionSsmParameter);
}
// Narrow subset of the installed 54.0.0 schema, not a generic CDK adapter.
// Creation traces/logical IDs are diagnostic only. Stack tags are preserved;
// legacy asset/property-mutation metadata is NOT accepted as harmless metadata.
function diagnosticMetadata(value) {
  map(value, "diagnostic metadata");
  for (const entries of Object.values(value)) {
    assert.ok(Array.isArray(entries));
    for (const entry of entries) {
      allowedKeys(entry, ["type", "data", "trace"], "metadata entry");
      if (Object.hasOwn(entry, "trace")) strings(entry.trace);
      if (entry.type === "aws:cdk:creationStack") strings(entry.data);
      else if (entry.type === "aws:cdk:logicalId") text(entry.data);
      else if (entry.type === "aws:cdk:stack-tags") {
        assert.ok(Array.isArray(entry.data));
        for (const tag of entry.data) { object(tag, ["key", "value"]); text(tag.key); text(tag.value); }
      } else assert.fail("Unsupported assembly metadata type");
    }
  }
}
function artifactFields(artifact, manifest) {
  assert.ok(allowedArtifactTypes.includes(artifact.type), "Unsupported/nested assembly artifact");
  const stack = artifact.type === "aws:cloudformation:stack";
  allowedKeys(artifact, stack ? ["type", "environment", "properties", "dependencies", "displayName", "metadata", "additionalMetadataFile"]
    : ["type", "properties", "dependencies", "displayName"], "artifact");
  if (Object.hasOwn(artifact, "displayName")) text(artifact.displayName);
  if (Object.hasOwn(artifact, "dependencies")) {
    strings(artifact.dependencies);
    assert.equal(new Set(artifact.dependencies).size, artifact.dependencies.length, "Duplicate artifact dependency");
    assert.ok(artifact.dependencies.every(d => Object.hasOwn(manifest.artifacts, d)), "Incomplete artifact dependency graph");
  }
  if (Object.hasOwn(artifact, "metadata")) diagnosticMetadata(artifact.metadata);
  if (Object.hasOwn(artifact, "additionalMetadataFile")) artifactPath(artifact.additionalMetadataFile);
}
function stackProperties(p) {
  allowedKeys(p, ["templateFile", "terminationProtection", "tags", "validateOnSynth", "assumeRoleArn", "cloudFormationExecutionRoleArn", "stackTemplateAssetObjectUrl", "requiresBootstrapStackVersion", "bootstrapStackVersionSsmParameter", "additionalDependencies", "lookupRole", "stackName"], "stack properties");
  text(p.stackName); artifactPath(p.templateFile);
  assert.equal(typeof p.terminationProtection, "boolean");
  for (const key of ["assumeRoleArn", "cloudFormationExecutionRoleArn", "stackTemplateAssetObjectUrl"]) if (Object.hasOwn(p, key)) text(p[key]);
  if (Object.hasOwn(p, "validateOnSynth")) assert.equal(typeof p.validateOnSynth, "boolean");
  if (Object.hasOwn(p, "tags")) { map(p.tags, "tags"); Object.values(p.tags).forEach(text); }
  if (Object.hasOwn(p, "additionalDependencies")) strings(p.additionalDependencies);
  bootstrapProperties(p);
  if (Object.hasOwn(p, "lookupRole")) {
    allowedKeys(p.lookupRole, ["arn", "requiresBootstrapStackVersion", "bootstrapStackVersionSsmParameter"], "lookup role");
    text(p.lookupRole.arn); bootstrapProperties(p.lookupRole);
  }
}
function featureFlags(p) {
  object(p, ["module", "flags"], "feature flag report"); text(p.module); map(p.flags, "flags");
  for (const flag of Object.values(p.flags)) {
    allowedKeys(flag, ["recommendedValue", "userValue", "explanation", "unconfiguredBehavesLike"], "feature flag");
    if (Object.hasOwn(flag, "explanation")) text(flag.explanation);
    if (Object.hasOwn(flag, "unconfiguredBehavesLike")) allowedKeys(flag.unconfiguredBehavesLike, ["v1", "v2"], "feature flag defaults");
  }
}

// The only real supported assembly is WP-003's recorded schema and empty
// topology. No CDK imports, context providers, schema downloads, or evaluation.
export async function readAssembly(root, env) {
  environment(env); const files = await inventory(root); const byPath = new Map(files.map(f => [f.path, f]));
  async function json(name) {
    artifactPath(name); assert.ok(byPath.has(name), `Missing assembly file: ${name}`);
    const bytes = await readFile(path.join(root, ...name.split("/")));
    assert.equal(hash(bytes), byPath.get(name).sha256, "Assembly file changed");
    return parseEvidenceJson(bytes);
  }
  const manifest = await json("manifest.json");
  allowedKeys(manifest, ["version", "artifacts", "minimumCliVersion", "missing"], "assembly");
  assert.equal(manifest.version, assemblyVersion, "Unsupported assembly schema");
  if (Object.hasOwn(manifest, "minimumCliVersion")) assert.equal(manifest.minimumCliVersion, "2.1144.0", "Unsupported assembly CLI requirement");
  assert.ok(!Object.hasOwn(manifest, "missing") || (Array.isArray(manifest.missing) && manifest.missing.length === 0), "AWS context lookup evidence unsupported");
  map(manifest.artifacts, "artifacts");
  const stacks = [], assets = [], assetManifests = {}, additionalMetadata = {};
  for (const [id, artifact] of Object.entries(manifest.artifacts)) {
    artifactFields(artifact, manifest);
    if (artifact.type === "aws:cloudformation:stack") {
      const p = artifact.properties; stackProperties(p); text(artifact.environment);
      const template = await json(p.templateFile);
      if (artifact.additionalMetadataFile) {
        additionalMetadata[id] = await json(artifact.additionalMetadataFile);
        diagnosticMetadata(additionalMetadata[id]);
      }
      assert.ok((p.additionalDependencies ?? []).every(d => Object.hasOwn(manifest.artifacts, d)), "Incomplete additional dependency graph");
      stacks.push({ id, name: p.stackName, environment: artifact.environment,
        properties: p, dependencies: artifact.dependencies ?? [], template,
        templateDigest: hashObject(template), templatePath: p.templateFile });
    } else if (artifact.type === "cdk:asset-manifest") {
      allowedKeys(artifact.properties, ["file", "requiresBootstrapStackVersion", "bootstrapStackVersionSsmParameter"], "asset artifact properties");
      bootstrapProperties(artifact.properties);
      artifactPath(artifact.properties.file);
      assert.ok(!artifact.properties.file.includes("/"), "Only root-level asset manifests supported");
      const asset = await json(artifact.properties.file);
      object(asset, ["version", "files", "dockerImages"], "asset manifest");
      assert.equal(asset.version, assemblyVersion, "Unsupported asset schema"); map(asset.files, "asset files");
      equal(asset.dockerImages, {}, "Docker assets not supported");
      for (const file of Object.values(asset.files)) {
        allowedKeys(file, ["displayName", "source", "destinations"], "file asset");
        if (Object.hasOwn(file, "displayName")) text(file.displayName);
        assert.equal(file.source.packaging, "file", "Bundling/assets unsupported");
        object(file.source, ["path", "packaging"], "asset source");
        map(file.destinations, "asset destinations");
        assert.ok(Object.keys(file.destinations).length > 0, "Asset destinations required");
        for (const [destinationId, destination] of Object.entries(file.destinations)) {
          text(destinationId);
          // Current file destinations encode account in ID/bucket/role, not an
          // invented accountId field. External IDs and arbitrary STS options
          // are outside this subset and fail closed, even though CDK knows them.
          object(destination, ["bucketName", "objectKey", "region", "assumeRoleArn"], "file destination");
          Object.values(destination).forEach(text);
        }
        await json(file.source.path); assets.push(file.source.path);
      }
      assetManifests[id] = asset;
    } else if (artifact.type === "cdk:tree") {
      object(artifact.properties, ["file"], "tree artifact properties");
      // Construct-tree JSON is diagnostic, never used as executable input or
      // a stack selector. Its original file remains in the raw byte inventory.
      await json(artifact.properties.file);
    } else featureFlags(artifact.properties);
  }
  const paths = stacks.map(s => s.templatePath);
  assert.ok(assets.every(f => paths.includes(f)), "Non-template file asset unsupported");
  assert.equal(new Set(paths).size, paths.length, "Shared/duplicate template path");
  await verifyInventory(root, files);
  const snapshot = { schema: "shelfstate.offline-assembly/v1", cdkSchema: assemblyVersion, environment: env,
    evidenceKind: "offline-recorded-only", files, artifacts: manifest.artifacts, assetManifests, additionalMetadata,
    stacks: stacks.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) };
  validateSnapshotData(snapshot);
  freeze(snapshot); issuedSnapshots.add(snapshot); return snapshot;
}
function validateSnapshotData(value) {
  object(value, ["schema", "cdkSchema", "environment", "evidenceKind", "files", "stacks", "artifacts", "assetManifests", "additionalMetadata"], "assembly snapshot");
  assert.equal(value.schema, "shelfstate.offline-assembly/v1"); assert.equal(value.cdkSchema, assemblyVersion, "Unsupported assembly schema");
  assert.equal(value.evidenceKind, "offline-recorded-only"); environment(value.environment); validateInventory(value.files);
  assert.ok(Array.isArray(value.stacks) && value.stacks.length <= 64, "Incomplete/unbounded stack evidence");
  const ids = new Set(), names = new Set();
  for (const s of value.stacks) {
    object(s, ["id", "name", "environment", "properties", "dependencies", "template", "templateDigest", "templatePath"], "stack");
    assert.equal(typeof s.id, "string"); assert.match(s.id, /^[A-Za-z][A-Za-z0-9]*$/);
    assert.ok(!ids.has(s.id) && !names.has(s.name), "Duplicate stack identity"); ids.add(s.id); names.add(s.name);
    assert.equal(s.name, s.properties.stackName, "Stack identity mismatch");
    assert.equal(s.templatePath, s.properties.templateFile, "Template identity mismatch");
    assert.ok(value.files.some(f => f.path === s.templatePath), "Missing template inventory");
    assert.equal(s.templateDigest, hashObject(s.template), "Template/data disagreement");
    map(s.template, "template"); map(s.template.Resources ?? {}, "resources");
  }
}
export function assessTransition(previous, candidate) {
  for (const snapshot of [previous, candidate]) assert.ok(issuedSnapshots.has(snapshot), "Verified reader-issued snapshot required; reload retained bytes");
  assert.equal(previous.environment, candidate.environment, "Cross-environment transition");
  const issues = [], stackChanges = [];
  // Preserve all supported artifact fields (including displayName, which CDK
  // can use for selection). No deployment/publishing configuration change is
  // inferred safe from empty resource templates. Diagnostic traces are retained
  // but not execution inputs; supported metadata types were checked at ingress.
  if (hashObject(previous.artifacts) !== hashObject(candidate.artifacts)) issues.push("Assembly artifact/execution configuration change requires separate review");
  if (hashObject(previous.assetManifests) !== hashObject(candidate.assetManifests)) issues.push("Asset publishing configuration change requires separate review");
  const prior = new Map(previous.stacks.map(s => [s.id, s])), next = new Map(candidate.stacks.map(s => [s.id, s]));
  for (const id of [...new Set([...prior.keys(), ...next.keys()])].sort()) {
    const a = prior.get(id), b = next.get(id);
    const action = !a ? "Add" : !b ? "Remove" : hashObject(a) === hashObject(b) ? "Unchanged" : "Modify";
    stackChanges.push({ id, action });
    if (!b) issues.push(`${id}: stack removal requires separate authorization`);
    if (a && b && (a.name !== b.name || a.environment !== b.environment)) issues.push(`${id}: stack replacement/target change`);
    if (a && b && a.properties.terminationProtection && !b.properties.terminationProtection) issues.push(`${id}: termination protection weakened`);
    if (a && b && hashObject(a.properties) !== hashObject(b.properties)) issues.push(`${id}: changed stack execution/configuration requires separate review`);
    if (a && b && hashObject(a.template.Parameters ?? {}) !== hashObject(b.template.Parameters ?? {})) issues.push(`${id}: changed parameter semantics`);
    if (a && b && hashObject(a.template.Rules ?? {}) !== hashObject(b.template.Rules ?? {})) issues.push(`${id}: changed rule semantics`);
    const oldResources = a?.template.Resources ?? {}, newResources = b?.template.Resources ?? {};
    for (const rid of Object.keys(oldResources)) {
      const old = oldResources[rid], current = newResources[rid];
      if (!current) { issues.push(`${id}/${rid}: resource removal`); continue; }
      if (old.Type !== current.Type) issues.push(`${id}/${rid}: resource type replacement`);
      for (const key of ["DeletionPolicy", "UpdateReplacePolicy"])
        if (old[key] === "Retain" && current[key] !== "Retain") issues.push(`${id}/${rid}: retention weakened`);
      if (old.Metadata?.ShelfStateStatefulPolicy !== current.Metadata?.ShelfStateStatefulPolicy) issues.push(`${id}/${rid}: stateful reclassification`);
      if (old.Properties?.DeletionProtectionEnabled === true && current.Properties?.DeletionProtectionEnabled !== true) issues.push(`${id}/${rid}: DynamoDB protection weakened`);
      if (old.Properties?.DeletionProtection === "ACTIVE" && current.Properties?.DeletionProtection !== "ACTIVE") issues.push(`${id}/${rid}: Cognito protection weakened`);
      if (old.Type?.startsWith("AWS::Backup::") && hashObject(old) !== hashObject(current)) issues.push(`${id}/${rid}: backup configuration change requires separate review`);
      if (hashObject(old) !== hashObject(current)) issues.push(`${id}/${rid}: replacement semantics not established offline`);
    }
  }
  for (const [side, snapshot] of [["previous", previous], ["candidate", candidate]]) {
    const cdkEnv = snapshot.environment === "production" ? "prod" : "dev";
    const capabilities = new Set(CAPABILITY_DEFINITIONS.map(x => x.key));
    if (snapshot.stacks.length !== 6) issues.push(`${side}: expected exactly six capability stacks`);
    for (const s of snapshot.stacks) {
      const metadata = s.template.Metadata?.ShelfState;
      if (!metadata || !capabilities.delete(metadata.Capability)) issues.push(`${side}/${s.id}: invalid/duplicate capability`);
      if (metadata?.Environment !== cdkEnv) issues.push(`${side}/${s.id}: environment metadata mismatch`);
      const region = metadata?.Capability === "edge-certificate" ? "us-east-1" : "us-west-2";
      if (metadata?.Region !== region || s.environment !== `aws://unknown-account/${region}`) issues.push(`${side}/${s.id}: only credential-free unresolved-account foundation supported`);
      if (s.name !== `shelfstate-v4-${cdkEnv}-${metadata?.Capability}`) issues.push(`${side}/${s.id}: unexpected stack name`);
      if (s.properties.terminationProtection !== (cdkEnv === "prod")) issues.push(`${side}/${s.id}: termination protection mismatch`);
      const unsupported = Object.keys(s.template).filter(k => !["Description", "Metadata", "Parameters", "Rules", "Resources"].includes(k));
      if (unsupported.length) issues.push(`${side}/${s.id}: unsupported template/macro/nested semantics`);
      // BootstrapVersion and its check are recorded data, never looked up here.
      if (Object.keys(s.template.Parameters ?? {}).some(k => k !== "BootstrapVersion") || Object.keys(s.template.Rules ?? {}).some(k => k !== "CheckBootstrapVersion")) issues.push(`${side}/${s.id}: unresolved parameter/rule semantics`);
      if (s.template.Parameters?.BootstrapVersion) {
        const parameter = s.template.Parameters.BootstrapVersion;
        if (parameter.Type !== "AWS::SSM::Parameter::Value<String>" || parameter.Default !== "/cdk-bootstrap/hnb659fds/version" ||
            Object.keys(parameter).some(k => !["Type", "Default", "Description"].includes(k))) issues.push(`${side}/${s.id}: unsupported bootstrap parameter`);
        const rule = s.template.Rules?.CheckBootstrapVersion;
        const knownAssertion = { "Fn::Not": [{ "Fn::Contains": [["1", "2", "3", "4", "5"], { Ref: "BootstrapVersion" }] }] };
        if (!rule || Object.keys(rule).some(k => k !== "Assertions") || rule.Assertions?.length !== 1 ||
            hashObject(rule.Assertions[0].Assert ?? null) !== hashObject(knownAssertion) ||
            Object.keys(rule.Assertions[0]).some(k => !["Assert", "AssertDescription"].includes(k))) issues.push(`${side}/${s.id}: unsupported bootstrap rule`);
      } else if (s.template.Rules?.CheckBootstrapVersion) issues.push(`${side}/${s.id}: rule without bound bootstrap parameter`);
      try { assertStatefulResourceSafeguards(s.template, cdkEnv); assertNoDeferredInfrastructure(s.template); }
      catch (error) { issues.push(`${side}/${s.id}: ${error.message}`); }
      if (Object.keys(s.template.Resources ?? {}).length) issues.push(`${side}/${s.id}: non-empty assembly requires separately supported resource/replacement semantics`);
    }
    if (capabilities.size) issues.push(`${side}: incomplete capability inventory`);
  }
  const sortedIssues = [...new Set(issues)].sort();
  return { schema: "shelfstate.offline-preview/v1", evidenceKind: "offline-recorded-only", environment: candidate.environment,
    previousDigest: hashObject(previous), candidateDigest: hashObject(candidate),
    allowed: sortedIssues.length === 0, stackChanges, issues: sortedIssues };
}
export function requireSafeTransition(previous, candidate) {
  const result = assessTransition(previous, candidate);
  assert.equal(result.allowed, true, `Offline transition blocked: ${result.issues.join("; ")}`); return result;
}
