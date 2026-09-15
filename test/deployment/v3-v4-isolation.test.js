import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  appendFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildV3PublishArtifact,
  calculateV3RuntimeDigest,
  changedPathsFromGit,
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

function runGit(rootDirectory, arguments_) {
  const result = spawnSync("git", arguments_, {
    cwd: rootDirectory,
    encoding: "utf8",
  });

  assert.equal(
    result.status,
    0,
    `git ${arguments_.join(" ")} failed: ${result.stderr}`,
  );

  return result.stdout.trim();
}

async function createGitFixture() {
  const rootDirectory = await mkdtemp(
    path.join(os.tmpdir(), "shelfstate-wp001-git-"),
  );

  await mkdir(path.join(rootDirectory, "docs"));
  await mkdir(path.join(rootDirectory, "v4"));
  await writeFile(path.join(rootDirectory, "index.html"), "V3 shell\n");
  await writeFile(path.join(rootDirectory, "docs", "shared.md"), "shared\n");
  await writeFile(path.join(rootDirectory, "v4", "old.txt"), "V4\n");

  runGit(rootDirectory, ["init", "--quiet"]);
  runGit(rootDirectory, ["add", "--all"]);
  runGit(rootDirectory, [
    "-c",
    "user.name=ShelfState Test",
    "-c",
    "user.email=shelfstate-test@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "fixture baseline",
  ]);

  return {
    base: runGit(rootDirectory, ["rev-parse", "HEAD"]),
    rootDirectory,
  };
}

function commitGitFixture(rootDirectory, message) {
  runGit(rootDirectory, ["add", "--all"]);
  runGit(rootDirectory, [
    "-c",
    "user.name=ShelfState Test",
    "-c",
    "user.email=shelfstate-test@example.invalid",
    "commit",
    "--quiet",
    "-m",
    message,
  ]);
  return runGit(rootDirectory, ["rev-parse", "HEAD"]);
}

async function inspectGitChange(mutate) {
  const fixture = await createGitFixture();

  try {
    await mutate(fixture.rootDirectory);
    const head = commitGitFixture(fixture.rootDirectory, "fixture change");
    const changed = changedPathsFromGit(
      {
        CACHED_COMMIT_REF: fixture.base,
        COMMIT_REF: head,
      },
      fixture.rootDirectory,
    );

    return {
      ...changed,
      buildRequired: !changed.reliable || shouldBuildV3(changed.paths),
    };
  } finally {
    await rm(fixture.rootDirectory, { recursive: true, force: true });
  }
}

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

test("the V3 trigger guard applies the narrow V4 ownership matrix", () => {
  assert.equal(shouldBuildV3(["v4/README.md"]), false);
  assert.equal(shouldBuildV3(["v4/dist/index.html", "v4/src/app.js"]), false);
  assert.equal(shouldBuildV3(["v4\\dist\\index.html"]), false);
  assert.equal(shouldBuildV3(["docs/V4_ARCHITECTURE.md"]), false);
  assert.equal(shouldBuildV3(["docs/V4_RELEASE_NOTES.md"]), false);
  assert.equal(shouldBuildV3(["docs/adr/ADR-026-example.md"]), false);
  assert.equal(shouldBuildV3(["docs/V3_EXPORT_COMPATIBILITY.md"]), false);
  assert.equal(shouldBuildV3(["docs/V3_V4_REPOSITORY_BOUNDARY.md"]), false);
  assert.equal(
    shouldBuildV3(["docs/V4_REQUIREMENTS.md", "v4/README.md"]),
    false,
  );
  assert.equal(shouldBuildV3([]), true);
  assert.equal(shouldBuildV3(["index.html"]), true);
  assert.equal(shouldBuildV3(["docs/note.md", "v4/README.md"]), true);
  assert.equal(
    shouldBuildV3(["docs/V4_REQUIREMENTS.md", "service-worker.js"]),
    true,
  );
});

test("Git renames and deletions cannot hide V3 or shared paths", async () => {
  const v3ToV4 = await inspectGitChange(async (rootDirectory) => {
    await rename(
      path.join(rootDirectory, "index.html"),
      path.join(rootDirectory, "v4", "index.html"),
    );
  });
  assert.equal(v3ToV4.reliable, true);
  assert.deepEqual(v3ToV4.paths.sort(), ["index.html", "v4/index.html"]);
  assert.equal(v3ToV4.buildRequired, true);

  const v4ToShared = await inspectGitChange(async (rootDirectory) => {
    await rename(
      path.join(rootDirectory, "v4", "old.txt"),
      path.join(rootDirectory, "README.md"),
    );
  });
  assert.equal(v4ToShared.reliable, true);
  assert.deepEqual(v4ToShared.paths.sort(), ["README.md", "v4/old.txt"]);
  assert.equal(v4ToShared.buildRequired, true);

  const withinV4 = await inspectGitChange(async (rootDirectory) => {
    await rename(
      path.join(rootDirectory, "v4", "old.txt"),
      path.join(rootDirectory, "v4", "new.txt"),
    );
  });
  assert.equal(withinV4.reliable, true);
  assert.deepEqual(withinV4.paths.sort(), ["v4/new.txt", "v4/old.txt"]);
  assert.equal(withinV4.buildRequired, false);

  const v3Deletion = await inspectGitChange(async (rootDirectory) => {
    await unlink(path.join(rootDirectory, "index.html"));
  });
  assert.equal(v3Deletion.reliable, true);
  assert.deepEqual(v3Deletion.paths, ["index.html"]);
  assert.equal(v3Deletion.buildRequired, true);

  const mixed = await inspectGitChange(async (rootDirectory) => {
    await appendFile(path.join(rootDirectory, "docs", "shared.md"), "change\n");
    await writeFile(path.join(rootDirectory, "v4", "new.txt"), "new\n");
  });
  assert.equal(mixed.reliable, true);
  assert.deepEqual(mixed.paths.sort(), ["docs/shared.md", "v4/new.txt"]);
  assert.equal(mixed.buildRequired, true);
});

test("the Netlify guard fails open for unavailable or unusable comparisons", () => {
  const unavailable = netlifyIgnoreDecision({});
  assert.equal(unavailable.exitCode, 1);
  assert.match(unavailable.message, /comparison was unavailable/);

  const unusable = netlifyIgnoreDecision(
    {
      CACHED_COMMIT_REF: "not-a-valid-base-reference",
      COMMIT_REF: "not-a-valid-head-reference",
    },
    repositoryRoot,
  );
  assert.equal(unusable.exitCode, 1);
  assert.match(unusable.message, /comparison was unavailable/);
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
