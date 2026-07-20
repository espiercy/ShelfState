export const BOOKS_STORAGE_KEY = "shelfStateBooks";
export const BOOKSHELVES_STORAGE_KEY = "shelfStateBookshelves";
export const ACTIVE_BOOKSHELF_STORAGE_KEY = "shelfStateActiveBookshelfId";
export const BOOKS_MIGRATION_BACKUP_KEY =
  "shelfStateBooksBeforeBookshelfIdMigration";
export const BOOKS_ROLLING_BACKUP_KEY = "shelfStateBooksPrevious";
export const EXPORT_SCHEMA_VERSION = 1;
export const DEFAULT_BOOKSHELF_NAME = "My Library";
export const MAX_BOOKS_PER_SHELF = 6;
export const BOOK_FIELDS = [
  "title",
  "author",
  "pages",
  "progress",
  "startDate",
  "endDate",
  "isbn",
  "notes",
  "classification",
  "category",
  "status",
  "bookshelf",
];

export const BOOK_STATUS = {
  CURRENTLY_READING: "currently-reading",
  NOT_STARTED: "not-started",
  ON_HOLD: "on-hold",
  COMPLETED: "completed",
  DNF: "dnf",
};

export const BOOK_CLASSIFICATION = {
  FICTION: "fiction",
  NON_FICTION: "non-fiction",
  POETRY: "poetry",
};

export const CLASSIFICATION_LABELS = {
  [BOOK_CLASSIFICATION.FICTION]: "Fiction",
  [BOOK_CLASSIFICATION.NON_FICTION]: "Non-Fiction",
  [BOOK_CLASSIFICATION.POETRY]: "Poetry",
  unclassified: "Unclassified",
};

export const SHELF_STATUSES = [
  BOOK_STATUS.CURRENTLY_READING,
  BOOK_STATUS.NOT_STARTED,
  BOOK_STATUS.ON_HOLD,
  BOOK_STATUS.COMPLETED,
  BOOK_STATUS.DNF,
];

export const STATUS_LABELS = {
  [BOOK_STATUS.CURRENTLY_READING]: "Currently Reading",
  [BOOK_STATUS.NOT_STARTED]: "Not Started",
  [BOOK_STATUS.ON_HOLD]: "On Hold",
  [BOOK_STATUS.COMPLETED]: "Completed",
  [BOOK_STATUS.DNF]: "DNF",
};
