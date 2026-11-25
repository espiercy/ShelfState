import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempDisposable } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { App } from "aws-cdk-lib";
import { DEV_COGNITO_LOGIN } from "../contracts/cognito-login.mjs";
import { assertDevCognitoLoginTemplate } from "../infrastructure/bootstrap/cognito-login-contract.mjs";
import { target } from "../infrastructure/bootstrap/initialization.mjs";
import { devStackNames } from "../infrastructure/bootstrap/model.mjs";
import { resolveEnvironmentConfig } from "../infrastructure/lib/environment.mjs";
import { validateDevCognitoLoginAssembly, validateFoundationAssembly } from "../infrastructure/lib/template-guards.mjs";
import { createEnvironmentTopology } from "../infrastructure/lib/topology.mjs";
import { assessTransition, readAssembly } from "../scripts/release/assemblies.mjs";
import { credentialFreeEnvironment } from "../scripts/release/offline-environment.mjs";

const account = "123456789012";
const config = resolveEnvironmentConfig("dev", { SHELFSTATE_DEV_AWS_ACCOUNT_ID: account });
const phase = { implementationPhase: "cognito-login" };
const name = "shelfstate-v4-dev-cognito-login";

async function synth(options, check) {
  await using outdir = await mkdtempDisposable(path.join(os.tmpdir(), "shelfstate-cognito-"));
  const app = new App({ outdir: outdir.path, analyticsReporting: false });
  createEnvironmentTopology(app, config, options);
  return await check(app.synth(), outdir.path);
}

test("Cognito login uses the exact approved development callback and logout contract", () => {
  assert.deepEqual(DEV_COGNITO_LOGIN, {
    callbackUrl: "https://dev.shelfstate.codecorax.com/api/v1/auth/callback",
    logoutUrl: "https://dev.shelfstate.codecorax.com/",
    scopes: ["openid", "email"],
    codeChallengeMethod: "S256",
  });
});

test("WP-009 emits only four isolated Cognito resources and leaves the six original templates intact", async () => {
  const original = await synth({}, assembly => assembly.stacks.map(artifact => [artifact.stackName, artifact.template]));
  await synth(phase, async (assembly, outdir) => {
    validateDevCognitoLoginAssembly(assembly, config);
    const stack = assembly.stacks.find(s => s.stackName === name);
    assert.deepEqual(assembly.stacks.filter(s => s !== stack).map(s => [s.stackName, s.template]), original);
    const { UserPool, AppClient, LoginDomain, LoginBranding } = stack.template.Resources;
    assert.equal(UserPool.Properties.UserPoolTier, "PLUS");
    assert.equal(UserPool.Properties.UserPoolAddOns.AdvancedSecurityMode, "AUDIT");
    assert.equal(UserPool.Properties.AdminCreateUserConfig.AllowAdminCreateUserOnly, true);
    assert.equal(UserPool.Properties.DeletionProtection, "ACTIVE");
    assert.equal(UserPool.DeletionPolicy, "Retain");
    assert.equal(UserPool.UpdateReplacePolicy, "Retain");
    assert.equal(AppClient.Properties.GenerateSecret, false);
    assert.deepEqual(AppClient.Properties.AllowedOAuthFlows, ["code"]);
    assert.deepEqual(AppClient.Properties.CallbackURLs, [DEV_COGNITO_LOGIN.callbackUrl]);
    assert.deepEqual(AppClient.Properties.LogoutURLs, [DEV_COGNITO_LOGIN.logoutUrl]);
    assert.equal(LoginDomain.Properties.ManagedLoginVersion, 2);
    assert.equal(LoginBranding.Properties.UseCognitoProvidedValues, true);
    assert.equal(stack.template.Outputs, undefined);
    assert.throws(() => validateFoundationAssembly(assembly, config), /Expected 6 capability stacks/);
    const snapshot = await readAssembly(outdir, "dev");
    assert.equal(assessTransition(snapshot, snapshot).allowed, false);
  });
});

