# Smart Reader — Session Handoff

> **Purpose.** Any assistant (Claude, GPT, Gemini, or a fresh DeepSeek) reads this and is fully oriented. Companion to `docs/ROADMAP_2026-09.md` (long-term), `docs/FRONTEND_BLUEPRINT.md` (narrative), `docs/FRONTEND_BLUEPRINT_SPEC.md` (contract). This file answers: *where are we, how do we work, what's next.*
>
> Working title: **Omnitome** (see PRODUCT_VISION.md §"Working title").

---

## 1. Where we are

**Phase 5.1 CLOSED 2026-09-24.** All 19 test suites green (verified by manual terminal run). Trust path intact. Provenance resolution contract verified end-to-end.

**Last shipped commit:** `ce5d475` — phase5.1b: GET provenance endpoint + tests + runner registration.

**Test state:** 19/19 root suites green. Frontend build clean, typecheck 0 errors. Runtime ~6–8 min.

**Next phase:** Phase 5.2 — Reader click-through UI (interactive provenance).

### What ships today

**Backend**
- PDF/EPUB/web/paste ingestion with structural recovery (chapter/section hierarchy, front/back matter classification)
- BGE-M3 1024d local embeddings (INT8, multilingual, 170+ languages, CLS pooling)
- Semantic chunking (350–500 word chunks) + indexing across chapter/book/library scopes
- Auto-classification on import: `contentType`, tags, reading level, target audience (4.10)
- Bibliographic metadata extraction during `CLASSIFICATION` (publisher, publication year, ISBN, author, subtitle) stored in `books.metadata_json` (5.1a)
- Editorial outline generation with 1,500–2,500 word source-unit slicing (4.8.3, 4.24 guard)
- Compression-not-summarization synthesis, 250–360 word Smart Chapters, ratio band [4.82, 7.28] (4.8.1)
- Synopsis from preface + TOC + strategic samples with word-count validation and retry (4.13)
- Job lifecycle: 6 stages (INGEST, SEMANTIC_INDEX, CLASSIFICATION, SYNOPSIS, SYNTHESIS, PROVENANCE_VERIFY), boot-time zombie sweep, INTERRUPTED rendering (4.11, 5.1b)
- Provenance resolution contract (5.1b): sentence-level segmentation, Signal A (`[Source N]` claims captured prior to strip), Signal C (BGE-M3 local paragraph/sentence cosine similarity), 8-case decision matrix with Signal B LLM arbitration fallback, ungrounded floor (<0.45), persisted in `paragraph_attributions`
- Provenance endpoints: `GET /api/representations/:id/provenance` and `POST /api/representations/:id/verify-provenance`
- Backfill policy: legacy representations without attribution return `{ paragraphs: [] }` with `verified_at: null` — zero batch re-generation
- Fallback honesty: `fell_back`, `fallback_reason`, `compression_violation`, `word_count_violation` metadata
- Test DB isolation — test runs no longer wipe the dev Library (4.25/A1)

**Frontend**
- Library with dynamic tag filter chips + Smart badge
- Book Details: hero, classification chips, bibliographic metadata, synopsis panel, chapter list, semantic intelligence panel, AI provider disclosure (4.10.5, 5.1a)
- Reader: Original/Smart toggle, three-layer mode resolution, keyboard shortcuts, auto-hide nav
- Import: File / Web / Paste tabs via `?tab=` URL param, full cinematic (page-turn → chunk-gather → tag-fade → synopsis text → chapter-card stack → completion cascade), reduced-motion collapse, mobile at 375px (4.7/4.7.1)
- Real upload progress via XHR, job-driven pipeline stepper polling at 500/800/1200ms (dynamic)

### Phase 4 & 5.1 shipped, complete list

4.5 → 4.6 → 4.7 → 4.7.1 → 4.7.5 → 4.8 → 4.8.1 → 4.8.2 → 4.8.3 → 4.9 → 4.10 → 4.10.5 → 4.11 → 4.11.1 → 4.11.5 → 4.11.6 → 4.12 (partially staged) → 4.13 → 4.13.1 → 4.14 → 4.15a → 4.15b → 4.16 → 4.19 → 4.20 → 4.21 → 4.21.1 → 4.24 → 4.25 → 5.1a → 5.1b

