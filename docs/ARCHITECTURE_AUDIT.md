# SMART READER — ARCHITECTURAL RECONNAISSANCE & PIPELINE AUDIT REPORT

**Date:** March 2025  
**Role:** Senior Systems Architect  
**Status:** Read-Only Architectural Inspection (No modifications made to codebase)  
**Target File:** `docs/ARCHITECTURE_AUDIT.md`  

---

## EXECUTIVE SUMMARY

Smart Reader currently operates as an Express/Node.js, SQLite, and vanilla ES6 frontend reading and research platform. The system ingests multi-format documents (TXT, EPUB, PDF, HTML, Markdown, and multi-source Web content), preserves original immutable source text alongside structured JSON canonical representations, indexes content into SQLite semantic vector chunks, and generates both single-book synopses/summaries and cross-source research collection editorial chapters.

This audit evaluates the current implementation against the target end-state architecture:
$$\text{User Material} \longrightarrow \text{Extraction} \longrightarrow \text{Parsing} \longrightarrow \text{Canonical Source} \longrightarrow \text{Structural Analysis} \longrightarrow \text{Semantic Chunking} \longrightarrow \text{Semantic Index} \longrightarrow \text{Editorial Organizer} \longrightarrow \text{Editorial Chapter Plan} \longrightarrow \text{Synthesis Model} \longrightarrow \text{Grounded Reader-Facing Content}$$

---

## TASK 1: SUMMARY OF KEY SOURCE FILES & THEIR ROLES

1. **`backend/db/database.js`**  
   Defines the complete SQLite database schema (`books`, `chapters`, `chapter_representations`, `semantic_chunks`, `processing_jobs`, `book_supporting_materials`, `book_representations`, `editorial_outlines`) using `better-sqlite3`, manages schema migrations, triggers, foreign keys, and seeds sample books.
2. **`backend/services/ingestion/ingestionService.js`**  
   Coordinates end-to-end document intake: converts buffers/text into normalized forms, dispatches to format parsers, invokes chapter detection, generates canonical document blocks, and packages metadata.
3. **`backend/services/ingestion/structure/chapterDetector.js`**  
   Applies multi-pass deterministic regex and structural heuristics to identify chapter breaks, titles, structural roles (prologue, appendix, chapter), and sub-sections across various literary and technical conventions.
4. **`backend/services/semantic/semanticChunker.js`**  
   Transforms preprocessed chapter structural units into sized semantic chunks (target ~350–500 words, bounded 100–800 words), preserving structural boundaries, heading hierarchy, and source provenance metadata.
5. **`backend/services/semantic/semanticIndex.js`**  
   Manages chunk persistence into the `semantic_chunks` table, computes 64-dimensional hash/TF-IDF dense vector embeddings, executes cosine-similarity search, and performs full-text queries.
6. **`backend/services/semantic/retrievalService.js`**  
   Executes hybrid cross-source retrieval combining vector cosine similarity with keyword scoring, diversity re-ranking, and metadata filtering across one or multiple books.
7. **`backend/services/semantic/contextBuilder.js`**  
   Assembles retrieved chunks into structured, token-budgeted prompt contexts with strict source provenance brackets (`[Source N: Title, Section: ...]`) to ensure grounded LLM generation without hallucination.
8. **`backend/services/synthesis/editorialService.js`**  
   Coordinates editorial outline creation, regeneration, caching, and lifecycle management for research collections across multiple source books, interfacing with `editorialPlanner` and `outlineRepository`.
9. **`backend/services/synthesis/synthesisService.js`**  
   Generates grounded reader-facing editorial chapters from outline plans using `retrievalService`, `contextBuilder`, and `aiService`, formatting outputs into canonical blocks and storing them in `chapter_representations`.
10. **`backend/services/synthesis/editorialPlanner.js`**  
    Derives editorial chapter plans from candidate source sections using `sectionFilter` and `redundancyDetector`, employing an LLM prompt with a fallback to a deterministic clustered planner.
11. **`backend/repositories/outlineRepository.js`**  
    Provides data access operations for storing, retrieving, updating, and deleting structured JSON editorial plans in the `editorial_outlines` database table.
12. **`backend/repositories/representationRepository.js`**  
    Manages persistence and retrieval of derived book-level and chapter-level representations (synopses, summaries, editorial chapters) in `book_representations` and `chapter_representations`.
