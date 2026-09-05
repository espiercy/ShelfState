import {
  PRECACHE_RESOURCES,
  SHELL_CACHE_NAME,
} from "./src/pwa/precache-manifest.js";
import {
  classifyRequest,
  isOwnedShellCache,
  validateResourceResponse,
} from "./src/pwa/service-worker-policy.js";

const PRECACHE_BY_PATH = new Map(
  PRECACHE_RESOURCES.map((resource) => [resource.url, resource]),
);
const PRECACHED_PATHS = new Set(PRECACHE_BY_PATH.keys());
const INDEX_RESOURCE = PRECACHE_BY_PATH.get("/index.html");

function createApplicationRequest(resourceUrl) {
  return new Request(new URL(resourceUrl, self.location.origin), {
    cache: "no-store",
    credentials: "same-origin",
  });
}

async function fetchVerifiedResource(resource) {
  const response = await fetch(createApplicationRequest(resource.url));

  return validateResourceResponse(response, resource, self.location.origin);
}

async function populateReleaseCache() {
  await caches.delete(SHELL_CACHE_NAME);

  const cache = await caches.open(SHELL_CACHE_NAME);

  try {
    for (const resource of PRECACHE_RESOURCES) {
      const response = await fetchVerifiedResource(resource);
      await cache.put(createApplicationRequest(resource.url), response);
    }
  } catch (error) {
    await caches.delete(SHELL_CACHE_NAME);
    throw error;
  }
}

async function removeObsoleteShellCaches() {
  const cacheNames = await caches.keys();
  const obsoleteCacheNames = cacheNames.filter(
    (cacheName) =>
      isOwnedShellCache(cacheName) && cacheName !== SHELL_CACHE_NAME,
  );

  await Promise.all(
    obsoleteCacheNames.map((cacheName) => caches.delete(cacheName)),
  );
}

async function serveExpectedResource(resource) {
  const cache = await caches.open(SHELL_CACHE_NAME);
  const cacheKey = createApplicationRequest(resource.url);
  const cachedResponse = await cache.match(cacheKey);

  if (cachedResponse) return cachedResponse;

  const recoveredResponse = await fetchVerifiedResource(resource);
  await cache.put(cacheKey, recoveredResponse.clone());

  return recoveredResponse;
}

self.addEventListener("install", (event) => {
  event.waitUntil(populateReleaseCache());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(removeObsoleteShellCaches());
});

self.addEventListener("fetch", (event) => {
  const requestClass = classifyRequest(
    event.request,
    self.location.origin,
    PRECACHED_PATHS,
  );

  if (requestClass === "shell-navigation") {
    event.respondWith(serveExpectedResource(INDEX_RESOURCE));
    return;
  }

  if (requestClass === "precached-resource") {
    const requestPath = new URL(event.request.url).pathname;
    event.respondWith(serveExpectedResource(PRECACHE_BY_PATH.get(requestPath)));
  }
});
