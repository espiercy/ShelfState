import { runtimeTarget } from "./approved-targets.mjs";
import { assert, canonical, environment, hash, object, parseEvidenceJson, REPOSITORY } from "./schema.mjs";

const AUDIENCE = "sts.amazonaws.com";
const REGION = "us-west-2";
const STS_ENDPOINT = `https://sts.${REGION}.amazonaws.com/`;
const MAX_RESPONSE_BYTES = 64 * 1024;

function fail(message) { throw new Error(message); }
function oppositeEnvironment(value) { environment(value); return value === "dev" ? "production" : "dev"; }
function oppositeRoleName(value) { return value === "dev" ? "ShelfStateV4DevDeploy" : "ShelfStateV4ProdDeploy"; }

export function oppositeRuntimeTarget(sourceEnvironment, account) {
  const targetEnvironment = oppositeEnvironment(sourceEnvironment), roleName = oppositeRoleName(targetEnvironment);
  return runtimeTarget(targetEnvironment, account, `arn:aws:iam::${account}:role/${roleName}`);
}

async function responseBytes(response, label) {
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^[0-9]+$/.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) fail(`${label} response size rejected`);
  let bytes;
  try { bytes = new Uint8Array(await response.arrayBuffer()); } catch { fail(`${label} response read failed`); }
  if (bytes.byteLength > MAX_RESPONSE_BYTES) fail(`${label} response size rejected`);
  return bytes;
}

async function transport(fetchImpl, url, options, label) {
  try { return await fetchImpl(url, options); }
  catch { fail(`${label} request failed`); }
}

function jwtJson(segment, label) {
  try { return parseEvidenceJson(Buffer.from(segment, "base64url")); }
  catch { fail(`Invalid OIDC token ${label}`); }
}

function validateToken(token, context, nowSeconds) {
  assert.equal(typeof token, "string", "OIDC token missing");
  assert.ok(token.length >= 64 && token.length <= 20000 && !/[\s\0]/.test(token), "Invalid OIDC token shape");
  const parts = token.split("."); assert.equal(parts.length, 3, "Invalid OIDC token shape");
  assert.ok(parts.every(part => /^[A-Za-z0-9_-]+$/.test(part)), "Invalid OIDC token shape");
  const header = jwtJson(parts[0], "header"), claims = jwtJson(parts[1], "claims");
  assert.ok(header && typeof header === "object" && header.alg === "RS256" && header.typ === "JWT" && typeof header.kid === "string" && header.kid.length > 0,
    "Invalid OIDC token header");
  const expectedEnvironment = context.environment, expectedWorkflow = `.github/workflows/v4-${expectedEnvironment === "dev" ? "dev" : "production"}-release.yml`;
  assert.ok(claims.iss === "https://token.actions.githubusercontent.com", "Unexpected OIDC issuer");
  assert.ok(claims.aud === AUDIENCE, "Unexpected OIDC audience");
  assert.ok(claims.sub === `repo:${REPOSITORY}:environment:${expectedEnvironment}`, "Unexpected OIDC subject");
  assert.ok(claims.repository === REPOSITORY && claims.environment === expectedEnvironment, "Unexpected OIDC repository/environment");
  assert.ok(claims.ref === "refs/heads/main" && claims.ref_type === "branch" && claims.event_name === "workflow_dispatch", "Unexpected OIDC workflow context");
  assert.ok(claims.workflow_ref === `${REPOSITORY}/${expectedWorkflow}@refs/heads/main` && claims.workflow_sha === context.controllerSha && claims.sha === context.controllerSha,
    "Unexpected OIDC workflow revision");
  assert.ok(claims.run_id === context.runId && claims.run_attempt === String(context.runAttempt), "Unexpected OIDC run binding");
  assert.ok(Number.isSafeInteger(claims.iat) && Number.isSafeInteger(claims.nbf) && Number.isSafeInteger(claims.exp), "Invalid OIDC token time claims");
  assert.ok(claims.iat <= nowSeconds + 30 && claims.nbf <= nowSeconds + 30 && claims.exp > nowSeconds && claims.exp - claims.iat <= 600,
    "Invalid or expired OIDC token lifetime");
  return token;
}

