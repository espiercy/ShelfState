# ShelfState V3 Export Compatibility Matrix

**Status:** Approved V4 migration contract\
**Evidence reviewed:** repository Git history through frozen V3.9 (`v3.9.0`)
**Authority:** subordinate to [`V4_ARCHITECTURE.md`](V4_ARCHITECTURE.md) and [ADR-011](adr/ADR-011-import-export-migration.md)

## 1. Scope and evidence

This artifact specifies which V3 JSON exports the future V4 compatibility importer accepts. It does not change V3 and does not make V3 a synchronization peer.

The export function was introduced at commit `feb914d` with schema 1; schema 2 is evidenced at `bb47667`; schema 3 was introduced at `3e49019`; `e2fe9d3` removed the obsolete shelf `bookIds`; and frozen V3.9 is tagged `v3.9.0`. The controlling historical files are `config.js`, `models.js`, `storage.js`, and `migrations.js` for schemas 1/2 and their reorganized `src/...` equivalents for schema 3. Current behavior is additionally evidenced by `src/config.js`, `src/domain/models.js`, `src/domain/bookshelves.js`, `src/persistence/storage.js`, and `src/persistence/migrations.js`.

All three exporter versions use this exact top-level shape:

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-09-14T00:00:00.000Z",
  "books": [],
  "bookshelves": [],
  "activeBookshelfId": null
}
```

`schemaVersion` varies by version. `books` and `bookshelves` must be arrays. `exportedAt` is created with `new Date().toISOString()`. `activeBookshelfId` is a string or null representing V3 UI selection; V4 validates its type if present but does not migrate it into authoritative cloud library state.

## 2. Version matrix

| Property | Schema 1 (`feb914d`) | Schema 2 (`bb47667`) | Schema 3 (`3e49019` → frozen V3.9) |
|---|---|---|---|
| V4 support | **Supported, deterministic conversion** | **Supported, deterministic conversion** | **Mandatory supported format** |
| Book fields | `id`, `title`, `author`, `pages`, `progress`, `startDate`, `endDate`, `isbn`, `notes`, `classification`, `category`, `status`, legacy `bookshelf`, `bookshelfId`, `createdAt`, `updatedAt` | Same except legacy `bookshelf` removed | Same as schema 2 |
| Bookshelf fields | `id`, `name`, legacy `bookIds` | `id`, `name`, legacy `bookIds` | `id`, `name`, `isDefault`; early schema-3 exports may also contain legacy `bookIds`, frozen V3.9 does not |
| Authoritative relationship | Prefer valid `Book.bookshelfId`; legacy `Book.bookshelf` supplies deterministic migration when the ID is missing/stale | `Book.bookshelfId` only | `Book.bookshelfId` only |
| Default representation | No `isDefault`; exact historical name `My Library` identifies the legacy default | Same | Explicit boolean `Bookshelf.isDefault`; exactly one in a valid active library |
| `activeBookshelfId` | UI state only; not migrated | UI state only; not migrated | UI state only; not migrated |
| Identifier form | `crypto.randomUUID()` defaults for Book and Bookshelf | Same | Same |
| Timestamps | `exportedAt` ISO string; Book `createdAt`/`updatedAt` serialize as ISO strings after creation and remain accepted ISO strings after hydration | Same | Same |
| Date-only fields | `startDate` and `endDate` are form date strings (`YYYY-MM-DD`) or empty | Same | Same |
| Notable enum difference | Historical poetry classification value is `Poetry` | Canonicalized to `poetry` | `poetry` |

## 3. Common accepted-domain normalization

The importer distinguishes a legitimate historical value from a value merely invalid under newer V4 creation policy.

- Preserve a valid V3 Book ID and Bookshelf ID exactly. V3 exporter-era constructors generated UUIDs with `crypto.randomUUID()`; require valid UUID syntax and reject duplicates. Imported IDs never affect owner authorization.
- Preserve `title`, `author`, numeric `pages`, numeric `progress`, `isbn`, `notes`, `classification`, `category`, `status`, and canonical relationship after the version-specific steps below.
- Require nonblank title and author, positive finite pages, progress from zero through pages, and one of the five evidenced statuses: `currently-reading`, `not-started`, `on-hold`, `completed`, `dnf`.
- Accept classifications `fiction`, `non-fiction`, `poetry`, or an omitted/empty unclassified value. Normalize schema-1 `Poetry` to `poetry`; do not invent other enum aliases.
- Normalize legitimately optional omitted `isbn`, `notes`, `classification`, and `category` to empty strings. Normalize omitted, empty-string, or null `startDate`/`endDate` to null; otherwise require a real `YYYY-MM-DD` date. Preserve arbitrary category and plain-text values within V4 import bounds.
- Require `createdAt` and `updatedAt` to be valid ISO/RFC-3339 instant strings and normalize them to the server's canonical UTC ISO form. Require valid ISO `exportedAt`. Invalid or missing timestamps are structural diagnostics, not guessed from the client clock.
- Trim Bookshelf names and require nonempty case-insensitive uniqueness after trimming. A normalization collision is rejected rather than resolved by suffixing or record loss.
- Discard all legacy `Bookshelf.bookIds`. They are non-authoritative caches and are never used to infer, validate, or override membership.
- After conversion, require every Book to reference one imported shelf and require exactly one explicit default shelf.

New V4 field length/format rules may reject unsafe or out-of-bound content, but must not reject a valid frozen V3.9 library merely because a later online-creation convention is stricter. Any such compatibility exception must remain bounded and explicit in the future import schema.

## 4. Version-specific deterministic rules

### 4.1 Schema 1

1. Normalize and validate shelves and their IDs/names; ignore `bookIds`.
2. Derive the default from exactly one shelf whose trimmed name is exactly `My Library`. If none exists and no case-insensitive name collision would result, create one default shelf with a new server-generated ID. Multiple exact candidates or a differently-cased collision are rejected as ambiguous/corrupt.
3. For each Book, preserve `bookshelfId` if it references an imported shelf, even if legacy `bookshelf` disagrees; the ID was the migration-era canonical field.
4. If the ID is missing or stale, trim the legacy `bookshelf` value. Empty selects the derived default. A nonempty value must case-insensitively identify exactly one normalized shelf; if none exists, create exactly one non-default shelf with that supplied normalized name, matching the historical legacy-name discovery behavior. A collision or multiple candidates is rejected.
5. Remove legacy `Book.bookshelf` after canonical `bookshelfId` is established and normalize schema-1 `Poetry`.

This conversion is deterministic from repository history. It does not consult shelf `bookIds` or use fuzzy matching.

### 4.2 Schema 2

1. Normalize and validate shelves; ignore `bookIds`.
2. Derive/create the default using the same exact-name rule as schema 1.
3. Every Book must already have a valid `bookshelfId` referencing an imported shelf. Schema 2 has no legacy Book shelf name, and `bookIds` is non-authoritative, so a missing/stale reference is rejected rather than guessed.
4. Preserve all accepted Book values and IDs.

### 4.3 Schema 3

1. Preserve each explicit boolean `isDefault` and require exactly one `true` in a nonempty or empty logical library alike. A valid frozen V3.9 startup has already established this invariant.
2. Ignore a legacy `bookIds` field if present in an early schema-3 export; frozen V3.9 omits it.
3. Require every `Book.bookshelfId` to reference an imported shelf and preserve it.
4. Preserve all accepted Book values and IDs.

Zero or multiple explicit defaults, invalid references, or duplicate normalized shelf names are corrupt schema-3 data and are rejected; V4 does not silently choose a winner.

## 5. Rejection and diagnostic contract

Validation parses the complete bounded file and returns actionable, bounded issues with JSON paths where safe. At minimum the future importer distinguishes:

| Code | Meaning |
|---|---|
| `UNSUPPORTED_IMPORT_VERSION` | `schemaVersion` is not 1, 2, or 3 |
| `INVALID_IMPORT_SHAPE` | Missing/wrong top-level or entity structure/type |
| `INVALID_IDENTIFIER` / `DUPLICATE_IDENTIFIER` | Malformed or repeated historical ID |
| `INVALID_BOOK` / `INVALID_BOOKSHELF` | Required domain value is absent or invalid |
| `INVALID_TIMESTAMP` | Export or entity timestamp cannot be normalized |
| `DUPLICATE_BOOKSHELF_NAME` | Trimmed case-insensitive shelf names collide |
| `AMBIGUOUS_DEFAULT_SHELF` | Schema 1/2 default cannot be derived/created uniquely, or schema 3 has zero/multiple defaults |
| `AMBIGUOUS_BOOKSHELF_RELATION` | Schema-1 legacy name has multiple candidates |
| `MISSING_BOOKSHELF_RELATION` | Schema 2/3 Book lacks a valid canonical shelf reference |
| `IMPORT_LIMIT_EXCEEDED` | File/entity/text/issue bounds are exceeded |

Any rejection leaves the current V4 library unchanged. No relationship is inferred from `bookIds`, titles, author, ISBN, array position, timestamps, or `activeBookshelfId`.

## 6. Historical ambiguity result

No unresolved ambiguity remains for the supported subset. Schema 1 is accepted only where the ID-or-legacy-name rules select exactly one relationship; ambiguous cases reject. Schema 2 is accepted only with canonical valid Book references. Schema 3 is mandatory and preserves its explicit default. These narrower deterministic contracts may reject hand-edited/corrupt historical files while accepting exports produced by valid application state.
