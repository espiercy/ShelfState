import {
  BOOKS_STORAGE_KEY,
  BOOKSHELVES_STORAGE_KEY,
  ACTIVE_BOOKSHELF_STORAGE_KEY,
  BOOKS_MIGRATION_BACKUP_KEY,
  BOOKS_ROLLING_BACKUP_KEY,
  EXPORT_SCHEMA_VERSION,
} from "../config.js";

export function backupBooksBeforeMigration() {
  const existingBackup = localStorage.getItem(BOOKS_MIGRATION_BACKUP_KEY);

  if (existingBackup !== null) return true;

  const savedBooks = localStorage.getItem(BOOKS_STORAGE_KEY);
  if (savedBooks === null) return false;

  try {
    localStorage.setItem(BOOKS_MIGRATION_BACKUP_KEY, savedBooks);
    return true;
  } catch (error) {
    console.error("Failed to back up books before migration:", error);
    return false;
  }
}

export function backupBooksBeforeSave() {
  const savedBooks = localStorage.getItem(BOOKS_STORAGE_KEY);

  if (savedBooks === null) return true;

  try {
    const parsedBooks = JSON.parse(savedBooks);

    if (!Array.isArray(parsedBooks)) {
      return false;
    }

    localStorage.setItem(BOOKS_ROLLING_BACKUP_KEY, savedBooks);

    return true;
  } catch (error) {
    console.error("Failed to create rolling books backup:", error);
    return false;
  }
}

export function saveBooks(books) {
  if (!backupBooksBeforeSave()) {
    console.error("Book save blocked because the rolling backup failed.");
    return false;
  }

  try {
    localStorage.setItem(BOOKS_STORAGE_KEY, JSON.stringify(books));
    return true;
  } catch (error) {
    console.error("Failed to save books:", error);
    return false;
  }
}

export function loadBooks() {
  const savedBooks = localStorage.getItem(BOOKS_STORAGE_KEY);

  if (!savedBooks) {
    return [];
  }

  const parsedBooks = JSON.parse(savedBooks);

  return Array.isArray(parsedBooks) ? parsedBooks : [];
}

export function saveBookshelves(bookshelves) {
  localStorage.setItem(BOOKSHELVES_STORAGE_KEY, JSON.stringify(bookshelves));
}

export function loadBookshelves() {
  const savedBookshelves = localStorage.getItem(BOOKSHELVES_STORAGE_KEY);

  if (!savedBookshelves) {
    return [];
  }

  const parsedBookshelves = JSON.parse(savedBookshelves);

  return Array.isArray(parsedBookshelves) ? parsedBookshelves : [];
}

export function saveActiveBookshelfId(bookshelfId) {
  localStorage.setItem(ACTIVE_BOOKSHELF_STORAGE_KEY, bookshelfId);
}

export function loadActiveBookshelfId() {
  return localStorage.getItem(ACTIVE_BOOKSHELF_STORAGE_KEY);
}

export function createLibraryExportData(books, bookshelves, activeBookshelfId) {
  if (!Array.isArray(books) || !Array.isArray(bookshelves)) {
    throw new TypeError(
      "Library export requires valid book and bookshelf arrays.",
    );
  }

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    books,
    bookshelves,
    activeBookshelfId,
  };
}