test("the CloudFormation contract rejects redirect, authentication, and lifecycle drift", async () => {
  await synth(phase, assembly => {
    const original = assembly.stacks.find(s => s.stackName === name).template;
    for (const [label, change] of [
      ["alternative origins", r => r.AppClient.Properties.CallbackURLs.push("https://localhost/callback")],
      ["wildcard logout", r => r.AppClient.Properties.LogoutURLs.push("https://dev.shelfstate.codecorax.com/*")],
      ["alternate default redirect", r => { r.AppClient.Properties.DefaultRedirectURI = "https://other.example/"; }],
      ["secret", r => { r.AppClient.Properties.GenerateSecret = true; }],
      ["implicit OAuth", r => r.AppClient.Properties.AllowedOAuthFlows.push("implicit")],
      ["client credentials", r => r.AppClient.Properties.AllowedOAuthFlows.push("client_credentials")],
      ["direct password API", r => r.AppClient.Properties.ExplicitAuthFlows.push("ALLOW_USER_PASSWORD_AUTH")],
      ["extra API scope", r => r.AppClient.Properties.AllowedOAuthScopes.push("aws.cognito.signin.user.admin")],
      ["external provider", r => r.AppClient.Properties.SupportedIdentityProviders.push("Google")],
      ["enumeration", r => { r.AppClient.Properties.PreventUserExistenceErrors = "LEGACY"; }],
      ["self-signup", r => { r.UserPool.Properties.AdminCreateUserConfig.AllowAdminCreateUserOnly = false; }],
      ["public recovery", r => { r.UserPool.Properties.AccountRecoverySetting.RecoveryMechanisms[0].Name = "verified_email"; }],
      ["DCR", r => { r.UserPool.Properties.DcrConfiguration = {}; }],
      ["missing WP-009 ownership tag", r => { delete r.UserPool.Properties.UserPoolTags.WorkPackage; }],
      ["SMS configuration", r => { r.UserPool.Properties.SmsConfiguration = {}; }],
      ["trigger", r => { r.UserPool.Properties.LambdaConfig = {}; }],
      ["risk enforcement", r => { r.UserPool.Properties.UserPoolAddOns.AdvancedSecurityMode = "ENFORCED"; }],
      ["pool deletion", r => { r.UserPool.DeletionPolicy = "Delete"; }],
      ["client without a style", r => { delete r.LoginBranding; }],
      ["branding another client", r => { r.LoginBranding.Properties.ClientId = "another-client"; }],
      ["classic UI", r => { r.LoginDomain.Properties.ManagedLoginVersion = 1; }],
      ["identity pool", r => { r.IdentityPool = { Type: "AWS::Cognito::IdentityPool" }; }],
    ]) {
      const candidate = structuredClone(original);
      change(candidate.Resources);
      assert.throws(() => assertDevCognitoLoginTemplate(candidate, config), { message: /exact WP-009 contract/ }, label);
    }
    assert.throws(() => assertDevCognitoLoginTemplate({ ...original, Outputs: { Secret: { Value: "example" } } }, config));
  });
});

test("Cognito requires dev, an explicit account, and an isolated selector without deployment authority", () => {
  const app = new App();
  assert.throws(() => createEnvironmentTopology(app, resolveEnvironmentConfig("dev"), phase), /Explicit local account binding/);
  assert.throws(() => createEnvironmentTopology(app, resolveEnvironmentConfig("prod"), phase), /dev-only/);
  assert.throws(() => createEnvironmentTopology(app, config, { ...phase, initializationPhase: "api-children" }), /cannot be combined/);
  assert.throws(() => createEnvironmentTopology(app, config, { ...phase, initializationBindings: {} }), /external bindings/);
  assert.ok(!devStackNames("us-west-2").includes(name));
  assert.throws(() => target(account, phase.implementationPhase), /Unknown initialization phase/);
});

test("the credential-free CDK app entry selects the guarded local WP-009 output", async () => {
  await using outdir = await mkdtempDisposable(path.join(os.tmpdir(), "shelfstate-cognito-entry-"));
  const env = {
    ...credentialFreeEnvironment(), SHELFSTATE_DEV_AWS_ACCOUNT_ID: account, CDK_OUTDIR: outdir.path,
    CDK_CONTEXT_JSON: JSON.stringify({ shelfstateEnvironment: "dev", shelfstateImplementationPhase: "cognito-login",
      "aws:cdk:version-reporting": false, "aws:cdk:enable-path-metadata": true }),
  };
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("../infrastructure/bin/app.mjs", import.meta.url))],
    { env, encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  const snapshot = await readAssembly(outdir.path, "dev");
  assert.equal(snapshot.stacks.length, 7);
  assertDevCognitoLoginTemplate(snapshot.stacks.find(stack => stack.name === name).template, config);
});
