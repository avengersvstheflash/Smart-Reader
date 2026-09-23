# Smart Reader

> A local-first neural reading library. Ingests heterogeneous source material — PDFs, EPUBs, web articles, raw text — and generates a navigable, compressed *Smart Reading* layer with deterministic source-passage provenance.

**Repository:** https://github.com/avengersvstheflash/Smart-Reader  
**Status:** Active development — Phase 4 complete  
**License:** [see LICENSE](./LICENSE)  
**Current version:** `v0.5.0`  

---

## What this is

Smart Reader is a **reading and comprehension platform**, not a lossy summarization utility. The distinction is the whole product:

- **Original Reading** is immutable. It is the source text exactly as you uploaded it. Nothing in the app ever modifies it.
- **Smart Reading** is a derived lens. It is a compressed representation of the source — 250–360 words per ~1,500–2,500-word source unit — with every sentence traceable to the specific source chunks it draws from.

This is the **two-representation invariant**:

```text
ORIGINAL READING → immutable source, never touched
SMART READING    → derived lens, fully traceable back to source
```

Every feature serves it. The reader, the provenance chain, the fallback markers, the synopsis panel — all of it exists to keep the relationship between source and lens visible and honest.

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
- **Ingestion** — PDF (`pdfjs-dist` with layout heuristics), EPUB, HTML, Markdown, plain text, web URLs (`cheerio` with chrome stripping), and raw paste
- **Structural analysis** — chapter detection, front/back matter classification, multi-signal heading recognition, header/footer suppression, TOC-anchored page recovery
- **Semantic indexing** — 350–500 word chunks, BGE-M3 1024d embeddings (local, INT8 quantized, multilingual 170+ languages)
- **Retrieval** — hybrid cross-source search (vector similarity + keyword scoring + diversity re-rank)
- **Auto-classification** — LLM-based `contentType`, tags, reading level, target audience, prerequisites, and tools covered; heuristic fallback if the provider is unavailable (4.10)
- **Editorial planning** — 1,500–2,500 word source-unit slicing with even distribution and defensive subdivision for oversize sections (4.8.3, 4.24)
- **Compression** — grounded Smart Chapter synthesis via OpenRouter → DeepSeek V4 Flash, reasoning disabled, hard word bounds (4.8.1)
- **Synopsis** — generated from preface + TOC + strategic samples before chapter compression (4.13)
- **Job lifecycle** — 5 tracked stages (INGEST, SEMANTIC_INDEX, CLASSIFICATION, SYNOPSIS, SYNTHESIS) with boot-time zombie sweep and INTERRUPTED rendering (4.11)
- **Fallback honesty** — every deterministic-fallback representation carries `fell_back: true`, `fallback_reason`, and word-count-violation metadata; the UI renders an honest caption
- **Test isolation** — test runs execute against a separate DB and do not touch the development library (4.25)

### Frontend
- **Library** — responsive book grid with search, content-type filters, dynamic tag filter chips, and a "Smart" badge on books with editorial content
- **Book Details** — hero, classification chips (content-type + reading level + top tags), synopsis panel, chapter list, semantic intelligence panel with chunk count, and honest AI-provider disclosure (4.10.5)
- **Reader** — Smart-first by default when a representation exists, with a subtle Source affordance for the original (see PRODUCT_VISION §"Smart is the product. Original is the proof.")
- **Canonical block renderer** — recursive rendering of headings, paragraphs, quotes, lists, code, tables, callouts, separators
- **Import** — File / Web / Paste tabs with real XHR upload progress and a job-driven pipeline stepper
- **Cinematic import** — page-turn (INGEST), chunk-gather (SEMANTIC_INDEX), tag-fade (CLASSIFICATION), progress-driven synopsis text, chapter-card stack (SYNTHESIS), completion cascade; dynamic polling at 500/800/1200 ms; full reduced-motion collapse; mobile-safe at 375 px (4.7/4.7.1)
- **Design system** — four themes (default / warm / dark / glass), full Tailwind token set, WCAG AA baseline

### Infrastructure
- **Node 22** pinned via `.nvmrc`
- **SQLite** via `better-sqlite3`, WAL mode, cascading foreign keys
- **Test suite** — 17 regression suites, real fixtures, ~5–7 minute runtime
- **Local-first** — no cloud calls except configured AI providers; BGE-M3 runs entirely on-device
- Fixture licensing tracked in [`docs/RIGHTS.md`](./docs/RIGHTS.md)

## Architecture

```text
User Material → Extraction → Parsing → Canonical Source
              → Structural Analysis → Semantic Chunking
              → Semantic Index → Auto-Classification
              → Editorial Organizer → Source-Unit Slicing
              → Editorial Chapter Plan → Compression
              → Grounded Reader-Facing Content
```

