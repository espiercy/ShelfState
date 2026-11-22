import {
  accountKey,
  identityMapKey,
  parseAccount,
  parseIdentityMap,
} from "../../contracts/identity-session.mjs";

export class PersistenceConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = "PersistenceConflictError";
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

export function createIdentityAccountRepository({ execute, tableName }) {
  assertPort(execute);
  assertTableName(tableName);

  return Object.freeze({
    async createAccount(item) {
      return createOnce(execute, tableName, parseAccount(item));
    },

    async createIdentityMap(item) {
      return createOnce(execute, tableName, parseIdentityMap(item));
    },

    async getAccount(userId) {
      return getStrong(execute, tableName, accountKey(userId), parseAccount);
    },

    async getIdentityMap(subject) {
      return getStrong(execute, tableName, identityMapKey(subject), parseIdentityMap);
    },
  });
}
