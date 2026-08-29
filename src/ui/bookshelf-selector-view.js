import { applyBookshelfAnimation } from "./animations.js";

export function renderBookshelfSelector(
  bookshelfSelector,
  bookshelves,
  activeBookshelfId,
  actions,
) {
  bookshelfSelector.replaceChildren();

  bookshelves.forEach((bookshelf) => {
    bookshelfSelector.appendChild(
      createBookshelfCard(bookshelf, activeBookshelfId, actions),
    );
  });

  bookshelfSelector.appendChild(createNewBookshelfButton(actions.onCreate));
}

function createBookshelfCard(bookshelf, activeBookshelfId, actions) {
  const card = document.createElement("button");

  initializeBookshelfCard(card);

  card.appendChild(createBookshelfCardName(bookshelf));

  if (!bookshelf.isDefault) {
    card.appendChild(createDeleteBookshelfButton(bookshelf, actions.onDelete));
  }

  markActiveBookshelfCard(card, bookshelf, activeBookshelfId);
  applyBookshelfAnimation(card, bookshelf.id);
  attachBookshelfCardEvents(card, bookshelf, actions);

  return card;
}

function initializeBookshelfCard(card) {
  card.className = "bookshelf-card";
}

function attachBookshelfCardEvents(card, bookshelf, actions) {
  card.addEventListener("click", () => {
    actions.onSelect(bookshelf);
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

    actions.onDropBook(bookId, bookshelf);
  });

  card.addEventListener("dblclick", (event) => {
    event.stopPropagation();
    actions.onRename(bookshelf);
  });
}

function createBookshelfCardName(bookshelf) {
  const shelfName = document.createElement("span");
  shelfName.textContent = bookshelf.name;

  return shelfName;
}

function createDeleteBookshelfButton(bookshelf, onDelete) {
  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "delete-bookshelf-btn";
  deleteBtn.textContent = "×";

  deleteBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    onDelete(event.currentTarget.closest(".bookshelf-card"), bookshelf);
  });

  return deleteBtn;
}

function createNewBookshelfButton(onCreate) {
  const newBookshelfBtn = document.createElement("button");
  newBookshelfBtn.id = "new-bookshelf-btn";
  newBookshelfBtn.type = "button";
  newBookshelfBtn.className = "new-bookshelf-btn";
  newBookshelfBtn.textContent = "+ New Bookshelf";

  newBookshelfBtn.addEventListener("click", () => {
    const name = prompt("Bookshelf name: ");

    if (!name) return;

    onCreate(name);
  });

  return newBookshelfBtn;
}

function markActiveBookshelfCard(card, bookshelf, activeBookshelfId) {
  if (bookshelf.id === activeBookshelfId) {
    card.classList.add("bookshelf-card-active");
  }
}
