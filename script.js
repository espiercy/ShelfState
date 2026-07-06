//Imports
import {
  BOOKS_STORAGE_KEY,
  BOOKSHELVES_STORAGE_KEY,
  ACTIVE_BOOKSHELF_STORAGE_KEY,
  MAX_BOOKS_PER_SHELF,
  BOOK_FIELDS,
  SHELF_STATUSES,
  STATUS_LABELS,
} from "./config.js";

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

//App State
const appState = {
  books: [],
  bookshelves: [],
  activeBookshelfId: null,
  editingBookId: null,
  lastMovedBookId: null,
  searchQuery: "",
  searchField: "all",
  isSearchVisible: false,

  lastAnimatedBookId: null,
  lastBookAnimation: null,
  lastAnimatedBookshelfId: null,
  lastBookshelfAnimation: null,
};

//Classes
class Book {
  constructor({
    id = crypto.randomUUID(),
    title,
    author,
    pages,
    progress,
    startDate,
    endDate,
    isbn,
    notes,
    classification,
    category,
    status,
    bookshelf = "",
    createdAt = new Date(),
    updatedAt = new Date(),
  }) {
    this.id = id;
    this.title = title;
    this.author = author;
    this.pages = pages;
    this.progress = progress;
    this.startDate = startDate;
    this.endDate = endDate;
    this.isbn = isbn;
    this.notes = notes;
    this.classification = classification;
    this.category = category;
    this.status = status;
    this.bookshelf = bookshelf;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  update(bookData) {
    BOOK_FIELDS.forEach((field) => {
      this[field] = bookData[field];
    });
    this.updatedAt = new Date();
  }
}

class Bookshelf {
  constructor({ id = crypto.randomUUID(), name, bookIds = [] }) {
    this.id = id;
    this.name = name;
    this.bookIds = bookIds;
  }
}

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
    const existingBook = appState.books.find(
      (book) => book.id === appState.editingBookId,
    );
    if (existingBook) {
      existingBook.update(bookData);
    }
  } else {
    const book = new Book(bookData);
    appState.books.push(book);
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
  console.log(appState.isSearchVisible);
  searchPanel.classList.toggle("hidden", !appState.isSearchVisible);
  toggleSearchBtn.textContent = appState.isSearchVisible
    ? "Hide Search"
    : "Search";
}

// Form Data
function getBookData() {
  const formData = new FormData(form);
  const bookData = Object.fromEntries(
    BOOK_FIELDS.map((field) => [field, formData.get(field) ?? ""]),
  );

  bookData.pages = Number(bookData.pages);
  bookData.progress = Number(bookData.progress);
  return bookData;
}

function validateBookData(bookData) {
  const errors = [];

  if (!bookData.title.trim()) {
    errors.push("Title is required.");
  }
  if (!bookData.author.trim()) {
    errors.push("Author is required.");
  }
  if (!bookData.pages || bookData.pages <= 0) {
    errors.push("Pages must be greater than zero.");
  }
  if (!bookData.status) {
    errors.push("Status is required.");
  }
  if (bookData.progress < 0) {
    errors.push("Progress cannot be negative.");
  }
  if (bookData.progress > bookData.pages) {
    errors.push("Progress cannot exceed total pages.");
  }
  return errors;
}

// Rendering
function renderBooks() {
  clearSelectedSpines();
  bookList.replaceChildren();

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

  renderBookshelfSelector();
  renderSearchSummary();
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
  const bookshelfKey = bookshelfName === "My Library" ? "" : bookshelfName;
  let shelfBooks = appState.books.filter(
    (book) =>
      book.status === status &&
      (book.bookshelf || "") === bookshelfKey &&
      bookMatchesSearch(book),
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
    option.value = bookshelf.name === "My Library" ? "" : bookshelf.name;
    option.textContent = bookshelf.name;

    bookshelfSelect.appendChild(option);
  });
}

//UI Factories
function createBookshelfCard(bookshelf) {
  const card = document.createElement("button");

  initializeBookshelfCard(card);

  card.appendChild(createBookshelfCardName(bookshelf));

  if (bookshelf.name !== "My Library") {
    card.appendChild(createDeleteBookshelfButton(bookshelf));
  }

  markActiveBookshelfCard(card, bookshelf);
  applyBookshelfAnimation(card, bookshelf);
  attachBookshelfCardEvents(card, bookshelf);

  return card;
}

function applyBookshelfAnimation(card, bookshelf) {
  if (bookshelf.id !== appState.lastAnimatedBookshelfId) return;

  switch (appState.lastBookshelfAnimation) {
    case "created":
      card.classList.add("bookshelf-created");
      break;

    case "deleted":
      break;

    default:
      break;
  }
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

    setBookshelfAnimation(bookshelf.id, "created");

    if (!bookshelf) return;

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
  applyBookAnimation(bookSpine, book);

  bookSpine.addEventListener("animationend", () => {
    if (book.id === appState.lastAnimatedBookId) {
      appState.lastAnimatedBookId = null;
      appState.lastBookAnimation = null;
    }
  });

  return bookSpine;
}

