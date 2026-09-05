export const SHELL_CACHE_PREFIX = "shelfstate-shell-";

const JAVASCRIPT_MEDIA_TYPES = new Set([
  "application/javascript",
  "text/javascript",
]);

const MANIFEST_MEDIA_TYPES = new Set([
  "application/json",
  "application/manifest+json",
]);

export function normalizeTextContent(value) {
  return value.replace(/\r\n?|\r/g, "\n");
}

export function normalizeMediaType(value) {
  return value?.split(";", 1)[0].trim().toLowerCase() ?? "";
}

export function isAcceptedMediaType(actualValue, expectedValue) {
  const actual = normalizeMediaType(actualValue);
  const expected = normalizeMediaType(expectedValue);

  if (expected === "text/javascript") {
    return JAVASCRIPT_MEDIA_TYPES.has(actual);
  }

  if (expected === "application/manifest+json") {
    return MANIFEST_MEDIA_TYPES.has(actual);
  }

  return actual !== "" && actual === expected;
}

export function classifyRequest(request, scopeOrigin, precachedPaths) {
  if (request.method !== "GET") return "bypass";

  const requestUrl = new URL(request.url);

  if (requestUrl.origin !== scopeOrigin) return "bypass";

  if (request.mode === "navigate") {
    return requestUrl.pathname === "/" || requestUrl.pathname === "/index.html"
      ? "shell-navigation"
      : "network";
  }

  if (requestUrl.search || requestUrl.hash) return "network";

  return precachedPaths.has(requestUrl.pathname)
    ? "precached-resource"
    : "network";
}

export function isOwnedShellCache(cacheName) {
  return cacheName.startsWith(SHELL_CACHE_PREFIX);
}

export async function calculateSha256(bytes, cryptoObject = globalThis.crypto) {
  const digest = await cryptoObject.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function calculateResourceSha256(
  bytes,
  resourceKind,
  cryptoObject = globalThis.crypto,
) {
  let digestBytes = bytes;

  if (resourceKind === "text") {
    const decoded = new TextDecoder().decode(bytes);
    digestBytes = new TextEncoder().encode(normalizeTextContent(decoded));
  }

  return calculateSha256(digestBytes, cryptoObject);
}

export async function validateResourceResponse(
  response,
  resource,
  scopeOrigin,
  cryptoObject = globalThis.crypto,
) {
  if (!response.ok) {
    throw new Error(`Failed to fetch ${resource.url}: HTTP ${response.status}`);
  }

  if (new URL(response.url).origin !== scopeOrigin) {
    throw new Error(`Unexpected response origin for ${resource.url}`);
  }

  if (
    !isAcceptedMediaType(
      response.headers.get("content-type"),
      resource.mediaType,
    )
  ) {
    throw new Error(`Unexpected media type for ${resource.url}`);
  }

  const bytes = await response.clone().arrayBuffer();
  const sha256 = await calculateResourceSha256(
    bytes,
    resource.kind,
    cryptoObject,
  );

  if (sha256 !== resource.sha256) {
    throw new Error(`Content digest mismatch for ${resource.url}`);
  }

  return response;
}
