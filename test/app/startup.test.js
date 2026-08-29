import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";

import { initializeLibraryState } from "../../src/app/startup.js";
import { Book, Bookshelf } from "../../src/domain/models.js";
import {
  ACTIVE_BOOKSHELF_STORAGE_KEY,
  BOOKSHELVES_STORAGE_KEY,
  BOOKS_MIGRATION_BACKUP_KEY,
  BOOKS_STORAGE_KEY,
  DEFAULT_BOOKSHELF_NAME,
} from "../../src/config.js";

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
}

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
});

test("loads and hydrates stored library state", () => {
  localStorage.setItem(
    BOOKS_STORAGE_KEY,
    JSON.stringify([
      {
        id: "book-1",
        title: "Book One",
        author: "Author",
        bookshelfId: "favorites",
      },
    ]),
  );
  localStorage.setItem(
    BOOKSHELVES_STORAGE_KEY,
    JSON.stringify([
      {
        id: "default",
        name: "Renamed Library",
        isDefault: true,
      },
      {
        id: "favorites",
        name: "Favorites",
        isDefault: false,
      },
    ]),
  );
  localStorage.setItem(ACTIVE_BOOKSHELF_STORAGE_KEY, "favorites");

  const state = initializeLibraryState();

  assert.equal(state.booksLoadFailed, false);
  assert.equal(state.books.length, 1);
  assert.equal(state.books[0] instanceof Book, true);
  assert.equal(state.bookshelves.length, 2);
  assert.equal(
    state.bookshelves.every((bookshelf) => bookshelf instanceof Bookshelf),
    true,
  );
  assert.equal(
    state.bookshelves.find((bookshelf) => bookshelf.id === "default")
      .isDefault,
    true,
  );
  assert.equal(state.activeBookshelfId, "favorites");
});

test("migrates and persists legacy library state", () => {
  const originalBooks = JSON.stringify([
    {
      id: "book-1",
      title: "Book One",
      author: "Author",
      bookshelf: "Favorites",
    },
  ]);

  localStorage.setItem(BOOKS_STORAGE_KEY, originalBooks);
  localStorage.setItem(
    BOOKSHELVES_STORAGE_KEY,
    JSON.stringify([
      {
        id: "default",
        name: DEFAULT_BOOKSHELF_NAME,
      },
    ]),
  );
  localStorage.setItem(ACTIVE_BOOKSHELF_STORAGE_KEY, "missing");

  const state = initializeLibraryState();
  const favoritesBookshelf = state.bookshelves.find(
    (bookshelf) => bookshelf.name === "Favorites",
  );
  const savedBooks = JSON.parse(localStorage.getItem(BOOKS_STORAGE_KEY));
  const savedBookshelves = JSON.parse(
    localStorage.getItem(BOOKSHELVES_STORAGE_KEY),
  );

  assert.ok(favoritesBookshelf);
  assert.equal(state.books[0].bookshelfId, favoritesBookshelf.id);
  assert.equal(state.activeBookshelfId, "default");
  assert.equal(localStorage.getItem(BOOKS_MIGRATION_BACKUP_KEY), originalBooks);
  assert.equal(savedBooks[0].bookshelfId, favoritesBookshelf.id);
  assert.equal(Object.hasOwn(savedBooks[0], "bookshelf"), false);
  assert.equal(
    savedBookshelves.some((bookshelf) => bookshelf.name === "Favorites"),
    true,
  );
  assert.equal(
    savedBookshelves.find((bookshelf) => bookshelf.id === "default").isDefault,
    true,
  );
});

test("recovers a missing default without changing book membership", () => {
  localStorage.setItem(
    BOOKS_STORAGE_KEY,
    JSON.stringify([
      {
        id: "book-1",
        title: "Book One",
        bookshelfId: "favorites",
      },
    ]),
  );
  localStorage.setItem(
    BOOKSHELVES_STORAGE_KEY,
    JSON.stringify([
      {
        id: "favorites",
        name: "Favorites",
        isDefault: false,
      },
    ]),
  );

  const state = initializeLibraryState();
  const savedBookshelves = JSON.parse(
    localStorage.getItem(BOOKSHELVES_STORAGE_KEY),
  );

  assert.equal(state.books[0].bookshelfId, "favorites");
  assert.equal(state.bookshelves.length, 2);
  assert.equal(
    state.bookshelves.filter((bookshelf) => bookshelf.isDefault).length,
    1,
  );
  assert.equal(
    savedBookshelves.filter((bookshelf) => bookshelf.isDefault).length,
    1,
  );
});

test("recovers safely when stored library collections are malformed", (context) => {
  context.mock.method(console, "error", () => {});

  localStorage.setItem(BOOKS_STORAGE_KEY, "{bad json");
  localStorage.setItem(BOOKSHELVES_STORAGE_KEY, "{bad json");
  localStorage.setItem(ACTIVE_BOOKSHELF_STORAGE_KEY, "missing");

  const state = initializeLibraryState();

  assert.equal(state.booksLoadFailed, true);
  assert.deepEqual(state.books, []);
  assert.equal(state.bookshelves.length, 1);
  assert.equal(state.bookshelves[0].name, DEFAULT_BOOKSHELF_NAME);
  assert.equal(state.bookshelves[0].isDefault, true);
  assert.equal(state.activeBookshelfId, state.bookshelves[0].id);
});