---

## 2. How we work

**Standard:** *"Something I can talk about with confidence, not shame."* Every claim verified against raw output, not model summaries. No commits on a dirty tree. No commits on a red suite. Divergence rebased, never force-pushed.

**Guardrails:**
- One workstream per session
- Commit docs before code
- Never commit `.env` or keys
- Chat logs are historical; the filesystem is current
- Escalate model thinking level only after failure
- **Verification evidence must always be pasted from actual terminal output, never asserted.** Fabricated evidence is a project-integrity failure (see §6).
- **Re-paste, don't mine.** If the prompt doesn't appear in current context, paste it again. Do NOT let the agent extract prompts from its own transcript logs.
- **After every commit, run `git status --short`.** If unexpected `M` lines appear, suspect buffer drift — `git diff` first, then `git checkout HEAD -- <file>`. Never `git reset --hard`.

**Content flow:** chat draft → user saves file in VS Code → commit. Antigravity writes to disk only from explicit prompts.

---

## 3. Model delegation matrix

| Task | Model | Level |
|---|---|---|
| Strategic/architectural | Gemini 3.1 Pro | High |
| UI design, component styling | Claude Sonnet 4.6 | adaptive |
| Backend wiring, hooks, API client, tests | Gemini 3.8 Flash | Medium |
| Build runs, git ops, file creation | Gemini 3.8 Flash | Low |
| Concurrency/timing bugs (escalation only) | Gemini 3.8 Flash | High |
| AI inference (production) | OpenRouter → DeepSeek V4 Flash | n/a |
| AI inference (planner path contingency) | TBD — upgrade if 4.24 guard produces repeated errors | — |
| Chat assistant / thinking partner | any capable model | — |

---

## 4. Next task

### Phase 5.2 — Reader click-through UI (interactive provenance)

**Goal:** Build the interactive Reader UI that consumes the Phase 5.1 provenance contract (`GET /api/representations/:id/provenance`) to connect Smart Reading sentences to their immutable source passages.

**Context:** PRODUCT_VISION.md reframed the product thesis: *"Smart is the product. Original is the proof."* The Original | Smart toggle is not a peer switch — the reader defaults to Smart and offers an interactive affordance. Clicking or hovering a Smart sentence/segment highlights its source passage or opens the source drawer positioned at the exact source chunk.

**Sequencing:**
- **5.1** — Backend provenance resolution contract (CLOSED 2026-09-24)
- **5.2** — Reader click-through UI (this task)
- **5.3** — Research mode collection view (depends on 5.1)
- **5.5** — Library polish + UI/UX backlog (see §8)
- **5.6** — Validation and refine loops (see §7)
- **5.7** — Python sidecar architecture decision (see below, also §9)

### Phase 5.7 — Python sidecar (detailed shape)

Split into three sub-phases. The sidecar proves the Node↔Python boundary; OCR ships working; extended formats and routing come after the boundary is proven.

**5.7.1 — Sidecar scaffold + OCR (2 sessions, ships working)**
- Python process with FastAPI (or bare HTTP) listening on `localhost:8765`
- Health endpoint: `GET /health` returns which services are enabled
- OCR endpoint: `POST /ocr` — PaddleOCR or equivalent, fully working
- Node-side integration: `backend/services/ingestion/ocrService.js` calls the sidecar
- Fallback: if sidecar is down, OCR-needed PDFs fail with the existing honest error — no regression
- **Ships: image-only PDFs start working end-to-end.**

**5.7.2 — Discussion + Story keep-holders (1 session, architecture only)**
- `POST /discussion` → HTTP 501 with `{ error: "not_implemented", message: "Scheduled for Build 6" }`
- `POST /story` → same pattern
- Health endpoint reports both as `disabled`
- Frontend can wire to these endpoints today; they return honest "not yet available"
- When Build 6/7 lands, we fill in the bodies — no contract change

