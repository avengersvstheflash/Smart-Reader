# Smart Reader 📖
# Smart Reader

Smart Reader is an intelligent personal digital library and research workstation for novels, textbooks, academic papers, documentation, web articles, and multi-source research dossiers.
> A local-first AI reading library. Ingests your own books — PDFs,
> EPUBs, web pages, pasted text — and produces a navigable, compressed
> *Smart Reading* layer over each one. Every compressed line traces
> back to the source passage it was derived from.

Rather than an ephemeral AI summarizer, Smart Reader functions as an authentic digital archive that preserves the inviolability of original source texts while layering intelligent representations: structural chapter breakdowns, canonical block rendering, editorial synopses, grounded summaries, contextual question answering, and vector-grounded semantic memory.
**Repo:** https://github.com/avengersvstheflash/Smart-Reader
**Status:** Active development — pre-release
**License:** [see LICENSE](./LICENSE)
**Current version:** `v0.4.5`

---

## 🏛️ System Architecture & Core Principles
## What this is

### 1. Inviolability of Original Content
Original texts, uploaded files, and acquired web sources are stored immutably. AI models never overwrite or mutate source documents. All AI-generated outputs are saved in dedicated representation and semantic chunk schemas linked to chapters or books.
Smart Reader is a **reading platform**, not a summary app. The
distinction is the whole product:

### 2. Canonical Document Pipeline (Build 1.5 – 3B.1.5)
Raw inputs (PDF, EPUB, TXT, Markdown, Web URLs) pass through an ingestion and normalization pipeline (`backend/services/ingestion/`):
- **Format Analyzers:** Magic byte signature inspection and structural parsers for PDF (`pdfjs-dist` — layout-aware, font-size heuristics), EPUB (`adm-zip`), Markdown, Plaintext, and Web (`cheerio`).
- **Document Structure Intelligence:** 
  - **TOC & Chapter Anchoring:** Distinguishes genuine chapters from hierarchical subheadings (`1.1`, `1.2`, `Section 2.1`), keeping subheadings organized as sections within their parent chapter.
  - **Running Header & Footer Suppression:** Filters page numbers, running headers, and peripheral publisher boilerplate across PDF and web pages.
  - **Page Provenance:** Preserves `sourcePage` provenance across all canonical blocks.
  - **Integrity Guardrails:** Automatically detects image-only/scanned PDFs without OCR or empty web pages, assigning `integrity_status: 'empty_content'` with clear editorial warning notices.
- **Canonical Block Representation:** Standardizes heterogeneous text into structured JSON blocks (`heading`, `paragraph`, `quote`, `list`, `table`, `separator`, `code`).
- **Original Reading** is immutable. It is the source text exactly as
  you uploaded it. Nothing in the app ever modifies it.
- **Smart Reading** is a derived lens. It is a compressed
  representation of the source — 250–360 words per ~1,500–2,500-word
  source unit — with every sentence traceable to the specific source
  chunks it draws from.

### 3. Web Discovery & Research Acquisition (Build 3A)
- **Ethical Web Acquisition:** Extracts clean article content, author credits, and metadata while stripping ads, navigational chrome, and tracking scripts.
- **Provenance Tracking:** Records source URL, domain site name, retrieval timestamps, and content hashes.
- **Supporting Materials:** Allows users to attach supplementary reference articles, documentation, or background research to any book without modifying the original work.
- **Multi-Source Research Dossiers:** Ingests and synthesizes multiple web sources into a single structured research dossier with clear source attribution.
This is the **two-representation invariant**:

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
```
ORIGINAL READING  →  immutable source, never touched
SMART READING     →  derived lens, fully traceable back to source
```

### 5. Resilient Client-Server Communication (Build 3B.1.5)
- **Unified Resilient API Client:** Frontend communication enforces JSON negotiation with explicit diagnostics for server startup/proxy states (502/503/504), preventing unexpected HTML response parse errors.
- **Strict API Error Boundaries:** Server-side Express routing guarantees structured JSON errors for all unhandled `/api` routes and Multer file upload boundaries (up to 50MB).
Every feature serves it. The toggle, the two-pane reader, the
provenance chain, the fallback markers, the synopsis panel — all of it
exists to keep the relationship between source and lens visible and
honest.

---
## Why compression, not summarization

## 🎨 Editorial Reading Experience
A summarizer asks *"what is the gist?"* and produces output
proportional to input. A compressor asks *"what would this say if every
sentence carried 5–8× its information?"* and preserves every distinct
concept, argument, and factual claim.