13. **`backend/repositories/chapterRepository.js`**  
    Handles CRUD operations for original chapter records in `chapters`, including word counts, reading statuses, and canonical JSON blocks, ensuring the immutable source text remains intact.

---

## TASK 2: 25 ARCHITECTURAL QUESTIONS & VERIFIED ANSWERS

### Q1: Where is canonical source material stored? (table + column)
* **Table:** `chapters` (for books/documents) and `book_supporting_materials` (for web/ancillary sources).  
* **Columns:**  
  * `chapters.content` (`TEXT NOT NULL`): Raw extracted source text.  
  * `chapters.canonical_content` (`TEXT`): Serialized JSON array of typed canonical blocks (`paragraph`, `heading`, `quote`, `list`, `code`, `separator`, `callout`).  
  * `book_supporting_materials.content` & `book_supporting_materials.canonical_content`.  
  * Referenced in `backend/db/database.js` (lines 44, 91–92, 194).

### Q2: Where are source sections/chapters stored? (table + column)
* **Table:** `chapters` for high-level chapters/sections; `semantic_chunks` for granular decomposed sections.  
* **Columns:**  
  * In `chapters`: `id`, `book_id`, `number`, `title`, `content`, `canonical_content`, `structural_role`, `section_count` (`backend/db/database.js` lines 39–50, 192–204).  
  * In `semantic_chunks`: `id`, `book_id`, `chapter_id`, `sequence`, `section_heading`, `text_content`, `canonical_json`, `source_reference` (`backend/db/database.js` lines 100–117).

### Q3: Where does semantic chunking happen? (file + function)
* **File:** `backend/services/semantic/semanticChunker.js`  
* **Function:** `chunkPreprocessedUnits(units, bookMetadata)` (lines 10–159).  
* **Lifecycle Orchestrator:** Invoked in `backend/services/semantic/semanticLifecycle.js` via `indexBook(bookId)` (line 43) and `indexChapter(chapterId)` (line 88).

### Q4: Where are semantic chunks stored? (table + column)
* **Table:** `semantic_chunks`  
* **Columns:** `id`, `book_id`, `chapter_id`, `sequence`, `text_content`, `section_heading`, `token_count`, `source_reference`, `embedding`, `canonical_json`, `created_at` (`backend/db/database.js` lines 100–117).

### Q5: What columns does the semantic_chunks table have?
* `id` (`TEXT PRIMARY KEY`)
* `book_id` (`TEXT NOT NULL`, references `books(id) ON DELETE CASCADE`)
* `chapter_id` (`TEXT`, references `chapters(id) ON DELETE SET NULL`)
* `sequence` (`INTEGER NOT NULL`)
* `text_content` (`TEXT NOT NULL`)
* `section_heading` (`TEXT`)
* `token_count` (`INTEGER`)
* `source_reference` (`TEXT`)
* `embedding` (`TEXT`) — JSON stringified 64-float vector
* `canonical_json` (`TEXT`)
* `created_at` (`DATETIME DEFAULT CURRENT_TIMESTAMP`)

### Q6: Does semantic indexing compute embeddings? If so, what model/method?
* **Yes.**  
* **Method/Implementation:** In `backend/services/semantic/semanticIndex.js` (`generateEmbedding(text)` lines 14–46).  
* **Algorithm:** A deterministic, local 64-dimensional feature hashing and term-frequency algorithm (bag-of-words hash projection normalized with L2 unit norm). It operates completely locally in Node.js without network calls or external embedding APIs, ensuring privacy and offline capability.

### Q7: Where does vector/semantic retrieval happen? (file + function)
* **File:** `backend/services/semantic/semanticIndex.js`  
* **Functions:** `cosineSimilarity(vecA, vecB)` (lines 48–56), `searchSimilarChunks(bookId, query, options)` (lines 125–158), and `searchMultiBookChunks(bookIds, query, options)` (lines 160–193).  
* **High-Level Hybrid Engine:** Wrapped in `backend/services/semantic/retrievalService.js` via `search(query, options)` (lines 20–78).

### Q8: What tables exist in the SQLite database? (list all)
1. `books`
2. `chapters`
3. `chapter_representations`
4. `semantic_chunks`
5. `processing_jobs`
6. `book_supporting_materials`
7. `book_representations`
8. `editorial_outlines`

