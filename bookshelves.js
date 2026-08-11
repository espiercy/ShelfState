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

export function removeBookshelfFromLibrary(bookshelves, books, bookshelfId) {
  const bookshelf = bookshelves.find(
    (bookshelf) => bookshelf.id === bookshelfId,
  );

  if (!bookshelf || bookshelf.name === DEFAULT_BOOKSHELF_NAME) {
    return null;
  }

  const defaultBookshelf = getDefaultBookshelf(bookshelves);

  books.forEach((book) => {
    if (book.bookshelfId !== bookshelfId) return;

    book.bookshelf = "";
    book.bookshelfId = defaultBookshelf?.id ?? null;
  });

  return {
    bookshelves: bookshelves.filter(
      (bookshelf) => bookshelf.id !== bookshelfId,
    ),
    activeBookshelfId: defaultBookshelf?.id ?? null,
  };
}

export function renameBookshelfInLibrary(bookshelf, newName) {
  bookshelf.name = newName;

  return bookshelf;
}

export function assignBookToBookshelf(book, bookshelf) {
  book.bookshelf = "";
  book.bookshelfId = bookshelf.id;

  return book;
}

export function addBookshelfToLibrary(bookshelves, name) {
  const normalizedName = normalizeBookshelfName(name);

  if (!normalizedName || hasBookshelfName(bookshelves, normalizedName)) {
    return null;
  }

  const bookshelf = new Bookshelf({
    name: normalizedName,
  });

  bookshelves.push(bookshelf);

  return bookshelf;
}

export function getBooksForBookshelf(books, bookshelf) {
  return books.filter((book) => book.bookshelfId === bookshelf.id);
}
