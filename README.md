# Smart Reader

> A local-first neural reading library. Ingests heterogeneous source material — PDFs, EPUBs, web articles, raw text — and generates a navigable, compressed *Smart Reading* layer with deterministic source-passage provenance.

**Repository:** https://github.com/avengersvstheflash/Smart-Reader  
**Status:** Active development — Pre-release  
**License:** [see LICENSE](./LICENSE)  
**Current version:** `v0.4.5`  

---

## What this is

Smart Reader is a **reading and comprehension platform**, not a lossy summarization utility. The distinction is the whole product:

- **Original Reading** is immutable. It is the source text exactly as you uploaded it. Nothing in the app ever modifies it.
- **Smart Reading** is a derived lens. It is a compressed representation of the source — 250–360 words per ~1,500–2,500-word source unit — with every sentence traceable to the specific source chunks it draws from.

This is the **two-representation invariant**:

```text
ORIGINAL READING  →  immutable source, never touched
SMART READING     →  derived lens, fully traceable back to source
```

Every feature serves it. The toggle, the two-pane reader, the provenance chain, the fallback markers, the synopsis panel — all of it exists to keep the relationship between source and lens visible and honest.

## Why compression, not summarization

A summarizer asks *"what is the gist?"* and produces output proportional to input. A compressor asks *"what would this say if every sentence carried 5–8× its information?"* and preserves every distinct concept, argument, and factual claim.

Smart Reader implements **loss-bounded semantic compression**. The compression ratio is the fundamental quality metric:

| Metric | Target Specification |
|---|---|
| Source processing unit | 1,500–2,500 words |
| Smart Chapter output | 250–360 words (hard bounds 180–450) |
| Target compression ratio | ~7:1 |

See [`docs/PRODUCT_VISION.md`](./docs/PRODUCT_VISION.md) §"Compression, not summarization" for the full distinction.

## What ships today

### Backend
- **Ingestion** — PDF (`pdfjs-dist` with layout heuristics), EPUB, HTML, Markdown, plain text, and web URLs (`cheerio` with chrome stripping)
- **Structural analysis** — chapter detection, front/back matter classification, multi-signal heading recognition, header/footer suppression
- **Semantic indexing** — 350–500 word chunks, BGE-M3 1024d embeddings (local, INT8 quantized, multilingual 170+ languages)
- **Retrieval** — hybrid cross-source search (vector similarity + keyword scoring + diversity re-rank)
- **Editorial planning** — outline generation via LLM or deterministic clustering fallback
- **Compression** — grounded Smart Chapter synthesis via OpenRouter → DeepSeek V4 Flash with reasoning disabled and hard word bounds
- **Synopsis** — generated from preface + TOC + strategic samples (chapter 1 first paragraph, last chapter first paragraph), before chapter compression
- **Fallback honesty** — every deterministic-fallback representation carries `fell_back: true` metadata; the UI renders an honest caption

### Frontend
- **Library** — responsive book grid with search, content-type filters, and a "Smart" badge on books with editorial content
- **Book Details** — hero, synopsis panel, chapter list with roving tabindex, semantic intelligence panel with live chunk count
- **Reader** — dual-mode Original/Smart with automatic Smart default when a representation exists
- **Canonical block renderer** — recursive rendering of headings, paragraphs, quotes, lists, code, tables, callouts, separators
- **Import route** — file upload with real XHR progress, job-driven pipeline stepper (INGEST → SEMANTIC_INDEX → SYNOPSIS → BOOK_SUMMARY)
- **Design system** — four themes (default / warm / dark / glass), full Tailwind token set, WCAG AA baseline

### Infrastructure
- **Node 22** pinned via `.nvmrc`
- **SQLite** via `better-sqlite3`, WAL mode, cascading foreign keys
- **Test suite** — 13 regression suites, real fixtures, ~2 minute runtime
- **Local-first** — no cloud calls except configured AI providers; BGE-M3 runs entirely on-device

## Architecture

```text
User Material  →  Extraction  →  Parsing  →  Canonical Source
                →  Structural Analysis  →  Semantic Chunking
                →  Semantic Index  →  Editorial Organizer
                →  Editorial Chapter Plan  →  Compression
                →  Grounded Reader-Facing Content
```

Full architecture documentation:

- [`docs/ARCHITECTURE_AUDIT.md`](./docs/ARCHITECTURE_AUDIT.md) — 25 Q&A walkthrough
- [`docs/FRONTEND_ARCHITECTURE.md`](./docs/FRONTEND_ARCHITECTURE.md) — component tree, state map
- [`docs/FRONTEND_BLUEPRINT.md`](./docs/FRONTEND_BLUEPRINT.md) — design narrative
- [`docs/FRONTEND_BLUEPRINT_SPEC.md`](./docs/FRONTEND_BLUEPRINT_SPEC.md) — engineering contract
- [`docs/CANONICAL_TEST_BOOK.md`](./docs/CANONICAL_TEST_BOOK.md) — canonical verification fixture
- [`docs/PRODUCT_VISION.md`](./docs/PRODUCT_VISION.md) — north star

