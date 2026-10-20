import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { executableWorkflow, workflowYaml, validateExecutableWorkflow } from "../scripts/release/workflow-source.mjs";
import { parseCiYaml, validateReleaseWorkflow } from "../../test/support/ci-yaml-policy.mjs";
import { candidateGates, CANDIDATE_GATES } from "../scripts/release/controller.mjs";
import { credentialFreeEnvironment } from "../scripts/release/offline-environment.mjs";

test("both checked-in workflows lower exactly from the canonical executable source", async () => {
  for (const env of ["dev", "production"]) {
    const source = await readFile(new URL(`../../.github/workflows/v4-${env}-release.yml`, import.meta.url), "utf8");
    assert.equal(source.replaceAll("\r\n", "\n"), workflowYaml(env));
    assert.deepEqual(validateReleaseWorkflow(source, env), executableWorkflow(env));
    assert.deepEqual(parseCiYaml(source), executableWorkflow(env));
  }
});
const credentials = w => w.jobs.proof.steps.find(step => step.uses?.startsWith("aws-actions/configure-aws-credentials@"));
const proofStep = (w, command) => w.jobs.proof.steps.find(step => step.run === command);
const accountSecret = "${{ secrets.SHELFSTATE_AWS_ACCOUNT_ID }}";
const roleSecret = "${{ secrets.SHELFSTATE_DEPLOY_ROLE_ARN }}";
const controllerCommands = ["pre-oidc", "cross-environment-denial", "identity"];

test("private bindings are masked secrets scoped only to controller steps and validated outputs", () => {
  for (const env of ["dev", "production"]) {
    const workflow = executableWorkflow(env);
    assert.ok(!Object.hasOwn(workflow.jobs.proof.env, "SHELFSTATE_AWS_ACCOUNT_ID"));
    assert.ok(!Object.hasOwn(workflow.jobs.proof.env, "SHELFSTATE_DEPLOY_ROLE_ARN"));
    for (const operation of controllerCommands) {
      const step = proofStep(workflow, `node v4/scripts/release/controller.mjs ${operation}`);
      assert.equal(step.env.SHELFSTATE_AWS_ACCOUNT_ID, accountSecret);
      assert.equal(step.env.SHELFSTATE_DEPLOY_ROLE_ARN, roleSecret);
    }
    assert.equal(credentials(workflow).with["allowed-account-ids"], "${{ steps.binding.outputs.accountId }}");
    assert.equal(credentials(workflow).with["role-to-assume"], "${{ steps.binding.outputs.roleArn }}");
    assert.ok(!JSON.stringify(workflow).includes("${{ vars."));
  }
});

