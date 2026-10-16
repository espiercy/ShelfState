import { CAPABILITY_DEFINITIONS } from "./capabilities.mjs";
import assert from "node:assert/strict";
import { assertLibraryApiTemplate } from "../bootstrap/library-api-contract.mjs";
import { assertEdgeCertificateTemplate } from "../bootstrap/edge-certificate-contract.mjs";
import { assertStaticEdgeTemplate } from "../bootstrap/static-edge-contract.mjs";
import { assertEdgeRoutingTemplate } from "../bootstrap/edge-routing-contract.mjs";

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
        resource.Type === "AWS::Backup::BackupVault"
      ) {
        const lockConfiguration = resource.Properties?.LockConfiguration;
        if (!lockConfiguration) {
          throw new Error(`${logicalId} must declare backup vault lock configuration.`);
        }
        if (Object.hasOwn(lockConfiguration, "ChangeableForDays")) {
          throw new Error(
            `${logicalId} must use Governance Vault Lock; ChangeableForDays must be absent (Compliance mode is not approved).`,
          );
        }
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

// Local inspection ONLY. The normal foundation/release validator remains empty-
// only. This entry point accepts just the selected API phase, never arbitrary stacks.
export function validateLocalApiAssembly(assembly, config, phase) {
  assert.equal(config.environmentName, "dev");
  assert.match(config.accountId ?? "", /^\d{12}$/);
  assert.ok(["api-parent", "api-children"].includes(phase));
  assert.equal(assembly.stacks.length, CAPABILITY_DEFINITIONS.length);
  const seen = new Set();
  for (const artifact of assembly.stacks) {
    const capability = artifact.template.Metadata?.ShelfState?.Capability;
    const definition = CAPABILITY_DEFINITIONS.find(d => d.key === capability);
    assert.ok(definition && !seen.has(capability), "Unknown/duplicate capability"); seen.add(capability);
    assert.equal(artifact.stackName, `shelfstate-v4-dev-${capability}`);
    assert.equal(artifact.environment.name, `aws://${config.accountId}/${config[definition.regionSource]}`);
    assert.equal(artifact.terminationProtection, false);
    if (capability === "library-api") assertLibraryApiTemplate(artifact.template, config.accountId, phase);
    else assertFoundationTemplate(artifact.template, "dev");
  }
}

// Separate local-only certificate inspection; neither foundation nor release
// acceptance is broadened. Never accepts the API and certificate in one window.
export function validateLocalCertificateAssembly(assembly, config, phase) {
  assert.equal(config.environmentName, "dev");
  assert.match(config.accountId ?? "", /^\d{12}$/);
  assert.equal(config.primaryRegion, "us-west-2");
  assert.equal(config.edgeCertificateRegion, "us-east-1");
  assert.equal(phase, "certificate");
  assert.equal(assembly.stacks.length, CAPABILITY_DEFINITIONS.length);
  const seen = new Set();
  for (const artifact of assembly.stacks) {
    const metadata = artifact.template.Metadata?.ShelfState;
    const capability = metadata?.Capability;
    const definition = CAPABILITY_DEFINITIONS.find(d => d.key === capability);
    assert.ok(definition && !seen.has(capability), "Unknown/duplicate capability"); seen.add(capability);
    assert.equal(metadata.Environment, "dev");
    assert.equal(metadata.Region, config[definition.regionSource]);
    assert.equal(artifact.stackName, `shelfstate-v4-dev-${capability}`);
    assert.equal(artifact.environment.name, `aws://${config.accountId}/${config[definition.regionSource]}`);
    assert.equal(artifact.terminationProtection, false);
    assertNoDeferredInfrastructure(artifact.template);
    assertStatefulResourceSafeguards(artifact.template, "dev");
    if (capability === "edge-certificate") assertEdgeCertificateTemplate(artifact.template, config.accountId, phase);
    else assertFoundationTemplate(artifact.template, "dev");
  }
}

// This separate inspection path never broadens ordinary proof/release acceptance.
export function validateLocalStaticEdgeAssembly(assembly, config, phase, bindings) {
  assert.equal(config.environmentName, "dev");
  assert.match(config.accountId ?? "", /^\d{12}$/);
  assert.equal(config.primaryRegion, "us-west-2");
  assert.equal(config.edgeCertificateRegion, "us-east-1");
  assert.equal(phase, "edge-static");
  assert.equal(assembly.stacks.length, CAPABILITY_DEFINITIONS.length);
  const seen = new Set();
  for (const artifact of assembly.stacks) {
    const metadata = artifact.template.Metadata?.ShelfState;
    const capability = metadata?.Capability;
    const definition = CAPABILITY_DEFINITIONS.find(d => d.key === capability);
    assert.ok(definition && !seen.has(capability), "Unknown/duplicate capability"); seen.add(capability);
    assert.equal(metadata.Environment, "dev");
    assert.equal(metadata.Region, config[definition.regionSource]);
    assert.equal(artifact.stackName, `shelfstate-v4-dev-${capability}`);
    assert.equal(artifact.environment.name, `aws://${config.accountId}/${config[definition.regionSource]}`);
    assert.equal(artifact.terminationProtection, false);
    assertNoDeferredInfrastructure(artifact.template);
    assertStatefulResourceSafeguards(artifact.template, "dev");
    if (capability === "edge-delivery") assertStaticEdgeTemplate(artifact.template, config.accountId, phase, bindings);
    else assertFoundationTemplate(artifact.template, "dev");
  }
}

// Separate local-only inspection for the prospective initial combined template.
// Ordinary foundation/release acceptance remains resource-empty.
export function validateLocalEdgeRoutingAssembly(assembly, config, phase, bindings) {
  assert.equal(config.environmentName, "dev");
  assert.match(config.accountId ?? "", /^\d{12}$/);
  assert.equal(config.primaryRegion, "us-west-2");
  assert.equal(config.edgeCertificateRegion, "us-east-1");
  assert.equal(phase, "edge-routing");
  assert.equal(assembly.stacks.length, CAPABILITY_DEFINITIONS.length);
  const seen = new Set();
  for (const artifact of assembly.stacks) {
    const metadata = artifact.template.Metadata?.ShelfState;
    const capability = metadata?.Capability;
    const definition = CAPABILITY_DEFINITIONS.find(d => d.key === capability);
    assert.ok(definition && !seen.has(capability), "Unknown/duplicate capability"); seen.add(capability);
    assert.equal(metadata.Environment, "dev");
    assert.equal(metadata.Region, config[definition.regionSource]);
    assert.equal(artifact.stackName, `shelfstate-v4-dev-${capability}`);
    assert.equal(artifact.environment.name, `aws://${config.accountId}/${config[definition.regionSource]}`);
    assert.equal(artifact.terminationProtection, false);
    assertNoDeferredInfrastructure(artifact.template);
    assertStatefulResourceSafeguards(artifact.template, "dev");
    if (capability === "edge-delivery") assertEdgeRoutingTemplate(artifact.template, config.accountId, phase, bindings);
    else assertFoundationTemplate(artifact.template, "dev");
  }
}
