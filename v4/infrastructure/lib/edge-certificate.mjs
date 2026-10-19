import assert from "node:assert/strict";
import { CfnOutput } from "aws-cdk-lib";
import { CfnCertificate } from "aws-cdk-lib/aws-certificatemanager";
import { target } from "../bootstrap/initialization.mjs";

// Native certificate only. Deliberately no hosted-zone lookup, validation
// option, DNS record, custom resource or cross-region reference.
export function addEdgeCertificate(stack, config) {
  assert.equal(config.environmentName, "dev", "WP-007 certificate is dev-only");
  const binding = target(config.accountId, "certificate");
  assert.equal(stack.stackName, binding.name);
  assert.equal(stack.region, binding.region);
  const certificate = new CfnCertificate(stack, "Certificate", {
    domainName: "dev.shelfstate.codecorax.com",
    validationMethod: "DNS",
    certificateExport: "DISABLED",
  });
  certificate.overrideLogicalId("Certificate");
  // Dev rollback/delete is already part of bounded initialization. This metadata
  // satisfies the existing stateful guard; it is not live deletion authority.
  certificate.cfnOptions.metadata = { ShelfStateStatefulPolicy: "destroy-approved" };
  const output = new CfnOutput(stack, "CertificateArn", { value: certificate.ref });
  output.overrideLogicalId("CertificateArn");
  // No exportName and no consuming stack token. Pending-stack output/physical-ID
  // availability is NOT guaranteed; authentic readback is a later live gate.
}