Full architecture documentation:
- [`docs/ARCHITECTURE_AUDIT.md`](./docs/ARCHITECTURE_AUDIT.md) — 25 Q&A walkthrough
- [`docs/FRONTEND_ARCHITECTURE.md`](./docs/FRONTEND_ARCHITECTURE.md) — component tree, state map
- [`docs/FRONTEND_BLUEPRINT.md`](./docs/FRONTEND_BLUEPRINT.md) — design narrative
- [`docs/FRONTEND_BLUEPRINT_SPEC.md`](./docs/FRONTEND_BLUEPRINT_SPEC.md) — engineering contract
- [`docs/CANONICAL_TEST_BOOK.md`](./docs/CANONICAL_TEST_BOOK.md) — canonical verification fixture
- [`docs/PRODUCT_VISION.md`](./docs/PRODUCT_VISION.md) — north star
- [`docs/RIGHTS.md`](./docs/RIGHTS.md) — fixture licenses, user content policy

## Getting started

### Prerequisites
- Node.js 22 LTS (see `.nvmrc`)
- ~1.2 GB free disk space (INT8 BGE-M3 model downloads on first run)
- Optional: OpenRouter API key for real AI compression
- Optional: Ollama running locally for fully offline AI inference

### Install

```bash
git clone https://github.com/avengersvstheflash/Smart-Reader.git
cd Smart-Reader
nvm use # or manually install Node 22
npm install
cp .env.example .env # edit .env with your API keys
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
npm test # 17 regression suites, ~5–7 minutes
```

Test runs execute against `storage/test-data.db` — your development library at `storage/data.db` is not touched.

## Roadmap

Active development phases (full roadmap in [`docs/ROADMAP_2026-09.md`](./docs/ROADMAP_2026-09.md)):

### Phase 4 — Complete (2026-09-23)
Compression enforced, import pipeline hardened, classification shipped, cinematic import live, test infrastructure isolated. All 17 suites green.

Selected shipped work:
- **4.6** — Web + Paste import tabs
- **4.7 / 4.7.1** — Cinematic import experience
- **4.8.1** — Compressor prompt + source-unit sizing
- **4.8.3** — Even-distribution source slicing
- **4.9** — Synopsis fallback honesty
- **4.10** — Auto-classification on import
- **4.11** — Zombie job resilience + 5-stage job tracking
- **4.13** — Synopsis + book summary prompt rewrite
- **4.14** — Compression evaluation harness
- **4.15a/b** — Parser stress + front-matter filter verification
- **4.19** — Pre-hydration contract test
- **4.20** — RIGHTS.md (fixture licensing)
- **4.21** — Import trust path (header cascade, phantom books, synopsis fallback)
- **4.24** — Editorial planner defensive subdivision guard
- **4.25** — Test DB isolation

### Phase 5 — In progress
- **5.1** ⏳ — Paragraph-level provenance resolution (backend contract)
- **5.2** ⏳ — Reader click-through UI (the moat made interactive)
- **5.3** ⏳ — Research mode collection view
- **5.5** ⏳ — Library polish + UI/UX backlog
- **5.6** ⏳ — Validation and refine loops (pre-LLM source guard, post-LLM output guard)
- **5.7** ⏳ — Python sidecar architecture decision (OCR, Discussion, Story)

### Later
- **Phase 6** ⏳ — Tauri packaging (native desktop app)
- **Build 5** ⏳ — Audio mode (local Kokoro-82M TTS)
- **Build 6** ⏳ — Discussion mode (local Ollama multi-agent)
- **Build 7** ⏳ — Story mode (narrative + image pipeline), frozen until winter–spring 2027

## Known limitations

Smart Reader is developed in strict phases. Each phase closes clean — tests green, tree clean, verification at HEAD — before the next opens. Tracked limitations are honest, not hidden.

- **OCR for image-only PDFs.** Deferred to the Python sidecar window (Phase 5.7). Empty-content PDFs fail honestly today: no phantom books, no stuck jobs, clear error.
- **Synthesis fallback verification.** A3 from the 2026-09-23 canonical import — uniform 250-character synthesis representations — cannot be verified without the Phase 5.6 validation loop.
- **Tag chip placement.** Book Details currently renders all tags inline in the hero. Relocation to a filter surface is queued for Phase 5.5.
- **Research mode collection view.** Import half shipped in 4.6; the collection view is queued for Phase 5.3.
- **Preface-less sources.** SEC filings, pasted text, and some web dumps lack preface + TOC. The synopsis path retries and produces acceptable prose, but is fragile.
- **Fixture licensing.** Two test fixtures are licensed for non-commercial use only and must be swapped before any commercial release. See [`docs/RIGHTS.md`](./docs/RIGHTS.md).

## Design philosophy

Three laws. Every feature serves them:

1. **Source is paper.** Original reading renders on calm neutral paper with zero accent chrome. It looks like a book because it is the book.
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

Test suite must stay green (`npm test` → 17/17 passing) through every commit.

## Acknowledgements

Built with:
- [pdfjs-dist](https://github.com/mozilla/pdf.js) — PDF parsing
- [@huggingface/transformers](https://github.com/huggingface/transformers.js) — local inference
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — SQLite
- [React](https://react.dev/) + [Vite](https://vitejs.dev/) + [Tailwind CSS](https://tailwindcss.com/)
- [OpenRouter](https://openrouter.ai/) — cloud LLM gateway
- [DeepSeek](https://deepseek.com/) — V4 Flash for chapter compression

Canonical test book: *Practical Machine Learning: A Beginner's Guide with Ethical Insights* by Nyamawe et al. (CRC Press, 2025, CC-BY-NC-ND 4.0).
