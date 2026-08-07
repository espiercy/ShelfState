import test from "node:test";
import assert from "node:assert/strict";

import { migrateBooksToBookshelfIds } from "../migrations.js";

const bookshelves = [
  { id: "default", name: "My Library" },
  { id: "fantasy", name: "Fantasy" },
  { id: "existing", name: "Existing" },
];

test("migrates legacy bookshelf names to bookshelf IDs", () => {
  const books = [
    {
      title: "Fantasy Book",
      bookshelf: "Fantasy",
      bookshelfId: null,
    },
  ];

  assert.equal(migrateBooksToBookshelfIds(books, bookshelves), true);
  assert.equal(books[0].bookshelfId, "fantasy");
});

test("assigns books without a shelf name to the default bookshelf", () => {
  const books = [
    {
      title: "Unsorted Book",
      bookshelf: "",
      bookshelfId: null,
    },
  ];

  assert.equal(migrateBooksToBookshelfIds(books, bookshelves), true);
  assert.equal(books[0].bookshelfId, "default");
});

test("falls back to the default bookshelf for an unknown legacy name", () => {
  const books = [
    {
      title: "Unknown Shelf Book",
      bookshelf: "Missing Shelf",
      bookshelfId: null,
    },
  ];

  assert.equal(migrateBooksToBookshelfIds(books, bookshelves), true);
  assert.equal(books[0].bookshelfId, "default");
});

test("preserves existing bookshelf IDs", () => {
  const books = [
    {
      title: "Already Migrated",
      bookshelf: "Fantasy",
      bookshelfId: "existing",
    },
  ];

  assert.equal(migrateBooksToBookshelfIds(books, bookshelves), false);
  assert.equal(books[0].bookshelfId, "existing");
});

test("reports no migration when no destination bookshelf exists", () => {
  const books = [
    {
      title: "Orphaned Book",
      bookshelf: "Missing Shelf",
      bookshelfId: null,
    },
  ];

  assert.equal(migrateBooksToBookshelfIds(books, []), false);
  assert.equal(books[0].bookshelfId, null);
});

test("repairs a stale bookshelf ID from the legacy bookshelf name", () => {
  const books = [
    {
      bookshelf: "Fantasy",
      bookshelfId: "stale-fantasy-id",
    },
  ];

  const bookshelves = [
    { id: "default", name: "My Library" },
    { id: "fantasy", name: "Fantasy" },
  ];

  const didMigrate = migrateBooksToBookshelfIds(books, bookshelves);

  assert.equal(didMigrate, true);
  assert.equal(books[0].bookshelfId, "fantasy");
});

test("preserves an existing valid bookshelf ID", () => {
  const books = [
    {
      bookshelf: "Old Name",
      bookshelfId: "fantasy",
    },
  ];

  const bookshelves = [
    { id: "default", name: "My Library" },
    { id: "fantasy", name: "Fantasy" },
  ];

  const didMigrate = migrateBooksToBookshelfIds(books, bookshelves);

  assert.equal(didMigrate, false);
  assert.equal(books[0].bookshelfId, "fantasy");
});
