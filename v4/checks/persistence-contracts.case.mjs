import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createAccount,
  createAuthTransaction,
  createIdentityMap,
  createSession,
  generateOpaqueIdentifier,
  hashOpaqueIdentifier,
  isAuthTransactionValid,
  isSessionValid,
  parseAccount,
  parseAuthTransaction,
  parseIdentityMap,
  parseSession,
  PERSISTENCE_CONTRACT_VERSION,
} from "../contracts/identity-session.mjs";
import {
  createIdentityAccountRepository,
  PersistenceConflictError,
} from "../backend/persistence/identity-account-repository.mjs";
import {
  createSessionAuthRepository,
} from "../backend/persistence/session-auth-repository.mjs";

const USER_ID = "01890f47-6ac1-4b48-8d69-2f158c364630";
const CREATED_AT = "2026-11-21T20:00:00.000Z";
const IDLE_EXPIRES_AT = "2026-11-28T20:00:00.000Z";
const ABSOLUTE_EXPIRES_AT = "2026-12-21T20:00:00.000Z";
const AUTH_EXPIRES_AT = "2026-11-21T20:10:00.000Z";

function conditionalFailure() {
  const error = new Error("condition failed");
  error.name = "ConditionalCheckFailedException";
  return error;
}

function createMemoryPort() {
  const items = new Map();
  const calls = [];
  const compoundKey = (tableName, pk) => `${tableName}\u0000${pk}`;

  return {
    calls,
    async execute(operation, input) {
      calls.push(structuredClone({ input, operation }));
      const key = compoundKey(input.TableName, input.Key?.pk ?? input.Item?.pk);
      if (operation === "PutItem") {
        if (items.has(key)) throw conditionalFailure();
        items.set(key, structuredClone(input.Item));
        return {};
      }
      if (operation === "GetItem") {
        const item = items.get(key);
        return item === undefined ? {} : { Item: structuredClone(item) };
      }
      if (operation === "DeleteItem") {
        items.delete(key);
        return {};
      }
      if (operation === "UpdateItem") {
        const item = items.get(key);
        if (
          !item ||
          item.status !== input.ExpressionAttributeValues[":pending"] ||
          item.expiresAt <= input.ExpressionAttributeValues[":now"]
        ) {
          throw conditionalFailure();
        }
        item.status = input.ExpressionAttributeValues[":used"];
        item.usedAt = input.ExpressionAttributeValues[":usedAt"];
        items.set(key, item);
        return { Attributes: structuredClone(item) };
      }
      throw new Error(`Unsupported simulated operation: ${operation}`);
    },
    items,
  };
}

function fixture() {
  const sessionIdentifier = generateOpaqueIdentifier();
  const state = generateOpaqueIdentifier();
  const browserBinding = generateOpaqueIdentifier();
  return {
    account: createAccount({ createdAt: CREATED_AT, userId: USER_ID }),
    authTransaction: createAuthTransaction({
      allowedReturnPaths: ["/library"],
      browserBinding,
      createdAt: CREATED_AT,
      expiresAt: AUTH_EXPIRES_AT,
      nonce: generateOpaqueIdentifier(),
      pkceVerifier: generateOpaqueIdentifier(),
      returnPath: "/library",
      state,
    }),
    browserBinding,
    identityMap: createIdentityMap({
      createdAt: CREATED_AT,
      subject: "synthetic-cognito-subject",
      userId: USER_ID,
    }),
    session: createSession({
      absoluteExpiresAt: ABSOLUTE_EXPIRES_AT,
      authenticatedAt: CREATED_AT,
      cognitoSubject: "synthetic-cognito-subject",
      createdAt: CREATED_AT,
      csrfToken: generateOpaqueIdentifier(),
      idleExpiresAt: IDLE_EXPIRES_AT,
      serverTokenBundle: "synthetic-server-only-token-bundle",
      sessionIdentifier,
      sessionVersion: 0,
      userId: USER_ID,
    }),
    sessionIdentifier,
    state,
  };
}

