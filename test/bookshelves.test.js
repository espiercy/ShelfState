import test from "node:test";
import assert from "node:assert/strict";

import {
  getDefaultBookshelf,
  ensureDefaultBookshelf,
  ensureActiveBookshelfId,
  syncBookshelvesFromBooks,
} from "../bookshelves.js";

test("finds the default bookshelf by name", () => {
  const bookshelves = [
    { id: "shelf-1", name: "Favorites" },
    { id: "shelf-2", name: "My Library" },
  ];

  assert.equal(getDefaultBookshelf(bookshelves), bookshelves[1]);
  assert.equal(
    getDefaultBookshelf([{ id: "shelf-1", name: "Favorites" }]),
    undefined,
  );
});

test("creates a default bookshelf only for an empty collection", () => {
  const created = ensureDefaultBookshelf([]);

  assert.equal(created.length, 1);
  assert.equal(created[0].name, "My Library");
  assert.equal(typeof created[0].id, "string");

  const existing = [{ id: "shelf-1", name: "Favorites" }];

  assert.equal(ensureDefaultBookshelf(existing), existing);
});

test("preserves a valid active bookshelf and falls back safely", () => {
  const bookshelves = [
    { id: "shelf-1", name: "First" },
    { id: "shelf-2", name: "Second" },
  ];

  assert.equal(ensureActiveBookshelfId(bookshelves, "shelf-2"), "shelf-2");
  assert.equal(ensureActiveBookshelfId(bookshelves, "missing"), "shelf-1");
  assert.equal(ensureActiveBookshelfId([], "missing"), null);
});

test("synchronizes unique legacy bookshelf names without mutation", () => {
  const bookshelves = [{ id: "default", name: "My Library" }];

  const synchronized = syncBookshelvesFromBooks(bookshelves, [
    { bookshelf: " Fantasy " },
    { bookshelf: "fantasy" },
    { bookshelf: "   " },
    {},
  ]);

  assert.deepEqual(
    synchronized.map((bookshelf) => bookshelf.name),
    ["My Library", "Fantasy"],
  );
  assert.equal(bookshelves.length, 1);
});
