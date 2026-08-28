import test from "node:test";
import assert from "node:assert/strict";

import { renderActiveView } from "../../src/ui/active-view.js";

class FakeElement {
  constructor() {
    this.classes = new Set();
    this.textContent = "";

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

function createViewElements() {
  return {
    libraryLayout: new FakeElement(),
    insightsLayout: new FakeElement(),
    toggleInsightsButton: new FakeElement(),
    showFormButton: new FakeElement(),
    toggleSearchButton: new FakeElement(),
    searchPanel: new FakeElement(),
  };
}

test("renders library mode and respects search visibility", () => {
  const view = createViewElements();

  renderActiveView({
    ...view,
    activeView: "library",
    isSearchVisible: true,
  });

  assert.equal(view.libraryLayout.classList.contains("hidden"), false);
  assert.equal(view.insightsLayout.classList.contains("hidden"), true);
  assert.equal(view.toggleInsightsButton.textContent, "Reading Insights");
  assert.equal(view.showFormButton.classList.contains("hidden"), false);
  assert.equal(view.toggleSearchButton.classList.contains("hidden"), false);
  assert.equal(view.searchPanel.classList.contains("hidden"), false);

  renderActiveView({
    ...view,
    activeView: "library",
    isSearchVisible: false,
  });

  assert.equal(view.searchPanel.classList.contains("hidden"), true);
});

test("renders insights mode and hides library controls", () => {
  const view = createViewElements();

  renderActiveView({
    ...view,
    activeView: "insights",
    isSearchVisible: true,
  });

  assert.equal(view.libraryLayout.classList.contains("hidden"), true);
  assert.equal(view.insightsLayout.classList.contains("hidden"), false);
  assert.equal(view.toggleInsightsButton.textContent, "Back to Library");
  assert.equal(view.showFormButton.classList.contains("hidden"), true);
  assert.equal(view.toggleSearchButton.classList.contains("hidden"), true);
  assert.equal(view.searchPanel.classList.contains("hidden"), true);
});
