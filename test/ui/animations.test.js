import test from "node:test";
import assert from "node:assert/strict";

import {
  setBookAnimation,
  setBookshelfAnimation,
  applyBookAnimation,
  completeBookAnimation,
  applyBookshelfAnimation,
  startBookDeleteAnimation,
  startBookshelfDeleteAnimation,
} from "../../src/ui/animations.js";

class FakeElement {
  constructor() {
    this.classes = new Set();
    this.animationEndListeners = new Set();

    this.classList = {
      add: (className) => this.classes.add(className),
      remove: (className) => this.classes.delete(className),
      contains: (className) => this.classes.has(className),
    };
  }

  addEventListener(eventName, listener) {
    if (eventName === "animationend") {
      this.animationEndListeners.add(listener);
    }
  }

  removeEventListener(eventName, listener) {
    if (eventName === "animationend") {
      this.animationEndListeners.delete(listener);
    }
  }

  dispatchAnimationEnd(animationName, target = this) {
    const event = {
      animationName,
      target,
    };

    [...this.animationEndListeners].forEach((listener) => {
      listener(event);
    });
  }

  get animationEndListenerCount() {
    return this.animationEndListeners.size;
  }
}

test("applies created and moved book animations", () => {
  const createdBook = new FakeElement();

  setBookAnimation("created-book", "created");
  applyBookAnimation(createdBook, "created-book");

  assert.equal(createdBook.classList.contains("book-created"), true);

  completeBookAnimation(createdBook, "created-book", "book-slide-in-right");

  const movedBook = new FakeElement();

  setBookAnimation("moved-book", "moved");
  applyBookAnimation(movedBook, "moved-book");

  assert.equal(movedBook.classList.contains("book-moved"), true);

  completeBookAnimation(movedBook, "moved-book", "book-slide-in-left");
});

test("ignores mismatched and unsupported book animations", () => {
  const mismatchedBook = new FakeElement();

  setBookAnimation("expected-book", "created");
  applyBookAnimation(mismatchedBook, "other-book");

  assert.equal(mismatchedBook.classes.size, 0);

  const unsupportedBook = new FakeElement();

  setBookAnimation("unsupported-book", "edited");
  applyBookAnimation(unsupportedBook, "unsupported-book");

  assert.equal(unsupportedBook.classes.size, 0);
});

test("completes only recognized book animation events", () => {
  const bookElement = new FakeElement();

  setBookAnimation("book-1", "created");
  applyBookAnimation(bookElement, "book-1");

  assert.equal(
    completeBookAnimation(bookElement, "book-1", "unrelated"),
    false,
  );
  assert.equal(bookElement.classList.contains("book-created"), true);

  assert.equal(
    completeBookAnimation(bookElement, "book-1", "book-slide-in-right"),
    true,
  );
  assert.equal(bookElement.classList.contains("book-created"), false);

  const rerenderedBook = new FakeElement();
  applyBookAnimation(rerenderedBook, "book-1");

  assert.equal(rerenderedBook.classes.size, 0);
});

test("applies and completes a created bookshelf animation", () => {
  const bookshelfElement = new FakeElement();
  setBookshelfAnimation("shelf-1", "created");

  assert.equal(applyBookshelfAnimation(bookshelfElement, "shelf-1"), true);
  assert.equal(bookshelfElement.classList.contains("bookshelf-created"), true);
  assert.equal(bookshelfElement.animationEndListenerCount, 1);

  bookshelfElement.dispatchAnimationEnd("bookshelf-expand");

  assert.equal(bookshelfElement.classList.contains("bookshelf-created"), false);
  assert.equal(bookshelfElement.animationEndListenerCount, 0);

  const rerenderedBookshelf = new FakeElement();

  assert.equal(applyBookshelfAnimation(rerenderedBookshelf, "shelf-1"), false);
});

test("ignores unrelated bookshelf events and unsupported states", () => {
  const bookshelfElement = new FakeElement();

  setBookshelfAnimation("shelf-2", "created");
  applyBookshelfAnimation(bookshelfElement, "shelf-2");

  bookshelfElement.dispatchAnimationEnd("bookshelf-expand", new FakeElement());
  bookshelfElement.dispatchAnimationEnd("unrelated");

  assert.equal(bookshelfElement.classList.contains("bookshelf-created"), true);
  assert.equal(bookshelfElement.animationEndListenerCount, 1);

  bookshelfElement.dispatchAnimationEnd("bookshelf-expand");

  const unsupportedBookshelf = new FakeElement();

  setBookshelfAnimation("shelf-3", "deleted");

  assert.equal(applyBookshelfAnimation(unsupportedBookshelf, "shelf-3"), false);
  assert.equal(unsupportedBookshelf.animationEndListenerCount, 0);
});

test("completes book deletion only for its own animation event", () => {
  const bookElement = new FakeElement();
  let completionCount = 0;

  startBookDeleteAnimation(bookElement, () => {
    completionCount++;
  });

  assert.equal(bookElement.classList.contains("book-deleted"), true);
  assert.equal(bookElement.animationEndListenerCount, 1);

  bookElement.dispatchAnimationEnd("book-delete", new FakeElement());
  bookElement.dispatchAnimationEnd("unrelated");

  assert.equal(completionCount, 0);
  assert.equal(bookElement.animationEndListenerCount, 1);

  bookElement.dispatchAnimationEnd("book-delete");

  assert.equal(completionCount, 1);
  assert.equal(bookElement.animationEndListenerCount, 0);

  bookElement.dispatchAnimationEnd("book-delete");
  assert.equal(completionCount, 1);
});

test("completes bookshelf deletion only for its own animation event", () => {
  const bookshelfElement = new FakeElement();
  let completionCount = 0;

  startBookshelfDeleteAnimation(bookshelfElement, () => {
    completionCount++;
  });

  assert.equal(bookshelfElement.classList.contains("bookshelf-deleted"), true);
  assert.equal(bookshelfElement.animationEndListenerCount, 1);

  (bookshelfElement.dispatchAnimationEnd(
    "bookshelf-collapse",
    new FakeElement(),
  ),
    bookshelfElement.dispatchAnimationEnd("unrelated"));

  assert.equal(completionCount, 0);
  assert.equal(bookshelfElement.animationEndListenerCount, 1);

  bookshelfElement.dispatchAnimationEnd("bookshelf-collapse");

  assert.equal(completionCount, 1);
  assert.equal(bookshelfElement.animationEndListenerCount, 0);

  bookshelfElement.dispatchAnimationEnd("bookshelf-collapse");
  assert.equal(completionCount, 1);
});
