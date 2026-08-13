import { Book } from "./src/domain/models.js";

export function addBookToLibrary(books, bookData) {
  const book = new Book(bookData);
  books.push(book);

  return book;
}

export function removeBookFromLibrary(books, bookId) {
  return books.filter((book) => book.id !== bookId);
}

export function updateBookInLibrary(books, bookId, bookData) {
  const book = books.find((book) => book.id === bookId);

  if (!book) return null;

  book.update(bookData);

  return book;
}
