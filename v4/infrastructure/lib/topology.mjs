import { Stack, Tags, Validations } from "aws-cdk-lib";
import { requiredTags, stackName } from "./naming.mjs";

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

export function createEnvironmentTopology(app, config) {
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