function applyBookAnimation(bookSpine, book) {
  if (book.id !== appState.lastAnimatedBookId) return;

  switch (appState.lastBookAnimation) {
    case "created":
      bookSpine.classList.add("book-created");
      break;
    case "moved":
      bookSpine.classList.add("book-moved");
      break;
    case "edited":
      break;
    case "deleted":
      break;
    default:
      break;
  }
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

  const bookshelfKey =
    activeBookshelf.name === "My Library" ? "" : activeBookshelf.name;

  return appState.books.filter(
    (book) =>
      (book.bookshelf || "") === bookshelfKey && bookMatchesSearch(book),
  );
}

function renderSearchSummary() {
  const query = appState.searchQuery.trim();

  if (!query) {
    searchSummary.textContent = "";
    return;
  }

  const count = getVisibleBooks().length;

  searchSummary.textContent =
    count === 0
      ? "No books matched your search."
      : `Showing ${count} matching book${count === 1 ? "" : "s"}.`;
}

function isSearchActive() {
  return appState.searchQuery.trim().length > 0;
}

function setBookAnimation(bookId, animation) {
  appState.lastAnimatedBookId = bookId;
  appState.lastBookAnimation = animation;
}

function setBookshelfAnimation(bookShelfId, animation) {
  appState.lastAnimatedBookshelfId = bookShelfId;
  appState.lastBookshelfAnimation = animation;
}

function animateBookshelfDelete(card, bookshelfId) {
  const bookshelf = appState.bookshelves.find(
    (bookshelf) => bookshelf.id === bookshelfId,
  );

  if (!bookshelf || bookshelf.name === "My Library") return;

  const shouldDelete = confirmDeleteBookshelf(bookshelf);

  if (!shouldDelete) return;

  if (!card) {
    deleteBookshelf(bookshelfId);
    return;
  }

  card.classList.add("bookshelf-deleted");

  card.addEventListener(
    "animationend",
    () => {
      deleteBookshelf(bookshelfId);
    },
    { once: true },
  );
}

function confirmDeleteBookshelf(bookshelf) {
  const booksOnShelf = appState.books.filter(
    (book) => book.bookshelf === bookshelf.name,
  ).length;

  return confirm(
    `Delete "${bookshelf.name}"?\n\n${booksOnShelf} book${booksOnShelf === 1 ? "" : "s"} will move back to My Library.`,
  );
}

function animateBookDelete(bookElement, bookId) {
  const shouldDelete = confirm("Delete this book?");

  if (!shouldDelete) returh;

  bookElement.classList.add("book-deleted");

  bookElement.addEventListener(
    "animationend",
    () => {
      deleteBook(bookId);
    },
    { once: true },
  );
}
// Book Actions
function deleteBook(bookId) {
  appState.books = appState.books.filter((book) => book.id !== bookId);
  saveBooks();
  renderBooks();
}

// Bookshelf Actions
function createBookshelf(name) {
  const trimmedName = name.trim();

  if (!trimmedName) return null;

  const alreadyExists = appState.bookshelves.some(
    (bookshelf) => bookshelf.name.toLowerCase() === trimmedName.toLowerCase(),
  );

  if (alreadyExists) {
    alert(`A bookshelf named "${trimmedName}" already exists.`);
    return null;
  }

  const bookshelf = new Bookshelf({
    name: trimmedName,
  });

  appState.bookshelves.push(bookshelf);
  appState.activeBookshelfId = bookshelf.id;

  return bookshelf;
}

function deleteBookshelf(bookshelfId) {
  const bookshelf = appState.bookshelves.find(
    (bookshelf) => bookshelf.id === bookshelfId,
  );

  if (!bookshelf || bookshelf.name === "My Library") return;

  appState.books.forEach((book) => {
    if (book.bookshelf === bookshelf.name) {
      book.bookshelf = "";
    }
  });

  appState.bookshelves = appState.bookshelves.filter(
    (bookshelf) => bookshelf.id !== bookshelfId,
  );

  const defaultBookshelf = getDefaultBookshelf();
  appState.activeBookshelfId = defaultBookshelf?.id ?? null;

  saveBooks();
  saveBookshelves();
  saveActiveBookshelf();
  renderBooks();
}

function ensureDefaultBookshelf() {
  if (appState.bookshelves.length > 0) return;

  const defaultBookshelf = new Bookshelf({
    name: "My Library",
  });

  appState.bookshelves.push(defaultBookshelf);
  appState.activeBookshelfId = defaultBookshelf.id;
}

function getDefaultBookshelf() {
  return appState.bookshelves.find(
    (bookshelf) => bookshelf.name === "My Library",
  );
}

function ensureActiveBookshelf() {
  const activeExists = appState.bookshelves.some(
    (bookshelf) => bookshelf.id === appState.activeBookshelfId,
  );

  if (activeExists) return;

  appState.activeBookshelfId = appState.bookshelves[0]?.id ?? null;
}

