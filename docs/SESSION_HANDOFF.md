# Smart Reader / Omnitome — Session Handoff

> Last updated: 2026-10-10  
> Repository: github.com/avengersvstheflash/Smart-Reader  
> Purpose: Full orientation in one turn for any assistant. Answers: *where are we, how do we work, what is next.*

---

## 1. Current State

- **HEAD:** f586e9d (before close commit)
- **Tree:** clean
- **Origin:** synced with `main`
- **Latest Tag:** `v0.6.0`
- **Test suite count:** 40 registered suites (`node scripts/run-all-tests.js`)
- **Full suite status:** ALL 40 SUITES PASS cleanly (with build3a network-hang caveat)

### Recent Commit Trail
- `f586e9d` — F38.9a: register OCR timeout tests + harden surrogate test
- `6cd3fe1` — F38.9: OCR pipeline hardening for scanned/non-standard PDFs
- `3e32cfa` — F38.5: await semantic indexing
- `1d81623` — F38.3: LLM-generated chapter titles + positional placeholder
- `1b0f5cf` — docs: defer F40 + F41 to v1.5 with rationale
- `d0bbce7` — F38.2b: register manual resynthesize unit test suite
- `fedeee8` — F38.2a: extract inline chapter list into SmartChapterList
- `8e67d44` — F38.1: manual resynthesize path for failed chapters
- `cdb11ce` — F38: range prompt + widened validation [150, 500]

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
- **Provider Abstraction:**
  - OpenRouter (cloud fallback) OR Local (OpenAI-compatible: Ollama at `http://localhost:11434/v1`, LM Studio, llama.cpp, vLLM).
  - *Principle:* Ollama-first UX, OpenAI-compatible architecture.
- **Trust Boundaries:** Node owns LLM routing and provider selection. Python NEVER calls an LLM. Local-only configurations never make outbound cloud calls.
- **Sidecar Endpoints:**
  - `GET /v1/health` / `GET /v1/ready` — readiness check & warmup status
  - `POST /v1/ocr/pdf` — PaddleOCR direct sRGB rasterization, dark-mode boost, dynamic scaling timeout
  - `POST /v1/nlp/split` — sentence splitting via pysbd
  - `POST /v1/nlp/chunk` — token-bounded chunking
  - `POST /v1/nlp/slice` — surrogate-sanitized slice bounds
  - `POST /v1/nlp/rerank` / `/v1/nlp/rerank-batch` / `/v1/nlp/rerank-batch-multi` — BGE-reranker-v2-m3 scoring
  - `POST /v1/embed/batch` — BGE-M3 dense embeddings (FP16 optimized, 1024d)
  - `POST /v1/parse/docx`, `/rtf` — document text extraction
  - `POST /v1/parse/structure` — PyMuPDF TOC + font-size heuristics (Layer 0/1)
  - `POST /v1/math/extract` — pdfmath LaTeX block extraction (isolated, gated)

---

## 4. Pipeline (current)

The ingestion pipeline executes sequentially across five stages:
1. **Stage 1: Ingest & Parse (`ingestionService.js`)** — Format detection, fast structure extraction (TOC/heuristics), OCR fallback on image-only PDFs, chapter building.
2. **Stage 2: Semantic Indexing (`semanticLifecycle.js`)** — Chunking & BGE-M3 embedding (batch size 16). Reuses identical vectors via content-hash caching. Await barrier ensures downstream stages execute on complete indexed data.
3. **Stage 3: Classification (`bookClassifier.js`)** — Front-matter detection, structural roles, section classification.
4. **Stage 4: Outline Generation (`editorialService.js`)** — Single-book or multi-book outline planning with chapter grouping.
5. **Stage 5: Synopsis & Synthesis (`intelligentSummarizer.js`, `synthesisService.js`)** — Initial chapters auto-synthesized within range [150, 500] words with `[TITLE: ...]` generation. Non-blocking provenance verification pass links claims to source chunks.

---

## 5. Phase Status

- **Phase 5:** CLOSED
- **Phase 5.7.3:** CLOSED
- **Phase 5.8:** CLOSED
- **Phase 5.8a/c:** CLOSED (Omnitome Rebrand & Omni Theme)
- **F37.x series:** CLOSED (FP16 breakthrough, sidecar warmup, pipeline ETA telemetry, batch sizing)
- **F38 series:** CLOSED (F38 range contract, F38.1 manual recovery, F38.2a/b SmartChapterList extract & test suite, F38.3 LLM titles, F38.5 await indexing, F38.9/F38.9a OCR hardening)
- **F39:** PARTIALLY MITIGATED (TOC-listing leakage display layer)
- **F40, F41:** DEFERRED to v1.5

---

## 6. Open Findings

- **F38.11** — Undersized chunk (<75w) fails whole chapter synthesis. Extend chunk merge-back to 75w floor. Status: OPEN (Priority 2).
- **F38.12** — LLM overshoots 500-word ceiling on short-word content (poetry, dense technical prose). Triggers 2-6 retry calls. Status: OPEN (Priority 1).
- **F38.13** — Duplicate chapter titles when chapters cover the same subject. Status: OPEN.
- **F38.14** — Recursive title prefix pollution from repeated heading labels. Status: OPEN.
- **F38.15** — Synopsis retry cannot recover from degenerate output. Short-circuit identical/sub-minimum output. Status: OPEN.
- **F38.16** — Separator chunk logging duplicated in classify and outline. Status: OPEN.
- **F42** — Diverse fixture corpus public-domain ladder (fiction, poetry, non-English, legacy scans, reports, EPUB/DOCX/RTF). Status: DEFERRED (v1.0 Gate).
- **F43** — Sidecar resource lifecycle: idle unload strategy (Option A). Status: DEFERRED (v1.0 Gate).
- **F44** — Raise import size cap from 50 MB. Status: DEFERRED (v1.5).

---

## 7. Deferred to v1.5

- **F40 — Layout-aware PDF parsing (Marker / LayoutParser style).**  
  *Reason:* Current pipeline (PyMuPDF + TOC + structural roles) already handles Reddi ML Systems Vol 1 (508K words, 256-entry TOC). Adding a layout-aware model would introduce a second structural authority and reopen closed work. Revisit only if a specific layout failure surfaces.

- **F41 — Hardware-aware model routing (unload OCR/reranker when idle).**  
  *Reason:* After F37.7 FP16, BGE-M3 sits at ~1.1 GB. No memory pressure remains on the 4 GB RTX 3050 target. Fixing a problem that no longer exists would add complexity for no gain.

- **F44 — Raise import size cap in v1.5.**  
  *Reason:* Current cap is 50 MB (covers 99% of real use; blocks scanned yearbooks). Rationale tied to CPU/memory constraints on 4 GB laptop. Revisit at v1.5 hardware upgrade.

These are deliberately parked. Both would be justified only on significantly more capable hardware (RTX 5080/5090 class or a 60-series laptop in the future). Current hardware, current pipeline, and current v1.0 scope are complete without them. Adding them now would be scope creep for its own sake.

---

## 8. Next Session Opener

1. Verify HEAD, tree clean.
2. Priority order:
   - **a.** F38.12 diagnostic + prompt tightening (highest frequency issue).
   - **b.** F38.11 chunk merge-back extension (small, unblocks fiction).
   - **c.** F42 fixture corpus scaffolding (v1.0 gate).
   - **d.** F43 sidecar idle unload design.
3. Secondary: 5.8i walkthrough.

---

## 9. Standing Rules

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
- `docs/session-logs/2026-10-09.md` — F38 series close, OCR hardening, cross-document validation
- `docs/session-logs/` — Detailed chronological build logs
