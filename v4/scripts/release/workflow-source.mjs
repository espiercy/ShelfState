import { assert, environment, equal } from "./schema.mjs";
import { ACTION_PINS } from "./policy.mjs";

export const MAIN_GATE = "github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && github.ref_type == 'branch'";
const PRIVATE_BINDINGS = Object.freeze({
  accountSecret: "${{ secrets.SHELFSTATE_AWS_ACCOUNT_ID }}",
  roleSecret: "${{ secrets.SHELFSTATE_DEPLOY_ROLE_ARN }}",
  accountOutput: "${{ steps.binding.outputs.accountId }}",
  roleOutput: "${{ steps.binding.outputs.roleArn }}",
});

function scalarLocations(value, target, path = [], matches = []) {
  if (typeof value === "string") {
    if (value === target) matches.push(path.join("."));
    return matches;
  }
  if (!value || typeof value !== "object") return matches;
  for (const [key, child] of Object.entries(value)) scalarLocations(child, target, [...path, key], matches);
  return matches;
}

function validatePrivateBindingFlow(workflow) {
  const expectedSecrets = key => [2, 3, 5].map(index => `jobs.proof.steps.${index}.env.${key}`);
  assert.deepEqual(scalarLocations(workflow, PRIVATE_BINDINGS.accountSecret), expectedSecrets("SHELFSTATE_AWS_ACCOUNT_ID"));
  assert.deepEqual(scalarLocations(workflow, PRIVATE_BINDINGS.roleSecret), expectedSecrets("SHELFSTATE_DEPLOY_ROLE_ARN"));
  assert.deepEqual(scalarLocations(workflow, PRIVATE_BINDINGS.accountOutput), ["jobs.proof.steps.4.with.allowed-account-ids"]);
  assert.deepEqual(scalarLocations(workflow, PRIVATE_BINDINGS.roleOutput), ["jobs.proof.steps.4.with.role-to-assume"]);

  function inspect(value, path = []) {
    if (typeof value === "string") {
      const location = path.join(".");
      assert.ok(!value.includes("vars."), `Private runtime variables are forbidden: ${location}`);
      assert.ok(!value.includes("env.SHELFSTATE_AWS_ACCOUNT_ID") && !value.includes("env.SHELFSTATE_DEPLOY_ROLE_ARN"),
        `Private env expressions are forbidden: ${location}`);
      if (value.includes("secrets.")) assert.ok(
        [PRIVATE_BINDINGS.accountSecret, PRIVATE_BINDINGS.roleSecret].includes(value),
        `Unapproved secret expression: ${location}`,
      );
      if (value.includes("steps.binding.outputs.accountId")) assert.equal(value, PRIVATE_BINDINGS.accountOutput,
        `Derived account identifier embedded in another value: ${location}`);
      if (value.includes("steps.binding.outputs.roleArn")) assert.equal(value, PRIVATE_BINDINGS.roleOutput,
        `Derived role identifier embedded in another value: ${location}`);
      if (path.at(-1) === "run") assert.ok(
        !/SHELFSTATE_(?:AWS_ACCOUNT_ID|DEPLOY_ROLE_ARN)|steps\.binding\.outputs\.(?:accountId|roleArn)|\bsecrets\b/.test(value),
        `Private or derived binding referenced by command: ${location}`,
      );
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) inspect(child, [...path, key]);
  }
  inspect(workflow);
  return workflow;
}