## Getting started

### Prerequisites
- Node.js 22 LTS (see `.nvmrc`)
- ~1.2 GB free disk space (INT8 BGE-M3 model downloads on first run)
- Optional: OpenRouter API key for real AI compression
- Optional: Ollama running locally for fully offline AI inference

### Install

```bash
git clone [https://github.com/avengersvstheflash/Smart-Reader.git](https://github.com/avengersvstheflash/Smart-Reader.git)
cd Smart-Reader
nvm use            # or manually install Node 22
npm install
cp .env.example .env
# edit .env with your API keys
```

### Run

```bash
# Backend (port 3000)
node backend/server.js

# Frontend (port 5173, in a second terminal)
cd frontend
npm run dev
```

Open `http://localhost:5173/` and import a book.

### Test

```bash
npm test           # 13 regression suites, ~2 minutes
```

## Roadmap

Active development phases (full roadmap in [`docs/ROADMAP_2026-09.md`](./docs/ROADMAP_2026-09.md)):

- **Phase 0** ✅ — BGE-M3 1024d embedding upgrade & quantization
- **Phase 1–3** ✅ — React migration: Library, Reader, Book Details
- **Phase 3.5** ✅ — Modal system, progressive Smart generation
- **Phase 4** ✅ — Editorial-to-source namespace fix, synopsis-first sequencing, import pipeline, fallback honesty
- **Phase 4.5** ✅ — Reading UX refinements
- **Phase 4.8** ✅ — Compression enforcement (word count bounds)
- **Phase 4.8.1** ✅ — Compressor prompt + input sizing + reasoning-aware token budget
- **Phase 4.8.2** ✅ — Front matter filter for editorial candidates
- **Phase 4.9** ✅ — Synopsis fallback honesty
- **Phase 4.13** ✅ — Synopsis + book summary prompt rewrite
- **Phase 4.10** ⏳ — Auto-classification on import (contentType, tags, reading level)
- **Phase 4.6** ⏳ — Web + Paste import tabs
- **Phase 4.7** ⏳ — Cinematic import experience
- **Phase 4.12** ⏳ — Compressor terminology refactor
- **Phase 5** ⏳ — Inline source tracker (the provenance moat made interactive)
- **Phase 6** ⏳ — Tauri packaging (native desktop app)
- **Build 5** ⏳ — Audio mode (local Kokoro-82M TTS)
- **Build 6** ⏳ — Discussion mode (local Ollama multi-agent)
- **Build 7** ⏳ — Story mode (narrative + image pipeline)

## Design philosophy

Three laws. Every feature serves them:

1. **Source is paper.** Original reading renders on calm neutral paper with zero accent chrome. It looks like a book because it *is* the book.
2. **The lens is tinted.** Smart reading carries a quiet accent identity. You know which representation you're in without reading a word.
3. **Derivation never masquerades as source.** Smart text is never rendered without a provenance affordance. Copy never calls derived text "the book."

### The market this is for

Not San Francisco. Readers in **Japan** and the **Nordics** first — high reading culture, privacy-first by law, willing to pay for quality tools. Germany and France second. The pitch that sells there:

> *"Your personal library, understood by local AI, with every compressed view traceable back to the source. You own the content. You own the AI. You own the outputs."*

Sells in Tokyo, Berlin, Amsterdam, Stockholm. Doesn't sell in SF — they don't care about local-first.

## Contributing

This project is under active solo development. Issues and discussion are welcome via the GitHub issue tracker.

Commit conventions:
- `feat(scope): <description>` — new capability
- `fix(scope): <description>` — bug fix
- `docs: <description>` — documentation only
- `chore: <description>` — build, deps, tooling
- `phase<N>.<M>: <description>` — roadmap phase work

Test suite must stay green (`npm test` → 13/13 passing) through every commit.

## Acknowledgements

Built with:
- [pdfjs-dist](https://github.com/mozilla/pdf.js) — PDF parsing
- [@huggingface/transformers](https://github.com/huggingface/transformers.js) — local inference
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — SQLite
- [React](https://react.dev/) + [Vite](https://vitejs.dev/) + [Tailwind CSS](https://tailwindcss.com/)
- [OpenRouter](https://openrouter.ai/) — cloud LLM gateway
- [DeepSeek](https://deepseek.com/) — V4 Flash for chapter compression

Canonical test book: *Practical Machine Learning: A Beginner's Guide with Ethical Insights* by Nyamawe et al. (CRC Press, 2025, CC-BY-NC-ND 4.0).
