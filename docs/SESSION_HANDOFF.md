# Smart Reader / Omnitome — Session Handoff

> Last updated: 2026-10-07 (evening, session 2)  
> Repository: github.com/avengersvstheflash/Smart-Reader  
> Purpose: Full orientation in one turn for any assistant. Answers: *where are we, how do we work, what is next.*

---

## 1. Current State

- **HEAD:** df9bff0 (`F31.4: gate math extraction OFF by default`)
- **Tree:** clean
- **Origin:** synced with `main`
- **Tests:** 31/31 suites pass (`node scripts/run-all-tests.js`)
- **Latest Tag:** `v0.6.0`

### Recent Commit Trail
- `df9bff0` — F31.4: gate math extraction OFF by default
- `49f26a1` — F32.2: filter chapters by structural_role
- `3d142d3` — F31: math extraction via pdfmath (Python sidecar) + F31.1 rename + fitz cleanup
- `d15b9ca` — F32.1: fast Python-based structure detection (Layer 0/1)
- `587cf4d` — F32: hybrid section classifier for ingestion pipeline
- `ab3fee0` — docs: session close 2026-10-07 + F32 section classification finding
- `53b9186` — 5.8e.5: theme-reactive covers + hybrid bright/medium/dark palettes
- `1ee511f` — 5.8e: procedural book cover art + Add Book button accent
- `8a35fef` — 5.8d.5: remove stale 'Ask this book' placeholder
- `77ae44a` — 5.8d.2-4: per-theme Continue button animations + internal decor
- `b7d845b` — 5.8d: animated per-theme logo sigils

---

## 2. Product Identity (locked)

- **One-line thesis:** A local-first neural reading library whose differentiator is **loss-bounded, provenance-aware semantic compression**.
- **Not this:** "AI summarizes your books."
- **This:** Source → compressed reading layer → traceable back to source.
- **The Two-Representation Invariant:**
  - **Original Reading:** Immutable source. Authoritative. Lives in Research.
  - **Omni Reading:** Derived, compressed, traceable. Lives in Library. **This is the product.**
  - *Rule:* Omni is the product; Original is the proof. The reader defaults to Omni; Original is reached contextually via provenance.
- **Three Design Laws:**
  1. *Source is paper:* Original feels neutral, calm, book-like.
  2. *The lens is tinted:* Omni carries a quiet derived identity (no sparkles, no wands).
  3. *Derivation never masquerades as source:* Every Omni claim retains a provenance path.
- **Compression, not summarization:** Preserves distinct concepts, arguments, factual claims, and causal relationships at ~7:1 density (~250–360 words per chapter from 1,500–2,500 source words).
- **Local-first by design:** Local execution is a deliberate architecture decision, not a constraint. Zero egress for private libraries; deterministic latency.

---

## 3. Architecture

- **Node + Python Hybrid Ownership Boundaries:**
  - *Node:* API / HTTP, Orchestration, SQLite (sole writer), Application lifecycle, LLM capability routing.
  - *Python sidecar (127.0.0.1:8765):* PaddleOCR, pysbd sentence splitting, BGE-M3 embeddings, BGE reranker v2, DOCX/RTF parsing, PyMuPDF structure detection, pdfmath extraction, Kokoro TTS (Phase 5.9).
  - *Hard boundary:* Node is the sole SQLite writer. Python never writes directly to SQLite.
- **Data Flows:**
  Import (PDF/EPUB/DOCX/RTF) → Ingest (`ingestionService.js`) → Fast Structure Detection (`/v1/parse/structure`, PyMuPDF TOC + heuristics) → Optional Math Extraction (`/v1/math/extract`, gated) → Outline / Chapters (`structural_role` filtering) → Synopsis (`intelligentSummarizer.js`) → Synthesis (`editorialPlanner.js` + BGE rerank) → Reader (`OmniChapterView` / `KaTeX`).
- **Provider Abstraction:**
  - OpenRouter (cloud fallback) OR Local (OpenAI-compatible: Ollama at `http://localhost:11434/v1`, LM Studio, llama.cpp, vLLM).
  - *Principle:* Ollama-first UX, OpenAI-compatible architecture.
