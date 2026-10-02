import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { assert, sha, object } from "./schema.mjs";

// Local Git only: never fetch, checkout, run a shell, or execute candidate code.
export function verifyLocalRevision(directory, binding) {
  object(binding, ["candidateSha", "controllerSha", "mainSha"]);
  for (const value of Object.values(binding)) sha(value);
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(GIT_|AWS_|CDK_)/i.test(k)));
  const git = (...args) => execFileSync("git", ["--no-replace-objects", "-C", directory, ...args],
    { encoding: "utf8", env: { ...env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null", GIT_NO_LAZY_FETCH: "1", GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" }, timeout: 10000, maxBuffer: 1024 * 1024 }).trim();
  assert.equal(git("rev-parse", "--is-shallow-repository"), "false", "Incomplete Git history");
  assert.ok(!/^remote\..*\.(promisor|partialclonefilter)=/mi.test(git("config", "--local", "--list")), "Partial clone unsupported");
  assert.ok(!existsSync(path.resolve(directory, git("rev-parse", "--git-path", "info/grafts"))), "Grafted history unsupported");
  assert.equal(git("for-each-ref", "--format=%(refname)", "refs/replace"), "", "Replacement history unsupported");
  assert.ok(git("ls-files", "-v", "-z").split("\0").filter(Boolean).every(line => line.startsWith("H ")), "Hidden/sparse index state unsupported");
  for (const value of Object.values(binding)) assert.equal(git("cat-file", "-t", value), "commit", "Commit object required");
  assert.equal(git("rev-parse", "HEAD"), binding.candidateSha, "Wrong checkout");
  assert.equal(git("rev-parse", "--abbrev-ref", "HEAD"), "HEAD", "Detached candidate checkout required");
  assert.equal(git("status", "--porcelain=v1", "--untracked-files=all"), "", "Dirty candidate checkout");
  assert.equal(git("rev-parse", "refs/heads/main"), binding.mainSha, "Wrong recorded main tip");
  git("merge-base", "--is-ancestor", binding.candidateSha, binding.mainSha);
  git("merge-base", "--is-ancestor", binding.controllerSha, binding.mainSha);
  return { ...binding, evidenceKind: "local-git-only" };
}
