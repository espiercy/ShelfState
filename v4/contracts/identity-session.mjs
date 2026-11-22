import { createHash, randomBytes } from "node:crypto";

export const PERSISTENCE_CONTRACT_VERSION = 1;

export const ITEM_TYPES = Object.freeze({
  ACCOUNT: "Account",
  AUTH_TRANSACTION: "AuthTransaction",
  IDENTITY_MAP: "IdentityMap",
  SESSION: "Session",
});

export const ACCOUNT_STATUSES = Object.freeze([
  "ACTIVE",
  "DISABLED",
  "PENDING_DELETION",
]);

export const ACCOUNT_ROLES = Object.freeze(["USER", "ADMIN"]);

const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const HEX_SHA256_PATTERN = /^[a-f0-9]{64}$/;
const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function fail(message) {
  throw new TypeError(message);
}

function assertExactKeys(value, required, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("Persistence item must be a plain object.");
  }
  const allowed = new Set([...required, ...optional]);
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(`Missing required persistence field: ${key}.`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`Unexpected persistence field: ${key}.`);
  }
}

function assertString(value, label, minimum = 1, maximum = 512) {
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    value.length > maximum
  ) {
    fail(`${label} must be a string between ${minimum} and ${maximum} characters.`);
  }
  return value;
}

function assertIsoTimestamp(value, label) {
  assertString(value, label, 24, 24);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    fail(`${label} must be a canonical UTC timestamp with millisecond precision.`);
  }
  return value;
}

function assertNonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(`${label} must be a non-negative safe integer.`);
  }
  return value;
}

function assertDigest(value, label) {
  if (typeof value !== "string" || !HEX_SHA256_PATTERN.test(value)) {
    fail(`${label} must be a lowercase SHA-256 digest.`);
  }
  return value;
}

function assertUserId(value) {
  if (typeof value !== "string" || !USER_ID_PATTERN.test(value)) {
    fail("userId must be a lowercase UUID v4 value.");
  }
  return value;
}

function assertContractHeader(item, itemType, keyPrefix) {
  if (item.contractVersion !== PERSISTENCE_CONTRACT_VERSION) {
    fail(`Unsupported persistence contract version: ${item.contractVersion}.`);
  }
  if (item.itemType !== itemType) fail(`Expected ${itemType} item.`);
  assertString(item.pk, "pk", keyPrefix.length + 64, keyPrefix.length + 64);
  if (!item.pk.startsWith(keyPrefix)) fail(`${itemType} pk has the wrong family prefix.`);
  assertDigest(item.pk.slice(keyPrefix.length), `${itemType} key digest`);
}

function frozenCopy(item) {
  return Object.freeze({ ...item });
}

export function generateOpaqueIdentifier(byteLength = 32) {
  if (!Number.isSafeInteger(byteLength) || byteLength < 32 || byteLength > 64) {
    fail("Opaque identifiers require between 32 and 64 random bytes.");
  }
  return randomBytes(byteLength).toString("base64url");
}

