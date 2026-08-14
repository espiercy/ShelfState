//Imports
import {
  MAX_BOOKS_PER_SHELF,
  SHELF_STATUSES,
  STATUS_LABELS,
  BOOK_STATUS,
  BOOK_CLASSIFICATION,
  BOOK_FIELDS,
  DEFAULT_BOOKSHELF_NAME,
  CLASSIFICATION_LABELS,
} from "../../config.js";

import { Book, Bookshelf } from "../domain/models.js";

import { getReadingInsights } from "../domain/insights.js";

import {
  ensureDefaultBookshelf,
  ensureActiveBookshelfId,
  getDefaultBookshelf,
  normalizeBookshelfName,
  hasBookshelfName,
  removeBookshelfFromLibrary,
  renameBookshelfInLibrary,
  assignBookToBookshelf,
  addBookshelfToLibrary,
  getBooksForBookshelf,
} from "../domain/bookshelves.js";

import {
  migrateBooksToBookshelfIds,
  migrateBookshelvesFromLegacyNames,
} from "../persistence/migrations.js";

import {
  backupBooksBeforeMigration,
  saveBooks as persistBooks,
  loadBooks as loadStoredBooks,
  saveBookshelves as persistBookshelves,
  loadBookshelves as loadStoredBookshelves,
  saveActiveBookshelfId as persistActiveBookshelfId,
  loadActiveBookshelfId as loadStoredActiveBookshelfId,
  createLibraryExportData,
} from "../persistence/storage.js";

import {
  bookMatchesSearch as matchesBookSearch,
  isSearchActive as hasActiveSearch,
  getSearchSummaryText,
} from "../domain/search.js";

import {
  setBookAnimation,
  setBookshelfAnimation,
  applyBookAnimation,
  completeBookAnimation,
  applyBookshelfAnimation,
  startBookDeleteAnimation,
  startBookshelfDeleteAnimation,
} from "../ui/animations.js";

import { validateBookData } from "../domain/validation.js";
import { chunkBooks } from "../ui/layout.js";
import { createBookData } from "./book-data.js";
import {
  addBookToLibrary,
  removeBookFromLibrary,
  updateBookInLibrary,
} from "../domain/books.js";

//DOM Selectors
const showFormBtn = document.querySelector("#show-form-btn");
const submitBookBtn = document.querySelector("#submit-book-btn");
const cancelFormBtn = document.querySelector("#cancel-form-btn");
const form = document.querySelector("#new-book-form");
const bookList = document.querySelector("#book-list");
const bookshelfSelector = document.querySelector("#bookshelf-selector");
const libraryLayout = document.querySelector("#library-layout");
const bookSearchInput = document.querySelector("#book-search");
const bookSearchField = document.querySelector("#search-field");
const searchSummary = document.querySelector("#search-summary");
const clearSearchBtn = document.querySelector("#clear-search-btn");
const toggleSearchBtn = document.querySelector("#toggle-search-btn");
const searchPanel = document.querySelector("#search-panel");
const readingInsights = document.querySelector("#reading-insights");
const exportDataBtn = document.querySelector("#export-data-btn");
const toggleInsightsBtn = document.querySelector("#toggle-insights-btn");
const insightsLayout = document.querySelector("#insights-layout");

//App State
const appState = {
  activeView: "library",
  books: [],
  bookshelves: [],
  booksLoadFailed: false,
  activeBookshelfId: null,
  editingBookId: null,
  lastMovedBookId: null,
  searchQuery: "",
  searchField: "all",
  isSearchVisible: false,
};

//Event Listeners
showFormBtn.addEventListener("click", () => {
  openForm();
});

cancelFormBtn.addEventListener("click", closeForm);

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const bookData = getBookData();
  const errors = validateBookData(bookData);
  if (errors.length > 0) {
    alert(errors.join("\n"));
    return;
  }

  if (appState.editingBookId) {
    updateBookInLibrary(appState.books, appState.editingBookId, bookData);
  } else {
    const book = addBookToLibrary(appState.books, bookData);
    setBookAnimation(book.id, "created");
  }

  saveBooks();
  closeForm();
  renderBooks();
});

