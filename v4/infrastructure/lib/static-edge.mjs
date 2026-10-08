import assert from "node:assert/strict";
import { RemovalPolicy } from "aws-cdk-lib";
import { CfnBucket, CfnBucketPolicy } from "aws-cdk-lib/aws-s3";
import { CfnDistribution, CfnOriginAccessControl, CfnResponseHeadersPolicy } from "aws-cdk-lib/aws-cloudfront";
import { assertStaticEdgeBindings } from "../bootstrap/static-edge-contract.mjs";
import { target } from "../bootstrap/initialization.mjs";

// Native resources only: no publication, DNS, API, certificate, or cross-region
// helper. The literal certificate handoff is reviewed input, not AWS provenance.
export function addStaticEdge(stack, config, bindings) {
  assert.equal(config.environmentName, "dev");
  const t = target(config.accountId, "edge-static");
  assert.equal(stack.stackName, t.name); assert.equal(stack.region, t.region);
  assertStaticEdgeBindings(bindings, config.accountId);
  const bucket = new CfnBucket(stack, "StaticBucket", {
    bucketName: `shelfstate-v4-dev-static-${config.accountId}-us-west-2`,
    publicAccessBlockConfiguration: { blockPublicAcls: true, blockPublicPolicy: true, ignorePublicAcls: true, restrictPublicBuckets: true },
    ownershipControls: { rules: [{ objectOwnership: "BucketOwnerEnforced" }] },
    bucketEncryption: { serverSideEncryptionConfiguration: [{ serverSideEncryptionByDefault: { sseAlgorithm: "AES256" } }] },
  });
  bucket.overrideLogicalId("StaticBucket"); bucket.applyRemovalPolicy(RemovalPolicy.RETAIN);
  bucket.cfnOptions.metadata = { ShelfStateStatefulPolicy: "retained" };
  const oac = new CfnOriginAccessControl(stack, "OriginAccessControl", { originAccessControlConfig: {
    name: "shelfstate-v4-dev-static", originAccessControlOriginType: "s3", signingBehavior: "always", signingProtocol: "sigv4",
  } });
  oac.overrideLogicalId("OriginAccessControl");
  const headers = new CfnResponseHeadersPolicy(stack, "ResponseHeadersPolicy", { responseHeadersPolicyConfig: {
    name: "shelfstate-v4-dev-static-proof",
    securityHeadersConfig: {
      contentSecurityPolicy: { contentSecurityPolicy: "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'", override: true },
      contentTypeOptions: { override: true }, frameOptions: { frameOption: "DENY", override: true },
      referrerPolicy: { referrerPolicy: "no-referrer", override: true },
      strictTransportSecurity: { accessControlMaxAgeSec: 31536000, includeSubdomains: false, preload: false, override: true },
    },
    // Viewer cache behavior is explicit even before separately authorized object
    // publication. This is only the inert proof, not the final asset-cache policy.
    customHeadersConfig: { items: [{ header: "Cache-Control", value: "no-cache", override: true }] },
  } });
  headers.overrideLogicalId("ResponseHeadersPolicy");
  const distribution = new CfnDistribution(stack, "Distribution", { distributionConfig: {
    enabled: true, aliases: ["dev.shelfstate.codecorax.com"], defaultRootObject: "index.html",
    httpVersion: "http2", ipv6Enabled: true,
    viewerCertificate: { acmCertificateArn: bindings.certificateArn, sslSupportMethod: "sni-only", minimumProtocolVersion: "TLSv1.2_2021" },
    origins: [{ id: "static", domainName: bucket.attrRegionalDomainName, originAccessControlId: oac.attrId, s3OriginConfig: { originAccessIdentity: "" } }],
    defaultCacheBehavior: { targetOriginId: "static", allowedMethods: ["GET", "HEAD"], cachedMethods: ["GET", "HEAD"],
      viewerProtocolPolicy: "redirect-to-https", cachePolicyId: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad", responseHeadersPolicyId: headers.attrId },
  } });
  distribution.overrideLogicalId("Distribution");
  const policy = new CfnBucketPolicy(stack, "StaticBucketPolicy", { bucket: bucket.ref, policyDocument: {
    Version: "2012-10-17", Statement: [
      { Sid: "ExactDistributionRead", Effect: "Allow", Principal: { Service: "cloudfront.amazonaws.com" }, Action: "s3:GetObject",
        Resource: `${bucket.attrArn}/*`, Condition: { StringEquals: { "AWS:SourceArn": `arn:aws:cloudfront::${config.accountId}:distribution/${distribution.ref}` } } },
      { Sid: "DenyInsecureTransport", Effect: "Deny", Principal: "*", Action: "s3:*",
        Resource: [bucket.attrArn, `${bucket.attrArn}/*`], Condition: { Bool: { "aws:SecureTransport": "false" } } },
    ],
  } });
  policy.overrideLogicalId("StaticBucketPolicy");
  // Policy is deleted normally; retained bucket never becomes public. No object
  // deletion authority/helper is introduced. Distribution must precede its ARN
  // bound grant, so temporary lack of origin access is a live sequencing gate.
}
