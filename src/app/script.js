//Imports
import {
  BOOK_STATUS,
  BOOK_CLASSIFICATION,
  DEFAULT_BOOKSHELF_NAME,
} from "../config.js";
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
  startBookDeleteAnimation,
  startBookshelfDeleteAnimation,
} from "../ui/animations.js";
import { validateBookData } from "../domain/validation.js";
import { renderReadingInsights } from "../ui/insights-view.js";
import { renderBookshelfSelector as renderBookshelfSelectorView } from "../ui/bookshelf-selector-view.js";
import { renderBookshelf as renderBookshelfView } from "../ui/bookshelf-view.js";
import {
  openBookForm,
  closeBookForm,
  populateBookForm,
} from "../ui/book-form-view.js";
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

  const insights = getReadingInsights(appState.books, appState.bookshelves);

  renderReadingInsights(readingInsights, insights);

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
    const visibleBooks = getBooksForBookshelf(
      appState.books,
      activeBookshelf,
    ).filter(bookMatchesSearch);

    renderBookshelfView(
      bookList,
      activeBookshelf,
      visibleBooks,
      isSearchActive(),
    );
  }

  clearSearchBtn.hidden = !isSearchActive();
}

function renderBookshelfSelector() {
  renderBookshelfSelectorView(
    bookshelfSelector,
    appState.bookshelves,
    appState.activeBookshelfId,
    {
      onSelect(bookshelf) {
        appState.activeBookshelfId = bookshelf.id;
        saveActiveBookshelf();
        renderBooks();
      },
      onDropBook(bookId, bookshelf) {
        moveBookToBookshelf(bookId, bookshelf);
      },
      onRename(bookshelf) {
        renameBookshelf(bookshelf.id);
      },
      onDelete(card, bookshelf) {
        animateBookshelfDelete(card, bookshelf.id);
      },
      onCreate(name) {
        const bookshelf = createBookshelf(name);

        if (!bookshelf) return;

        setBookshelfAnimation(bookshelf.id, "created");

        saveBookshelves();
        saveActiveBookshelf();
        renderBooks();
      },
    },
  );
}

//UI Factories

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
  openBookForm({
    form,
    showFormButton: showFormBtn,
    libraryLayout,
    submitButton: submitBookBtn,
    mainElement: document.querySelector("main"),
    bookshelves: appState.bookshelves,
    submitLabel,
  });
}

function closeForm() {
  closeBookForm({
    form,
    showFormButton: showFormBtn,
    libraryLayout,
    submitButton: submitBookBtn,
    mainElement: document.querySelector("main"),
  });

  appState.editingBookId = null;
  clearSelectedSpines();
}

function openEditForm(bookId) {
  const book = appState.books.find((book) => book.id === bookId);
  if (!book) return;

  openForm("Update Book");

  appState.editingBookId = bookId;
  populateBookForm(form, book);
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
