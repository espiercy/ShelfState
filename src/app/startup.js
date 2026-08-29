import { Book } from "../domain/models.js";
import {
  ensureDefaultBookshelf,
  ensureActiveBookshelfId,
} from "../domain/bookshelves.js";
import {
  migrateDefaultBookshelfRole,
  migrateBooksToBookshelfIds,
  migrateBookshelvesFromLegacyNames,
} from "../persistence/migrations.js";
import {
  backupBooksBeforeMigration,
  saveBooks as persistBooks,
  loadBooks as loadStoredBooks,
  saveBookshelves as persistBookshelves,
  loadBookshelves as loadStoredBookshelves,
  loadActiveBookshelfId as loadStoredActiveBookshelfId,
} from "../persistence/storage.js";

export function initializeLibraryState() {
  let books = [];
  let booksLoadFailed = false;

  try {
    books = loadStoredBooks();
  } catch (error) {
    console.error("Failed to load books:", error);
    booksLoadFailed = true;
  }

  let bookshelves = [];
  let activeBookshelfId = null;

  try {
    bookshelves = loadStoredBookshelves();
  } catch (error) {
    console.error("Failed to load bookshelves:", error);
  }

  const defaultBookshelfMigration = migrateDefaultBookshelfRole(bookshelves);

  bookshelves = defaultBookshelfMigration.bookshelves;

  if (!activeBookshelfId && bookshelves.length > 0) {
    activeBookshelfId = bookshelves[0].id;
  }

  const bookshelfCountBeforeMigration = bookshelves.length;

  bookshelves = migrateBookshelvesFromLegacyNames(bookshelves, books);

  const didMigrateBookshelves =
    bookshelves.length > bookshelfCountBeforeMigration;

  bookshelves = ensureDefaultBookshelf(bookshelves);

  if (defaultBookshelfMigration.didMigrate || didMigrateBookshelves) {
    persistBookshelves(bookshelves);
  }

  const didMigrateBooks = migrateBooksToBookshelfIds(books, bookshelves);

  books = books.map((bookData) => new Book(bookData));

  if (didMigrateBooks && backupBooksBeforeMigration()) {
    if (booksLoadFailed) {
      console.error("Book save blocked because stored books failed to load.");
    } else {
      persistBooks(books);
    }
  }

  activeBookshelfId = loadStoredActiveBookshelfId();

  activeBookshelfId = ensureActiveBookshelfId(bookshelves, activeBookshelfId);

  return {
    books,
    bookshelves,
    booksLoadFailed,
    activeBookshelfId,
  };
}
