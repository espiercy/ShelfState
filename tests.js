// generated unit tests
function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ${message}`);
  } else {
    console.log(`✅ ${message}`);
  }
}

function testValidateBookData() {
  assert(
    validateBookData({
      title: "",
      author: "Author",
      pages: 100,
      progress: 10,
      status: "currently-reading",
    }).includes("Title is required."),
    "rejects missing title",
  );

  assert(
    validateBookData({
      title: "Book",
      author: "",
      pages: 100,
      progress: 10,
      status: "currently-reading",
    }).includes("Author is required."),
    "rejects missing author",
  );

  assert(
    validateBookData({
      title: "Book",
      author: "Author",
      pages: 0,
      progress: 10,
      status: "currently-reading",
    }).includes("Pages must be greater than zero."),
    "rejects zero pages",
  );

  assert(
    validateBookData({
      title: "Book",
      author: "Author",
      pages: 100,
      progress: 150,
      status: "currently-reading",
    }).includes("Progress cannot exceed total pages."),
    "rejects progress greater than pages",
  );
}

//more tests
function testChunkBooks() {
  const books = [1, 2, 3, 4, 5];

  const chunks = chunkBooks(books, 2);

  assert(chunks.length === 3, "splits books into correct number of chunks");
  assert(chunks[0].length === 2, "first chunk has max shelf size");
  assert(chunks[2].length === 1, "last chunk has remainder");
}

function testBookUpdate() {
  const book = new Book({
    title: "Old Title",
    author: "Old Author",
    pages: 100,
    progress: 10,
    status: "not-started",
  });

  book.update({
    title: "New Title",
    author: "New Author",
    pages: 200,
    progress: 50,
    status: "currently-reading",
  });

  assert(book.title === "New Title", "updates title");
  assert(book.author === "New Author", "updates author");
  assert(book.pages === 200, "updates pages");
  assert(book.status === "currently-reading", "updates status");
}

export function unitTests() {
  testValidateBookData();
  testChunkBooks();
  testBookUpdate();
}