function syncBookshelvesFromBooks() {
  appState.books.forEach((book) => {
    const bookshelfName = book.bookshelf?.trim();

    if (!bookshelfName) return;

    const alreadyExists = appState.bookshelves.some(
      (bookshelf) =>
        bookshelf.name.toLowerCase() === bookshelfName.toLowerCase(),
    );

    if (!alreadyExists) {
      appState.bookshelves.push(
        new Bookshelf({
          name: bookshelfName,
        }),
      );
    }
  });
}

function renameBookshelf(bookshelfId) {
  const bookshelf = appState.bookshelves.find(
    (bookshelf) => bookshelf.id === bookshelfId,
  );

  if (!bookshelf || bookshelf.name === "My Library") return;

  const newName = prompt("New bookshelf name:", bookshelf.name);

  if (!newName) return;

  const trimmedName = newName.trim();

  if (!trimmedName || trimmedName === bookshelf.name) return;

  const alreadyExists = appState.bookshelves.some(
    (existingBookshelf) =>
      existingBookshelf.id !== bookshelfId &&
      existingBookshelf.name.toLowerCase() === trimmedName.toLowerCase(),
  );

  if (alreadyExists) {
    alert(`A bookshelf named "${trimmedName}" already exists.`);
    return;
  }

  const oldName = bookshelf.name;

  appState.books.forEach((book) => {
    if (book.bookshelf === oldName) {
      book.bookshelf = trimmedName;
    }
  });

  bookshelf.name = trimmedName;

  saveBooks();
  saveBookshelves();
  renderBooks();
}

function moveBookToBookshelf(bookId, bookshelf) {
  const book = appState.books.find((book) => book.id === bookId);

  if (!book) return;

  book.bookshelf = bookshelf.name === "My Library" ? "" : bookshelf.name;

  appState.activeBookshelfId = bookshelf.id;
  //appState.lastMovedBookId = book.id;
  setBookAnimation(book.id, "moved");

  saveActiveBookshelf();
  saveBooks();
  renderBooks();

  appState.lastMovedBookId = null;
}

function bookMatchesSearch(book) {
  const query = appState.searchQuery.trim().toLowerCase();

  if (!query) return true;

  const searchableFields = {
    title: book.title,
    author: book.author,
    category: book.category,
    notes: book.notes,
    isbn: book.isbn,
  };

  if (appState.searchField === "all") {
    return Object.values(searchableFields).some((value) =>
      value?.toLowerCase().includes(query),
    );
  }

  return searchableFields[appState.searchField]?.toLowerCase().includes(query);
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
}

//Utilities
function chunkBooks(books, chunkSize) {
  const chunks = [];

  for (let i = 0; i < books.length; i += chunkSize) {
    chunks.push(books.slice(i, i + chunkSize));
  }

  return chunks;
}

//Persistence
function saveBooks() {
  localStorage.setItem(BOOKS_STORAGE_KEY, JSON.stringify(appState.books));
}

function loadBooks() {
  const savedBooks = localStorage.getItem(BOOKS_STORAGE_KEY);

  if (!savedBooks) {
    appState.books = [];
    renderBooks();
    return;
  }

  try {
    const parsedBooks = JSON.parse(savedBooks);
    appState.books = Array.isArray(parsedBooks)
      ? parsedBooks.map((bookData) => new Book(bookData))
      : [];
  } catch {
    appState.books = [];
  }
}

function saveBookshelves() {
  localStorage.setItem(
    BOOKSHELVES_STORAGE_KEY,
    JSON.stringify(appState.bookshelves),
  );
}

function loadBookshelves() {
  const savedBookshelves = localStorage.getItem(BOOKSHELVES_STORAGE_KEY);

  if (!savedBookshelves) {
    ensureDefaultBookshelf();
    return;
  }

  try {
    const parsedBookshelves = JSON.parse(savedBookshelves);

    appState.bookshelves = Array.isArray(parsedBookshelves)
      ? parsedBookshelves.map((bookshelfData) => new Bookshelf(bookshelfData))
      : [];
  } catch {
    appState.bookshelves = [];
  }

  ensureDefaultBookshelf();

  if (!appState.activeBookshelfId && appState.bookshelves.length > 0) {
    appState.activeBookshelfId = appState.bookshelves[0].id;
  }
}

function saveActiveBookshelf() {
  localStorage.setItem(
    ACTIVE_BOOKSHELF_STORAGE_KEY,
    appState.activeBookshelfId,
  );
}

function loadActiveBookshelf() {
  appState.activeBookshelfId = localStorage.getItem(
    ACTIVE_BOOKSHELF_STORAGE_KEY,
  );
}

//Initialization
function initializeApp() {
  loadBooks();
  loadBookshelves();
  syncBookshelvesFromBooks();
  ensureDefaultBookshelf();
  loadActiveBookshelf();
  ensureActiveBookshelf();
  renderBooks();
}

initializeApp();
