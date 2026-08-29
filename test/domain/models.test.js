import test from "node:test";
import assert from "node:assert/strict";

import { Book, Bookshelf } from "../../src/domain/models.js";

test("updates a book and its modification timestamp", () => {
  const originalUpdatedAt = new Date("2020-01-01T00:00:00.000Z");

  const book = new Book({
    id: "book-1",
    title: "Old Title",
    author: "Old Author",
    pages: 100,
    progress: 10,
    status: "not-started",
    bookshelfId: "shelf-1",
    updatedAt: originalUpdatedAt,
  });

  book.update({
    title: "New Title",
    author: "New Author",
    pages: 200,
    progress: 50,
    status: "currently-reading",
    bookshelfId: "shelf-2",
  });

  assert.equal(book.title, "New Title");
  assert.equal(book.author, "New Author");
  assert.equal(book.pages, 200);
  assert.equal(book.progress, 50);
  assert.equal(book.status, "currently-reading");
  assert.equal(book.bookshelfId, "shelf-2");
  assert.notEqual(book.updatedAt, originalUpdatedAt);
});

test("supplies safe defaults without the legacy bookshelf field", () => {
  const book = new Book({
    title: "Book",
    bookshelf: "Legacy Shelf",
  });

  assert.equal(typeof book.id, "string");
  assert.notEqual(book.id, "");
  assert.equal(Object.hasOwn(book, "bookshelf"), false);
  assert.equal(book.bookshelfId, null);
  assert.equal(book.createdAt instanceof Date, true);
  assert.equal(book.updatedAt instanceof Date, true);
});

test("preserves the bookshelf ID when an update omits it", () => {
  const book = new Book({
    id: "book-1",
    title: "Old Title",
    bookshelfId: "shelf-1",
  });

  book.update({
    title: "New Title",
    author: "Author",
    pages: 100,
    progress: 25,
    status: "currently-reading",
  });

  assert.equal(book.bookshelfId, "shelf-1");
});

test("creates bookshelves without obsolete membership state", () => {
  const first = new Bookshelf({
    name: "First",
  });

  const second = new Bookshelf({
    name: "Second",
  });

  assert.equal(typeof first.id, "string");
  assert.equal(typeof second.id, "string");
  assert.notEqual(first.id, second.id);
  assert.equal(Object.hasOwn(first, "bookIds"), false);
  assert.equal(Object.hasOwn(second, "bookIds"), false);
  assert.equal(first.isDefault, false);
  assert.equal(second.isDefault, false);

  const provided = new Bookshelf({
    id: "shelf-3",
    name: "Provided",
    bookIds: ["legacy-book"],
    isDefault: true,
  });

  assert.equal(provided.id, "shelf-3");
  assert.equal(provided.name, "Provided");
  assert.equal(Object.hasOwn(provided, "bookIds"), false);
  assert.equal(provided.isDefault, true);
});
