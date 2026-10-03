# Design: Dossier Foundation

> **Status:** Draft — approved for implementation planning, decisions still open
> **Findings:** Elevates Dossier to a first-class entity (Path B)
> **Target:** Phase 5.8f/g (post-5.8d background tracking)
> **Prefix convention:** `/api/*` — matches existing surface. No API version bump in this phase.

---

## 1. Goals and Non-Goals

### Goals

- Elevate **Dossier** to a first-class entity, distinct from both Book and Chapter.
- Transition the Research tab from a flat list of ingested books into a **catalog of grouped source material**.
- Allow diverse, attachable sources (files, URLs, pasted text) to associate with a single overarching dossier context.
- Preserve the core invariant: **new material appends as new Omni Chapters, marked as an explicit addition.** Existing smart chapters are never retroactively edited.
- Compute the dossier's contents as a **derived manifest** — a live query over `chapters` and `smart_chapters` — rather than maintaining a static event log that requires continuous syncing.

### Non-Goals

- Full 1:N nested dossier hierarchy is **deferred**. The system retains a 1:1 dossier-to-book relationship for Build 1, with a nullable `parent_dossier_id` column reserved for future tree structures.
- Multi-user dossiers, shared dossiers, or permissioned dossiers are out of scope.
- Cloud sync of dossiers is out of scope.

---

## 2. Entity Model

### New: `dossiers`

| Column | Type | Notes |
|---|---|---|
| `id` | PK, UUID | |
| `title` | string | required |
| `parent_dossier_id` | FK → `dossiers.id`, nullable | reserved for future nesting; unused in Build 1 |
| `created_at` | timestamp | ISO 8601 UTC at repository boundary |
| `updated_at` | timestamp | ISO 8601 UTC at repository boundary |

### New: `sources`

A source is a *pointer* or *reference* to material attached to a dossier. It is not itself a book.

| Column | Type | Notes |
|---|---|---|
| `id` | PK, UUID | |
| `dossier_id` | FK → `dossiers.id`, required | |
| `type` | enum: `book` \| `url` \| `paste` | see §2.1 below |
| `book_id` | FK → `books.id`, nullable | set when `type = 'book'` |
| `url` | string, nullable | set when `type = 'url'` |
| `content_path` | string, nullable | set when `type = 'paste'`; path to on-disk content |
| `created_at` | timestamp | |

**Design note:** the original draft used a single `external_reference` string to hold either a URL or a large pasted body. That conflates two different shapes (a pointer vs. content). This version splits them into `url` and `content_path` — pasted content is stored on disk (matching the pattern already established by `storage/web/<book_id>/` from Phase 5.3), not in a database TEXT column.

### Modified: `books`

Add column:

| Column | Type | Notes |
|---|---|---|
| `dossier_id` | FK → `dossiers.id`, **required post-migration** | every book belongs to exactly one dossier |

**Invariant:** any code path that creates a book must also create (or attach to) a dossier. This is what makes `dossier_id` required rather than nullable.

### 2.1 Source Type Semantics

| `type` | Meaning | Produces a book? |
|---|---|---|
| `book` | A parsed artifact (PDF, EPUB, DOCX, RTF, imported web article) already present in the `books` table | Already exists |
| `url` | An attached reference link without full ingestion (e.g., "cited source," "further reading") | No — unless promoted via a future "ingest this source" action |
| `paste` | Raw text payload attached directly to the dossier | No — unless promoted to a book via a future action |

**Clarification:** attached `url` and `paste` sources do **not** automatically become books or produce Omni Chapters. They contribute to the dossier's *manifest* and can be referenced from provenance, but they only spawn a book (and thus chapters/smart_chapters) if the user explicitly promotes them. This is the conservative default and matches the "derivation never masquerades" law.

If a future phase wants attached sources to auto-ingest, that's an additive change — a `promoted_at` column or a new source type. Not in scope for Build 1.

---

## 3. API Surface

