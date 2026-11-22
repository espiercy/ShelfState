import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const contractDirectory = path.resolve(testDirectory, "../contracts");

test("only the authorized WP-008 persistence contract occupies the reserved contract area", async () => {
  const entries = await readdir(contractDirectory);
  assert.deepEqual(entries.sort(), [".gitkeep", "identity-session.mjs"]);
});