export async function requestEnvironmentToken(context, environmentVariables, fetchImpl = fetch, now = Date.now) {
  const requestUrl = environmentVariables.ACTIONS_ID_TOKEN_REQUEST_URL, requestToken = environmentVariables.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  assert.ok(typeof requestUrl === "string" && typeof requestToken === "string" && requestToken.length > 0, "GitHub OIDC runtime unavailable");
  let url;
  try { url = new URL(requestUrl); } catch { fail("Invalid GitHub OIDC request URL"); }
  assert.equal(url.protocol, "https:", "GitHub OIDC request must use HTTPS");
  url.searchParams.set("audience", AUDIENCE);
  const response = await transport(fetchImpl, url, { method: "GET", headers: { Authorization: `Bearer ${requestToken}`, Accept: "application/json" },
    redirect: "error", cache: "no-store", credentials: "omit", signal: AbortSignal.timeout(30000) }, "GitHub OIDC");
  assert.equal(response.status, 200, "GitHub OIDC request rejected");
  assert.match(response.headers.get("content-type") ?? "", /^application\/json(?:;|$)/i, "Unexpected GitHub OIDC response type");
  let body;
  try { body = parseEvidenceJson(await responseBytes(response, "GitHub OIDC")); } catch { fail("Invalid GitHub OIDC response"); }
  object(body, ["value"], "GitHub OIDC response");
  return validateToken(body.value, context, Math.floor(now() / 1000));
}

function xmlValue(source, name) {
  const matches = [...source.matchAll(new RegExp(`<${name}>([^<]+)</${name}>`, "g"))];
  return matches.length === 1 ? matches[0][1] : undefined;
}

export function classifyAccessDenied(response, bytes) {
  assert.equal(response.url, STS_ENDPOINT, "Unexpected STS response endpoint");
  assert.equal(response.redirected, false, "STS redirects are unsupported");
  assert.equal(response.status, 403, "Cross-environment STS request did not return the required denial status");
  assert.match(response.headers.get("content-type") ?? "", /^(?:text|application)\/xml(?:;|$)/i, "Unexpected STS denial response type");
  let source;
  try { source = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { fail("Invalid STS denial encoding"); }
  assert.ok(source.length > 0 && !source.includes("<Credentials>"), "Unexpected STS response body");
  assert.equal(xmlValue(source, "Code"), "AccessDenied", "Cross-environment STS response was not AccessDenied");
  assert.equal(xmlValue(source, "Type"), "Sender", "Unexpected STS denial type");
  const requestId = xmlValue(source, "RequestId"), headerId = response.headers.get("x-amzn-requestid");
  assert.match(requestId ?? "", /^[A-Za-z0-9-]{16,128}$/, "STS denial request ID missing");
  assert.equal(headerId, requestId, "STS denial request identity mismatch");
  return requestId;
}

export async function proveCrossEnvironmentDenial(context, runtime, environmentVariables, fetchImpl = fetch, now = Date.now) {
  assert.equal(runtime.environment, context.environment, "Runtime/context environment mismatch");
  const opposite = oppositeRuntimeTarget(context.environment, runtime.account); // validate the fixed opposite target before requesting a token
  const token = await requestEnvironmentToken(context, environmentVariables, fetchImpl, now);
  const form = new URLSearchParams({ Action: "AssumeRoleWithWebIdentity", Version: "2011-06-15", RoleArn: opposite.roleArn,
    RoleSessionName: `ss-deny-${context.runId}-${context.runAttempt}`, WebIdentityToken: token, DurationSeconds: "900" });
  const response = await transport(fetchImpl, STS_ENDPOINT, { method: "POST", headers: { Accept: "application/xml", "Content-Type": "application/x-www-form-urlencoded" },
    body: form, redirect: "error", cache: "no-store", credentials: "omit", signal: AbortSignal.timeout(30000) }, "Cross-environment STS");
  if (response.status >= 200 && response.status < 300) {
    try { await response.body?.cancel(); } catch { /* discard without inspecting possible credentials */ }
    fail("Cross-environment STS assumption unexpectedly succeeded");
  }
  const requestId = classifyAccessDenied(response, await responseBytes(response, "Cross-environment STS"));
  const proof = { schema: "shelfstate.cross-environment-denial/v1", repository: REPOSITORY, sourceEnvironment: context.environment,
    targetEnvironment: opposite.environment, audience: AUDIENCE, region: REGION, runId: context.runId, runAttempt: context.runAttempt,
    result: "AccessDenied", requestIdDigest: hash(requestId) };
  // Canonicalization also proves the retained summary has no token/credential-shaped object.
  return JSON.parse(canonical(proof));
}
