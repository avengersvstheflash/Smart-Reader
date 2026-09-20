# Smart Reader

> A local-first neural reading library. Ingests heterogeneous source material — PDFs, EPUBs, web articles, raw text — and generates a navigable, compressed *Smart Reading* layer with deterministic source-passage provenance.

**Repository:** https://github.com/avengersvstheflash/Smart-Reader  
**Status:** Active development — Pre-release  
**License:** [MIT / LICENSE](./LICENSE)  
**Current Version:** `v0.4.5`  

---

## Overview & Core Thesis

Smart Reader is a **reading and comprehension platform**, not a lossy summarization utility. 

Traditional summarization treats input as disposable text to be condensed into a shallow gist. Smart Reader implements **loss-bounded semantic compression**: preserving concepts, structural hierarchy, and specific factual claims while achieving an average **7:1 compression ratio**.

Every generated insight remains anchored to the original document via the **Two-Representation Invariant**:

```
┌─────────────────────────┐         Deterministic Mapping         ┌─────────────────────────┐
│    ORIGINAL READING     │ ────────────────────────────────────> │      SMART READING      │
│ (Immutable Source Text) │ <──────────────────────────────────── │ (Derived Semantic Lens) │
└─────────────────────────┘          Passage Provenance           └─────────────────────────┘
```

- **Original Reading (Paper):** The source text remains immutable, rendered in clean typography with zero accent chrome.
- **Smart Reading (Lens):** A derived, high-density representation (250–360 words per 1,500–2,500-word source block) where every synthesized assertion links back to its exact origin chunks.

---

## Architectural Compression Bounds

The fundamental quality benchmark of Smart Reader is conceptual retention across bounded token budgets:

| Metric | Target Specification | Enforcement Mechanism |
|---|---|---|
| **Source Processing Unit** | 1,500–2,500 words | Semantic paragraph chunking |
| **Smart Chapter Output** | 250–360 words | Hard bounding (180 min / 450 max) |
| **Target Compression Ratio** | ~7:1 | Grounded token-budgeted synthesis |
| **Embedding Dimension** | 1024d | BGE-M3 Multilingual INT8 |
| **Provenance Resolution** | Passage / Block level | Bidirectional chunk UUID index |

*For formal definitions and architectural trade-offs, see [`docs/PRODUCT_VISION.md`](./docs/PRODUCT_VISION.md).*

---

## Feature Matrix

### Ingestion & Document Intelligence
- **Multi-Format Extraction:** Native parsing for PDF (`pdfjs-dist` with custom layout heuristics), EPUB, Markdown, raw UTF-8 text, and remote web articles (`cheerio` DOM sanitization).
- **Structural Analysis:** Heuristic chapter detection, front/back matter classification, multi-signal heading recognition, and running header/footer suppression.
- **Local Semantic Indexing:** 350–500 word chunking embedded locally via **BGE-M3 (1024-dimensional, INT8 quantized)** across 170+ languages without external API roundtrips.
- **Hybrid Retrieval:** Cross-source rank fusion combining dense vector cosine similarity, keyword BM25 scoring, and maximal marginal relevance (MMR) diversity re-ranking.

### Editorial & Synthesis Engine
- **Outline & Editorial Planning:** Chapter grouping driven by hierarchical LLM planning with a deterministic graph-clustering fallback.
- **Bounded Neural Compression:** Synthesis routed via OpenRouter (DeepSeek V4 Flash / local Ollama models) with reasoning-aware prompt budgeting to prevent hallucinated narrative creep.
- **Progressive Synopsis Pipeline:** Pre-synthesizes book-level structural overviews from prefaces, tables of contents, and strategic boundary passages prior to chapter-level compression.
- **Fallback Transparency:** Any representation produced by heuristic or deterministic fallback pipelines carries immutable `fell_back: true` metadata, visibly reflected in the reader UI.

### Frontend Reader Experience
- **Dual-Pane Adaptive Reader:** Simultaneous or toggled inspection between Original and Smart representations with synchronized roving scroll.
- **Canonical Block Renderer:** Strict recursive parser handling standard headings, blockquotes, code blocks, tables, callouts, and semantic segment dividers.
- **Reactive Library Interface:** Virtualized book catalog with content-type classification badges, real-time chunk metrics, and pipeline stepper progress (INGEST → SEMANTIC_INDEX → SYNOPSIS → CHAPTER_SYNTHESIS).
- **Accessible Design System:** WCAG AA compliant typography across four calibrated themes (`default`, `warm`, `dark`, `glass`).

---

## System Architecture