bookList.addEventListener("click", (event) => {
  const bookElement = event.target.closest(".book-spine");
  if (!bookElement) return;

  if (event.target.closest(".delete-book-btn")) {
    animateBookDelete(bookElement, bookElement.dataset.bookId);
    return;
  }

  bookElement.classList.add("book-spine-selected");

  setTimeout(() => {
    openEditForm(bookElement.dataset.bookId);
  }, 275);
});

bookSearchInput.addEventListener("input", (event) => {
  appState.searchQuery = event.target.value;
  renderBooks();
});

bookSearchField.addEventListener("change", (event) => {
  appState.searchField = event.target.value;
  renderBooks();
});

clearSearchBtn.addEventListener("click", clearSearch);

bookSearchInput.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;

  clearSearch();
});

function clearSearch() {
  appState.searchQuery = "";
  appState.searchField = "all";

  bookSearchInput.value = "";
  bookSearchField.value = "all";

  renderBooks();

  bookSearchInput.focus();
}

toggleSearchBtn.addEventListener("click", toggleSearchPanel);

function toggleSearchPanel() {
  appState.isSearchVisible = !appState.isSearchVisible;
  searchPanel.classList.toggle("hidden", !appState.isSearchVisible);
  toggleSearchBtn.textContent = appState.isSearchVisible
    ? "Hide Search"
    : "Search";
}

exportDataBtn.addEventListener("click", () => {
  if (appState.booksLoadFailed) {
    console.error("Library export blocked because books failed to load.");
    return;
  }

  const exportData = createLibraryExportData(
    appState.books,
    appState.bookshelves,
    appState.activeBookshelfId,
  );

  const exportJson = JSON.stringify(exportData, null, 2);
  const exportBlob = new Blob([exportJson], {
    type: "application/json",
  });

  const downloadUrl = URL.createObjectURL(exportBlob);
  const downloadLink = document.createElement("a");

  downloadLink.href = downloadUrl;
  downloadLink.download = `shelfstate-backup-${exportData.exportedAt.slice(0, 10)}.json`;

  document.body.append(downloadLink);
  downloadLink.click();
  downloadLink.remove();

  URL.revokeObjectURL(downloadUrl);
});

toggleInsightsBtn.addEventListener("click", () => {
  const nextView = appState.activeView === "insights" ? "library" : "insights";

  if (nextView === "insights") {
    closeForm();
  }

  appState.activeView = nextView;
  renderActiveView();
});

// Form Data
function getBookData() {
  return createBookData(new FormData(form), appState.bookshelves);
}

// Rendering
function renderActiveView() {
  const isLibraryView = appState.activeView === "library";
  const isInsightsView = appState.activeView === "insights";

  libraryLayout.classList.toggle("hidden", !isLibraryView);
  insightsLayout.classList.toggle("hidden", !isInsightsView);

  toggleInsightsBtn.textContent = isInsightsView
    ? "Back to Library"
    : "Reading Insights";

  showFormBtn.classList.toggle("hidden", isInsightsView);
  toggleSearchBtn.classList.toggle("hidden", isInsightsView);

  searchPanel.classList.toggle(
    "hidden",
    isInsightsView || !appState.isSearchVisible,
  );
}

function renderBooks() {
  clearSelectedSpines();
  bookList.replaceChildren();

  renderBookshelfSelector();
  renderSearchSummary();
  renderReadingInsights();

  if (appState.books.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-bookshelf-message";
    emptyState.textContent =
      "No books added yet. Click Add Book to start your shelf.";
    bookList.appendChild(emptyState);
    return;
  }

  const activeBookshelf = appState.bookshelves.find(
    (bookshelf) => bookshelf.id === appState.activeBookshelfId,
  );

  if (activeBookshelf) {
    renderBookshelf(activeBookshelf);
  }

  clearSearchBtn.hidden = !isSearchActive();
}

