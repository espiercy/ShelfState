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
  hoverDetails.innerHTML = `
    <strong>${book.title}</strong>
    <span>${book.author}</span>
    <span>${book.progress}/${book.pages} pages</span>
    <span>${STATUS_LABELS[book.status]}</span>
  `;

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
