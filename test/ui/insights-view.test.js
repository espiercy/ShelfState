import test from "node:test";
import assert from "node:assert/strict";

import { renderReadingInsights } from "../../src/ui/insights-view.js";

class FakeElement {
  constructor() {
    this.className = "";
    this.children = [];
    this.innerHTML = "";
    this.elementsBySelector = new Map();
    this.text = "";
  }

  set textContent(value) {
    this.text = String(value);
  }

  get textContent() {
    return this.text;
  }

  append(...children) {
    this.children.push(...children);
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  querySelector(selector) {
    return this.elementsBySelector.get(selector) ?? null;
  }
}

function getRenderedCards(element) {
  return element.children.map((card) => ({
    value: card.children[0].textContent,
    label: card.children[1].textContent,
  }));
}

test("renders supplied reading insights into summary and breakdown cards", () => {
  const originalDocument = globalThis.document;

  globalThis.document = {
    createElement() {
      return new FakeElement();
    },
  };

  try {
    const readingInsights = new FakeElement();
    const categoryInsights = new FakeElement();
    const bookshelfInsights = new FakeElement();
    const classificationInsights = new FakeElement();

    readingInsights.elementsBySelector.set(
      "#category-insights",
      categoryInsights,
    );
    readingInsights.elementsBySelector.set(
      "#bookshelf-insights",
      bookshelfInsights,
    );
    readingInsights.elementsBySelector.set(
      "#classification-insights",
      classificationInsights,
    );

    const insights = {
      totalBooks: 3,
      completedBooks: 1,
      currentlyReadingBooks: 1,
      pagesRead: 240,
      pagesRemaining: 560,
      booksByStatus: {
        "currently-reading": 1,
        "not-started": 1,
        "on-hold": 0,
        completed: 1,
        dnf: 0,
      },
      booksByCategory: {
        Mystery: 1,
        Fantasy: 2,
      },
      booksByBookshelf: [
        { name: "My Library", count: 2 },
        { name: "Favorites", count: 1 },
      ],
      booksByClassification: {
        fiction: 2,
        "non-fiction": 1,
        poetry: 0,
        unclassified: 0,
      },
    };

    renderReadingInsights(readingInsights, insights);

    assert.match(readingInsights.innerHTML, /Reading Insights/);
    assert.match(readingInsights.innerHTML, /240/);
    assert.match(readingInsights.innerHTML, /560/);
    assert.match(readingInsights.innerHTML, /Currently Reading/);
    assert.match(readingInsights.innerHTML, /DNF/);

    assert.deepEqual(getRenderedCards(categoryInsights), [
      { value: "2", label: "Fantasy" },
      { value: "1", label: "Mystery" },
    ]);

    assert.deepEqual(getRenderedCards(bookshelfInsights), [
      { value: "2", label: "My Library" },
      { value: "1", label: "Favorites" },
    ]);

    assert.deepEqual(getRenderedCards(classificationInsights), [
      { value: "2", label: "Fiction" },
      { value: "1", label: "Non-Fiction" },
      { value: "0", label: "Poetry" },
      { value: "0", label: "Unclassified" },
    ]);
  } finally {
    if (originalDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = originalDocument;
    }
  }
});
