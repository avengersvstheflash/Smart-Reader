# Omnitome — Session Handoff

> Last updated: 2026-10-15 evening  
> Repository: github.com/avengersvstheflash/Smart-Reader  
> Purpose: Full orientation in one turn for any assistant. Answers: *where are we, how do we work, what is next.*

---

## Current State (2026-10-15 evening)

**HEAD:** fd42365 (fix(research): align append-source predicate with lifecycle (F79b.1))  
**Tree:** clean  
**Origin:** synced  
**Tests:** 57 unit suites + 1 corpus gate (10 fixtures) green  
**Latest tag:** v0.6.0  

### Phase Status
- Phase 5.8: CLOSED
- **Feature freeze: ACHIEVED for v1.0**
- F52 (Library/Research State Coordination): CLOSED — 5 sessions
- F65-F72 (pipeline reliability arc): CLOSED
- F42 (corpus release gate): CLOSED
- F51 series (a–h.3.1): CLOSED
- F49d.1 + F49d.2: CLOSED
- F56, F58, F61, F62, F64: as noted per finding
- All polish batches (A, B, C, D, E): CLOSED

### Next Session Opener
1. Verify HEAD = fd42365, tree clean, origin synced
2. Priority: **Series 3 — Kokoro TTS (Phase 5.9)**
   - S1: Python sidecar /v1/tts/synthesize + Node client
   - S2: Reader playback + sentence-level highlighting
   - S3: Voice selection + polish
3. Then: Tauri packaging (Series 4, 5-8 sessions)
4. Then: Release (Series 5, 3 sessions)

### Findings Ledger (final)
| ID | Name | Status | Location / Resolution |
|---|---|---|---|
| F52 | Library/Research State Coordination | CLOSED | `database.js`, `bookLifecycleService.js` (5 sessions) |
| F65 | Sequential pipeline execution | CLOSED | `bookService.js` (Node RAM drop 14.6 GB → 296 MB) |
| F66 | "Ready" status after full pipeline | CLOSED | `importQueueService.js` |
| F67 | Test fixture leak into data.db | CLOSED | `import_queue_pipeline_test.js` DB isolation |
| F68 | Parallel synthesis opt-in setting | CLOSED | `settingsService.js` |
| F69 | Rich stage checklist UX | CLOSED | `PersistentImportWidget.tsx` |
| F70 | Book lifecycle timestamps | CLOSED | `database.js`, `bookRepository.js` |
| F71 | Dynamic reranker timeout scaling | CLOSED | `synthesisService.js` |
| F72 | Capacity-aware sidecar backpressure | CLOSED | `sidecarBase.js` |
| F73 | Reranker latency threshold raised | CLOSED | `synthesisService.js` (threshold 0.9 * timeout) |
| F74 | Await reranker LOADING state | CLOSED | `synthesisService.js` (up to 30s warm-up wait) |
| F77 | Predictive monotonic ETA counter | CLOSED | `useImportQueueStore.ts` rolling average |
| F54 | Synopsis regenerate button | CLOSED | `BookDetailsRoute.tsx`, `f54_synopsis_regenerate_test.js` |
| F57 | Separate build3a into NETWORK_SUITES | CLOSED | `scripts/run-all-tests.js` offline skip |
| F58.1 | Dossier dedup by ID instead of title | CLOSED | `importQueueService.js`, `f58_1_dossier_dedup_test.js` |
| F78 | Persistent import widget right-side dock | CLOSED | `PersistentImportWidget.tsx` (48px rail collapse) |
| F79a | Remove dead "Supporting materials" | CLOSED | `BookDetailsRoute.tsx` |
| F80 | Metadata visual stat blocks layout | CLOSED | `BookDetailsRoute.tsx` (responsive grid) |
| F82 | Split synthesize-more hero control | CLOSED | `ChapterSynthesisButton.tsx` (Option B split dropdown) |
| F81 | Omni reading time in book metadata | CLOSED | `bookService.js`, `BookDetailsRoute.tsx`, `f81_omni_reading_time_test.js` |
| F79b | Append source to dossier | CLOSED | `bookRoutes.js`, `AttachSourceModal.tsx`, `ResearchViewerRoute.tsx` |
| F39.1 | Ancestor regex false-positive guard | CLOSED | `editorialPlanner.js` (prose fragment guard) |
| F83 | markdownParser infinite loop guard | CLOSED | `markdownParser.js` (stranded `#` line guard) |
| F81.1 | Per-row fallback for omni word count | CLOSED | `bookService.js` (`COALESCE(word_count, LENGTH(content)/5, 0)`) |
| F82.1 | Split button visual unification + motion | CLOSED | `ChapterSynthesisButton.tsx` (shared group motion) |
| F79b.1 | Align append-source with lifecycle | CLOSED | `bookRoutes.js` (`book_lifecycle.in_research = 1`) |

