import test from "node:test";
import assert from "node:assert/strict";

import {
  getReadingInsights,
  getBooksByStatus,
  getBooksByCategory,
  getBooksByClassification,
  getBooksByBookshelf,
} from "../../src/domain/insights.js";

const books = [
  {
    status: "completed",
    pages: "300",
    progress: "300",
    category: " Fantasy ",
    classification: "Fiction",
    bookshelfId: "shelf-1",
  },
  {
    status: "currently-reading",
    pages: "200",
    progress: "50",
    category: "",
    classification: " ",
    bookshelfId: "shelf-1",
  },
  {
    status: "on-hold",
    pages: null,
    progress: null,
    category: null,
    classification: "NONFICTION",
    bookshelfId: "missing-shelf",
  },
];

const bookshelves = [
  { id: "shelf-1", name: "Favorites" },
  { id: "shelf-2", name: "Unread" },
];

test("calculates the reading overview", () => {
  const insights = getReadingInsights(books, bookshelves);

  assert.equal(insights.totalBooks, 3);
  assert.equal(insights.completedBooks, 1);
  assert.equal(insights.currentlyReadingBooks, 1);
  assert.equal(insights.totalPages, 500);
  assert.equal(insights.pagesRead, 350);
  assert.equal(insights.pagesRemaining, 150);
});

test("never reports negative remaining pages", () => {
  const insights = getReadingInsights([
    {
      status: "currently-reading",
      pages: 100,
      progress: 150,
    },
  ]);

  assert.equal(insights.pagesRemaining, 0);
});

test("groups books by status", () => {
  assert.deepEqual(getBooksByStatus(books), {
    completed: 1,
    "currently-reading": 1,
    "on-hold": 1,
  });
});

test("trims categories and groups missing values as uncategorized", () => {
  assert.deepEqual(getBooksByCategory(books), {
    Fantasy: 1,
    Uncategorized: 2,
  });
});

test("normalizes classifications and supplies a fallback", () => {
  assert.deepEqual(getBooksByClassification(books), {
    fiction: 1,
    unclassified: 1,
    nonfiction: 1,
  });
});

test("counts books for each known bookshelf", () => {
  assert.deepEqual(getBooksByBookshelf(books, bookshelves), [
    {
      id: "shelf-1",
      name: "Favorites",
      count: 2,
    },
    {
      id: "shelf-2",
      name: "Unread",
      count: 0,
    },
  ]);
});
