import test from "node:test";
import assert from "node:assert/strict";

import {
  bookMatchesSearch,
  isSearchActive,
  getSearchSummaryText,
} from "../../src/domain/search.js";

const book = {
  title: "The Left Hand of Darkness",
  author: "Ursula K. Le Guin",
  category: "Science Fiction",
  notes: "A winter journey",
  isbn: "9780441478125",
};

test("treats an empty or whitespace-only query as inactive", () => {
  assert.equal(isSearchActive(""), false);
  assert.equal(isSearchActive("   "), false);
  assert.equal(isSearchActive("winter"), true);
});

test("matches all searchable fields without case sensitivity", () => {
  assert.equal(bookMatchesSearch(book, "LEFT"), true);
  assert.equal(bookMatchesSearch(book, "ursula"), true);
  assert.equal(bookMatchesSearch(book, "science"), true);
  assert.equal(bookMatchesSearch(book, "WINTER"), true);
  assert.equal(bookMatchesSearch(book, "1478125"), true);
});

test("trims search queries", () => {
  assert.equal(bookMatchesSearch(book, "  darkness  "), true);
});

test("restricts matching to the selected field", () => {
  assert.equal(bookMatchesSearch(book, "ursula", "author"), true);
  assert.equal(bookMatchesSearch(book, "ursula", "title"), false);
});

test("handles missing searchable values", () => {
  assert.equal(
    bookMatchesSearch(
      {
        title: "Book",
        author: null,
      },
      "missing",
    ),
    false,
  );
});

test("returns the correct search summary", () => {
  assert.equal(getSearchSummaryText("", 3), "");
  assert.equal(
    getSearchSummaryText("book", 0),
    "No books matched your search.",
  );
  assert.equal(getSearchSummaryText("book", 1), "Showing 1 matching book.");
  assert.equal(getSearchSummaryText("book", 2), "Showing 2 matching books.");
});
