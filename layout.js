export function chunkBooks(books, chunkSize) {
  const chunks = [];

  for (let i = 0; i < books.length; i += chunkSize) {
    chunks.push(books.slice(i, i + chunkSize));
  }

  return chunks;
}
