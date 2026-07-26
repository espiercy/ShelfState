import test from "node:test";
import assert from "node:assert/strict";

import { validateBookData } from "../validation.js";

const validBook = {
  title: "Book",
  author: "Author",
  pages: 100,
  progress: 10,
  status: "currently-reading",
};

test("accepts valid book data", () => {
  assert.deepEqual(validateBookData(validBook), []);
});

test("requires a title and author", () => {
  const errors = validateBookData({
    ...validBook,
    title: " ",
    author: "",
  });

  assert.ok(errors.includes("Title is required."));
  assert.ok(errors.includes("Author is required."));
});

test("enforces page and progress bounds", () => {
  assert.ok(
    validateBookData({
      ...validBook,
      pages: 0,
    }).includes("Pages must be greater than zero."),
  );

  assert.ok(
    validateBookData({
      ...validBook,
      progress: -1,
    }).includes("Progress cannot be negative."),
  );

  assert.ok(
    validateBookData({
      ...validBook,
      progress: 101,
    }).includes("Progress cannot exceed total pages."),
  );
});