- **Trust Boundaries:** Node owns LLM routing and provider selection. Python NEVER calls an LLM. Local-only configurations never make outbound cloud calls.
- **Sidecar Endpoints:**
  - `GET /v1/health` — readiness check
  - `POST /v1/ocr` — PaddleOCR rasterization & text extraction
  - `POST /v1/nlp/split` — sentence splitting via pysbd
  - `POST /v1/nlp/chunk` — token-bounded chunking
  - `POST /v1/nlp/rerank` — BGE-reranker-v2-m3 scoring (GPU/CUDA warmup)
  - `POST /v1/embed/batch` — BGE-M3 dense embeddings
  - `POST /v1/parse/docx`, `/rtf` — document text extraction
  - `POST /v1/parse/structure` — PyMuPDF TOC + font-size heuristics (Layer 0/1)
  - `POST /v1/math/extract` — pdfmath LaTeX block extraction (isolated, gated)

---

## 4. Phase Status (current)

- **Phase 5:** CLOSED
- **Phase 5.7:** CLOSED (Python Sidecar Foundation, OCR, Embeddings, Reranker)
- **Phase 5.8:** IN PROGRESS (Pre-packaging UX, Visual System, Robustness)
  - `5.8a` Omnitome Rebrand: CLOSED (`eb4f2c7`, `bbcfd7e`)
  - `5.8c` Omni Theme Identity & Multi-Accent Tokens: CLOSED (`78bdf70`, `8c3dc64`)
  - `5.8c.5–9` Sticker Architecture & Sets: CLOSED (`833d692`–`a6f208d`)
  - `5.8d` Animated Sigils & Button Decor: CLOSED (`b7d845b`, `77ae44a`, `8a35fef`)
  - `5.8e` Procedural Cover Art & Theme-Reactive Covers: CLOSED (`1ee511f`, `53b9186`)
  - `5.8p` Performance & Progress (Immediate Track):
    - `5.8p.1` Backend Batching (rerank batching F34, pdfmath limits F31.2/3)
    - `5.8p.2` Frontend Progress UI (chunk counter, ETA, heartbeat F35)
    - `5.8p.3` Instrumentation (per-stage timings, exportable metrics)
  - `5.8i` Frontend Walkthrough & Verification: NEXT (post-5.8p)
  - `5.8j` Settings Page: QUEUED (post-5.9)
  - `5.8k` Help / Guide Page: QUEUED
- **Phase 5.9:** Kokoro TTS (Python sidecar audio generation)
- **Phase 6:** Tauri Desktop Packaging (macOS / Windows / Linux) → v1.0

---

## 5. Theme / Visual System

- **5 Themes & Identity:**
  - `spring`: Light cyan, leaves/wind, calm (32 stickers)
  - `sakura`: Pink cherry blossoms, quiet warmth (32 stickers)
  - `coffee`: Amber warm paper, dark roast (32 stickers)
  - `cyberpunk`: Synthwave multi-neon, aggressive glow (32 stickers, 11 glowing)
  - `omni`: Violet arcanic celestial flagship (32 stickers, 21 glowing)
- **Sticker Architecture:** `frontend/src/components/decor/ThemeDecor.tsx`, `decor.css`. Conditional JSX render based on theme (H9). Softened via `data-reader-active` during reading.
- **Animation Conventions:** Reduced-motion (`prefers-reduced-motion`) disables motion and strobes while retaining static styling. Cyberpunk uses `cyber-animated-*`, Omni uses `omni-animated-*`.
- **Book Cover Architecture:** `BookCoverArt.tsx`, `book-cover.css`. Procedural SVG generation with 4 pattern families (geometric, weave, symbol, particles) and theme-reactive palettes (`COVER_THEMES_BY_THEME`).
- **Sigil / Button Decor:** `ThemeSigil.tsx` (`sigil.css`) and `ButtonDecor.tsx` (`button-theme.css`).

---

## 6. Findings Ledger

