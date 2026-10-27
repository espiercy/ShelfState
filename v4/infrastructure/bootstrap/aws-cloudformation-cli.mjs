// Thin, bounded AWS CLI transport for a future separately authorized WP-007
// certificate change-set preparation. Importing this module performs no call.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  canonical,
  parseEvidenceJson,
} from "../../scripts/release/schema.mjs";

const REGION = "us-east-1";
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 120_000;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

const operations = Object.freeze({
  "sts:GetCallerIdentity": Object.freeze(["sts", "get-caller-identity"]),
  "cloudformation:CreateChangeSet": Object.freeze(["cloudformation", "create-change-set"]),
  "cloudformation:DescribeChangeSet": Object.freeze(["cloudformation", "describe-change-set"]),
  "cloudformation:GetTemplate": Object.freeze(["cloudformation", "get-template"]),
  "cloudformation:DescribeStacks": Object.freeze(["cloudformation", "describe-stacks"]),
  "cloudformation:DescribeStackResources": Object.freeze(["cloudformation", "describe-stack-resources"]),
});

export const AWS_CLOUDFORMATION_CLI_OPERATIONS = Object.freeze(Object.keys(operations));

function plainObject(value, label) {
  assert.ok(value && Object.getPrototypeOf(value) === Object.prototype, `${label}: object required`);
  return value;
}

function boundedTimeout(value) {
  assert.ok(Number.isSafeInteger(value), "AWS CLI timeout must be an integer");
  assert.ok(value >= 1_000 && value <= MAX_TIMEOUT_MS, "AWS CLI timeout outside bounded range");
  return value;
}

function safeRequestId(source) {
  const text = String(source ?? "");
  const match = /(?:x-amzn-requestid|request[- ]?id)\s*[:=]\s*['\"]?([A-Za-z0-9-]{8,128})/i.exec(text);
  return match?.[1] ?? null;
}

function errorCode(error) {
  const stderr = String(error?.stderr ?? "");
  if (error?.code === "ETIMEDOUT" || error?.signal === "SIGTERM") return "CLI_TIMEOUT";
  return /An error occurred \(([^)]+)\)/.exec(stderr)?.[1] ?? "CLI_FAILURE";
}

export class AwsCloudFormationCliError extends Error {
  constructor(operation, code, requestId = null) {
    super(`AWS CLI ${operation} failed (${code})`);
    this.name = "AwsCloudFormationCliError";
    this.code = code;
    this.operation = operation;
    this.requestId = requestId;
  }
}

function defaultExecute(command, args, options) {
  return {
    stdout: execFileSync(command, args, options),
    requestId: null,
  };
}

export function awsCliInputFileReference(inputPath) {
  assert.equal(typeof inputPath, "string");
  assert.ok(inputPath.length > 0 && !/[\r\n\0]/.test(inputPath), "Invalid AWS CLI input path");
  // The AWS CLI paramfile loader removes the literal file:// prefix and opens
  // the remainder as a native path. A WHATWG Windows file URL adds a leading
  // slash (file:///C:/...), which leaves /C:/... and fails before any request.
  return `file://${inputPath}`;
}

function normalizeExecutionResult(result) {
  if (typeof result === "string" || Buffer.isBuffer(result)) {
    return { stdout: result, requestId: null };
  }
  plainObject(result, "AWS CLI execution result");
  assert.ok(Object.keys(result).every((key) => ["stdout", "requestId"].includes(key)), "AWS CLI runner returned unsupported fields");
  assert.ok(typeof result.stdout === "string" || Buffer.isBuffer(result.stdout), "AWS CLI stdout required");
  if (result.requestId !== null && result.requestId !== undefined) {
    assert.match(result.requestId, /^[A-Za-z0-9-]{8,128}$/, "Invalid AWS request ID");
  }
  return { stdout: result.stdout, requestId: result.requestId ?? null };
}

function invoke(command, execute, environment, cwd, operation, input, timeoutMs) {
  const [service, cliOperation] = operations[operation];
  const directory = mkdtempSync(path.join(os.tmpdir(), "shelfstate-wp007-aws-cli-"));
  try {
    chmodSync(directory, 0o700);
    const inputPath = path.join(directory, "input.json");
    writeFileSync(inputPath, canonical(input), { encoding: "utf8", mode: 0o600, flag: "wx" });
    chmodSync(inputPath, 0o600);
    const seconds = Math.max(1, Math.ceil(timeoutMs / 1_000));
    const args = [
      service,
      cliOperation,
      "--cli-input-json",
      awsCliInputFileReference(inputPath),
      "--region",
      REGION,
      "--output",
      "json",
      "--no-paginate",
      "--no-cli-pager",
      "--no-cli-auto-prompt",
      "--color",
      "off",
      "--cli-connect-timeout",
      String(Math.min(seconds, 10)),
      "--cli-read-timeout",
      String(seconds),
    ];
    let result;
    try {
      result = normalizeExecutionResult(execute(command, args, {
        cwd,
        env: {
          ...environment,
          AWS_CLI_AUTO_PROMPT: "off",
          AWS_IGNORE_CONFIGURED_ENDPOINT_URLS: "true",
          AWS_PAGER: "",
        },
        shell: false,
        timeout: timeoutMs,
        maxBuffer: MAX_RESPONSE_BYTES,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      }));
    } catch (error) {
      throw new AwsCloudFormationCliError(operation, errorCode(error), safeRequestId(error?.stderr));
    }
    const raw = Buffer.isBuffer(result.stdout) ? result.stdout.toString("utf8") : result.stdout;
    assert.ok(Buffer.byteLength(raw, "utf8") <= MAX_RESPONSE_BYTES, "AWS CLI response too large");
    return {
      requestId: result.requestId,
      raw,
      response: parseEvidenceJson(Buffer.from(raw, "utf8")),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function createAwsCloudFormationCliTransport({
  command = "aws",
  cwd = process.cwd(),
  environment = process.env,
  execute = defaultExecute,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  assert.equal(typeof command, "string");
  assert.ok(command.length > 0 && !/[\r\n\0]/.test(command), "Invalid AWS CLI command");
  assert.equal(typeof cwd, "string");
  assert.equal(typeof execute, "function");
  assert.ok(environment && typeof environment === "object", "AWS CLI environment required");
  const environmentCopy = { ...environment };
  const defaultTimeout = boundedTimeout(timeoutMs);
  return Object.freeze({
    kind: "aws-cli",
    evidenceMode: "AWS_CLI_SIGNED_REQUEST_PATH",
    region: REGION,
    operations: AWS_CLOUDFORMATION_CLI_OPERATIONS,
    async call({ operation, region, input, timeoutMs: requestedTimeout = defaultTimeout }) {
      assert.ok(Object.hasOwn(operations, operation), `Unsupported AWS CLI operation: ${operation}`);
      assert.equal(region, REGION, "Certificate preparation AWS region substitution");
      plainObject(input, `${operation} input`);
      return invoke(command, execute, environmentCopy, cwd, operation, input, boundedTimeout(requestedTimeout));
    },
  });
}
