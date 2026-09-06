import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  canonicalizeNetlifyIndexHtml,
  calculateResourceSha256,
  classifyRequest,
  isAcceptedMediaType,
  isOwnedShellCache,
  NETLIFY_INDEX_HTML_INTEGRITY,
  normalizeMediaType,
  normalizeTextContent,
  validateResourceResponse,
} from "../../src/pwa/service-worker-policy.js";

const origin = "https://shelfstate.example";
const precachedPaths = new Set(["/index.html", "/src/app/script.js"]);
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(testDirectory, "../..");
const indexSource = await readFile(
  path.join(rootDirectory, "index.html"),
  "utf8",
);
const netlifyIndexFixture = await readFile(
  path.join(rootDirectory, "test/fixtures/netlify-transformed-index.html"),
  "utf8",
);

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

function indexResponseFor(body) {
  return responseFor(body, {
    url: `${origin}/index.html`,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function indexResourceFor(source = indexSource) {
  return {
    url: "/index.html",
    kind: "text",
    mediaType: "text/html",
    integrity: NETLIFY_INDEX_HTML_INTEGRITY,
    sha256: await calculateResourceSha256(
      new TextEncoder().encode(source),
      "text",
      webcrypto,
      NETLIFY_INDEX_HTML_INTEGRITY,
    ),
  };
}

function replaceLast(value, search, replacement) {
  const index = value.lastIndexOf(search);
  assert.notEqual(index, -1, `Test input does not contain ${search}`);
  return `${value.slice(0, index)}${replacement}${value.slice(index + search.length)}`;
}

const fixtureSiteId = "03acb311-1959-40f1-9e0d-b6cc4dc34520";
const alternateSiteId = "123e4567-e89b-42d3-a456-426614174000";
const providerBlock = netlifyIndexFixture
  .slice(
    netlifyIndexFixture.indexOf("<!-- This site is hosted on Netlify."),
    netlifyIndexFixture.indexOf('    <meta name="viewport"'),
  )
  .trimEnd();

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

test("canonicalizes only the exact observed Netlify index transformation", () => {
  assert.equal(
    createHash("sha256")
      .update(normalizeTextContent(netlifyIndexFixture))
      .digest("hex"),
    "df8d4c6fb26d74614d934746a98fd980e213314d1e9547539d7ded0c20f78880",
  );
  assert.equal(
    canonicalizeNetlifyIndexHtml(indexSource),
    normalizeTextContent(indexSource),
  );
  assert.equal(
    canonicalizeNetlifyIndexHtml(netlifyIndexFixture),
    normalizeTextContent(indexSource),
  );
  assert.equal(
    canonicalizeNetlifyIndexHtml(
      netlifyIndexFixture.replaceAll(fixtureSiteId, alternateSiteId),
    ),
    normalizeTextContent(indexSource),
  );
  assert.equal(
    canonicalizeNetlifyIndexHtml(
      netlifyIndexFixture.replace(/\n/g, "\r\n"),
    ),
    normalizeTextContent(indexSource),
  );
});

test("validates raw and exactly transformed index responses", async () => {
  const resource = await indexResourceFor();

  await assert.doesNotReject(() =>
    validateResourceResponse(indexResponseFor(indexSource), resource, origin, webcrypto),
  );
  await assert.doesNotReject(() =>
    validateResourceResponse(
      indexResponseFor(netlifyIndexFixture),
      resource,
      origin,
      webcrypto,
    ),
  );
});

test("rejects malformed, mismatched, partial, duplicate, or misplaced provider blocks", async () => {
  const resource = await indexResourceFor();
  const malformedUuid = netlifyIndexFixture.replaceAll(
    fixtureSiteId,
    "not-a-valid-uuid",
  );
  const mismatchedUuid = replaceLast(
    netlifyIndexFixture,
    fixtureSiteId,
    alternateSiteId,
  );
  const wrongProvider = netlifyIndexFixture.replace(
    'content="Netlify">',
    'content="OtherHost">',
  );
  const partialBlock = netlifyIndexFixture.replace(
    '<meta name="hosting-provider" content="Netlify">\n',
    "",
  );
  const duplicateBlock = netlifyIndexFixture.replace(
    '    <meta name="viewport"',
    `${providerBlock}\n    <meta name="viewport"`,
  );
  const malformedUrl = netlifyIndexFixture.replaceAll(
    "https://netlify.new/",
    "https://example.com/",
  );
  const extraParameter = replaceLast(
    netlifyIndexFixture,
    `utm_id=${fixtureSiteId}">`,
    `utm_id=${fixtureSiteId}&amp;extra=true">`,
  );
  const reorderedQuery = netlifyIndexFixture.replace(
    "utm_campaign=ai-legible&utm_source=comment&utm_medium=referral",
    "utm_source=comment&utm_campaign=ai-legible&utm_medium=referral",
  );
  const wrongPosition = netlifyIndexFixture
    .replace(`${providerBlock}\n`, "")
    .replace(
      '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
      `    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n${providerBlock}`,
    );

  for (const candidate of [
    malformedUuid,
    mismatchedUuid,
    wrongProvider,
    partialBlock,
    duplicateBlock,
    malformedUrl,
    extraParameter,
    reorderedQuery,
    wrongPosition,
  ]) {
    await assert.rejects(() =>
      validateResourceResponse(indexResponseFor(candidate), resource, origin, webcrypto),
    );
  }
});

test("rejects unexpected metadata, scripts, stylesheets, markup, and body changes", async () => {
  const resource = await indexResourceFor();
  const changedDocuments = [
    netlifyIndexFixture.replace(
      '<meta name="hosting-provider" content="Netlify">',
      '<meta name="hosting-provider" content="Netlify">\n<meta name="netlify-extra" content="unexpected">',
    ),
    netlifyIndexFixture.replace(
      "    <title>ShelfState</title>",
      '    <script src="/unexpected.js"></script>\n    <title>ShelfState</title>',
    ),
    netlifyIndexFixture.replace(
      "src/styles/foundation.css",
      "src/styles/unexpected.css",
    ),
    netlifyIndexFixture.replace(
      'src="src/app/script.js"',
      'src="src/app/unexpected.js"',
    ),
    netlifyIndexFixture.replace("<h1>ShelfState</h1>", "<h1>Changed</h1>"),
    netlifyIndexFixture.replace(
      "<p>Welcome to ShelfState!</p>",
      "<p>Changed body content</p>",
    ),
  ];

  for (const candidate of changedDocuments) {
    await assert.rejects(
      () =>
        validateResourceResponse(
          indexResponseFor(candidate),
          resource,
          origin,
          webcrypto,
        ),
      /digest mismatch|Netlify provider/,
    );
  }
});

test("keeps transformed index validation tied to the worker release digest", async () => {
  const releaseBSource = indexSource.replace(
    "<title>ShelfState</title>",
    "<title>ShelfState Release B</title>",
  );
  const releaseBTransformed = netlifyIndexFixture.replace(
    "<title>ShelfState</title>",
    "<title>ShelfState Release B</title>",
  );
  const releaseAResource = await indexResourceFor(indexSource);
  const releaseBResource = await indexResourceFor(releaseBSource);

  await assert.rejects(
    () =>
      validateResourceResponse(
        indexResponseFor(releaseBTransformed),
        releaseAResource,
        origin,
        webcrypto,
      ),
    /digest mismatch/,
  );
  await assert.doesNotReject(() =>
    validateResourceResponse(
      indexResponseFor(releaseBTransformed),
      releaseBResource,
      origin,
      webcrypto,
    ),
  );
});

test("does not apply index canonicalization to other resources", async () => {
  const body = "export const provider = 'Netlify';\n";
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

  await assert.rejects(
    () =>
      validateResourceResponse(
        responseFor(`${body}// transformed`),
        resource,
        origin,
        webcrypto,
      ),
    /digest mismatch/,
  );
  await assert.rejects(
    () =>
      validateResourceResponse(
        responseFor(body),
        { ...resource, integrity: NETLIFY_INDEX_HTML_INTEGRITY },
        origin,
        webcrypto,
      ),
    /limited to \/index.html/,
  );
  await assert.rejects(
    () =>
      validateResourceResponse(
        responseFor(body),
        { ...resource, integrity: "unknown-integrity-mode" },
        origin,
        webcrypto,
      ),
    /Unsupported integrity mode/,
  );
});