**5.7.3 — Capability router + extended formats (1–2 sessions)**
- Ingestion router: extension-based first pass (`docx` → Python, `md` → Node)
- Content sniffing for PDFs: text coverage < 5% → Python OCR; complex tables → Python PyMuPDF
- Try-Node-then-fallback-to-Python on quality failure
- **Every routing decision logged with reason.**
- Ships: DOCX, RTF, and other Python-handled formats
- Scope discipline: do NOT build complexity heuristics, ML-based classification, or per-page routing until real user cases demand them. Start simple, extend only when a fixture fails.

**Total Phase 5.7: 4–5 sessions.**

**Rationale for the split.** 5.7.1 proves the cross-language boundary works and ships OCR — a real capability gap. 5.7.2 is pure scaffolding. 5.7.3 extends the router with real data from 5.7.1's Node-vs-Python quality differences on real fixtures.

---

## 5. Roadmap

**Phase 5** — Inline source tracker (the moat made interactive). 5.1 → 5.7 above.
**Phase 6** — Tauri package (3–5 sessions after Phase 5).
**Build 5** — Audio mode (Kokoro-82M default, cloud Qwen premium).
**Build 6** — Discussion mode (local Ollama multi-agent) + Python sidecar.
**Build 7** — Story mode (character sheet + SDXL + manga layout). Frozen until winter–spring 2027.
**Build 8** — Cross-lingual polish, JP/EU market readiness.

---

## 6. Tracked items

### Active bugs / observations (unresolved)

- **A3 — Synthesis reps landed at uniform 250 chars on canonical import (2026-09-23).** Cannot verify whether this is a cap, spec mismatch, or silent fallback without the Phase 5.6 validation loop. **Hard dependency on Phase 5.6.** Do not investigate A3 before 5.6 ships.
- **Kaggle import duplicated.** "Kaggle and Code Dojo 1" appears twice in Library with the same title. Cleanup: identify duplicate ID, mark one `status='failed'`.
- **Smoothed progress counter.** Backend emits discrete checkpoints; frontend snaps on poll. Fix: `useSmoothedProgress` hook — animate displayed value toward each new target. Never overshoot; snap to 100 on completion.
- **Test fixtures undersized for slicer.** `build4_2bc` test book now produces 1 outline chapter (was 6); `build4_2a` smoke test also produces 1. Assertions updated to pass, but fixtures should enlarge to 5,000–12,000 words for multi-chapter coverage. Not urgent.

### Informational — by design, not bugs

- **Phase 5.6 input — A vs C agreement rate varies by document type.** On the two-column ResNet fixture, Signal A agreed with C's top chunk in only 1 of 7 paragraphs (14%), producing 6 b_arbitrated calls. On the canonical textbook, agreement was 6 of 11 (55%). Root cause unknown — could be A emitting poorly-aligned citations on two-column content, or C's chunk boundaries not matching the paper's section structure. Investigate in Phase 5.6 with a correctness benchmark.
- **AI planning path — oversize units.** `plan()` (used only when `options.fast` is false — not during import) can assign 3,000–4,200 word source units to a single chapter. The 4.24 defensive guard applies only to `sliceIntoSourceUnits` (deterministic path). Tests `build4_1` and `build4_2a` exercise this and log oversize units as expected. Not a bug.
- **Parser chapter detection on SEC filings and two-column papers is shallow by design.** 4.15a: ResNet arXiv detected as 2 sections vs ~8 real; Apple 10-K as 3 vs ~20 real. The editorial planner re-segments body content into 1,500–2,500 word units regardless of source chapter boundaries — Smart Reader creates its own editorial structure, doesn't inherit source chapter counts.
- **`math-heavy.pdf` yields 1 editorial candidate from 61 chunks.** NIST FIPS 197 is 8 front_matter + 52 appendix + 1 chapter. Filter correctly rejects 60/61 as non-body. Honest behavior for a document shape that isn't book-like.
- **Synopsis degradation on preface-less sources.** SEC filings, pasted text, and some web dumps lack preface + TOC. Synopsis prompt receives `(None provided)`. Retry logic saves it today. Fragile. No fix scheduled.
- **Full suite runtime ~5–7 min.** Future: two-tier npm scripts (`test:fast` no-LLM, `test:full` including synthesis). Informational.
- **Cinematic pacing is fixed, not adaptive.** The import animation runs on a scripted timeline. If SEMANTIC_INDEX takes 90 seconds (BGE-M3 backpressure) the cinematic finishes early and sits on the last frame. Users may interpret this as "stuck." Fix queued as part of the Phase 5.x UI polish — read real job progress and estimate remaining time per stage.

