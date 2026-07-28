import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  saveBooks,
  loadBooks,
  saveBookshelves,
  loadBookshelves,
  saveActiveBookshelfId,
  loadActiveBookshelfId,
} from "../storage.js";

import {
  BOOKS_STORAGE_KEY,
  BOOKSHELVES_STORAGE_KEY,
  ACTIVE_BOOKSHELF_STORAGE_KEY,
  BOOKS_ROLLING_BACKUP_KEY,
} from "../config.js";

class MemoryStorage {
  constructor() {
    this.items = new Map();
  }

  getItem(key) {
    return this.items.has(key) ? this.items.get(key) : null;
  }

  setItem(key, value) {
    this.items.set(key, String(value));
  }

  clear() {
    this.items.clear();
  }
}

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
});

test("loads an empty book collection when nothing is stored", () => {
  assert.deepEqual(loadBooks(), []);
});

test("saves and loads books", () => {
  const books = [{ id: "book-1", title: "Book" }];

  assert.equal(saveBooks(books), true);
  assert.deepEqual(loadBooks(), books);
});

test("backs up the previous valid book collection before saving", () => {
  const previousBooks = [{ id: "old-book" }];
  const nextBooks = [{ id: "new-book" }];

  localStorage.setItem(BOOKS_STORAGE_KEY, JSON.stringify(previousBooks));

  assert.equal(saveBooks(nextBooks), true);
  assert.equal(
    localStorage.getItem(BOOKS_ROLLING_BACKUP_KEY),
    JSON.stringify(previousBooks),
  );
  assert.deepEqual(loadBooks(), nextBooks);
});

test("saves and loads bookshelves", () => {
  const bookshelves = [{ id: "shelf-1", name: "My Library" }];

  saveBookshelves(bookshelves);

  assert.equal(
    localStorage.getItem(BOOKSHELVES_STORAGE_KEY),
    JSON.stringify(bookshelves),
  );
  assert.deepEqual(loadBookshelves(), bookshelves);
});

test("saves and loads the active bookshelf ID", () => {
  saveActiveBookshelfId("shelf-1");

  assert.equal(localStorage.getItem(ACTIVE_BOOKSHELF_STORAGE_KEY), "shelf-1");
  assert.equal(loadActiveBookshelfId(), "shelf-1");
});