### Open v1.0.1 / v1.x
| ID | Name | Status | Effort |
|---|---|---|---|
| F84 | Sidecar-required tests should SKIP visibly | v1.0.1 | 30 min |
| F38.x | Dense-chapter overshoot (auto-resynth bounded) | v1.0.1 | File only |
| F61 | OCR scan throughput (~7-10 s/page) | v1.x | Deferred |
| F64 | Frontend bundle >500 KB | v1.x | Deferred |

### Standing Rules (unchanged + one added)
- Raw evidence over summaries
- No commits on dirty tree or red suite
- Agents never declare phase closure
- One workstream per commit (not per day)
- VS Code closed during Antigravity edits
- Never git add -f on gitignored files
- Compress evidence before transmitting to LLM
- Prefer targeted git checkout HEAD -- <file> over destructive reset
- Every prompt includes "attempt at most N times, then stop"
- Kill servers before running full suite
- Diagnostic prompts must not modify files even for real bugs
- **New:** When running the full test suite, ensure the Python sidecar is running. Suites that need it currently wait through internal timeouts silently (see F84).

### Roadmap to v1.0
Remaining:
- Kokoro TTS — 3 sessions
- Tauri packaging — 5-8 sessions
- Release — 3 sessions

Total: ~11-14 sessions. Realistic timeline: 5-8 days.

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
  - *Python sidecar (127.0.0.1:8765):* PaddleOCR, pysbd sentence splitting, BGE-M3 embeddings (FP16 CUDA), BGE reranker v2, DOCX/RTF parsing, PyMuPDF structure detection, pdfmath extraction, Lifecycle Manager (idle unload daemon).
  - *Hard boundary:* Node is the sole SQLite writer. Python never writes directly to SQLite.
- **Provider Abstraction:**
  - OpenRouter (cloud fallback) OR Local (OpenAI-compatible: Ollama at `http://localhost:11434/v1`, LM Studio, llama.cpp, vLLM).
  - *Principle:* Ollama-first UX, OpenAI-compatible architecture.
- **Trust Boundaries:** Node owns LLM routing and provider selection. Python NEVER calls an LLM. Local-only configurations never make outbound cloud calls.
- **Architecture Additions (F51 & F48–F50 Series):**
  - **Encoding detection layer:** Tier 1 BOM sniffing + UTF-8 validation + iconv fallback, plus Tier 2 `jschardet` sampling (64KB sample, <0.3ms UTF-8 fast-path, confidence threshold 0.15).
  - **CJK-aware word counting:** Unified `countWords()` helper (space tokens + CJK chars * 0.7) guarding pre-LLM filters, chunker merge floors, and synthesis bounds.
  - **Aozora structural detection:** Heading classification (`AOZORA_HEADING_REGEX` + `JAPANESE_CHAPTER_REGEX`) segmenting single-line annotations without dropping canonical block content.
  - **Bounded embed attention:** Sidecar configuration (`max_seq_length = 2048`, `batch_size = 4`) avoiding quadratic VRAM explosion on large Japanese chapters.
  - **Synopsis circular refresh:** Fire-and-forget synopsis regeneration triggered upon chapter synthesis completion to eliminate input starvation.

---

## 4. Pipeline (current)