- **Canvas Themes:** Light Paper (`theme-light`), Warm Sepia (`theme-warm`), and Night Slate (`theme-dark`).
- **Typography Modes:** Classic Editorial Serif (Lora / Cinzel) and Neo Sans (Plus Jakarta Sans).
- **Dynamic Reading Toolbar:** Font size scaling, line height adjustment, column width constraints (65–75ch), and reading progress tracking.
- **CSS-Generated Editorial Book Covers:** Authentic book spine lighting, archetype-specific color palettes (`novel`, `textbook`, `research`, `manga`, `web_article`).
Smart Reader compresses. The compression ratio is the fundamental
quality metric:

---
| Metric | Value |
|---|---|
| Source unit | 1,500–2,500 words |
| Smart Chapter output | 250–360 words (hard bounds 180–450) |
| Target compression ratio | ~7:1 |

## 🚀 Quick Start
See [`docs/PRODUCT_VISION.md`](./docs/PRODUCT_VISION.md) §"Compression,
not summarization" for the full distinction.

### Installation & Run
## What ships today

### Backend
- **Ingestion** — PDF (pdfjs-dist with layout heuristics), EPUB, HTML,
  Markdown, plain text, and web URLs (cheerio with chrome stripping)
- **Structural analysis** — chapter detection, front/back matter
  classification, multi-signal heading recognition, header/footer
  suppression
- **Semantic indexing** — 350–500 word chunks, BGE-M3 1024d embeddings
  (local, INT8 quantized, multilingual 170+ languages)
- **Retrieval** — hybrid cross-source search (vector similarity +
  keyword scoring + diversity re-rank)
- **Editorial planning** — outline generations via LLM or deterministic
  clustering fallback
- **Compression** — grounded Smart Chapter synthesis via OpenRouter →
  DeepSeek V4 Flash with reasoning disabled and hard word bounds
- **Synopsis** — generated from preface + TOC + strategic samples
  (chapter 1 first paragraph, last chapter first paragraph), before
  chapter compression
- **Fallback honesty** — every deterministic-fallback representation
  carries `fell_back: true` metadata; the UI renders an honest caption

### Frontend
- **Library** — responsive book grid with search, content-type filters,
  and a "Smart" badge on books with editorial content
- **Book Details** — hero, synopsis panel, chapter list with roving
  tabindex, semantic intelligence panel with live chunk count
- **Reader** — dual-mode Original/Smart with automatic Smart default
  when a representation exists
- **Canonical block renderer** — recursive rendering of headings,
  paragraphs, quotes, lists, code, tables, callouts, separators
- **Import route** — file upload with real XHR progress, job-driven
  pipeline stepper (INGEST → SEMANTIC_INDEX → SYNOPSIS → BOOK_SUMMARY)
- **Design system** — four themes (default / warm / dark / glass), full
  Tailwind token set, WCAG AA baseline

### Infrastructure
- **Node 22** pinned via `.nvmrc`
- **SQLite** via better-sqlite3, WAL mode, cascading foreign keys
- **Test suite** — 13 regression suites, real fixtures, ~2 minute
  runtime
- **Local-first** — no cloud calls except configured AI providers;
  BGE-M3 runs entirely on-device

## Architecture

```
User Material  →  Extraction  →  Parsing  →  Canonical Source
                →  Structural Analysis  →  Semantic Chunking
                →  Semantic Index  →  Editorial Organizer
                →  Editorial Chapter Plan  →  Compression
                →  Grounded Reader-Facing Content
```

Full architecture documentation:

- [`docs/ARCHITECTURE_AUDIT.md`](./docs/ARCHITECTURE_AUDIT.md) —
  25 Q&A walkthrough
- [`docs/FRONTEND_ARCHITECTURE.md`](./docs/FRONTEND_ARCHITECTURE.md) —
  component tree, state map
- [`docs/FRONTEND_BLUEPRINT.md`](./docs/FRONTEND_BLUEPRINT.md) —
  design narrative
- [`docs/FRONTEND_BLUEPRINT_SPEC.md`](./docs/FRONTEND_BLUEPRINT_SPEC.md) —
  engineering contract
- [`docs/CANONICAL_TEST_BOOK.md`](./docs/CANONICAL_TEST_BOOK.md) —
  canonical verification fixture
- [`docs/PRODUCT_VISION.md`](./docs/PRODUCT_VISION.md) — north star

## Getting started

