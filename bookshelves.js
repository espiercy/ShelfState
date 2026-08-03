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
    const bookshelfName = normalizeBookshelfName(book.bookshelf ?? "");

    if (!bookshelfName) return;

    const alreadyExists = hasBookshelfName(updatedBookshelves, bookshelfName);

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

export function normalizeBookshelfName(name) {
  return name.trim();
}

export function hasBookshelfName(
  bookshelves,
  name,
  excludedBookshelfId = null,
) {
  const normalizedName = normalizeBookshelfName(name).toLowerCase();

  return bookshelves.some(
    (bookshelf) =>
      bookshelf.id !== excludedBookshelfId &&
      bookshelf.name.toLowerCase() === normalizedName,
  );
}