function renderBookshelf(bookshelf) {
  const bookshelfSection = document.createElement("section");
  bookshelfSection.className = "bookshelf";

  const heading = document.createElement("h2");
  heading.className = "bookshelf-title";
  heading.textContent = bookshelf.name;

  bookshelfSection.appendChild(heading);

  let renderedShelfCount = 0;

  SHELF_STATUSES.forEach((status) => {
    const didRenderShelf = renderStatusShelf(
      status,
      bookshelf.name,
      bookshelfSection,
    );

    if (didRenderShelf) {
      renderedShelfCount++;
    }
  });

  if (renderedShelfCount === 0) {
    const emptyBookshelfMessage = document.createElement("div");
    emptyBookshelfMessage.className = "empty-bookshelf-message";
    emptyBookshelfMessage.textContent = isSearchActive()
      ? "No books matched your search. Try another title, author, category, note, or ISBN."
      : "This bookshelf is empty. Drag books here or add a new book.";

    bookshelfSection.appendChild(emptyBookshelfMessage);
  }

  bookList.appendChild(bookshelfSection);
}

function renderStatusShelf(status, bookshelfName, bookshelfElement) {
  const bookshelf = appState.bookshelves.find(
    (bookshelf) => bookshelf.name === bookshelfName,
  );

  if (!bookshelf) return false;

  let shelfBooks = getBooksForBookshelf(appState.books, bookshelf).filter(
    (book) => book.status === status && bookMatchesSearch(book),
  );

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

function renderBookshelfSelector() {
  bookshelfSelector.replaceChildren();

  appState.bookshelves.forEach((bookshelf) => {
    bookshelfSelector.appendChild(createBookshelfCard(bookshelf));
  });

  bookshelfSelector.appendChild(createNewBookshelfButton());
}

function renderBookshelfOptions() {
  const bookshelfSelect = form.elements.bookshelf;

  bookshelfSelect.replaceChildren();

  appState.bookshelves.forEach((bookshelf) => {
    const option = document.createElement("option");
    option.value = bookshelf.id;
    option.textContent = bookshelf.name;

    bookshelfSelect.appendChild(option);
  });
}

function renderReadingInsights() {
  const insights = getReadingInsights(appState.books, appState.bookshelves);

  const statusCards = SHELF_STATUSES.map(
    (status) => `
      <div class="insight-card">
        <span class="insight-value">
          ${insights.booksByStatus[status] ?? 0}
        </span>
        <span class="insight-label">${STATUS_LABELS[status]}</span>
      </div>
    `,
  ).join("");

  readingInsights.innerHTML = `<h2>Reading Insights</h2>
  
<div class="insight-grid">
	<div class="insight-card">
		<span class="insight-value">${insights.totalBooks}</span>
		<span class="insight-label">Books</span>
	</div>
	<div class="insight-card">
		<span class="insight-value">${insights.completedBooks}</span>
		<span class="insight-label">Completed</span>
	</div>	
	<div class="insight-card">
		<span class="insight-value">${insights.currentlyReadingBooks}</span>
		<span class="insight-label">Currently Reading</span>
	</div>		
	<div class="insight-card">
		<span class="insight-value">${insights.pagesRead}</span>
		<span class="insight-label">Pages Read</span>
	</div>		
	<div class="insight-card">
		<span class="insight-value">${insights.pagesRemaining}</span>
		<span class="insight-label">Pages Remaining</span>
	</div>
</div>
<h3>Books by Status</h3>
<div class="insight-grid">
  ${statusCards}
</div>
<h3>Books by Category</h3>
<div id="category-insights" class="insight-grid"></div>

<h3>Books by Bookshelf</h3>
<div id="bookshelf-insights" class="insight-grid"></div>

<h3>Books by Classification</h3>
<div id="classification-insights" class="insight-grid"></div>`;

  const categoryInsights = readingInsights.querySelector("#category-insights");

  const sortedCategories = Object.entries(insights.booksByCategory).sort(
    ([categoryA], [categoryB]) => categoryA.localeCompare(categoryB),
  );

  sortedCategories.forEach(([category, count]) => {
    categoryInsights.appendChild(createInsightCard(count, category));
  });

  const bookshelfInsights = readingInsights.querySelector(
    "#bookshelf-insights",
  );

  insights.booksByBookshelf.forEach((bookshelf) => {
    bookshelfInsights.appendChild(
      createInsightCard(bookshelf.count, bookshelf.name),
    );
  });

  const classificationInsights = readingInsights.querySelector(
    "#classification-insights",
  );

  Object.entries(CLASSIFICATION_LABELS).forEach(([classification, label]) => {
    const count = insights.booksByClassification[classification] ?? 0;

    classificationInsights.appendChild(createInsightCard(count, label));
  });
}

//UI Factories
function createInsightCard(valueText, labelText) {
  const card = document.createElement("div");
  card.className = "insight-card";

  const value = document.createElement("span");
  value.className = "insight-value";
  value.textContent = valueText;

  const label = document.createElement("span");
  label.className = "insight-label";
  label.textContent = labelText;

  card.append(value, label);

  return card;
}

function createBookshelfCard(bookshelf) {
  const card = document.createElement("button");

  initializeBookshelfCard(card);

  card.appendChild(createBookshelfCardName(bookshelf));

  if (bookshelf.name !== "My Library") {
    card.appendChild(createDeleteBookshelfButton(bookshelf));
  }

  markActiveBookshelfCard(card, bookshelf);
  applyBookshelfAnimation(card, bookshelf.id);
  attachBookshelfCardEvents(card, bookshelf);

  return card;
}

function initializeBookshelfCard(card) {
  card.className = "bookshelf-card";
}

function attachBookshelfCardEvents(card, bookshelf) {
  card.addEventListener("click", () => {
    appState.activeBookshelfId = bookshelf.id;
    saveActiveBookshelf();
    renderBooks();
  });

  card.addEventListener("dragover", (event) => {
    event.preventDefault();
    card.classList.add("bookshelf-card-drop-target");
  });

  card.addEventListener("dragleave", () => {
    card.classList.remove("bookshelf-card-drop-target");
  });

  card.addEventListener("drop", (event) => {
    event.preventDefault();
    card.classList.remove("bookshelf-card-drop-target");

    const bookId = event.dataTransfer.getData("bookId");

    moveBookToBookshelf(bookId, bookshelf);
  });

  card.addEventListener("dblclick", (event) => {
    event.stopPropagation();
    renameBookshelf(bookshelf.id);
  });
}

function createBookshelfCardName(bookshelf) {
  const shelfName = document.createElement("span");
  shelfName.textContent = bookshelf.name;
  return shelfName;
}

function createDeleteBookshelfButton(bookshelf) {
  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "delete-bookshelf-btn";
  deleteBtn.textContent = "×";

  deleteBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    animateBookshelfDelete(
      event.currentTarget.closest(".bookshelf-card"),
      bookshelf.id,
    );
  });

  return deleteBtn;
}

