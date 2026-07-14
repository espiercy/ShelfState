import { DEFAULT_BOOKSHELF_NAME } from "./config.js";
import { Bookshelf } from "./models.js";

export function getDefaultBookshelf(bookshelves) {
  return bookshelves.find(
    (bookshelf) => bookshelf.name === DEFAULT_BOOKSHELF_NAME,
  );
}

export function ensureDefaultBookshelf(bookshelves) {
  if (bookshelves.length > 0) return bookshelves;

  return [
    new Bookshelf({
      name: DEFAULT_BOOKSHELF_NAME,
    }),
  ];
}

export function ensureActiveBookshelfId(bookshelves, activeBookshelfId) {
  const activeExists = bookshelves.some(
    (bookshelf) => bookshelf.id === activeBookshelfId,
  );

  if (activeExists) return activeBookshelfId;

  return bookshelves[0]?.id ?? null;
}

export function syncBookshelvesFromBooks(bookshelves, books) {
  const updatedBookshelves = [...bookshelves];

  books.forEach((book) => {
    const bookshelfName = book.bookshelf?.trim();

    if (!bookshelfName) return;

    const alreadyExists = updatedBookshelves.some(
      (bookshelf) =>
        bookshelf.name.toLowerCase() === bookshelfName.toLowerCase(),
    );

    if (!alreadyExists) {
      updatedBookshelves.push(
        new Bookshelf({
          name: bookshelfName,
        }),
      );
    }
  });

  return updatedBookshelves;
}
