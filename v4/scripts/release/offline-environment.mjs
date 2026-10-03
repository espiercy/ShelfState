// Credential isolation, NOT a network sandbox. CDK must also use --no-lookups.
export function credentialFreeEnvironment(source = process.env) {
  const env = Object.fromEntries(Object.entries(source).filter(([k]) => !/^(AWS_|CDK_|SHELFSTATE_.*AWS_|SHELFSTATE_DEPLOY_|GH_TOKEN$|GITHUB_TOKEN$|GITHUB_(?:ENV|OUTPUT|PATH|STATE|STEP_SUMMARY)$|ACTIONS_|NODE_OPTIONS$)/i.test(k)));
  Object.assign(env, { AWS_EC2_METADATA_DISABLED: "true", AWS_CONFIG_FILE: process.platform === "win32" ? "NUL" : "/dev/null",
    AWS_SHARED_CREDENTIALS_FILE: process.platform === "win32" ? "NUL" : "/dev/null", AWS_SDK_LOAD_CONFIG: "0",
    CDK_DISABLE_VERSION_CHECK: "1", CDK_NOTICES: "false" });
  // Null-device paths cannot load the user's profiles, credential_process or SSO
  // session configuration. AWS_* filtering includes web identity/container URIs.
  return env;
}
