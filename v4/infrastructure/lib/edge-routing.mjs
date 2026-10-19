import assert from "node:assert/strict";
import { addStaticEdge } from "./static-edge.mjs";
import {
  ALL_VIEWER_EXCEPT_HOST_HEADER_POLICY_ID,
  CACHING_DISABLED_POLICY_ID,
  assertEdgeRoutingBindings,
} from "../bootstrap/edge-routing-contract.mjs";
import { target } from "../bootstrap/initialization.mjs";

// Prospective initial combined template only. It neither discovers nor imports
// prior live resources, and the explicit bindings are shape checks, not provenance.
export function addEdgeRouting(stack, config, bindings) {
  assert.equal(config.environmentName, "dev");
  const t = target(config.accountId, "edge-routing");
  assert.equal(stack.stackName, t.name);
  assert.equal(stack.region, t.region);
  assertEdgeRoutingBindings(bindings, config.accountId);

  const { distribution } = addStaticEdge(stack, config, { certificateArn: bindings.certificateArn });
  distribution.distributionConfig.origins = [
    ...distribution.distributionConfig.origins,
    {
      id: "api",
      domainName: `${bindings.apiId}.execute-api.us-west-2.amazonaws.com`,
      customOriginConfig: {
        originProtocolPolicy: "https-only",
        originSslProtocols: ["TLSv1.2"],
      },
    },
  ];
  distribution.distributionConfig.cacheBehaviors = [{
    pathPattern: "/api/*",
    targetOriginId: "api",
    allowedMethods: ["GET", "HEAD"],
    cachedMethods: ["GET", "HEAD"],
    viewerProtocolPolicy: "https-only",
    cachePolicyId: CACHING_DISABLED_POLICY_ID,
    originRequestPolicyId: ALL_VIEWER_EXCEPT_HOST_HEADER_POLICY_ID,
  }];
}
