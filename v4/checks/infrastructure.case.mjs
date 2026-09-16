import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import {
  APPROVED_ENVIRONMENTS,
  EDGE_CERTIFICATE_REGION,
  PRIMARY_REGION,
  resolveEnvironmentConfig,
} from "../infrastructure/lib/environment.mjs";
import {
  requiredTags,
  resourceName,
  stackName,
} from "../infrastructure/lib/naming.mjs";
import {
  CAPABILITY_DEFINITIONS,
  createEnvironmentTopology,
} from "../infrastructure/lib/topology.mjs";
import {
  assertFoundationTemplate,
  assertNoDeferredInfrastructure,
  assertStatefulResourceSafeguards,
  STATEFUL_POLICY_METADATA,
  validateFoundationAssembly,
} from "../infrastructure/lib/template-guards.mjs";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(testDirectory, "..");

async function withSynthesizedEnvironment(environmentName, callback) {
  const outputDirectory = await mkdtemp(
    path.join(os.tmpdir(), `shelfstate-wp003-${environmentName}-`),
  );

  try {
    const app = new App({ outdir: outputDirectory });
    const config = resolveEnvironmentConfig(environmentName);
    const topology = createEnvironmentTopology(app, config);
    const assembly = app.synth();
    validateFoundationAssembly(assembly, config);
    await callback({ assembly, config, topology });
  } finally {
    await rm(outputDirectory, { force: true, recursive: true });
  }
}

function retainedResource(type, properties = {}) {
  return {
    DeletionPolicy: "Retain",
    Metadata: { [STATEFUL_POLICY_METADATA]: "retained" },
    Properties: properties,
    Type: type,
    UpdateReplacePolicy: "Retain",
  };
}

test("environment selection and explicit account configuration fail closed", () => {
  assert.deepEqual(APPROVED_ENVIRONMENTS, ["dev", "prod"]);
  assert.throws(() => resolveEnvironmentConfig(), /environment is required/);
  assert.throws(
    () => resolveEnvironmentConfig("production"),
    /Unsupported ShelfState environment/,
  );
  assert.throws(
    () =>
      resolveEnvironmentConfig("prod", {
        SHELFSTATE_PROD_AWS_ACCOUNT_ID: "not-an-account",
      }),
    /12-digit AWS account ID/,
  );

  const unresolved = resolveEnvironmentConfig("dev", {
    CDK_DEFAULT_ACCOUNT: "123456789012",
  });
  assert.equal(unresolved.accountId, undefined);
  assert.equal(unresolved.accountSource, "SHELFSTATE_DEV_AWS_ACCOUNT_ID");

  const resolved = resolveEnvironmentConfig("prod", {
    SHELFSTATE_PROD_AWS_ACCOUNT_ID: "123456789012",
  });
  assert.equal(resolved.accountId, "123456789012");
});

test("dev and prod naming, tagging, and regions are deterministic and distinct", () => {
  const dev = resolveEnvironmentConfig("dev");
  const prod = resolveEnvironmentConfig("prod");

  assert.equal(dev.primaryRegion, PRIMARY_REGION);
  assert.equal(prod.primaryRegion, PRIMARY_REGION);
  assert.equal(dev.edgeCertificateRegion, EDGE_CERTIFICATE_REGION);
  assert.equal(prod.edgeCertificateRegion, EDGE_CERTIFICATE_REGION);
  assert.notEqual(stackName(dev, "library-api"), stackName(prod, "library-api"));
  assert.notEqual(resourceName(dev, "example"), resourceName(prod, "example"));
  assert.deepEqual(requiredTags(dev), {
    Environment: "dev",
    ManagedBy: "AWS-CDK",
    Project: "ShelfState",
  });
});

test("capability stacks expose only the approved minimal dependency direction", async () => {
  await withSynthesizedEnvironment("dev", ({ topology }) => {
    assert.equal(topology.stacks.size, CAPABILITY_DEFINITIONS.length);
    const certificate = topology.stacks.get("edge-certificate");
    const edge = topology.stacks.get("edge-delivery");

    assert.equal(certificate.region, EDGE_CERTIFICATE_REGION);
    assert.equal(edge.region, PRIMARY_REGION);
    assert.deepEqual(edge.dependencies, [certificate]);

    for (const [capability, stack] of topology.stacks) {
      if (capability !== "edge-delivery") assert.deepEqual(stack.dependencies, []);
      assert.equal(stack.terminationProtection, false);
    }
  });

  await withSynthesizedEnvironment("prod", ({ topology }) => {
    for (const stack of topology.stacks.values()) {
      assert.equal(stack.terminationProtection, true);
    }
  });
});

