import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// A deliberately small tripwire, not a substitute for credential rotation or
// a comprehensive secret-scanning service. Never print a matching value.
export function findObviousCredentialSignals(source) {
  const signals = [];
  if (/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/.test(source)) {
    signals.push("AWS access key ID");
  }
  if (/\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}\b/.test(source)) {
    signals.push("GitHub token");
  }
  if (/-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----/.test(source)) {
    signals.push("private key header");
  }
  return signals;
}

export async function scanTrackedFiles(rootDirectory = repositoryRoot) {
  const listing = spawnSync("git", ["ls-files", "--cached", "-z"], {
    cwd: rootDirectory,
    encoding: "buffer",
  });
  if (listing.status !== 0 || listing.error) {
    throw new Error("Could not enumerate tracked files for credential check");
  }

  const findings = [];
  for (const name of listing.stdout.toString("utf8").split("\0")) {
    if (!name) continue;
    const bytes = await readFile(path.join(rootDirectory, name));
    // This narrow tripwire scans NUL-free UTF-8/ASCII-compatible text only.
    // Binary and UTF-16 files are deliberately outside its detection boundary.
    if (bytes.includes(0)) continue;
    const signals = findObviousCredentialSignals(bytes.toString("utf8"));
    if (signals.length) findings.push({ path: name, signals });
  }
  return findings;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const findings = await scanTrackedFiles();
    for (const finding of findings) {
      console.error(`${finding.path}: ${finding.signals.join(", ")}`);
    }
    if (findings.length) process.exitCode = 1;
    else console.log("Tracked-file credential tripwire: no obvious matches");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
