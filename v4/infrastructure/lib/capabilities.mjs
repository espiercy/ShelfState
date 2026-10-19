// Pure topology data: release guards must not load the CDK runtime.
export const CAPABILITY_DEFINITIONS = Object.freeze([
  Object.freeze({ key: "edge-certificate", label: "CloudFront certificate boundary", regionSource: "edgeCertificateRegion" }),
  Object.freeze({ dependsOn: Object.freeze(["edge-certificate"]), key: "edge-delivery", label: "Edge and static-delivery boundary", regionSource: "primaryRegion" }),
  Object.freeze({ key: "identity-session", label: "Identity and session boundary", regionSource: "primaryRegion" }),
  Object.freeze({ key: "library-api", label: "Library and API boundary", regionSource: "primaryRegion" }),
  Object.freeze({ key: "operations-lifecycle", label: "Operations and account-lifecycle boundary", regionSource: "primaryRegion" }),
  Object.freeze({ key: "recovery-observability", label: "Recovery and observability boundary", regionSource: "primaryRegion" }),
]);
