import { DEFAULT_BOOKSHELF_NAME } from "../config.js";
import { Bookshelf } from "../domain/models.js";
import {
  getDefaultBookshelf,
  normalizeBookshelfName,
  hasBookshelfName,
} from "../domain/bookshelves.js";

export function migrateBooksToBookshelfIds(books, bookshelves) {
  const defaultBookshelf = getDefaultBookshelf(bookshelves);

  let didMigrate = false;

  books.forEach((book) => {
    const currentBookshelfExists = bookshelves.some(
      (bookshelf) => bookshelf.id === book.bookshelfId,
    );

    if (currentBookshelfExists) return;

    const bookshelfName = book.bookshelf || DEFAULT_BOOKSHELF_NAME;

    const matchingBookshelf = bookshelves.find(
      (bookshelf) => bookshelf.name === bookshelfName,
    );

    const replacementBookshelfId =
      matchingBookshelf?.id ?? defaultBookshelf?.id ?? null;

    if (!replacementBookshelfId) return;

    book.bookshelfId = replacementBookshelfId;
    didMigrate = true;
  });

  return didMigrate;
}

export function migrateBookshelvesFromLegacyNames(bookshelves, books) {
  const migratedBookshelves = [...bookshelves];

  books.forEach((book) => {
    const bookshelfName = normalizeBookshelfName(book.bookshelf ?? "");

    if (!bookshelfName) return;

    const alreadyExists = hasBookshelfName(migratedBookshelves, bookshelfName);

    if (!alreadyExists) {
      migratedBookshelves.push(
        new Bookshelf({
          name: bookshelfName,
        }),
      );
    }
  });

  return migratedBookshelves;
}
