export function bookMatchesSearch(book, query = "", searchField = "all") {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) return true;

  const searchableFields = {
    title: book.title,
    author: book.author,
    category: book.category,
    notes: book.notes,
    isbn: book.isbn,
  };

  if (searchField === "all") {
    return Object.values(searchableFields).some((value) =>
      String(value ?? "")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }

  return String(searchableFields[searchField] ?? "")
    .toLowerCase()
    .includes(normalizedQuery);
}

export function isSearchActive(query = "") {
  return query.trim().length > 0;
}

export function getSearchSummaryText(query = "", matchCount = 0) {
  if (!isSearchActive(query)) return "";

  return matchCount === 0
    ? "No books matched your search."
    : `Showing ${matchCount} matching book${matchCount === 1 ? "" : "s"}.`;
}
