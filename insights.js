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

export function getBooksByStatus(books) {
  return books.reduce((counts, book) => {
    counts[book.status] = (count[book.status] ?? 0) + 1;
    return counts;
  }, {});
}

export function getBooksByCategory(books) {
  return books.reduce((counts, book) => {
    const category = book.category || "Uncategorized";

    counts[category] = (counts[category] ?? 0) + 1;

    return counts;
  }, {});
}

export function getBooksByBookshelf(books) {
  return books.reduce((counts, book) => {
    const shelf = book.bookshelf || "My Library";

    counts[shelf] = (counts[shelf] ?? 0) + 1;

    return counts;
  }, {});
}
