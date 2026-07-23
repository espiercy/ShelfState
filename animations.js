const bookAnimationState = {
  bookId: null,
  animation: null,
};

const bookshelfAnimationState = {
  bookshelfId: null,
  animation: null,
};

export function setBookAnimation(bookId, animation) {
  bookAnimationState.bookId = bookId;
  bookAnimationState.animation = animation;
}

export function getBookAnimation(bookId) {
  if (bookAnimationState.bookId !== bookId) return null;

  return bookAnimationState.animation;
}

export function clearBookAnimation(bookId) {
  if (bookAnimationState.bookId !== bookId) return;

  bookAnimationState.bookId = null;
  bookAnimationState.animation = null;
}

export function setBookshelfAnimation(bookshelfId, animation) {
  bookshelfAnimationState.bookshelfId = bookshelfId;
  bookshelfAnimationState.animation = animation;
}

export function getBookshelfAnimation(bookshelfId) {
  if (bookshelfAnimationState.bookshelfId !== bookshelfId) {
    return null;
  }

  return bookshelfAnimationState.animation;
}

export function clearBookshelfAnimation(bookshelfId) {
  if (bookshelfAnimationState.bookshelfId !== bookshelfId) return;
  bookshelfAnimationState.bookshelfId = null;
  bookshelfAnimationState.animation = null;
}
