import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildV3PublishArtifact,
  calculateV3RuntimeDigest,
  FROZEN_V3_RUNTIME_SHA256,
  isV4OwnedPath,
  listFiles,
  netlifyIgnoreDecision,
  shouldBuildV3,
  V3_PUBLISH_DIRECTORY,
  V3_PUBLISH_ENTRIES,
} from "../../scripts/v3-deployment-boundary.mjs";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, "../..");

test("the frozen V3 runtime inventory has not changed", async () => {
  assert.equal(
    await calculateV3RuntimeDigest(repositoryRoot),
    FROZEN_V3_RUNTIME_SHA256,
  );
});

test("the V3 publish artifact is an exact allowlist with no V4 content", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "shelfstate-wp001-"));

  try {
    for (const entry of V3_PUBLISH_ENTRIES) {
      await cp(path.join(repositoryRoot, entry), path.join(fixtureRoot, entry), {
        recursive: true,
      });
    }

    await writeFile(path.join(fixtureRoot, "shared-file.txt"), "not V3 runtime\n");
    await writeFile(
      path.join(fixtureRoot, "v4-output-placeholder.txt"),
      "not V3 runtime\n",
    );
    await cp(
      path.join(repositoryRoot, "v4"),
      path.join(fixtureRoot, "v4"),
      { recursive: true },
    );

    const sourceFiles = await listFiles(fixtureRoot);
    const result = await buildV3PublishArtifact(fixtureRoot);
    const outputFiles = await listFiles(
      path.join(fixtureRoot, V3_PUBLISH_DIRECTORY),
    );

    assert.deepEqual(result.publishedFiles, sourceFiles);
    assert.deepEqual(outputFiles, sourceFiles);
    assert.equal(outputFiles.some(isV4OwnedPath), false);
    await assert.rejects(
      readFile(path.join(result.outputDirectory, "v4", "README.md")),
    );
    await assert.rejects(
      readFile(path.join(result.outputDirectory, "shared-file.txt")),
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("the V3 trigger guard skips only nonempty V4-only change sets", () => {
  assert.equal(shouldBuildV3(["v4/README.md"]), false);
  assert.equal(shouldBuildV3(["v4/dist/index.html", "v4/src/app.js"]), false);
  assert.equal(shouldBuildV3(["v4\\dist\\index.html"]), false);
  assert.equal(shouldBuildV3([]), true);
  assert.equal(shouldBuildV3(["index.html"]), true);
  assert.equal(shouldBuildV3(["docs/note.md", "v4/README.md"]), true);
});

test("the Netlify guard fails open when commit comparison is unavailable", () => {
  const decision = netlifyIgnoreDecision({});
  assert.equal(decision.exitCode, 1);
  assert.match(decision.message, /comparison was unavailable/);
});

test("Netlify configuration owns the V3 build, publish, and ignore boundary", async () => {
  const configuration = await readFile(
    path.join(repositoryRoot, "netlify.toml"),
    "utf8",
  );

  assert.match(
    configuration,
    /command = "node \.\/scripts\/v3-deployment-boundary\.mjs build"/,
  );
  assert.match(configuration, /publish = "v3-dist"/);
  assert.match(
    configuration,
    /ignore = "node \.\/scripts\/v3-deployment-boundary\.mjs netlify-ignore"/,
  );
});
