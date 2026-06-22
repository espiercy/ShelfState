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

//App State
const appState = {
  books: [],
  bookshelves: [],
  activeBookshelfId: null,
  editingBookId: null,
};

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
  }

  renderBooks();
  saveBooks();
  closeForm();
});

bookList.addEventListener("click", (event) => {
  const bookElement = event.target.closest(".book-spine");
  if (!bookElement) return;

  if (event.target.closest(".delete-book-btn")) {
    deleteBook(bookElement.dataset.bookId);
    return;
  }

  bookElement.classList.add("book-spine-selected");

  setTimeout(() => {
    openEditForm(bookElement.dataset.bookId);
    console.log("form opened");
  }, 150);
});

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
    const emptyState = document.createElement("p");
    emptyState.className = "empty-state";
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

  renderBookshelfSelector();
}

function renderBookshelf(bookshelf) {
  const bookshelfSection = document.createElement("section");
  bookshelfSection.className = "bookshelf";

  const heading = document.createElement("h2");
  heading.className = "bookshelf-title";
  heading.textContent = bookshelf.name;

  bookshelfSection.appendChild(heading);

  SHELF_STATUSES.forEach((status) => {
    renderShelf(status, bookshelf.name, bookshelfSection);
  });

  bookList.appendChild(bookshelfSection);
}

function renderShelf(status, bookshelfName, bookshelfElement) {
  const bookshelfKey = bookshelfName === "My Library" ? "" : bookshelfName;
  let shelfBooks = appState.books.filter(
    (book) => book.status === status && (book.bookshelf || "") === bookshelfKey,
  );

  if (status === "completed") {
    shelfBooks = shelfBooks.slice(0, MAX_BOOKS_PER_SHELF);
  }

  if (shelfBooks.length === 0) return;

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
}

function renderBookshelfSelector() {
  bookshelfSelector.replaceChildren();

  appState.bookshelves.forEach((bookshelf) => {
    const card = document.createElement("button");

    card.className = "bookshelf-card";
    card.textContent = bookshelf.name;

    if (bookshelf.id === appState.activeBookshelfId) {
      card.classList.add("bookshelf-card-active");
    }

    card.addEventListener("click", () => {
      appState.activeBookshelfId = bookshelf.id;
      saveActiveBookshelf();
      renderBooks();
    });

    bookshelfSelector.appendChild(card);
  });

  const newBookshelfBtn = document.createElement("button");
  newBookshelfBtn.id = "new-bookshelf-btn";
  newBookshelfBtn.type = "button";
  newBookshelfBtn.className = "new-bookshelf-btn";
  newBookshelfBtn.textContent = "+ New Bookshelf";

  newBookshelfBtn.addEventListener("click", () => {
    const name = prompt("Bookshelf name: ");

    if (!name) return;
    createBookshelf(name);
    saveBookshelves();
    saveActiveBookshelf();
    renderBooks();
  });

  bookshelfSelector.appendChild(newBookshelfBtn);
}

function createBookSpine(book) {
  const bookSpine = document.createElement("article");
  bookSpine.classList.add("book-spine", `book-status-${book.status}`);
  bookSpine.dataset.bookId = book.id;

  const title = document.createElement("span");
  title.className = "book-spine-title";
  title.textContent = book.title;

  bookSpine.appendChild(title);

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "delete-book-btn";
  deleteBtn.type = "button";
  deleteBtn.textContent = "x";
  bookSpine.appendChild(deleteBtn);

  const hoverDetails = document.createElement("div");
  hoverDetails.className = "book-hover-details";
  hoverDetails.innerHTML = `
      <strong>${book.title}</strong>
      <span>${book.author}</span>
      <span>${book.progress}/${book.pages} pages</span>
      <span>${STATUS_LABELS[book.status]}</span>
      `;

  bookSpine.appendChild(hoverDetails);

  return bookSpine;
}

function createBookDetail(label, value) {
  const detail = document.createElement("p");
  const labelElement = document.createElement("strong");
  labelElement.textContent = `${label}:`;
  detail.append(labelElement, ` ${value}`);
  return detail;
}

function clearSelectedSpines() {
  document
    .querySelectorAll(".book-spine-selected")
    .forEach((spine) => spine.classList.remove("book-spine-selected"));
}

// Book Actions
function deleteBook(bookId) {
  const shouldDelete = confirm("Delete this book?");
  if (!shouldDelete) return;
  appState.books = appState.books.filter((book) => book.id !== bookId);
  renderBooks();
  saveBooks();
}

// Bookshelf Actions
function createBookshelf(name) {
  const trimmedName = name.trim();

  if (!trimmedName) return null;

  const bookshelf = new Bookshelf({
    name: trimmedName,
  });

  appState.bookshelves.push(bookshelf);
  appState.activeBookshelfId = bookshelf.id;

  return bookshelf;
}

function ensureDefaultBookshelf() {
  if (appState.bookshelves.length > 0) return;

  const defaultBookshelf = new Bookshelf({
    name: "My Library",
  });

  appState.bookshelves.push(defaultBookshelf);
  appState.activeBookshelfId = defaultBookshelf.id;
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

// Form UI

function openForm(submitLabel = "Save Book") {
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

  appState.editingBookId = bookId;
  BOOK_FIELDS.forEach((field) => {
    form.elements[field].value = book[field] ?? "";
  });
  openForm("Update Book");
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
