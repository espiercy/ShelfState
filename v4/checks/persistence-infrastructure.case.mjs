import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { assertIdentitySessionTemplate } from "../infrastructure/bootstrap/identity-session-contract.mjs";
import { resolveEnvironmentConfig } from "../infrastructure/lib/environment.mjs";
import { createEnvironmentTopology } from "../infrastructure/lib/topology.mjs";
import {
  assertFoundationTemplate,
  validateIdentitySessionAssembly,
} from "../infrastructure/lib/template-guards.mjs";

async function withAssembly(environmentName, callback) {
  const outdir = await mkdtemp(path.join(os.tmpdir(), `shelfstate-wp008-${environmentName}-`));
  try {
    const app = new App({ outdir });
    const config = resolveEnvironmentConfig(environmentName);
    const topology = createEnvironmentTopology(app, config, {
      implementationPhase: "identity-session",
    });
    const assembly = app.synth();
    validateIdentitySessionAssembly(assembly, config, "identity-session");
    await callback({ assembly, config, topology });
  } finally {
    await rm(outdir, { force: true, recursive: true });
  }
}

test("WP-008 dev and prod synthesize the exact protected two-table boundary", async () => {
  for (const environmentName of ["dev", "prod"]) {
    await withAssembly(environmentName, ({ config, topology }) => {
      const identityTemplate = Template.fromStack(
        topology.stacks.get("identity-session"),
      ).toJSON();
      assertIdentitySessionTemplate(identityTemplate, config);
      assert.equal(
        topology.stacks.get("identity-session").terminationProtection,
        environmentName === "prod",
      );
      for (const [capability, stack] of topology.stacks) {
        if (capability !== "identity-session") {
          assertFoundationTemplate(Template.fromStack(stack).toJSON(), environmentName);
        }
      }
    });
  }
});

test("WP-008 implementation cannot be combined with an initialization phase or binding", () => {
  const config = resolveEnvironmentConfig("dev");
  assert.throws(
    () => createEnvironmentTopology(new App(), config, {
      implementationPhase: "identity-session",
      initializationPhase: "api-parent",
    }),
    /cannot be combined/,
  );
  assert.throws(
    () => createEnvironmentTopology(new App(), config, {
      implementationPhase: "identity-session",
      initializationBindings: {},
    }),
    /do not accept external bindings/,
  );
});

test("ordinary foundation synthesis remains resource-empty", () => {
  const app = new App();
  const topology = createEnvironmentTopology(app, resolveEnvironmentConfig("dev"));
  for (const stack of topology.stacks.values()) {
    assertFoundationTemplate(Template.fromStack(stack).toJSON(), "dev");
  }
});

test("WP-008 table contract rejects every unapproved property surface", () => {
  const app = new App();
  const config = resolveEnvironmentConfig("dev");
  const topology = createEnvironmentTopology(app, config, {
    implementationPhase: "identity-session",
  });
  const template = Template.fromStack(topology.stacks.get("identity-session")).toJSON();
  for (const [property, value] of [
    ["GlobalSecondaryIndexes", []],
    ["ImportSourceSpecification", {}],
    ["KinesisStreamSpecification", {}],
    ["LocalSecondaryIndexes", []],
    ["Replicas", []],
    ["ResourcePolicy", {}],
    ["StreamSpecification", { StreamViewType: "NEW_IMAGE" }],
  ]) {
    const changed = structuredClone(template);
    changed.Resources.IdentityAccountTable.Properties[property] = value;
    assert.throws(
      () => assertIdentitySessionTemplate(changed, config),
      /Expected values to be strictly deep-equal/,
      property,
    );
  }
});

test("WP-008 contract accepts only the exact optional CDK path metadata", () => {
  const app = new App();
  const config = resolveEnvironmentConfig("dev");
  const topology = createEnvironmentTopology(app, config, {
    implementationPhase: "identity-session",
  });
  const template = Template.fromStack(topology.stacks.get("identity-session")).toJSON();
  for (const logicalId of ["IdentityAccountTable", "SessionAuthTable"]) {
    template.Resources[logicalId].Metadata["aws:cdk:path"] =
      `ShelfStateV4DevIdentitySession/${logicalId}`;
  }
  for (const logicalId of [
    "IdentityMapPolicy",
    "AccountPolicy",
    "SessionPolicy",
    "AuthTransactionPolicy",
  ]) {
    template.Resources[logicalId].Metadata = {
      "aws:cdk:path": `ShelfStateV4DevIdentitySession/${logicalId}`,
    };
  }
  assert.doesNotThrow(() => assertIdentitySessionTemplate(template, config));

  template.Resources.SessionPolicy.Metadata["aws:cdk:path"] =
    "ShelfStateV4DevIdentitySession/OtherPolicy";
  assert.throws(
    () => assertIdentitySessionTemplate(template, config),
    /Expected values to be strictly deep-equal/,
  );
});