### Hazards (rules learned from incidents)

- **Transcript spelunking — 7 incidents.** Agent searches its own `.system_generated/logs/transcript*.jsonl` for prompts rather than using pasted text. Caused wrong-phase execution once, mojibake and duplicate declarations in earlier sessions. **Rule: re-paste, don't mine.**
- **Buffer drift — 3 incidents.** Stale editor buffer flushes post-commit, corrupting working tree (duplicate loops, unclosed braces, re-injected old JSX). HEAD stays clean; only working tree corrupted. **Rule: after every commit, `git status --short`. If unexpected `M` lines appear, `git diff` then `git checkout HEAD -- <file>`.**
- **`git reset --hard HEAD` — 1 incident.** Used to discard drift post-commit. Safe once, destructive habit. **Rule: use `git checkout HEAD -- <file>`, never `git reset --hard` on a pushed branch.**
- **Antigravity append hazard — 3 incidents.** Agent's "replace" tooling sometimes appends new content to a stub instead of overwriting. Silent redeclare errors that `typecheck` may not catch if run before the write completes. **Rule: `git diff` after every "replace" task to confirm the old placeholder is gone.**
- **Fabricated verification — 1 incident (2026-09-23, most serious).** Phase 4.24 close-out reported a fabricated 17/17 test run — 15 file names that do not exist in `backend/tests/`. The guard code itself was real and verified independently by manual test runs. **Rule: verification evidence must always be pasted from actual terminal output. Any invented evidence is a project-integrity failure.**
- **NC-licensed fixtures were publicly redistributed (fixed 2026-09-23).**
  `practical_machine_learning.pdf` (CC-BY-NC-ND 4.0) and `code-heavy.pdf`
  (Think Python, CC BY-NC 3.0) were tracked in the public repo. Removed from
  HEAD, then from all history via `git-filter-repo` (tip commit rewritten
  `8d1f213` → `acf35ae`). All prior commit hashes changed.
  **Rule:** license-check any fixture before `git add`. See `docs/RIGHTS.md`.

### Closed (2026-09-24/25)

- **Phase 5.1b.2 — Empirical calibration of C-primary arbitration (2026-09-25).** Diagnostic across three fixtures (canonical textbook, Apple 10-K, ResNet two-column paper) revealed that C.margin is a document-class discriminator, not noise. Discrete-topic documents (SEC filings, tabular content) produce high margins (mean 0.155, max 0.292) because each paragraph maps to one distinct chunk — c_primary fires 80% of the time. Continuous-narrative documents (textbooks, papers) produce near-zero margins (mean 0.030) because chunks overlap by construction — c_primary fires 0% of the time; those paragraphs resolve via c_verified_by_a (when the LLM's citation agrees with C's top chunk) or b_arbitrated (when they disagree). Current thresholds retained. All 33 paragraphs produced C.top1 >= 0.75 and zero ungrounded rows.
- **Phase 5.1b.1 — C-primary arbitration.** Replaced the A_vs_C agreement matrix with C-primary logic. Signal C leads; Signal A corroborates when C is uncertain; Signal B fires only on ambiguous cases. The old cosine-of-weight-vectors metric was discarded as non-informative (measured A_vs_C mean 0.510 on canonical). Thresholds: C_HIGH=0.65, C_MEDIUM=0.45, C_LOW=0.30, C_MARGIN=0.10.
- **Phase 5.1a — Bibliographic metadata extraction.** Extracted publisher, publication year, ISBN, author, subtitle during `CLASSIFICATION` job. Stored in `books.metadata_json`. Minimal surface rendered in Book Details.
- **Phase 5.1b — Provenance resolution contract.** Sentence-level segmentation, 8-case decision matrix with Signal B LLM arbitration fallback, BGE-M3 local embedding similarity (Signal C), `paragraph_attributions` storage, non-blocking `PROVENANCE_VERIFY` pipeline step, `GET /api/representations/:id/provenance` endpoint. All 19 suites green. Backfill policy: legacy representations return `{ paragraphs: [] }`, no batch re-generation.

