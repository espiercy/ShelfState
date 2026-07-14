import { DEFAULT_BOOKSHELF_NAME } from "./config.js";
import { getDefaultBookshelf } from "./bookshelves.js";

export function migrateBooksToBookshelfIds(books, bookshelves) {
  const defaultBookshelf = getDefaultBookshelf(bookshelves);

  let didMigrate = false;

  books.forEach((book) => {
    if (book.bookshelfId) return;

    const bookshelfName = book.bookshelf || DEFAULT_BOOKSHELF_NAME;

    const matchingBookshelf = bookshelves.find(
      (bookshelf) => bookshelf.name === bookshelfName,
    );

    book.bookshelfId = matchingBookshelf?.id ?? defaultBookshelf?.id ?? null;

    if (book.bookshelfId) {
      didMigrate = true;
    }
  });

  return didMigrate;
}