export function executableWorkflow(env) {
  environment(env);
  const checkout = () => ({ uses: ACTION_PINS.checkout, with: { ref: "${{ github.workflow_sha }}", "persist-credentials": false, "fetch-depth": 0 } });
  const node = () => ({ uses: ACTION_PINS.setupNode, with: { "node-version-file": "v4/.nvmrc", "package-manager-cache": false } });
  const context = () => ({ RELEASE_ENVIRONMENT: env, CANDIDATE_SHA: "${{ inputs.commit_sha }}" });
  const privateBindings = () => ({ SHELFSTATE_AWS_ACCOUNT_ID: PRIVATE_BINDINGS.accountSecret,
    SHELFSTATE_DEPLOY_ROLE_ARN: PRIVATE_BINDINGS.roleSecret });
  return {
    name: `ShelfState V4 ${env} identity proof`,
    on: { workflow_dispatch: { inputs: { commit_sha: { description: "Exact lowercase 40-character candidate SHA on main", type: "string", required: true } } } },
    permissions: { contents: "read" },
    concurrency: { group: `shelfstate-v4-${env}`, "cancel-in-progress": false },
    jobs: {
      prepare: { "runs-on": "ubuntu-24.04", "timeout-minutes": 30, permissions: { contents: "read" }, if: MAIN_GATE, env: context(),
        outputs: { payloadId: "${{ steps.payload.outputs.artifact-id }}", evidenceId: "${{ steps.evidence.outputs.artifact-id }}",
          manifestDigest: "${{ steps.seal.outputs.manifestDigest }}", candidateSha: "${{ steps.prepare.outputs.candidateSha }}" },
        steps: [checkout(), node(),
          { name: "Check pinned npm through Corepack", "working-directory": "v4", run: 'test "$(corepack npm --version)" = "11.6.2"' },
          { name: "Credential-free preparation (audit is mandatory)", id: "prepare", run: "node v4/scripts/release/controller.mjs prepare" },
          { uses: ACTION_PINS.upload, id: "payload", with: { name: "candidate-${{ github.run_id }}-${{ github.run_attempt }}", path: "${{ steps.prepare.outputs.payloadPath }}", "retention-days": 90, overwrite: false, "if-no-files-found": "error" } },
          { name: "Seal immutable candidate evidence", id: "seal", env: { PAYLOAD_ID: "${{ steps.payload.outputs.artifact-id }}" }, run: "node v4/scripts/release/controller.mjs seal" },
          { uses: ACTION_PINS.upload, id: "evidence", with: { name: "evidence-${{ github.run_id }}-${{ github.run_attempt }}", path: "${{ steps.seal.outputs.evidencePath }}", "retention-days": 90, overwrite: false, "if-no-files-found": "error" } },
        ] },
      proof: { "runs-on": "ubuntu-24.04", "timeout-minutes": 15, needs: ["prepare"], if: `needs.prepare.result == 'success' && ${MAIN_GATE}`,
        environment: env, permissions: { contents: "read", actions: "read", "id-token": "write" },
        env: { ...context(), PAYLOAD_ID: "${{ needs.prepare.outputs.payloadId }}", EVIDENCE_ID: "${{ needs.prepare.outputs.evidenceId }}", MANIFEST_DIGEST: "${{ needs.prepare.outputs.manifestDigest }}" },
        steps: [checkout(), node(),
          { name: "Authenticate and validate bytes and runtime binding before OIDC", id: "binding",
            env: { GH_TOKEN: "${{ github.token }}", ...privateBindings() }, run: "node v4/scripts/release/controller.mjs pre-oidc" },
          { name: "Require authentic cross-environment OIDC denial", env: privateBindings(),
            run: "node v4/scripts/release/controller.mjs cross-environment-denial" },
          { uses: ACTION_PINS.credentials, with: {
            "role-to-assume": PRIVATE_BINDINGS.roleOutput, "aws-region": "us-west-2", audience: "sts.amazonaws.com",
            "allowed-account-ids": PRIVATE_BINDINGS.accountOutput, "role-duration-seconds": 900,
            "role-session-name": "ss-${{ github.run_id }}-${{ github.run_attempt }}", "mask-aws-account-id": true,
            "unset-current-credentials": true, "use-existing-credentials": false, "role-chaining": false,
            "output-credentials": false, "output-env-credentials": true, "translate-env-variables": false,
            "retry-max-attempts": 2, "action-timeout-s": 120,
          } },
          { name: "STS identity only; requested duration is not issued lifetime", env: privateBindings(),
            run: "node v4/scripts/release/controller.mjs identity" },
        ] },
    },
  };
}
// Keep the reviewed source entry points; their jobs now lower without stubs.
export function proofWorkflowSource(env) {
  return { schema: "shelfstate.proof-workflow-source/v2", activation: "local-yaml-review-only",
    targetPath: `.github/workflows/v4-${env}-release.yml`, ...executableWorkflow(env) };
}
export function validateWorkflowSource(value, env) {
  validatePrivateBindingFlow(value);
  equal(value, proofWorkflowSource(env), "Unreviewed proof workflow structure/authority");
  assert.equal(value.activation, "local-yaml-review-only"); return value;
}
export function validateExecutableWorkflow(value, env) {
  validatePrivateBindingFlow(value);
  equal(value, executableWorkflow(env), "Unreviewed executable release workflow"); return value;
}
// Restricted deterministic YAML emitter: JSON-quoted scalars are valid YAML.
export function workflowYaml(env) {
  function emit(value, indent = 0) {
    const pad = " ".repeat(indent), rows = [];
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry !== "object") rows.push(`${pad}- ${JSON.stringify(entry)}`);
        else { const lines = emit(entry, indent + 2).split("\n"); rows.push(`${pad}- ${lines[0].trimStart()}`, ...lines.slice(1)); }
      }
    } else for (const [k, v] of Object.entries(value)) {
      if (Array.isArray(v) && v.every(x => typeof x !== "object")) rows.push(`${pad}${k}: ${JSON.stringify(v)}`);
      else if (v && typeof v === "object") rows.push(`${pad}${k}:`, emit(v, indent + 2));
      else rows.push(`${pad}${k}: ${JSON.stringify(v)}`);
    }
    return rows.join("\n");
  }
  return emit(executableWorkflow(env)) + "\n";
}
