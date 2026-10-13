# F52 — Library / Research State Coordination Architecture
## Comprehensive Design Specification: Option A (Coordination Layer)

> **Document Version:** 1.0.0  
> **Status:** PROPOSED (Awaiting User Review)  
> **Target Release:** Omnitome v0.7.0  
> **Author:** Antigravity / Core Architecture  
> **Scope:** Architectural Design Document (No Implementation Code, No Migration SQL, No Frontend Code)  
> **Prerequisites:** Ingestion Pipeline (F51 Series), Persistent Import Queue (F58), Corpus Release Gate (F42)  

---

## Table of Contents

1. [Executive Summary & Background](#executive-summary--background)
2. [Entity Model (`book_lifecycle`)](#1-entity-model)
   - 2.1 [The Core Lifecycle Entity](#11-the-core-lifecycle-entity)
   - 2.2 [Field Semantics, Types, and Nullability](#12-field-semantics-types-and-nullability)
   - 2.3 [Lifecycle State Machine](#13-lifecycle-state-machine)
3. [Additional Tables: Architectural Decision & Justification](#2-additional-tables)
   - 3.1 [Evaluation: Single Table with JSON vs. Normalized Family](#21-evaluation-single-table-with-json-vs-normalized-family)
   - 3.2 [Recommendation: The 4 Satellite History Entities](#22-recommendation-the-4-satellite-history-entities)
   - 3.3 [Detailed Specifications for Satellite Entities](#23-detailed-specifications-for-satellite-entities)
4. [Relationship to Existing Tables](#3-relationship-to-existing-tables)
   - 4.1 [Full System Entity-Relationship Diagram](#31-full-system-entity-relationship-diagram)
   - 4.2 [Comprehensive Table-by-Table Interaction Matrix](#32-comprehensive-table-by-table-interaction-matrix)
   - 4.3 [Foreign Key Directions and Non-Cascading Boundary](#33-foreign-key-directions-and-non-cascading-boundary)
5. [Delete Semantics: The Four Operations](#4-delete-semantics)
   - 5.1 [Operation A: Delete from Library Only (Source Preserved)](#41-operation-a-delete-from-library-only-source-preserved)
   - 5.2 [Operation B: Delete from Library + Delete Source](#42-operation-b-delete-from-library--delete-source)
   - 5.3 [Operation C: Delete from Research Only (Orphaned Reading)](#43-operation-c-delete-from-research-only-orphaned-reading)
   - 5.4 [Operation D: Full Purge (Terminal Erasure)](#44-operation-d-full-purge-terminal-erasure)
   - 5.5 [Edge Cases & Concurrent Mutation Guards](#45-edge-cases--concurrent-mutation-guards)
6. [Re-Synthesis Contract](#5-re-synthesis-contract)
   - 6.1 [User Stories and Entry Points (Phase 5.8f)](#51-user-stories-and-entry-points-phase-58f)
   - 6.2 [State Carryover vs. Fresh Generation Matrix](#52-state-carryover-vs-fresh-generation-matrix)
   - 6.3 [Content Hash Reuse (Zero-Compute Indexing)](#53-content-hash-reuse-zero-compute-indexing)
   - 6.4 [End-to-End Re-Synthesis Lifecycle Workflow](#54-end-to-end-re-synthesis-lifecycle-workflow)
7. [Reading Progress Recovery](#6-reading-progress-recovery)
   - 7.1 [Progress Metrics Definition](#71-progress-metrics-definition)
   - 7.2 [Durable Progress Storage Format](#72-durable-progress-storage-format)
   - 7.3 [Reconciliation Algorithm (Sequence and Title Alignment)](#73-reconciliation-algorithm-sequence-and-title-alignment)
   - 7.4 [Concrete Progress Recovery Scenarios](#74-concrete-progress-recovery-scenarios)
8. [Append Log & Dossier Provenance](#7-append-log--dossier-provenance)
   - 8.1 [Dossier Append Event Schema](#81-dossier-append-event-schema)
   - 8.2 [Ingestion Pipeline & Import Queue Integration (F58)](#82-ingestion-pipeline--import-queue-integration-f58)
   - 8.3 [UI Display Surface: Dossier Manifest & Timeline](#83-ui-display-surface-dossier-manifest--timeline)
9. [Token & Cost Tracking Ledger](#8-token--cost-tracking-ledger)
   - 9.1 [Per-Invocation Usage Schema (`llm_usage`)](#91-per-invocation-usage-schema-llm_usage)
   - 9.2 [Gateway Usage Capture & Provider Cost Calculations](#92-gateway-usage-capture--provider-cost-calculations)
   - 9.3 [Local LLM Zero-Dollar Accounting Policy](#93-local-llm-zero-dollar-accounting-policy)
   - 9.4 [Query Aggregations and UI Display Surfaces](#94-query-aggregations-and-ui-display-surfaces)
10. [Migration Strategy & Zero Data Loss Guarantee](#9-migration-strategy)
    - 10.1 [Automated Backfill Algorithm](#101-automated-backfill-algorithm)
    - 10.2 [Data Integrity & Zero-Loss Invariants](#102-data-integrity--zero-loss-invariants)
    - 10.3 [Rollback & Down-Migration Protocol](#103-rollback--down-migration-protocol)
11. [Phased Implementation Plan (4 Sessions)](#10-phased-implementation-plan)
    - 11.1 [Session 1: Architectural Design Specification (This Session)](#111-session-1-architectural-design-specification)
    - 11.2 [Session 2: Schema, Repositories, and Service Layer](#112-session-2-schema-repositories-and-service-layer)
    - 11.3 [Session 3: REST Endpoints, Pipeline Hooks, and Usage Ledger](#113-session-3-rest-endpoints-pipeline-hooks-and-usage-ledger)
    - 11.4 [Session 4: Delete Semantics, Re-synthesis (5.8f), and Recovery Tests](#114-session-4-delete-semantics-re-synthesis-58f-and-recovery-tests)
12. [Interactions with Existing Work & Subsumed Items](#11-interactions-with-existing-work)
13. [Open Questions for the User](#12-open-questions-for-the-user)

---

## Executive Summary & Background

### Context and Problem Statement
Omnitome's product identity rests upon a fundamental architectural separation:
- **Original Reading (Research):** The raw, immutable source material (PDF, EPUB, Web page, Markdown, or pasted document). Governed by Law 1: *"Source is paper"*.
- **Omni Reading (Library):** The loss-bounded, provenance-aware neural compression (~7:1 density). Governed by Law 2: *"The lens is tinted"* and Law 3: *"Derivation never masquerades as source"*.

In the legacy architecture prior to F52, this separation was superficial at the database layer. Both representations were bound directly to rows in the `books` table. When a user clicked "Delete Book", SQLite executed cascading foreign key deletions:
`books -> chapters -> smart_chapters -> chapter_representations -> semantic_chunks -> paragraph_attributions`.

This created four severe product vulnerabilities:
1. **Destructive Library Deletion:** If a user removed a book from their Library reading list, the raw source was deleted as well—or, if the source was kept, all reading progress, chapter title edits, and synopsis revisions were irrevocably obliterated.
2. **Stateless Re-Synthesis:** When generating an Omni reading from an existing Research dossier or re-synthesizing a previously deleted book, Omnitome had no historical memory of where the reader was. The newly generated book was always treated as brand new, unread, and reset to sequence 1.
3. **No Dossier Provenance Ledger:** For Multi-Source Research Dossiers (which aggregate multiple PDFs, articles, and pasted notes), the system lacked an immutable log recording which exact files, URLs, and text snippets were appended, when they were added, and which Library books derived from them.
4. **Compute Blindness:** The application had no durable ledger tracking token consumption, latency, or API expenses across chapter syntheses, book generations, or lifetime user reading.

### Design Decision: Option A (Coordination Layer)
During the architectural review (source: `chat_11.md`), the user formally locked the design decision:
**Option A — Introduce a dedicated coordination layer without restructuring existing tables.**

Instead of destabilizing the battle-tested ingestion and synthesis pipeline by rewriting existing table schemas, F52 introduces a persistent coordination entity (`book_lifecycle`) and an accompanying family of satellite history tables. This coordination layer **outlives both Library and Research entries**, ensuring user continuity, provenance, and accounting survive delete and re-synthesis cycles.

---

## 1. Entity Model

### 1.1 The Core Lifecycle Entity

The primary coordination record is `book_lifecycle`. A single lifecycle record acts as the durable anchor for an intellectual work across its entire history in Omnitome, independent of whether its derived chapters or raw files are currently resident in memory or disk.

```
+-----------------------------------------------------------------------------------+
|                                  book_lifecycle                                   |
+-----------------------------------------------------------------------------------+
| id                      : TEXT PRIMARY KEY (UUID / lc_prefix)                     |
| book_id                 : TEXT UNIQUE (Soft reference / 1:1 anchor to books.id)   |
| in_library              : BOOLEAN NOT NULL DEFAULT 1                              |
| in_research             : BOOLEAN NOT NULL DEFAULT 1                              |
| source_preserved        : BOOLEAN NOT NULL DEFAULT 1                              |
| lifecycle_state         : TEXT NOT NULL DEFAULT 'active'                          |
| deleted_at              : TEXT (ISO-8601, nullable)                               |
| deleted_reason          : TEXT (nullable: 'user_library_delete', etc.)            |
| deleted_from            : TEXT (nullable: 'library' | 'research' | 'both')        |
| last_read_chapter_id    : TEXT (nullable: transient ID of last active chapter)    |
| last_read_sequence      : INTEGER (nullable: sequence order 1..N)                 |
| last_read_title         : TEXT (nullable: chapter title at time of read)          |
| last_read_scroll_pct    : REAL (nullable: 0.0 to 1.0)                             |
| last_read_at            : TEXT (ISO-8601, nullable)                               |
| re_synthesis_source_id  : TEXT (nullable: dossier/source book ID)                |
| synthesis_count         : INTEGER NOT NULL DEFAULT 1                              |
| created_at              : TEXT NOT NULL (ISO-8601)                                |
| updated_at              : TEXT NOT NULL (ISO-8601)                                |
+-----------------------------------------------------------------------------------+
```

### 1.2 Field Semantics, Types, and Nullability

| Column Name | SQLite Data Type | Nullable | Constraints & Defaults | Technical Definition & Invariant |
|---|---|---|---|---|
| `id` | `TEXT` | NO | `PRIMARY KEY` | Unique lifecycle identifier (format: `lc_<timestamp>_<randomhex>`). Immutable. |
| `book_id` | `TEXT` | NO | `UNIQUE` | Soft reference to `books.id`. **Invariant:** Does NOT define an `ON DELETE CASCADE` constraint. Survives deletion of the `books` row. |
| `in_library` | `INTEGER` | NO | `DEFAULT 1` | Boolean flag (0 or 1). Governs visibility in Library views (`/`, `/books/:id`). `1` indicates active synthesized Omni reading exists. |
| `in_research` | `INTEGER` | NO | `DEFAULT 1` | Boolean flag (0 or 1). Governs visibility in Research views (`/research`, `/research/:id`). `1` indicates source chapters exist. |
| `source_preserved`| `INTEGER` | NO | `DEFAULT 1` | Boolean flag (0 or 1). User intent audit: indicates whether source text was intentionally preserved when Library entry was removed. |
| `lifecycle_state` | `TEXT` | NO | `DEFAULT 'active'`| State machine descriptor: `'active'`, `'library_only'`, `'research_only'`, or `'archived'`. |
| `deleted_at` | `TEXT` | YES | `DEFAULT NULL` | ISO-8601 timestamp of the most recent deletion event. |
| `deleted_reason` | `TEXT` | YES | `DEFAULT NULL` | Classification string: `'user_library_delete'`, `'user_research_delete'`, `'user_delete_all'`, `'resynthesis_cycle'`. |
| `deleted_from` | `TEXT` | YES | `DEFAULT NULL` | Origin of deletion: `'library'`, `'research'`, or `'both'`. |
| `last_read_chapter_id` | `TEXT` | YES | `DEFAULT NULL` | Transient ID of the last opened/read chapter (`smart_chapters.id`). Used for fast resume while chapters exist. |
| `last_read_sequence` | `INTEGER` | YES | `DEFAULT NULL` | 1-based sequence index (1..N) of the last read chapter. Durable across chapter ID regenerations. |
| `last_read_title` | `TEXT` | YES | `DEFAULT NULL` | Chapter title string at the time reading progress was captured. Used for fuzzy title matching during re-synthesis recovery. |
| `last_read_scroll_pct`| `REAL` | YES | `DEFAULT NULL` | Normalized vertical scroll position (0.000 to 1.000). Captures exact reader viewport position. |
| `last_read_at` | `TEXT` | YES | `DEFAULT NULL` | ISO-8601 timestamp when user last scrolled or opened the chapter. |
| `re_synthesis_source_id` | `TEXT` | YES | `DEFAULT NULL` | Reference to the origin dossier ID (`book-dossier-...`) or source book if synthesized from Research. |
| `synthesis_count` | `INTEGER` | NO | `DEFAULT 1` | Counter tracking total synthesis generations executed across this lifecycle. |
| `created_at` | `TEXT` | NO | ISO-8601 | Timestamp of initial ingestion or lifecycle registration. |
| `updated_at` | `TEXT` | NO | ISO-8601 | Timestamp of latest state mutation. |

### 1.3 Lifecycle State Machine

The operational status of any item in Omnitome is governed by a formal finite-state machine (FSM). Note that `'purged'` is not a state in the machine because Operation D deletes the lifecycle row itself; the valid states are `active`, `library_only`, `research_only`, and `archived`:

```
                     +-----------------------------------+
                     |              START                |
                     |      (Ingest or Import)           |
                     +-----------------------------------+
                                       |
                                       v
                     +-----------------------------------+
                     |              ACTIVE               |
                     | in_library = 1, in_research = 1   |
                     | (Full Omni Reading + Full Source) |
                     +-----------------------------------+
                         /                           \
       Operation A      /                             \   Operation C
   (Delete Library)    /                               \  (Delete Research)
                      v                                 v
+-------------------------------+             +-------------------------------+
|         RESEARCH_ONLY         |             |         LIBRARY_ONLY          |
| in_library = 0, in_research=1 |             | in_library = 1, in_research=0 |
| (Source kept; Omni purged)    |             | (Orphaned Reading; No Source) |
+-------------------------------+             +-------------------------------+
         |             \                                      |
         |              \ Re-synthesis (5.8f)                 |
         |               +------------+                       |
         |                            |                       |
         | Operation B                v                       | Operation B
         | (Delete Source)   +-----------------+              | (Delete Reading)
         v                   |     ACTIVE      |              v
+--------------------------> | (Re-synthesized)| <------------+
|                            +-----------------+
v
+-----------------------------------+
|             ARCHIVED              |
| in_library = 0, in_research = 0   |
| (Both representations deleted;    |
| history & token ledger retained)  |
+-----------------------------------+
                 |
                 | Operation D (User-Confirmed Purge)
                 v
   [ book_lifecycle ROW DELETED ]
 (llm_usage.lifecycle_id set NULL)
```

---

## 2. Additional Tables: Architectural Decision & Justification

### 2.1 Evaluation: Single Table with JSON vs. Normalized Family

The F52 specification requires persisting four continuous history streams:
1. **Chapter name history per book:** Tracking how chapter titles evolve from raw headings to AI-synthesized titles to user manual overrides.
2. **Synopsis version history per book:** Preserving prior draft summaries when synopses are re-synthesized or refreshed.
3. **Dossier append log:** Recording every file, pasted text, and URL attached to a multi-source research dossier.
4. **Token and cost tracking:** Measuring prompt tokens, completion tokens, dollar estimates, and latency per chapter, per book, and cumulative lifetime user.

We evaluated two architectural patterns for persisting this data:

#### Pattern 1: Single Table with Polymorphic JSON Columns
In this model, `book_lifecycle` would include four JSON text columns:
`chapter_history_json`, `synopsis_history_json`, `append_log_json`, and `llm_usage_json`.

- *Perceived Advantages:* Only one new table added to SQLite; zero foreign key management.
- *Fatal Flaws:*
  - **Terrible Aggregation Performance:** Calculating lifetime user spending or model distribution requires loading every book lifecycle row into Node memory, parsing multi-megabyte JSON arrays in JavaScript, and looping synchronously. In SQLite WAL mode, relational indexes execute these queries in under 0.2ms.
  - **Severe Concurrency Write Contention:** Omnitome uses parallel chapter synthesis (`F68 / F70`). If 3 workers complete chapters simultaneously, all three attempt to append to `llm_usage_json` at the same time. This triggers read-modify-write race conditions where token metrics are lost or clobbered.
  - **Write Amplification:** Appending a 100-byte token record for Chapter 10 forces the engine to rewrite the entire JSON array containing records for Chapters 1 through 9.

#### Pattern 2: Normalized Table Family (Recommended)
In this model, `book_lifecycle` is supported by four specialized, relational satellite tables:
- `chapter_name_history`
- `synopsis_history`
- `dossier_append_log`
- `llm_usage`

### 2.2 Recommendation: The 4 Satellite History Entities

**Architectural Recommendation: Adopt Pattern 2 (The Normalized Table Family).**

#### Trade-Off Comparison Matrix:

| Evaluation Dimension | Pattern 1: Single Table + JSON | Pattern 2: Normalized Table Family | Technical Verdict |
|---|---|---|---|
| **Cost Aggregation Speed** | Slow (`O(N)` JSON parsing in JS) | Blazing (`O(log N)` B-tree SQL sum) | **Pattern 2 Wins** (Instant `/settings` load) |
| **Parallel Synthesis Safety** | High risk of JSON clobbering | Completely safe (atomic row inserts) | **Pattern 2 Wins** (Thread-safe synthesis) |
| **Dossier Auditability** | Opaque array inside row | Queryable by hash, date, or filename | **Pattern 2 Wins** (Rapid hash deduplication) |
| **Storage Overhead** | Repeated key strings in JSON text | Compact typed SQLite columns | **Pattern 2 Wins** (~40% smaller footprint) |
| **Schema Migration** | Unstructured JSON drift | Strongly typed schema with indexes | **Pattern 2 Wins** (Strict data integrity) |
| **Purge Simplicity** | Delete 1 row | Cascade delete 4 related tables | *Pattern 1 slightly simpler, but negligible* |

### 2.3 Detailed Specifications for Satellite Entities

#### 2.3.1 Entity: `chapter_name_history`
Captures every title transition for a chapter sequence across synthesis generations and manual user edits.

```
+-----------------------------------------------------------------------------------+
|                               chapter_name_history                                |
+-----------------------------------------------------------------------------------+
| id               : TEXT PRIMARY KEY (cnh_...)                                     |
| lifecycle_id     : TEXT NOT NULL (FK to book_lifecycle.id ON DELETE CASCADE)      |
| book_id          : TEXT NOT NULL                                                  |
| chapter_sequence : INTEGER NOT NULL (1..N sequence position)                      |
| old_title        : TEXT (nullable: null on initial naming)                        |
| new_title        : TEXT NOT NULL                                                  |
| rename_source    : TEXT NOT NULL ('ai_synthesis' | 'user_manual' | 'resynthesis') |
| synthesis_cycle  : INTEGER NOT NULL DEFAULT 1                                     |
| created_at       : TEXT NOT NULL (ISO-8601)                                       |
+-----------------------------------------------------------------------------------+
```
*Index Strategy:*
- `CREATE INDEX idx_cnh_lifecycle_seq ON chapter_name_history(lifecycle_id, chapter_sequence);`
- `CREATE INDEX idx_cnh_book ON chapter_name_history(book_id);`

#### 2.3.2 Entity: `synopsis_history`
Maintains an immutable archive of all generated and edited book synopses.

```
+-----------------------------------------------------------------------------------+
|                                 synopsis_history                                  |
+-----------------------------------------------------------------------------------+
| id             : TEXT PRIMARY KEY (syn_...)                                       |
| lifecycle_id   : TEXT NOT NULL (FK to book_lifecycle.id ON DELETE CASCADE)        |
| book_id        : TEXT NOT NULL                                                    |
| version        : INTEGER NOT NULL (Monotonically increasing 1, 2, 3...)           |
| synopsis_text  : TEXT NOT NULL                                                    |
| generator_type : TEXT NOT NULL ('ai_initial' | 'ai_refresh' | 'user_edit')        |
| model_used     : TEXT (e.g., 'deepseek/deepseek-v4-flash', nullable)              |
| word_count     : INTEGER NOT NULL DEFAULT 0                                       |
| created_at     : TEXT NOT NULL (ISO-8601)                                         |
|                : CONSTRAINT uq_syn_version UNIQUE (lifecycle_id, version)         |
+-----------------------------------------------------------------------------------+
```
*Index Strategy & Constraints:*
- `UNIQUE (lifecycle_id, version)`: Prevents duplicate versions from concurrent/racy fire-and-forget synopsis refreshes (F49c).
- `CREATE INDEX idx_synopsis_hist_lifecycle ON synopsis_history(lifecycle_id, version);`
- `CREATE INDEX idx_synopsis_hist_book ON synopsis_history(book_id);`

#### 2.3.3 Entity: `dossier_append_log`
Provides an immutable ledger of every acquisition appended to a research dossier.

```
+-----------------------------------------------------------------------------------+
|                                dossier_append_log                                 |
+-----------------------------------------------------------------------------------+
| id            : TEXT PRIMARY KEY (app_...)                                        |
| dossier_id    : TEXT NOT NULL (Anchor to books.id of dossier)                     |
| book_id       : TEXT (Nullable: ID of derived Library book, if synthesized)       |
| source_id     : TEXT NOT NULL (ID of chapter, import_queue task, or material)     |
| source_type   : TEXT NOT NULL ('file' | 'web' | 'paste')                          |
| file_name     : TEXT (Original file name or document heading)                     |
| file_hash     : TEXT (SHA-256 hex digest for content-addressable deduplication)  |
| file_size     : INTEGER (Byte count on disk, nullable)                            |
| source_url    : TEXT (Canonical URL for web articles, nullable)                   |
| char_count    : INTEGER DEFAULT 0                                                 |
| word_count    : INTEGER DEFAULT 0                                                 |
| appended_at   : TEXT NOT NULL (ISO-8601)                                          |
| metadata_json : TEXT DEFAULT '{}'                                                 |
|               : CONSTRAINT uq_dossier_hash UNIQUE (dossier_id, file_hash)         |
+-----------------------------------------------------------------------------------+
```
*Index Strategy & Constraints:*
- `UNIQUE (dossier_id, file_hash)`: Prevents duplicate append-log entries from concurrent imports of the identical file/payload. Enables F58.1 replacement with ID/hash-based deduplication.
- `CREATE INDEX idx_append_log_dossier ON dossier_append_log(dossier_id);`
- `CREATE INDEX idx_append_log_hash ON dossier_append_log(file_hash);`
- `CREATE INDEX idx_append_log_book ON dossier_append_log(book_id);`

#### 2.3.4 Entity: `llm_usage`
Tracks hardware compute, API costs, token counts, and latency for every individual model request.

```
+-----------------------------------------------------------------------------------+
|                                     llm_usage                                     |
+-----------------------------------------------------------------------------------+
| id                : TEXT PRIMARY KEY (use_...)                                    |
| lifecycle_id      : TEXT (FK to book_lifecycle.id ON DELETE SET NULL, nullable)   |
| book_id           : TEXT NOT NULL                                                 |
| chapter_id        : TEXT (Nullable: null for book-level synopsis/outline calls)   |
| stage             : TEXT NOT NULL ('classify'|'outline'|'synopsis'|'synthesis'...)  |
| provider          : TEXT NOT NULL ('openrouter' | 'ollama' | 'lmstudio')          |
| model             : TEXT NOT NULL (Model identifier string)                       |
| prompt_tokens     : INTEGER NOT NULL DEFAULT 0                                    |
| completion_tokens : INTEGER NOT NULL DEFAULT 0                                    |
| total_tokens      : INTEGER NOT NULL DEFAULT 0                                    |
| cost_estimate_usd : REAL NOT NULL DEFAULT 0.0 (Calculated USD or 0.0 for local)   |
| latency_ms        : INTEGER NOT NULL DEFAULT 0                                    |
| finish_reason     : TEXT (e.g., 'stop', 'length', 'timeout')                       |
| created_at        : TEXT NOT NULL (ISO-8601)                                      |
+-----------------------------------------------------------------------------------+
```
*Foreign Key Invariant:*
- `FOREIGN KEY (lifecycle_id) REFERENCES book_lifecycle(id) ON DELETE SET NULL`: In Option 2B (accountant model), Operation D removes the lifecycle row but preserves token and expense records with `lifecycle_id = NULL` so lifetime user billing metrics remain historically accurate to real-world expenses.

*Index Strategy:*
- `CREATE INDEX idx_llm_usage_book ON llm_usage(book_id);`
- `CREATE INDEX idx_llm_usage_chapter ON llm_usage(chapter_id);`
- `CREATE INDEX idx_llm_usage_lifecycle ON llm_usage(lifecycle_id);`
- `CREATE INDEX idx_llm_usage_stage ON llm_usage(stage);`
- `CREATE INDEX idx_llm_usage_created ON llm_usage(created_at);`

---

## 3. Relationship to Existing Tables

### 3.1 Full System Entity-Relationship Diagram

```
                              +--------------------+
                              |    import_queue    |
                              +--------------------+
                                        | (creates / appends)
                                        v
+-----------------------+     +--------------------+
|  dossier_append_log   |<--->|       books        |
+-----------------------+     +--------------------+
                                    |        |
         +--------------------------+        +--------------------------+
         | (1:N source)                                                 | (1:N derived)
         v                                                              v
+--------------------+                                        +--------------------+
|      chapters      |                                        |   smart_chapters   |
+--------------------+                                        +--------------------+
         |                                                              |
         | (1:N)                                                        | (1:N)
         v                                                              v
+--------------------+     +--------------------+             +--------------------+
|  semantic_chunks   |<--->| paragraph_attr     |<------------|  chapter_rep (v2)  |
+--------------------+     +--------------------+             +--------------------+
         ^
         |
         | (coordinated by durable anchor)
+----------------------------------------------------------------------------------+
|                            COORDINATION LAYER (F52)                              |
|                                                                                  |
|  +--------------------+    +--------------------+    +------------------------+  |
|  |   book_lifecycle   |--->| chapter_name_hist  |    |    synopsis_history    |  |
|  +--------------------+    +--------------------+    +------------------------+  |
|            |                                                                     |
|            +---------------------------------------->+------------------------+  |
|                                                      |       llm_usage        |  |
|                                                      +------------------------+  |
+----------------------------------------------------------------------------------+
```

### 3.2 Comprehensive Table-by-Table Interaction Matrix

| Table Name | Role in Architecture | What Stays on Existing Table | What Moves or Mirrors to F52 | Cascade Behavior |
|---|---|---|---|---|
| `books` | Core catalog entry | `title`, `author`, `description`, `cover_path`, `content_type`, pipeline timestamps (`import_started_at`, `synthesis_completed_at`, etc.). | `in_library` and `in_research` govern visibility in `getAll()` vs `getAllSources()`. | Deleting `books` does **NOT** delete `book_lifecycle`. |
| `chapters` | Immutable source chapters ("paper") | Full canonical content, headings, structural roles (`prologue`, `chapter`, `epilogue`), word counts. | None. Retained completely when `source_preserved = 1`. | `ON DELETE CASCADE` from `books`. |
| `smart_chapters`| Derived Omni chapters ("tinted lens") | Active synthesis prose, sequence, synthesis type, planned section IDs. | Reading progress (`opened_at`, `read_at`, scroll) mirrors up to `book_lifecycle` snapshot. | `ON DELETE CASCADE` from `books`. |
| `chapter_representations` | Multi-representation store | Legacy summaries, representation JSON, editorial outline markers. | Obsolete representation types are pruned; active representations stay. | `ON DELETE CASCADE` from `chapters` or `smart_chapters`. |
| `semantic_chunks` | BGE-M3 embedded vector store | 1024-dim embedding JSON, text chunks, content hashes. | Chunks remain attached to `book_id`. Content hashes are reused during re-synthesis. | `ON DELETE CASCADE` from `books`. |
| `paragraph_attributions` | Claim-to-source provenance | Sentence-level weights, chunk links, reranker scores, grounded flags. | Provenance paths point from `smart_chapters` to `semantic_chunks`. | `ON DELETE CASCADE` from `smart_chapters`. |
| `import_queue` (F58) | Persistent FIFO staging worker | Queue state, staging paths, task progress, error strings. | Completed tasks write an immutable event record into `dossier_append_log`. | Independent table. No cascading links. |
| `processing_jobs` | In-flight async job tracker | Job status, progress integers, start/complete times. | None. Used strictly for real-time polling during active pipeline runs. | Independent table. |
| `editorial_outlines`| Outline synthesis blueprints | Chapter targets, planned topics, multi-source collections. | Outline structures are read by `editorialService` during re-synthesis. | Independent table. |

> [!IMPORTANT]
> **Authoritative Route Filtering Note:**  
> F52's `in_library` and `in_research` flags become **AUTHORITATIVE** for route filtering across the entire backend and frontend.  
> `books.content_type` remains strictly ingestion metadata (recording what the source format/genre was: novel, textbook, research, etc.), NOT lifecycle state. Routes currently querying `books.content_type = 'research'` or checking whether `smart_chapters` exist will migrate to reading the authoritative lifecycle flags (`book_lifecycle.in_library` and `book_lifecycle.in_research`).

### 3.3 Foreign Key Directions and Non-Cascading Boundary

Prior to F52, the database lacked a boundary between transient artifacts and permanent user history. F52 establishes this architectural boundary:

```
[ books ]  <==== (Soft Reference book_id) ====  [ book_lifecycle ]
    |                                                   |
    +-- (CASCADE) --> [ chapters ]                      +-- (CASCADE) -----> [ chapter_name_history ]
    +-- (CASCADE) --> [ smart_chapters ]                +-- (CASCADE) -----> [ synopsis_history ]
    +-- (CASCADE) --> [ semantic_chunks ]               +-- (SET NULL) ----> [ llm_usage ]
```

1. **The Non-Cascading Boundary:**  
   `book_lifecycle.book_id` holds a logical anchor to `books.id`, but SQLite does **not** attach an `ON DELETE CASCADE` rule to this relationship. If a book row is removed or marked deleted, the lifecycle row and all associated history rows remain intact.
2. **The Satellite Cascade Boundary:**  
   Satellite tables `chapter_name_history` and `synopsis_history` define `FOREIGN KEY (lifecycle_id) REFERENCES book_lifecycle(id) ON DELETE CASCADE`. If a lifecycle row is purged in Operation D, title and synopsis histories are deleted.  
   Crucially, `llm_usage` defines `FOREIGN KEY (lifecycle_id) REFERENCES book_lifecycle(id) ON DELETE SET NULL`. When a lifecycle row is purged, the usage records have `lifecycle_id` set to `NULL` but remain preserved, keeping lifetime compute accounting accurate.

---

## 4. Delete Semantics: The Four Operations

Prior to F52, deleting an item was binary and catastrophic. F52 formalizes **four distinct deletion operations**, allowing users to manage their Library and Research spaces independently while protecting historical data.

```
+---------------------------------------------------------------------------------------------------+
|                                  THE FOUR DELETE OPERATIONS                                       |
+--------------------+---------------------+----------------------+---------------------------------+
| Operation          | Library State       | Research State       | Coordination Row (`lifecycle`)  |
+--------------------+---------------------+----------------------+---------------------------------+
| (A) Library Only   | in_library = 0      | in_research = 1      | Stays active                    |
|                    | Derived data purged | Source preserved     | source_preserved = 1            |
+--------------------+---------------------+----------------------+---------------------------------+
| (B) Library + Src  | in_library = 0      | in_research = 0      | Stays archived                  |
|                    | Derived data purged | Source data purged   | source_preserved = 0            |
+--------------------+---------------------+----------------------+---------------------------------+
| (C) Research Only  | in_library = 1      | in_research = 0      | Stays (Orphaned Reading)        |
|                    | Derived data stays  | Source data purged   | source_preserved = 0            |
+--------------------+---------------------+----------------------+---------------------------------+
| (D) Full Purge     | in_library = 0      | in_research = 0      | Row Deleted                     |
|                    | Already purged      | Already purged       | History tables purged           |
+--------------------+---------------------+----------------------+---------------------------------+
```

### 4.1 Operation A: Delete from Library Only (Source Preserved)

- **User Story:** *"I've finished reading this book or want to clear my library shelf, but I want to keep the original PDF in Research so I can reference the raw text or re-synthesize it in the future."*
- **Preconditions:** `in_library == 1` and `in_research == 1`.
- **Detailed Transaction Sequence:**
  1. Open SQLite transaction (`db.transaction`).
  2. Snapshot active reading progress from `smart_chapters`: query the latest read/opened chapter, write `last_read_sequence`, `last_read_title`, `last_read_scroll_pct`, and `last_read_at` to `book_lifecycle`.
  3. Snapshot current synopsis text from `books.description` to `synopsis_history`.
  4. Snapshot current chapter titles from `smart_chapters` to `chapter_name_history`.
  5. Delete derived entities:
     - `DELETE FROM paragraph_attributions WHERE smart_chapter_id IN (SELECT id FROM smart_chapters WHERE book_id = ?)`
     - `DELETE FROM smart_chapters WHERE book_id = ?`
     - `DELETE FROM chapter_representations WHERE book_id = ? AND synthesisType != 'source'`
  6. Invalidate active outline in `editorial_outlines` for this book.
  7. Update `book_lifecycle`:
     - `in_library = 0`
     - `source_preserved = 1`
     - `lifecycle_state = 'research_only'`
     - `deleted_at = CURRENT_TIMESTAMP`
     - `deleted_from = 'library'`
     - `deleted_reason = 'user_library_delete'`
  8. Commit transaction.
- **Resulting State:**
  - Library route (`/`) omits the book.
  - Research route (`/research`) shows the source item with badge *"Source preserved — not in Library"*.
  - Research Viewer (`/research/:id`) displays full source chapters and a prominent action: **[ Synthesize Omni Reading ]**.

### 4.2 Operation B: Delete from Library + Delete Source

- **User Story:** *"I imported the wrong file or want to completely remove this book and its raw source from my reading app, but I want my lifetime token and expense stats to remain accurate."*
- **Preconditions:** User confirms deletion of both reading and source material.
- **Detailed Transaction Sequence:**
  1. Open SQLite transaction.
  2. Snapshot reading progress, synopsis, and chapter names to history tables.
  3. Delete derived entities (`paragraph_attributions`, `smart_chapters`, `chapter_representations`).
  4. Delete source entities:
     - `DELETE FROM chapters WHERE book_id = ?`
     - `DELETE FROM semantic_chunks WHERE book_id = ?`
     - `DELETE FROM book_supporting_materials WHERE book_id = ?`
     - `DELETE FROM processing_jobs WHERE book_id = ?`
  5. Delete disk files: remove original uploaded PDF/EPUB in `storage/books/` and custom cover files in `storage/covers/`.
  6. Delete `books` row (or mark `status = 'archived'`).
  7. Update `book_lifecycle`:
     - `in_library = 0`
     - `in_research = 0`
     - `source_preserved = 0`
     - `lifecycle_state = 'archived'`
     - `deleted_at = CURRENT_TIMESTAMP`
     - `deleted_from = 'both'`
     - `deleted_reason = 'user_delete_all'`
  8. Commit transaction.
- **Resulting State:**
  - Item is invisible in both Library (`/`) and Research (`/research`).
  - Total tokens and dollars expended on this book remain in `llm_usage` and count toward lifetime metrics in `/settings`.

### 4.3 Operation C: Delete from Research Only (Orphaned Reading)

- **User Story:** *"I am running low on disk space and want to delete a 150MB raw scanned PDF, but I want to keep reading the compressed Omni version in my Library."*
- **Architectural Consequence (The Orphan Problem):**
  - Omni reading relies on source chunks for **provenance verification** (clicking a claim navigates to the source block in ResearchViewer).
  - If source chunks and chapters are deleted, provenance navigation fails.
- **Design Resolution:**
  1. Modal presents an explicit warning:
     > [!WARNING]
     > **Deleting Original Source Creates an Orphaned Reading**  
     > Removing the source file reclaims disk space, but permanently breaks provenance links. You will still be able to read your compressed Omni chapters, but clicking text to inspect source blocks will be disabled, and you will not be able to re-synthesize this book.
  2. Upon confirmation:
     - Open SQLite transaction.
     - Delete source `chapters` and `semantic_chunks`.
     - Remove disk file from `storage/books/`.
     - In `paragraph_attributions`, set `fell_back = 1` and `fallback_reason = 'source_purged'`.
     - Update `book_lifecycle`:
       - `in_research = 0`
       - `source_preserved = 0`
       - `lifecycle_state = 'library_only'`
       - `deleted_at = CURRENT_TIMESTAMP`
       - `deleted_from = 'research'`
       - `deleted_reason = 'user_research_delete'`
     - Commit transaction.
- **Resulting State:**
  - Research route (`/research`) omits the item.
  - Library route (`/`) retains the book.
  - Reader displays a badge: *"Source detached — provenance disabled"*.

### 4.4 Operation D: Full Purge (Terminal Erasure)

- **User Story:** *"Permanently wipe all traces of this book from the database, including lifecycle audit logs, chapter rename histories, and synopsis drafts."*
- **Preconditions:**
  - Must already be in `'archived'` state (`in_library == 0 AND in_research == 0`). Active books cannot be purged directly without first being deleted.
  - User confirms in Settings → Storage & Archive by explicitly typing the book title.
- **Detailed Transaction Sequence:**
  1. Open SQLite transaction.
  2. `DELETE FROM chapter_name_history WHERE lifecycle_id = ?` (cascades automatically or explicit).
  3. `DELETE FROM synopsis_history WHERE lifecycle_id = ?` (cascades automatically or explicit).
  4. `DELETE FROM dossier_append_log WHERE book_id = ?`
  5. `DELETE FROM book_lifecycle WHERE id = ?`
     - **Note on `llm_usage`:** By foreign key definition (`ON DELETE SET NULL`), deleting the `book_lifecycle` row automatically sets `llm_usage.lifecycle_id = NULL` without deleting the usage rows. This locks in **Option 2B (Accountant Model)**: historical token consumption and real dollar expenditures are preserved for accurate lifetime billing metrics in Settings.
  6. Commit transaction.
- **Resulting State:**
  - Lifecycle row and chapter/synopsis histories are erased.
  - Lifetime compute ledger remains historically accurate to actual dollars and tokens spent.

### 4.5 Edge Cases & Concurrent Mutation Guards

1. **Delete During In-Flight Synthesis (F68 / F70):**  
   If a user requests deletion while a background synthesis worker is actively generating chapters, the service layer signals the worker cancellation token (`cancellationToken.cancel()`). The transaction awaits worker shutdown before purging database records.
2. **Shared Dossier Content:**  
   Deleting a single Library book synthesized from a multi-source dossier does **NOT** touch the dossier or its other derived books. Only entities specifically tied to that `book_id` are affected.

---

## 5. Re-Synthesis Contract

The Re-Synthesis Contract governs how Omnitome regenerates an Omni reading from an existing source or dossier without losing historical context.

### 5.1 User Stories and Entry Points (Phase 5.8f)

- **Story 1 (Recovery from Library Delete):** *"I deleted an Omni reading last week to declutter my shelf. Today I want it back. I click 'Synthesize Omni Reading' in Research. It regenerates the book and resumes exactly where I was reading."*
- **Story 2 (Dossier Synthesis = Phase 5.8f):** *"I created a research dossier containing 4 articles on neural networks. I am ready to read it as a book. I click 'Synthesize Omni Chapters' from the dossier viewer."*

#### Entry Points:
1. **Research Viewer Route (`/research/:id`):** Header contains action button **[ Synthesize Omni Reading ]**.
2. **Research Collection Card (`/research`):** Context menu contains **"Generate Omni Book"**.

### 5.2 State Carryover vs. Fresh Generation Matrix

| State Attribute | Disposition | Treatment During Re-Synthesis |
|---|---|---|
| **Reading Progress** | **CARRIED OVER** | Sequence and scroll percentage are mapped to the newly synthesized chapters. |
| **Chapter Name History** | **CARRIED OVER** | Historical records in `chapter_name_history` are retained. New chapters log with `synthesis_cycle = cycle + 1`. |
| **Synopsis History** | **CARRIED OVER** | Prior synopses are retained as Versions 1..N. Newly generated synopsis is logged as Version N+1. |
| **Token & Cost Ledger** | **CARRIED OVER** | All prior records in `llm_usage` remain untouched. New synthesis calls append fresh rows. Total cost reflects all cycles. |
| **Dossier Append Log** | **CARRIED OVER** | Append events remain permanently attached to the dossier. |
| **Source Semantic Chunks** | **REUSED (100%)** | Vectors are verified via `content_hash` and reused. Zero embedding recomputation. |
| **Smart Chapters** | **REGENERATED** | Old derived text is replaced by newly synthesized, loss-bounded chapters. |
| **Paragraph Provenance** | **REGENERATED** | Fresh alignment between new synthetic paragraphs and source chunks. |

### 5.3 Content Hash Reuse (Zero-Compute Indexing)

Because the source text was preserved in `chapters` and indexed in `semantic_chunks`, re-synthesis completely skips Stage 1 (Ingest & Parse) and Stage 2 (Semantic Indexing):
1. `semanticLifecycle.indexBook` performs an instantaneous check of chunk content hashes against existing vectors in `semantic_chunks`.
2. Existing 1024-dimensional BGE-M3 embeddings are reused directly from SQLite.
3. The system transitions immediately to Stage 4 (Editorial Planning) and Stage 5 (Synthesis), saving up to **90% of processing time** and **100% of GPU embedding VRAM time**.

### 5.4 End-to-End Re-Synthesis Lifecycle Workflow

```
[ User clicks "Synthesize Omni Reading" in Research Viewer ]
                             |
                             v
+--------------------------------------------------------------+
| 1. State Verification                                        |
|    - Verify in_research == 1                                 |
|    - Fetch existing book_lifecycle row                       |
+--------------------------------------------------------------+
                             |
                             v
+--------------------------------------------------------------+
| 2. Zero-Compute Indexing Check                               |
|    - Assert semantic_chunks exist with valid content_hash    |
|    - Skip PaddleOCR, pysbd, and BGE-M3 embedding             |
+--------------------------------------------------------------+
                             |
                             v
+--------------------------------------------------------------+
| 3. Editorial Planning & Synthesis                            |
|    - Generate outline (editorialService)                     |
|    - Synthesize chapters (synthesisService)                  |
|    - Run paragraph attribution & provenance verification     |
|    - Log token usage per call to `llm_usage`                 |
+--------------------------------------------------------------+
                             |
                             v
+--------------------------------------------------------------+
| 4. Reading Progress Reconciliation                           |
|    - Apply 3-Tier Recovery Algorithm                         |
|    - Match last_read_sequence / last_read_title              |
|    - Set opened_at and read_at on new target smart_chapter   |
+--------------------------------------------------------------+
                             |
                             v
+--------------------------------------------------------------+
| 5. Finalize Lifecycle State                                  |
|    - Update book_lifecycle:                                  |
|      in_library = 1, lifecycle_state = 'active'              |
|      synthesis_count = synthesis_count + 1                   |
|      updated_at = CURRENT_TIMESTAMP                          |
+--------------------------------------------------------------+
                             |
                             v
[ Navigate user to /books/:bookId with toast: "Reading restored" ]
```

---

## 6. Reading Progress Recovery

### 6.1 Progress Metrics Definition

Reading progress in Omnitome is tracked across four distinct dimensions:
1. **`status`:** `'unread'`, `'opened'`, or `'read'`.
2. **`sequence`:** 1-based index of the chapter within the editorial outline (`1..N`).
3. **`title`:** Clean display title of the chapter at read time.
4. **`scroll_pct`:** Normalized vertical scroll position (`0.000` to `1.000`), computed from window scroll offset relative to document scroll height.

### 6.2 Durable Progress Storage Format

When reading in `/read/:bookId/:chapterId`, every scroll event or chapter navigation updates both the transient `smart_chapters` table and the durable `book_lifecycle` snapshot:
- `book_lifecycle.last_read_sequence = smart_chapters.sequence`
- `book_lifecycle.last_read_title = smart_chapters.title`
- `book_lifecycle.last_read_scroll_pct = scroll_percentage`
- `book_lifecycle.last_read_at = CURRENT_TIMESTAMP`

### 6.3 Reconciliation Algorithm (Sequence and Title Alignment)

When re-synthesis completes, newly generated chapters have new IDs. The outline structure may also differ (for instance, an outline prompt variation may plan 7 chapters instead of the previous 8).

The recovery engine applies a **3-tier reconciliation algorithm**:

```
[ Re-synthesis Completes ]
           |
           v
+--------------------------------------------------------------+
| Tier 1: Sequence Alignment                                   |
| Does a new smart_chapter exist with:                         |
| sequence == lifecycle.last_read_sequence?                    |
+--------------------------------------------------------------+
        |                                     |
       YES                                   NO
        |                                     |
        v                                     v
[ Match Found ]                 +------------------------------+
[ Restore scroll_pct ]          | Tier 2: Title Fuzzy Matching |
                                | Match last_read_title        |
                                | against new chapter titles   |
                                +------------------------------+
                                        |              |
                                       YES            NO
                                        |              |
                                        v              v
                                 [ Match Found ] +---------------+
                                 [ Restore pct ] | Tier 3: Bound |
                                                 | Cap at max seq|
                                                 | or Chapter 1  |
                                                 +---------------+
```

1. **Tier 1 — Exact Sequence Match:**  
   If a newly synthesized chapter exists with `sequence == last_read_sequence`, it is selected as the primary resume target.
2. **Tier 2 — Title Fuzzy Overlap:**  
   If the chapter count has changed or sequence ordering shifted, the engine compares `last_read_title` against all new chapter titles using token overlap and normalized edit distance (threshold > 0.75). If a strong match is found, that chapter becomes the resume target.
3. **Tier 3 — Bounded Sequence Fallback:**  
   If no title matches and `last_read_sequence` exceeds the new total chapter count, progress is capped at the final chapter of the new outline. If `last_read_sequence` is null or zero, it defaults to Chapter 1.
4. **Restoration Execution:**  
   The target chapter receives:
   - `opened_at = lifecycle.last_read_at`
   - `read_at = (lifecycle.last_read_scroll_pct >= 0.95 ? lifecycle.last_read_at : null)`
   When the user opens the Reader, the frontend consumes `scroll_pct` and automatically positions the viewport.

### 6.4 Concrete Progress Recovery Scenarios

#### Scenario 1: Stable Outline (Same Chapter Count)
- *Before Delete:* User was reading Chapter 3 ("The Architecture of Thought") at 45% scroll position.
- *Action:* User deletes book from Library, keeping source in Research. Later, user triggers re-synthesis.
- *Outcome:* Tier 1 matches Sequence 3. Newly generated Chapter 3 is marked opened with scroll target 45%. Reader opens directly to Chapter 3 at 45% scroll.

#### Scenario 2: Shifting Outline (Outline Shrank from 6 to 5 Chapters)
- *Before Delete:* User was reading Chapter 6 ("Conclusions & Appendices") at 80% scroll position.
- *Action:* Re-synthesis plans a tighter 5-chapter outline.
- *Outcome:* Tier 1 fails (no Chapter 6 exists). Tier 2 fuzzy-matches "Conclusions & Appendices" to new Chapter 5 ("Synthesis and Conclusions"). Progress is restored to Chapter 5 at 80% scroll.

---

## 7. Append Log & Dossier Provenance

Multi-Source Dossiers allow users to compile disparate documents into a unified research topic. Users require verifiable provenance detailing how each document contributed to the dossier.

### 7.1 Dossier Append Event Schema

Every document addition, file drop, or web clipping appended to a dossier writes an immutable event into `dossier_append_log`:

```
+-----------------------------------------------------------------------------------+
|                                dossier_append_log                                 |
+-----------------------------------------------------------------------------------+
| id            : TEXT PRIMARY KEY (app_...)                                        |
| dossier_id    : TEXT NOT NULL (Anchor to books.id of dossier)                     |
| book_id       : TEXT (Nullable: ID of derived Library book, if synthesized)       |
| source_id     : TEXT NOT NULL (ID of chapter, import_queue task, or material)     |
| source_type   : TEXT NOT NULL ('file' | 'web' | 'paste')                          |
| file_name     : TEXT (Original file name or document heading)                     |
| file_hash     : TEXT (SHA-256 hex digest for content-addressable deduplication)  |
| file_size     : INTEGER (Byte count on disk, nullable)                            |
| source_url    : TEXT (Canonical URL for web articles, nullable)                   |
| char_count    : INTEGER DEFAULT 0                                                 |
| word_count    : INTEGER DEFAULT 0                                                 |
| appended_at   : TEXT NOT NULL (ISO-8601)                                          |
| metadata_json : TEXT DEFAULT '{}'                                                 |
+-----------------------------------------------------------------------------------+
```

### 7.2 Ingestion Pipeline & Import Queue Integration (F58)

F58 established the persistent SQLite-backed import queue (`importQueueService.js`). F52 instruments the queue worker:
1. **File Ingestion:** When `importQueueService` finishes processing a file task, it computes the SHA-256 hash of the staging file and records an append event with `source_type = 'file'`.
2. **Pasted Text:** When a paste task finishes, it records an append event with `source_type = 'paste'`, word count, and text hash.
3. **Web Acquisition:** When a web crawler task completes, it records an append event with `source_type = 'web'`, canonical URL, and title.

### 7.3 UI Display Surface: Dossier Manifest & Timeline

In `ResearchViewerRoute.tsx` (`/research/:id`), for items where `isDossier: true`, a **"Dossier Manifest & Timeline"** panel is rendered:

```
+-----------------------------------------------------------------------------------+
| DOSSIER MANIFEST & TIMELINE                                    [ + Add Content ]  |
+-----------------------------------------------------------------------------------+
| [PDF] Attention Is All You Need                                                   |
|       attention-is-all-you-need.pdf * 12,450 words * SHA: #7f8a9b                 |
|       Appended: Oct 12, 2026, 09:15 PM                                            |
|                                                                                   |
| [WEB] Scaling Laws for Neural Language Models                                     |
|       https://arxiv.org/abs/2001.08361 * 8,120 words * SHA: #3c4d5e               |
|       Appended: Oct 13, 2026, 02:40 PM                                            |
|                                                                                   |
| [PST] Research Notes on Chinchilla Scaling                                        |
|       Pasted Research Document * 1,840 words * SHA: #9a1b2c                       |
|       Appended: Oct 13, 2026, 11:22 PM                                            |
|                                                                                   |
| --------------------------------------------------------------------------------- |
| DERIVED READING:                                                                  |
| [OMNI] Modern Transformer Architectures (5 Chapters Synthesized)                  |
|        Status: Active in Library [ Open in Reader -> ]                            |
+-----------------------------------------------------------------------------------+
```

---

## 8. Token & Cost Tracking Ledger

### 8.1 Per-Invocation Usage Schema (`llm_usage`)

Every call dispatched to an LLM provider records an execution record in `llm_usage`:

```
+-----------------------------------------------------------------------------------+
|                                     llm_usage                                     |
+-----------------------------------------------------------------------------------+
| id                : TEXT PRIMARY KEY (use_...)                                    |
| lifecycle_id      : TEXT (FK to book_lifecycle.id ON DELETE CASCADE, nullable)    |
| book_id           : TEXT NOT NULL                                                 |
| chapter_id        : TEXT (Nullable: null for book-level synopsis/outline calls)   |
| stage             : TEXT NOT NULL ('classify'|'outline'|'synopsis'|'synthesis'...)  |
| provider          : TEXT NOT NULL ('openrouter' | 'ollama' | 'lmstudio')          |
| model             : TEXT NOT NULL (Model identifier string)                       |
| prompt_tokens     : INTEGER NOT NULL DEFAULT 0                                    |
| completion_tokens : INTEGER NOT NULL DEFAULT 0                                    |
| total_tokens      : INTEGER NOT NULL DEFAULT 0                                    |
| cost_estimate_usd : REAL NOT NULL DEFAULT 0.0 (Calculated USD or 0.0 for local)   |
| latency_ms        : INTEGER NOT NULL DEFAULT 0                                    |
| finish_reason     : TEXT (e.g., 'stop', 'length', 'timeout')                       |
| created_at        : TEXT NOT NULL (ISO-8601)                                      |
+-----------------------------------------------------------------------------------+
```

### 8.2 Gateway Usage Capture & Provider Cost Calculations

#### OpenRouter Gateway (`openrouterProvider.js`):
1. Captures `response.usage.prompt_tokens` and `response.usage.completion_tokens`.
2. Checks for `x-openrouter-cost` response header. If missing, applies local model pricing lookup from `config.js`:
   - DeepSeek V4 Flash: `$0.14 / 1M prompt`, `$0.28 / 1M completion`.
   - Claude 3.5 Sonnet: `$3.00 / 1M prompt`, `$15.00 / 1M completion`.
   - Llama 3.3 70B: `$0.40 / 1M prompt`, `$0.40 / 1M completion`.
3. Records micro-dollar floating-point value in `cost_estimate_usd`.

#### Ollama & Local Gateways (`ollamaProvider.js`):
1. Captures `prompt_eval_count` as `prompt_tokens`.
2. Captures `eval_count` as `completion_tokens`.
3. Sets `cost_estimate_usd = 0.0`.
4. Captures execution latency from `total_duration` in milliseconds.

### 8.3 Local LLM Zero-Dollar Accounting Policy

Omnitome enforces the **Honest Compute Policy**:
- Local calls (Ollama, LM Studio, vLLM) **strictly record `$0.00000 USD`**.
- Tokens, latency, and throughput (tokens/sec) are **fully and accurately recorded**.
- Users running local hardware see accurate compute metrics without synthetic dollar inflations.

### 8.4 Query Aggregations and UI Display Surfaces

#### 1. Book Details Route (`/books/:id`):
Renders synthesis cost summary directly on the book overview card:
- *Cloud Synthesis:* `Synthesis Compute: $0.04 USD (18,450 tokens via deepseek-v4-flash)`
- *Local Synthesis:* `Synthesis Compute: Local Ollama (24,100 tokens — $0.00)`

#### 2. Settings Route (`/settings`):
A dedicated **"Compute & Expense Ledger"** dashboard displaying:
- **Lifetime Spending:** `$1.42 USD` (across 32 books).
- **Lifetime Token Volume:** `1,248,500 tokens` (820K prompt / 428K completion).
- **Local Compute Utilization:** `68% Local / 32% Cloud`.
- **Stage Breakdown:** Synthesis (74%), Outline Planning (14%), Synopsis (8%), Classification (4%).

---

## 9. Migration Strategy & Zero Data Loss Guarantee

### 9.1 Automated Backfill Algorithm

The migration executes automatically upon server startup during database initialization (`runPendingMigrations` in `backend/db/database.js`):

```
+-----------------------------------------------------------------------------------+
|                               MIGRATION BACKFILL FLOW                             |
+-----------------------------------------------------------------------------------+
| 1. Create tables: book_lifecycle, chapter_name_history, synopsis_history,         |
|                   dossier_append_log, llm_usage. Index all foreign keys.          |
| 2. Iterate all rows in `books`:                                                   |
|    a. Check if smart_chapters exist with status = 'generated':                    |
|       - in_library = 1 (if exists) else 0                                         |
|    b. Check if source chapters exist in `chapters`:                               |
|       - in_research = 1 (if exists or content_type == 'research') else 0          |
|    c. Extract highest reading progress from smart_chapters:                       |
|       SELECT id, sequence, title, scroll_pct, COALESCE(read_at, opened_at)        |
|       FROM smart_chapters WHERE book_id = ? ORDER BY last_touched DESC LIMIT 1    |
|    d. Seed `book_lifecycle` row with recovered progress and flags.               |
|    e. Seed initial `synopsis_history` from `books.description` if present.        |
| 3. Set user_version pragma.                                                       |
+-----------------------------------------------------------------------------------+
```

### 9.2 Data Integrity & Zero-Loss Invariants

1. **Purely Additive DDL:** The migration creates new tables only. It does not alter existing columns or drop existing constraints.
2. **Safe Fallbacks:** Books lacking `smart_chapters` default to `in_library = 0`, ensuring uncompressed research items do not clutter the Library.
3. **Idempotency:** The backfill uses `INSERT OR IGNORE` keyed on `book_id`. Interrupted or repeated runs cause zero data corruption.

### 9.3 Rollback & Down-Migration Protocol

In the event of an emergency rollback:
1. Drop satellite tables: `llm_usage`, `dossier_append_log`, `synopsis_history`, `chapter_name_history`.
2. Drop coordination table: `book_lifecycle`.
3. Decrement SQLite `user_version` pragma.
4. Existing books, chapters, and readings remain 100% operational under the legacy schema.

---

## 10. Phased Implementation Plan (4 Sessions)

Implementation is strictly bounded across **4 sessions**:

```
+-----------------------------------------------------------------------------------+
|                          PHASED IMPLEMENTATION ROADMAP                            |
+-----------------------------------------------------------------------------------+
| SESSION 1 (This Session) : Architectural Design Specification                      |
|                            - Deliverable: docs/DESIGN_LIBRARY_RESEARCH_STATE.md   |
|                            - Commit: docs(f52): design specification              |
+-----------------------------------------------------------------------------------+
| SESSION 2 : Database Schema, Repository & Service Layer                           |
|             - Deliverables: database.js migration, repositories, lifecycleService |
|             - Test Suite: Unit tests for lifecycle transitions & backfill         |
|             - Commit: feat(db): book_lifecycle coordination schema & services     |
+-----------------------------------------------------------------------------------+
| SESSION 3 : API Endpoints, Pipeline Integration & Usage Ledger                    |
|             - Deliverables: lifecycleRoutes.js, llmUsageService, append log hooks  |
|             - UI: BookDetails cost badge, Settings compute ledger                 |
|             - Commit: feat(api): lifecycle endpoints and token cost tracking      |
+-----------------------------------------------------------------------------------+
| SESSION 4 : Delete Semantics Wiring, Re-synthesis (5.8f) & Recovery Verification  |
|             - Deliverables: Delete modal 4-way operations, 5.8f button, recovery  |
|             - Test Suite: Full delete/re-synthesis roundtrip integration tests     |
|             - Commit: feat(lifecycle): delete semantics and progress recovery    |
+-----------------------------------------------------------------------------------+
```

### Session Breakdown Details:

#### Session 1: Architectural Design Specification (Current Session)
- **Scope:** Pure architectural design document. Zero code modifications.
- **Deliverables:** `docs/DESIGN_LIBRARY_RESEARCH_STATE.md`.
- **Exit Criteria:** Formal review and approval by the user.

#### Session 2: Schema, Repositories, and Service Layer
- **Scope:**
  - Implement SQLite migrations in `backend/db/database.js`.
  - Create repositories:
    - `backend/repositories/bookLifecycleRepository.js`
    - `backend/repositories/llmUsageRepository.js`
    - `backend/repositories/appendLogRepository.js`
    - `backend/repositories/synopsisHistoryRepository.js`
  - Create service:
    - `backend/services/lifecycle/bookLifecycleService.js`
  - Automated backfill logic in migration.
- **Test Suite:**
  - `backend/tests/f52_schema_and_lifecycle_test.js` (verifies CRUD, backfill integrity, and state transition invariants).

#### Session 3: REST Endpoints, Pipeline Hooks, and Usage Ledger
- **Scope:**
  - REST routes in `backend/routes/lifecycleRoutes.js`:
    - `GET /api/lifecycle/:bookId`
    - `GET /api/lifecycle/:bookId/usage`
    - `GET /api/lifecycle/dossiers/:id/timeline`
    - `GET /api/usage/summary`
  - Ingestion pipeline hooks:
    - Instrument `openrouterProvider.js` and `ollamaProvider.js` to log to `llm_usage`.
    - Instrument `importQueueService.js` to log append events to `dossier_append_log`.
  - Frontend integration:
    - Add token/cost badge to `BookDetailsRoute.tsx`.
    - Add compute ledger to `SettingsRoute.tsx`.
- **Test Suite:**
  - `backend/tests/f52_usage_and_append_log_test.js`.

#### Session 4: Delete Semantics, Re-synthesis (5.8f), and Recovery Tests
- **Scope:**
  - Update `DeleteBookConfirmContent.tsx` to support the 4 delete operations.
  - Wire `bookService.deleteBook` to honor Operations A, B, C, and D.
  - Implement Phase 5.8f trigger button in `ResearchViewerRoute.tsx` (*"Synthesize Omni Chapters"*).
  - Implement progress recovery algorithm in `editorialService.js` / `synthesisService.js`.
- **Test Suite:**
  - `backend/tests/f52_delete_resynthesis_recovery_test.js` (simulates: import -> read to Ch 4 at 60% -> delete from Library -> re-synthesize -> assert progress restored to Ch 4 at 60%).

---

## 11. Interactions with Existing Work & Subsumed Items

| Work Item / Issue | Status | Relationship to F52 | Architectural Disposition |
|---|---|---|---|
| **5.8e** (Paste → existing Research item) | SHIPPED (F58) | F58 added paste destination targeting (`importQueueService.js`). | **Subsumed & Instrumented:** F52 hooks into F58 paste completions to write immutable entries to `dossier_append_log`. |
| **5.8f** (Research → Synthesize Omni Chapters) | PENDING | User triggers synthesis of an existing Research source into a Library book. | **Becomes F52 Re-Synthesis Path:** 5.8f is formally implemented as the entry point for F52's re-synthesis contract in Session 4. |
| **5.8g** (Research ↔ Library Cross-linking) | PENDING | Navigating between source and derived reading. | **Solved by F52 Coordination View:** `book_lifecycle` provides the authoritative foreign key bridge. Research cards show links to active Omni books, and vice versa. |
| **F58.1** (Dossier dedup by title collides) | OPEN | In `importQueueService.js`, pasting with an existing title silently merges into that dossier. | **Resolved via Append Log & Explicit ID:** F52 tracks appends by unique `dossier_id` and file/text hash. Title-based lookup will be deprecated in favor of explicit `dossier_id` selection. |
| **F54** (Synopsis re-synthesize button) | OPEN | Manual button on Book Details to regenerate book synopsis. | **Integrated:** When F54 triggers a synopsis re-synthesis, the old synopsis is pushed to `synopsis_history` instead of destructively overwritten. |

---

## 12. Architectural Decisions Locked by User

The four architectural design questions were reviewed and formally locked by the user:

### Decision 1: Orphan Behavior on "Delete from Research Only" (Operation C)
- **Approved Choice:** **Option 1A.**
- **Specification:** When a user deletes the raw source file from Research but keeps the derived book in Library, the orphaned reading remains fully readable. Provenance claims display a clear badge: *"Source archived / detached"*. Clicking provenance highlights does not attempt to resolve to nonexistent raw source blocks.

### Decision 2: Lifetime Token & Cost Retention on Full Purge (Operation D)
- **Approved Choice:** **Option 2B (Accountant Model) with Schema Fix.**
- **Specification:** When a user permanently purges an archived book's lifecycle row, the records in `llm_usage` are **preserved**. The foreign key `llm_usage.lifecycle_id` is defined with `ON DELETE SET NULL`. Deleting `book_lifecycle` sets `llm_usage.lifecycle_id = NULL` rather than cascading away the expense records. The user's lifetime spending metrics in `/settings` remain historically accurate to real-world wallet expenses.

### Decision 3: Multi-Source Dossier Identity Model
- **Approved Choice:** **Option 3B (Parent-Child Entity Model).**
- **Specification:** When an Omni reading is synthesized from a multi-source dossier, the reading receives its own distinct `book_id` (e.g. `book-omni-...`). The lifecycle row points back to the origin dossier via `re_synthesis_source_id = dossier.id`. This decouples the research compilation from the synthesized book and allows one dossier to spawn multiple focused readings without identity collisions.

### Decision 4: Local LLM Cost Value Display
- **Approved Choice:** **Option 4B with Hierarchy.**
- **Specification:** Local LLM invocations (Ollama, LM Studio) display with strict metric hierarchy:
  - **Primary Metric:** `$0.00` actual cost (truth first).
  - **Secondary Text:** Estimated cloud-equivalent market savings (hypothetical second).
  - *Example UI string:* `Local Ollama (24,100 tokens — $0.00 actual / ~$0.05 cloud value saved)`.

---
*End of Design Document — Awaiting User Review and Approval.*
