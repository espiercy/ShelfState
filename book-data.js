import { BOOK_FIELDS, DEFAULT_BOOKSHELF_NAME } from "./config.js";

export function createBookData(formData, bookshelves) {
  const bookData = Object.fromEntries(
    BOOK_FIELDS.map((field) => [field, formData.get(field) ?? ""]),
  );

  bookData.pages = Number(bookData.pages);
  bookData.progress = Number(bookData.progress);

  const selectedBookshelfName = bookData.bookshelf || DEFAULT_BOOKSHELF_NAME;

  const selectedBookshelf = bookshelves.find(
    (bookshelf) => bookshelf.name === selectedBookshelfName,
  );

  bookData.bookshelfId = selectedBookshelf?.id ?? null;

  return bookData;
}
