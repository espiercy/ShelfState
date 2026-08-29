import { BOOK_FIELDS } from "../config.js";

//Classes
export class Book {
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
    bookshelfId = null,
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
    this.bookshelfId = bookshelfId;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  update(bookData) {
    BOOK_FIELDS.forEach((field) => {
      this[field] = bookData[field];
    });

    if (Object.hasOwn(bookData, "bookshelfId")) {
      this.bookshelfId = bookData.bookshelfId;
    }

    this.updatedAt = new Date();
  }
}

export class Bookshelf {
  constructor({
    id = crypto.randomUUID(),
    name,
    bookIds = [],
    isDefault = false,
  }) {
    this.id = id;
    this.name = name;
    this.bookIds = bookIds;
    this.isDefault = isDefault === true;
  }
}