test("dev and prod synthesize equivalent zero-resource capability topology", async () => {
  const summaries = new Map();

  for (const environmentName of APPROVED_ENVIRONMENTS) {
    await withSynthesizedEnvironment(
      environmentName,
      ({ assembly, config, topology }) => {
        const capabilities = [];
        for (const [capability, stack] of topology.stacks) {
          const template = Template.fromStack(stack).toJSON();
          assertFoundationTemplate(template, environmentName);
          assert.deepEqual(template.Resources ?? {}, {});
          capabilities.push(capability);
        }
        assert.equal(assembly.stacks.length, CAPABILITY_DEFINITIONS.length);
        for (const artifact of assembly.stacks) {
          assert.equal(
            artifact.environment.name,
            `aws://unknown-account/${artifact.template.Metadata.ShelfState.Region}`,
          );
          assert.match(artifact.stackName, new RegExp(`^${config.namePrefix}-`));
          assert.deepEqual(artifact.tags, requiredTags(config));
        }
        summaries.set(environmentName, capabilities.sort());
      },
    );
  }

  assert.deepEqual(summaries.get("dev"), summaries.get("prod"));
});

test("architecture-exclusion guard rejects every deferred infrastructure family", () => {
  const forbiddenTypes = [
    "AWS::Amplify::App",
    "AWS::DynamoDB::GlobalTable",
    "AWS::EC2::NatGateway",
    "AWS::EC2::VPC",
    "AWS::EC2::VPCEndpoint",
    "AWS::ECS::Cluster",
    "AWS::KMS::Key",
    "AWS::StepFunctions::StateMachine",
    "AWS::WAFv2::WebACL",
  ];

  for (const type of forbiddenTypes) {
    assert.throws(
      () =>
        assertNoDeferredInfrastructure({
          Resources: { Forbidden: { Type: type } },
        }),
      /deferred resource type/,
    );
  }

  const propertyCases = [
    {
      Properties: { GlobalSecondaryIndexes: [{}] },
      Type: "AWS::DynamoDB::Table",
    },
    {
      Properties: { StreamSpecification: { StreamViewType: "NEW_IMAGE" } },
      Type: "AWS::DynamoDB::Table",
    },
    {
      Properties: { ProvisionedConcurrencyConfig: {} },
      Type: "AWS::Lambda::Version",
    },
    {
      Properties: { TracingConfig: { Mode: "Active" } },
      Type: "AWS::Lambda::Function",
    },
    {
      Properties: { WebsiteConfiguration: { IndexDocument: "index.html" } },
      Type: "AWS::S3::Bucket",
    },
    {
      Properties: { DistributionConfig: { LambdaFunctionAssociations: [{}] } },
      Type: "AWS::CloudFront::Distribution",
    },
  ];

  for (const resource of propertyCases) {
    assert.throws(
      () =>
        assertNoDeferredInfrastructure({ Resources: { Forbidden: resource } }),
      /deferred/,
    );
  }
});

