// Pure WP-008 infrastructure contract data. Release/evidence validation may
// inspect this module without loading CDK or any external dependency.
export const IDENTITY_ACCOUNT_TABLE_PURPOSE = "identity-account";
export const SESSION_AUTH_TABLE_PURPOSE = "session-auth";
export const CLEANUP_TTL_ATTRIBUTE = "cleanupAfterEpochSeconds";

export const FAMILY_POLICY_DEFINITIONS = Object.freeze([
  Object.freeze({
    actions: Object.freeze(["dynamodb:GetItem", "dynamodb:PutItem"]),
    family: "identity-map",
    keyPrefix: "IDENTITY#",
    logicalId: "IdentityMapPolicy",
    table: "identityAccount",
  }),
  Object.freeze({
    actions: Object.freeze([
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
    ]),
    family: "account",
    keyPrefix: "ACCOUNT#",
    logicalId: "AccountPolicy",
    table: "identityAccount",
  }),
  Object.freeze({
    actions: Object.freeze([
      "dynamodb:DeleteItem",
      "dynamodb:GetItem",
      "dynamodb:PutItem",
    ]),
    family: "session",
    keyPrefix: "SESSION#",
    logicalId: "SessionPolicy",
    table: "sessionAuth",
  }),
  Object.freeze({
    actions: Object.freeze([
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
    ]),
    family: "auth-transaction",
    keyPrefix: "AUTH_TRANSACTION#",
    logicalId: "AuthTransactionPolicy",
    table: "sessionAuth",
  }),
]);