### Prerequisites
- Node.js 22 LTS (see `.nvmrc`)
- ~1 GB free disk space (BGE-M3 model downloads on first run)
- Optional: OpenRouter API key for real AI compression
- Optional: Ollama running locally for offline AI inference

### Install

```bash
# Install dependencies
git clone https://github.com/avengersvstheflash/Smart-Reader.git
cd Smart-Reader
nvm use            # or manually install Node 22
npm install
cp .env.example .env
# edit .env with your API keys
```

# Start the application server (runs on port 3000)
### Run

```bash
# Backend (port 3000)
node backend/server.js

# Frontend (port 5173, in a second terminal)
cd frontend
npm run dev
```

# (Optional) Reset and seed sample library
npm run db:reset
Open `http://localhost:5173/` and import a book.

### Test

```bash
npm test           # 13 regression suites, ~2 minutes
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.
## Roadmap

---
Active development phases (full roadmap in
[`docs/ROADMAP_2026-09.md`](./docs/ROADMAP_2026-09.md)):

## 🏗️ Recent Builds
- **Phase 0** ✅ — BGE-M3 embedding upgrade
- **Phase 1–3** ✅ — React migration: Library, Reader, Book Details
- **Phase 3.5** ✅ — Modal system, progressive Smart generation
- **Phase 4** ✅ — Editorial-to-source namespace fix, synopsis-first
  sequencing, import pipeline, fallback honesty
- **Phase 4.5** ✅ — Reading UX refinements
- **Phase 4.8** ✅ — Compression enforcement (word count bounds)
- **Phase 4.8.1** ✅ — Compressor prompt + input sizing +
  reasoning-aware token budget
- **Phase 4.8.2** ✅ — Front matter filter for editorial candidates
- **Phase 4.9** ✅ — Synopsis fallback honesty
- **Phase 4.13** ⏳ — Synopsis + book summary prompt rewrite
- **Phase 4.13** ✅ — Synopsis + book summary prompt rewrite
- **Phase 4.10** ⏳ — Auto-classification on import (contentType, tags,
  reading level)
- **Phase 4.6** ⏳ — Web + Paste import tabs
- **Phase 4.7** ⏳ — Cinematic import experience
- **Phase 4.12** ⏳ — Compressor terminology refactor
- **Phase 5** ⏳ — Inline source tracker (the moat made interactive)
- **Phase 6** ⏳ — Tauri packaging (native desktop app)
- **Build 5** ⏳ — Audio mode (local Kokoro-82M TTS)
- **Build 6** ⏳ — Discussion mode (local Ollama multi-agent)
- **Build 7** ⏳ — Story mode (narrative + image pipeline)

- **v0.3b.1.9** — Document Structure Engine frozen. `pdfjs-dist` parser handles CRC Press and IEEE (SWEBOK v4) formats. 8 and 18 chapters detected respectively with font-size layout awareness and multi-line title reconstruction.
- **v0.4.3** — Reading Segment Builder. Source chapters split into 1200–2400 word semantic segments. Depth-first flatten of hierarchical `chapter.sections`. 10/10 tests, 0.00% text drift.
- **Next: Build 4.4** — Reader Modes UI (Original / Smart toggle).
## Design philosophy

---
Three laws. Every feature serves them:

## 📡 API Reference
1. **Source is paper.** Original reading renders on calm neutral paper
   with zero accent chrome. It looks like a book because it *is* the
   book.

### Books & Library
- `GET /api/books`: Retrieve all books with chapter counts, reading progress, and integrity statuses.
- `GET /api/books/:id`: Get detailed book metadata, page counts, and provenance.
- `POST /api/books`: Create a new book record.
- `POST /api/books/import`: Ingest a book or document from file (PDF, EPUB, TXT, MD) or pasted text.
- `DELETE /api/books/:id`: Delete a book with cascading deletion of chapters, representations, and semantic chunks.
2. **The lens is tinted.** Smart reading carries a quiet accent
   identity. You know which representation you're in without reading a
   word.

### Chapters & Content
- `GET /api/books/:id/chapters`: List all chapters and sections for a book.
- `GET /api/chapters/:id`: Get chapter content, canonical blocks, and generated representations.
- `POST /api/books/:id/chapters`: Add a chapter manually.
- `PUT /api/chapters/:id`: Update chapter reading status, progress, or title.
- `POST /api/chapters/:id/summarize`: Generate an AI chapter summary.
3. **Derivation never masquerades as source.** Smart text is never
   rendered without a provenance affordance. Copy never calls derived
   text "the book."

### Web Intelligence & Research (Build 3A)
- `GET /api/web/search`: Query search engines and curated open archives.
- `POST /api/web/preview`: Cleanly extract web page metadata and readability content before importing.
- `POST /api/web/import`: Ingest a web article directly into the library as a structured book.
- `POST /api/web/import-multi`: Ingest multiple URLs into a combined, structured research dossier.
- `GET /api/books/:id/supporting`: Retrieve supporting research materials attached to a book.
- `POST /api/books/:id/supporting`: Attach a web reference or article as supporting material.
- `DELETE /api/web/supporting/:id`: Remove an attached supporting material reference.
### The market this is for

### Semantic Memory & Intelligence (Build 3B)
- `POST /api/semantic/index/:bookId`: Trigger semantic chunking and vector indexing.
- `GET /api/semantic/status/:bookId`: Get indexing status and semantic chunk count.
- `POST /api/semantic/query`: Vector similarity search across a book or the entire library.
- `GET /api/books/:id/synopsis`: Retrieve or view the editorial synopsis for a book.
- `POST /api/books/:id/synopsis`: Generate a grounded editorial synopsis.
- `GET /api/books/:id/summary`: Retrieve comprehensive book-level summary.
- `POST /api/books/:id/summarize`: Generate a grounded book summary across chapters.
- `POST /api/books/:id/ask`: Ask a grounded question against a book's semantic memory.
Not San Francisco. Readers in **Japan** and the **Nordics** first —
high reading culture, privacy-first by law, willing to pay for quality
tools. Germany and France second. The pitch that sells there:

### System & AI Health
- `GET /api/ai/status`: Health check for local Ollama and cloud Gemini AI providers.
- `POST /api/ai/provider`: Switch active AI provider (`gemini` or `ollama`).
- `GET /api/jobs`: List status of background ingestion and summarization jobs.
- `POST /api/dev/reset`: Reset and seed database with curated sample books, articles, and representations.
> *"Your personal library, understood by local AI, with every
> compressed view traceable back to the source. You own the content.
> You own the AI. You own the outputs."*

---
Sells in Tokyo, Berlin, Amsterdam, Stockholm. Doesn't sell in SF —
they don't care about local-first.

## ⚙️ Configuration & Environment
## Contributing

Environment variables are configured in `.env` (refer to `.env.example`):
This project is under active solo development. Issues and discussion
are welcome via the GitHub issue tracker.

```env
PORT=3000
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key_here
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3
```
Commit conventions:

---
- `feat(scope): <description>` — new capability
- `fix(scope): <description>` — bug fix
- `docs: <description>` — documentation only
- `chore: <description>` — build, deps, tooling
- `phase<N>.<M>: <description>` — roadmap phase work

## 🧪 Testing
Test suite must stay green (`npm test` → 13/13) through every commit.

The repository includes targeted verification suites across all architectural milestones:
## Acknowledgements

```bash
# Run all 11 regression suites (stops on first failure)
npm test
Built with:

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
- [pdfjs-dist](https://github.com/mozilla/pdf.js) — PDF parsing
- [@huggingface/transformers](https://github.com/huggingface/transformers.js) —
  local inference
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — SQLite
- [React](https://react.dev/) + [Vite](https://vitejs.dev/) +
  [Tailwind CSS](https://tailwindcss.com/)
- [OpenRouter](https://openrouter.ai/) — cloud LLM gateway
- [DeepSeek](https://deepseek.com/) — V4 Flash for chapter compression

### Multi-Source Dossier Aggregation & Semantic Lifecycle
- **Word Count Aggregation**: Multi-source dossiers aggregate individual chapter word counts dynamically via SQLite (`SUM(c.word_count)`) and pipeline responses (`totalWordCount`), accurately reflecting multi-source research volumes.
- **Synchronized Semantic Indexing**: Web acquisition pipelines await `semanticLifecycle.indexBook()` upon completion, ensuring vector embeddings (256d) and chunk counts are immediately available upon acquisition.
- **Status Alignment**: Semantic status endpoints report both `chunkCount` and `totalChunks` to guarantee immediate UI status badge synchronization.
Canonical test book: *Practical Machine Learning: A Beginner's Guide
with Ethical Insights* by Nyamawe et al. (CRC Press, 2025,
CC-BY-NC-ND 4.0).

---

*Smart Reader is a compression engine, not a summarization engine.
Every line traces home.*
