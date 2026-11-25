import { RemovalPolicy } from "aws-cdk-lib";
import {
  CfnManagedLoginBranding,
  CfnUserPool,
  CfnUserPoolClient,
  CfnUserPoolDomain,
} from "aws-cdk-lib/aws-cognito";
import { DEV_COGNITO_LOGIN } from "../../contracts/cognito-login.mjs";
import { resourceName } from "./naming.mjs";

export function addDevCognitoLogin(stack, config) {
  const pool = new CfnUserPool(stack, "UserPool", {
    userPoolName: resourceName(config, "cognito-login"),
    userPoolTags: { WorkPackage: "WP-009" },
    userPoolTier: "PLUS",
    deletionProtection: "ACTIVE",
    adminCreateUserConfig: { allowAdminCreateUserOnly: true },
    accountRecoverySetting: { recoveryMechanisms: [{ name: "admin_only", priority: 1 }] },
    emailConfiguration: { emailSendingAccount: "COGNITO_DEFAULT" },
    usernameAttributes: ["email"],
    usernameConfiguration: { caseSensitive: false },
    autoVerifiedAttributes: ["email"],
    userPoolAddOns: { advancedSecurityMode: "AUDIT" },
    policies: { signInPolicy: { allowedFirstAuthFactors: ["PASSWORD"] } },
  });
  pool.applyRemovalPolicy(RemovalPolicy.RETAIN);
  pool.addMetadata("ShelfStateStatefulPolicy", "retained");

  const client = new CfnUserPoolClient(stack, "AppClient", {
    userPoolId: pool.ref,
    clientName: resourceName(config, "cognito-bff"),
    generateSecret: false,
    allowedOAuthFlowsUserPoolClient: true,
    allowedOAuthFlows: ["code"],
    allowedOAuthScopes: [...DEV_COGNITO_LOGIN.scopes],
    callbackUrLs: [DEV_COGNITO_LOGIN.callbackUrl],
    logoutUrLs: [DEV_COGNITO_LOGIN.logoutUrl],
    supportedIdentityProviders: ["COGNITO"],
    preventUserExistenceErrors: "ENABLED",
    enableTokenRevocation: true,
    readAttributes: ["email", "email_verified"],
    writeAttributes: ["email"],
    // Supplying only refresh avoids Cognito's default SRP and custom auth flows.
    // WP-012 must remove this flow before turning on refresh-token rotation.
    explicitAuthFlows: ["ALLOW_REFRESH_TOKEN_AUTH"],
  });
  const domain = new CfnUserPoolDomain(stack, "LoginDomain", {
    userPoolId: pool.ref,
    domain: resourceName(config, `auth-${config.accountId}`),
    managedLoginVersion: 2,
  });
  const branding = new CfnManagedLoginBranding(stack, "LoginBranding", {
    userPoolId: pool.ref,
    clientId: client.ref,
    useCognitoProvidedValues: true,
  });
  branding.addResourceDependency(domain);
}
