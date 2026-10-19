// Independent positive contract for the prospective combined edge template.
// Format validation does not establish certificate/API physical provenance.
import assert from "node:assert/strict";
import { object, equal } from "../../scripts/release/schema.mjs";
import { staticEdgeTypes, assertStaticEdgeBindings, assertStaticEdgeTemplate } from "./static-edge-contract.mjs";

export const EDGE_ROUTING_REVIEW_SCHEMA = "shelfstate.wp007-edge-routing-review/v1";
export const CACHING_DISABLED_POLICY_ID = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad";
export const ALL_VIEWER_EXCEPT_HOST_HEADER_POLICY_ID = "b689b0a8-53d0-40ab-baf2-68738e2966ac";

export function edgeRoutingTypes(phase) {
  assert.equal(phase, "edge-routing", "Unsupported edge routing phase");
  return staticEdgeTypes("edge-static");
}

export function assertEdgeRoutingBindings(bindings, account) {
  object(bindings, ["certificateArn", "apiId"], "Only reviewed certificate ARN and API ID are accepted");
  assertStaticEdgeBindings({ certificateArn: bindings.certificateArn }, account);
  assert.equal(typeof bindings.apiId, "string");
  assert.match(bindings.apiId, /^[a-z0-9]{1,32}$/, "API ID has unsupported shape");
}

export function assertEdgeRoutingTemplate(template, account, phase, bindings) {
  edgeRoutingTypes(phase);
  assertEdgeRoutingBindings(bindings, account);
  assert.equal(
    template?.Metadata?.ShelfState?.InitializationPhase,
    phase,
    "Exact edge routing phase marker required",
  );
  const distribution = template?.Resources?.Distribution?.Properties?.DistributionConfig;
  assert.ok(distribution && typeof distribution === "object", "Distribution configuration required");
  assert.ok(Array.isArray(distribution.Origins), "Origins array required");
  assert.equal(distribution.Origins.length, 2, "Exactly static and API origins required");
  equal(distribution.Origins[1], {
    Id: "api",
    DomainName: `${bindings.apiId}.execute-api.us-west-2.amazonaws.com`,
    CustomOriginConfig: {
      OriginProtocolPolicy: "https-only",
      OriginSSLProtocols: ["TLSv1.2"],
    },
  }, "Exact API origin required");
  equal(distribution.CacheBehaviors, [{
    PathPattern: "/api/*",
    TargetOriginId: "api",
    AllowedMethods: ["GET", "HEAD"],
    CachedMethods: ["GET", "HEAD"],
    ViewerProtocolPolicy: "https-only",
    CachePolicyId: CACHING_DISABLED_POLICY_ID,
    OriginRequestPolicyId: ALL_VIEWER_EXCEPT_HOST_HEADER_POLICY_ID,
  }], "Exact API behavior required");

  // Prove every remaining byte is the already-accepted static representation.
  // The clone removes only the two routing additions and restores only the phase
  // marker before delegating to the unchanged complete static contract.
  const staticProjection = structuredClone(template);
  staticProjection.Metadata.ShelfState.InitializationPhase = "edge-static";
  staticProjection.Resources.Distribution.Properties.DistributionConfig.Origins.pop();
  delete staticProjection.Resources.Distribution.Properties.DistributionConfig.CacheBehaviors;
  assertStaticEdgeTemplate(staticProjection, account, "edge-static", { certificateArn: bindings.certificateArn });
}
