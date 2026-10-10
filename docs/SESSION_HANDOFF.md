# Omnitome — Session Handoff

> Last updated: 2026-10-11  
> Repository: github.com/avengersvstheflash/Smart-Reader  
> Purpose: Full orientation in one turn for any assistant. Answers: *where are we, how do we work, what is next.*

---

## 1. Current State

- **HEAD:** 46232bb (before session close commit)
- **Tree:** clean
- **Origin:** synced with `main`
- **Latest Tag:** `v0.6.0`
- **Test suite count:** 41 registered suites (`node scripts/run-all-tests.js`)
- **Full suite status:** Passes cleanly (with build3a network-hang caveat)

### Recent Commits Shipped (F43 / F38 series)
- `46232bb` — F43 Phase 4 + 4a: Node-side lifecycle integration + regression fixes
- `fc638b8` — F43 Phase 3: daemon eviction tick — models unload after idle TTL
- `90d3046` — F43 Phase 2: wire embed, OCR, and reranker into LifecycleManager
- `18f7097` — F43 Phase 1: sidecar lifecycle state machine + endpoints (no model wiring)
- `3423233` — docs: F43 design — sidecar model lifecycle with idle unload
- `ba021a6` — F42: scaffold diverse fixture corpus for cross-format regression
- `72a5fb8` — F45: config-driven import size cap with frontend exposure
- `cb62a6f` — F38.8: prefix generated chapter titles with 'Chapter N:' in reader UI
- `d13dc0f` — F38.11: extend chunker merge-back to 75w + drop lone undersized fragments
- `a30a379` — F38.12: soften density mandate, restate ceiling, raise maxTokens, retry with prior draft

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
- **Sidecar Endpoints:**
  - `GET /v1/health` — process liveness check
  - `GET /v1/lifecycle/status` — per-model FSM state, idle seconds, in-flight count, memory metrics
  - `POST /v1/lifecycle/warm?model=<name>` — proactive model loading
  - `POST /v1/lifecycle/unload?model=<name>` — explicit model eviction
  - `POST /v1/ocr/pdf` — PaddleOCR direct sRGB rasterization, dynamic timeout
  - `POST /v1/nlp/split` — sentence splitting via pysbd
  - `POST /v1/nlp/chunk` — token-bounded chunking
  - `POST /v1/nlp/slice` — surrogate-sanitized slice bounds
  - `POST /v1/nlp/rerank` / `/v1/nlp/rerank-batch` / `/v1/nlp/rerank-batch-multi` — BGE-reranker-v2-m3 scoring
  - `POST /v1/embed/batch` — BGE-M3 dense embeddings (FP16 optimized, 1024d)
  - `POST /v1/parse/docx`, `/rtf` — document text extraction
  - `POST /v1/parse/structure` — PyMuPDF TOC + font-size heuristics (Layer 0/1)
  - `POST /v1/math/extract` — pdfmath LaTeX block extraction

---

## 4. Pipeline (current)

The ingestion pipeline executes sequentially across five stages:
1. **Stage 1: Ingest & Parse (`ingestionService.js`):** Format detection, fast structure extraction (TOC/heuristics), OCR fallback on image-only PDFs, chapter building.
2. **Stage 2: Semantic Indexing (`semanticLifecycle.js`):** Chunking (merge-back floor 75w) & BGE-M3 embedding (batch size 16, FP16 CUDA). Reuses identical vectors via content-hash caching. Await barrier ensures downstream stages execute on complete indexed data.
3. **Stage 3: Classification (`bookClassifier.js`):** Front-matter detection, structural roles, section classification.
4. **Stage 4: Outline Generation (`editorialService.js`):** Single-book or multi-book outline planning with chapter grouping.
5. **Stage 5: Synopsis & Synthesis (`intelligentSummarizer.js`, `synthesisService.js`):** Initial chapters auto-synthesized within range [150, 500] words with `[TITLE: ...]` generation and prior-draft retry context. Non-blocking provenance verification pass links claims to source chunks.

*F38.5 note:* All pipeline stages await fully. Stage timings reflect actual execution.

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
- **Node Integration:** `checkReady()` verifies process liveness; `checkModelReady(name)` checks model state; `warmModel(name)` triggers proactive warmup. Callers in `pdfjsParser.js` and `synthesisService.js` actively warm before invocation.

---

## 6. Phase Status