### Closed (2026-09-23)

- **A1 — Test DB isolation.** FIXED in 4.25. Test runner sets `DB_PATH=storage/test-data.db`. Dev DB (`storage/data.db`) no longer wiped by tests. Standalone test runs (bypassing `scripts/run-all-tests.js`) still use the real DB — documented limitation.
- **A2 — Job status strings.** CLOSED, not a bug. Writer (`jobRepository.complete()`) writes `'COMPLETED'`; all readers (`PipelineStepper.tsx`, `ImportCinematic.tsx`, `useJobs.ts`, `domain.ts`) match on `'COMPLETED'`. The 4.21.1 close-out note had an inaccurate reference to "SUCCESS."
- **A4 — `has_outline` flag.** FIXED in 4.25. Synopsis metadata now checks `outlineRepository.getByBookId(book.id)` and records `has_outline` honestly. Canonical import correctly writes `has_outline: true`.
- **A5 — Double-log cleanup.** FIXED in 4.25. `computeChapterWordBudget` emits only `logger.error` for the >2800 word condition.
- **Nine-bug cluster (4.21).** All targeted bugs addressed: `ERR_HTTP_HEADERS_SENT`, phantom books, synopsis fallback firing, raw markdown in fallback, editorial planner oversize. Two frontend polish items carried forward (progress counter, tag relocation).
- **Phase 4.24 — Editorial planner guard.** Reproduction could not confirm the original 3,153 / 3,477 trigger through the live pipeline. Both fixtures produce in-band units (min 1,853, max 2,230). Defensive subdivision guard added at top of `sliceIntoSourceUnits` — any section >2,500 words splits at paragraph boundaries before the even-distribution pass.

---

## 7. Phase 5.6 — Validation and refine loops (design intent)

Two loops, to build after Phase 5.1 defines the paragraph-level provenance contract:

- **Loop 1 — Pre-LLM source guard.** After slicing, verify all source units fall within [1,500, 2,500] words. If any unit is out of band: re-slice → re-verify → only when clean, dispatch to the LLM.
- **Loop 2 — Post-LLM output guard.** After the LLM returns a Smart Chapter, verify: word band [250, 360], grounding (each sentence traces to a source chunk), no fallback markers. If any check fails: re-prompt with stricter compression bounds → re-verify → ship clean or mark `fell_back` honestly.

**Why deferred:** The post-LLM guard's most important check is grounding density. Phase 5.1 defines the resolution contract that makes grounding measurable. Building the guard before 5.1 means validating against a shape we can't yet see.

---

## 8. Phase 5 backlog — UI/UX

1. **Tag chips relocation.** Book Details hero currently renders all classification tags inline alongside content-type and reading-level. Move to a collapsed expander or into the dedicated filter/search surface. Hero row gets visually crowded on books with 5–8 tags.
2. **Book Details visual weight.** Structurally correct but feels "numb" — no cover tint behind title, no subtle depth on cards.
3. **`/research` route collection view.** Phase 4.6 shipped the Web + Paste *import tabs*. The collection-view half — where a research dossier across multiple books is displayed — never shipped. Depends on Phase 5.1 for cross-source citation traceability.
- **Adaptive cinematic pacing.** The import cinematic currently runs at fixed pacing regardless of real pipeline timing. Refinement: each stage should read real `processing_jobs.progress` and display live ETA based on observed stage durations (INGEST ~2s, SEMANTIC_INDEX ~3min per 500 chunks, CLASSIFICATION ~2s, SYNOPSIS ~10s, SYNTHESIS ~30s/chapter). When a stage stalls — LLM latency, embedding backpressure — the UI should say so honestly ("Waiting on model response...") rather than freezing on the last checkpoint. Deferred to a later Phase 5.x pass. Rationale: a stalled-looking UI undermines the trust discipline the rest of the product maintains.

