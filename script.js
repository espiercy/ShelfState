console.log("Welcome to ShelfState!");
const showFormBtn = document.querySelector("#show-form-btn");
const form = document.querySelector("#new-book-form");

const books = [];
const bookList = document.querySelector("#book-list");

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
  showFormBtn.classList.toggle("hidden");
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
    classification: formData.get("classification"),
    category: formData.get("category"),
    status: formData.get("status"),
  });

  console.log(book);
  books.push(book);
  console.log(books);
  renderBooks();
  form.reset();
  form.classList.add("hidden");
  showFormBtn.classList.remove("hidden");
});

function renderBooks() {
  bookList.innerHTML = "";

  books.forEach((book) => {
    const bookCard = document.createElement("article");
    bookCard.classList.add("book-card");
    bookCard.innerHTML = `
      <h2>${book.title}</h2>
      <p><strong>Author:</strong> ${book.author}</p>
      <p><strong>Status:</strong> ${book.status}</p>
      <p><strong>Progress:</strong> ${book.progress}/${book.pages} pages</p>
      <p><strong>Category:</strong> ${book.category}</p>
      `;

    bookList.appendChild(bookCard);
  });
}
