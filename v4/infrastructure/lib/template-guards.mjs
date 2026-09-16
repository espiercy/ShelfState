import { CAPABILITY_DEFINITIONS } from "./topology.mjs";

export const STATEFUL_POLICY_METADATA = "ShelfStateStatefulPolicy";

const protectedResourceTypes = new Set([
  "AWS::Backup::BackupPlan",
  "AWS::Backup::BackupVault",
  "AWS::CertificateManager::Certificate",
  "AWS::Cognito::UserPool",
  "AWS::DynamoDB::Table",
  "AWS::Route53::RecordSet",
  "AWS::Route53::RecordSetGroup",
  "AWS::S3::Bucket",
]);

const forbiddenResourceTypes = new Set([
  "AWS::Amplify::App",
  "AWS::Amplify::Branch",
  "AWS::DynamoDB::GlobalTable",
  "AWS::EC2::NatGateway",
  "AWS::EC2::VPC",
  "AWS::EC2::VPCEndpoint",
  "AWS::EC2::VPCEndpointConnectionNotification",
  "AWS::EC2::VPCEndpointService",
  "AWS::ECS::CapacityProvider",
  "AWS::ECS::Cluster",
  "AWS::ECS::Service",
  "AWS::ECS::TaskDefinition",
  "AWS::KMS::Key",
  "AWS::StepFunctions::StateMachine",
  "AWS::WAF::WebACL",
  "AWS::WAFRegional::WebACL",
  "AWS::WAFv2::WebACL",
]);

function templateResources(template) {
  return template.Resources ?? {};
}

function hasEnabledExpiration(resource) {
  const rules = resource.Properties?.LifecycleConfiguration?.Rules;
  return (
    Array.isArray(rules) &&
    rules.some(
      (rule) =>
        rule.Status === "Enabled" &&
        (Number.isInteger(rule.ExpirationInDays) || rule.ExpirationDate),
    )
  );
}

function assertRetained(logicalId, resource) {
  if (
    resource.DeletionPolicy !== "Retain" ||
    resource.UpdateReplacePolicy !== "Retain"
  ) {
    throw new Error(
      `${logicalId} is classified retained but lacks Retain deletion and update-replace policies.`,
    );
  }
}

export function assertStatefulResourceSafeguards(
  template,
  environmentName,
) {
  for (const [logicalId, resource] of Object.entries(templateResources(template))) {
    if (!protectedResourceTypes.has(resource.Type)) continue;

    const policy = resource.Metadata?.[STATEFUL_POLICY_METADATA];
    if (!policy) {
      throw new Error(
        `${logicalId} (${resource.Type}) lacks ${STATEFUL_POLICY_METADATA} classification.`,
      );
    }

    if (policy === "retained") {
      assertRetained(logicalId, resource);

      if (
        environmentName === "prod" &&
        resource.Type === "AWS::DynamoDB::Table" &&
        resource.Properties?.DeletionProtectionEnabled !== true
      ) {
        throw new Error(`${logicalId} must enable DynamoDB deletion protection.`);
      }

      if (
        environmentName === "prod" &&
        resource.Type === "AWS::Cognito::UserPool" &&
        resource.Properties?.DeletionProtection !== "ACTIVE"
      ) {
        throw new Error(`${logicalId} must enable Cognito deletion protection.`);
      }

      if (
        environmentName === "prod" &&
        resource.Type === "AWS::Backup::BackupVault" &&
        !resource.Properties?.LockConfiguration
      ) {
        throw new Error(`${logicalId} must declare backup vault lock configuration.`);
      }
      continue;
    }

    if (policy === "ephemeral") {
      if (resource.Type !== "AWS::S3::Bucket" || !hasEnabledExpiration(resource)) {
        throw new Error(
          `${logicalId} may be ephemeral only as an S3 bucket with an enabled expiration rule.`,
        );
      }
      continue;
    }

    if (policy === "destroy-approved" && environmentName === "dev") continue;

    throw new Error(
      `${logicalId} has unsupported stateful policy "${policy}" for ${environmentName}.`,
    );
  }
}

export function assertNoDeferredInfrastructure(template) {
  for (const [logicalId, resource] of Object.entries(templateResources(template))) {
    const properties = resource.Properties ?? {};

    if (forbiddenResourceTypes.has(resource.Type)) {
      throw new Error(`${logicalId} uses deferred resource type ${resource.Type}.`);
    }

    if (
      resource.Type === "AWS::DynamoDB::Table" &&
      (properties.GlobalSecondaryIndexes || properties.StreamSpecification)
    ) {
      throw new Error(`${logicalId} enables a deferred DynamoDB GSI or stream.`);
    }

    if (
      resource.Type.startsWith("AWS::Lambda::") &&
      properties.ProvisionedConcurrencyConfig
    ) {
      throw new Error(`${logicalId} enables deferred provisioned concurrency.`);
    }

    if (
      resource.Type === "AWS::Lambda::Function" &&
      properties.TracingConfig?.Mode === "Active"
    ) {
      throw new Error(`${logicalId} enables deferred X-Ray tracing.`);
    }

    if (
      ["AWS::ApiGateway::Stage", "AWS::ApiGatewayV2::Stage"].includes(
        resource.Type,
      ) &&
      properties.TracingEnabled === true
    ) {
      throw new Error(`${logicalId} enables deferred X-Ray tracing.`);
    }

    if (
      resource.Type === "AWS::S3::Bucket" &&
      (properties.WebsiteConfiguration || properties.AccessControl === "PublicRead")
    ) {
      throw new Error(`${logicalId} enables deferred public S3 website hosting.`);
    }

    if (
      resource.Type === "AWS::CloudFront::Distribution" &&
      JSON.stringify(properties).includes("LambdaFunctionAssociations")
    ) {
      throw new Error(`${logicalId} includes a deferred Lambda@Edge association.`);
    }
  }
}

export function assertFoundationTemplate(template, environmentName) {
  assertNoDeferredInfrastructure(template);
  assertStatefulResourceSafeguards(template, environmentName);

  const resourceCount = Object.keys(templateResources(template)).length;
  if (resourceCount !== 0) {
    throw new Error(
      `WP-003 foundation templates must contain zero resources; found ${resourceCount}.`,
    );
  }
}

export function validateFoundationAssembly(assembly, config) {
  const artifacts = assembly.stacks;
  if (artifacts.length !== CAPABILITY_DEFINITIONS.length) {
    throw new Error(
      `Expected ${CAPABILITY_DEFINITIONS.length} capability stacks; found ${artifacts.length}.`,
    );
  }

  const expectedCapabilities = new Set(
    CAPABILITY_DEFINITIONS.map((definition) => definition.key),
  );

  for (const artifact of artifacts) {
    const shelfStateMetadata = artifact.template.Metadata?.ShelfState;
    if (!shelfStateMetadata) {
      throw new Error(`${artifact.stackName} lacks ShelfState topology metadata.`);
    }
    if (shelfStateMetadata.Environment !== config.environmentName) {
      throw new Error(`${artifact.stackName} has mismatched environment metadata.`);
    }
    if (!expectedCapabilities.delete(shelfStateMetadata.Capability)) {
      throw new Error(`${artifact.stackName} has an unexpected capability boundary.`);
    }
    assertFoundationTemplate(artifact.template, config.environmentName);
  }

  if (expectedCapabilities.size !== 0) {
    throw new Error(
      `Synthesized topology is missing capabilities: ${[...expectedCapabilities].join(", ")}.`,
    );
  }
}