export function hashOpaqueIdentifier(value) {
  assertString(value, "Opaque identifier", 43, 128);
  if (!BASE64URL_PATTERN.test(value)) fail("Opaque identifier must be base64url text.");
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hashIdentitySubject(subject) {
  assertString(subject, "Identity subject", 1, 256);
  return createHash("sha256").update(subject, "utf8").digest("hex");
}

export function identityMapKey(subject) {
  return `IDENTITY#${hashIdentitySubject(subject)}`;
}

export function accountKey(userId) {
  assertUserId(userId);
  const digest = createHash("sha256").update(userId, "utf8").digest("hex");
  return `ACCOUNT#${digest}`;
}

export function sessionKey(sessionIdentifier) {
  return `SESSION#${hashOpaqueIdentifier(sessionIdentifier)}`;
}

export function authTransactionKey(state) {
  return `AUTH_TRANSACTION#${hashOpaqueIdentifier(state)}`;
}

export function createIdentityMap({ createdAt, subject, userId }) {
  return parseIdentityMap({
    contractVersion: PERSISTENCE_CONTRACT_VERSION,
    createdAt,
    itemType: ITEM_TYPES.IDENTITY_MAP,
    pk: identityMapKey(subject),
    subjectHash: hashIdentitySubject(subject),
    userId,
  });
}

export function parseIdentityMap(item) {
  assertExactKeys(item, [
    "contractVersion",
    "createdAt",
    "itemType",
    "pk",
    "subjectHash",
    "userId",
  ]);
  assertContractHeader(item, ITEM_TYPES.IDENTITY_MAP, "IDENTITY#");
  assertIsoTimestamp(item.createdAt, "createdAt");
  assertDigest(item.subjectHash, "subjectHash");
  if (item.pk !== `IDENTITY#${item.subjectHash}`) fail("IdentityMap key does not match subjectHash.");
  assertUserId(item.userId);
  return frozenCopy(item);
}

export function createAccount({ createdAt, role = "USER", status = "ACTIVE", userId }) {
  return parseAccount({
    contractVersion: PERSISTENCE_CONTRACT_VERSION,
    createdAt,
    itemType: ITEM_TYPES.ACCOUNT,
    pk: accountKey(userId),
    role,
    sessionVersion: 0,
    status,
    updatedAt: createdAt,
    userId,
  });
}

export function parseAccount(item) {
  assertExactKeys(item, [
    "contractVersion",
    "createdAt",
    "itemType",
    "pk",
    "role",
    "sessionVersion",
    "status",
    "updatedAt",
    "userId",
  ]);
  assertContractHeader(item, ITEM_TYPES.ACCOUNT, "ACCOUNT#");
  assertIsoTimestamp(item.createdAt, "createdAt");
  assertIsoTimestamp(item.updatedAt, "updatedAt");
  if (new Date(item.updatedAt).getTime() < new Date(item.createdAt).getTime()) {
    fail("updatedAt cannot be before account creation.");
  }
  assertUserId(item.userId);
  if (item.pk !== accountKey(item.userId)) fail("Account key does not match userId.");
  if (!ACCOUNT_ROLES.includes(item.role)) fail("Account role is not supported.");
  if (!ACCOUNT_STATUSES.includes(item.status)) fail("Account status is not supported.");
  assertNonNegativeInteger(item.sessionVersion, "sessionVersion");
  return frozenCopy(item);
}

export function createSession({
  absoluteExpiresAt,
  authenticatedAt,
  cognitoSubject,
  createdAt,
  csrfToken,
  idleExpiresAt,
  serverTokenBundle,
  sessionIdentifier,
  sessionVersion,
  userId,
}) {
  const absoluteMillis = new Date(assertIsoTimestamp(absoluteExpiresAt, "absoluteExpiresAt")).getTime();
  const authenticatedMillis = new Date(assertIsoTimestamp(authenticatedAt, "authenticatedAt")).getTime();
  const idleMillis = new Date(assertIsoTimestamp(idleExpiresAt, "idleExpiresAt")).getTime();
  const createdMillis = new Date(assertIsoTimestamp(createdAt, "createdAt")).getTime();
  if (authenticatedMillis > createdMillis) fail("authenticatedAt cannot be after session creation.");
  if (idleMillis <= createdMillis || absoluteMillis <= createdMillis || idleMillis > absoluteMillis) {
    fail("Session expiry timestamps must be after creation and idle expiry cannot exceed absolute expiry.");
  }
  if (idleMillis - createdMillis > 7 * DAY_MILLISECONDS) {
    fail("Session idle expiry cannot exceed seven days from creation.");
  }
  if (absoluteMillis - createdMillis > 30 * DAY_MILLISECONDS) {
    fail("Session absolute expiry cannot exceed thirty days from creation.");
  }
  const sessionIdHash = hashOpaqueIdentifier(sessionIdentifier);
  return parseSession({
    absoluteExpiresAt,
    authenticatedAt,
    cleanupAfterEpochSeconds: Math.ceil(absoluteMillis / 1000),
    contractVersion: PERSISTENCE_CONTRACT_VERSION,
    cognitoSubjectHash: hashIdentitySubject(cognitoSubject),
    createdAt,
    csrfTokenHash: hashOpaqueIdentifier(csrfToken),
    idleExpiresAt,
    itemType: ITEM_TYPES.SESSION,
    pk: `SESSION#${sessionIdHash}`,
    serverTokenBundle: assertString(serverTokenBundle, "serverTokenBundle", 1, 16384),
    sessionIdHash,
    sessionVersion,
    userId,
  });
}

export function parseSession(item) {
  assertExactKeys(item, [
    "absoluteExpiresAt",
    "authenticatedAt",
    "cleanupAfterEpochSeconds",
    "contractVersion",
    "cognitoSubjectHash",
    "createdAt",
    "csrfTokenHash",
    "idleExpiresAt",
    "itemType",
    "pk",
    "serverTokenBundle",
    "sessionIdHash",
    "sessionVersion",
    "userId",
  ]);
  assertContractHeader(item, ITEM_TYPES.SESSION, "SESSION#");
  const created = new Date(assertIsoTimestamp(item.createdAt, "createdAt")).getTime();
  const authenticated = new Date(assertIsoTimestamp(item.authenticatedAt, "authenticatedAt")).getTime();
  const idle = new Date(assertIsoTimestamp(item.idleExpiresAt, "idleExpiresAt")).getTime();
  const absolute = new Date(assertIsoTimestamp(item.absoluteExpiresAt, "absoluteExpiresAt")).getTime();
  if (authenticated > created) fail("Session authenticatedAt cannot be after creation.");
  if (idle <= created || absolute <= created || idle > absolute) fail("Session expiry ordering is invalid.");
  if (idle - created > 7 * DAY_MILLISECONDS) fail("Session idle expiry exceeds seven days.");
  if (absolute - created > 30 * DAY_MILLISECONDS) fail("Session absolute expiry exceeds thirty days.");
  assertDigest(item.cognitoSubjectHash, "cognitoSubjectHash");
  assertDigest(item.csrfTokenHash, "csrfTokenHash");
  assertDigest(item.sessionIdHash, "sessionIdHash");
  if (item.pk !== `SESSION#${item.sessionIdHash}`) fail("Session key does not match sessionIdHash.");
  assertUserId(item.userId);
  assertString(item.serverTokenBundle, "serverTokenBundle", 1, 16384);
  assertNonNegativeInteger(item.sessionVersion, "sessionVersion");
  assertNonNegativeInteger(item.cleanupAfterEpochSeconds, "cleanupAfterEpochSeconds");
  if (item.cleanupAfterEpochSeconds !== Math.ceil(absolute / 1000)) {
    fail("Session cleanupAfterEpochSeconds must match absolute expiry.");
  }
  return frozenCopy(item);
}

export function isSessionValid(session, now = new Date()) {
  const item = parseSession(session);
  const nowMillis = now instanceof Date ? now.getTime() : Number.NaN;
  if (!Number.isFinite(nowMillis)) fail("now must be a valid Date.");
  return nowMillis < new Date(item.idleExpiresAt).getTime() && nowMillis < new Date(item.absoluteExpiresAt).getTime();
}

export function createAuthTransaction({
  allowedReturnPaths,
  browserBinding,
  createdAt,
  expiresAt,
  nonce,
  pkceVerifier,
  returnPath,
  state,
}) {
  assertString(pkceVerifier, "PKCE verifier", 43, 128);
  if (!BASE64URL_PATTERN.test(pkceVerifier)) fail("PKCE verifier must be base64url text.");
  assertString(returnPath, "returnPath", 1, 256);
  if (!returnPath.startsWith("/") || returnPath.startsWith("//") || returnPath.includes("://")) {
    fail("returnPath must be an application-relative path.");
  }
  if (
    !Array.isArray(allowedReturnPaths) ||
    allowedReturnPaths.length === 0 ||
    allowedReturnPaths.some((value) => typeof value !== "string") ||
    !allowedReturnPaths.includes(returnPath)
  ) {
    fail("returnPath must match an explicit allowlist entry.");
  }
  const createdMillis = new Date(assertIsoTimestamp(createdAt, "createdAt")).getTime();
  const expiresMillis = new Date(assertIsoTimestamp(expiresAt, "expiresAt")).getTime();
  if (expiresMillis <= createdMillis || expiresMillis - createdMillis > 10 * 60 * 1000) {
    fail("Auth transaction expiry must be after creation and no more than ten minutes later.");
  }
  const stateHash = hashOpaqueIdentifier(state);
  return parseAuthTransaction({
    browserBindingHash: hashOpaqueIdentifier(browserBinding),
    cleanupAfterEpochSeconds: Math.ceil(expiresMillis / 1000),
    contractVersion: PERSISTENCE_CONTRACT_VERSION,
    createdAt,
    expiresAt,
    itemType: ITEM_TYPES.AUTH_TRANSACTION,
    nonceHash: hashOpaqueIdentifier(nonce),
    pk: `AUTH_TRANSACTION#${stateHash}`,
    pkceVerifier,
    returnPath,
    stateHash,
    status: "PENDING",
  });
}

export function parseAuthTransaction(item) {
  assertExactKeys(
    item,
    [
      "browserBindingHash",
      "cleanupAfterEpochSeconds",
      "contractVersion",
      "createdAt",
      "expiresAt",
      "itemType",
      "nonceHash",
      "pk",
      "pkceVerifier",
      "returnPath",
      "stateHash",
      "status",
    ],
    ["usedAt"],
  );
  assertContractHeader(item, ITEM_TYPES.AUTH_TRANSACTION, "AUTH_TRANSACTION#");
  const created = new Date(assertIsoTimestamp(item.createdAt, "createdAt")).getTime();
  const expires = new Date(assertIsoTimestamp(item.expiresAt, "expiresAt")).getTime();
  if (expires <= created || expires - created > 10 * 60 * 1000) fail("Auth transaction expiry ordering is invalid.");
  for (const field of ["browserBindingHash", "nonceHash", "stateHash"]) assertDigest(item[field], field);
  if (item.pk !== `AUTH_TRANSACTION#${item.stateHash}`) fail("Auth transaction key does not match stateHash.");
  assertString(item.pkceVerifier, "pkceVerifier", 43, 128);
  if (!BASE64URL_PATTERN.test(item.pkceVerifier)) fail("pkceVerifier must be base64url text.");
  assertString(item.returnPath, "returnPath", 1, 256);
  if (!item.returnPath.startsWith("/") || item.returnPath.startsWith("//") || item.returnPath.includes("://")) {
    fail("returnPath must be an application-relative path.");
  }
  if (!['PENDING', 'USED'].includes(item.status)) fail("Auth transaction status is not supported.");
  if (item.status === "USED") {
    assertIsoTimestamp(item.usedAt, "usedAt");
    const used = new Date(item.usedAt).getTime();
    if (used < created || used >= expires) fail("Auth transaction usedAt is outside its valid lifetime.");
  } else if (Object.hasOwn(item, "usedAt")) {
    fail("Pending auth transactions cannot have usedAt.");
  }
  assertNonNegativeInteger(item.cleanupAfterEpochSeconds, "cleanupAfterEpochSeconds");
  if (item.cleanupAfterEpochSeconds !== Math.ceil(expires / 1000)) {
    fail("Auth transaction cleanupAfterEpochSeconds must match expiry.");
  }
  return frozenCopy(item);
}

export function isAuthTransactionValid(transaction, now = new Date()) {
  const item = parseAuthTransaction(transaction);
  const nowMillis = now instanceof Date ? now.getTime() : Number.NaN;
  if (!Number.isFinite(nowMillis)) fail("now must be a valid Date.");
  return item.status === "PENDING" && nowMillis < new Date(item.expiresAt).getTime();
}