for (const [name, mutation] of [
  ["PR trigger", w => { w.on.pull_request = null; }],
  ["push trigger", w => { w.on.push = { branches: ["main"] }; }],
  ["mutable action", w => { credentials(w).uses = "aws-actions/configure-aws-credentials@main"; }],
  ["changed immutable pin", w => { credentials(w).uses = credentials(w).uses.replace(/@[a-f0-9]+/, "@" + "b".repeat(40)); }],
  ["dependency cache", w => { w.jobs.prepare.steps.push({ uses: "actions/cache@" + "a".repeat(40) }); }],
  ["automatic npm cache", w => { w.jobs.proof.steps[1].with["package-manager-cache"] = true; }],
  ["broad proof permission", w => { w.jobs.proof.permissions.contents = "write"; }],
  ["prepare OIDC", w => { w.jobs.prepare.permissions["id-token"] = "write"; }],
  ["top-level OIDC", w => { w.permissions["id-token"] = "write"; }],
  ["prepare environment", w => { w.jobs.prepare.environment = "dev"; }],
  ["missing proof environment", w => { delete w.jobs.proof.environment; }],
  ["wrong proof environment", w => { w.jobs.proof.environment = "staging"; }],
  ["prepare dependency removed", w => { w.jobs.proof.needs = []; }],
  ["always bypass", w => { w.jobs.proof.if = "always()"; }],
  ["continue-on-error", w => { w.jobs.prepare.steps[3]["continue-on-error"] = true; }],
  ["prepare controller removed", w => { w.jobs.prepare.steps.splice(3, 1); }],
  ["candidate execution in proof", w => { w.jobs.proof.steps.push({ run: "node candidate/untrusted.mjs" }); }],
  ["arbitrary role", w => { credentials(w).with["role-to-assume"] = "${{ inputs.role }}"; }],
  ["obsolete credential input", w => { credentials(w).with["aws-inputs-from-env"] = false; }],
  ["missing translate input", w => { delete credentials(w).with["translate-env-variables"]; }],
  ["translate true", w => { credentials(w).with["translate-env-variables"] = true; }],
  ["credential outputs", w => { credentials(w).with["output-credentials"] = true; }],
  ["wrong duration", w => { credentials(w).with["role-duration-seconds"] = 3600; }],
  ["wrong audience", w => { credentials(w).with.audience = "other"; }],
  ["wrong region", w => { credentials(w).with["aws-region"] = "us-east-1"; }],
  ["placeholder output", w => { w.jobs.prepare.outputs.manifestDigest = "controller-bound-output"; }],
  ["missing attempt", w => { w.jobs.prepare.steps[4].with.name = "candidate-${{ github.run_id }}"; }],
  ["environment variables in prepare", w => { w.jobs.prepare.env.SHELFSTATE_AWS_ACCOUNT_ID = accountSecret; }],
  ["account binding through variables", w => { proofStep(w, "node v4/scripts/release/controller.mjs pre-oidc").env.SHELFSTATE_AWS_ACCOUNT_ID = "${{ vars.SHELFSTATE_AWS_ACCOUNT_ID }}"; }],
  ["role binding through variables", w => { proofStep(w, "node v4/scripts/release/controller.mjs pre-oidc").env.SHELFSTATE_DEPLOY_ROLE_ARN = "${{ vars.SHELFSTATE_DEPLOY_ROLE_ARN }}"; }],
  ["job-wide private secret", w => { w.jobs.proof.env.SHELFSTATE_AWS_ACCOUNT_ID = accountSecret; }],
  ["private secret in command", w => { w.jobs.proof.steps.push({ run: `printf '%s' '${accountSecret}'` }); }],
  ["derived account in command", w => { w.jobs.proof.steps.push({ run: "printf '%s' '${{ steps.binding.outputs.accountId }}'" }); }],
  ["derived role as job output", w => { w.jobs.proof.outputs = { role: "${{ steps.binding.outputs.roleArn }}" }; }],
  ["direct secret credential target", w => { credentials(w).with["role-to-assume"] = roleSecret; }],
  ["private env indirection", w => { credentials(w).with["role-to-assume"] = "${{ env.SHELFSTATE_DEPLOY_ROLE_ARN }}"; }],
  ["missing cross-environment denial", w => { w.jobs.proof.steps.splice(w.jobs.proof.steps.indexOf(proofStep(w, "node v4/scripts/release/controller.mjs cross-environment-denial")), 1); }],
  ["credentials before binding", w => { const a = w.jobs.proof.steps.indexOf(credentials(w)), b = w.jobs.proof.steps.indexOf(proofStep(w, "node v4/scripts/release/controller.mjs pre-oidc")); [w.jobs.proof.steps[a], w.jobs.proof.steps[b]] = [w.jobs.proof.steps[b], w.jobs.proof.steps[a]]; }],
  ["credentials before cross-environment denial", w => { const a = w.jobs.proof.steps.indexOf(credentials(w)), b = w.jobs.proof.steps.indexOf(proofStep(w, "node v4/scripts/release/controller.mjs cross-environment-denial")); [w.jobs.proof.steps[a], w.jobs.proof.steps[b]] = [w.jobs.proof.steps[b], w.jobs.proof.steps[a]]; }],
]) test(`strict release policy rejects ${name}`, () => {
  for (const env of ["dev", "production"]) { const w = executableWorkflow(env); mutation(w); assert.throws(() => validateExecutableWorkflow(w, env)); }
});
test("candidate gate chain stops at unchanged failing audit", () => {
  assert.deepEqual(CANDIDATE_GATES.map(g => g[1].join(" ")), ["--test", "scripts/check-ci-secrets.mjs", "--test test/deployment/v3-v4-isolation.test.js", "ci", "audit --audit-level=high", "audit signatures", "run verify"]);
  const visited = [];
  assert.throws(() => candidateGates((kind, args) => { visited.push(args.join(" ")); if (args[0] === "audit") throw Error("fixture audit failure"); }), /audit failure/);
  assert.equal(visited.at(-1), "audit --audit-level=high"); assert.ok(!visited.includes("run verify"));
});
test("verification environment removes credentials, runtime config and token discovery", () => {
  const clean = credentialFreeEnvironment({ PATH: "fixture", AWS_PROFILE: "fixture", AWS_ACCESS_KEY_ID: "fixture", SHELFSTATE_DEV_AWS_ACCOUNT_ID: "fixture", SHELFSTATE_PROD_AWS_ACCOUNT_ID: "fixture", ACTIONS_ID_TOKEN_REQUEST_TOKEN: "fixture", ACTIONS_RUNTIME_TOKEN: "fixture", GH_TOKEN: "fixture", GITHUB_OUTPUT: "fixture", NODE_OPTIONS: "unsafe" });
  assert.equal(clean.AWS_EC2_METADATA_DISABLED, "true"); assert.equal(clean.PATH, "fixture");
  for (const key of ["AWS_PROFILE", "AWS_ACCESS_KEY_ID", "SHELFSTATE_DEV_AWS_ACCOUNT_ID", "SHELFSTATE_PROD_AWS_ACCOUNT_ID", "ACTIONS_ID_TOKEN_REQUEST_TOKEN", "ACTIONS_RUNTIME_TOKEN", "GH_TOKEN", "GITHUB_OUTPUT"]) assert.ok(!Object.hasOwn(clean, key));
  assert.equal(clean.NODE_OPTIONS, undefined);
});
