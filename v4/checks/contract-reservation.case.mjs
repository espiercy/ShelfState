import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const contractDirectory = path.resolve(testDirectory, "../contracts");

test("OpenAPI and shared contracts remain reserved for later work packages", async () => {
  const entries = await readdir(contractDirectory);
  assert.deepEqual(entries.sort(), [".gitkeep"]);
});
