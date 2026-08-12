import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  saveBooks,
  loadBooks,
  saveBookshelves,
  loadBookshelves,
  saveActiveBookshelfId,
  loadActiveBookshelfId,
  backupBooksBeforeMigration,
  backupBooksBeforeSave,
  createLibraryExportData,
} from "../storage.js";

import {
  BOOKS_STORAGE_KEY,
  BOOKSHELVES_STORAGE_KEY,
  ACTIVE_BOOKSHELF_STORAGE_KEY,
  BOOKS_ROLLING_BACKUP_KEY,
  BOOKS_MIGRATION_BACKUP_KEY,
  EXPORT_SCHEMA_VERSION,
} from "../config.js";

class MemoryStorage {
  constructor() {
    this.items = new Map();
    this.failedWrites = new Set();
  }

  getItem(key) {
    return this.items.has(key) ? this.items.get(key) : null;
  }

  setItem(key, value) {
    if (this.failedWrites.has(key)) {
      throw new Error(`Write failed for ${key}`);
    }
    this.items.set(key, String(value));
  }

  failWrite(key) {
    this.failedWrites.add(key);
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

test("creates one migration backup and preserves it", () => {
  assert.equal(backupBooksBeforeMigration(), false);

  const originalBooks = JSON.stringify([{ id: "original" }]);
  localStorage.setItem(BOOKS_STORAGE_KEY, originalBooks);

  assert.equal(backupBooksBeforeMigration(), true);
  assert.equal(localStorage.getItem(BOOKS_MIGRATION_BACKUP_KEY), originalBooks);

  localStorage.setItem(BOOKS_STORAGE_KEY, JSON.stringify([{ id: "newer" }]));

  assert.equal(backupBooksBeforeMigration(), true);
  assert.equal(localStorage.getItem(BOOKS_MIGRATION_BACKUP_KEY), originalBooks);
});

test("rejects malformed rolling-backup sources", (context) => {
  context.mock.method(console, "error", () => {});

  localStorage.setItem(BOOKS_STORAGE_KEY, JSON.stringify({ id: "book" }));
  assert.equal(backupBooksBeforeSave(), false);

  localStorage.setItem(BOOKS_STORAGE_KEY, "{bad json}");
  assert.equal(backupBooksBeforeSave(), false);
});

test("reports a failed migration backup-write", (context) => {
  context.mock.method(console, "error", () => {});

  localStorage.setItem(BOOKS_STORAGE_KEY, JSON.stringify([{ id: "book-1" }]));
  localStorage.failWrite(BOOKS_MIGRATION_BACKUP_KEY);

  assert.equal(backupBooksBeforeMigration(), false);
});

test("blocks a save when the rolling backup cannot be written", (context) => {
  context.mock.method(console, "error", () => {});

  const originalBooks = JSON.stringify([{ id: "old-book" }]);
  localStorage.setItem(BOOKS_STORAGE_KEY, originalBooks);
  localStorage.failWrite(BOOKS_ROLLING_BACKUP_KEY);

  assert.equal(saveBooks([{ id: "new-book" }]), false);
  assert.equal(localStorage.getItem(BOOKS_STORAGE_KEY), originalBooks);
});

test("reports a failed primary book write", (context) => {
  context.mock.method(console, "error", () => {});

  localStorage.failWrite(BOOKS_STORAGE_KEY);

  assert.equal(saveBooks([{ id: "book-1" }]), false);
  assert.equal(localStorage.getItem(BOOKS_STORAGE_KEY), null);
});

test("rejects stored non-array collections", () => {
  localStorage.setItem(
    BOOKS_STORAGE_KEY,
    JSON.stringify({ id: "not-an-array" }),
  );
  localStorage.setItem(
    BOOKSHELVES_STORAGE_KEY,
    JSON.stringify({ id: "not-an-array" }),
  );

  assert.deepEqual(loadBooks(), []);
  assert.deepEqual(loadBookshelves(), []);
});

test("throws for malformed stored JSON", () => {
  localStorage.setItem(BOOKS_STORAGE_KEY, "{bad json");
  assert.throws(() => loadBooks(), SyntaxError);

  localStorage.setItem(BOOKSHELVES_STORAGE_KEY, "{bad json");
  assert.throws(() => loadBookshelves(), SyntaxError);
});

test("creates versioned library export data", () => {
  const books = [{ id: "book-1" }];
  const bookshelves = [{ id: "shelf-1" }];

  const exportData = createLibraryExportData(books, bookshelves, "shelf-1");

  assert.equal(EXPORT_SCHEMA_VERSION, 2);
  assert.equal(exportData.schemaVersion, EXPORT_SCHEMA_VERSION);
  assert.equal(Number.isNaN(Date.parse(exportData.exportedAt)), false);
  assert.equal(exportData.books, books);
  assert.equal(exportData.bookshelves, bookshelves);
  assert.equal(exportData.activeBookshelfId, "shelf-1");
});

test("rejects invalid library export collections", () => {
  assert.throws(() => createLibraryExportData(null, [], null), TypeError);
  assert.throws(() => createLibraryExportData([], null, null), TypeError);
});
