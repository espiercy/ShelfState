// Development OIDC contract for the server-side authorization flow.
export const DEV_COGNITO_LOGIN = Object.freeze({
  callbackUrl: "https://dev.shelfstate.codecorax.com/api/v1/auth/callback",
  logoutUrl: "https://dev.shelfstate.codecorax.com/",
  scopes: Object.freeze(["openid", "email"]),
  codeChallengeMethod: "S256",
});
