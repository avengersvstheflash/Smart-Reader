# Smart Reader

### Local-First Neural Reading Library — Loss-Bounded Semantic Compression for Long-Form Documents

> Ingests PDFs, EPUBs, web articles, and raw text. Enforces a clean architectural split: **Import** is the entry point, **Library** holds curated Smart Readings only, and **Research** holds immutable original sources where every compressed sentence traces deterministically to its source passage.

[![Node.js 22](https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React 18.3](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite 5.4](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![TypeScript 5.3](https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS 3.4](https://img.shields.io/badge/Tailwind_CSS-3.4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Express 4.19](https://img.shields.io/badge/Express-4.19-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003B57?logo=sqlite&logoColor=white)](https://github.com/WiseLibs/better-sqlite3)
[![BGE-M3 Embeddings](https://img.shields.io/badge/Embeddings-BGE--M3_1024d-blue)](https://huggingface.co/BAAI/bge-m3)

[![Tests 20/20 Passing](https://img.shields.io/badge/Tests-20%2F20_Passing-3fb950)](#test)
[![Local-First Enabled](https://img.shields.io/badge/Local--First-enabled-2ea043)](#design-philosophy)
[![Status Phase 5 In Progress](https://img.shields.io/badge/Status-Phase_5_in_progress-blue)](#roadmap)
[![MIT License](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

---

## Overview

Smart Reader is a **reading and comprehension platform**, not a lossy summarization utility. It maintains two representations of every document:

| Representation | Behavior |
|---|---|
| **Original Reading** | **Immutable source.** The text exactly as uploaded. Nothing in the system modifies it. |
| **Smart Reading** | **Derived lens.** A compressed representation whose length is chosen adaptively per source unit — every distinct concept, argument, and factual claim preserved, with every sentence traceable to its source chunks. |

This is the **two-representation invariant**:

```text
ORIGINAL READING  →  immutable source, never touched
SMART READING     →  derived lens, fully traceable back to source
```

Every feature — the reader, the provenance chain, the fallback markers, the synopsis panel — exists to keep the relationship between source and lens visible, honest, and verifiable.

In Phase 5.3, these principles became spatial across three dedicated application tabs:
- **Import** — Where content enters the system (File upload, Web crawl, or direct Paste).
- **Library** — Curated Smart Readings only. Clean, loss-bounded compressed chapters. Uncompressed sources are excluded from the reading library.
- **Research** — The home of immutable original sources, multi-source dossiers, provenance targets, and deep research archives.

---

## Why compression, not summarization

A summarizer asks *"what is the gist?"* and produces output proportional to input. A compressor asks *"what would this say if every sentence carried several times its information?"* and preserves every distinct concept, argument, and factual claim.

Smart Reader implements **loss-bounded semantic compression**. The system assesses each source unit and chooses its target; the ratio is an observed outcome, not an input.

| Metric | Behavior |
|---|---|
| Source processing unit | 1,500–2,500 words |
| Smart Chapter output | Adaptive — compressed to the density the source requires |
| Compression ratio | Determined per source unit by content complexity |
| Observed band (canonical fixture) | ~4:1 to ~8:1 |

Dense technical content preserves every claim at tighter ratios. Accessible narrative compresses further. The output length is the result of what the source needs, not a fixed target imposed on it.

> Full distinction: [`docs/PRODUCT_VISION.md`](./docs/PRODUCT_VISION.md) §"Compression, not summarization".

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js 22 (LTS, pinned via `.nvmrc`) |
| **Backend** | Express 4.19, `better-sqlite3` (WAL mode), cascading foreign keys |
| **Frontend** | React 18.3, Vite 5.4, TypeScript 5.3, Tailwind CSS 3.4, React Query, Zustand |
| **Embeddings** | BGE-M3 1024d, INT8 quantized, local (`@huggingface/transformers`) — multilingual, 170+ languages |
| **PDF parsing** | `pdfjs-dist` with layout heuristics |
| **Web extraction** | `cheerio` with chrome stripping |
| **AI (compression)** | OpenRouter → DeepSeek V4 Flash (configurable; Ollama supported for fully local mode) |
| **Testing** | 20 regression suites, real fixtures, ~8–10 min runtime |

---

## Features

### Backend
- **Ingestion** — PDF, EPUB, HTML, Markdown, plain text, web URLs, raw paste
- **Structural analysis** — chapter detection, front/back matter classification, multi-signal heading recognition, TOC-anchored page recovery, header/footer suppression
- **Semantic indexing** — 350–500 word chunks with hybrid cross-source retrieval (vector similarity + keyword scoring + diversity re-rank)
- **Auto-classification** — LLM-based `contentType`, tags, reading level, target audience; heuristic fallback if the provider is unavailable
- **Bibliographic extraction** — publisher, year, ISBN, edition, authors, copyright holder, language; deterministic regex fallback; honest nulls for non-book sources (SEC filings, reports)
- **Editorial planning** — 1,500–2,500 word source-unit slicing with even distribution and defensive subdivision for oversize sections
- **Compression** — grounded Smart Chapter synthesis with self-assessment. Two-phase: Phase A estimates the words needed to preserve every claim; Phase B compresses to that target. Reasoning disabled, dynamic clamps on output.
- **Synopsis** — generated from preface + TOC + strategic samples, sequenced before chapter compression
- **Provenance resolution** — paragraph-level source attribution with sentence-level segmentation. C-primary arbitration (embedding similarity), A-corroboration (compressor's emitted citations), B-fallback (LLM arbitration on ambiguous cases). Ungrounded paragraphs marked honestly.
- **Library / Research API split** — `/api/books` serves synthesized readings only (via `chapter_representations.book_id = b.id`), while `/api/books/sources` serves all ingested source materials
- **Chunk resolution API** — `GET /api/chunks/:id` maps chunk IDs directly to sequence indices for cross-representation DOM block highlighting
- **Job lifecycle** — 6 tracked stages (`INGEST` → `SEMANTIC_INDEX` → `CLASSIFICATION` → `SYNOPSIS` → `SYNTHESIS` → `PROVENANCE_VERIFY`) with boot-time zombie sweep and `INTERRUPTED` rendering
- **Fallback honesty** — every deterministic-fallback representation carries `fell_back: true`, `fallback_reason`, `truncated`, `compression_violation`, and `insufficient_marker` metadata

### Frontend
- **Library** — responsive book grid with search, content-type filters, dynamic tag filter chips, and Smart badge (Smart-only readings)
- **Book Details** — hero, classification chips, synopsis panel, bibliographic panel, chapter list, semantic intelligence panel, AI-provider disclosure
- **Reader** — Smart-only reading view; clicking any sentence provenance chip navigates directly to the source chunk in Research view
- **Research tab** — dedicated collection view of original sources with format/type filters (PDF, EPUB, Web, Paste, Dossiers) and "Imported, not yet synthesized" badges
- **Research Viewer** — serene paper visual identity (serif prose, wide calm margins, neutral palette), theme-aware across all 4 app themes (default, warm, dark, glass)
- **Cross-tab provenance navigation** — clicking a Smart sentence source chip jumps directly into the Research viewer with chunk highlight wash and auto-centering; sticky return arrow restores reader scroll position via sessionStorage
- **Interactive provenance** — clickable source chips per segment run with inline preview cards, chunk navigation to Research mode, and scroll-position preservation on return
- **Canonical block renderer** — recursive rendering of headings, paragraphs, quotes, lists, code, tables, callouts, separators
- **Import** — File / Web / Paste tabs with real XHR progress and a job-driven pipeline stepper
- **Cinematic import** — pipeline stages drive page-turn, chunk-gather, tag-fade, chapter-card animations; dynamic polling; reduced-motion collapse; mobile-safe at 375 px
- **Design system** — four themes (default / warm / dark / glass), full Tailwind token set, WCAG AA baseline

### Infrastructure
- **Test isolation** — test runs execute against a separate DB (`storage/test-data.db`) and do not touch the development library
- **Fixture licensing** — tracked in [`docs/RIGHTS.md`](./docs/RIGHTS.md)
- **Local-first** — no cloud calls except configured AI providers; BGE-M3 runs entirely on-device

---

## Architecture

```mermaid
flowchart LR
    subgraph INGESTION [" 1. Ingestion & Extraction (Import) "]
        RawDoc["Source Material\n(PDF, EPUB, Web, Paste)"]
        Parser["Layout-Aware Parser\n(pdfjs-dist / cheerio)"]
        RawDoc --> Parser
    end

    subgraph CANONICAL [" 2. Immutable Canonical Source (Research) "]
        Canon["Canonical Document Tree\n(Chapters, Sections, Blocks)"]
        Parser --> Canon
    end

    subgraph PIPELINE [" 3. Semantic & Editorial Engine "]
        direction TB
        Chunker["Semantic Chunking\n(350–500w)"]
        Embedder["BGE-M3 Vector Index\n(1024d INT8 Local)"]
        Classifier["Auto-Classifier + Bibliographer\n(Tags, Level, Audience, Publisher)"]
        Synopsis["Synopsis Generator\n(Preface + TOC + Samples)"]
        Planner["Editorial Slicer\n(1,500–2,500w Units)"]
        Compressor["Adaptive Compressor\n(Self-Assessment + DeepSeek V4 Flash)"]
        ProvResolver["Provenance Resolver\n(C-primary + A-corroborate + B-fallback)"]

        Canon --> Chunker --> Embedder
        Canon --> Classifier
        Canon --> Synopsis
        Canon --> Planner --> Compressor --> ProvResolver
    end

    subgraph PRESENTATION [" 4. Library & Research Presentation "]
        Canon ===>|"Immutable Paper"| ResearchViewer["Research Viewer\n(/research/:bookId)"]
        ProvResolver ===>|"Tinted Lens"| LibraryReader["Library Smart Reader\n(/read/:bookId)"]
        LibraryReader -.->|"Clickable Provenance (?highlight=chk-X)"| ResearchViewer
    end
```

### End-to-End Pipeline

```text
User Material → Extraction → Parsing → Canonical Source → Structural Analysis
              → Semantic Chunking → Semantic Index → Auto-Classification + Bibliographic
              → Editorial Organizer → Source-Unit Slicing → Adaptive Compression
              → Provenance Resolution → Library Smart Reader & Research Viewer
```

### Key Documentation

| Document | Purpose |
|---|---|
| [`docs/PRODUCT_VISION.md`](./docs/PRODUCT_VISION.md) | North star, two-representation invariant, three laws |
| [`docs/ARCHITECTURE_AUDIT.md`](./docs/ARCHITECTURE_AUDIT.md) | 25 Q&A backend walkthrough |
| [`docs/FRONTEND_ARCHITECTURE.md`](./docs/FRONTEND_ARCHITECTURE.md) | Component tree, state map |
| [`docs/FRONTEND_BLUEPRINT.md`](./docs/FRONTEND_BLUEPRINT.md) | Design narrative |
| [`docs/FRONTEND_BLUEPRINT_SPEC.md`](./docs/FRONTEND_BLUEPRINT_SPEC.md) | Engineering contract |
| [`docs/CANONICAL_TEST_BOOK.md`](./docs/CANONICAL_TEST_BOOK.md) | Canonical verification fixture |
| [`docs/RIGHTS.md`](./docs/RIGHTS.md) | Fixture licenses, user content policy |
| [`docs/SESSION_HANDOFF.md`](./docs/SESSION_HANDOFF.md) | Current project state & handoff guide |

---

## Getting Started

### Prerequisites
- **Node.js 22 LTS** (see `.nvmrc`)
- **~1.2 GB free disk space** — INT8 BGE-M3 model downloads on first run
- *Optional:* OpenRouter API key for real AI compression
- *Optional:* Ollama running locally for fully offline inference

### Install

```bash
git clone https://github.com/avengersvstheflash/Smart-Reader.git
cd Smart-Reader
nvm use
npm install
cp .env.example .env # edit .env with your API keys
```

### Run

```bash
# Backend (port 3000)
node backend/server.js

# Frontend (port 5173, second terminal)
cd frontend
npm run dev
```

Open `http://localhost:5173/` and import a document.

### Test

```bash
npm test # 20 regression suites, ~8–10 minutes
```

> **Test Isolation:** Test runs execute against `storage/test-data.db` — your working development library at `storage/data.db` is never touched.

---

## Roadmap

Active development phases (full roadmap in [`docs/ROADMAP_2026-09.md`](./docs/ROADMAP_2026-09.md)):

### Phase 4 — Complete (2026-09-23, extended through 2026-09-24)

Compression enforced. Import pipeline hardened. Classification shipped. Cinematic import live. Test infrastructure isolated. Adaptive compression with self-assessment. All 19 suites green.

**Selected shipped work:** Web + Paste import tabs (4.6) · Cinematic import (4.7) · Compressor prompt + source-unit sizing (4.8.1) · Even-distribution slicing (4.8.3) · Synopsis fallback honesty (4.9) · Auto-classification (4.10) · Zombie job resilience (4.11) · Synopsis prompt rewrite (4.13) · Compression eval harness (4.14) · Parser stress + front-matter verification (4.15) · Pre-hydration contract test (4.19) · Fixture licensing (4.20) · Import trust path (4.21) · Editorial planner guard (4.24) · Test DB isolation (4.25) · Truncation and paragraph structure fix (4.26) · Compressor word count enforcement (4.26.1) · Adaptive compression with self-assessment (4.26.2).

### Phase 5 — In Progress

| Phase | Status | Description |
|:---:|:---:|---|
| **5.1a** | ✅ | Bibliographic metadata extraction |
| **5.1b** | ✅ | Paragraph-level provenance resolution contract |
| **5.1b.1** | ✅ | C-primary arbitration |
| **5.1b.2** | ✅ | Empirical threshold calibration |
| **5.2** | ✅ | Reader click-through UI — interactive provenance |
| **5.3** | ✅ | Research tab foundation & Library/Research architectural split (shipped 5.3a–f) |
| **5.5** | 🚧 | Library polish + UI/UX backlog |
| **5.6** | ⏳ | Validation and refine loops |
| **5.7** | ⏳ | Python sidecar architecture (OCR, Discussion, Story) |

### Later

| Phase | Description |
|---|---|
| **Phase 6** | Tauri packaging (native desktop app) |
| **Build 5** | Audio mode (local Kokoro-82M TTS) |
| **Build 6** | Discussion mode (local Ollama multi-agent) |
| **Build 7** | Story mode (narrative + image pipeline) — frozen until winter–spring 2027 |

> Full roadmap: [`docs/ROADMAP_2026-09.md`](./docs/ROADMAP_2026-09.md).

---

## Design Philosophy

**Three laws. Every feature serves them:**

1. **Source is paper.** Original reading renders on calm neutral paper with zero accent chrome. It looks like a book because it *is* the book.
2. **The lens is tinted.** Smart reading carries a quiet accent identity. You know which representation you're in without reading a word.
3. **Derivation never masquerades as source.** Smart text is never rendered without a provenance affordance. Copy never calls derived text "the book."

---

## Known Limitations

Developed in strict phases. Each phase closes clean — tests green, tree clean, verification at HEAD — before the next opens. Tracked limitations are honest, not hidden:

| Limitation | Status |
|---|---|
| **OCR for image-only PDFs** | Deferred to Python sidecar (Phase 5.7). Empty-content PDFs fail honestly today. |
| **Compression ratio tuning** | Adaptive clamps shipped; empirical tuning deferred to Phase 5.6 validation loops. |
| **Tag chip placement** | Hero shows tags inline; relocation queued for Phase 5.5. |
| **Preface-less source handling** | Synopsis retries and produces acceptable prose, but path is fragile. |
| **Fixture licensing** | Two fixtures require swap before commercial release. See [`docs/RIGHTS.md`](./docs/RIGHTS.md). |

---

## Contributing

Solo development, active. Issues and discussion via the GitHub issue tracker.

**Commit conventions:**
- `feat(scope): <description>` — new capability
- `fix(scope): <description>` — bug fix
- `docs: <description>` — documentation only
- `chore(scope): <description>` — build, deps, tooling
- `phase<N>.<M>: <description>` — roadmap phase work

*Test suite must stay green (`npm test` → 20/20 passing) through every commit.*

---

## Acknowledgements

Built with:
- [`pdfjs-dist`](https://github.com/mozilla/pdf.js) — PDF parsing
- [`@huggingface/transformers`](https://github.com/huggingface/transformers.js) — local inference
- [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3) — SQLite
- [`React`](https://react.dev/) + [`Vite`](https://vitejs.dev/) + [`Tailwind CSS`](https://tailwindcss.com/)
- [`OpenRouter`](https://openrouter.ai/) — cloud LLM gateway
- [`DeepSeek`](https://deepseek.com/) — V4 Flash for chapter compression

Testing was performed against purchased and licensed technical reference materials. No third-party content is redistributed with this repository.
