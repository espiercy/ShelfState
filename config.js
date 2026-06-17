export const STORAGE_KEY = "shelfStateBooks";
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
];

export const SHELF_STATUSES = [
  "currently-reading",
  "on-hold",
  "not-started",
  "completed",
];

export const STATUS_LABELS = {
  "currently-reading": "Currently Reading",
  "on-hold": "On Hold",
  "not-started": "Not Started",
  completed: "Completed",
};
