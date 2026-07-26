import test from "node:test";
import assert from "node:assert/strict";

import { Book } from "../models.js";

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
