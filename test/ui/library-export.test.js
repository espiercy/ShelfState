import test from "node:test";
import assert from "node:assert/strict";

import { downloadLibraryExport } from "../../src/ui/library-export.js";

test("downloads prepared library export data as dated JSON", async (context) => {
  const originalDocument = globalThis.document;
  const originalUrl = globalThis.URL;

  let createdTagName;
  let appendedLink;
  let downloadedBlob;
  let revokedUrl;

  const downloadLink = {
    href: "",
    download: "",
    clicked: false,
    removed: false,
    click() {
      this.clicked = true;
    },
    remove() {
      this.removed = true;
    },
  };

  context.after(() => {
    if (originalDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = originalDocument;
    }

    globalThis.URL = originalUrl;
  });

  globalThis.document = {
    createElement(tagName) {
      createdTagName = tagName;
      return downloadLink;
    },
    body: {
      append(link) {
        appendedLink = link;
      },
    },
  };

  globalThis.URL = {
    createObjectURL(blob) {
      downloadedBlob = blob;
      return "blob:shelfstate-export";
    },
    revokeObjectURL(url) {
      revokedUrl = url;
    },
  };

  const exportData = {
    schemaVersion: 2,
    exportedAt: "2026-08-27T12:00:00.000Z",
    books: [{ id: "book-1" }],
    bookshelves: [{ id: "shelf-1" }],
    activeBookshelfId: "shelf-1",
  };

  downloadLibraryExport(exportData);

  assert.equal(createdTagName, "a");
  assert.equal(appendedLink, downloadLink);
  assert.equal(downloadLink.href, "blob:shelfstate-export");
  assert.equal(downloadLink.download, "shelfstate-backup-2026-08-27.json");
  assert.equal(downloadLink.clicked, true);
  assert.equal(downloadLink.removed, true);
  assert.equal(revokedUrl, "blob:shelfstate-export");
  assert.equal(downloadedBlob.type, "application/json");
  assert.equal(
    await downloadedBlob.text(),
    JSON.stringify(exportData, null, 2),
  );
});