### Q9: Does the editorial_outlines table exist? If so, what is its schema?
* **Yes.** Defined in `backend/db/database.js` (lines 142–153).  
* **Schema:**
  ```sql
  CREATE TABLE IF NOT EXISTS editorial_outlines (
    id TEXT PRIMARY KEY,
    collection_id TEXT,
    title TEXT NOT NULL,
    topic TEXT,
    source_book_ids TEXT NOT NULL,       -- JSON array of book IDs
    outline_json TEXT NOT NULL,          -- JSON serialized outline structure
    status TEXT DEFAULT 'draft',         -- 'draft' | 'approved' | 'superseded'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  ```

### Q10: Does the chapter_representations table exist? If so, what is its schema?
* **Yes.** Defined in `backend/db/database.js` (lines 52–63).  
* **Schema:**
  ```sql
  CREATE TABLE IF NOT EXISTS chapter_representations (
    id TEXT PRIMARY KEY,
    chapter_id TEXT,                     -- References chapters(id) ON DELETE CASCADE (nullable for cross-source editorial chapters)
    book_id TEXT NOT NULL,               -- References books(id) ON DELETE CASCADE
    type TEXT NOT NULL,                  -- 'SUMMARY' | 'EDITORIAL_SYNTHESIS' | 'KEY_POINTS' | 'ANALYSIS'
    content TEXT NOT NULL,
    metadata_json TEXT,                  -- JSON string with provider, model, tokens, duration, canonicalBlocks, provenance
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  ```

### Q11: Where does editorial outline planning happen? (file + function)
* **File:** `backend/services/synthesis/editorialPlanner.js`  
* **Function:** `plan(candidateSections, options)` (lines 15–86).  
* **Fallback:** `createDeterministicOutline(candidateSections, options)` (lines 182–247).  
* **Entry Point:** Called by `backend/services/synthesis/editorialService.js` in `generateOutline({ bookIds, topic, title, collectionId, fast })` (lines 13–73).

### Q12: Does editorial outline planning use an LLM or deterministic logic?
* **Both (Hybrid with LLM primary and deterministic fallback):**  
  * Primary: `editorialPlanner.plan()` constructs a prompt and calls `aiService.generateText(prompt)` (lines 44–58).  
  * Secondary / Fallback: If `fast: true`, or if `aiService.isAvailable()` is false, or if JSON parsing fails / generation throws, it automatically calls `createDeterministicOutline()`, which groups sections using `redundancyDetector.detect()` into structured chapters without any LLM.

### Q13: Where does editorial chapter synthesis happen? (file + function)
* **File:** `backend/services/synthesis/synthesisService.js`  
* **Function:** `synthesizeChapter(outlineId, chapterId, options)` (lines 16–105).

### Q14: Does chapter synthesis store its output? Where? (table + column)
* **Yes.**  
* **Table:** `chapter_representations`  
* **Columns:**  
  * `content` (`TEXT`): Synthesized markdown/text.  
  * `metadata_json` (`TEXT`): Includes `canonicalBlocks`, `provenance`, `sourceSectionIds`, `tokenStats`, `outlineId`, `chapterId`.  
  * `type` set to `'EDITORIAL_SYNTHESIS'`.  
  * Referenced in `backend/repositories/representationRepository.js` (`saveChapterRepresentation()`, lines 39–61) invoked from `synthesisService.js` (lines 79–89).

### Q15: Is original source material modified during synthesis? (verify against code)
* **No. Absolute immutability is preserved.**  
  * Verified in `backend/services/synthesis/synthesisService.js`: The service only reads from `semantic_chunks` and `chapters`, and writes exclusively to `chapter_representations` using `representationRepository.saveChapterRepresentation()`.  
  * Original rows in `chapters.content` and `chapters.canonical_content` are never updated or overwritten.

### Q16: How does the frontend display synthesized chapters vs original chapters?
* **In Reader View (`src/script.js` lines 1000–1248):**  
  * Uses a representation switcher: `#btn-rep-original` vs `#btn-rep-summary`.  
  * In `original` mode, displays `state.activeChapter.canonical_content` (or raw source view).  
  * In `summary` mode, displays `state.activeRepresentation.canonicalBlocks`.  
