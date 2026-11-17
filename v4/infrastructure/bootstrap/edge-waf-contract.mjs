// Independent positive contract for the pinned CDK's actual WAF phase.
import assert from "node:assert/strict";
import { equal, object } from "../../scripts/release/schema.mjs";
import { target } from "./initialization.mjs";

export const EDGE_WAF_REVIEW_SCHEMA = "shelfstate.wp007-edge-waf-review/v1";
export function edgeWafTypes(phase) {
  assert.equal(phase, "edge-waf", "Unsupported edge WAF phase");
  return { WebAcl: "AWS::WAFv2::WebACL" };
}

export function assertEdgeWafTemplate(template, account, phase) {
  const types = edgeWafTypes(phase);
  const t = target(account, phase);
  object(template, ["Description", "Metadata", "Resources", "Outputs", "Parameters", "Rules"], "Exact edge WAF template envelope");
  assert.equal(template.Description, "ShelfState V4 dev edge-waf (WP-007 local preparation)");
  equal(template.Metadata, { ShelfState: { Capability: "edge-waf", Environment: "dev", Region: t.region,
    WorkPackage: "WP-007", InitializationPhase: phase } }, "Exact edge WAF topology metadata");
  equal(template.Parameters, { BootstrapVersion: { Type: "AWS::SSM::Parameter::Value<String>",
    Default: "/cdk-bootstrap/hnb659fds/version",
    Description: "Version of the CDK Bootstrap resources in this environment, automatically retrieved from SSM Parameter Store. [cdk:skip]" } }, "Exact bootstrap parameter");
  equal(template.Rules, { CheckBootstrapVersion: { Assertions: [{
    Assert: { "Fn::Not": [{ "Fn::Contains": [["1", "2", "3", "4", "5"], { Ref: "BootstrapVersion" }] }] },
    AssertDescription: "CDK bootstrap stack version 6 required. Please run 'cdk bootstrap' with a recent version of the CDK CLI.",
  }] } }, "Exact bootstrap rule");
  object(template.Resources, Object.keys(types), "Exact edge WAF inventory");
  equal(template.Resources.WebAcl, {
    Type: types.WebAcl,
    Properties: {
      DefaultAction: { Allow: {} },
      Name: "shelfstate-v4-dev-edge",
      Rules: [{
        Action: { Block: {} }, Name: "RateLimitPerIp", Priority: 0,
        Statement: { RateBasedStatement: { AggregateKeyType: "IP", EvaluationWindowSec: 60, Limit: 120 } },
        VisibilityConfig: { CloudWatchMetricsEnabled: true, MetricName: "ShelfStateV4DevEdgeRateLimit", SampledRequestsEnabled: false },
      }],
      Scope: "CLOUDFRONT",
      Tags: [{ Key: "Environment", Value: "dev" }, { Key: "ManagedBy", Value: "AWS-CDK" }, { Key: "Project", Value: "ShelfState" }],
      VisibilityConfig: { CloudWatchMetricsEnabled: true, MetricName: "ShelfStateV4DevEdgeWebAcl", SampledRequestsEnabled: false },
    },
    Metadata: { ShelfStateStatefulPolicy: "destroy-approved" },
  }, "WebAcl: unsupported edge WAF semantic representation");
  equal(template.Outputs, { WebAclArn: { Value: { "Fn::GetAtt": ["WebAcl", "Arn"] } } }, "Exact Web ACL ARN handoff output");
}