test("stateful-resource guard requires explicit, environment-safe protection", () => {
  const protectedTemplate = {
    Resources: {
      BackupPlan: retainedResource("AWS::Backup::BackupPlan"),
      BackupVault: retainedResource("AWS::Backup::BackupVault", {
        LockConfiguration: { MinRetentionDays: 1 },
      }),
      Certificate: retainedResource("AWS::CertificateManager::Certificate"),
      LibraryTable: retainedResource("AWS::DynamoDB::Table", {
        DeletionProtectionEnabled: true,
      }),
      ProductionRecord: retainedResource("AWS::Route53::RecordSet"),
      SessionPool: retainedResource("AWS::Cognito::UserPool", {
        DeletionProtection: "ACTIVE",
      }),
      TransferBucket: {
        Metadata: { [STATEFUL_POLICY_METADATA]: "ephemeral" },
        Properties: {
          LifecycleConfiguration: {
            Rules: [{ ExpirationInDays: 1, Status: "Enabled" }],
          },
        },
        Type: "AWS::S3::Bucket",
      },
    },
  };

  assert.doesNotThrow(() =>
    assertStatefulResourceSafeguards(protectedTemplate, "prod"),
  );
  assert.throws(
    () =>
      assertStatefulResourceSafeguards(
        { Resources: { Unsafe: { Type: "AWS::DynamoDB::Table" } } },
        "prod",
      ),
    /lacks ShelfStateStatefulPolicy classification/,
  );
  assert.throws(
    () =>
      assertStatefulResourceSafeguards(
        {
          Resources: {
            Unsafe: {
              Metadata: { [STATEFUL_POLICY_METADATA]: "destroy-approved" },
              Type: "AWS::Cognito::UserPool",
            },
          },
        },
        "prod",
      ),
    /unsupported stateful policy/,
  );
  assert.doesNotThrow(() =>
    assertStatefulResourceSafeguards(
      {
        Resources: {
          DevelopmentOnly: {
            Metadata: { [STATEFUL_POLICY_METADATA]: "destroy-approved" },
            Type: "AWS::DynamoDB::Table",
          },
        },
      },
      "dev",
    ),
  );
  assert.throws(
    () =>
      assertStatefulResourceSafeguards(
        {
          Resources: {
            NoExpiry: {
              Metadata: { [STATEFUL_POLICY_METADATA]: "ephemeral" },
              Type: "AWS::S3::Bucket",
            },
          },
        },
        "prod",
      ),
    /enabled expiration rule/,
  );
});

test("retained production backup vault requires Governance Vault Lock and retention", () => {
  const vault = (resource) => ({ Resources: { BackupVault: resource } });
  const governanceVault = retainedResource("AWS::Backup::BackupVault", {
    LockConfiguration: { MinRetentionDays: 1 },
  });

  assert.doesNotThrow(() =>
    assertStatefulResourceSafeguards(vault(governanceVault), "prod"),
  );
  assert.throws(
    () =>
      assertStatefulResourceSafeguards(
        vault(retainedResource("AWS::Backup::BackupVault")),
        "prod",
      ),
    /must declare backup vault lock configuration/,
  );
  assert.throws(
    () =>
      assertStatefulResourceSafeguards(
        vault(
          retainedResource("AWS::Backup::BackupVault", {
            LockConfiguration: { ChangeableForDays: 3, MinRetentionDays: 1 },
          }),
        ),
        "prod",
      ),
    /Governance Vault Lock; ChangeableForDays must be absent.*Compliance mode/,
  );

  for (const policy of ["DeletionPolicy", "UpdateReplacePolicy"]) {
    const unprotectedVault = structuredClone(governanceVault);
    delete unprotectedVault[policy];
    assert.throws(
      () => assertStatefulResourceSafeguards(vault(unprotectedVault), "prod"),
      /lacks Retain deletion and update-replace policies/,
    );
  }
});

test("CDK entry and outputs stay within V4 and contain no credentials", async () => {
  const cdkConfig = JSON.parse(
    await readFile(path.join(packageRoot, "cdk.json"), "utf8"),
  );
  assert.equal(cdkConfig.app, "node infrastructure/bin/app.mjs");
  assert.equal(cdkConfig.versionReporting, false);

  const ignoreRules = await readFile(path.join(packageRoot, ".gitignore"), "utf8");
  assert.match(ignoreRules, /^\/cdk\.out\/$/m);

  for (const environmentName of APPROVED_ENVIRONMENTS) {
    const output = path.resolve(packageRoot, "cdk.out", environmentName);
    const relative = path.relative(packageRoot, output);
    assert.equal(relative.startsWith("..") || path.isAbsolute(relative), false);
  }

  const source = await readFile(
    path.join(packageRoot, "infrastructure", "bin", "app.mjs"),
    "utf8",
  );
  assert.doesNotMatch(source, /AKIA[0-9A-Z]{16}/);
  assert.doesNotMatch(source, /AWS_SECRET_ACCESS_KEY/i);
});
