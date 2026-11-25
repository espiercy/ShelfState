import assert from "node:assert/strict";
import { DEV_COGNITO_LOGIN } from "../../contracts/cognito-login.mjs";
import { requiredTags, resourceName } from "../lib/naming.mjs";

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
      Type: "AWS::Cognito::UserPool",
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
      Type: "AWS::Cognito::UserPoolClient",
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
      Type: "AWS::Cognito::UserPoolDomain",
      Properties: { UserPoolId: pool, Domain: resourceName(config, `auth-${config.accountId}`), ManagedLoginVersion: 2 },
    },
    LoginBranding: {
      Type: "AWS::Cognito::ManagedLoginBranding",
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
