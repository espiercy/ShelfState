export function validateBookData(bookData) {
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
