import { DEFAULT_BOOKSHELF_NAME } from "../config.js";
import { Bookshelf } from "../domain/models.js";
import {
  getDefaultBookshelf,
  normalizeBookshelfName,
  hasBookshelfName,
} from "../domain/bookshelves.js";

export function migrateDefaultBookshelfRole(bookshelves) {
  const explicitDefaultIndex = bookshelves.findIndex(
    (bookshelf) => bookshelf.isDefault === true,
  );
  const legacyDefaultIndex = bookshelves.findIndex(
    (bookshelf) =>
      !Object.hasOwn(bookshelf, "isDefault") &&
      bookshelf.name === DEFAULT_BOOKSHELF_NAME,
  );
  const defaultIndex =
    explicitDefaultIndex >= 0 ? explicitDefaultIndex : legacyDefaultIndex;

  if (defaultIndex < 0) {
    return {
      bookshelves: [
        ...bookshelves.map(
          (bookshelf) => new Bookshelf({ ...bookshelf, isDefault: false }),
        ),
        new Bookshelf({
          name: DEFAULT_BOOKSHELF_NAME,
          isDefault: true,
        }),
      ],
      didMigrate: true,
    };
  }

  const didMigrate = bookshelves.some(
    (bookshelf, index) =>
      !Object.hasOwn(bookshelf, "isDefault") ||
      bookshelf.isDefault !== (index === defaultIndex),
  );

  return {
    bookshelves: bookshelves.map(
      (bookshelf, index) =>
        new Bookshelf({ ...bookshelf, isDefault: index === defaultIndex }),
    ),
    didMigrate,
  };
}

export function migrateBooksToBookshelfIds(books, bookshelves) {
  const defaultBookshelf = getDefaultBookshelf(bookshelves);

  let didMigrate = false;

  books.forEach((book) => {
    const currentBookshelfExists = bookshelves.some(
      (bookshelf) => bookshelf.id === book.bookshelfId,
    );

    if (currentBookshelfExists) return;

    const bookshelfName = book.bookshelf || DEFAULT_BOOKSHELF_NAME;
    const matchingBookshelf =
      bookshelfName === DEFAULT_BOOKSHELF_NAME
        ? defaultBookshelf
        : bookshelves.find((bookshelf) => bookshelf.name === bookshelfName);

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

    if (
      bookshelfName === DEFAULT_BOOKSHELF_NAME &&
      getDefaultBookshelf(migratedBookshelves)
    ) {
      return;
    }

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