```
User Document (PDF / EPUB / URL)
  │
  ├──> [Ingestion & Normalization Engine]
  │      └── Strips headers/footers, extracts clean canonical blocks
  │
  ├──> [Structural Analysis & Chunker]
  │      └── Front-matter detection, 350-500w chunk boundary segmentation
  │
  ├──> [Vector Indexing Subsystem]
  │      └── Local BGE-M3 INT8 Embeddings (1024d) -> SQLite vector store
  │
  ├──> [Editorial Organizer]
  │      └── Hierarchical chapter planning & synopsis synthesis
  │
  └──> [Bounded Neural Compressor]
         └── Strict word bounds (250-360w) with deterministic chunk citations
```

Detailed technical documentation:
- [`docs/ARCHITECTURE_AUDIT.md`](./docs/ARCHITECTURE_AUDIT.md) — 25 architectural questions & system designs
- [`docs/FRONTEND_ARCHITECTURE.md`](./docs/FRONTEND_ARCHITECTURE.md) — State machine and component graph
- [`docs/FRONTEND_BLUEPRINT_SPEC.md`](./docs/FRONTEND_BLUEPRINT_SPEC.md) — Frontend engineering contracts
- [`docs/CANONICAL_TEST_BOOK.md`](./docs/CANONICAL_TEST_BOOK.md) — Standardized benchmarking dataset

---

## Technology Stack

- **Runtime Environment:** Node.js 22 LTS (pinned via `.nvmrc`)
- **Persistence Layer:** SQLite via `better-sqlite3` (WAL mode enabled, cascading foreign keys, strict transactions)
- **Local Inference:** `@huggingface/transformers` (local quantized BGE-M3 ONNX pipeline)
- **Frontend Architecture:** React 18, Vite, Tailwind CSS, Lucide Icons
- **AI Gateway:** OpenRouter / DeepSeek API (cloud) or Ollama (fully offline inference)
- **Testing:** Native Node test runner with 13 comprehensive integration suites

---

## Getting Started

### Prerequisites
- **Node.js:** `v22.x` (managed via `nvm use`)
- **Disk Space:** ~1.2 GB (for local INT8 BGE-M3 weights on initial download)
- **Inference Provider:** OpenRouter API key (optional, for cloud synthesis) or Ollama running locally

### Installation

```bash
# Clone the repository
git clone [https://github.com/avengersvstheflash/Smart-Reader.git](https://github.com/avengersvstheflash/Smart-Reader.git)
cd Smart-Reader

# Pin Node version and install dependencies
nvm use
npm install

# Configure environment variables
cp .env.example .env
# Set OPENROUTER_API_KEY or OLLAMA_BASE_URL in .env
```

### Running Locally

```bash
# Start backend service (Port 3000)
node backend/server.js

# Start frontend development server (Port 5173, in a separate terminal)
cd frontend
npm run dev
```

Visit `http://localhost:5173` to access the library.

### Verification Suite

```bash
# Execute all 13 regression suites (runtime: ~2 minutes)
npm test
```

---

## Engineering Roadmap

- [x] **Phase 0:** Local BGE-M3 1024d embedding upgrade & INT8 quantization
- [x] **Phases 1–3:** React 18 architectural migration (Library, Reader, Details pane)
- [x] **Phase 3.5:** Progressive Smart generation & background pipeline dispatch
- [x] **Phase 4:** Editorial namespace normalization, synopsis-first sequencing, and fallback honesty
- [x] **Phase 4.8:** Hard boundary token compression enforcement (250–360 words)
- [x] **Phase 4.13:** Synopsis & multi-chapter synthesis prompt hardening
- [ ] **Phase 4.10:** Automatic document categorization & lexical reading-level index
- [ ] **Phase 5:** Interactive bi-directional inline source highlighting (the provenance moat)
- [ ] **Phase 6:** Native desktop packaging via Tauri / Rust
- [ ] **Phase 7:** Offline multi-agent inquiry mode via Ollama & local Kokoro-82M TTS

---

## Target Architecture & Privacy Tenets

Smart Reader is architected specifically for privacy-conscious researchers, knowledge workers, and technical professionals:

1. **Local-First Sovereignty:** Raw books, personal annotations, and vector embeddings remain on your local storage. Cloud inference is strictly optional and isolated to bounded synthesis tasks.
2. **Deterministic Transparency:** A derived representation must never impersonate source material. Every synthesized claim provides an explicit trail to the backing text.
3. **Predictable Ergonomics:** Original text is presented as neutral paper. The compressed lens is tinted with subdued accents, making reading modes instantly discernable.

---

## Contributing & Conventions

Contributions and architectural critiques are welcome via GitHub issues and pull requests.

- **Commits:** Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `phase<N>.<M>:`)
- **Quality Gate:** All 13 regression test suites must pass clean (`13/13 passing`) before any commit lands on `main`.

---

*High-density neural text compression with deterministic source provenance.*
