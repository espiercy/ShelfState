import { STATUS_LABELS } from "../config.js";
import { applyBookAnimation, completeBookAnimation } from "./animations.js";

export function createBookSpine(book) {
  const bookSpine = document.createElement("article");

  initializeBookSpine(bookSpine, book);
  bookSpine.appendChild(createBookSpineTitle(book));
  bookSpine.appendChild(createDeleteBookButton());
  bookSpine.appendChild(createBookHoverDetails(book));

  attachBookSpineDragEvents(bookSpine, book);
  applyBookAnimation(bookSpine, book.id);

  bookSpine.addEventListener("animationend", (event) => {
    completeBookAnimation(bookSpine, book.id, event.animationName);
  });

  return bookSpine;
}

function initializeBookSpine(bookSpine, book) {
  bookSpine.classList.add("book-spine", `book-status-${book.status}`);
  bookSpine.dataset.bookId = book.id;
  bookSpine.draggable = true;
}

function createBookSpineTitle(book) {
  const title = document.createElement("span");
  title.className = "book-spine-title";
  title.textContent = book.title;

  return title;
}

function createDeleteBookButton() {
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "delete-book-btn";
  deleteBtn.type = "button";
  deleteBtn.textContent = "×";

  return deleteBtn;
}

function createBookHoverDetails(book) {
  const hoverDetails = document.createElement("div");
  hoverDetails.className = "book-hover-details";

  const title = document.createElement("strong");
  title.textContent = book.title;

  const author = document.createElement("span");
  author.textContent = book.author;

  const progress = document.createElement("span");
  progress.textContent = `${book.progress}/${book.pages} pages`;

  const status = document.createElement("span");
  status.textContent = STATUS_LABELS[book.status];

  hoverDetails.appendChild(title);
  hoverDetails.appendChild(author);
  hoverDetails.appendChild(progress);
  hoverDetails.appendChild(status);

  return hoverDetails;
}

function attachBookSpineDragEvents(bookSpine, book) {
  bookSpine.addEventListener("dragstart", (event) => {
    event.dataTransfer.setData("bookId", book.id);
    bookSpine.classList.add("dragging");
  });

  bookSpine.addEventListener("dragend", () => {
    bookSpine.classList.remove("dragging");
  });
}