test("all four versioned item contracts validate and reject schema drift", () => {
  const value = fixture();
  assert.equal(PERSISTENCE_CONTRACT_VERSION, 1);
  assert.deepEqual(parseIdentityMap(value.identityMap), value.identityMap);
  assert.deepEqual(parseAccount(value.account), value.account);
  assert.deepEqual(parseSession(value.session), value.session);
  assert.deepEqual(parseAuthTransaction(value.authTransaction), value.authTransaction);

  for (const [parser, item] of [
    [parseIdentityMap, value.identityMap],
    [parseAccount, value.account],
    [parseSession, value.session],
    [parseAuthTransaction, value.authTransaction],
  ]) {
    assert.throws(() => parser({ ...item, contractVersion: 2 }), /Unsupported persistence contract version/);
    assert.throws(() => parser({ ...item, unexpected: true }), /Unexpected persistence field/);
  }
});

test("opaque identifiers are unpredictable and only their digests enter keys", () => {
  const identifiers = new Set(Array.from({ length: 32 }, () => generateOpaqueIdentifier()));
  assert.equal(identifiers.size, 32);
  for (const identifier of identifiers) {
    assert.match(identifier, /^[A-Za-z0-9_-]{43}$/);
    assert.match(hashOpaqueIdentifier(identifier), /^[a-f0-9]{64}$/);
  }

  const value = fixture();
  assert.equal(value.session.pk.includes(value.sessionIdentifier), false);
  assert.equal(value.authTransaction.pk.includes(value.state), false);
  assert.equal(value.authTransaction.browserBindingHash.includes(value.browserBinding), false);
});

test("expiry is application-enforced at the exact boundary while TTL remains cleanup metadata", () => {
  const value = fixture();
  assert.equal(isSessionValid(value.session, new Date("2026-11-28T19:59:59.999Z")), true);
  assert.equal(isSessionValid(value.session, new Date(IDLE_EXPIRES_AT)), false);
  assert.equal(isSessionValid(value.session, new Date(ABSOLUTE_EXPIRES_AT)), false);
  assert.equal(
    value.session.cleanupAfterEpochSeconds,
    Math.ceil(new Date(ABSOLUTE_EXPIRES_AT).getTime() / 1000),
  );
  assert.equal(isAuthTransactionValid(value.authTransaction, new Date("2026-11-21T20:09:59.999Z")), true);
  assert.equal(isAuthTransactionValid(value.authTransaction, new Date(AUTH_EXPIRES_AT)), false);
});

test("session and auth lifetimes cannot exceed the approved bounds", () => {
  const common = {
    authenticatedAt: CREATED_AT,
    cognitoSubject: "synthetic-cognito-subject",
    createdAt: CREATED_AT,
    csrfToken: generateOpaqueIdentifier(),
    idleExpiresAt: IDLE_EXPIRES_AT,
    serverTokenBundle: "synthetic-server-only-token-bundle",
    sessionIdentifier: generateOpaqueIdentifier(),
    sessionVersion: 0,
    userId: USER_ID,
  };
  assert.throws(
    () => createSession({ ...common, absoluteExpiresAt: "2026-12-21T20:00:00.001Z" }),
    /thirty days/,
  );
  assert.throws(
    () => createSession({ ...common, absoluteExpiresAt: ABSOLUTE_EXPIRES_AT, idleExpiresAt: "2026-11-28T20:00:00.001Z" }),
    /seven days/,
  );
});

test("all four item types round-trip only through their intended table boundary", async () => {
  const memory = createMemoryPort();
  const identity = createIdentityAccountRepository({
    execute: memory.execute,
    tableName: "identity-account-table",
  });
  const session = createSessionAuthRepository({
    execute: memory.execute,
    tableName: "session-auth-table",
  });
  const value = fixture();

  await identity.createIdentityMap(value.identityMap);
  await identity.createAccount(value.account);
  await session.createSession(value.session);
  await session.createAuthTransaction(value.authTransaction);

  assert.deepEqual(await identity.getIdentityMap("synthetic-cognito-subject"), value.identityMap);
  assert.deepEqual(await identity.getAccount(USER_ID), value.account);
  assert.deepEqual(
    await session.getValidSession({
      now: new Date("2026-11-22T20:00:00.000Z"),
      sessionIdentifier: value.sessionIdentifier,
    }),
    value.session,
  );
  assert.deepEqual(
    await session.getValidAuthTransaction({
      now: new Date("2026-11-21T20:05:00.000Z"),
      state: value.state,
    }),
    value.authTransaction,
  );

  assert.equal(
    [...memory.items.keys()].filter((key) => key.startsWith("identity-account-table\u0000")).length,
    2,
  );
  assert.equal(
    [...memory.items.keys()].filter((key) => key.startsWith("session-auth-table\u0000")).length,
    2,
  );
});

