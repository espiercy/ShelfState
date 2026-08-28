import test, { after, before } from "node:test";
import assert from "node:assert/strict";

import { BOOK_FIELDS } from "../../src/config.js";
import {
  openBookForm,
  closeBookForm,
  populateBookForm,
} from "../../src/ui/book-form-view.js";

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.classes = new Set();
    this._className = "";
    this._textContent = "";
    this._value = "";

    this.classList = {
      add: (...classNames) => {
        classNames.forEach((className) => this.classes.add(className));
        this.syncClassName();
      },
      remove: (...classNames) => {
        classNames.forEach((className) => this.classes.delete(className));
        this.syncClassName();
      },
      contains: (className) => this.classes.has(className),
    };
  }

  set className(value) {
    this._className = value;
    this.classes = new Set(value.split(/\s+/).filter(Boolean));
  }

  get className() {
    return this._className;
  }

  set textContent(value) {
    this._textContent = String(value);
  }

  get textContent() {
    return this._textContent;
  }

  set value(value) {
    this._value = String(value);
  }

  get value() {
    return this._value;
  }

  syncClassName() {
    this._className = [...this.classes].join(" ");
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = [...children];
  }
}

class FakeForm extends FakeElement {
  constructor() {
    super("form");

    this.elements = Object.fromEntries(
      [...BOOK_FIELDS, "bookshelf"].map((field) => [
        field,
        new FakeElement("input"),
      ]),
    );
    this.resetCount = 0;
  }

  reset() {
    this.resetCount++;
  }
}

function createViewElements() {
  return {
    form: new FakeForm(),
    showFormButton: new FakeElement("button"),
    libraryLayout: new FakeElement("div"),
    submitButton: new FakeElement("button"),
    mainElement: new FakeElement("main"),
  };
}

const originalDocument = globalThis.document;

before(() => {
  globalThis.document = {
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };
});

after(() => {
  if (originalDocument === undefined) {
    delete globalThis.document;
  } else {
    globalThis.document = originalDocument;
  }
});

test("opens the form and renders bookshelf options", () => {
  const view = createViewElements();

  view.form.classList.add("hidden");

  openBookForm({
    ...view,
    bookshelves: [
      { id: "default", name: "My Library" },
      { id: "favorites", name: "Favorites" },
    ],
    submitLabel: "Update Book",
  });

  assert.equal(view.form.classList.contains("hidden"), false);
  assert.equal(view.showFormButton.classList.contains("hidden"), true);
  assert.equal(view.libraryLayout.classList.contains("hidden"), true);
  assert.equal(view.submitButton.textContent, "Update Book");
  assert.equal(view.mainElement.classList.contains("form-mode"), true);

  assert.deepEqual(
    view.form.elements.bookshelf.children.map((option) => ({
      value: option.value,
      label: option.textContent,
    })),
    [
      { value: "default", label: "My Library" },
      { value: "favorites", label: "Favorites" },
    ],
  );
});

test("populates book fields and closes the form", () => {
  const view = createViewElements();

  view.showFormButton.classList.add("hidden");
  view.libraryLayout.classList.add("hidden");
  view.mainElement.classList.add("form-mode");
  view.submitButton.textContent = "Update Book";

  populateBookForm(view.form, {
    title: "Dune",
    author: "Frank Herbert",
    pages: 412,
    progress: 120,
    classification: "fiction",
    category: "Science Fiction",
    status: "currently-reading",
    bookshelfId: "favorites",
  });

  assert.equal(view.form.elements.title.value, "Dune");
  assert.equal(view.form.elements.author.value, "Frank Herbert");
  assert.equal(view.form.elements.pages.value, "412");
  assert.equal(view.form.elements.progress.value, "120");
  assert.equal(view.form.elements.notes.value, "");
  assert.equal(view.form.elements.bookshelf.value, "favorites");

  closeBookForm(view);

  assert.equal(view.form.resetCount, 1);
  assert.equal(view.form.classList.contains("hidden"), true);
  assert.equal(view.showFormButton.classList.contains("hidden"), false);
  assert.equal(view.libraryLayout.classList.contains("hidden"), false);
  assert.equal(view.submitButton.textContent, "Save Book");
  assert.equal(view.mainElement.classList.contains("form-mode"), false);
});