function createNewBookshelfButton() {
  const newBookshelfBtn = document.createElement("button");
  newBookshelfBtn.id = "new-bookshelf-btn";
  newBookshelfBtn.type = "button";
  newBookshelfBtn.className = "new-bookshelf-btn";
  newBookshelfBtn.textContent = "+ New Bookshelf";

  newBookshelfBtn.addEventListener("click", () => {
    const name = prompt("Bookshelf name: ");

    if (!name) return;
    const bookshelf = createBookshelf(name);

    if (!bookshelf) return;

    setBookshelfAnimation(bookshelf.id, "created");

    saveBookshelves();
    saveActiveBookshelf();
    renderBooks();
  });
  return newBookshelfBtn;
}

function createBookSpine(book) {
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

function markActiveBookshelfCard(card, bookshelf) {
  if (bookshelf.id === appState.activeBookshelfId) {
    card.classList.add("bookshelf-card-active");
  }
}

function createBookDetail(label, value) {
  const detail = document.createElement("p");
  const labelElement = document.createElement("strong");
  labelElement.textContent = `${label}:`;
  detail.append(labelElement, ` ${value}`);
  return detail;
}

//UI Helpers
function clearSelectedSpines() {
  document
    .querySelectorAll(".book-spine-selected")
    .forEach((spine) => spine.classList.remove("book-spine-selected"));
}

function getVisibleBooks() {
  const activeBookshelf = appState.bookshelves.find(
    (bookshelf) => bookshelf.id === appState.activeBookshelfId,
  );

  if (!activeBookshelf) return [];

  return getBooksForBookshelf(appState.books, activeBookshelf).filter(
    bookMatchesSearch,
  );
}

function renderSearchSummary() {
  const matchCount = isSearchActive() ? getVisibleBooks().length : 0;

  searchSummary.textContent = getSearchSummaryText(
    appState.searchQuery,
    matchCount,
  );
}

function isSearchActive() {
  return hasActiveSearch(appState.searchQuery);
}

function animateBookshelfDelete(card, bookshelfId) {
  const bookshelf = appState.bookshelves.find(
    (bookshelf) => bookshelf.id === bookshelfId,
  );

  if (!bookshelf || bookshelf.name === DEFAULT_BOOKSHELF_NAME) return;

  const shouldDelete = confirmDeleteBookshelf(bookshelf);

  if (!shouldDelete) return;

  if (!card) {
    deleteBookshelf(bookshelfId);
    return;
  }

  startBookshelfDeleteAnimation(card, () => {
    deleteBookshelf(bookshelfId);
  });
}

function confirmDeleteBookshelf(bookshelf) {
  const booksOnShelf = getBooksForBookshelf(appState.books, bookshelf).length;

  return confirm(
    `Delete "${bookshelf.name}"?\n\n${booksOnShelf} book${booksOnShelf === 1 ? "" : "s"} will move back to My Library.`,
  );
}

function animateBookDelete(bookElement, bookId) {
  const shouldDelete = confirm("Delete this book?");

  if (!shouldDelete) return;

  startBookDeleteAnimation(bookElement, () => {
    deleteBook(bookId);
  });
}
// Book Actions
function deleteBook(bookId) {
  appState.books = removeBookFromLibrary(appState.books, bookId);
  saveBooks();
  renderBooks();
}

// Bookshelf Actions
function createBookshelf(name) {
  const trimmedName = normalizeBookshelfName(name);

  if (!trimmedName) return null;

  const bookshelf = addBookshelfToLibrary(appState.bookshelves, trimmedName);

  if (!bookshelf) {
    alert(`A bookshelf named "${trimmedName}" already exists.`);
    return null;
  }

  appState.activeBookshelfId = bookshelf.id;

  return bookshelf;
}

function deleteBookshelf(bookshelfId) {
  const result = removeBookshelfFromLibrary(
    appState.bookshelves,
    appState.books,
    bookshelfId,
  );

  if (!result) return;

  appState.bookshelves = result.bookshelves;
  appState.activeBookshelfId = result.activeBookshelfId;

  saveBooks();
  saveBookshelves();
  saveActiveBookshelf();
  renderBooks();
}

function renameBookshelf(bookshelfId) {
  const bookshelf = appState.bookshelves.find(
    (bookshelf) => bookshelf.id === bookshelfId,
  );

  if (!bookshelf || bookshelf.name === DEFAULT_BOOKSHELF_NAME) return;

  const newName = prompt("New bookshelf name:", bookshelf.name);

  if (!newName) return;

  const trimmedName = normalizeBookshelfName(newName);

  if (!trimmedName || trimmedName === bookshelf.name) return;

  const alreadyExists = hasBookshelfName(
    appState.bookshelves,
    trimmedName,
    bookshelfId,
  );

  if (alreadyExists) {
    alert(`A bookshelf named "${trimmedName}" already exists.`);
    return;
  }

  renameBookshelfInLibrary(bookshelf, trimmedName);

  saveBookshelves();
  renderBooks();
}

function moveBookToBookshelf(bookId, bookshelf) {
  const book = appState.books.find((book) => book.id === bookId);

  if (!book) return;

  assignBookToBookshelf(book, bookshelf);

  appState.activeBookshelfId = bookshelf.id;
  setBookAnimation(book.id, "moved");

  saveActiveBookshelf();
  saveBooks();
  renderBooks();

  appState.lastMovedBookId = null;
}

function bookMatchesSearch(book) {
  return matchesBookSearch(book, appState.searchQuery, appState.searchField);
}

// Form UI
function openForm(submitLabel = "Save Book") {
  renderBookshelfOptions();
  form.classList.remove("hidden");
  showFormBtn.classList.add("hidden");
  libraryLayout.classList.add("hidden");
  submitBookBtn.textContent = submitLabel;
  document.querySelector("main").classList.add("form-mode");
}

function closeForm() {
  form.reset();
  form.classList.add("hidden");
  showFormBtn.classList.remove("hidden");
  libraryLayout.classList.remove("hidden");
  appState.editingBookId = null;
  submitBookBtn.textContent = "Save Book";
  document.querySelector("main").classList.remove("form-mode");
  clearSelectedSpines();
}

function openEditForm(bookId) {
  const book = appState.books.find((book) => book.id === bookId);
  if (!book) return;

  openForm("Update Book");

  appState.editingBookId = bookId;
  BOOK_FIELDS.forEach((field) => {
    form.elements[field].value = book[field] ?? "";
  });

  form.elements.bookshelf.value = book.bookshelfId ?? "";
}

//Persistence
function saveBooks() {
  if (appState.booksLoadFailed) {
    console.error("Book save blocked because stored books failed to load.");

    return false;
  }

  return persistBooks(appState.books);
}

function loadBooks() {
  try {
    const storedBooks = loadStoredBooks();

    appState.books = storedBooks;
    appState.booksLoadFailed = false;
  } catch (error) {
    console.error("Failed to load books:", error);
    appState.booksLoadFailed = true;
    appState.books = [];
  }
}

function saveBookshelves() {
  persistBookshelves(appState.bookshelves);
}

function loadBookshelves() {
  try {
    const storedBookshelves = loadStoredBookshelves();

    appState.bookshelves = storedBookshelves.map(
      (bookshelfData) => new Bookshelf(bookshelfData),
    );
  } catch (error) {
    console.error("Failed to load bookshelves:", error);
    appState.bookshelves = [];
  }

  appState.bookshelves = ensureDefaultBookshelf(appState.bookshelves);

  if (!appState.activeBookshelfId && appState.bookshelves.length > 0) {
    appState.activeBookshelfId = appState.bookshelves[0].id;
  }
}

function saveActiveBookshelf() {
  persistActiveBookshelfId(appState.activeBookshelfId);
}

function loadActiveBookshelf() {
  appState.activeBookshelfId = loadStoredActiveBookshelfId();
}

//Initialization
function initializeApp() {
  loadBooks();
  loadBookshelves();

  const bookshelfCountBeforeMigration = appState.bookshelves.length;

  appState.bookshelves = migrateBookshelvesFromLegacyNames(
    appState.bookshelves,
    appState.books,
  );

  const didMigrateBookshelves =
    appState.bookshelves.length > bookshelfCountBeforeMigration;

  appState.bookshelves = ensureDefaultBookshelf(appState.bookshelves);

  if (didMigrateBookshelves) {
    saveBookshelves();
  }

  const didMigrate = migrateBooksToBookshelfIds(
    appState.books,
    appState.bookshelves,
  );

  appState.books = appState.books.map((bookData) => new Book(bookData));

  if (didMigrate && backupBooksBeforeMigration()) {
    saveBooks();
  }

  loadActiveBookshelf();

  appState.activeBookshelfId = ensureActiveBookshelfId(
    appState.bookshelves,
    appState.activeBookshelfId,
  );

  renderBooks();
  renderActiveView();
}

initializeApp();