| ID | Name | Status | Location / Detail |
|---|---|---|---|
| **F18** | Heading Ancestor Skipping | CLOSED | `3f80e93` (`outlineBuilder.js`) |
| **F20** | Synopsis Sampler Index Leak | OPEN | Low severity, `intelligentSummarizer.js` |
| **F21** | "Opened just now" Timestamp Lag | OPEN | Cosmetic, UI timestamp parsing |
| **F22** | Slicer Word Count Overshoot | MONITORED | `editorialPlanner.js` slice target tuning |
| **F23** | PDF Math Legacy PUA Glyph Mapping | CLOSED | `f390a14` (`legacyFontPua.js`) |
| **F24** | Chat-Log Document Classification | CLOSED | `5a4451c` (`chatLogDetector.js`) |
| **F25** | Two-column Header Merging | MONITORED | `pdfjsParser.js` column boundary logic |
| **F26** | Chat-log OCR First-turn Fallback Title | OPEN | Low severity, `chatLogParser.js` |
| **F27** | Editorial Planner Ancestor Collision | OPEN | Low severity, `editorialPlanner.js` |
| **F28** | Slicer Minimum Chapter Clamp | CLOSED | Removed `min(8)` cap in slicer |
| **F29** | KaTeX LaTeX Rendering in Reader | CLOSED | `88db5b3` (`MathRenderer.tsx`, `CanonicalBlock.tsx`) |
| **F30** | Duplicate SectionFilter Logging | OPEN | Cosmetic, `intelligentSummarizer.js` |
| **F31** | PDF Math Structural Decompilation | CLOSED | `3d142d3` (`pdfmath_sidecar`, `mathExtractor.js`) |
| **F31.1**| Python Math Package Rename | CLOSED | `3d142d3` (`math/` → `pdfmath_sidecar/`) |
| **F31.2**| pdfmath Timeout on Dense Docs | DEFERRED | To Phase 5.8p.1 (page limits / bounded run) |
| **F31.3**| pdfmath Table/Hex Over-detection | DEFERRED | To Phase 5.8p.1 (math-density heuristic filter) |
| **F31.4**| Math Extraction Env Flag | CLOSED | `df9bff0` (`ENABLE_MATH_EXTRACTION`, default OFF) |
| **F32** | Hybrid Section Classifier | CLOSED | `587cf4d` (`sectionClassifier.js`) |
| **F32.1**| Fast Python Structure Detection | CLOSED | `d15b9ca` (`structure.py`, `structureDetector.js`) |
| **F32.2**| Filter Chapters by Structural Role | CLOSED | `49f26a1` (`useChapters.ts` hook filter) |
| **F32.2a**| Backend Chapter Role Filter Move | OPEN | Small, move filter to `/api/books/:id/chapters` |
| **F34** | Sequential Reranker Calls Bottleneck | DEFERRED | To Phase 5.8p.1 (rerank-batch endpoint) |
| **F35** | Ingestion Stage 2 Progress Blindness | DEFERRED | To Phase 5.8p.2 (chunk counter + ETA UI) |
| **F36** | fitz Deprecation in PyMuPDF | CLOSED | `3d142d3` (`structure.py` updated to `pymupdf`) |

---

## 7. Deferred Work / Backlog

- **v1.x Tasks:**
  - F31.3 math-density gating heuristic (avoiding hex table misclassification).
  - Dynamic import / bundle splitting for KaTeX (`+260 kB` JS).
  - Discussion mode and Story mode (separate future roadmaps, removed from v1.0).
  - Adaptive concurrency controller (insufficient data; static N=5 is reliable).
- **Explicitly Out of Scope for v1.0:**
  - Cloud / multi-tenant backend (Omnitome is local-first desktop).
  - External search expansion beyond Wikipedia / OpenLibrary.
- **Known Limitations Shipped With:**
  - Legacy PUA glyphs outside F8EB–F8F8 emit honest placeholder.
  - Full test suite runtime ~5–7 minutes without fast/full split.
  - Chapters lacking headings rely on numeric prefix or parent promotion.

---

## 8. Next Session Opener

1. Verify HEAD = `df9bff0` (or docs close commit), working tree clean.
2. Confirm sidecar running on `127.0.0.1:8765` (`/v1/health` returns ready).
3. Execute F32.2a: Move chapter `structural_role` filtering from frontend hook to `backend/routes/chapterRoutes.js` (`/api/books/:id/chapters`).
4. Begin Phase 5.8p.1 (Performance Batching):
   - Add batched rerank endpoint (`/v1/nlp/rerank-batch`) to sidecar to eliminate 2,730 sequential HTTP calls.
   - Bound pdfmath execution with timeout / page limits.

---

## 9. Standing Rules

