import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import {
  calculateResourceSha256,
  classifyRequest,
  isAcceptedMediaType,
  isOwnedShellCache,
  normalizeMediaType,
  normalizeTextContent,
  validateResourceResponse,
} from "../../src/pwa/service-worker-policy.js";

const origin = "https://shelfstate.example";
const precachedPaths = new Set(["/index.html", "/src/app/script.js"]);

function request(pathname, options = {}) {
  return {
    method: "GET",
    mode: "same-origin",
    ...options,
    url: new URL(pathname, origin).href,
  };
}

function responseFor(body, options = {}) {
  const bytes = new TextEncoder().encode(body);
  const headers = new Headers({
    "content-type": "text/javascript; charset=utf-8",
    ...options.headers,
  });

  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    url: options.url ?? `${origin}/src/app/script.js`,
    headers,
    clone() {
      return {
        async arrayBuffer() {
          return bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          );
        },
      };
    },
  };
}

test("classifies only recognized same-origin GET requests", () => {
  assert.equal(
    classifyRequest(
      request("/?source=installed", { mode: "navigate" }),
      origin,
      precachedPaths,
    ),
    "shell-navigation",
  );
  assert.equal(
    classifyRequest(
      request("/index.html?source=browser", { mode: "navigate" }),
      origin,
      precachedPaths,
    ),
    "shell-navigation",
  );
  assert.equal(
    classifyRequest(request("/src/app/script.js"), origin, precachedPaths),
    "precached-resource",
  );
  assert.equal(
    classifyRequest(request("/src/app/script.js?v=2"), origin, precachedPaths),
    "network",
  );
  assert.equal(
    classifyRequest(
      request("/future-page", { mode: "navigate" }),
      origin,
      precachedPaths,
    ),
    "network",
  );
  assert.equal(
    classifyRequest(request("/future.json"), origin, precachedPaths),
    "network",
  );
  assert.equal(
    classifyRequest(
      { method: "POST", mode: "same-origin", url: `${origin}/index.html` },
      origin,
      precachedPaths,
    ),
    "bypass",
  );
  assert.equal(
    classifyRequest(
      {
        method: "GET",
        mode: "cors",
        url: "https://other.example/script.js",
      },
      origin,
      precachedPaths,
    ),
    "bypass",
  );
});

test("normalizes text line endings", () => {
  assert.equal(normalizeTextContent("a\r\nb\rc\nd"), "a\nb\nc\nd");
});

test("normalizes and validates intentional media-type variants", () => {
  assert.equal(normalizeMediaType(" Text/CSS ; charset=UTF-8 "), "text/css");
  assert.equal(
    isAcceptedMediaType("application/javascript; charset=utf-8", "text/javascript"),
    true,
  );
  assert.equal(isAcceptedMediaType("text/javascript", "text/javascript"), true);
  assert.equal(
    isAcceptedMediaType("application/json", "application/manifest+json"),
    true,
  );
  assert.equal(
    isAcceptedMediaType(
      "application/manifest+json; charset=utf-8",
      "application/manifest+json",
    ),
    true,
  );
  assert.equal(isAcceptedMediaType("text/html", "text/javascript"), false);
  assert.equal(isAcceptedMediaType(null, "image/png"), false);
});

test("recognizes only ShelfState shell cache names", () => {
  assert.equal(isOwnedShellCache("shelfstate-shell-abc123"), true);
  assert.equal(isOwnedShellCache("other-cache"), false);
  assert.equal(isOwnedShellCache("prefix-shelfstate-shell-abc123"), false);
});

test("hashes normalized text and unmodified binary bytes", async () => {
  const crlf = new TextEncoder().encode("line one\r\nline two\r");
  const lf = new TextEncoder().encode("line one\nline two\n");

  assert.equal(
    await calculateResourceSha256(crlf, "text", webcrypto),
    await calculateResourceSha256(lf, "text", webcrypto),
  );
  assert.notEqual(
    await calculateResourceSha256(crlf, "binary", webcrypto),
    await calculateResourceSha256(lf, "binary", webcrypto),
  );
});

test("validates status, origin, media type, and digest", async () => {
  const body = "export const value = 1;\r\n";
  const resource = {
    url: "/src/app/script.js",
    kind: "text",
    mediaType: "text/javascript",
    sha256: await calculateResourceSha256(
      new TextEncoder().encode(body),
      "text",
      webcrypto,
    ),
  };

  await assert.doesNotReject(() =>
    validateResourceResponse(responseFor(body), resource, origin, webcrypto),
  );
  await assert.rejects(
    () =>
      validateResourceResponse(
        responseFor(body, { ok: false, status: 503 }),
        resource,
        origin,
        webcrypto,
      ),
    /HTTP 503/,
  );
  await assert.rejects(
    () =>
      validateResourceResponse(
        responseFor(body, { url: "https://other.example/script.js" }),
        resource,
        origin,
        webcrypto,
      ),
    /origin/,
  );
  await assert.rejects(
    () =>
      validateResourceResponse(
        responseFor(body, { headers: { "content-type": "text/html" } }),
        resource,
        origin,
        webcrypto,
      ),
    /media type/,
  );
  await assert.rejects(
    () =>
      validateResourceResponse(
        responseFor("different content"),
        resource,
        origin,
        webcrypto,
      ),
    /digest mismatch/,
  );
});
