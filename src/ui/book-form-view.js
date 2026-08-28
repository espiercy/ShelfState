import { BOOK_FIELDS } from "../config.js";

export function openBookForm({
  form,
  showFormButton,
  libraryLayout,
  submitButton,
  mainElement,
  bookshelves,
  submitLabel = "Save Book",
}) {
  renderBookshelfOptions(form, bookshelves);

  form.classList.remove("hidden");
  showFormButton.classList.add("hidden");
  libraryLayout.classList.add("hidden");
  submitButton.textContent = submitLabel;
  mainElement.classList.add("form-mode");
}

export function closeBookForm({
  form,
  showFormButton,
  libraryLayout,
  submitButton,
  mainElement,
}) {
  form.reset();
  form.classList.add("hidden");
  showFormButton.classList.remove("hidden");
  libraryLayout.classList.remove("hidden");
  submitButton.textContent = "Save Book";
  mainElement.classList.remove("form-mode");
}

export function populateBookForm(form, book) {
  BOOK_FIELDS.forEach((field) => {
    form.elements[field].value = book[field] ?? "";
  });

  form.elements.bookshelf.value = book.bookshelfId ?? "";
}

function renderBookshelfOptions(form, bookshelves) {
  const bookshelfSelect = form.elements.bookshelf;

  bookshelfSelect.replaceChildren();

  bookshelves.forEach((bookshelf) => {
    const option = document.createElement("option");
    option.value = bookshelf.id;
    option.textContent = bookshelf.name;

    bookshelfSelect.appendChild(option);
  });
}