* **In Research Collection View (`src/script.js` lines 3530–3780):**  
  * Research tab `#tab-btn-editorial` presents the synthesized multi-book outline (`#editorial-chapters-list`) on the left and the synthesized chapter canvas (`#editorial-chapter-body`) on the right.  
  * Research tab `#tab-btn-sources` displays original source cards with buttons to "View Original Book".  
  * Includes an expandable Provenance Drawer (`#editorial-provenance-drawer`, line 3719) linking synthesized paragraphs directly back to the original source chunk references.

### Q17: What API endpoints exist for synthesis? (list from backend/routes/)
From `backend/routes/synthesisRoutes.js`:
* `POST /api/synthesis/outline` — Generate editorial outline across source book IDs.
* `GET  /api/synthesis/outline/:outlineId` — Get outline details.
* `GET  /api/synthesis/outlines` — List outlines (optional `?collectionId=`).
* `DELETE /api/synthesis/outline/:outlineId` — Delete outline and linked representations.
* `POST /api/synthesis/outline/:outlineId/regenerate` — Regenerate outline and invalidate stale representations.
* `POST /api/synthesis/synthesize` — Synthesize reader-facing editorial chapter.
* `GET  /api/synthesis/chapter/:outlineId/:chapterId` — Get stored chapter synthesis.
* `POST /api/synthesis/query` — Cross-source comparative Q&A.
* `POST /api/synthesis/search` — Cross-source vector/semantic retrieval.

### Q18: What happens during ingestion? (step-by-step from code)
From `backend/services/bookService.js` (`importBook`, lines 154–268) and `backend/services/ingestion/ingestionService.js` (`ingest`, lines 15–120):
1. **Intake & Title Resolution:** Accepts raw text or uploaded buffer; derives title and author.
2. **Format Normalization & Parsing:** Detects format (`txt`, `epub`, `pdf`, `html`, `markdown`) and routes to dedicated parser (`epubParser`, `pdfParser`, `htmlParser`, `markdownParser`, `textParser`).
3. **Structure & Chapter Detection:** `chapterDetector.detectChapters()` segments document into chapters and sub-sections, identifying frontmatter, main chapters, and backmatter.
4. **Canonical Document Construction:** Each chapter is parsed into typed canonical blocks (headings, paragraphs, lists, code).
5. **Book Persistence:** `bookService.createBook()` saves metadata to `books`.
6. **Chapter Entity Batch Persistence:** Chapters are mapped and batch-inserted into `chapters` with both raw `content` and JSON `canonical_content`.
7. **Semantic Memory Indexing:** `semanticLifecycle.indexBook()` preprocesses chapters, executes `semanticChunker.chunkPreprocessedUnits()`, computes 64-dim embeddings in `semanticIndex.indexChunks()`, and saves chunks to `semantic_chunks`.
8. **Job State Update:** `processing_jobs` table is updated to `COMPLETED`.

### Q19: Where is provenance (which source text produced what) tracked?
* **In Chunk Indexing:** `semantic_chunks.source_reference` stores `[Book Title > Chapter N: Title > Section Heading]`.
* **In Context Construction:** `contextBuilder.buildContext()` prepends explicit provenance markers: `[Source ${chunk.sourceNumber}: ${chunk.bookTitle}, Chapter: ${chunk.chapterTitle || 'N/A'}, Section: ${chunk.sectionHeading || 'Main'}]`.
* **In Editorial Outline Planning:** `editorial_outlines.outline_json` stores `sourceSectionIds` and `sourceSections` for each planned chapter.
* **In Chapter Representations:** `chapter_representations.metadata_json` stores `provenance` arrays of chunk IDs and source titles.
* **In Frontend:** Rendered in `editorial-provenance-drawer` (`src/script.js` lines 3693–3717).

### Q20: What happens if Gemini is not configured? Does the system fail or fall back?
* **The system gracefully falls back.**  
* **Details:**  
  * `aiService.js` maintains registered providers: `gemini` and `ollama` (`backend/services/ai/aiService.js` lines 10–20).  
  * `editorialPlanner.plan()` checks `aiService.isAvailable()`. If false or if GEMINI_API_KEY is unset, it calls `createDeterministicOutline()`, clustering sections via `redundancyDetector.detect()` (`backend/services/synthesis/editorialPlanner.js` lines 79–84, 182–247).  
  * `synthesisService.synthesizeChapter()` provides a structured extract fallback if the model call fails (`backend/services/synthesis/synthesisService.js` lines 94–103).  
  * Frontend informs the user via `#ai-status-indicator` without crashing.