- **Phase 5:** 🟢 CLOSED
- **Phase 5.7.3:** 🟢 CLOSED
- **Phase 5.8.0:** 🟢 CLOSED
- **Phase 5.8a/c:** 🟢 CLOSED (Omnitome Rebrand & Omni Theme)
- **F37.x series:** 🟢 CLOSED (FP16 breakthrough, sidecar warmup, pipeline ETA telemetry, batch sizing)
- **F38 (core):** 🟢 CLOSED
- **F38.1 / .2a / .2b / .3 / .8 / .9 / .11 / .12:** 🟢 CLOSED
- **F42:** 🟢 SCAFFOLDED (7 documents across 6 formats in `backend/tests/fixtures/corpus/`)
- **F43 (Phases 1–4a):** 🟢 CLOSED (Sidecar model lifecycle with idle unload)
- **F45:** 🟢 CLOSED (Configurable `IMPORT_MAX_SIZE_MB`, 50–200 MB)
- **F40, F41, F51a:** ⏳ DEFERRED to v1.x / v1.5
- **F38.5 diagnostic-note:** ⚪ OPEN (non-blocking)
- **F48, F49, F50, F51b:** 🟡 OPEN (active priority)
- **F38.13–16:** ⚪ OPEN (polish)

---

## 7. Deferred to v1.x / v1.5

- **F40 — Layout-aware PDF parsing (Marker / LayoutParser style):** Current PyMuPDF + TOC pipeline handles Reddi ML Systems (508K words) without issue. Reopening layout parsing adds architectural complexity without justified gain. Deferred to v1.5.
- **F41 — Hardware-aware model routing:** Superseded by F43 LifecycleManager idle eviction, which drops VRAM to 103 MiB automatically. Deferred to v1.5.
- **F44 — Raise import size cap:** Superseded by F45 configurable `IMPORT_MAX_SIZE_MB` (50–200 MB).
- **F51a — ShiftJIS / non-UTF-8 text encoding detection:** Deferred to v1.x. Recommendation: Tier 1 detection (BOM sniff + UTF-8 validation + iconv-lite fallback for Latin-1, Windows-1252, ShiftJIS; ~30 lines).

---

## 8. Open Findings (Prioritized)

| Priority | ID | Description |
| :---: | :---: | :--- |
| **1** | **F49** | **Synopsis retry fabricates on empty inputs:** On empty section slices (e.g. *Reverend Insanity* Ch1), retry loop hallucinates unrelated text. Needs early bail-out when slice is below minimum word threshold. |
| **2** | **F51b** | **Max chunk size guard:** Prevent OOM crashes on giant inputs (such as unformatted text or mojibake). Assert chunk < 8K chars after chunking; force-split at sentence boundary; reject honestly if unsplittable. Keep in v1.0. |
| **3** | **F42** | **Fixture corpus regression suite:** Author automated test runner asserting pipeline success across the 7 scaffolded corpus fixtures. |
| **4** | **F48** | **Bibliographer publisher validation:** Filter out anti-piracy, scanlation, and copyright disclaimers from extracted publisher fields (surfaced on *Overlord*). |
| **5** | **F50** | **Outline heading deduplication:** Deduplicate redundant outline entries when sequential slices receive identical heading labels (*Eminence in Shadow* Ch1). |
| **6** | **F38.13–16** | **Small polish items:** Duplicate chapter titles, recursive prefix pollution, synopsis retry short-circuit, and separator logging deduplication. |

---

## 9. Next Session Opener

1. **Verify HEAD & Working Tree:** Ensure HEAD is clean on expected commit.
2. **Execute Priority Findings:** F49 (synopsis retry guard) → F51b (max chunk size guard) → F42 (fixture tests) → F48 (publisher filter) → F50 (heading deduplication).
3. **Phase 5.8i:** Frontend walkthrough and verification.
4. **Phase 5.8d:** Background import tracking (prerequisite for Tauri desktop packaging).

---

## 10. Standing Rules

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

---

## 11. Reference

- `docs/PRODUCT_VISION.md` — Core thesis, invariants, three design laws
- `docs/CONTINUITY.md` — 60-second orientation for new chats/assistants
- `docs/ROADMAP_2026-09.md` — Long-term phase map
- `docs/ARCHITECTURE_AUDIT.md` — Backend subsystem architecture
- `docs/RIGHTS.md` — Licensing and fixture rights
- `docs/CANONICAL_TEST_BOOK.md` — Ground truth test fixture specs
- `docs/DESIGN_SIDECAR_LIFECYCLE.md` — F43 sidecar lifecycle architecture
- `docs/DESIGN_SECTION_CLASSIFICATION.md` — F32 / F32.1 structure detection design
- `docs/DESIGN_MATH_EXTRACTION.md` — F31 math extraction architecture
- `docs/DESIGN_CHATLOG_PARSING.md` — F24 chat-log detection and parsing design
- `docs/session-logs/2026-10-10.md` — F43 close, F38 polish, cross-format validation
- `docs/session-logs/` — Detailed chronological build logs
