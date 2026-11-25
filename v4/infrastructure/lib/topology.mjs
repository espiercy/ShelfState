import { Stack, Tags, Validations } from "aws-cdk-lib";
import { requiredTags, stackName } from "./naming.mjs";
import assert from "node:assert/strict";
import { addLibraryApi } from "./library-api.mjs";
import { addEdgeCertificate } from "./edge-certificate.mjs";
import { addStaticEdge } from "./static-edge.mjs";
import { assertStaticEdgeBindings } from "../bootstrap/static-edge-contract.mjs";
import { addEdgeRouting } from "./edge-routing.mjs";
import { assertEdgeRoutingBindings } from "../bootstrap/edge-routing-contract.mjs";
import { addEdgeWaf } from "./edge-waf.mjs";
import { addIdentitySessionPersistence } from "./identity-session.mjs";
import { addDevCognitoLogin } from "./cognito-login.mjs";

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
  assert.ok(Object.keys(options).every(key => ["implementationPhase", "initializationPhase", "initializationBindings"].includes(key)), "Unsupported topology option");
  const phase = options.initializationPhase;
  const implementationPhase = options.implementationPhase;
  assert.ok(!(phase && implementationPhase), "Initialization and implementation phases cannot be combined");
  if (implementationPhase !== undefined) {
    assert.ok(["identity-session", "cognito-login"].includes(implementationPhase), "Unsupported implementation phase");
    assert.ok(!Object.hasOwn(options, "initializationBindings"), "Implementation phases do not accept external bindings");
  }
  if (implementationPhase === "cognito-login") {
    assert.equal(config.environmentName, "dev", "Cognito login resources are dev-only");
    assert.match(config.accountId ?? "", /^\d{12}$/, "Explicit local account binding required; no AWS discovery");
    assert.equal(config.primaryRegion, "us-west-2");
  }
  if (phase === "edge-static") assertStaticEdgeBindings(options.initializationBindings, config.accountId);
  else if (phase === "edge-routing") assertEdgeRoutingBindings(options.initializationBindings, config.accountId);
  else assert.ok(!Object.hasOwn(options, "initializationBindings"), "External bindings belong only to explicit edge phases");
  if (phase !== undefined) {
    assert.equal(config.environmentName, "dev", "Initialization resources are dev-only");
    assert.ok(["api-parent", "api-children", "certificate", "edge-static", "edge-routing", "edge-waf"].includes(phase), "Unsupported initialization phase");
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
    if (definition.key === "edge-delivery" && phase === "edge-static") {
      stack.templateOptions.description = "ShelfState V4 dev edge-delivery (WP-007 local preparation)";
      stack.templateOptions.metadata.ShelfState.WorkPackage = "WP-007";
      stack.templateOptions.metadata.ShelfState.InitializationPhase = phase;
      addStaticEdge(stack, config, options.initializationBindings);
    }
    if (definition.key === "edge-delivery" && phase === "edge-routing") {
      stack.templateOptions.description = "ShelfState V4 dev edge-delivery (WP-007 local preparation)";
      stack.templateOptions.metadata.ShelfState.WorkPackage = "WP-007";
      stack.templateOptions.metadata.ShelfState.InitializationPhase = phase;
      addEdgeRouting(stack, config, options.initializationBindings);
    }
    if (definition.key === "identity-session" && implementationPhase === "identity-session") {
      stack.templateOptions.description = `ShelfState V4 ${config.environmentName} identity/session persistence (WP-008 repository candidate; not deployed)`;
      stack.templateOptions.metadata.ShelfState.WorkPackage = "WP-008";
      stack.templateOptions.metadata.ShelfState.ImplementationPhase = implementationPhase;
      addIdentitySessionPersistence(stack, config);
    }
  }

  // The WAF stack is an explicit WP-007-only deployment phase. It is not added
  // to the accepted six-stack resource-empty foundation topology.
  if (phase === "edge-waf") {
    const stack = new Stack(app, constructId(config, "edge-waf"), {
      description: "ShelfState V4 dev edge-waf (WP-007 local preparation)",
      env: stackEnvironment(config, config.edgeCertificateRegion),
      stackName: stackName(config, "edge-waf"),
      terminationProtection: false,
    });
    stack.templateOptions.metadata = { ShelfState: {
      Capability: "edge-waf", Environment: "dev", Region: config.edgeCertificateRegion,
      WorkPackage: "WP-007", InitializationPhase: phase,
    } };
    for (const [key, value] of Object.entries(tags)) Tags.of(stack).add(key, value);
    addEdgeWaf(stack, config);
    stacks.set("edge-waf", stack);
  }

  if (implementationPhase === "cognito-login") {
    const stack = new Stack(app, constructId(config, "cognito-login"), {
      description: "ShelfState V4 dev Cognito login (WP-009 local inspection)",
      env: stackEnvironment(config, config.primaryRegion),
      stackName: stackName(config, "cognito-login"),
      terminationProtection: true,
    });
    stack.templateOptions.metadata = { ShelfState: {
      Capability: "cognito-login", Environment: "dev", Region: config.primaryRegion,
      WorkPackage: "WP-009", ImplementationPhase: implementationPhase,
    } };
    for (const [key, value] of Object.entries(tags)) Tags.of(stack).add(key, value);
    addDevCognitoLogin(stack, config);
    stacks.set("cognito-login", stack);
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
