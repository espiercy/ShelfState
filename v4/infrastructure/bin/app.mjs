import { App } from "aws-cdk-lib";
import { resolveEnvironmentConfig } from "../lib/environment.mjs";
import { createEnvironmentTopology } from "../lib/topology.mjs";
import { validateFoundationAssembly, validateLocalApiAssembly, validateLocalCertificateAssembly } from "../lib/template-guards.mjs";

const app = new App();
const environmentName = app.node.tryGetContext("shelfstateEnvironment");
const config = resolveEnvironmentConfig(environmentName, process.env);

const phase = app.node.tryGetContext("shelfstateInitializationPhase");
createEnvironmentTopology(app, config, phase === undefined ? {} : { initializationPhase: phase });
const assembly = app.synth();
if (phase === undefined) validateFoundationAssembly(assembly, config);
else if (phase === "certificate") validateLocalCertificateAssembly(assembly, config, phase);
else validateLocalApiAssembly(assembly, config, phase);
