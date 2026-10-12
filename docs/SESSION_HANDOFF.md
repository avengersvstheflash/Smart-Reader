# Omnitome — Session Handoff

> Last updated: 2026-10-13  
> Repository: github.com/avengersvstheflash/Smart-Reader  
> Purpose: Full orientation in one turn for any assistant. Answers: *where are we, how do we work, what is next.*

---

## Current State (2026-10-13)

**HEAD:** <pending docs-close commit>  
**Tree:** clean  
**Origin:** synced  
**Tests:** 48 unit suites + 1 corpus gate (10 fixtures) green  
**Latest tag:** v0.6.0  

### Phase Status
- Phase 5.8: IN PROGRESS
- Phase 5.8.0: CLOSED
- F51 series (a–h.3.1): CLOSED
- F56 (section classifier bound): CLOSED
- F58 (persistent import queue): CLOSED
- F42 (corpus release gate): CLOSED
- F49d + F49d.2: CLOSED
- 5.8d + 5.8e + 5.8m: CLOSED (via F58)

### Next Session Opener
1. Verify HEAD, tree clean, origin synced
2. Priority 1: **F49d.1** — narrow [PARTIAL] trigger
   - Currently fires on books with TOC + opening + closing but no preface
   - Bounded fix in intelligentSummarizer.js prompt wording
3. Priority 2: **F57** — decide build3a disposition
   - Network hang masks downstream red
   - Either fix or move to a network-required tier
4. Priority 3: **5.8i** — frontend walkthrough (bounded, high-value)
5. Priority 4: **F58.1** — dossier dedup hardening
6. Priority 5: **F39.1** — ancestor regex false-positive on prose

### Findings Ledger (recent)
| ID | Name | Status | Location |
|---|---|---|---|
| F42 | Corpus release gate | CLOSED | scripts/run-corpus-tests.js |
| F49d | [PARTIAL] strip from stored synopsis | CLOSED | intelligentSummarizer.js |
| F49d.1 | [PARTIAL] trigger too aggressive | OPEN | intelligentSummarizer.js prompt |
| F49d.2 | Migration ordering: metadata_json ref before ALTER | CLOSED | database.js |
| F51h.3.1 | Non-TOC prologue/epilogue classification (follow-up to F51h.3) | CLOSED | documentStructureEngine.js |
| F56 | Section classifier LLM bound + fast path | CLOSED | sectionClassifier.js |
| F57 | build3a network hang masks downstream red | OPEN | build3a_test.js |
| F58 | Persistent import queue + expanded web discovery | CLOSED | importQueueService.js |
| F58.1 | Dossier dedup by title collides | OPEN | importQueueService.js |
| F39.1 | Ancestor regex false-positive on prose | OPEN | editorialPlanner.js |
| F38.11.x | Lone-fragment dropping for narrative content | OBSERVATION | semanticChunker.js |
| F54 | Synopsis re-synthesize button | OPEN | BookDetailsRoute.tsx |

### Standing Rules
- **Raw Evidence Over Summaries:** Every test claim requires verbatim terminal output. Summaries without real filenames are rejected.
- **No Commits on Dirty Tree or Red Suite:** Preconditions and postconditions checked before every commit and push.
- **Agents Never Declare Phase Closure:** Phase closure is declared by user after docs-close and tagging.
- **One Workstream Per Session:** Stick to the active task boundaries.
- **Strict Blast Radius:** Touch only explicitly permitted files. Stop immediately if unexpected changes occur.
- **Node Owns SQLite & LLM Routing:** Sole writer boundary. Python is purely stateless/sidecar compute.
- **Verify-Before-Stage:** Check file byte counts (`> 0`) and search patterns before staging.
- **Never `git reset --hard`:** Use targeted `git checkout HEAD -- <file>` for drift recovery.
- **Never `git add -f` on gitignored files.**
- **Attempt at Most N Times, Then Stop:** Bounded iteration.
- **Diagnostic Prompts Are Read-Only:** In diagnostic prompts, agent must not modify any file — even to fix a real bug. Fixes discovered during diagnostics are filed and handled in a follow-up task with explicit approval.

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

- `docs/session-logs/2026-10-13.md` — F51h arc close + F58 super-prompt + F42 corpus gate
- `docs/session-logs/2026-10-12.md` — F51 series close + Aozora/Japanese ingestion end-to-end
- `docs/session-logs/2026-10-10.md` — F43 close, F38 polish, cross-format validation
- `docs/PRODUCT_VISION.md` — Core thesis, invariants, three design laws
- `docs/CONTINUITY.md` — 60-second orientation for new chats/assistants
- `docs/ROADMAP_2026-09.md` — Long-term phase map
- `docs/ARCHITECTURE_AUDIT.md` — Backend subsystem architecture
- `docs/DESIGN_SIDECAR_LIFECYCLE.md` — F43 sidecar lifecycle architecture
- `docs/session-logs/` — Detailed chronological build logs
