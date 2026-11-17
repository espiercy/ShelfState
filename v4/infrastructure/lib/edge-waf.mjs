import assert from "node:assert/strict";
import { CfnOutput } from "aws-cdk-lib";
import { CfnWebACL } from "aws-cdk-lib/aws-wafv2";
import { target } from "../bootstrap/initialization.mjs";

// One CloudFront-scope protection pack only. Association occurs later through
// the distribution's WebACLId property after authentic ARN readback.
export function addEdgeWaf(stack, config) {
  assert.equal(config.environmentName, "dev", "WP-007 edge WAF is dev-only");
  const binding = target(config.accountId, "edge-waf");
  assert.equal(stack.stackName, binding.name);
  assert.equal(stack.region, binding.region);

  const webAcl = new CfnWebACL(stack, "WebAcl", {
    name: "shelfstate-v4-dev-edge",
    scope: "CLOUDFRONT",
    defaultAction: { allow: {} },
    rules: [{
      name: "RateLimitPerIp",
      priority: 0,
      action: { block: {} },
      statement: { rateBasedStatement: { aggregateKeyType: "IP", evaluationWindowSec: 60, limit: 120 } },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: "ShelfStateV4DevEdgeRateLimit",
        sampledRequestsEnabled: false,
      },
    }],
    visibilityConfig: {
      cloudWatchMetricsEnabled: true,
      metricName: "ShelfStateV4DevEdgeWebAcl",
      sampledRequestsEnabled: false,
    },
  });
  webAcl.overrideLogicalId("WebAcl");
  webAcl.cfnOptions.metadata = { ShelfStateStatefulPolicy: "destroy-approved" };

  const output = new CfnOutput(stack, "WebAclArn", { value: webAcl.attrArn });
  output.overrideLogicalId("WebAclArn");
}
