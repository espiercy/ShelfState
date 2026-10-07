import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Fn } from "aws-cdk-lib";
import { CfnApi, CfnIntegration, CfnRoute, CfnStage } from "aws-cdk-lib/aws-apigatewayv2";
import { CfnRole } from "aws-cdk-lib/aws-iam";
import { CfnFunction, CfnPermission } from "aws-cdk-lib/aws-lambda";
import { CfnLogGroup } from "aws-cdk-lib/aws-logs";
import { target } from "../bootstrap/initialization.mjs";

// Uses the existing initialization phases and capability stack. No lookup/import
// of a live API: the same logical Api persists through both native CFN templates.
export function addLibraryApi(stack, config, phase) {
  assert.equal(config.environmentName, "dev", "WP-007 resources are dev-only");
  assert.ok(["api-parent", "api-children"].includes(phase), "Unsupported API phase");
  const binding = target(config.accountId, phase); // Explicit account; never discover one.
  assert.equal(stack.stackName, binding.name);
  assert.equal(stack.region, binding.region);
  const stable = (resource, id) => { resource.overrideLogicalId(id); return resource; };
  const api = stable(new CfnApi(stack, "Api", { name: "shelfstate-v4-dev-health", protocolType: "HTTP" }), "Api");
  if (phase === "api-parent") return;

  const logs = stable(new CfnLogGroup(stack, "HealthLogGroup", {
    logGroupName: "/aws/lambda/shelfstate-v4-dev-health", retentionInDays: 7,
  }), "HealthLogGroup");
  const role = stable(new CfnRole(stack, "HealthRole", {
    roleName: "shelfstate-v4-dev-health",
    permissionsBoundary: `arn:aws:iam::${binding.account}:policy/ShelfStateV4DevHealthBoundary`,
    assumeRolePolicyDocument: { Version: "2012-10-17", Statement: [
      { Effect: "Allow", Action: "sts:AssumeRole", Principal: { Service: "lambda.amazonaws.com" } },
    ] },
    policies: [{ policyName: "HealthLogWrites", policyDocument: { Version: "2012-10-17", Statement: [
      { Effect: "Allow", Action: ["logs:CreateLogStream", "logs:PutLogEvents"],
        Resource: `arn:aws:logs:us-west-2:${binding.account}:log-group:/aws/lambda/shelfstate-v4-dev-health:log-stream:*` },
    ] } }],
  }), "HealthRole");
  // Tiny inline CommonJS source avoids an unbound upload, bundler or asset fetch.
  const code = readFileSync(new URL("../../backend/health.cjs", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const health = stable(new CfnFunction(stack, "HealthFunction", {
    functionName: "shelfstate-v4-dev-health", runtime: "nodejs24.x", handler: "index.handler",
    architectures: ["arm64"], memorySize: 128, timeout: 3,
    role: role.attrArn, code: { zipFile: code }, loggingConfig: { logGroup: logs.ref },
  }), "HealthFunction");
  health.addResourceDependency(logs); // Explicit precreation; runtime cannot CreateLogGroup.
  const integration = stable(new CfnIntegration(stack, "Integration", {
    apiId: api.ref, integrationType: "AWS_PROXY", integrationUri: health.attrArn,
    payloadFormatVersion: "2.0", timeoutInMillis: 3000,
  }), "Integration");
  const route = stable(new CfnRoute(stack, "Route", {
    apiId: api.ref, routeKey: "GET /api/v1/health", authorizationType: "NONE",
    target: Fn.join("/", ["integrations", integration.ref]),
  }), "Route");
  const permission = stable(new CfnPermission(stack, "InvokePermission", {
    action: "lambda:InvokeFunction", functionName: health.attrArn, principal: "apigateway.amazonaws.com",
    sourceAccount: binding.account,
    sourceArn: Fn.join("", [`arn:aws:execute-api:us-west-2:${binding.account}:`, api.ref, "/$default/GET/api/v1/health"]),
  }), "InvokePermission");
  const stage = stable(new CfnStage(stack, "DefaultStage", {
    apiId: api.ref, stageName: "$default", autoDeploy: true,
  }), "DefaultStage");
  stage.addResourceDependency(route);
  stage.addResourceDependency(permission);
}
