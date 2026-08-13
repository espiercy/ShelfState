export function getReadingInsights(books, bookshelves = []) {
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
    booksByStatus: getBooksByStatus(books),
    booksByCategory: getBooksByCategory(books),
    booksByBookshelf: getBooksByBookshelf(books, bookshelves),
    booksByClassification: getBooksByClassification(books),
  };
}

export function getBooksByStatus(books) {
  return books.reduce((counts, book) => {
    counts[book.status] = (counts[book.status] ?? 0) + 1;
    return counts;
  }, {});
}

export function getBooksByCategory(books) {
  return books.reduce((counts, book) => {
    const category = book.category?.trim() || "Uncategorized";

    counts[category] = (counts[category] ?? 0) + 1;

    return counts;
  }, {});
}

export function getBooksByClassification(books) {
  return books.reduce((counts, book) => {
    const classification =
      book.classification?.trim().toLowerCase() || "unclassified";

    counts[classification] = (counts[classification] ?? 0) + 1;

    return counts;
  }, {});
}

export function getBooksByBookshelf(books, bookshelves) {
  return bookshelves.map((bookshelf) => ({
    id: bookshelf.id,
    name: bookshelf.name,
    count: books.filter((book) => book.bookshelfId === bookshelf.id).length,
  }));
}
