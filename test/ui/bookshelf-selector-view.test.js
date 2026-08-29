import test from "node:test";
import assert from "node:assert/strict";

import { setBookshelfAnimation } from "../../src/ui/animations.js";
import { renderBookshelfSelector } from "../../src/ui/bookshelf-selector-view.js";

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.parentElement = null;
    this.listeners = new Map();
    this.classes = new Set();
    this._className = "";
    this._textContent = "";
    this.id = "";
    this.type = "";

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
    child.parentElement = this;
    this.children.push(child);

    return child;
  }

  replaceChildren(...children) {
    this.children = [];

    children.forEach((child) => {
      this.appendChild(child);
    });
  }

  addEventListener(eventName, listener) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }

    this.listeners.get(eventName).add(listener);
  }

  removeEventListener(eventName, listener) {
    this.listeners.get(eventName)?.delete(listener);
  }

  dispatch(eventName, event = {}) {
    const dispatchedEvent = {
      target: this,
      currentTarget: this,
      preventDefault() {},
      stopPropagation() {},
      ...event,
    };

    [...(this.listeners.get(eventName) ?? [])].forEach((listener) => {
      listener(dispatchedEvent);
    });
  }

  closest(selector) {
    let element = this;

    while (element) {
      if (
        selector === ".bookshelf-card" &&
        element.classList.contains("bookshelf-card")
      ) {
        return element;
      }

      element = element.parentElement;
    }

    return null;
  }
}

test("renders bookshelf controls and forwards selector interactions", () => {
  const originalDocument = globalThis.document;
  const originalPrompt = globalThis.prompt;

  globalThis.document = {
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };

  const createdNames = [];

  globalThis.prompt = () => " Science Fiction ";

  try {
    const bookshelfSelector = new FakeElement("div");
    const defaultBookshelf = {
      id: "default",
      name: "Renamed Library",
      isDefault: true,
    };
    const favoriteBookshelf = {
      id: "favorites",
      name: "My Library",
      isDefault: false,
    };
    const calls = {
      selected: [],
      dropped: [],
      renamed: [],
      deleted: [],
    };

    setBookshelfAnimation(favoriteBookshelf.id, "created");

    renderBookshelfSelector(
      bookshelfSelector,
      [defaultBookshelf, favoriteBookshelf],
      favoriteBookshelf.id,
      {
        onSelect(bookshelf) {
          calls.selected.push(bookshelf);
        },
        onDropBook(bookId, bookshelf) {
          calls.dropped.push({ bookId, bookshelf });
        },
        onRename(bookshelf) {
          calls.renamed.push(bookshelf);
        },
        onDelete(card, bookshelf) {
          calls.deleted.push({ card, bookshelf });
        },
        onCreate(name) {
          createdNames.push(name);
        },
      },
    );

    assert.equal(bookshelfSelector.children.length, 3);

    const [defaultCard, favoriteCard, newBookshelfButton] =
      bookshelfSelector.children;

    assert.equal(defaultCard.className, "bookshelf-card");
    assert.equal(defaultCard.children[0].textContent, "Renamed Library");
    assert.equal(defaultCard.children.length, 1);

    assert.equal(
      favoriteCard.classList.contains("bookshelf-card-active"),
      true,
    );
    assert.equal(favoriteCard.classList.contains("bookshelf-created"), true);
    assert.equal(favoriteCard.children[0].textContent, "My Library");
    assert.equal(favoriteCard.children.length, 2);

    favoriteCard.dispatch("click");

    assert.deepEqual(calls.selected, [favoriteBookshelf]);

    let dragoverPrevented = false;

    favoriteCard.dispatch("dragover", {
      preventDefault() {
        dragoverPrevented = true;
      },
    });

    assert.equal(dragoverPrevented, true);
    assert.equal(
      favoriteCard.classList.contains("bookshelf-card-drop-target"),
      true,
    );

    favoriteCard.dispatch("dragleave");

    assert.equal(
      favoriteCard.classList.contains("bookshelf-card-drop-target"),
      false,
    );

    favoriteCard.dispatch("dragover");

    let dropPrevented = false;

    favoriteCard.dispatch("drop", {
      preventDefault() {
        dropPrevented = true;
      },
      dataTransfer: {
        getData(format) {
          assert.equal(format, "bookId");
          return "book-1";
        },
      },
    });

    assert.equal(dropPrevented, true);
    assert.equal(
      favoriteCard.classList.contains("bookshelf-card-drop-target"),
      false,
    );
    assert.deepEqual(calls.dropped, [
      {
        bookId: "book-1",
        bookshelf: favoriteBookshelf,
      },
    ]);

    let renamePropagationStopped = false;

    favoriteCard.dispatch("dblclick", {
      stopPropagation() {
        renamePropagationStopped = true;
      },
    });

    assert.equal(renamePropagationStopped, true);
    assert.deepEqual(calls.renamed, [favoriteBookshelf]);

    const deleteButton = favoriteCard.children[1];
    let deletePropagationStopped = false;

    deleteButton.dispatch("click", {
      stopPropagation() {
        deletePropagationStopped = true;
      },
    });

    assert.equal(deletePropagationStopped, true);
    assert.deepEqual(calls.deleted, [
      {
        card: favoriteCard,
        bookshelf: favoriteBookshelf,
      },
    ]);

    assert.equal(newBookshelfButton.id, "new-bookshelf-btn");
    assert.equal(newBookshelfButton.type, "button");
    assert.equal(newBookshelfButton.textContent, "+ New Bookshelf");

    newBookshelfButton.dispatch("click");

    assert.deepEqual(createdNames, [" Science Fiction "]);

    globalThis.prompt = () => "";
    newBookshelfButton.dispatch("click");

    assert.deepEqual(createdNames, [" Science Fiction "]);

    favoriteCard.dispatch("animationend", {
      animationName: "bookshelf-expand",
    });

    assert.equal(favoriteCard.classList.contains("bookshelf-created"), false);
  } finally {
    if (originalDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = originalDocument;
    }

    if (originalPrompt === undefined) {
      delete globalThis.prompt;
    } else {
      globalThis.prompt = originalPrompt;
    }
  }
});
