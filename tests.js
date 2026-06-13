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

testValidateBookData();
