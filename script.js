import {
  STORAGE_KEY,
  MAX_BOOKS_PER_SHELF,
  BOOK_FIELDS,
  SHELF_STATUSES,
  STATUS_LABELS,
} from "./config.js";

const showFormBtn = document.querySelector("#show-form-btn");
const submitBookBtn = document.querySelector("#submit-book-btn");
const cancelFormBtn = document.querySelector("#cancel-form-btn");
const form = document.querySelector("#new-book-form");
const bookList = document.querySelector("#book-list");

const appState = {
  books: [],
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

function getBookData() {
  const formData = new FormData(form);
  const bookData = Object.fromEntries(
    BOOK_FIELDS.map((field) => [field, formData.get(field) ?? ""]),
  );

  bookData.pages = Number(bookData.pages);
  bookData.progress = Number(bookData.progress);
  return bookData;
}

function renderBooks() {
  bookList.replaceChildren();

  if (appState.books.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "empty-state";
    emptyState.textContent =
      "No books added yet. Click Add Book to start your shelf.";
    bookList.appendChild(emptyState);
    return;
  }

  SHELF_STATUSES.forEach((status) => {
    renderShelf(status);
  });
}

function renderShelf(status) {
  let shelfBooks = appState.books.filter((book) => book.status === status);

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

    bookList.appendChild(shelf);
  });
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

function createBookCard(book) {
  const bookCard = document.createElement("article");
  bookCard.classList.add("book-card", `book-status-${book.status}`);
  bookCard.dataset.bookId = book.id;

  const heading = document.createElement("h2");
  heading.textContent = book.title;
  bookCard.appendChild(heading);

  [
    ["Author", book.author],
    ["Status", book.status],
    ["Progress", `${book.progress}/${book.pages} pages`],
    ["Category", book.category],
    ["ISBN", book.isbn],
    ["Notes", book.notes],
  ].forEach(([label, value]) => {
    if (value === "" || value === null || value === undefined) return;
    bookCard.appendChild(createBookDetail(label, value));
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "delete-book-btn";
  deleteBtn.type = "button";
  deleteBtn.textContent = "Delete";
  bookCard.appendChild(deleteBtn);

  return bookCard;
}

function createBookDetail(label, value) {
  const detail = document.createElement("p");
  const labelElement = document.createElement("strong");
  labelElement.textContent = `${label}:`;
  detail.append(labelElement, ` ${value}`);
  return detail;
}

function deleteBook(bookId) {
  const shouldDelete = confirm("Delete this book?");
  if (!shouldDelete) return;
  appState.books = appState.books.filter((book) => book.id !== bookId);
  renderBooks();
  saveBooks();
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

function openEditForm(bookId) {
  const book = appState.books.find((book) => book.id === bookId);
  if (!book) return;

  appState.editingBookId = bookId;
  BOOK_FIELDS.forEach((field) => {
    form.elements[field].value = book[field] ?? "";
  });
  openForm("Update Book");
}

function openForm(submitLabel = "Save Book") {
  form.classList.remove("hidden");
  showFormBtn.classList.add("hidden");
  bookList.classList.add("hidden");
  submitBookBtn.textContent = submitLabel;
}

function closeForm() {
  form.reset();
  form.classList.add("hidden");
  showFormBtn.classList.remove("hidden");
  bookList.classList.remove("hidden");
  appState.editingBookId = null;
  submitBookBtn.textContent = "Save Book";
}
function chunkBooks(books, chunkSize) {
  const chunks = [];

  for (let i = 0; i < books.length; i += chunkSize) {
    chunks.push(books.slice(i, i + chunkSize));
  }

  return chunks;
}
function saveBooks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState.books));
}

function loadBooks() {
  const savedBooks = localStorage.getItem(STORAGE_KEY);

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
  renderBooks();
}

loadBooks();