Prefix is `/api/*`, matching the existing surface (`/api/books`, `/api/smart-chapters`, `/api/chunks`).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/dossiers` | List all top-level dossiers with aggregate metadata for catalog display |
| `GET` | `/api/dossiers/:id` | Retrieve one dossier and its derived manifest (temporally ordered timeline of `chapters` + `smart_chapters` across all attached sources) |
| `POST` | `/api/dossiers/:id/sources` | Attach a new source (file, URL, or pasted text payload). Triggers a background job for subsequent analysis if applicable. |

Future (out of Build 1 scope):
- `PATCH /api/dossiers/:id` — rename
- `DELETE /api/dossiers/:id/sources/:source_id` — detach a source
- `GET /api/dossiers/:id/manifest` — dedicated manifest endpoint if the inline shape becomes too heavy

---

## 4. UI Surface Sketch

The Research tab transitions from a flat list of ingested books to a **catalog of dossiers**.

### Catalog View

- Dossier cards
- Aggregate metadata per card:
  - number of attached sources, broken down by type
  - total combined reading time (source words, Omni words)
  - date of last addition

### Detail View

- **Unified timeline** representing the derived manifest (chapters + smart_chapters ordered by creation)
- **Sidebar / secondary panel** listing all sources attached to the dossier
- Each manifest entry links back to its originating source, preserving provenance

### Route Transition

Current route: `/research/:bookId` (Phase 5.3).

New route: `/dossiers/:id`.

Because every existing book receives a backfilled dossier (see §5), the natural mapping is:
/research/:bookId → /dossiers/<backfilled_dossier_id_for_bookId>


**Recommendation:** keep `/research/:bookId` as a redirect/alias to the new dossier route for at least one release cycle, then retire. Avoids breaking bookmarks and the browser back/forward flow during the transition.

---

## 5. Migration Plan

1. **Schema version bump.** Introduce `dossiers` and `sources` tables. Add nullable `dossier_id` to `books`.
2. **Backfill script.** For each existing row in `books`:
   - Create a `dossiers` row (title = book title)
   - Insert a `sources` row (`type = 'book'`, `book_id` = the book)
   - Update the book to link its new `dossier_id`
3. **Enforce constraint.** After backfill completes, add the `NOT NULL` constraint on `books.dossier_id`.
4. **Rollback.** Drop `sources` and `dossiers` tables; drop `dossier_id` from `books`. Returns schema to Phase 5 state.

**Backfill strategy recommendation:** **strictly 1:1.** Every book gets its own dossier. Do not attempt to group books by title, author, or any existing metadata — grouping is a semantic decision the user should make explicitly, not a heuristic the migration guesses.

---

## 6. Open Decisions

Three decisions are carried from the original draft. Recommendations are provided, but these remain the user's call.

### D1 — Backfill strategy for existing books

**Recommendation:** strictly 1:1. Each book → one dossier. No heuristic grouping.

**Reasoning:** Grouping by title/author risks merging unrelated works with similar titles, and inferring semantic relationships from metadata is a guess. Users can merge dossiers manually later if desired (out of Build 1 scope). Conservative default.

### D2 — `sources` schema and `type` enum

**Recommendation:** as written in §2. Split `external_reference` into `url` + `content_path`. Keep the enum as `book | url | paste`. Attached `url` / `paste` sources do not auto-ingest.

**Reasoning:** Two-shape-in-one-column is a schema smell that will bite later. Attached sources that don't auto-ingest is the honest default — matches the "derivation never masquerades as source" law and prevents silent phantom content.

### D3 — `parent_dossier_id` API visibility

**Recommendation:** **strip it from API responses** in Build 1.

**Reasoning:** The column exists for future migration capability, not current product surface. Exposing it now would leak an implementation detail into the API contract, making it harder to change when 1:N actually lands. Keep it internal until the nesting feature exists.

---

## 7. Effort Estimate

Approximately **3–4 sessions:**

- 1 session: schema + migration + backfill script + rollback verification
- 1 session: API endpoints (`/api/dossiers`, `/api/dossiers/:id`, `/api/dossiers/:id/sources`)
- 1 session: UI catalog + detail view + route transition
- 1 session: buffer / polish / cross-tab verification

Depends on **5.8d** (background import tracking) being complete for the background-job piece of `POST /api/dossiers/:id/sources` to feel coherent.
