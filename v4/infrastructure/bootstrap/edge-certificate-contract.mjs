// Independent positive contract for the pinned CDK's actual certificate phase.
// Constructs do not generate their templates from this validator.
import assert from "node:assert/strict";
import { equal, object } from "../../scripts/release/schema.mjs";
import { target } from "./initialization.mjs";

export const EDGE_CERTIFICATE_REVIEW_SCHEMA = "shelfstate.wp007-edge-certificate-review/v1";
export function edgeCertificateTypes(phase) {
  assert.equal(phase, "certificate", "Unsupported edge-certificate phase");
  return { Certificate: "AWS::CertificateManager::Certificate" };
}

export function assertEdgeCertificateTemplate(template, account, phase) {
  const types = edgeCertificateTypes(phase);
  const t = target(account, phase);
  object(template, ["Description", "Metadata", "Resources", "Outputs", "Parameters", "Rules"], "Exact certificate template envelope");
  assert.equal(template.Description, "ShelfState V4 dev edge-certificate (WP-007 local preparation)");
  equal(template.Metadata, { ShelfState: { Capability: "edge-certificate", Environment: "dev", Region: t.region,
    WorkPackage: "WP-007", InitializationPhase: "certificate" } }, "Exact certificate topology metadata");
  equal(template.Parameters, { BootstrapVersion: { Type: "AWS::SSM::Parameter::Value<String>",
    Default: "/cdk-bootstrap/hnb659fds/version",
    Description: "Version of the CDK Bootstrap resources in this environment, automatically retrieved from SSM Parameter Store. [cdk:skip]" } }, "Exact bootstrap parameter");
  equal(template.Rules, { CheckBootstrapVersion: { Assertions: [{
    Assert: { "Fn::Not": [{ "Fn::Contains": [["1", "2", "3", "4", "5"], { Ref: "BootstrapVersion" }] }] },
    AssertDescription: "CDK bootstrap stack version 6 required. Please run 'cdk bootstrap' with a recent version of the CDK CLI.",
  }] } }, "Exact bootstrap rule");
  object(template.Resources, Object.keys(types), "Exact certificate inventory");
  equal(template.Resources.Certificate, {
    Type: types.Certificate,
    Properties: {
      DomainName: "dev.shelfstate.codecorax.com", ValidationMethod: "DNS", CertificateExport: "DISABLED",
      Tags: [{ Key: "Environment", Value: "dev" }, { Key: "ManagedBy", Value: "AWS-CDK" }, { Key: "Project", Value: "ShelfState" }],
    },
    Metadata: { ShelfStateStatefulPolicy: "destroy-approved" },
  }, "Certificate: unsupported edge-certificate semantic representation");
  // Ref is the certificate ARN; no Export, import, custom-resource bridge or
  // assumed pending-validation status/output availability is accepted.
  equal(template.Outputs, { CertificateArn: { Value: { Ref: "Certificate" } } }, "Exact certificate ARN handoff output");
}
