import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { findObviousCredentialSignals, scanTrackedFiles } from "../scripts/check-ci-secrets.mjs";
import { parseCiYaml, validateDependabot, validateWorkflow } from "./support/ci-yaml-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowSource = (await readFile(path.join(root, ".github/workflows/validation.yml"), "utf8"))
  .replace(/\r\n?/g, "\n");
const dependabotSource = await readFile(path.join(root, ".github/dependabot.yml"), "utf8");
const supplyChainDocs = await readFile(path.join(root, "docs/V4_CI_SUPPLY_CHAIN.md"), "utf8");
const packageJson = JSON.parse(await readFile(path.join(root, "v4/package.json"), "utf8"));
const nodeLine = (await readFile(path.join(root, "v4/.nvmrc"), "utf8")).trim();

function assertWorkflowInventory(names) {
  const workflows = names.filter((name) => /\.ya?ml$/i.test(name)).sort();
  assert.deepEqual(workflows, ["validation.yml"], "Unapproved GitHub Actions workflow file");
}

function replaceOnce(source, before, after) {
  assert.ok(source.includes(before), `Missing mutation target: ${before}`);
  return source.replace(before, after);
}

function rejectsValidYaml(source, reason) {
  assert.doesNotThrow(() => parseCiYaml(source));
  assert.throws(() => validateWorkflow(source), reason);
}

test("current GitHub Actions workflow inventory contains only validation.yml", async () => {
  assertWorkflowInventory(await readdir(path.join(root, ".github/workflows")));
});

test("workflow inventory rejects an unexpected .yml or .yaml workflow", () => {
  for (const unexpected of ["unauthorized.yml", "unauthorized.yaml"]) {
    assert.throws(
      () => assertWorkflowInventory(["validation.yml", unexpected]),
      /Unapproved GitHub Actions workflow file/,
    );
  }
});

test("effective CI structure covers every PR and main push without filters", () => {
  const workflow = validateWorkflow(workflowSource);
  assert.deepEqual(workflow.on, {
    pull_request: null,
    push: { branches: ["main"] },
  });
  assert.deepEqual(Object.keys(workflow.jobs), ["repository-v3", "v4-validation"]);
});

test("every effective action is full-SHA pinned with approved inputs", () => {
  const workflow = validateWorkflow(workflowSource);
  const actions = Object.values(workflow.jobs).flatMap((job) =>
    job.steps.filter((step) => Object.hasOwn(step, "uses")));
  assert.equal(actions.length, 4);
  assert.ok(actions.every((step) => /@[a-f0-9]{40}$/.test(step.uses)));
  assert.ok(actions.every((step) => step.with["persist-credentials"] === false ||
    step.with["package-manager-cache"] === false));
});

test("effective jobs have read-only permissions, no conditional bypass, and no deployment", () => {
  const workflow = validateWorkflow(workflowSource);
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.ok(Object.values(workflow.jobs).every((job) =>
    !Object.hasOwn(job, "if") && !Object.hasOwn(job, "continue-on-error")));
  assert.ok(Object.values(workflow.jobs).flatMap((job) => job.steps).every((step) =>
    !Object.hasOwn(step, "if") && !Object.hasOwn(step, "continue-on-error")));
});

test("Node 24 and exact npm 11.6.2 precede the V4 clean install", () => {
  const workflow = validateWorkflow(workflowSource);
  assert.equal(nodeLine, "24");
  assert.equal(packageJson.packageManager, "npm@11.6.2");
  assert.equal(packageJson.engines.npm, "11.6.2");
  const runs = workflow.jobs["v4-validation"].steps
    .filter((step) => Object.hasOwn(step, "run"))
    .map((step) => step.run.trim());
  assert.match(runs[0], /npm install --global npm@11\.6\.2/);
  assert.match(runs[0], /test "\$\(npm --version\)" = "11\.6\.2"/);
  assert.ok(runs.indexOf("npm ci") < runs.indexOf("npm run verify"));
  assert.deepEqual(workflow.jobs["v4-validation"].defaults,
    { run: { "working-directory": "v4" } });
});

