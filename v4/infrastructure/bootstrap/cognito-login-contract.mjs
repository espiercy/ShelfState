import assert from "node:assert/strict";
import { DEV_COGNITO_LOGIN } from "../../contracts/cognito-login.mjs";
import { digest } from "../../scripts/release/schema.mjs";
import { resolveEnvironmentConfig } from "../lib/environment.mjs";
import { requiredTags, resourceName } from "../lib/naming.mjs";

export const COGNITO_LOGIN_REVIEW_SCHEMA = "shelfstate.wp009-cognito-login-review/v1";
export const COGNITO_LOGIN_PREPARATION_SCHEMA = "shelfstate.wp009-cognito-login-prepare/v1";

export const COGNITO_LOGIN_TYPES = Object.freeze({
  UserPool: "AWS::Cognito::UserPool",
  AppClient: "AWS::Cognito::UserPoolClient",
  LoginDomain: "AWS::Cognito::UserPoolDomain",
  LoginBranding: "AWS::Cognito::ManagedLoginBranding",
});

export const cognitoLoginConfig = account => resolveEnvironmentConfig("dev", { SHELFSTATE_DEV_AWS_ACCOUNT_ID: account });
export const cognitoLoginDomainPrefix = account => resourceName(cognitoLoginConfig(account), `auth-${account}`);

export function cognitoLoginChangeSetName(templateSha256) {
  digest(templateSha256);
  return `wp009-${templateSha256}`;
}

export function assertCognitoLoginPhysicalArn(value, prefix) {
  assert.ok(typeof value === "string" && value.startsWith(prefix), "Unexpected WP-009 physical ARN scope");
  assert.match(value.slice(prefix.length), /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/, "Exact WP-009 physical ARN required");
}

export const cognitoLoginPoolArnPrefix = account => `arn:aws:cognito-idp:us-west-2:${account}:userpool/us-west-2_`;

export function assertCognitoLoginPoolArn(account, poolArn) {
  const prefix = cognitoLoginPoolArnPrefix(account);
  assert.match(poolArn ?? "", new RegExp(`^${prefix}[A-Za-z0-9]{1,45}$`), "Exact west Cognito user-pool ARN required");
}

export function assertDevCognitoLoginTemplate(template, config) {
  assert.equal(config.environmentName, "dev");
  assert.equal(config.primaryRegion, "us-west-2");
  assert.match(config.accountId ?? "", /^\d{12}$/);
  assert.deepEqual(Object.keys(template).sort(), ["Description", "Metadata", "Parameters", "Resources", "Rules"]);
  assert.equal(template.Description, "ShelfState V4 dev Cognito login (WP-009 local inspection)");
  assert.deepEqual(template.Metadata, { ShelfState: {
    Capability: "cognito-login", Environment: "dev", Region: "us-west-2",
    WorkPackage: "WP-009", ImplementationPhase: "cognito-login",
  } });
  assert.deepEqual(template.Parameters, { BootstrapVersion: {
    Type: "AWS::SSM::Parameter::Value<String>",
    Default: "/cdk-bootstrap/hnb659fds/version",
    Description: "Version of the CDK Bootstrap resources in this environment, automatically retrieved from SSM Parameter Store. [cdk:skip]",
  } });
  assert.deepEqual(template.Rules, { CheckBootstrapVersion: { Assertions: [{
    Assert: { "Fn::Not": [{ "Fn::Contains": [["1", "2", "3", "4", "5"], { Ref: "BootstrapVersion" }] }] },
    AssertDescription: "CDK bootstrap stack version 6 required. Please run 'cdk bootstrap' with a recent version of the CDK CLI.",
  }] } });

  const pool = { Ref: "UserPool" };
  const expected = {
    UserPool: {
      Type: COGNITO_LOGIN_TYPES.UserPool,
      DeletionPolicy: "Retain",
      UpdateReplacePolicy: "Retain",
      Metadata: { ShelfStateStatefulPolicy: "retained" },
      Properties: {
        UserPoolName: resourceName(config, "cognito-login"),
        UserPoolTier: "PLUS",
        DeletionProtection: "ACTIVE",
        AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
        AccountRecoverySetting: { RecoveryMechanisms: [{ Name: "admin_only", Priority: 1 }] },
        EmailConfiguration: { EmailSendingAccount: "COGNITO_DEFAULT" },
        AutoVerifiedAttributes: ["email"],
        UsernameAttributes: ["email"],
        UsernameConfiguration: { CaseSensitive: false },
        Policies: { SignInPolicy: { AllowedFirstAuthFactors: ["PASSWORD"] } },
        UserPoolAddOns: { AdvancedSecurityMode: "AUDIT" },
        UserPoolTags: { ...requiredTags(config), WorkPackage: "WP-009" },
      },
    },
    AppClient: {
      Type: COGNITO_LOGIN_TYPES.AppClient,
      Properties: {
        UserPoolId: pool,
        ClientName: resourceName(config, "cognito-bff"),
        GenerateSecret: false,
        AllowedOAuthFlowsUserPoolClient: true,
        AllowedOAuthFlows: ["code"],
        AllowedOAuthScopes: [...DEV_COGNITO_LOGIN.scopes],
        CallbackURLs: [DEV_COGNITO_LOGIN.callbackUrl],
        LogoutURLs: [DEV_COGNITO_LOGIN.logoutUrl],
        SupportedIdentityProviders: ["COGNITO"],
        PreventUserExistenceErrors: "ENABLED",
        EnableTokenRevocation: true,
        ReadAttributes: ["email", "email_verified"],
        WriteAttributes: ["email"],
        ExplicitAuthFlows: ["ALLOW_REFRESH_TOKEN_AUTH"],
      },
    },
    LoginDomain: {
      Type: COGNITO_LOGIN_TYPES.LoginDomain,
      Properties: { UserPoolId: pool, Domain: resourceName(config, `auth-${config.accountId}`), ManagedLoginVersion: 2 },
    },
    LoginBranding: {
      Type: COGNITO_LOGIN_TYPES.LoginBranding,
      Properties: { UserPoolId: pool, ClientId: { Ref: "AppClient" }, UseCognitoProvidedValues: true },
      DependsOn: ["LoginDomain"],
    },
  };
  for (const [logicalId, resource] of Object.entries(expected)) {
    if (Object.hasOwn(template.Resources?.[logicalId]?.Metadata ?? {}, "aws:cdk:path")) {
      resource.Metadata = { ...resource.Metadata, "aws:cdk:path": `ShelfStateV4DevCognitoLogin/${logicalId}` };
    }
  }
  assert.deepEqual(template.Resources, expected, "Cognito login resources differ from the exact WP-009 contract");
}
