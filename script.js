console.log("Welcome to ShelfState!");
const showFormBtn = document.querySelector("#show-form-btn");
const form = document.querySelector("#new-book-form");

//not a fan of this many variables but it is what it is for now
const titleInput = document.querySelector("#title");
const authorInput = document.querySelector("#author");
const pagesInput = document.querySelector("#pages");
const progressInput = document.querySelector("#progress");
const startDateInput = document.querySelector("#startDate");
const endDateInput = document.querySelector("#endDate");
const isbnInput = document.querySelector("#isbn");
const notesInput = document.querySelector("#notes");
const typeInput = document.querySelector("#type");
const categoryInput = document.querySelector("#category");
const statusInput = document.querySelector("#status");

const books = [];

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
}

showFormBtn.addEventListener("click", () => {
  form.classList.toggle("hidden");
});

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  console.log("Form Data:", Object.fromEntries(formData.entries()));

  const book = new Book({
    title: formData.get("title"),
    author: formData.get("author"),
    pages: Number(formData.get("pages")),
    progress: Number(formData.get("progress")),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    isbn: formData.get("isbn"),
    notes: formData.get("notes"),
    classification: formData.get("type"),
    category: formData.get("category"),
    status: formData.get("status"),
  });

  console.log(book);
  books.push(book);
  console.log(books);

  form.reset();
  form.classList.add("hidden");
});
