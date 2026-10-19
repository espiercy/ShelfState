import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { readAssembly } from "./assemblies.mjs";
import { credentialFreeEnvironment } from "./offline-environment.mjs";
import { assert, canonical, equal, hash, hashObject, object } from "./schema.mjs";

const CLI_VERSION = "2.1141.0";
const sides = Object.freeze(["baseline", "candidate"]);
const environments = Object.freeze(["dev", "production"]);

function contextSnapshot(packageRoot) {
  const file = path.join(packageRoot, "cdk.context.json");
  try {
    const metadata = lstatSync(file);
    assert.ok(metadata.isFile() && !metadata.isSymbolicLink(), "Unsupported CDK context path");
    return { type: "regular", digest: hash(readFileSync(file)) };
  } catch (error) {
    if (error.code === "ENOENT") return { type: "absent" };
    throw error;
  }
}

function expectedLines(snapshot) {
  assert.equal(snapshot.stacks.length, 6, "Prebuilt CLI requires exactly six stacks");
  return snapshot.stacks.map(stack => `${stack.id} (${stack.name})`).sort();
}

function parseListOutput(output) {
  assert.equal(typeof output, "string");
  const lines = output.replaceAll("\r\n", "\n").split("\n").map(line => line.trim()).filter(Boolean);
  assert.equal(lines.length, 6, "CDK CLI returned an unexpected stack count");
  for (const line of lines) assert.match(line, /^[A-Za-z][A-Za-z0-9]* \(shelfstate-v4-(?:dev|prod)-[a-z0-9-]+\)$/, "Unexpected CDK CLI stack output");
  return lines.sort();
}

function invokeCli(command, args, cwd, env) {
  return execFileSync(command, args, { cwd, env, shell: false, timeout: 120000, maxBuffer: 1024 * 1024,
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

export function validatePrebuiltCliEvidence(value) {
  object(value, ["schema", "cli", "command", "credentialMode", "assemblies"], "prebuilt CLI evidence");
  assert.equal(value.schema, "shelfstate.prebuilt-cli-compatibility/v1");
  object(value.cli, ["name", "version"]); assert.deepEqual(value.cli, { name: "aws-cdk", version: CLI_VERSION });
  assert.equal(value.command, "cdk list --app <retained-assembly> --no-lookups");
  assert.equal(value.credentialMode, "credential-free");
  assert.ok(Array.isArray(value.assemblies) && value.assemblies.length === 4, "Four prebuilt assembly results required");
  const identities = new Set();
  for (const entry of value.assemblies) {
    object(entry, ["side", "environment", "assemblyDigest", "fileInventoryDigest", "stacks"]);
    assert.ok(sides.includes(entry.side)); assert.ok(environments.includes(entry.environment));
    assert.match(entry.assemblyDigest, /^[a-f0-9]{64}$/); assert.match(entry.fileInventoryDigest, /^[a-f0-9]{64}$/);
    assert.ok(Array.isArray(entry.stacks) && entry.stacks.length === 6);
    entry.stacks.forEach(name => assert.match(name, /^shelfstate-v4-(?:dev|prod)-[a-z0-9-]+$/));
    assert.equal(new Set(entry.stacks).size, 6, "Duplicate prebuilt stack name");
    const identity = `${entry.side}/${entry.environment}`; assert.ok(!identities.has(identity), "Duplicate prebuilt assembly result"); identities.add(identity);
  }
  for (const side of sides) for (const environment of environments) assert.ok(identities.has(`${side}/${environment}`), "Missing prebuilt assembly result");
  return value;
}

export async function verifyPrebuiltAssemblies(root, packageRoot, execute = invokeCli) {
  const packageMetadata = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
  const installedMetadata = JSON.parse(await readFile(path.join(packageRoot, "node_modules", "aws-cdk", "package.json"), "utf8"));
  assert.equal(packageMetadata.devDependencies?.["aws-cdk"], CLI_VERSION, "Unapproved CDK CLI pin");
  assert.equal(installedMetadata.name, "aws-cdk"); assert.equal(installedMetadata.version, CLI_VERSION, "Installed CDK CLI differs from lock pin");
  const cli = path.join(packageRoot, "node_modules", "aws-cdk", "bin", "cdk");
  const contextBefore = contextSnapshot(packageRoot), assemblies = [];
  for (const side of sides) for (const environment of environments) {
    const directory = path.join(root, side, environment), before = await readAssembly(directory, environment);
    const output = await execute(process.execPath, [cli, "list", "--app", directory, "--no-lookups"],
      packageRoot, credentialFreeEnvironment());
    assert.deepEqual(parseListOutput(output), expectedLines(before), "CDK CLI stack inventory mismatch");
    const after = await readAssembly(directory, environment);
    equal(after, before, "Prebuilt assembly changed during CLI read");
    assert.deepEqual(contextSnapshot(packageRoot), contextBefore, "CDK CLI changed context state");
    assemblies.push({ side, environment, assemblyDigest: hashObject(before), fileInventoryDigest: hashObject(before.files),
      stacks: before.stacks.map(stack => stack.name).sort() });
  }
  const evidence = { schema: "shelfstate.prebuilt-cli-compatibility/v1", cli: { name: "aws-cdk", version: CLI_VERSION },
    command: "cdk list --app <retained-assembly> --no-lookups", credentialMode: "credential-free", assemblies };
  validatePrebuiltCliEvidence(evidence);
  // Ensure only canonical JSON-compatible evidence can cross the artifact boundary.
  return JSON.parse(canonical(evidence));
}
