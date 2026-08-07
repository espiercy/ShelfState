import { DEFAULT_BOOKSHELF_NAME } from "./config.js";
import { getDefaultBookshelf } from "./bookshelves.js";

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