The ingestion pipeline executes sequentially across five stages:
1. **Stage 1: Ingest & Parse (`ingestionService.js`):** Format detection, encoding detection (`decodeTextBuffer`), structure extraction (TOC/heuristics/Aozora), OCR fallback on image-only PDFs, chapter building.
2. **Stage 2: Semantic Indexing (`semanticLifecycle.js`):** Chunking (merge-back floor 75w, max chunk size guard 8K chars) & BGE-M3 embedding (batch size 16, FP16 CUDA, bounded attention). Reuses identical vectors via content-hash caching. Await barrier ensures downstream stages execute on complete indexed data.
3. **Stage 3: Classification (`bookClassifier.js`):** Front-matter detection, structural roles, section classification.
4. **Stage 4: Outline Generation (`editorialService.js`):** Single-book or multi-book outline planning with chapter deduplication (`deduplicateChapterTitles`).
5. **Stage 5: Synopsis & Synthesis (`intelligentSummarizer.js`, `synthesisService.js`):** Opening prose extraction, initial chapters auto-synthesized within range [150, 500] words with `[TITLE: ...]` generation and prior-draft retry context. Non-blocking provenance verification pass links claims to source chunks.

---

## 5. Sidecar Lifecycle (F43)

- **Architecture:** Documented in `docs/DESIGN_SIDECAR_LIFECYCLE.md`. Central `LifecycleManager` coordinates model acquisition, state transitions (`UNLOADED`, `LOADING`, `LOADED`, `UNLOADING`), and idle eviction.
- **Idle Thresholds:** Per-model configuration:
  - PaddleOCR: 300s (5m, `SIDECAR_OCR_IDLE_SEC`)
  - BGE Reranker: 600s (10m, `SIDECAR_RERANKER_IDLE_SEC`)
  - BGE-M3 Embedder: 900s (15m, `SIDECAR_EMBED_IDLE_SEC`)
- **Daemon Loop:** Background thread running on a 10s tick; evicts models exceeding TTL only when `in_flight == 0`. Controlled by master toggle `SIDECAR_IDLE_UNLOAD_ENABLED` (default true).
- **Measured Impact:**
  - Eviction frees **3,256 MiB GPU VRAM** (3,359 MiB → 103 MiB) and **543 MB RSS**.
  - Transparent auto-reload on demand: cold embedding request loads BGE-M3 in **~6.5s**.

---

## 6. Deferred to v1.x / v1.5

- **F40 — Layout-aware PDF parsing (Marker / LayoutParser style):** Current PyMuPDF + TOC pipeline handles Reddi ML Systems (508K words) without issue. Reopening layout parsing adds architectural complexity without justified gain. Deferred to v1.5.
- **F41 — Hardware-aware model routing:** Superseded by F43 LifecycleManager idle eviction, which drops VRAM to 103 MiB automatically. Deferred to v1.5.
- **F44 — Raise import size cap:** Superseded by F45 configurable `IMPORT_MAX_SIZE_MB` (50–200 MB).
- **F51a Tier 3 — Deep learning encoding detection:** Tier 1 + Tier 2 (BOM + UTF-8 + `jschardet`) cleanly solve all target formats without neural model overhead.

---

## 7. Reference

- `docs/session-logs/2026-10-15.md` — Post-session-close polish arc + design decisions
- `docs/session-logs/2026-10-14.md` — F52 architecture + F65–F72 pipeline reliability
- `docs/session-logs/2026-10-13.md` — F51h arc close + F58 super-prompt + F42 corpus gate
- `docs/session-logs/2026-10-12.md` — F51 series close + Aozora/Japanese ingestion end-to-end
- `docs/session-logs/2026-10-10.md` — F43 close, F38 polish, cross-format validation
- `docs/PRODUCT_VISION.md` — Core thesis, invariants, three design laws
- `docs/CONTINUITY.md` — 60-second orientation for new chats/assistants
- `docs/ROADMAP_2026-09.md` — Long-term phase map
- `docs/ARCHITECTURE_AUDIT.md` — Backend subsystem architecture
- `docs/DESIGN_SIDECAR_LIFECYCLE.md` — F43 sidecar lifecycle architecture
- `docs/session-logs/` — Detailed chronological build logs
