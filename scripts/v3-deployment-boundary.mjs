import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const V3_PUBLISH_DIRECTORY = "v3-dist";
export const V4_PATH_PREFIX = "v4/";
export const V3_PUBLISH_ENTRIES = Object.freeze([
  "_headers",
  "icons",
  "index.html",
  "manifest.webmanifest",
  "service-worker.js",
  "src",
]);

// Aggregate SHA-256 of the sorted, path-qualified V3 runtime files. Text line
// endings are normalized so this boundary is stable across Git platforms.
export const FROZEN_V3_RUNTIME_SHA256 =
  "2b973f2a0c83fe0ca7df51528980f5d2cb142e3e8b3b2411e8727e303560af3a";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");

function normalizeRepositoryPath(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function isV4OwnedPath(value) {
  const normalized = normalizeRepositoryPath(value);
  return normalized === "v4" || normalized.startsWith(V4_PATH_PREFIX);
}

export function shouldBuildV3(changedPaths) {
  return (
    changedPaths.length === 0 ||
    changedPaths.some((changedPath) => !isV4OwnedPath(changedPath))
  );
}

export async function listFiles(rootDirectory, entries = V3_PUBLISH_ENTRIES) {
  const files = [];

  async function visit(relativePath) {
    const absolutePath = path.join(rootDirectory, relativePath);
    const metadata = await stat(absolutePath);

    if (metadata.isDirectory()) {
      const children = await readdir(absolutePath);
      children.sort();

      for (const child of children) {
        await visit(path.join(relativePath, child));
      }
      return;
    }

    if (!metadata.isFile()) {
      throw new Error(`Unsupported V3 publish input: ${relativePath}`);
    }

    files.push(normalizeRepositoryPath(relativePath));
  }

  for (const entry of entries) {
    await visit(entry);
  }

  return files.sort();
}

function normalizedDigestBytes(relativePath, bytes) {
  if (path.extname(relativePath).toLowerCase() === ".png") return bytes;
  return Buffer.from(bytes.toString("utf8").replace(/\r\n?|\r/g, "\n"));
}

export async function calculateV3RuntimeDigest(rootDirectory = repositoryRoot) {
  const aggregate = createHash("sha256");
  const files = await listFiles(rootDirectory);

  for (const relativePath of files) {
    const bytes = await readFile(path.join(rootDirectory, relativePath));
    const fileDigest = createHash("sha256")
      .update(normalizedDigestBytes(relativePath, bytes))
      .digest("hex");

    aggregate.update(relativePath);
    aggregate.update("\0");
    aggregate.update(fileDigest);
    aggregate.update("\n");
  }

  return aggregate.digest("hex");
}

export async function buildV3PublishArtifact(rootDirectory = repositoryRoot) {
  const outputDirectory = path.join(rootDirectory, V3_PUBLISH_DIRECTORY);
  const expectedOutput = path.resolve(rootDirectory, V3_PUBLISH_DIRECTORY);

  if (path.resolve(outputDirectory) !== expectedOutput) {
    throw new Error("Refusing to write outside the V3 publish directory.");
  }

  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });

  for (const entry of V3_PUBLISH_ENTRIES) {
    await cp(path.join(rootDirectory, entry), path.join(outputDirectory, entry), {
      recursive: true,
    });
  }

  const sourceFiles = await listFiles(rootDirectory);
  const publishedFiles = await listFiles(outputDirectory);

  if (sourceFiles.join("\n") !== publishedFiles.join("\n")) {
    throw new Error("V3 publish artifact does not exactly match its allowlist.");
  }

  if (publishedFiles.some(isV4OwnedPath)) {
    throw new Error("V4-owned content entered the V3 publish artifact.");
  }

  return { outputDirectory, publishedFiles };
}

export function changedPathsFromGit(environment = process.env) {
  const base = environment.CACHED_COMMIT_REF;
  const head = environment.COMMIT_REF;

  if (!base || !head || base === head) {
    return { reliable: false, paths: [] };
  }

  const result = spawnSync(
    "git",
    ["diff", "--name-only", "--diff-filter=ACDMRTUXB", base, head, "--"],
    { cwd: repositoryRoot, encoding: "utf8" },
  );

  if (result.status !== 0) {
    return { reliable: false, paths: [] };
  }

  return {
    reliable: true,
    paths: result.stdout
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean),
  };
}

export function netlifyIgnoreDecision(environment = process.env) {
  const changed = changedPathsFromGit(environment);

  if (!changed.reliable) {
    return {
      exitCode: 1,
      message: "V3 build required: commit comparison was unavailable.",
      paths: changed.paths,
    };
  }

  const buildRequired = shouldBuildV3(changed.paths);
  return {
    exitCode: buildRequired ? 1 : 0,
    message: buildRequired
      ? "V3 build required: the change set includes V3-owned or shared paths."
      : `V3 build skipped: all ${changed.paths.length} changed paths are owned by v4/.`,
    paths: changed.paths,
  };
}

async function runCommand(command) {
  if (command === "build") {
    const currentDigest = await calculateV3RuntimeDigest();
    if (currentDigest !== FROZEN_V3_RUNTIME_SHA256) {
      throw new Error(
        `Frozen V3 runtime digest changed: expected ${FROZEN_V3_RUNTIME_SHA256}, received ${currentDigest}.`,
      );
    }

    const result = await buildV3PublishArtifact();
    console.log(
      `Prepared ${result.publishedFiles.length} frozen V3 files in ${V3_PUBLISH_DIRECTORY}/.`,
    );
    return;
  }

  if (command === "netlify-ignore") {
    const decision = netlifyIgnoreDecision();
    console.log(decision.message);
    process.exitCode = decision.exitCode;
    return;
  }

  throw new Error(`Unknown deployment-boundary command: ${command ?? "(missing)"}`);
}

const currentFilePath = fileURLToPath(import.meta.url);
const invokedFilePath = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (pathToFileURL(invokedFilePath).href === pathToFileURL(currentFilePath).href) {
  await runCommand(process.argv[2]);
}
