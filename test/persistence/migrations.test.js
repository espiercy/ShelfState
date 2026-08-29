import test from "node:test";
import assert from "node:assert/strict";

import {
  migrateDefaultBookshelfRole,
  migrateBooksToBookshelfIds,
  migrateBookshelvesFromLegacyNames,
} from "../../src/persistence/migrations.js";

const bookshelves = [
  { id: "default", name: "Renamed Library", isDefault: true },
  { id: "fantasy", name: "Fantasy", isDefault: false },
  { id: "existing", name: "Existing", isDefault: false },
];

test("migrates the legacy default name to the explicit role", () => {
  const result = migrateDefaultBookshelfRole([
    { id: "default", name: "My Library" },
    { id: "favorites", name: "Favorites" },
  ]);

  assert.equal(result.didMigrate, true);
  assert.deepEqual(
    result.bookshelves.map(({ id, isDefault }) => ({ id, isDefault })),
    [
      { id: "default", isDefault: true },
      { id: "favorites", isDefault: false },
    ],
  );
});

test("creates a default shelf when modern data has none", () => {
  const result = migrateDefaultBookshelfRole([
    { id: "favorites", name: "Favorites", isDefault: false },
  ]);

  assert.equal(result.didMigrate, true);
  assert.equal(result.bookshelves.length, 2);
  assert.equal(result.bookshelves[0].id, "favorites");
  assert.equal(result.bookshelves[0].isDefault, false);
  assert.equal(result.bookshelves[1].isDefault, true);
});

test("keeps an explicitly ordinary My Library shelf ordinary", () => {
  const result = migrateDefaultBookshelfRole([
    { id: "ordinary", name: "My Library", isDefault: false },
  ]);

  assert.equal(result.bookshelves.length, 2);
  assert.equal(result.bookshelves[0].id, "ordinary");
  assert.equal(result.bookshelves[0].isDefault, false);
  assert.equal(result.bookshelves[1].isDefault, true);
});

test("keeps the first explicit default when multiple are flagged", () => {
  const result = migrateDefaultBookshelfRole([
    { id: "first", name: "First", isDefault: true },
    { id: "second", name: "Second", isDefault: true },
  ]);

  assert.equal(result.didMigrate, true);
  assert.deepEqual(
    result.bookshelves.map(({ id, isDefault }) => ({ id, isDefault })),
    [
      { id: "first", isDefault: true },
      { id: "second", isDefault: false },
    ],
  );
});

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

test("treats the legacy default name as the explicit default role", () => {
  const books = [
    {
      title: "Legacy Default Book",
      bookshelf: "My Library",
      bookshelfId: null,
    },
  ];
  const bookshelves = [
    { id: "default", name: "Renamed Library", isDefault: true },
    { id: "ordinary", name: "My Library", isDefault: false },
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
    { id: "default", name: "Renamed Library", isDefault: true },
    { id: "fantasy", name: "Fantasy", isDefault: false },
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
    { id: "default", name: "Renamed Library", isDefault: true },
    { id: "fantasy", name: "Fantasy", isDefault: false },
  ];

  const didMigrate = migrateBooksToBookshelfIds(books, bookshelves);

  assert.equal(didMigrate, false);
  assert.equal(books[0].bookshelfId, "fantasy");
});

test("migrates unique legacy bookshelf names without mutation", () => {
  const bookshelves = [
    { id: "default", name: "Renamed Library", isDefault: true },
  ];

  const migratedBookshelves = migrateBookshelvesFromLegacyNames(bookshelves, [
    { bookshelf: " Fantasy " },
    { bookshelf: "fantasy" },
    { bookshelf: "  " },
    {},
  ]);

  assert.deepEqual(
    migratedBookshelves.map((bookshelf) => bookshelf.name),
    ["Renamed Library", "Fantasy"],
  );
  assert.equal(bookshelves.length, 1);
});

test("does not recreate the legacy default name after the default is renamed", () => {
  const bookshelves = [
    { id: "default", name: "Renamed Library", isDefault: true },
  ];

  const migratedBookshelves = migrateBookshelvesFromLegacyNames(bookshelves, [
    { bookshelf: "My Library" },
  ]);

  assert.equal(migratedBookshelves.length, 1);
  assert.equal(migratedBookshelves[0].id, "default");
});
