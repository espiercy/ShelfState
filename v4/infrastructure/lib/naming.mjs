const COMPONENT_PATTERN = /^[a-z][a-z0-9-]*$/;

function assertComponent(value, label) {
  if (typeof value !== "string" || !COMPONENT_PATTERN.test(value)) {
    throw new Error(
      `${label} must start with a lowercase letter and contain only lowercase letters, digits, and hyphens.`,
    );
  }
}

export function stackName(config, capability) {
  assertComponent(config.namePrefix, "Environment name prefix");
  assertComponent(capability, "Capability name");
  const value = `${config.namePrefix}-${capability}`;

  if (value.length > 128) {
    throw new Error(`Stack name exceeds the CloudFormation 128-character limit: ${value}`);
  }

  return value;
}

export function resourceName(config, purpose, maximumLength = 63) {
  assertComponent(config.namePrefix, "Environment name prefix");
  assertComponent(purpose, "Resource purpose");
  const value = `${config.namePrefix}-${purpose}`;

  if (value.length > maximumLength) {
    throw new Error(
      `Resource name exceeds its ${maximumLength}-character limit: ${value}`,
    );
  }

  return value;
}

export function requiredTags(config) {
  return Object.freeze({
    Environment: config.environmentName,
    ManagedBy: "AWS-CDK",
    Project: config.project,
  });
}
