import { assert, environment, equal } from "./schema.mjs";
import { ACTION_PINS } from "./policy.mjs";

// An inactive, typed SOURCE format, not executable GitHub YAML. `controller`
// steps are explicit adapter contracts, not shell snippets or synthetic live
// claims. Activation/lowering and live collectors require later review.
export function proofWorkflowSource(env) {
  environment(env);
  // WP-006A requires this exact relative version file. The future workspace
  // layout must keep the reviewed controller at root and candidate separately.
  const node = () => ({ uses: ACTION_PINS.setupNode, with: { "node-version-file": "v4/.nvmrc", "package-manager-cache": false } });
  const controller = (operation, inputs) => ({ controller: { operation, inputs, source: "workflow-controller", credentialUse: "none" } });
  return {
    schema: "shelfstate.inactive-proof-workflow/v1", activation: "not-github-yaml",
    targetPath: `.github/workflows/v4-${env === "dev" ? "dev" : "production"}-release.yml`,
    name: `ShelfState V4 ${env} identity proof`,
    on: { workflow_dispatch: { inputs: { commit_sha: { type: "string", required: true } } } },
    permissions: { contents: "read" },
    concurrency: { group: `shelfstate-v4-${env}`, "cancel-in-progress": false },
    jobs: {
      prepare: { "runs-on": "ubuntu-24.04", permissions: { contents: "read" },
        if: "github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && github.ref_type == 'branch'",
        steps: [
          { uses: ACTION_PINS.checkout, with: { ref: "${{ github.workflow_sha }}", "persist-credentials": false } }, node(),
          controller("collect-and-verify-dispatch", { repository: "espiercy/ShelfState", candidate: "${{ inputs.commit_sha }}", controller: "${{ github.workflow_sha }}", mainAncestry: "required", validationChecks: ["V3 and repository boundary", "V4 install and verification"] }),
          controller("checkout-exact-candidate", { destination: "candidate", detached: true, shellInterpolation: false }),
          controller("credential-free-candidate-checks", { cwd: "candidate", credentials: "absent", commands: ["node --test", "node scripts/check-ci-secrets.mjs", "node --test test/deployment/v3-v4-isolation.test.js"], v4Commands: ["npm ci", "npm audit --audit-level=high", "npm audit signatures", "npm run verify"], npm: "11.6.2", stopOnFailure: true }),
          controller("offline-empty-assembly-preview", { topology: "six-stacks-zero-resources", baseline: "explicit-offline-proof-not-deployed", failOnUnknown: true }),
          { uses: ACTION_PINS.upload, with: { name: "candidate-${{ github.run_id }}-${{ github.run_attempt }}", path: "candidate-payload", "retention-days": 90, overwrite: false, "if-no-files-found": "error" }, id: "payload" },
          controller("bind-manifest-and-summary", { artifactId: "${{ steps.payload.outputs.artifact-id }}", inventory: "complete-raw-byte-sha256", manifestPlacement: "outside-payload", runAttempt: "required", previewDigest: "required" }),
          { uses: ACTION_PINS.upload, with: { name: "evidence-${{ github.run_id }}-${{ github.run_attempt }}", path: "candidate-evidence", "retention-days": 90, overwrite: false, "if-no-files-found": "error" }, id: "evidence" },
        ],
        outputs: { payloadId: "${{ steps.payload.outputs.artifact-id }}", evidenceId: "${{ steps.evidence.outputs.artifact-id }}", manifestDigest: "controller-bound-output" },
      },
      proof: { "runs-on": "ubuntu-24.04", needs: ["prepare"], environment: env,
        permissions: { contents: "read", actions: "read", "id-token": "write" },
        steps: [
          { uses: ACTION_PINS.checkout, with: { ref: "${{ github.workflow_sha }}", "persist-credentials": false } }, node(),
          controller("verify-service-artifact-provenance", { producer: "current-repository-run-attempt", payloadId: "${{ needs.prepare.outputs.payloadId }}", evidenceId: "${{ needs.prepare.outputs.evidenceId }}", rejectExpired: true }),
          { uses: ACTION_PINS.download, with: { "artifact-ids": "${{ needs.prepare.outputs.evidenceId }}", "run-id": "${{ github.run_id }}", path: "received-evidence" } },
          { uses: ACTION_PINS.download, with: { "artifact-ids": "${{ needs.prepare.outputs.payloadId }}", "run-id": "${{ github.run_id }}", path: "received-payload" } },
          controller("verify-manifest-bytes-and-safety", { expectedManifestDigest: "${{ needs.prepare.outputs.manifestDigest }}", digestWarnings: "fatal", links: "reject", candidateScripts: "never-execute", requireSamePreview: true }),
          { uses: ACTION_PINS.credentials, with: {
            "role-to-assume": "${{ vars.SHELFSTATE_DEPLOY_ROLE_ARN }}", "aws-region": "us-west-2", audience: "sts.amazonaws.com",
            "allowed-account-ids": "${{ vars.SHELFSTATE_AWS_ACCOUNT_ID }}", "role-duration-seconds": 900,
            "role-session-name": "ss-${{ github.run_id }}-${{ github.run_attempt }}", "mask-aws-account-id": true,
            "unset-current-credentials": true, "use-existing-credentials": false, "role-chaining": false,
            "output-credentials": false, "output-env-credentials": true, "aws-inputs-from-env": false,
            "retry-max-attempts": 2, "action-timeout-s": 120,
          } },
          { controller: { operation: "identity-only-proof", source: "workflow-controller", credentialUse: "sts-identity-only",
            inputs: { expectedRole: env === "dev" ? "ShelfStateV4DevDeploy" : "ShelfStateV4ProdDeploy", expectedAccount: "runtime-bound", lifetimeSeconds: 900, verifyInertProofBaseline: true, recheckSafety: true, knownGoodPromotion: false, applicationPermissions: [] } } },
        ],
      },
    },
  };
}
export function validateWorkflowSource(value, env) {
  equal(value, proofWorkflowSource(env), "Unreviewed proof workflow structure/authority");
  assert.equal(value.activation, "not-github-yaml"); return value;
}
