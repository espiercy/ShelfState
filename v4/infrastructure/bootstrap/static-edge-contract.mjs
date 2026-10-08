// Independent closed contract, not a template factory used by the constructs.
import assert from "node:assert/strict";
import { object, equal } from "../../scripts/release/schema.mjs";
import { target } from "./initialization.mjs";

export const STATIC_EDGE_REVIEW_SCHEMA = "shelfstate.wp007-static-edge-review/v1";
export function staticEdgeTypes(phase) {
  assert.equal(phase, "edge-static", "Unsupported static edge phase");
  return { StaticBucket: "AWS::S3::Bucket", OriginAccessControl: "AWS::CloudFront::OriginAccessControl",
    ResponseHeadersPolicy: "AWS::CloudFront::ResponseHeadersPolicy", Distribution: "AWS::CloudFront::Distribution", StaticBucketPolicy: "AWS::S3::BucketPolicy" };
}
export function assertStaticEdgeBindings(bindings, account) {
  assert.match(account ?? "", /^\d{12}$/);
  object(bindings, ["certificateArn"], "Only reviewed external certificate ARN is accepted");
  assert.equal(typeof bindings.certificateArn, "string");
  assert.match(bindings.certificateArn, new RegExp(`^arn:aws:acm:us-east-1:${account}:certificate/[a-zA-Z0-9-]{1,64}$`));
}

export function assertStaticEdgeTemplate(template, account, phase, bindings) {
  const types = staticEdgeTypes(phase), t = target(account, phase);
  assertStaticEdgeBindings(bindings, account);
  object(template, ["Description", "Metadata", "Resources", "Parameters", "Rules"], "Exact static edge envelope");
  assert.equal(template.Description, "ShelfState V4 dev edge-delivery (WP-007 local preparation)");
  equal(template.Metadata, { ShelfState: { Capability: "edge-delivery", Environment: "dev", Region: t.region,
    WorkPackage: "WP-007", InitializationPhase: "edge-static" } }, "Exact static topology");
  equal(template.Parameters, { BootstrapVersion: { Type: "AWS::SSM::Parameter::Value<String>", Default: "/cdk-bootstrap/hnb659fds/version",
    Description: "Version of the CDK Bootstrap resources in this environment, automatically retrieved from SSM Parameter Store. [cdk:skip]" } }, "Exact bootstrap parameter");
  equal(template.Rules, { CheckBootstrapVersion: { Assertions: [{ Assert: { "Fn::Not": [{ "Fn::Contains": [["1", "2", "3", "4", "5"], { Ref: "BootstrapVersion" }] }] },
    AssertDescription: "CDK bootstrap stack version 6 required. Please run 'cdk bootstrap' with a recent version of the CDK CLI." }] } }, "Exact bootstrap rule");
  object(template.Resources, Object.keys(types), "Exact static edge inventory");
  const ref = Ref => ({ Ref }), att = (id, name) => ({ "Fn::GetAtt": [id, name] }), join = parts => ({ "Fn::Join": ["", parts] });
  const tags = [{ Key: "Environment", Value: "dev" }, { Key: "ManagedBy", Value: "AWS-CDK" }, { Key: "Project", Value: "ShelfState" }];
  const expected = {
    StaticBucket: { Type: types.StaticBucket, Properties: {
      BucketName: `shelfstate-v4-dev-static-${account}-us-west-2`,
      PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
      OwnershipControls: { Rules: [{ ObjectOwnership: "BucketOwnerEnforced" }] },
      BucketEncryption: { ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } }] }, Tags: tags,
    }, UpdateReplacePolicy: "Retain", DeletionPolicy: "Retain", Metadata: { ShelfStateStatefulPolicy: "retained" } },
    OriginAccessControl: { Type: types.OriginAccessControl, Properties: { OriginAccessControlConfig: {
      Name: "shelfstate-v4-dev-static", OriginAccessControlOriginType: "s3", SigningBehavior: "always", SigningProtocol: "sigv4",
    } } },
    ResponseHeadersPolicy: { Type: types.ResponseHeadersPolicy, Properties: { ResponseHeadersPolicyConfig: {
      Name: "shelfstate-v4-dev-static-proof", SecurityHeadersConfig: {
        ContentSecurityPolicy: { ContentSecurityPolicy: "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'", Override: true },
        ContentTypeOptions: { Override: true }, FrameOptions: { FrameOption: "DENY", Override: true }, ReferrerPolicy: { ReferrerPolicy: "no-referrer", Override: true },
        StrictTransportSecurity: { AccessControlMaxAgeSec: 31536000, IncludeSubdomains: false, Preload: false, Override: true },
      }, CustomHeadersConfig: { Items: [{ Header: "Cache-Control", Value: "no-cache", Override: true }] },
    } } },
    Distribution: { Type: types.Distribution, Properties: { DistributionConfig: {
      Enabled: true, Aliases: ["dev.shelfstate.codecorax.com"], DefaultRootObject: "index.html", HttpVersion: "http2", IPV6Enabled: true,
      ViewerCertificate: { AcmCertificateArn: bindings.certificateArn, SslSupportMethod: "sni-only", MinimumProtocolVersion: "TLSv1.2_2021" },
      Origins: [{ Id: "static", DomainName: att("StaticBucket", "RegionalDomainName"), OriginAccessControlId: att("OriginAccessControl", "Id"), S3OriginConfig: { OriginAccessIdentity: "" } }],
      DefaultCacheBehavior: { TargetOriginId: "static", AllowedMethods: ["GET", "HEAD"], CachedMethods: ["GET", "HEAD"], ViewerProtocolPolicy: "redirect-to-https",
        CachePolicyId: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad", ResponseHeadersPolicyId: att("ResponseHeadersPolicy", "Id") },
    }, Tags: tags } },
    StaticBucketPolicy: { Type: types.StaticBucketPolicy, Properties: { Bucket: ref("StaticBucket"), PolicyDocument: {
      Version: "2012-10-17", Statement: [
        { Sid: "ExactDistributionRead", Effect: "Allow", Principal: { Service: "cloudfront.amazonaws.com" }, Action: "s3:GetObject",
          Resource: join([att("StaticBucket", "Arn"), "/*"]), Condition: { StringEquals: { "AWS:SourceArn": join([`arn:aws:cloudfront::${account}:distribution/`, ref("Distribution")]) } } },
        { Sid: "DenyInsecureTransport", Effect: "Deny", Principal: "*", Action: "s3:*", Resource: [att("StaticBucket", "Arn"), join([att("StaticBucket", "Arn"), "/*"])],
          Condition: { Bool: { "aws:SecureTransport": "false" } } },
      ],
    } } },
  };
  // Complete equality rejects unknown nested properties, attributes, bindings,
  // intrinsics, helpers and repinned substitutions; only object order is ignored.
  equal(template.Resources, expected, "Unsupported static edge semantic representation");
}
