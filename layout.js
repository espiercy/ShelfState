export function chunkBooks(books, chunkSize) {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new RangeError("Chunk size must be a positive integer.");
  }

  const chunks = [];

  for (let i = 0; i < books.length; i += chunkSize) {
    chunks.push(books.slice(i, i + chunkSize));
  }

  return chunks;
}