test("security reads are strongly consistent and expired retained items are rejected", async () => {
  const memory = createMemoryPort();
  const identity = createIdentityAccountRepository({ execute: memory.execute, tableName: "identity-table" });
  const session = createSessionAuthRepository({ execute: memory.execute, tableName: "session-table" });
  const value = fixture();
  await identity.createIdentityMap(value.identityMap);
  await identity.createAccount(value.account);
  await session.createSession(value.session);
  await session.createAuthTransaction(value.authTransaction);

  await identity.getIdentityMap("synthetic-cognito-subject");
  await identity.getAccount(USER_ID);
  assert.equal(
    await session.getValidSession({ now: new Date(IDLE_EXPIRES_AT), sessionIdentifier: value.sessionIdentifier }),
    undefined,
  );
  assert.equal(
    await session.getValidAuthTransaction({ now: new Date(AUTH_EXPIRES_AT), state: value.state }),
    undefined,
  );
  const reads = memory.calls.filter((call) => call.operation === "GetItem");
  assert.equal(reads.length, 4);
  assert.equal(reads.every((call) => call.input.ConsistentRead === true), true);
});

test("create and auth consumption use conditional writes and reject replay", async () => {
  const memory = createMemoryPort();
  const identity = createIdentityAccountRepository({ execute: memory.execute, tableName: "identity-table" });
  const session = createSessionAuthRepository({ execute: memory.execute, tableName: "session-table" });
  const value = fixture();
  await identity.createAccount(value.account);
  await assert.rejects(identity.createAccount(value.account), PersistenceConflictError);
  await session.createAuthTransaction(value.authTransaction);

  const consumed = await session.consumeAuthTransaction({
    browserBinding: value.browserBinding,
    now: new Date("2026-11-21T20:05:00.000Z"),
    state: value.state,
  });
  assert.equal(consumed.status, "USED");
  await assert.rejects(
    session.consumeAuthTransaction({
      browserBinding: value.browserBinding,
      now: new Date("2026-11-21T20:05:01.000Z"),
      state: value.state,
    }),
    /absent, expired, or already used/,
  );
  const writes = memory.calls.filter((call) => ["PutItem", "UpdateItem"].includes(call.operation));
  assert.equal(writes.every((call) => typeof call.input.ConditionExpression === "string"), true);
});

test("auth transaction validation excludes absolute URLs and raw browser credentials from indexes", () => {
  const base = fixture();
  assert.throws(
    () => createAuthTransaction({
      allowedReturnPaths: ["/library"],
      browserBinding: base.browserBinding,
      createdAt: CREATED_AT,
      expiresAt: AUTH_EXPIRES_AT,
      nonce: generateOpaqueIdentifier(),
      pkceVerifier: generateOpaqueIdentifier(),
      returnPath: "https://attacker.example/",
      state: base.state,
    }),
    /application-relative path/,
  );
  assert.equal(JSON.stringify(base.authTransaction).includes(base.state), false);
  assert.equal(JSON.stringify(base.authTransaction).includes(base.browserBinding), false);
});

test("persistence contracts and adapters have no logging path for restricted values", async () => {
  const sources = await Promise.all([
    readFile(new URL("../contracts/identity-session.mjs", import.meta.url), "utf8"),
    readFile(new URL("../backend/persistence/identity-account-repository.mjs", import.meta.url), "utf8"),
    readFile(new URL("../backend/persistence/session-auth-repository.mjs", import.meta.url), "utf8"),
  ]);
  for (const source of sources) {
    assert.doesNotMatch(source, /\bconsole\s*\./);
    assert.doesNotMatch(source, /\blogger\s*\./);
    assert.doesNotMatch(source, /\blog\s*\(/);
  }

  const restricted = generateOpaqueIdentifier();
  let failure;
  try {
    hashOpaqueIdentifier(`${restricted}.invalid`);
  } catch (error) {
    failure = error;
  }
  assert.ok(failure instanceof TypeError);
  assert.equal(failure.message.includes(restricted), false);
});
