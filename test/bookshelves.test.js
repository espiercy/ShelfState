import test from "node:test";
import assert from "node:assert/strict";

import {
  getDefaultBookshelf,
  ensureDefaultBookshelf,
  ensureActiveBookshelfId,
  syncBookshelvesFromBooks,
  normalizeBookshelfName,
  hasBookshelfName,
  removeBookshelfFromLibrary,
  renameBookshelfInLibrary,
  assignBookToBookshelf,
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

test("normalizes bookshelf names by trimming whitespace", () => {
  assert.equal(normalizeBookshelfName("  Science Fiction "), "Science Fiction");
  assert.equal(normalizeBookshelfName("   "), "");
});

test("detects duplicate names case-insensitively with exclusions", () => {
  const bookshelves = [
    { id: "shelf-1", name: "Fantasy" },
    { id: "shelf-2", name: "History" },
  ];

  assert.equal(hasBookshelfName(bookshelves, " fantasy "), true);
  assert.equal(hasBookshelfName(bookshelves, "Science"), false);
  assert.equal(hasBookshelfName(bookshelves, "Fantasy", "shelf-1"), false);
});

test("removes a bookshelf and returns its books to the default shelf", () => {
  const bookshelves = [
    { id: "default", name: "My Library" },
    { id: "fantasy", name: "Fantasy" },
    { id: "history", name: "History" },
  ];

  const books = [
    {
      id: "book-1",
      bookshelf: "Fantasy",
      bookshelfId: "fantasy",
    },
    {
      id: "book-2",
      bookshelf: "Fantasy",
      bookshelfId: null,
    },
    {
      id: "book-3",
      bookshelf: "History",
      bookshelfId: "history",
    },
  ];

  const result = removeBookshelfFromLibrary(bookshelves, books, "fantasy");

  assert.deepEqual(
    result.bookshelves.map((bookshelf) => bookshelf.id),
    ["default", "history"],
  );
  assert.equal(result.activeBookshelfId, "default");

  assert.equal(books[0].bookshelf, "");
  assert.equal(books[0].bookshelfId, "default");
  assert.equal(books[1].bookshelf, "");
  assert.equal(books[1].bookshelfId, "default");

  assert.equal(books[2].bookshelf, "History");
  assert.equal(books[2].bookshelfId, "history");

  assert.equal(bookshelves.length, 3);
});

test("refuses to remove the default or missing bookshelf", () => {
  const bookshelves = [
    { id: "default", name: "My Library" },
    { id: "fantasy", name: "Fantasy" },
  ];

  const books = [
    {
      bookshelf: "Fantasy",
      bookshelfId: "fantasy",
    },
  ];

  assert.equal(removeBookshelfFromLibrary(bookshelves, books, "default"), null);
  assert.equal(removeBookshelfFromLibrary(bookshelves, books, "missing"), null);
  assert.equal(books[0].bookshelf, "Fantasy");
  assert.equal(books[0].bookshelfId, "fantasy");
});

test("uses null when no default bookshelf exists", () => {
  const bookshelves = [{ id: "fantasy", name: "Fantasy" }];
  const books = [
    {
      bookshelf: "Fantasy",
      bookshelfId: "fantasy",
    },
  ];

  const result = removeBookshelfFromLibrary(bookshelves, books, "fantasy");

  assert.deepEqual(result.bookshelves, []);
  assert.equal(result.activeBookshelfId, null);
  assert.equal(books[0].bookshelf, "");
  assert.equal(books[0].bookshelfId, null);
});

test("renames a bookshelf and its legacy book references", () => {
  const bookshelf = {
    id: "fantasy",
    name: "Fantasy",
  };

  const books = [
    {
      id: "book-1",
      bookshelf: "Fantasy",
      bookshelfId: "fantasy",
    },
    {
      id: "book-2",
      bookshelf: "History",
      bookshelfId: "history",
    },
    {
      id: "book-3",
      bookshelf: "",
      bookshelfId: "fantasy",
    },
  ];

  const result = renameBookshelfInLibrary(
    bookshelf,
    books,
    "Speculative Fiction",
  );

  assert.equal(result, bookshelf);
  assert.equal(bookshelf.name, "Speculative Fiction");

  assert.equal(books[0].bookshelf, "Speculative Fiction");
  assert.equal(books[0].bookshelfId, "fantasy");

  assert.equal(books[1].bookshelf, "History");
  assert.equal(books[1].bookshelfId, "history");

  assert.equal(books[2].bookshelf, "");
  assert.equal(books[2].bookshelfId, "fantasy");
});

test("assigns a book to a named bookshelf", () => {
  const book = {
    bookshelf: "",
    bookshelfId: "default",
  };

  const bookshelf = {
    id: "fantasy",
    name: "Fantasy",
  };

  const result = assignBookToBookshelf(book, bookshelf);

  assert.equal(result, book);
  assert.equal(book.bookshelf, "Fantasy");
  assert.equal(book.bookshelfId, "fantasy");
});

test("clears the legacy bookshelf name when assigning to the default shelf", () => {
  const book = {
    bookshelf: "Fantasy",
    bookshelfId: "fantasy",
  };

  const defaultBookshelf = {
    id: "default",
    name: "My Library",
  };

  assignBookToBookshelf(book, defaultBookshelf);

  assert.equal(book.bookshelf, "");
  assert.equal(book.bookshelfId, "default");
});
