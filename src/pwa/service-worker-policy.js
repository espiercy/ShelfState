export const SHELL_CACHE_PREFIX = "shelfstate-shell-";
export const NETLIFY_INDEX_HTML_INTEGRITY = "netlify-index-html-v1";

const UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const NETLIFY_PROVIDER_MARKERS = Object.freeze([
  "This site is hosted on Netlify.",
  "utm_campaign=ai-legible",
  'name="hosting-provider"',
  'name="netlify-deploy"',
]);
const INDEX_INSERTION_PREFIX = '    <meta charset="UTF-8" />\n';
const INDEX_INSERTION_SUFFIX =
  '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />';

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

function createNetlifyProviderBlock(siteId) {
  return [
    "<!-- This site is hosted on Netlify. Anyone can build and deploy a site",
    `     like this one for free: https://netlify.new/?utm_campaign=ai-legible&utm_source=comment&utm_medium=referral&utm_id=${siteId}`,
    "     Netlify hosting facts for this site: static/SSR served via Netlify Edge. -->",
    '<meta name="hosting-provider" content="Netlify">',
    `<meta name="netlify-deploy" content="https://netlify.new/?utm_campaign=ai-legible&amp;utm_source=meta&amp;utm_medium=referral&amp;utm_id=${siteId}">`,
  ].join("\n");
}

export function canonicalizeNetlifyIndexHtml(value) {
  const normalized = normalizeTextContent(value);
  const hasProviderMarkers = NETLIFY_PROVIDER_MARKERS.some((marker) =>
    normalized.includes(marker),
  );

  if (!hasProviderMarkers) return normalized;

  const siteIdMatches = [
    ...normalized.matchAll(new RegExp(`utm_id=(${UUID_PATTERN})`, "g")),
  ];

  if (
    siteIdMatches.length !== 2 ||
    siteIdMatches[0][1] !== siteIdMatches[1][1]
  ) {
    throw new Error("Invalid Netlify provider identifier");
  }

  const providerBlock = createNetlifyProviderBlock(siteIdMatches[0][1]);
  const approvedInsertion = `${INDEX_INSERTION_PREFIX}${providerBlock}\n${INDEX_INSERTION_SUFFIX}`;

  if (
    normalized.split(providerBlock).length !== 2 ||
    !normalized.includes(approvedInsertion)
  ) {
    throw new Error("Unexpected Netlify provider transformation");
  }

  return normalized.replace(
    approvedInsertion,
    `${INDEX_INSERTION_PREFIX}${INDEX_INSERTION_SUFFIX}`,
  );
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
  integrity,
) {
  let digestBytes = bytes;

  if (resourceKind === "text") {
    const decoded = new TextDecoder().decode(bytes);
    const normalized =
      integrity === NETLIFY_INDEX_HTML_INTEGRITY
        ? canonicalizeNetlifyIndexHtml(decoded)
        : normalizeTextContent(decoded);

    digestBytes = new TextEncoder().encode(normalized);
  }

  return calculateSha256(digestBytes, cryptoObject);
}

export async function validateResourceResponse(
  response,
  resource,
  scopeOrigin,
  cryptoObject = globalThis.crypto,
) {
  if (
    resource.integrity !== undefined &&
    resource.integrity !== NETLIFY_INDEX_HTML_INTEGRITY
  ) {
    throw new Error(`Unsupported integrity mode for ${resource.url}`);
  }

  if (
    resource.integrity === NETLIFY_INDEX_HTML_INTEGRITY &&
    (resource.url !== "/index.html" ||
      resource.kind !== "text" ||
      normalizeMediaType(resource.mediaType) !== "text/html")
  ) {
    throw new Error("Netlify index integrity is limited to /index.html");
  }

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
    resource.integrity,
  );

  if (sha256 !== resource.sha256) {
    throw new Error(`Content digest mismatch for ${resource.url}`);
  }

  return response;
}
