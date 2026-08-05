import { Book } from "./models.js";

export function addBookToLibrary(books, bookData) {
  const book = new Book(bookData);
  books.push(book);

  return book;
}

export function removeBookFromLibrary(books, bookId) {
  return books.filter((book) => book.id !== bookId);
}
