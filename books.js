export function removeBookFromLibrary(books, bookId) {
  return books.filter((book) => book.id !== bookId);
}
