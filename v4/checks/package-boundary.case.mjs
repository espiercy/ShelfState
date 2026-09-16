import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildV3PublishArtifact,
  V3_PUBLISH_ENTRIES,
} from "../../scripts/v3-deployment-boundary.mjs";
import {
  BOUNDARY_ARTIFACT,
  buildV4BoundaryArtifact,
} from "../scripts/build.mjs";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(testDirectory, "..");
const repositoryRoot = path.resolve(packageRoot, "..");
const logicalDirectories = [
  "backend",
  "contracts",
  "frontend",
  "infrastructure",
  "scripts",
  "test",
];

async function listJavaScriptFiles(rootDirectory) {
  const files = [];

  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (/\.(?:c|m)?js$/.test(entry.name)) {
        files.push(absolutePath);
      }
    }
  }

  await visit(rootDirectory);
  return files.sort();
}

function importSpecifiers(source) {
  const specifiers = [];
  const pattern = /(?:\bfrom\s*|\bimport\s*\(\s*)["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  return specifiers;
}

test("V4 owns an explicit package and logical project boundary", async () => {
  assert.equal((await stat(packageRoot)).isDirectory(), true);
  for (const directory of logicalDirectories) {
    assert.equal(
      (await stat(path.join(packageRoot, directory))).isDirectory(),
      true,
      `${directory}/ must exist inside the V4 package`,
    );
  }
});

test("package metadata and lockfile are dependency-free and deterministic", async () => {
  const packageMetadata = JSON.parse(
    await readFile(path.join(packageRoot, "package.json"), "utf8"),
  );
  const lockfile = JSON.parse(
    await readFile(path.join(packageRoot, "package-lock.json"), "utf8"),
  );

  assert.equal(packageMetadata.private, true);
  assert.equal(packageMetadata.packageManager, "npm@11.6.2");
  assert.equal(packageMetadata.engines.node, ">=24.11.0 <25");
  assert.equal(packageMetadata.engines.npm, "11.6.2");
  assert.deepEqual(packageMetadata.dependencies ?? {}, {});
  assert.deepEqual(packageMetadata.devDependencies ?? {}, {});
  assert.equal(lockfile.lockfileVersion, 3);
  assert.deepEqual(Object.keys(lockfile.packages), [""]);
});

test("runtime baseline is the pinned Node.js 24 LTS line", () => {
  const [major, minor] = process.versions.node.split(".").map(Number);
  assert.equal(major, 24);
  assert.ok(minor >= 11);
});

test("V4 production tooling has no root or V3 code imports", async () => {
  const forbiddenV3Packages = new Set(["shelfstate", "@shelfstate/v3"]);
  const productionAreas = [
    "backend",
    "contracts",
    "frontend",
    "infrastructure",
    "scripts",
  ];

  for (const area of productionAreas) {
    const files = await listJavaScriptFiles(path.join(packageRoot, area));
    for (const file of files) {
      const source = await readFile(file, "utf8");
      for (const specifier of importSpecifiers(source)) {
        assert.equal(
          forbiddenV3Packages.has(specifier),
          false,
          `${path.relative(packageRoot, file)} imports a V3 package: ${specifier}`,
        );
        if (!specifier.startsWith(".")) continue;
        const target = path.resolve(path.dirname(file), specifier);
        const relative = path.relative(packageRoot, target);
        assert.equal(
          relative === ".." || relative.startsWith(`..${path.sep}`),
          false,
          `${path.relative(packageRoot, file)} imports outside the V4 package: ${specifier}`,
        );
      }
    }
  }
});

test("V4 build output stays isolated from the 42-file V3 publish artifact", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "shelfstate-wp002-"));

  try {
    for (const entry of V3_PUBLISH_ENTRIES) {
      await cp(path.join(repositoryRoot, entry), path.join(fixtureRoot, entry), {
        recursive: true,
      });
    }

    const fixtureV4Root = path.join(fixtureRoot, "v4");
    const v4Build = await buildV4BoundaryArtifact(fixtureV4Root);
    const v3Build = await buildV3PublishArtifact(fixtureRoot);

    assert.equal(path.dirname(v4Build.outputDirectory), fixtureV4Root);
    assert.equal(path.basename(v4Build.outputFile), BOUNDARY_ARTIFACT);
    assert.equal(v3Build.publishedFiles.length, 42);
    assert.equal(
      v3Build.publishedFiles.some((file) => file.startsWith("v4/")),
      false,
    );
    await assert.rejects(
      stat(path.join(v3Build.outputDirectory, "v4")),
      /ENOENT/,
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
