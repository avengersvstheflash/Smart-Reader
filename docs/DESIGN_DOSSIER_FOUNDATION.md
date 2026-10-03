# Design: Dossier Foundation

## Design Goals and Non-Goals

**Goals:**

* Elevate "Dossier" to a first-class entity (Path B from earlier planning phases).
* Transition the Research interface from a simple tabular view over individual books into a dedicated, rich catalog of grouped source material.
* Enable diverse, attachable sources (files, URLs, pasted text chunks) to associate securely with a single, overarching dossier context.
* Maintain the core architectural invariant: new material appends as new Omni Chapters and is marked as an explicit addition. The system will never retroactively edit existing smart chapters.
* Compute the dossier content as a derived manifest (querying `chapters` and `smart_chapters` dynamically) rather than maintaining a static, fragile event log that requires continuous manual syncing.

**Non-Goals:**

* Full 1:N nested dossier hierarchy is deferred. The system will retain a 1:1 dossier-to-book relationship for now, utilizing a nullable `parent_dossier_id` column to reserve foundational capability for future tree structures without bogging down the immediate Build 1 scope.

## Entity Model

To implement the Dossier as a first-class entity, the database schema requires the following strict modifications:

* **`dossiers` table (NEW):**
  * `id` (PK, UUID)
  * `title` (string, required)
  * `parent_dossier_id` (FK to dossiers.id, nullable, for future nesting)
  * `created_at`, `updated_at` (timestamps)
* **`sources` table (NEW):**
  * `id` (PK, UUID)
  * `dossier_id` (FK to dossiers.id, required)
  * `type` (enum: 'book', 'url', 'paste')
  * `external_reference` (string for storing raw URLs or large chunks of pasted source text)
  * `created_at` (timestamp)
* **`books` table (MODIFIED):**
  * Add `dossier_id` (FK to dossiers.id, required post-migration)

## API Surface

The frontend will require the following new REST endpoints to interact seamlessly with the new entity model:

* `GET /v1/dossiers` — Retrieve a list of all top-level dossiers, returning aggregate metadata suitable for catalog display.
* `GET /v1/dossiers/:id` — Retrieve a specific dossier and its derived manifest (a combined, temporally ordered timeline of `chapters` and `smart_chapters` across all attached sources).
* `POST /v1/dossiers/:id/sources` — Attach a new source (file, URL, or pasted text payload) to an existing dossier, triggering a background job for subsequent analysis.

## UI Surface Sketch

The primary UI paradigm shift occurs in the Research tab, which transitions entirely from a flat list of ingested books to a catalog of Dossiers.

* **Catalog View:** Displays dossier cards with aggregate metadata (e.g., number of diverse sources, total combined reading time, and date of last addition).
* **Detail View:** Displays a unified timeline representing the derived manifest. A sidebar or secondary panel lists all sources attached to the current dossier, allowing users to trace provenance back to individual documents, URLs, or pasted text blocks.

## Migration Plan

1. **Schema Version Bump:** Introduce the `dossiers` and `sources` tables, and add the nullable `dossier_id` column to `books`.
2. **Backfill Script:** Iterate over all existing rows in the `books` table. For each book, create a corresponding row in `dossiers`. Update the book row to link the new `dossier_id` and enforce the foreign key constraint. Insert a corresponding row into `sources` representing the original book artifact.
3. **Rollback Strategy:** Drop the `sources` and `dossiers` tables and drop the `dossier_id` column from `books`, returning the schema to the previous Phase 5 state.

## DECISIONS NEEDED FROM USER

1. Confirm the exact backfill strategy for existing books. Should they be grouped by any existing metadata, or kept strictly 1:1?
2. Approve the exact schema for the `sources` mapping table and the supported `type` enumerations.
3. Confirm if the `parent_dossier_id` should be visible in the API responses now, or stripped until the full 1:N hierarchy is fully implemented.
