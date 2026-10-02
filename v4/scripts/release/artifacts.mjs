import { lstat, readdir, realpath, open } from "node:fs/promises";
import path from "node:path";
import { assert, object, digest, hash, equal } from "./schema.mjs";

export const LIMITS = Object.freeze({ files: 4096, bytesPerFile: 16 * 1024 * 1024, totalBytes: 64 * 1024 * 1024 });
export function artifactPath(value) {
  assert.equal(typeof value, "string");
  assert.ok(value.length > 0 && value.length <= 240, "Invalid artifact path length");
  assert.ok(!value.includes("\\") && !path.posix.isAbsolute(value) && !path.win32.isAbsolute(value), "Absolute/ambiguous artifact path");
  for (const segment of value.split("/")) {
    assert.match(segment, /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/, "Unsafe artifact path");
    assert.ok(!segment.endsWith(".") && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment), "Ambiguous device path");
  }
  return value;
}
export function validateInventory(files) {
  assert.ok(Array.isArray(files) && files.length > 0 && files.length <= LIMITS.files, "Artifact inventory required/bounded");
  let previous = "", total = 0;
  const seen = new Set();
  for (const f of files) {
    object(f, ["path", "bytes", "sha256"], "artifact"); artifactPath(f.path); digest(f.sha256);
    assert.ok(!seen.has(f.path.toLowerCase()), "Duplicate/ambiguous artifact path"); seen.add(f.path.toLowerCase());
    assert.ok(previous < f.path, "Inventory must be sorted"); previous = f.path;
    assert.ok(Number.isSafeInteger(f.bytes) && f.bytes >= 0 && f.bytes <= LIMITS.bytesPerFile, "Invalid artifact size");
    total += f.bytes;
  }
  assert.ok(total <= LIMITS.totalBytes, "Artifact too large");
  for (const f of files) {
    const segments = f.path.toLowerCase().split("/"); segments.pop();
    while (segments.length) { assert.ok(!seen.has(segments.join("/")), "File/directory confusion"); segments.pop(); }
  }
}

// No archive extraction, glob expansion, evaluation, or remote IO. Caller owns a
// quiescent private staging directory. Reject links, including linked ancestors.
export async function inventory(root) {
  const absolute = path.resolve(root);
  for (let p = absolute;; p = path.dirname(p)) {
    const s = await lstat(p); assert.ok(s.isDirectory() && !s.isSymbolicLink(), "Linked/non-directory artifact root");
    if (path.dirname(p) === p) break;
  }
  const actualRoot = await realpath(absolute), files = []; let total = 0;
  async function visit(dir, prefix = "") {
    const entries = await readdir(dir, { withFileTypes: true });
    assert.ok(entries.length <= LIMITS.files, "Too many entries");
    for (const entry of entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const logical = artifactPath(prefix + entry.name), target = path.join(dir, entry.name);
      const s = await lstat(target);
      assert.ok(!s.isSymbolicLink(), "Linked artifact rejected");
      assert.equal(await realpath(target), path.join(actualRoot, ...logical.split("/")), "Artifact escaped root");
      if (s.isDirectory()) {
        assert.ok(logical.split("/").length <= 16, "Artifact directory depth exceeded");
        await visit(target, logical + "/"); continue;
      }
      assert.ok(s.isFile() && s.nlink === 1, "Linked/special artifact rejected");
      assert.ok(s.size <= LIMITS.bytesPerFile && ++total <= LIMITS.files, "Artifact limit exceeded");
      const handle = await open(target, "r");
      try {
        const before = await handle.stat();
        assert.ok(before.isFile() && before.nlink === 1 && before.ino === s.ino && before.dev === s.dev && before.size === s.size, "Artifact changed while opening");
        const bytes = await handle.readFile(); const after = await handle.stat();
        assert.ok(after.size === before.size && after.mtimeMs === before.mtimeMs && after.ctimeMs === before.ctimeMs && bytes.length === before.size, "Artifact changed while reading");
        files.push({ path: logical, bytes: bytes.length, sha256: hash(bytes) });
      } finally { await handle.close(); }
    }
  }
  await visit(absolute); files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  validateInventory(files); return files;
}
export async function verifyInventory(root, expected) {
  validateInventory(expected); const actual = await inventory(root);
  equal(actual, expected, "Artifact inventory/bytes mismatch"); return actual;
}