### Q21: What models are configured for Gemini?
In `backend/services/ai/geminiProvider.js` (lines 14–17):
* `model`: Default is `gemini-2.5-flash`.
* Supported models registered in `provider`: `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-1.5-flash`, `gemini-1.5-pro`.

### Q22: What models are configured for Ollama?
In `backend/services/ai/ollamaProvider.js` (lines 10–14):
* `model`: Default is `llama3`.
* Supported models registered in `provider`: `llama3`, `mistral`, `gemma:2b`, `qwen2.5:3b`.
* Base URL: `http://localhost:11434`.

### Q23: Is there a job queue or async processing mechanism?
* **Yes, a persistent SQLite-backed job tracker.**  
* **Implementation:** `backend/repositories/jobRepository.js` writing to `processing_jobs`.  
* **Features:** Tracks `book_id`, `chapter_id`, `type` (`INGEST`, `SUMMARIZE`, `SEMANTIC_INDEX`), `status` (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`), `progress` (0–100%), and `error` messages.  
* **Routes & UI:** Exposed via `/api/jobs` (`backend/routes/jobRoutes.js`) and rendered in real-time in the frontend Processing Modal (`#nav-jobs-btn`).

### Q24: What is the difference between book_representations and chapter_representations?
* **`chapter_representations` (`backend/db/database.js` lines 52–63):**  
  * Scoped to specific chapters (or synthesized editorial chapters in an outline).  
  * Types: `SUMMARY`, `EDITORIAL_SYNTHESIS`, `KEY_POINTS`, `ANALYSIS`.  
  * Linked optionally by `chapter_id` and required `book_id`.
* **`book_representations` (`backend/db/database.js` lines 128–140):**  
  * Scoped to the entire book / document.  
  * Types: `SYNOPSIS`, `BOOK_SUMMARY`, `THEMATIC_ANALYSIS`, `READING_GUIDE`.  
  * Linked by `book_id`, contains whole-book structural takeaways, character arcs, and multi-chapter themes.

### Q25: How does the reader view switch between representations?
In `src/script.js` (`setReadingRepresentation(mode)` lines 997–1015 & `renderActiveRepresentationCanvas()` lines 1097–1248):
* Clicking `#btn-rep-original` sets `state.activeRepresentationMode = 'original'`. The canvas renders the immutable chapter text via `renderCanonicalBlocks(state.activeChapter)`.
* Clicking `#btn-rep-summary` sets `state.activeRepresentationMode = 'summary'`. The canvas renders the synthesized summary representation from `state.activeRepresentation`.
* In Research Collection mode, the reader toggles between the synthesized multi-source editorial chapters (`#panel-editorial-reading`) and original book sources (`#panel-collection-sources`).

---

## TASK 3: DETAILED COMPONENT-BY-COMPONENT AUDIT

### SECTION A: Ingestion Pipeline
* **Flow:** Uploaded File / Raw Text $\rightarrow$ `bookRoutes.js (/import)` $\rightarrow$ `bookService.importBook()` $\rightarrow$ `ingestionService.ingest()` $\rightarrow$ Format Parser $\rightarrow$ `chapterDetector.detectChapters()` $\rightarrow$ Canonical Block Normalization $\rightarrow$ Batch Chapter Creation $\rightarrow$ `semanticLifecycle.indexBook()`.
* **Parsers:**
  * `backend/services/ingestion/parsers/textParser.js`
  * `backend/services/ingestion/parsers/markdownParser.js`
  * `backend/services/ingestion/parsers/htmlParser.js`
  * `backend/services/ingestion/parsers/epubParser.js`
  * `backend/services/ingestion/parsers/pdfParser.js`
* **Integrity Guard:** Documents with empty text trigger `integrity_status = 'empty_content'` with descriptive warnings, bypassing indexing and alerting the UI without crashing.

### SECTION B: Canonical Source Representation
* **Data Structures:** Canonical blocks are typed objects (`paragraph`, `heading`, `quote`, `list`, `code`, `separator`, `callout`).
* **Immutability:** Source content is stored in `chapters.content` and `chapters.canonical_content`. No downstream process modifies these columns.

### SECTION C: Structural Analysis & Chunking
* **Chapter Detection (`chapterDetector.js`):** Multi-pass heuristic detects ATX headers, roman numerals, "Chapter N", structural prefixes (Prologue, Epilogue), and splits raw text into chapter objects.
* **Semantic Chunker (`semanticChunker.js`):** Slices text into units of 350–500 words, breaking cleanly on paragraph/sentence boundaries without splitting words or mid-sentence clauses.

### SECTION D: Semantic Index & Retrieval
* **Vector Index (`semanticIndex.js`):** SQLite table `semantic_chunks` stores 64-dimensional hash embeddings.
* **Retrieval Service (`retrievalService.js`):** Computes cosine similarity, applies keyword match boosts, re-ranks with diversity constraints, and supports cross-book searching (`bookIds` array).
* **Context Builder (`contextBuilder.js`):** Builds token-budgeted prompt payloads with exact source provenance markers.

### SECTION E: Editorial Organization & Planning
* **Section Filter (`sectionFilter.js`):** Strips low-information boilerplate (navigation, table of contents, author bios, bibliographies, degree committees, <50 word fragments).
* **Redundancy Detector (`redundancyDetector.js`):** Identifies overlapping concepts across sources using a 13-concept taxonomy (e.g., `overview_foundations`, `narrative_plot`, `cast_characters`, `production_development`, `critical_reception`).
* **Editorial Planner (`editorialPlanner.js`):** Uses an LLM or deterministic clustering fallback to assemble an `EditorialPlan` object with chapters, narrative arc, and source section references.

### SECTION F: Synthesis & Grounded Generation
* **Synthesis Service (`synthesisService.js`):** Fetches chunks mapped to each outline chapter, formats them via `contextBuilder`, generates comprehensive narrative chapters via `aiService`, parses the output into canonical blocks, and saves the result to `chapter_representations`.
* **Output Isolation:** Synthesized chapters reside exclusively in `chapter_representations` with `type = 'EDITORIAL_SYNTHESIS'`.

### SECTION G: Reader Experience & Two Coexisting Representations
* **Original Reading Mode:** Displays original source chapters with typography adjustments, chapter navigation, word counts, and estimated reading time.
* **Smart Reading Mode:** Displays synthesized summaries or editorial multi-book chapters, complete with provenance tags, section count badges, and source section traceability drawers.

---

## TASK 4: ARCHITECTURAL GAP ANALYSIS & RECOMMENDATIONS

### What Is Working and Implemented Cleanly
1. **Source Immutability:** Clear separation between `chapters` and `chapter_representations` guarantees original text is never overwritten.
2. **Deterministic Fallbacks:** The system functions without error even when external AI services (Gemini/Ollama) are offline.
3. **Structured Provenance:** Chunks, outlines, and synthesized chapters maintain bidirectional traceability back to the source books.
4. **Canonical Block Rendering:** The frontend safely converts markdown and structured blocks into semantic HTML without leaking raw markdown formatting.

### Architectural Gaps Identified
1. **Local Embedding Dimensionality:** The 64-dimensional feature hash embedding in `semanticIndex.js` is fast and zero-dependency, but has lower semantic nuance compared to state-of-the-art dense embedding models (e.g., `text-embedding-004`).
2. **Section Hierarchy Storage:** Sub-sections within a chapter are currently stored as heading blocks inside `chapters.canonical_content` rather than as discrete relational entities in a `sections` table. While `semantic_chunks` captures them at index time, a dedicated `sections` table would allow more direct SQL-level queries.
3. **Multi-Source Collection Entity:** Currently, multi-source research outlines use `source_book_ids` in `editorial_outlines`, but there is no distinct `collections` table to group books and metadata independently of outlines.

### Next Steps (For Future Implementation Phases)
* Introduce an optional cloud/local dense embedding plug-in when higher retrieval precision is requested.
* Add a dedicated `collections` table in SQLite to formalize multi-book research workspaces.
* Maintain current read-only constraints and schema integrity.

---
*Report compiled and verified against current codebase. No files were modified.*
