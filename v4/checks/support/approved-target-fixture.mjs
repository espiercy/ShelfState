import { readFile } from "node:fs/promises";

// Test-only module isolation: substitute literal, independently precomputed
// fixture pins in a copy of source. No production API accepts caller-owned pins.
export const fixturePins = Object.freeze({
  dev: "d968249625ec86974988b95b9bc2d1792ad4a66b1905abbf86f95bc66ac3389c",
  production: "2c6106f0088b5efb78e13f476aaef9c9265869d4b3b515633d1da613bcd487c9",
});
const base = new URL("../../scripts/release/", import.meta.url);
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const resolveImports = source => source.replace(/from "(\.\/[^\"]+)"/g, (_, p) => `from "${new URL(p, base).href}"`);
export async function fixtureModules(pins = fixturePins) {
  const source = await readFile(new URL("approved-targets.mjs", base), "utf8");
  const replacement = source.replace(/dev: "[a-f0-9]{64}"/, `dev: "${pins.dev}"`)
    .replace(/production: "[a-f0-9]{64}"/, `production: "${pins.production}"`);
  const targetUrl = moduleUrl(resolveImports(replacement));
  const evidenceSource = (await readFile(new URL("evidence.mjs", base), "utf8"))
    .replaceAll('"./approved-targets.mjs"', JSON.stringify(targetUrl));
  const oidcSource = (await readFile(new URL("oidc-denial.mjs", base), "utf8"))
    .replaceAll('"./approved-targets.mjs"', JSON.stringify(targetUrl));
  return { targets: await import(targetUrl), evidence: await import(moduleUrl(resolveImports(evidenceSource))),
    oidc: await import(moduleUrl(resolveImports(oidcSource))) };
}
