export function getReadingInsights(books) {
  const totalBooks = books.length;

  const completedBooks = books.filter(
    (book) => book.status === "completed",
  ).length;

  const currentlyReadingBooks = books.filter(
    (book) => book.status === "currently-reading",
  ).length;

  const totalPages = books.reduce(
    (sum, book) => sum + Number(book.pages || 0),
    0,
  );

  const pagesRead = books.reduce(
    (sum, book) => sum + Number(book.progress || 0),
    0,
  );

  return {
    totalBooks,
    completedBooks,
    currentlyReadingBooks,
    totalPages,
    pagesRead,
    pagesRemaining: Math.max(totalPages - pagesRead, 0),
  };
}
