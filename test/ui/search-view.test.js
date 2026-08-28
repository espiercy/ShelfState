import test from "node:test";
import assert from "node:assert/strict";

import { renderSearchView } from "../../src/ui/search-view.js";

class FakeElement {
  constructor() {
    this.classes = new Set();
    this.textContent = "";
    this.hidden = false;

    this.classList = {
      toggle: (className, force) => {
        if (force) {
          this.classes.add(className);
        } else {
          this.classes.delete(className);
        }

        return force;
      },
      contains: (className) => this.classes.has(className),
    };
  }
}

function createSearchElements() {
  return {
    searchPanel: new FakeElement(),
    toggleSearchButton: new FakeElement(),
    searchSummary: new FakeElement(),
    clearSearchButton: new FakeElement(),
  };
}

test("renders an open active search", () => {
  const view = createSearchElements();

  renderSearchView({
    ...view,
    isSearchVisible: true,
    showSearchPanel: true,
    searchActive: true,
    summaryText: "Showing 2 matching books.",
  });

  assert.equal(view.searchPanel.classList.contains("hidden"), false);
  assert.equal(view.toggleSearchButton.textContent, "Hide Search");
  assert.equal(view.searchSummary.textContent, "Showing 2 matching books.");
  assert.equal(view.clearSearchButton.hidden, false);
});

test("hides the search panel without losing its open-state label", () => {
  const view = createSearchElements();

  renderSearchView({
    ...view,
    isSearchVisible: true,
    showSearchPanel: false,
    searchActive: true,
    summaryText: "Showing 1 matching book.",
  });

  assert.equal(view.searchPanel.classList.contains("hidden"), true);
  assert.equal(view.toggleSearchButton.textContent, "Hide Search");
});

test("renders a closed inactive search", () => {
  const view = createSearchElements();

  renderSearchView({
    ...view,
    isSearchVisible: false,
    showSearchPanel: false,
    searchActive: false,
    summaryText: "",
  });

  assert.equal(view.searchPanel.classList.contains("hidden"), true);
  assert.equal(view.toggleSearchButton.textContent, "Search");
  assert.equal(view.searchSummary.textContent, "");
  assert.equal(view.clearSearchButton.hidden, true);
});
