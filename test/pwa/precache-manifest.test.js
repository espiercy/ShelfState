import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  canonicalizeNetlifyIndexHtml,
  NETLIFY_INDEX_HTML_INTEGRITY,
} from "../../src/pwa/service-worker-policy.js";
import {
  buildPrecacheManifest,
  calculateReleaseSha256,
  renderPrecacheManifest,
  SHELL_RESOURCE_DEFINITIONS,
  WORKER_RELEASE_SOURCES,
} from "../../scripts/generate-precache-manifest.mjs";
import {
  PRECACHE_RESOURCES,
  SHELL_CACHE_NAME,
} from "../../src/pwa/precache-manifest.js";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(testDirectory, "../..");

function normalizeText(value) {
  return value.replace(/\r\n?|\r/g, "\n");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function independentFileDigest(resource) {
  const bytes = await readFile(path.join(rootDirectory, resource.url.slice(1)));

  if (resource.kind !== "text") return sha256(bytes);

  const text = bytes.toString("utf8");
  return sha256(
    resource.integrity === NETLIFY_INDEX_HTML_INTEGRITY
      ? canonicalizeNetlifyIndexHtml(text)
      : normalizeText(text),
  );
}

async function discoverApplicationShell() {
  const discovered = new Set(["/index.html"]);
  const html = await readFile(path.join(rootDirectory, "index.html"), "utf8");

  for (const match of html.matchAll(/<(?:link|script)\b[^>]*(?:href|src)="([^"]+)"/g)) {
    discovered.add(new URL(match[1], "https://shelfstate.test/").pathname);
  }

  const manifest = JSON.parse(
    await readFile(path.join(rootDirectory, "manifest.webmanifest"), "utf8"),
  );

  for (const icon of manifest.icons) {
    discovered.add(new URL(icon.src, "https://shelfstate.test/").pathname);
  }

  const pendingModules = [...discovered].filter((url) => url.endsWith(".js"));

  while (pendingModules.length > 0) {
    const moduleUrl = pendingModules.pop();
    const source = await readFile(
      path.join(rootDirectory, moduleUrl.slice(1)),
      "utf8",
    );
    const specifiers = [
      ...source.matchAll(/\bfrom\s+["']([^"']+)["']/g),
      ...source.matchAll(/\bimport\s+["']([^"']+)["']/g),
    ].map((match) => match[1]);

    for (const specifier of specifiers) {
      const importedUrl = new URL(
        specifier,
        `https://shelfstate.test${moduleUrl}`,
      ).pathname;

      if (!discovered.has(importedUrl)) {
        discovered.add(importedUrl);
        pendingModules.push(importedUrl);
      }
    }
  }

  return discovered;
}

test("the inventory exactly covers the application shell dependency graph", async () => {
  const discovered = await discoverApplicationShell();
  const configured = new Set(
    SHELL_RESOURCE_DEFINITIONS.map((resource) => resource.url),
  );

  assert.equal(configured.size, 38);
  assert.deepEqual([...configured].sort(), [...discovered].sort());
});

test("the generated manifest independently matches repository content", async () => {
  assert.equal(PRECACHE_RESOURCES.length, 38);
  assert.deepEqual(
    PRECACHE_RESOURCES.map(({ url, kind, mediaType, integrity }) => ({
      url,
      kind,
      mediaType,
      ...(integrity ? { integrity } : {}),
    })),
    SHELL_RESOURCE_DEFINITIONS,
  );

  for (const resource of PRECACHE_RESOURCES) {
    assert.equal(
      resource.sha256,
      await independentFileDigest(resource),
      `Stale digest for ${resource.url}`,
    );
  }

  const workerSources = [];

  for (const url of WORKER_RELEASE_SOURCES) {
    workerSources.push({
      url,
      sha256: await independentFileDigest({ url, kind: "text" }),
    });
  }

  const expectedReleaseSha256 = sha256(
    JSON.stringify({ resources: PRECACHE_RESOURCES, workerSources }),
  );

  assert.equal(SHELL_CACHE_NAME, `shelfstate-shell-${expectedReleaseSha256}`);
});

test("only index.html declares the Netlify canonical integrity mode", () => {
  const canonicalResources = PRECACHE_RESOURCES.filter(
    (resource) => resource.integrity === NETLIFY_INDEX_HTML_INTEGRITY,
  );

  assert.deepEqual(canonicalResources.map((resource) => resource.url), [
    "/index.html",
  ]);
  assert.equal(
    PRECACHE_RESOURCES.filter(
      (resource) =>
        resource.url !== "/index.html" && "integrity" in resource,
    ).length,
    0,
  );
});

test("manifest generation is deterministic and checked-in output is current", async () => {
  const first = await buildPrecacheManifest(rootDirectory);
  const second = await buildPrecacheManifest(rootDirectory);
  const checkedIn = await readFile(
    path.join(rootDirectory, "src/pwa/precache-manifest.js"),
    "utf8",
  );

  assert.deepEqual(first, second);
  assert.equal(renderPrecacheManifest(first), normalizeText(checkedIn));
});

test("the release digest changes with resources or worker policy", () => {
  const resources = [{ url: "/index.html", sha256: "resource-a" }];
  const workerSources = [{ url: "/service-worker.js", sha256: "worker-a" }];
  const baseline = calculateReleaseSha256(resources, workerSources);

  assert.notEqual(
    baseline,
    calculateReleaseSha256(
      [{ url: "/index.html", sha256: "resource-b" }],
      workerSources,
    ),
  );
  assert.notEqual(
    baseline,
    calculateReleaseSha256(resources, [
      { url: "/service-worker.js", sha256: "worker-b" },
    ]),
  );
});
