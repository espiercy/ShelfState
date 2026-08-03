import test from "node:test";
import assert from "node:assert/strict";

import { chunkBooks } from "../layout.js";

test("returns no chunks for an empty book list", () => {
  assert.deepEqual(chunkBooks([], 5), []);
});

test("keeps books together when they fit on one shelf", () => {
  assert.deepEqual(chunkBooks([1, 2, 3, 4, 5], 5), [[1, 2, 3, 4, 5]]);
});

test("splits overflow into continued shelves in order", () => {
  assert.deepEqual(chunkBooks([1, 2, 3, 4, 5, 6], 5), [[1, 2, 3, 4, 5], [6]]);
});

test("rejects invalid shelf capacities", () => {
  assert.throws(
    () => chunkBooks([1], 0),
    new RangeError("Chunk size must be a positive integer."),
  );

  assert.throws(
    () => chunkBooks([1], -1),
    new RangeError("Chunk size must be a positive integer."),
  );

  assert.throws(
    () => chunkBooks([1], 1.5),
    new RangeError("Chunk size must be a positive integer."),
  );
});