- **Raw Evidence Over Summaries:** Every test claim requires verbatim terminal output. Summaries without real filenames are rejected.
- **No Commits on Dirty Tree or Red Suite:** Preconditions and postconditions checked before every commit and push.
- **Agents Never Declare Phase Closure:** Phase closure is declared by user after docs-close and tagging.
- **Strict Blast Radius:** Touch only explicitly permitted files. Stop immediately if unexpected changes occur.
- **Node Owns SQLite & LLM Routing:** Sole writer boundary. Python is purely stateless/sidecar compute.
- **Verify-Before-Stage:** Check file byte counts (`> 0`) and search patterns before staging.
- **Never `git reset --hard`:** Use targeted `git checkout HEAD -- <file>` for drift recovery.

---

## 10. Reference

- `docs/PRODUCT_VISION.md` — Core thesis, invariants, three laws
- `docs/CONTINUITY.md` — 60-second orientation for new chats/assistants
- `docs/ROADMAP_2026-09.md` — Long-term phase map
- `docs/ARCHITECTURE_AUDIT.md` — Backend subsystem architecture
- `docs/RIGHTS.md` — Licensing and fixture rights
- `docs/CANONICAL_TEST_BOOK.md` — Ground truth test fixture specs
- `docs/DESIGN_SECTION_CLASSIFICATION.md` — F32 / F32.1 structure detection design
- `docs/DESIGN_MATH_EXTRACTION.md` — F31 math extraction architecture
- `docs/DESIGN_CHATLOG_PARSING.md` — F24 chat-log detection and parsing design
- `docs/session-logs/` — Detailed chronological build logs (including `2026-10-07.md`)
- *Historical note:* Earlier phase logs archived to `docs/session-logs/2026-10-*.md`.


---

## Current State (2026-10-09 early AM)

**HEAD:** 3174b83
**Tree:** clean
**Origin:** synced

## Phase Status

- F32.3b  TOC level-1 filter + roles: CLOSED
- F37     Python embedder default: CLOSED
- F37.2   Batch size 75 + caller batching: CLOSED
- F37.5   Pipeline reliability: CLOSED
- F37.6   4GB GPU batch size: CLOSED
- F37.7   FP16 + warmup + telemetry: CLOSED
- F38     Chapter synthesis quality: OPEN (next session)
- F39     TOC-listing leakage: OPEN
- F37.1   Runtime ONNX fallback: OPEN (deferred)
- F37.3   Frontend warmup UX: OPEN (deferred)
- 5.8i    Frontend walkthrough: QUEUED

## Deferred to v1.5

- F40 — Layout-aware PDF parsing (Marker / LayoutParser style).
  Reason: current pipeline (PyMuPDF + TOC + structural roles) already
  handles Reddi ML Systems Vol 1 (508K words, 256-entry TOC). Adding
  a layout-aware model would introduce a second structural authority
  and reopen closed work. Revisit only if a specific layout failure
  surfaces.

- F41 — Hardware-aware model routing (unload OCR/reranker when idle).
  Reason: after F37.7 FP16, BGE-M3 sits at ~1.1 GB. No memory pressure
  remains on the 4 GB RTX 3050 target. Fixing a problem that no longer
  exists would add complexity for no gain.

These are deliberately parked. Both would be justified only on
significantly more capable hardware (RTX 5080/5090 class or a
60-series laptop in the future). Current hardware, current pipeline,
and current v1.0 scope are complete without them. Adding them now
would be scope creep for its own sake.

## Next Session Opener

1. Verify HEAD = 3174b83, tree clean
2. Priority: **F38** — chapter synthesis quality. Chapter 1 of
   Reddi failed twice (LLM produced 380-590 words vs 236-354 clamp).
   Needs a diagnostic session on the compression contract + prompt.
3. Secondary: F39 (TOC-listing filter) — small, bounded.
4. Then 5.8i frontend walkthrough OR F37.1/F37.3 polish.

## Standing Rules (unchanged)

- Raw evidence over summaries
- No commits on dirty tree or red suite
- Agents never declare phase closure
- One workstream per session
- VS Code closed during Antigravity edits
- Never git add -f on gitignored files
- Compress evidence before transmitting to LLM
- Prefer targeted git checkout HEAD -- <file> over destructive reset
- Every prompt includes "attempt at most N times, then stop"
