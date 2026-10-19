// Exact, local-only contract for the pinned CDK's actual WP-007 API templates.
// Kept separate from constructs: synthesis does not build from its own validator.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { equal, object } from "../../scripts/release/schema.mjs";
import { target } from "./initialization.mjs";

export const LIBRARY_API_REVIEW_SCHEMA = "shelfstate.wp007-library-api-review/v1";
export function libraryApiTypes(phase) {
  assert.ok(["api-parent", "api-children"].includes(phase), "Unsupported library-api phase");
  return { Api: "AWS::ApiGatewayV2::Api", ...(phase === "api-children" ? {
    HealthLogGroup: "AWS::Logs::LogGroup", HealthRole: "AWS::IAM::Role", HealthFunction: "AWS::Lambda::Function",
    Integration: "AWS::ApiGatewayV2::Integration", Route: "AWS::ApiGatewayV2::Route",
    InvokePermission: "AWS::Lambda::Permission", DefaultStage: "AWS::ApiGatewayV2::Stage",
  } : {}) };
}

export function assertLibraryApiTemplate(template, account, phase) {
  const t = target(account, phase);
  const types = libraryApiTypes(phase);
  object(template, ["Description", "Metadata", "Resources", "Parameters", "Rules"], "Exact API template envelope");
  assert.equal(template.Description, "ShelfState V4 dev library-api (WP-007 local preparation)");
  equal(template.Metadata, { ShelfState: { Capability: "library-api", Environment: "dev", Region: t.region,
    WorkPackage: "WP-007", InitializationPhase: phase } }, "Exact API topology metadata");
  // Only the unchanged CDK bootstrap-version gate is allowed. No application
  // parameters, arbitrary SSM inputs, conditions, outputs, mappings or transforms.
  equal(template.Parameters, { BootstrapVersion: { Type: "AWS::SSM::Parameter::Value<String>",
    Default: "/cdk-bootstrap/hnb659fds/version",
    Description: "Version of the CDK Bootstrap resources in this environment, automatically retrieved from SSM Parameter Store. [cdk:skip]" } }, "Exact bootstrap parameter");
  equal(template.Rules, { CheckBootstrapVersion: { Assertions: [{
    Assert: { "Fn::Not": [{ "Fn::Contains": [["1", "2", "3", "4", "5"], { Ref: "BootstrapVersion" }] }] },
    AssertDescription: "CDK bootstrap stack version 6 required. Please run 'cdk bootstrap' with a recent version of the CDK CLI.",
  }] } }, "Exact bootstrap rule");
  const tags = { Environment: "dev", ManagedBy: "AWS-CDK", Project: "ShelfState" };
  const tagList = Object.entries(tags).map(([Key, Value]) => ({ Key, Value }));
  const ref = Ref => ({ Ref });
  const arn = id => ({ "Fn::GetAtt": [id, "Arn"] });
  const properties = { Api: { Name: "shelfstate-v4-dev-health", ProtocolType: "HTTP", Tags: tags } };
  if (phase === "api-children") Object.assign(properties, {
    HealthLogGroup: { LogGroupName: "/aws/lambda/shelfstate-v4-dev-health", RetentionInDays: 7, Tags: tagList },
    HealthRole: { RoleName: "shelfstate-v4-dev-health", Tags: tagList,
      PermissionsBoundary: `arn:aws:iam::${account}:policy/ShelfStateV4DevHealthBoundary`,
      AssumeRolePolicyDocument: { Version: "2012-10-17", Statement: [
        { Effect: "Allow", Action: "sts:AssumeRole", Principal: { Service: "lambda.amazonaws.com" } },
      ] },
      Policies: [{ PolicyName: "HealthLogWrites", PolicyDocument: { Version: "2012-10-17", Statement: [
        { Effect: "Allow", Action: ["logs:CreateLogStream", "logs:PutLogEvents"],
          Resource: `arn:aws:logs:us-west-2:${account}:log-group:/aws/lambda/shelfstate-v4-dev-health:log-stream:*` },
      ] } }],
    },
    HealthFunction: { FunctionName: "shelfstate-v4-dev-health", Handler: "index.handler", Runtime: "nodejs24.x",
      Architectures: ["arm64"], MemorySize: 128, Timeout: 3, Role: arn("HealthRole"), Tags: tagList,
      LoggingConfig: { LogGroup: ref("HealthLogGroup") },
      Code: { ZipFile: readFileSync(new URL("../../backend/health.cjs", import.meta.url), "utf8").replace(/\r\n/g, "\n") },
    },
    Integration: { ApiId: ref("Api"), IntegrationType: "AWS_PROXY", IntegrationUri: arn("HealthFunction"), PayloadFormatVersion: "2.0", TimeoutInMillis: 3000 },
    Route: { ApiId: ref("Api"), RouteKey: "GET /api/v1/health", AuthorizationType: "NONE",
      Target: { "Fn::Join": ["/", ["integrations", ref("Integration")]] } },
    InvokePermission: { Action: "lambda:InvokeFunction", FunctionName: arn("HealthFunction"), Principal: "apigateway.amazonaws.com",
      SourceAccount: account, SourceArn: { "Fn::Join": ["", [`arn:aws:execute-api:us-west-2:${account}:`, ref("Api"), "/$default/GET/api/v1/health"]] } },
    DefaultStage: { ApiId: ref("Api"), StageName: "$default", AutoDeploy: true, Tags: tags },
  });
  object(template.Resources, Object.keys(types), "Exact library-api inventory");
  for (const [id, Type] of Object.entries(types)) {
    const expected = { Type, Properties: properties[id] };
    if (id === "HealthFunction") expected.DependsOn = ["HealthLogGroup"];
    if (id === "DefaultStage") expected.DependsOn = ["InvokePermission", "Route"];
    equal(template.Resources[id], expected, `${id}: unsupported library-api semantic representation`);
  }
}
