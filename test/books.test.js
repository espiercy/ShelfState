import test from "node:test";
import assert from "node:assert/strict";

import { addBookToLibrary, removeBookFromLibrary } from "../books.js";

test("removes the identified book without mutating the collection", () => {
  const books = [
    { id: "book-1", title: "First" },
    { id: "book-2", title: "Second" },
  ];

  const result = removeBookFromLibrary(books, "book-1");

  assert.deepEqual(result, [{ id: "book-2", title: "Second" }]);
  assert.equal(books.length, 2);
  assert.notEqual(result, books);
});

test("preserves the collection when the book is not found", () => {
  const books = [{ id: "book-1", title: "First" }];

  const result = removeBookFromLibrary(books, "missing");

  assert.deepEqual(result, books);
  assert.notEqual(result, books);
});

test("creates and adds a book to the library", () => {
  const books = [];

  const result = addBookToLibrary(books, {
    title: "Dune",
    author: "Frank Herbert",
  });

  assert.equal(books.length, 1);
  assert.equal(result, books[0]);
  assert.equal(result.title, "Dune");
  assert.equal(result.author, "Frank Herbert");
  assert.equal(typeof result.id, "string");
});
