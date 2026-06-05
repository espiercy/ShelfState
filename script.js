console.log("Welcome to ShelfState!");
const showFormBtn = document.querySelector("#show-form-btn");
const form = document.querySelector("#new-book-form");

const books = [];
const bookList = document.querySelector("#book-list");

let editingBookId = null;

class Book {
  constructor({
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
  }) {
    this.id = crypto.randomUUID();

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

    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  update = (bookData) => {
    this.title = bookData.title;
    this.author = bookData.author;
    this.pages = bookData.pages;
    this.progress = bookData.progress;
    this.startDate = bookData.startDate;
    this.endDate = bookData.endDate;
    this.isbn = bookData.isbn;
    this.notes = bookData.notes;
    this.classification = bookData.classification;
    this.category = bookData.category;
    this.status = bookData.status;
    this.updatedAt = new Date();
  };
}

showFormBtn.addEventListener("click", () => {
  form.classList.toggle("hidden");
  showFormBtn.classList.toggle("hidden");
});

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  console.log("Form Data:", Object.fromEntries(formData.entries()));

  const bookData = {
    title: formData.get("title"),
    author: formData.get("author"),
    pages: Number(formData.get("pages")),
    progress: Number(formData.get("progress")),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    isbn: formData.get("isbn"),
    notes: formData.get("notes"),
    classification: formData.get("classification"),
    category: formData.get("category"),
    status: formData.get("status"),
  };

  console.log("Book Data:", bookData);
  const errors = validateBookData(bookData);
  if (errors.length > 0) {
    alert(errors.join("\n"));
    return;
  }

  if (editingBookId) {
    const existingBook = books.find((book) => book.id === editingBookId);
    existingBook.update(bookData);
  } else {
    const book = new Book(bookData);
    books.push(book);
  }

  console.log(books);
  renderBooks();
  closeForm();
});

function renderBooks() {
  bookList.innerHTML = "";

  books.forEach((book) => {
    const bookCard = document.createElement("article");
    bookCard.classList.add("book-card", `book-status-${book.status}`);
    bookCard.dataset.bookId = book.id;
    bookCard.innerHTML = `
      <h2>${book.title}</h2>
      <p><strong>Author:</strong> ${book.author}</p>
      <p><strong>Status:</strong> ${book.status}</p>
      <p><strong>Progress:</strong> ${book.progress}/${book.pages} pages</p>
      <p><strong>Category:</strong> ${book.category}</p>
      `;

    bookList.appendChild(bookCard);
    bookCard.addEventListener("click", () => {
      openEditForm(book.id);
    });
  });
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
  const book = books.find((book) => book.id === bookId);
  if (!book) return;

  editingBookId = bookId;

  form.elements["title"].value = book.title;
  form.elements["author"].value = book.author;
  form.elements["pages"].value = book.pages;
  form.elements["progress"].value = book.progress;
  form.elements["startDate"].value = book.startDate;
  form.elements["endDate"].value = book.endDate;
  form.elements["isbn"].value = book.isbn;
  form.elements["notes"].value = book.notes;
  form.elements["classification"].value = book.classification;
  form.elements["category"].value = book.category;
  form.elements["status"].value = book.status;

  form.classList.remove("hidden");
  showFormBtn.classList.add("hidden");
}

function closeForm() {
  form.reset();
  form.classList.add("hidden");
  showFormBtn.classList.remove("hidden");
  editingBookId = null;
}