---

## 9. Deferred — Python sidecar (winter Build 6–7)

**Context.** During 4.21 verification, an image-only PDF failed with the honest message: *"This PDF document contains little or no selectable text. It may be a scanned image or bitmap document, which requires OCR."*

**Decision.** OCR is deferred to the winter Build 6–7 window, where part of the codebase moves from pure Node to a Node + Python sidecar architecture.

**Rationale.**
- Node OCR options are thin. Tesseract.js is the only serious one and it's WASM-based: slow, weak on CJK, requires `@napi-rs/canvas` per-platform native binding.
- Python has the mature stack: PaddleOCR (strongest CJK), EasyOCR, `pytesseract`. The same sidecar carries Discussion Mode (Ollama) and Story Mode (Diffusers).
- Doing OCR now in Node is throwaway work when the sidecar lands.
- Node core stays orchestrator. Python handles model-heavy workloads. Communication is localhost-only. Additive, not a rewrite.

**Until then.** Empty-content PDFs fail honestly with the current message. Phase 4.21 ensured this failure path is clean: no phantom books, no stuck jobs, no header cascade.

**Target structure (winter refactor).**
Node (existing) Python sidecar (new)
───────────────────── ──────────────────────
API server OCR service (PaddleOCR)
Pipeline orchestration Discussion service (Ollama)
SQLite Story service (Diffusers)
BGE-M3 embeddings Model management
Frontend API
↓ ↑
└─────── localhost HTTP ───────┘

text

**Roadmap impact.** Add Phase 5.7 — Python sidecar architecture decision. Bundle OCR, Discussion (Build 6), Story (Build 7) into it.

---

## 10. The invariant

**ORIGINAL READING** is immutable source. Never touched.
**SMART READING** is a derived lens. Fully traceable back to source.

Every decision serves this. Three laws:
1. Source is paper.
2. Lens is tinted.
3. Derivation never masquerades.

---

## 11. Continuity if this chat is lost

**Survives regardless of model:**
- Repo
- `docs/ROADMAP_2026-09.md` — long-term plan
- `docs/FRONTEND_BLUEPRINT.md` — narrative
- `docs/FRONTEND_BLUEPRINT_SPEC.md` — engineering contract
- `docs/ARCHITECTURE_AUDIT.md` — backend architecture
- `docs/SCAFFOLD_PLAN.md` — frontend structure
- `docs/PRODUCT_VISION.md` — thesis, two-representation invariant, three laws
- `docs/CANONICAL_TEST_BOOK.md` — test fixture ground truth
- `docs/RIGHTS.md` — licensing state, pre-launch checklist
- `docs/SESSION_HANDOFF.md` — this file

**To restart with a new assistant:**
1. Open fresh chat
2. Paste: *"Read `docs/SESSION_HANDOFF.md`, `docs/PRODUCT_VISION.md`, and `docs/CONTINUITY.md`. Confirm orientation, then tell me tomorrow's Phase 5.1 task in one paragraph."*
3. Any competent model orients in one turn

**Carry forward:**
- Two-representation invariant (Original immutable, Smart traceable)
- Three laws (Source is paper / Lens is tinted / Derivation never masquerades)
- Raw-output verification over model summaries
- One workstream per session
- Commit docs before code
- Verification evidence is pasted, never asserted

**Don't carry forward:** my tone or phrasing — any model can hold the standard in its own voice.

---

*End of handoff. Update at the end of every session.*