test("parsed executable steps cover V3, V4, audit, signatures, and synth", () => {
  const workflow = validateWorkflow(workflowSource);
  const v3Runs = workflow.jobs["repository-v3"].steps
    .filter((step) => Object.hasOwn(step, "run"))
    .map((step) => step.run.trim());
  const v4Runs = workflow.jobs["v4-validation"].steps
    .filter((step) => Object.hasOwn(step, "run"))
    .map((step) => step.run.trim());
  assert.ok(v3Runs.includes("node --test"));
  assert.ok(v3Runs.includes("node --test test/deployment/v3-v4-isolation.test.js"));
  assert.ok(v3Runs.includes("node scripts/v3-deployment-boundary.mjs build"));
  assert.ok(v4Runs.includes("npm ci"));
  assert.ok(v4Runs.includes("npm audit --audit-level=high"));
  assert.ok(v4Runs.includes("npm audit signatures"));
  assert.ok(v4Runs.includes("npm run verify"));
  assert.match(packageJson.scripts.verify, /infra:synth/);
  assert.match(packageJson.scripts.verify, /infra:preview/);
  assert.match(packageJson.scripts.verify, /test:contract/);
});

test("Dependabot structurally covers only approved ecosystems without auto-merge", () => {
  const configuration = validateDependabot(dependabotSource);
  assert.deepEqual(configuration.updates.map((update) =>
    [update["package-ecosystem"], update.directory]),
  [["npm", "/v4"], ["github-actions", "/"]]);
});

test("policy rejects required verification left only in a YAML comment", () => {
  const mutated = replaceOnce(
    workflowSource,
    "      - name: Verify V4 package, contracts, CDK synth, and preview\n        run: npm run verify",
    "      # run: npm run verify",
  );
  rejectsValidYaml(mutated, /Missing required V4 command: npm run verify/);
});

test("policy rejects a statically disabled required step", () => {
  const mutated = replaceOnce(
    workflowSource,
    "        run: npm run verify",
    "        if: false\n        run: npm run verify",
  );
  rejectsValidYaml(mutated, /Conditional validation step in V4/);
});

test("policy rejects continue-on-error on a required gate", () => {
  const mutated = replaceOnce(
    workflowSource,
    "        run: npm audit --audit-level=high",
    "        continue-on-error: true\n        run: npm audit --audit-level=high",
  );
  rejectsValidYaml(mutated, /continue-on-error on validation step in V4/);
});

test("policy sees and rejects an unpinned flow-style action", () => {
  const mutated = replaceOnce(
    workflowSource,
    "        run: node --test\n",
    "        run: node --test\n      - { uses: example/action@v1 }\n",
  );
  rejectsValidYaml(mutated, /Unpinned action reference in V3/);
});

test("policy rejects a condition disabling the entire V4 job", () => {
  const mutated = replaceOnce(
    workflowSource,
    "  v4-validation:\n    name:",
    "  v4-validation:\n    if: false\n    name:",
  );
  rejectsValidYaml(mutated, /Conditional required job: V4/);
});

test("tracked-file tripwire identifies synthetic credentials without broad false positives", () => {
  assert.deepEqual(findObviousCredentialSignals("a harmless example"), []);
  assert.deepEqual(findObviousCredentialSignals("AKIA" + "A".repeat(16)), ["AWS access key ID"]);
  assert.deepEqual(findObviousCredentialSignals("ghp_" + "A".repeat(30)), ["GitHub token"]);
  assert.deepEqual(findObviousCredentialSignals("-----BEGIN " + "PRIVATE KEY-----"), ["private key header"]);
});

test("tripwire scans staged NUL-free text and deliberately skips NUL/UTF-16 content", async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "shelfstate-wp004-secrets-"));
  try {
    const init = spawnSync("git", ["init", "--quiet"], { cwd: fixture });
    assert.equal(init.status, 0);
    await writeFile(path.join(fixture, "staged.txt"), "ASIA" + "B".repeat(16));
    await writeFile(path.join(fixture, "nul-text.txt"), "AKIA" + "D".repeat(16) + "\0");
    await writeFile(path.join(fixture, "utf16.txt"), Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from("AKIA" + "E".repeat(16), "utf16le"),
    ]));
    await writeFile(path.join(fixture, "untracked.txt"), "ghp_" + "C".repeat(30));
    const add = spawnSync("git", ["add", "--", "staged.txt", "nul-text.txt", "utf16.txt"], { cwd: fixture });
    assert.equal(add.status, 0);
    assert.deepEqual(await scanTrackedFiles(fixture), [
      { path: "staged.txt", signals: ["AWS access key ID"] },
    ]);
    assert.match(supplyChainDocs, /UTF-8\/ASCII-compatible/);
    assert.match(supplyChainDocs, /NUL/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
