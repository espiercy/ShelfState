import test from "node:test";
import assert from "node:assert/strict";

import { setBookAnimation } from "../../src/ui/animations.js";
import { createBookSpine } from "../../src/ui/book-spine-view.js";

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

  dispatch(eventName, event) {
    this.listeners.get(eventName)?.forEach((listener) => {
      listener(event);
    });
  }
}

test("creates a book spine with content, drag behavior, and animation wiring", () => {
  const originalDocument = globalThis.document;

  globalThis.document = {
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };

  try {
    const book = {
      id: "book-1",
      title: "Dune",
      author: "Frank Herbert",
      progress: 120,
      pages: 412,
      status: "currently-reading",
    };

    setBookAnimation(book.id, "created");

    const bookSpine = createBookSpine(book);

    assert.equal(bookSpine.tagName, "article");
    assert.equal(bookSpine.classList.contains("book-spine"), true);
    assert.equal(
      bookSpine.classList.contains("book-status-currently-reading"),
      true,
    );
    assert.equal(bookSpine.classList.contains("book-created"), true);
    assert.equal(bookSpine.dataset.bookId, "book-1");
    assert.equal(bookSpine.draggable, true);

    const [title, deleteButton, hoverDetails] = bookSpine.children;

    assert.equal(title.tagName, "span");
    assert.equal(title.className, "book-spine-title");
    assert.equal(title.textContent, "Dune");

    assert.equal(deleteButton.tagName, "button");
    assert.equal(deleteButton.className, "delete-book-btn");
    assert.equal(deleteButton.type, "button");
    assert.equal(deleteButton.textContent, "×");

    assert.equal(hoverDetails.tagName, "div");
    assert.equal(hoverDetails.className, "book-hover-details");
    assert.equal(hoverDetails.innerHTML, "");
    assert.deepEqual(
      hoverDetails.children.map((child) => [child.tagName, child.textContent]),
      [
        ["strong", "Dune"],
        ["span", "Frank Herbert"],
        ["span", "120/412 pages"],
        ["span", "Currently Reading"],
      ],
    );

    const unsafeBookSpine = createBookSpine({
      ...book,
      id: "book-2",
      title: '<img src="x" onerror="alert(1)">',
      author: "<script>alert(1)</script>",
    });
    const unsafeHoverDetails = unsafeBookSpine.children[2];

    assert.equal(unsafeHoverDetails.innerHTML, "");
    assert.equal(
      unsafeHoverDetails.children[0].textContent,
      '<img src="x" onerror="alert(1)">',
    );
    assert.equal(
      unsafeHoverDetails.children[1].textContent,
      "<script>alert(1)</script>",
    );

    let transferredBookId = null;

    bookSpine.dispatch("dragstart", {
      dataTransfer: {
        setData(format, value) {
          if (format === "bookId") {
            transferredBookId = value;
          }
        },
      },
    });

    assert.equal(transferredBookId, "book-1");
    assert.equal(bookSpine.classList.contains("dragging"), true);

    bookSpine.dispatch("dragend", {});

    assert.equal(bookSpine.classList.contains("dragging"), false);

    bookSpine.dispatch("animationend", {
      target: bookSpine,
      animationName: "book-slide-in-right",
    });

    assert.equal(bookSpine.classList.contains("book-created"), false);
  } finally {
    if (originalDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = originalDocument;
    }
  }
});
