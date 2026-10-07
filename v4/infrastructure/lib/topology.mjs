import { Stack, Tags, Validations } from "aws-cdk-lib";
import { requiredTags, stackName } from "./naming.mjs";
import assert from "node:assert/strict";
import { addLibraryApi } from "./library-api.mjs";
import { addEdgeCertificate } from "./edge-certificate.mjs";

import { CAPABILITY_DEFINITIONS } from "./capabilities.mjs";
export { CAPABILITY_DEFINITIONS } from "./capabilities.mjs";

function constructId(config, capability) {
  const parts = capability.split("-").map(
    (part) => `${part[0].toUpperCase()}${part.slice(1)}`,
  );
  const environment =
    `${config.environmentName[0].toUpperCase()}${config.environmentName.slice(1)}`;
  return `ShelfStateV4${environment}${parts.join("")}`;
}

function stackEnvironment(config, region) {
  return config.accountId
    ? { account: config.accountId, region }
    : { region };
}

export function createEnvironmentTopology(app, config, options = {}) {
  assert.ok(Object.keys(options).every(key => key === "initializationPhase"), "Unsupported topology option");
  const phase = options.initializationPhase;
  if (phase !== undefined) {
    assert.equal(config.environmentName, "dev", "Initialization resources are dev-only");
    assert.ok(["api-parent", "api-children", "certificate"].includes(phase), "Unsupported initialization phase");
    assert.match(config.accountId ?? "", /^\d{12}$/, "Explicit local account binding required; no AWS discovery");
    assert.equal(config.primaryRegion, "us-west-2");
    assert.equal(config.edgeCertificateRegion, "us-east-1");
  }
  const stacks = new Map();
  const tags = requiredTags(config);

  Validations.of(app).acknowledge({
    id: "CloudFormation-Validate::F0001",
    reason:
      "WP-003 deliberately synthesizes resource-empty capability boundaries; service resources require later authorization.",
  });

  for (const definition of CAPABILITY_DEFINITIONS) {
    const region = config[definition.regionSource];
    const stack = new Stack(app, constructId(config, definition.key), {
      description: `${definition.label} for ShelfState V4 ${config.environmentName} (WP-003; no service resources)`,
      env: stackEnvironment(config, region),
      stackName: stackName(config, definition.key),
      terminationProtection: config.environmentName === "prod",
    });

    stack.templateOptions.metadata = {
      ShelfState: {
        Capability: definition.key,
        Environment: config.environmentName,
        Region: region,
        WorkPackage: "WP-003",
      },
    };

    for (const [key, value] of Object.entries(tags)) {
      Tags.of(stack).add(key, value);
    }

    stacks.set(definition.key, stack);
    if (definition.key === "library-api" && ["api-parent", "api-children"].includes(phase)) {
      stack.templateOptions.description = "ShelfState V4 dev library-api (WP-007 local preparation)";
      stack.templateOptions.metadata.ShelfState.WorkPackage = "WP-007";
      stack.templateOptions.metadata.ShelfState.InitializationPhase = phase;
      addLibraryApi(stack, config, phase);
    }
    if (definition.key === "edge-certificate" && phase === "certificate") {
      stack.templateOptions.description = "ShelfState V4 dev edge-certificate (WP-007 local preparation)";
      stack.templateOptions.metadata.ShelfState.WorkPackage = "WP-007";
      stack.templateOptions.metadata.ShelfState.InitializationPhase = phase;
      addEdgeCertificate(stack, config);
    }
  }

  for (const definition of CAPABILITY_DEFINITIONS) {
    const stack = stacks.get(definition.key);
    for (const dependency of definition.dependsOn ?? []) {
      stack.addStackDependency(
        stacks.get(dependency),
        `${definition.key} consumes outputs owned by ${dependency} when that capability is implemented.`,
      );
    }
  }

  return Object.freeze({ config, stacks });
}
