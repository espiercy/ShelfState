import test, { after, before } from "node:test";
import assert from "node:assert/strict";

import { renderBookshelf } from "../../src/ui/bookshelf-view.js";

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

  addEventListener(eventName, listener) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }

    this.listeners.get(eventName).add(listener);
  }
}

function createBook(id, status) {
  return {
    id,
    title: `Book ${id}`,
    author: "Author",
    progress: 10,
    pages: 100,
    status,
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

test("renders status shelves in order, chunks overflow, and caps completed books", () => {
  const bookList = new FakeElement("div");
  const bookshelf = {
    id: "favorites",
    name: "Favorites",
  };
  const currentlyReadingBooks = Array.from({ length: 6 }, (_, index) =>
    createBook(`current-${index + 1}`, "currently-reading"),
  );
  const completedBooks = Array.from({ length: 6 }, (_, index) =>
    createBook(`completed-${index + 1}`, "completed"),
  );

  renderBookshelf(
    bookList,
    bookshelf,
    [...currentlyReadingBooks, ...completedBooks],
    false,
  );

  assert.equal(bookList.children.length, 1);

  const bookshelfSection = bookList.children[0];

  assert.equal(bookshelfSection.className, "bookshelf");
  assert.equal(bookshelfSection.children.length, 4);

  const [
    bookshelfHeading,
    currentShelf,
    continuedCurrentShelf,
    completedShelf,
  ] = bookshelfSection.children;

  assert.equal(bookshelfHeading.className, "bookshelf-title");
  assert.equal(bookshelfHeading.textContent, "Favorites");

  assert.equal(currentShelf.children[0].textContent, "Currently Reading");
  assert.equal(currentShelf.children[1].children.length, 5);
  assert.deepEqual(
    currentShelf.children[1].children.map(
      (bookSpine) => bookSpine.dataset.bookId,
    ),
    ["current-1", "current-2", "current-3", "current-4", "current-5"],
  );

  assert.equal(
    continuedCurrentShelf.children[0].textContent,
    "Currently Reading continued",
  );
  assert.deepEqual(
    continuedCurrentShelf.children[1].children.map(
      (bookSpine) => bookSpine.dataset.bookId,
    ),
    ["current-6"],
  );

  assert.equal(completedShelf.children[0].textContent, "Completed");
  assert.deepEqual(
    completedShelf.children[1].children.map(
      (bookSpine) => bookSpine.dataset.bookId,
    ),
    ["completed-1", "completed-2", "completed-3", "completed-4", "completed-5"],
  );
});

test("renders the appropriate empty bookshelf message", () => {
  const emptyBookList = new FakeElement("div");

  renderBookshelf(
    emptyBookList,
    { id: "empty", name: "Empty Shelf" },
    [],
    false,
  );

  assert.equal(
    emptyBookList.children[0].children[1].textContent,
    "This bookshelf is empty. Drag books here or add a new book.",
  );

  const searchedBookList = new FakeElement("div");

  renderBookshelf(
    searchedBookList,
    { id: "searched", name: "Searched Shelf" },
    [],
    true,
  );

  assert.equal(
    searchedBookList.children[0].children[1].textContent,
    "No books matched your search. Try another title, author, category, note, or ISBN.",
  );
});
