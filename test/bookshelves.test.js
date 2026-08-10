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
  addBookshelfToLibrary,
  getBooksForBookshelf,
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

test("removes a bookshelf and reassigns only books matched by ID", () => {
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
  assert.equal(books[1].bookshelf, "Fantasy");
  assert.equal(books[1].bookshelfId, null);

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

test("renames a bookshelf", () => {
  const bookshelf = {
    id: "fantasy",
    name: "Fantasy",
  };

  const result = renameBookshelfInLibrary(bookshelf, "Speculative Fiction");

  assert.equal(result, bookshelf);
  assert.equal(bookshelf.name, "Speculative Fiction");
});

test("assigns a book to a named bookshelf by ID", () => {
  const book = {
    bookshelf: "Old Shelf",
    bookshelfId: "old-shelf",
  };

  const bookshelf = {
    id: "fantasy",
    name: "Fantasy",
  };

  const result = assignBookToBookshelf(book, bookshelf);

  assert.equal(result, book);
  assert.equal(book.bookshelf, "");
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

test("adds a normalized bookshelf to the library", () => {
  const bookshelves = [{ id: "default", name: "My Library" }];

  const bookshelf = addBookshelfToLibrary(bookshelves, " Science Fiction ");

  assert.equal(bookshelf.name, "Science Fiction");
  assert.equal(typeof bookshelf.id, "string");
  assert.equal(bookshelves.length, 2);
  assert.equal(bookshelves[1], bookshelf);
});

test("refuses empty and duplicate bookshelf names", () => {
  const bookshelves = [
    { id: "default", name: "My Library" },
    { id: "fantasy", name: "Fantasy" },
  ];

  assert.equal(addBookshelfToLibrary(bookshelves, "   "), null);
  assert.equal(addBookshelfToLibrary(bookshelves, " fantasy "), null);
  assert.equal(bookshelves.length, 2);
});

test("finds books assigned to a bookshelf by ID", () => {
  const bookshelf = { id: "fantasy", name: "Fantasy" };
  const books = [
    { title: "Assigned", bookshelfId: "fantasy", bookshelf: "" },
    { title: "Elsewhere", bookshelfId: "history", bookshelf: "History" },
  ];

  const matchingBooks = getBooksForBookshelf(books, bookshelf);

  assert.deepEqual(
    matchingBooks.map((book) => book.title),
    ["Assigned"],
  );
});

test("ignores legacy bookshelf names when IDs are missing", () => {
  const bookshelf = { id: "fantasy", name: "Fantasy" };
  const books = [
    { title: "Legacy", bookshelfId: null, bookshelf: "Fantasy" },
    { title: "Default", bookshelfId: null, bookshelf: "" },
  ];

  const matchingBooks = getBooksForBookshelf(books, bookshelf);

  assert.deepEqual(matchingBooks, []);
});

test("ignores legacy bookshelf names when stored IDs are stale", () => {
  const bookshelf = { id: "fantasy", name: "Fantasy" };
  const books = [
    {
      title: "Legacy",
      bookshelfId: "stale-fantasy-id",
      bookshelf: "Fantasy",
    },
  ];

  const matchingBooks = getBooksForBookshelf(books, bookshelf);

  assert.deepEqual(matchingBooks, []);
});
