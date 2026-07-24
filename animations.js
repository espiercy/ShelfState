const bookAnimationState = {
  bookId: null,
  animation: null,
};

const bookshelfAnimationState = {
  bookshelfId: null,
  animation: null,
};

const BOOK_ANIMATION_CLASSES = {
  created: "book-created",
  moved: "book-moved",
};

const BOOK_ANIMATION_END_CLASSES = {
  "book-slide-in-right": "book-created",
  "book-slide-in-left": "book-moved",
};

const BOOKSHELF_ANIMATION_CLASSES = {
  created: "bookshelf-created",
};

const BOOKSHELF_ANIMATION_END_NAMES = {
  created: "bookshelf-expand",
};

export function setBookAnimation(bookId, animation) {
  bookAnimationState.bookId = bookId;
  bookAnimationState.animation = animation;
}

export function setBookshelfAnimation(bookshelfId, animation) {
  bookshelfAnimationState.bookshelfId = bookshelfId;
  bookshelfAnimationState.animation = animation;
}

export function applyBookAnimation(bookElement, bookId) {
  const animation = getBookAnimation(bookId);
  const animationClass = BOOK_ANIMATION_CLASSES[animation];

  if (!animationClass) return;

  bookElement.classList.add(animationClass);
}

export function completeBookAnimation(bookElement, bookId, animationName) {
  const animationClass = BOOK_ANIMATION_END_CLASSES[animationName];

  if (!animationClass) return false;

  bookElement.classList.remove(animationClass);
  clearBookAnimation(bookId);

  return true;
}

export function applyBookshelfAnimation(bookshelfElement, bookshelfId) {
  const animation = getBookshelfAnimation(bookshelfId);
  const animationClass = BOOKSHELF_ANIMATION_CLASSES[animation];
  const animationName = BOOKSHELF_ANIMATION_END_NAMES[animation];

  if (!animationClass || !animationName) return false;

  bookshelfElement.classList.add(animationClass);

  function handleAnimationEnd(event) {
    if (
      event.target !== bookshelfElement ||
      event.animationName !== animationName
    ) {
      return;
    }

    bookshelfElement.classList.remove(animationClass);
    clearBookshelfAnimation(bookshelfId);

    bookshelfElement.removeEventListener("animationend", handleAnimationEnd);
  }

  bookshelfElement.addEventListener("animationend", handleAnimationEnd);

  return true;
}

function getBookAnimation(bookId) {
  if (bookAnimationState.bookId !== bookId) return null;

  return bookAnimationState.animation;
}

function getBookshelfAnimation(bookshelfId) {
  if (bookshelfAnimationState.bookshelfId !== bookshelfId) {
    return null;
  }

  return bookshelfAnimationState.animation;
}

function clearBookAnimation(bookId) {
  if (bookAnimationState.bookId !== bookId) return;

  bookAnimationState.bookId = null;
  bookAnimationState.animation = null;
}

function clearBookshelfAnimation(bookshelfId) {
  if (bookshelfAnimationState.bookshelfId !== bookshelfId) return;
  bookshelfAnimationState.bookshelfId = null;
  bookshelfAnimationState.animation = null;
}
