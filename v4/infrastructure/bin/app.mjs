import { App } from "aws-cdk-lib";
import { resolveEnvironmentConfig } from "../lib/environment.mjs";
import { createEnvironmentTopology } from "../lib/topology.mjs";
import { validateFoundationAssembly, validateLocalApiAssembly, validateLocalCertificateAssembly, validateLocalStaticEdgeAssembly, validateLocalEdgeRoutingAssembly } from "../lib/template-guards.mjs";

const app = new App();
const environmentName = app.node.tryGetContext("shelfstateEnvironment");
const config = resolveEnvironmentConfig(environmentName, process.env);

const phase = app.node.tryGetContext("shelfstateInitializationPhase");
const bindings = app.node.tryGetContext("shelfstateInitializationBindings");
createEnvironmentTopology(app, config, { ...(phase === undefined ? {} : { initializationPhase: phase }),
  ...(bindings === undefined ? {} : { initializationBindings: bindings }) });
const assembly = app.synth();
if (phase === undefined) validateFoundationAssembly(assembly, config);
else if (phase === "certificate") validateLocalCertificateAssembly(assembly, config, phase);
else if (phase === "edge-static") validateLocalStaticEdgeAssembly(assembly, config, phase, bindings);
else if (phase === "edge-routing") validateLocalEdgeRoutingAssembly(assembly, config, phase, bindings);
else validateLocalApiAssembly(assembly, config, phase);
