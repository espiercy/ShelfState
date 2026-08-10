import test from "node:test";
import assert from "node:assert/strict";

import { createBookData } from "../book-data.js";

function createFormData(values) {
  return {
    get(field) {
      return Object.hasOwn(values, field) ? values[field] : null;
    },
  };
}

test("creates normalized book data from values", () => {
  const formData = createFormData({
    title: "Book",
    author: "Author",
    pages: "300",
    progress: "25",
    status: "currently-reading",
    bookshelf: "shelf-2",
  });

  const bookData = createBookData(formData, [
    { id: "shelf-1", name: "My Library" },
    { id: "shelf-2", name: "Favorites" },
  ]);

  assert.equal(bookData.title, "Book");
  assert.equal(bookData.author, "Author");
  assert.equal(bookData.pages, 300);
  assert.equal(bookData.progress, 25);
  assert.equal(bookData.status, "currently-reading");
  assert.equal(bookData.notes, "");
  assert.equal(bookData.bookshelf, "");
  assert.equal(bookData.bookshelfId, "shelf-2");
});

test("resolves an empty shelf selection to the default bookshelf", () => {
  const bookData = createBookData(
    createFormData({
      title: "Book",
      pages: "",
      progress: "",
      bookshelf: "",
    }),
    [{ id: "default", name: "My Library" }],
  );

  assert.equal(bookData.pages, 0);
  assert.equal(bookData.progress, 0);
  assert.equal(bookData.bookshelf, "");
  assert.equal(bookData.bookshelfId, "default");
});

test("uses a null bookshelf ID when no shelf ID matches", () => {
  const bookData = createBookData(
    createFormData({
      bookshelf: "missing-id",
    }),
    [{ id: "default", name: "My Library" }],
  );

  assert.equal(bookData.bookshelfId, null);
});
