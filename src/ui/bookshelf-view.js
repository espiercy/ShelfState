import {
  MAX_BOOKS_PER_SHELF,
  SHELF_STATUSES,
  STATUS_LABELS,
} from "../config.js";
import { createBookSpine } from "./book-spine-view.js";
import { chunkBooks } from "./layout.js";

export function renderBookshelf(bookList, bookshelf, books, searchActive) {
  const bookshelfSection = document.createElement("section");
  bookshelfSection.className = "bookshelf";

  const heading = document.createElement("h2");
  heading.className = "bookshelf-title";
  heading.textContent = bookshelf.name;

  bookshelfSection.appendChild(heading);

  let renderedShelfCount = 0;

  SHELF_STATUSES.forEach((status) => {
    const didRenderShelf = renderStatusShelf(status, books, bookshelfSection);

    if (didRenderShelf) {
      renderedShelfCount++;
    }
  });

  if (renderedShelfCount === 0) {
    const emptyBookshelfMessage = document.createElement("div");
    emptyBookshelfMessage.className = "empty-bookshelf-message";
    emptyBookshelfMessage.textContent = searchActive
      ? "No books matched your search. Try another title, author, category, note, or ISBN."
      : "This bookshelf is empty. Drag books here or add a new book.";

    bookshelfSection.appendChild(emptyBookshelfMessage);
  }

  bookList.appendChild(bookshelfSection);
}

function renderStatusShelf(status, books, bookshelfElement) {
  let shelfBooks = books.filter((book) => book.status === status);

  if (status === "completed") {
    shelfBooks = shelfBooks.slice(0, MAX_BOOKS_PER_SHELF);
  }

  if (shelfBooks.length === 0) return false;

  const shelfChunks = chunkBooks(shelfBooks, MAX_BOOKS_PER_SHELF);

  shelfChunks.forEach((booksForShelf, index) => {
    const shelf = document.createElement("section");
    shelf.className = "book-shelf";

    const heading = document.createElement("h2");
    heading.textContent =
      index === 0
        ? STATUS_LABELS[status]
        : `${STATUS_LABELS[status]} continued`;

    shelf.appendChild(heading);

    const shelfRow = document.createElement("div");
    shelfRow.className = "shelf-row";

    booksForShelf.forEach((book) => {
      const bookCard = createBookSpine(book);
      shelfRow.appendChild(bookCard);
    });

    shelf.appendChild(shelfRow);
    bookshelfElement.appendChild(shelf);
  });

  return true;
}
