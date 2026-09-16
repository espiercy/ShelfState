import { App } from "aws-cdk-lib";
import { resolveEnvironmentConfig } from "../lib/environment.mjs";
import { createEnvironmentTopology } from "../lib/topology.mjs";
import { validateFoundationAssembly } from "../lib/template-guards.mjs";

const app = new App();
const environmentName = app.node.tryGetContext("shelfstateEnvironment");
const config = resolveEnvironmentConfig(environmentName, process.env);

createEnvironmentTopology(app, config);
const assembly = app.synth();
validateFoundationAssembly(assembly, config);
