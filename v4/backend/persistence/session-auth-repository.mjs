import {
  authTransactionKey,
  hashOpaqueIdentifier,
  isAuthTransactionValid,
  isSessionValid,
  parseAuthTransaction,
  parseSession,
  sessionKey,
} from "../../contracts/identity-session.mjs";
import { PersistenceConflictError } from "./identity-account-repository.mjs";

export class ExpiredRecordError extends Error {
  constructor(message) {
    super(message);
    this.name = "ExpiredRecordError";
  }
}

function assertPort(execute) {
  if (typeof execute !== "function") {
    throw new TypeError("Persistence repository requires an execute operation port.");
  }
}

function assertTableName(tableName) {
  if (typeof tableName !== "string" || !/^[A-Za-z0-9_.-]{3,255}$/.test(tableName)) {
    throw new TypeError("Persistence repository requires an explicit DynamoDB table name.");
  }
}

function assertNow(now) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new TypeError("now must be a valid Date.");
  }
}

async function createOnce(execute, tableName, item) {
  try {
    await execute("PutItem", {
      ConditionExpression: "attribute_not_exists(#pk)",
      ExpressionAttributeNames: { "#pk": "pk" },
      Item: item,
      TableName: tableName,
    });
  } catch (error) {
    if (error?.name === "ConditionalCheckFailedException") {
      throw new PersistenceConflictError("Persistence record already exists.");
    }
    throw error;
  }
  return item;
}

async function getStrong(execute, tableName, pk, parser) {
  const result = await execute("GetItem", {
    ConsistentRead: true,
    Key: { pk },
    TableName: tableName,
  });
  return result?.Item === undefined ? undefined : parser(result.Item);
}

export function createSessionAuthRepository({ execute, tableName }) {
  assertPort(execute);
  assertTableName(tableName);

  return Object.freeze({
    async consumeAuthTransaction({ browserBinding, now, state }) {
      assertNow(now);
      const existing = await getStrong(
        execute,
        tableName,
        authTransactionKey(state),
        parseAuthTransaction,
      );
      if (!existing || !isAuthTransactionValid(existing, now)) {
        throw new ExpiredRecordError("Auth transaction is absent, expired, or already used.");
      }
      if (existing.browserBindingHash !== hashOpaqueIdentifier(browserBinding)) {
        throw new PersistenceConflictError("Auth transaction browser binding does not match.");
      }

      const usedAt = now.toISOString();
      try {
        const result = await execute("UpdateItem", {
          ConditionExpression: "#status = :pending AND #expiresAt > :now",
          ExpressionAttributeNames: {
            "#expiresAt": "expiresAt",
            "#status": "status",
            "#usedAt": "usedAt",
          },
          ExpressionAttributeValues: {
            ":now": usedAt,
            ":pending": "PENDING",
            ":used": "USED",
            ":usedAt": usedAt,
          },
          Key: { pk: authTransactionKey(state) },
          ReturnValues: "ALL_NEW",
          TableName: tableName,
          UpdateExpression: "SET #status = :used, #usedAt = :usedAt",
        });
        return parseAuthTransaction(result.Attributes);
      } catch (error) {
        if (error?.name === "ConditionalCheckFailedException") {
          throw new PersistenceConflictError("Auth transaction was expired or consumed concurrently.");
        }
        throw error;
      }
    },

    async createAuthTransaction(item) {
      return createOnce(execute, tableName, parseAuthTransaction(item));
    },

    async createSession(item) {
      return createOnce(execute, tableName, parseSession(item));
    },

    async deleteSession(sessionIdentifier) {
      await execute("DeleteItem", {
        Key: { pk: sessionKey(sessionIdentifier) },
        TableName: tableName,
      });
    },

    async getValidAuthTransaction({ now, state }) {
      assertNow(now);
      const item = await getStrong(
        execute,
        tableName,
        authTransactionKey(state),
        parseAuthTransaction,
      );
      return item && isAuthTransactionValid(item, now) ? item : undefined;
    },

    async getValidSession({ now, sessionIdentifier }) {
      assertNow(now);
      const item = await getStrong(
        execute,
        tableName,
        sessionKey(sessionIdentifier),
        parseSession,
      );
      return item && isSessionValid(item, now) ? item : undefined;
    },
  });
}
