# Smart Reader 📖

Smart Reader is an intelligent personal digital library and research workstation for novels, textbooks, academic papers, documentation, web articles, and multi-source research dossiers.

Rather than an ephemeral AI summarizer, Smart Reader functions as an authentic digital archive that preserves the inviolability of original source texts while layering intelligent representations: structural chapter breakdowns, canonical block rendering, editorial synopses, grounded summaries, contextual question answering, and vector-grounded semantic memory.

---

## 🏛️ System Architecture & Core Principles

### 1. Inviolability of Original Content
Original texts, uploaded files, and acquired web sources are stored immutably. AI models never overwrite or mutate source documents. All AI-generated outputs are saved in dedicated representation and semantic chunk schemas linked to chapters or books.

### 2. Canonical Document Pipeline (Build 1.5 – 3B.1.5)
Raw inputs (PDF, EPUB, TXT, Markdown, Web URLs) pass through an ingestion and normalization pipeline (`backend/services/ingestion/`):
- **Format Analyzers:** Magic byte signature inspection and structural parsers for PDF (`pdfjs-dist` — layout-aware, font-size heuristics), EPUB (`adm-zip`), Markdown, Plaintext, and Web (`cheerio`).
- **Document Structure Intelligence:** 
  - **TOC & Chapter Anchoring:** Distinguishes genuine chapters from hierarchical subheadings (`1.1`, `1.2`, `Section 2.1`), keeping subheadings organized as sections within their parent chapter.
  - **Running Header & Footer Suppression:** Filters page numbers, running headers, and peripheral publisher boilerplate across PDF and web pages.
  - **Page Provenance:** Preserves `sourcePage` provenance across all canonical blocks.
  - **Integrity Guardrails:** Automatically detects image-only/scanned PDFs without OCR or empty web pages, assigning `integrity_status: 'empty_content'` with clear editorial warning notices.
- **Canonical Block Representation:** Standardizes heterogeneous text into structured JSON blocks (`heading`, `paragraph`, `quote`, `list`, `table`, `separator`, `code`).

### 3. Web Discovery & Research Acquisition (Build 3A)
- **Ethical Web Acquisition:** Extracts clean article content, author credits, and metadata while stripping ads, navigational chrome, and tracking scripts.
- **Provenance Tracking:** Records source URL, domain site name, retrieval timestamps, and content hashes.
- **Supporting Materials:** Allows users to attach supplementary reference articles, documentation, or background research to any book without modifying the original work.
- **Multi-Source Research Dossiers:** Ingests and synthesizes multiple web sources into a single structured research dossier with clear source attribution.

### 4. Semantic Memory & Context-Grounded AI (Build 3B & 3B.1.5)
- **Structural Preprocessing & Semantic Chunking:** Segments documents into coherent semantic units with heading context, hierarchical pathing, and content hashing.
- **Dual Embedding Engine:**
  - **Local Deterministic Embeddings:** Fast, private, offline TF-IDF/BM25 hashed vector representation for zero-dependency operation.
  - **Cloud Embeddings:** High-dimensional vector embeddings with Google Gemini (`text-embedding-004`), with automatic fallback to local embeddings on quota exhaustion.
- **Retrieval & Context Building:** Cosine-similarity vector search with diversity reranking and content-type adapted grounding prompts.
- **Non-Blocking Semantic Lifecycle:** Automatic background indexing upon document ingestion ensures uploads and library browsing remain responsive and non-blocking.
- **Grounded Editorial Synthesis:**
  - **Book Synopses:** High-level narrative arcs, central arguments, and structural overviews.
  - **Comprehensive Summaries:** Detailed chapter-by-chapter and section syntheses grounded in semantic memory.
  - **Contextual In-Book Q&A:** Answers user queries with direct chunk citations and section references.

### 5. Resilient Client-Server Communication (Build 3B.1.5)
- **Unified Resilient API Client:** Frontend communication enforces JSON negotiation with explicit diagnostics for server startup/proxy states (502/503/504), preventing unexpected HTML response parse errors.
- **Strict API Error Boundaries:** Server-side Express routing guarantees structured JSON errors for all unhandled `/api` routes and Multer file upload boundaries (up to 50MB).

---

## 🎨 Editorial Reading Experience

- **Canvas Themes:** Light Paper (`theme-light`), Warm Sepia (`theme-warm`), and Night Slate (`theme-dark`).
- **Typography Modes:** Classic Editorial Serif (Lora / Cinzel) and Neo Sans (Plus Jakarta Sans).
- **Dynamic Reading Toolbar:** Font size scaling, line height adjustment, column width constraints (65–75ch), and reading progress tracking.
- **CSS-Generated Editorial Book Covers:** Authentic book spine lighting, archetype-specific color palettes (`novel`, `textbook`, `research`, `manga`, `web_article`).

---

## 🚀 Quick Start

### Installation & Run

