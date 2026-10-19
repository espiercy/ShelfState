import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export { assert };
export const REPOSITORY = "espiercy/ShelfState";
export function object(value, keys, label = "evidence") {
  assert.ok(value && Object.getPrototypeOf(value) === Object.prototype, `${label}: object required`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label}: missing/unsupported fields`);
}
export function sha(value) { assert.equal(typeof value, "string"); assert.match(value, /^[a-f0-9]{40}$/, "Full SHA required"); }
export function digest(value) { assert.equal(typeof value, "string"); assert.match(value, /^[a-f0-9]{64}$/, "SHA-256 required"); }
export function environment(value) { assert.ok(["dev", "production"].includes(value), "Unknown environment"); }
export function text(value) { assert.equal(typeof value, "string"); assert.ok(value.length > 0 && value.length <= 1024 && !/[\x00-\x1f]/.test(value), "Invalid text"); }
export function timestamp(value) {
  assert.equal(typeof value, "string");
  assert.match(value, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  assert.equal(new Date(value).toISOString(), value, "Invalid timestamp");
}
export function canonical(value) {
  function sort(v, depth = 0) {
    assert.ok(depth <= 32, "Evidence too deeply nested");
    if (v === null || typeof v === "string" || typeof v === "boolean") return v;
    if (typeof v === "number") { assert.ok(Number.isFinite(v)); return v; }
    if (Array.isArray(v)) return v.map(x => sort(x, depth + 1));
    assert.ok(v && Object.getPrototypeOf(v) === Object.prototype, "JSON data required");
    return Object.fromEntries(Object.keys(v).sort().map(k => {
      assert.ok(!["__proto__", "constructor", "prototype"].includes(k), "Unsafe JSON key");
      return [k, sort(v[k], depth + 1)];
    }));
  }
  return JSON.stringify(sort(value));
}
export const hash = bytes => createHash("sha256").update(bytes).digest("hex");
export const hashObject = value => hash(canonical(value));
export function equal(actual, expected, label) { assert.equal(canonical(actual), canonical(expected), label); }

// JSON.parse silently accepts duplicate object keys. Reject them at byte ingress
// so another consumer cannot interpret a signed/hashed document differently.
export function parseEvidenceJson(bytes) {
  assert.ok(bytes.byteLength <= 16 * 1024 * 1024, "JSON evidence too large");
  const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  let i = 0;
  const whitespace = () => { while (/[ \t\r\n]/.test(source[i] ?? "")) i++; };
  function string() {
    const start = i++; let escaped = false;
    while (i < source.length) {
      const c = source[i++];
      if (!escaped && c === '"') return JSON.parse(source.slice(start, i));
      if (!escaped && c === "\\") escaped = true; else escaped = false;
    }
    throw new Error("Unterminated JSON string");
  }
  function value(depth) {
    assert.ok(depth <= 32, "JSON evidence too deeply nested"); whitespace();
    if (source[i] === '"') return string();
    if (source[i] === "{" || source[i] === "[") {
      const isObject = source[i++] === "{", close = isObject ? "}" : "]", result = isObject ? {} : [], seen = new Set();
      whitespace(); if (source[i] === close) { i++; return result; }
      let count = 0;
      while (i < source.length) {
        assert.ok(++count <= 8192, "JSON collection too large"); whitespace();
        if (isObject) {
          assert.equal(source[i], '"', "JSON object key required"); const key = string();
          assert.ok(!seen.has(key) && !["__proto__", "constructor", "prototype"].includes(key), "Duplicate/unsafe JSON key"); seen.add(key);
          whitespace(); assert.equal(source[i++], ":"); result[key] = value(depth + 1);
        } else result.push(value(depth + 1));
        whitespace(); const separator = source[i++]; if (separator === close) return result;
        assert.equal(separator, ",", "Invalid JSON delimiter");
      }
      throw new Error("Incomplete JSON container");
    }
    const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(source.slice(i));
    assert.ok(match, "Invalid JSON value"); i += match[0].length; const result = JSON.parse(match[0]);
    assert.ok(typeof result !== "number" || Number.isFinite(result), "Non-finite JSON number"); return result;
  }
  const result = value(0); whitespace(); assert.equal(i, source.length, "Trailing JSON data"); return result;
}
