import { renderBookshelf } from "./bookshelf-view.js";

export function renderLibraryBookList({
  bookList,
  isLibraryEmpty,
  activeBookshelf,
  visibleBooks,
  searchActive,
}) {
  bookList.replaceChildren();

  if (isLibraryEmpty) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-bookshelf-message";
    emptyState.textContent =
      "No books added yet. Click Add Book to start your shelf.";

    bookList.appendChild(emptyState);
    return;
  }

  if (!activeBookshelf) return;

  renderBookshelf(bookList, activeBookshelf, visibleBooks, searchActive);
}