```bash
# Install dependencies
npm install

# Start the application server (runs on port 3000)
npm run dev

# (Optional) Reset and seed sample library
npm run db:reset
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🏗️ Recent Builds

- **v0.3b.1.9** — Document Structure Engine frozen. `pdfjs-dist` parser handles CRC Press and IEEE (SWEBOK v4) formats. 8 and 18 chapters detected respectively with font-size layout awareness and multi-line title reconstruction.
- **v0.4.3** — Reading Segment Builder. Source chapters split into 1200–2400 word semantic segments. Depth-first flatten of hierarchical `chapter.sections`. 10/10 tests, 0.00% text drift.
- **Next: Build 4.4** — Reader Modes UI (Original / Smart toggle).

---

## 📡 API Reference

### Books & Library
- `GET /api/books`: Retrieve all books with chapter counts, reading progress, and integrity statuses.
- `GET /api/books/:id`: Get detailed book metadata, page counts, and provenance.
- `POST /api/books`: Create a new book record.
- `POST /api/books/import`: Ingest a book or document from file (PDF, EPUB, TXT, MD) or pasted text.
- `DELETE /api/books/:id`: Delete a book with cascading deletion of chapters, representations, and semantic chunks.

### Chapters & Content
- `GET /api/books/:id/chapters`: List all chapters and sections for a book.
- `GET /api/chapters/:id`: Get chapter content, canonical blocks, and generated representations.
- `POST /api/books/:id/chapters`: Add a chapter manually.
- `PUT /api/chapters/:id`: Update chapter reading status, progress, or title.
- `POST /api/chapters/:id/summarize`: Generate an AI chapter summary.

### Web Intelligence & Research (Build 3A)
- `GET /api/web/search`: Query search engines and curated open archives.
- `POST /api/web/preview`: Cleanly extract web page metadata and readability content before importing.
- `POST /api/web/import`: Ingest a web article directly into the library as a structured book.
- `POST /api/web/import-multi`: Ingest multiple URLs into a combined, structured research dossier.
- `GET /api/books/:id/supporting`: Retrieve supporting research materials attached to a book.
- `POST /api/books/:id/supporting`: Attach a web reference or article as supporting material.
- `DELETE /api/web/supporting/:id`: Remove an attached supporting material reference.

### Semantic Memory & Intelligence (Build 3B)
- `POST /api/semantic/index/:bookId`: Trigger semantic chunking and vector indexing.
- `GET /api/semantic/status/:bookId`: Get indexing status and semantic chunk count.
- `POST /api/semantic/query`: Vector similarity search across a book or the entire library.
- `GET /api/books/:id/synopsis`: Retrieve or view the editorial synopsis for a book.
- `POST /api/books/:id/synopsis`: Generate a grounded editorial synopsis.
- `GET /api/books/:id/summary`: Retrieve comprehensive book-level summary.
- `POST /api/books/:id/summarize`: Generate a grounded book summary across chapters.
- `POST /api/books/:id/ask`: Ask a grounded question against a book's semantic memory.

### System & AI Health
- `GET /api/ai/status`: Health check for local Ollama and cloud Gemini AI providers.
- `POST /api/ai/provider`: Switch active AI provider (`gemini` or `ollama`).
- `GET /api/jobs`: List status of background ingestion and summarization jobs.
- `POST /api/dev/reset`: Reset and seed database with curated sample books, articles, and representations.

---

## ⚙️ Configuration & Environment

Environment variables are configured in `.env` (refer to `.env.example`):

```env
PORT=3000
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key_here
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3
```

---

## 🧪 Testing

The repository includes targeted verification suites across all architectural milestones:

```bash
# Run all 11 regression suites (stops on first failure)
npm test

# Or run individual suites:
node backend/tests/build3a_test.js                        # Web intelligence (Build 3A)
node backend/tests/build3b_test.js                        # Semantic memory (Build 3B)
node backend/tests/build3b_finalization_test.js           # Finalization (Build 3B)
node backend/tests/build3b_hardening_test.js              # Ingestion hardening (Build 3B.1.5)
node backend/tests/build3b16_structure_test.js            # Document structure (Build 3B.1.6)
node backend/tests/build3b17_real_pdf_test.js             # Real PDF regression (Build 3B.1.7)
node backend/tests/build3b19_pdfjs_parser_test.js         # pdfjs-dist parser (Build 3B.1.9)
node backend/tests/build4_1_editorial_intelligence_test.js  # Editorial intelligence (Build 4.1)
node backend/tests/build4_2a_planner_test.js              # Book planner (Build 4.2a)
node backend/tests/build4_2bc_single_book_test.js         # Single-book pipeline (Build 4.2bc)
node backend/tests/build4_editorial_synthesis_test.js     # Editorial synthesis (Build 4)
```

### Multi-Source Dossier Aggregation & Semantic Lifecycle
- **Word Count Aggregation**: Multi-source dossiers aggregate individual chapter word counts dynamically via SQLite (`SUM(c.word_count)`) and pipeline responses (`totalWordCount`), accurately reflecting multi-source research volumes.
- **Synchronized Semantic Indexing**: Web acquisition pipelines await `semanticLifecycle.indexBook()` upon completion, ensuring vector embeddings (256d) and chunk counts are immediately available upon acquisition.
- **Status Alignment**: Semantic status endpoints report both `chunkCount` and `totalChunks` to guarantee immediate UI status badge synchronization.
