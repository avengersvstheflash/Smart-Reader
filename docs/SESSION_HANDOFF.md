# Omnitome — Session Handoff

> Last updated: 2026-10-16  
> Repository: github.com/avengersvstheflash/Smart-Reader  
> Purpose: Full orientation in one turn for any assistant. Answers: *where are we, how do we work, what is next.*

---

## Current State (2026-10-16 late)

**HEAD:** 498a54d (feat(reader): podcast auto-advance mode (S10, F89))  
**Tree:** clean  
**Origin:** synced  
**Tests:** 58 unit suites + 1 corpus gate (10 fixtures) green  
**Latest tag:** v0.6.0  

### Phase Status
- Phase 5.8: CLOSED (feature freeze achieved 2026-10-15)
- **Phase 5.9 (Series 3 — Kokoro TTS): CLOSED**
- Series 1 (structural gate): CLOSED
- Series 2 (pre-Tauri polish): CLOSED
- Series 4 (Tauri packaging): NOT STARTED — next

### Series 3 Ledger (Kokoro TTS)
| Session | Commit | Scope |
|---|---|---|
| S07 | 8cc60da | Sidecar endpoint /v1/tts/synthesize + Node ttsClient + cache |
| S08 | dbcf605 | Reader playback UI (dual-deck audio, sentence highlighting, auto-scroll) |
| S09 | 4452f34 + 29c7857 | TTS settings card (voice/speed/autoScroll/cache/keepLoaded) + cold-start UX (F88) + docs close |
| S10 | 498a54d | Podcast auto-advance mode (F89) |

### Next Session Opener
1. Verify HEAD = 498a54d, tree clean, origin synced
2. Priority: **Series 4 — Tauri packaging (Phase 6)**
   - First: read/update docs/DESIGN_TAURI_PACKAGING.md
   - Design decisions already drafted: D1 (Windows code signing — defer to v1.0.1),
     D2 (PyInstaller frozen sidecar), D3 (BGE-M3 download-on-first-use),
     D4 (Windows-only v1.0), D5 (two-installer strategy), D6 (Cloudflare R2 + Pages)
   - Add D7: Resource Manager architecture (from F90/RAM discussion)
   - Planned session split: S11 scaffold → S12 bundle Node+Python+BGE-M3 →
     S13 Kokoro + Resource Manager → S14 code signing → S15 GitHub Releases
3. Then: Series 5 (Release, 3 sessions)

### Findings Ledger — Series 3 additions
| ID | Name | Status | Location |
|---|---|---|---|
| F85 | Kokoro TTS sidecar + Node client + cache | CLOSED | sidecars/python/tts/, backend/services/ai/ttsClient.js |
| F86 | Settings atomic-write temp file cleanup | CLOSED | backend/services/settings/settingsService.js |
| F87 | Voice list alignment (agent prose drift during S08 reporting) | CLOSED — no action | — |
| F88 | Cold-start UX (warming chip + keepLoaded setting) | CLOSED | useTtsPlayer.ts, lifecycle.py |
| F89 | Podcast auto-advance mode | CLOSED | useTtsPlayer.ts, ReaderView.tsx |
| F90 | Ambient background music (lo-fi/reading BGM) | OPEN — v1.1 | TBD |

**F90 approach (v1.1):** Generate 3-5 minute loop via Google AI music tooling
(AI Pro subscription). Archive generation date + applicable terms in
RIGHTS.md. Bundle with app as opt-in toggle. Zero external licensing cost.

### Open v1.0.1 / v1.x / v1.1 backlog
| ID | Name | Target |
|---|---|---|
| F38.x | Dense-chapter overshoot (auto-resynth bounded, no fix needed) | v1.0.1 note |
| F61 | OCR scan throughput (~7-10 s/page) | v1.x |
| F64 | Frontend bundle >500 KB (833 KB current) | v1.x |
| F84 | Sidecar-required tests SKIP visibly (F57 pattern extension) | v1.0.1 |
| F90 | Ambient background music | v1.1 |
| — | Cache compression (Opus post-playback) | v1.1 |
| — | Chapter audio export to MP3 | v1.1 |

### Evidence discipline note (Series 3)
- S08 completion report described the voice list incorrectly in prose
  (agent wrote "af_bella/am_michael" in the summary, actual code is
  "af_heart/am_adam/bf_alice/bm_george"). Diagnostic git grep confirmed
  the code was correct. Reminder: verify agent prose against raw code
  before acting on it.
- S09 first pass silently skipped F88 (long prompt, sub-deliverable missed).
  Second pass with plan-gate caught it. S10 plan-gate held.
- S10 verification was a programmatic state-machine run (not real audio
  playback). The real-playback cross-chapter test is deferred to the next
  manual frontend walkthrough.

### Standing Rules (unchanged + one note)
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
- When running the full test suite, ensure the Python sidecar is running. Suites that need it currently wait through internal timeouts silently (see F84).
- Before approving long prompts with multiple sub-deliverables, require a plan artifact (agent enumerates every file + state field it will touch). This catches silent skips.

### Roadmap to v1.0
Remaining:
- Tauri packaging (Series 4) — 5-8 sessions
- Release (Series 5) — 3 sessions

Total: ~8-11 sessions. Realistic timeline: 4-6 days.

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
