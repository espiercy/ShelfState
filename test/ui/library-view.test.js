import test, { after, before } from "node:test";
import assert from "node:assert/strict";

import { renderLibraryBookList } from "../../src/ui/library-view.js";

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.listeners = new Map();
    this.classes = new Set();
    this._className = "";
    this._textContent = "";
    this.innerHTML = "";
    this.type = "";
    this.draggable = false;

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

  addEventListener(eventName, listener) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }

    this.listeners.get(eventName).add(listener);
  }
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

test("clears previous content and renders the empty-library message", () => {
  const bookList = new FakeElement("div");
  bookList.appendChild(new FakeElement("div"));

  renderLibraryBookList({
    bookList,
    isLibraryEmpty: true,
    activeBookshelf: null,
    visibleBooks: [],
    searchActive: false,
  });

  assert.equal(bookList.children.length, 1);
  assert.equal(bookList.children[0].className, "empty-bookshelf-message");
  assert.equal(
    bookList.children[0].textContent,
    "No books added yet. Click Add Book to start your shelf.",
  );
});

test("clears previous content and renders the active bookshelf", () => {
  const bookList = new FakeElement("div");
  bookList.appendChild(new FakeElement("div"));

  renderLibraryBookList({
    bookList,
    isLibraryEmpty: false,
    activeBookshelf: {
      id: "favorites",
      name: "Favorites",
    },
    visibleBooks: [
      {
        id: "book-1",
        title: "Book One",
        author: "Author",
        progress: 10,
        pages: 100,
        status: "currently-reading",
      },
    ],
    searchActive: false,
  });

  assert.equal(bookList.children.length, 1);

  const bookshelfSection = bookList.children[0];

  assert.equal(bookshelfSection.className, "bookshelf");
  assert.equal(bookshelfSection.children[0].textContent, "Favorites");
  assert.equal(
    bookshelfSection.children[1].children[1].children[0].dataset.bookId,
    "book-1",
  );
});
