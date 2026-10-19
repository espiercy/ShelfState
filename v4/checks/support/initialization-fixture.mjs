// Synthetic review evidence only. No CDK resources are instantiated or emitted.
import { hash, hashObject } from "../../scripts/release/schema.mjs";
import { target } from "../../infrastructure/bootstrap/initialization.mjs";
export const ACCOUNT = "123456789012"; // AWS documentation account, not a live binding.
export const IDS = { apiId: "apitest", integrationId: "integrationtest", routeId: "routetest", distributionId: "DISTTEST", oacId: "OACTEST", cachePolicyId: "cache-test", originRequestPolicyId: "origin-test", responseHeadersPolicyId: "headers-test", certificateId: "certificate-test" };
const ref = Ref => ({ Ref });
const resource = (Type, Properties = {}) => ({ Type, Properties });
export function fixture(phase = "api-parent") {
  const t = target(ACCOUNT, phase);
  const bindings = { apiId: IDS.apiId, healthFunctionArn: `arn:aws:lambda:us-west-2:${ACCOUNT}:function:shelfstate-v4-dev-health`, zoneId: "ZTESTONLY",
    certificateArn: `arn:aws:acm:us-east-1:${ACCOUNT}:certificate/certificate-test`, staticBucketDomain: `shelfstate-v4-dev-static-${ACCOUNT}-us-west-2.s3.us-west-2.amazonaws.com` };
  let Resources = { Api: resource("AWS::ApiGatewayV2::Api", { Name: "shelfstate-v4-dev-health", ProtocolType: "HTTP" }) };
  if (phase === "api-children") Resources = { ...Resources,
    Integration: resource("AWS::ApiGatewayV2::Integration", { ApiId: ref("Api"), IntegrationType: "AWS_PROXY", IntegrationUri: bindings.healthFunctionArn }),
    Route: resource("AWS::ApiGatewayV2::Route", { ApiId: ref("Api"), RouteKey: "GET /health", Target: { "Fn::Join": ["/", ["integrations", ref("Integration")]] } }),
    DefaultStage: resource("AWS::ApiGatewayV2::Stage", { ApiId: ref("Api"), StageName: "$default", AutoDeploy: true }),
    InvokePermission: resource("AWS::Lambda::Permission", { Action: "lambda:InvokeFunction", FunctionName: bindings.healthFunctionArn, Principal: "apigateway.amazonaws.com",
      SourceArn: { "Fn::Join": ["", [`arn:aws:execute-api:us-west-2:${ACCOUNT}:`, ref("Api"), "/*/GET/health"]] } }),
  };
  if (phase === "certificate") Resources = { Certificate: resource("AWS::CertificateManager::Certificate", { DomainName: "dev.shelfstate.codecorax.com", ValidationMethod: "DNS", CertificateExport: "DISABLED" }) };
  if (phase === "edge") Resources = {
    Distribution: resource("AWS::CloudFront::Distribution", { DistributionConfig: { Aliases: ["dev.shelfstate.codecorax.com"], ViewerCertificate: { AcmCertificateArn: bindings.certificateArn },
      Origins: [{ Id: "static", DomainName: bindings.staticBucketDomain, OriginAccessControlId: ref("OriginAccessControl"), S3OriginConfig: { OriginAccessIdentity: "" } }],
      DefaultCacheBehavior: { TargetOriginId: "static", CachePolicyId: ref("CachePolicy"), OriginRequestPolicyId: ref("OriginRequestPolicy"), ResponseHeadersPolicyId: ref("ResponseHeadersPolicy") } } }),
    OriginAccessControl: resource("AWS::CloudFront::OriginAccessControl"), CachePolicy: resource("AWS::CloudFront::CachePolicy"),
    OriginRequestPolicy: resource("AWS::CloudFront::OriginRequestPolicy"), ResponseHeadersPolicy: resource("AWS::CloudFront::ResponseHeadersPolicy"),
    ...Object.fromEntries(["A", "AAAA"].map(Type => [`Alias${Type}`, resource("AWS::Route53::RecordSet", { Name: "dev.shelfstate.codecorax.com.", Type,
      HostedZoneId: bindings.zoneId, AliasTarget: { DNSName: { "Fn::GetAtt": ["Distribution", "DomainName"] }, HostedZoneId: "Z2FDTNDATAQYW2" } })])),
  };
  const approval = { schema: "shelfstate.wp007-initialization-review/v1", account: ACCOUNT, phase, region: t.region, stack: t.name,
    executionRole: t.executionRole, bindings, mode: "initialization", templateSha256: "", assemblySha256: "", parametersSha256: hashObject({}),
    assets: { fixtureAsset: { sha256: hash(Buffer.from("synthetic asset")), versionId: "synthetic-version" } }, changeSetSha256: "" };
  const name = `wp007-${"a".repeat(64)}`;
  const changeSet = { id: `arn:aws:cloudformation:${t.region}:${ACCOUNT}:changeSet/${name}/synthetic-id`, name,
    stackArn: t.stackArn.replace("*", "synthetic-stack-id"), executionRole: t.executionRole, templateSha256: "", parametersSha256: hashObject({}),
    status: "CREATE_COMPLETE", executionStatus: "AVAILABLE", changes: Object.entries(Resources).filter(([k]) => !(phase === "api-children" && k === "Api"))
      .map(([logicalId, r]) => ({ logicalId, type: r.Type, action: "Add", replacement: "False" })), physicalResources: phase === "api-children" ? { Api: IDS.apiId } : {} };
  const bundle = { templateBytes: Buffer.from(JSON.stringify({ Resources })), assemblyBytes: null, parameters: {},
    assets: { fixtureAsset: { bytes: Buffer.from("synthetic asset"), versionId: "synthetic-version" } }, changeSet, executeChangeSetId: changeSet.id };
  return repin({ approval, bundle });
}
// Test helper simulates an independently changed review pin, to ensure semantic
// constraints still reject bad proposals rather than testing only hash mismatch.
export function repin(f) {
  f.approval.templateSha256 = hash(f.bundle.templateBytes);
  f.bundle.assemblyBytes = Buffer.from(JSON.stringify({ stack: f.approval.stack, account: f.approval.account, region: f.approval.region,
    executionRole: f.approval.executionRole, templateSha256: f.approval.templateSha256 }));
  f.approval.assemblySha256 = hash(f.bundle.assemblyBytes);
  f.bundle.changeSet.templateSha256 = f.approval.templateSha256;
  f.approval.changeSetSha256 = hashObject(f.bundle.changeSet);
  f.pin = hashObject(f.approval); return f;
}
export function mutateTemplate(f, change) { const t = JSON.parse(f.bundle.templateBytes); change(t); f.bundle.templateBytes = Buffer.from(JSON.stringify(t)); return repin(f); }
