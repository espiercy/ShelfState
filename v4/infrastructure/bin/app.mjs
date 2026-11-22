import { App } from "aws-cdk-lib";
import { resolveEnvironmentConfig } from "../lib/environment.mjs";
import { createEnvironmentTopology } from "../lib/topology.mjs";
import { validateFoundationAssembly, validateIdentitySessionAssembly, validateLocalApiAssembly, validateLocalCertificateAssembly, validateLocalStaticEdgeAssembly, validateLocalEdgeRoutingAssembly, validateLocalEdgeWafAssembly } from "../lib/template-guards.mjs";

const app = new App();
const environmentName = app.node.tryGetContext("shelfstateEnvironment");
const config = resolveEnvironmentConfig(environmentName, process.env);

const phase = app.node.tryGetContext("shelfstateInitializationPhase");
const bindings = app.node.tryGetContext("shelfstateInitializationBindings");
const implementationPhase = app.node.tryGetContext("shelfstateImplementationPhase");
createEnvironmentTopology(app, config, { ...(phase === undefined ? {} : { initializationPhase: phase }),
  ...(implementationPhase === undefined ? {} : { implementationPhase }),
  ...(bindings === undefined ? {} : { initializationBindings: bindings }) });
const assembly = app.synth();
if (implementationPhase !== undefined) validateIdentitySessionAssembly(assembly, config, implementationPhase);
else if (phase === undefined) validateFoundationAssembly(assembly, config);
else if (phase === "certificate") validateLocalCertificateAssembly(assembly, config, phase);
else if (phase === "edge-static") validateLocalStaticEdgeAssembly(assembly, config, phase, bindings);
else if (phase === "edge-routing") validateLocalEdgeRoutingAssembly(assembly, config, phase, bindings);
else if (phase === "edge-waf") validateLocalEdgeWafAssembly(assembly, config, phase);
else validateLocalApiAssembly(assembly, config, phase);
