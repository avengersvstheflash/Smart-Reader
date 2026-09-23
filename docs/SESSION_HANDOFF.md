# Smart Reader — Session Handoff

> **Purpose.** Any assistant (Claude, GPT, Gemini, or a fresh DeepSeek) reads this and is fully oriented. Companion to `docs/ROADMAP_2026-09.md` (long-term), `docs/FRONTEND_BLUEPRINT.md` (narrative), `docs/FRONTEND_BLUEPRINT_SPEC.md` (contract). This file answers: *where are we, how do we work, what's next.*
>
> Working title: **Omnitome** (see PRODUCT_VISION.md §"Working title").

---

## 1. Where we are

**Last shipped commit:** `523898d` — Phase 4.16 (Omnitome working
title).
**Last shipped commit:** `832658e` — Phase 4.7.1 cinematic import
session 2 (SYNOPSIS + SYNTHESIS + completion).

**Test state:** 17/17 root suites green. Frontend build clean,
typecheck 0 errors.

**Live in browser:**
- Compression eval harness reports ratio distribution per chapter
  (4.14)
- Pre-hydration contract test validates all API data shapes before
  frontend consumption (4.19)
- Parser stress test passes on 4 real-world PDFs: ResNet arXiv,
  NIST AES, Apple 10-K, Think Python (4.15a)
- Front/back matter filter verified on all 4 stress fixtures with
  zero leaks (4.15b)
- Parenthetical (Sources N-M) markers stripped from rendered Smart
  text (4.7.5)
- Book Details shows active AI provider with honest disclosure
  tooltip (4.10.5)
- Working title Omnitome recorded in docs (4.16)
- Import shows full cinematic: INGEST (page-turn), SEMANTIC_INDEX
  (chunk gather), CLASSIFICATION (tag fade), SYNOPSIS (progress-
  driven text at 15/35/40/65/70), SYNTHESIS (5-card stack with
  streaming lines)
- Completion: 5-dot cascade (80ms stagger) + one-time glow on
  [Open book]
- Dynamic polling: 500ms during INGEST<60%, 800ms during SYNTHESIS,
  1200ms otherwise
- Reduced-motion: all animations collapse to static; no cascade,
  no stream, no sweep
- Mobile: no overflow at 375px; "Stage N of 5" hidden on small

**Open items carried forward:**
- Smart chapters output ~2100 words; PRODUCT_VISION specifies 250–360.
  editorialPlanner target and synthesis prompt are the conflict. See
  Phase 4.8 in Known Polish Items.
- Parenthetical `(Sources 1-3)` source markers not caught by current
  strip regex — needs second pass.
- Original remains a route peer; source-in-reader panel is Phase 5C.

## 2. How we work

**Standard:** *"Something I can talk about with confidence, not shame."* Every claim verified against raw output, not model summaries. No commits on a dirty tree. No commits on a red suite. Divergence rebased, never force-pushed.

**Guardrails:**
- Root `package.json`, `scripts/run-all-tests.js`, and `backend/` frozen
- `npm test` must stay 13/13 green through every change
- One workstream per session
- Commit docs before code
- Never commit `.env` or keys
- Chat logs are historical; the filesystem is current
- Escalate model thinking level only after failure

**Content flow:** chat draft → user saves file in VS Code → commit. Antigravity writes to disk only from explicit prompts, not from extracting its own transcript (that path corrupted files twice).

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
| Chat assistant / thinking partner | any capable model | — |

---

## 4. Tomorrow

## Phase 4.7 — Cinematic import experience (~1-2 sessions, Pro High)

Real backend signals drive a game-like pipeline animation:
  - INGEST 10%: pages turning, file being "read"
  - INGEST 60%: chapter cards materializing
  - SEMANTIC_INDEX: chunk particles gathering
  - CLASSIFICATION: tags animating in
  - SYNOPSIS: scan-over-preface sweep
  - SYNTHESIS: lines streaming per chapter
Every step reads from real processing_jobs progress. No setTimeout.
Reduced-motion fallback: static equivalent for every animation.

After 4.7: Phase 4.12 (compressor terminology refactor), then
Phase 5 (paragraph-level provenance + inline tracker).

## Phase 4.8.1 — Compressor prompt + input sizing (~1 session, Pro High)

**Root cause (2026-09-20):** Smart Reader produces **summaries**, not
**compressions**. The LLM is prompted to "synthesize" and produces
output proportional to source size. Evidence: 3023-word Smart chapter
from ~15k words of source, in classic summarizer register ("Machine
learning represents one of the most transformative technologies...").
Phase 4.8's word count validation fired correctly — the LLM just
ignored it because the prompt framing invited essays.

**The vision clarification:** PRODUCT_VISION.md §"Compression, not
summarization" now states the distinction explicitly. Every prompt in
the pipeline must be reframed from synthesis to compression.

**Fix (two coupled changes):**

1. **Prompt language rewrite** in `synthesisService.js`
   - Replace "synthesize" / "comprehensive overview" with "compress"
   - New prompt shape:
     * State source word count and output word count explicitly
     * "Compress {N} source words into exactly {M} words"
     * "Preserve every distinct concept, argument, and factual claim"
     * "Do not add narrative framing, introductions, or conclusions
       not in the source"
     * "Do not paraphrase away specificity. 'Gradient descent, SGD,
       and OLS' is not 'several optimization methods'"
     * Hard ceiling: "Do not exceed {M+30} words"
     * Escape hatch: "If M is too small for the source's information
       density, emit [INSUFFICIENT_M: needs ~X words] as the last line
       instead of exceeding the ceiling"
     * Every sentence ends with [Source N]

2. **Input sizing** in `editorialPlanner.js`
   - Slice body source into 1,500–2,500 word units BEFORE assigning
     to editorial chapters
   - One editorial chapter per source unit
   - `targetWordCount = round(sourceWordCount / 7)` clamped to
     [250, 360]
   - If source unit < 1,200 words → `targetWordCount = 180` (honest
     short)
   - If source unit > 2,800 words → split into two units first

3. **max_tokens ceiling** in `openrouterProvider.js`
   - Pass `maxTokens: 550` on synthesis calls (roughly 1.5× the 360
     hard ceiling). This is a server-side backstop if the prompt
     fails; the prompt does the primary work.

**Verification:**
- Regenerate outline + synthesis on the canonical test book
  (`backend/tests/fixtures/practical_machine_learning.pdf`)
- Expect 8–12 editorial chapters (not 15)
- Each Smart Chapter 250–360 words (target), max 450
- `length_violation` not set on any chapter
- Smart text reads as compressed source, not summarized source
- No invented introductions, no "comprehensive overview" phrases

**Reference:** docs/PRODUCT_VISION.md §"Compression, not
summarization"; docs/CANONICAL_TEST_BOOK.md §Known issues.

## Phase 4.9 — Synopsis fallback honesty (~30 min, Flash Medium)

PROBLEM: DERIVED · SYNOPSIS panel renders deterministic fallback text
(fiction template for a textbook — "structured as an in-depth novel"
appeared on a machine learning PDF). No marker distinguishes fallback
from real synthesis. Same trust hole as Gate 2.5, in the synopsis surface.

CHANGE:
  1. backend/services/ai/intelligentSummarizer.js — set
     metadata.fell_back = true when the deterministic synthesizer
     produces the synopsis
  2. BookDetailsRoute synopsis panel — when fell_back is true,
     render honest caption: "Structured synopsis — model unavailable"
  3. Consistent with Gate 2.5 chapter fallback pattern

## Phase 4.10 — Auto-classification on import (~1 session, Pro High)

Two problems, one fix:

PROBLEM A: Import defaults contentType to 'novel' for every file.
PROBLEM B: Library has no topic/level/tool filtering. Tags do not
exist as data.

FIX: Single LLM call after ingestion completes. Same context as
synopsis (title, author, TOC, ch1 opening paragraph).

INPUT:
  - Book title, author
  - TOC entries
  - First paragraph of chapter 1
  - Optional: preface text

OUTPUT (structured JSON):
  {
    "contentType": "textbook" | "novel" | "essay" | "paper" |
                   "reference" | "memo" | "article" | "other",
    "tags": ["machine-learning", "python", "ethics", ...],
    "readingLevel": "introductory" | "intermediate" | "advanced" |
                    "research",
    "targetAudience": "one line",
    "prerequisites": ["..."],
    "toolsCovered": ["..."]
  }

STORAGE: books.metadata_json.classification (new key).
  Existing books default to no classification.

FRONTEND:
  - Book Details: chips row showing contentType + readingLevel +
    top 5 tags.
  - Library: filter chips extend to include top N tags across the
    collection.
  - Book cards: existing contentType badge stays; now accurate.

COST: one ~500-token OpenRouter call per import.

VERIFY on canonical test book:
  - contentType becomes "textbook" not "novel"
  - tags are non-trivial and accurate
  - Library filter chips populate
  - Synopsis still produces independent of classification result

## 5. Remaining roadmap

**Phase 3** — Modals + Import + Research + Book Details routes, Progressive Smart Reading UI (1–2 evenings)

**Phase 4** — Progressive Smart Reading polish, streaming arrivals, cancel batch (1 evening)

**Phase 4.5** — Tauri decision gate (2–4 weeks if yes)

**Build 5** — Audio Mode: local Kokoro-82M default, cloud Qwen premium (2–3 evenings)

**Build 6** — Discussion Mode: local Ollama multi-agent (2–3 evenings)

**Build 7** — Story Mode: character sheet + one-scene-back + SDXL + manga layout (8–10 evenings)

**Build 8** — Cross-lingual polish, JP/EU market readiness

---

## 6. Continuity if this chat is lost

**Survives regardless of model:**
- Repo
- `docs/ROADMAP_2026-09.md` — long-term plan
- `docs/FRONTEND_BLUEPRINT.md` — narrative
- `docs/FRONTEND_BLUEPRINT_SPEC.md` — engineering contract
- `docs/ARCHITECTURE_AUDIT.md` — backend architecture
- `docs/SCAFFOLD_PLAN.md` — frontend structure
- `docs/SESSION_HANDOFF.md` — this file

**To restart with a new assistant:**
1. Open fresh chat
2. Paste: *"Read `docs/SESSION_HANDOFF.md`, `docs/ROADMAP_2026-09.md`, and `docs/FRONTEND_BLUEPRINT_SPEC.md`. Confirm orientation, then tell me tomorrow's Phase 2 task in one paragraph."*
3. Any competent model orients in one turn

**Carry forward:**
- Two-representation invariant (Original immutable, Smart traceable)
- Three laws (Source is paper / Lens is tinted / Derivation never masquerades)
- Raw-output verification over model summaries
- One workstream per session
- Commit docs before code

**Don't carry forward:** my tone or phrasing — any model can hold the standard in its own voice.

---

## 7. The invariant

**ORIGINAL READING** is immutable source. Never touched.
**SMART READING** is a derived lens. Fully traceable back to source.

Every decision serves this.



Antigravity write hazard. When asked to replace a stub file, Antigravity's tooling sometimes appends the new content to the existing stub instead of overwriting. Always git diff after a "replace" task to confirm the old placeholder line is gone. If a placeholder remains (export const X = () => null; above real code), it's a silent redeclare error that typecheck may not catch if run before the file write completes.

---

## 8. Known polish items

1. **Chapter word count edge case.** Book `book-1789676305176-jd52f`
   shows chapter 1 with `4 words` while other chapters show 402. Either
   the chapter is heading-only (legit) or wordCount normalization is
   off. Investigate when convenient.

2. **Tailwind Typography plugin registered in C3.** After C3, `.prose`
   classes emit real styles. C2's explicit `.prose-reader
   .canonical-block` rules remain as the override layer — do not delete
   them.

3. **`renderInlineText` is non-recursive.** TODO comment in
   `CanonicalBlock.tsx` documents this. Sufficient for current content.
   Replace with a real markdown parser only if nested emphasis shows up
   in real imported files.

4. **Spec drift noted.** The Original↔Smart toggle in `ReaderRoute.tsx`
   renders inline above the canvas rather than in the Header's
   `contextual` slot as spec §3.1 originally suggested. This is a
   deliberate implementation improvement (mobile-friendlier, keeps the
   global header clean). Consider updating spec §3.1 to match.

5. **Editorial-to-source-chapter namespace mismatch (critical).**
   Editorial synthesis writes representations keyed to synthetic chapter
   ids (`book-editorial-<bookId>-ch-plan-N`), but reader navigates by
   source chapter id.

6. **Sentence-level citation enforcement not yet implemented.**
   Prompt-level citations (`[1]`, `[2]`), 80% validation threshold with
   automated retry, and UI-level distinction for uncited sentences
   per `docs/PRODUCT_VISION.md`.

7. **Smart Chapter independent titles not yet implemented.**
   Smart Chapters to have their own titles, numbering, and length targets.

8. **Synopsis-before-chapters sequencing not yet implemented.**
   Synopsis to be generated from preface + TOC + strategic samples
   before chapters synthesize.

9. **Source view text-first rendering not yet implemented.**
   v1 to render stored parsed text with highlighted target passage
   instead of in-browser PDF.

10. **Inline source tracker not yet implemented.**
    Cross-platform interaction pattern (desktop hover/click, tablet
    tap-and-hold, mobile long-press) opening in-reader source overlay/side
    panel with round-trip position return.

11. **Book Details "DERIVED · SYNOPSIS" panel fetches BOOK_SUMMARY, not SYNOPSIS.** Confirm which type the UI intends to show before fixing.

- `[Source N]` markers exposed in rendered Smart text (planned fix in
  Phase 4.5 A)
- Book opens per-chapter; not yet whole-book Smart default (Phase 4.5 B)
- Original still a route peer, not a source panel from Smart
  (Phase 4.5 C)
- `processing_jobs` only tracks INGEST, WEB_IMPORT, SEMANTIC_INDEX,
  SYNOPSIS, BOOK_SUMMARY. Editorial outline planning and chapter
  synthesis do NOT record job rows. Stepper UI therefore shows four
  steps, not seven. Instrumenting synthesis to write jobs is a
  follow-up refactor.
- Job status strings are inconsistent: 'PROCESSING' vs 'in_progress'.
  Frontend normalizes both; backend cleanup needed eventually.
- `GET /api/jobs` lacks `?bookId=` query param, but a path-based
  variant `GET /api/jobs/book/:bookId` already exists and is the
  correct endpoint for per-book polling.
- Smart chapters output ~2100 words vs 250–360 target. Backend
  refactor needed (Phase 4.8).
- Parenthetical source markers `(Sources 1-3)` not stripped by
  Phase 4.5 A regex — extend to second pass when convenient.
- Parser verified against real PDF (2026-09-20): imported a real
  book, landed cleanly in Original form.
- Synopsis fallback shows fiction template for textbook; no marker
  distinguishes fallback from real synthesis (Phase 4.9)
- Import defaults contentType to 'novel' for every file (Phase 4.10)
- **Phase 4.8.1** — Smart chapters output 2692-3023 words despite 4.8
  validation. Root cause: editorialPlanner assigns large source inputs
  per editorial chapter, not 1,500-2,500 word units per PRODUCT_VISION.
  Fix in editorialPlanner.js slicing. Priority.
- **Phase 4.12** — Compression terminology refactor. Rename
  synthesisService → compressionService, intelligentSummarizer →
  intelligentCompressor, EDITORIAL_SYNTHESIS → EDITORIAL_COMPRESSION.
  Full session, Pro High.
- **DONE this session:** 4.8.1 hotfix (reasoning disabled), 4.8.2
  front matter fix, 4.9 shipped, README rewrite, 4.11 boot-time reconciliation,
  4.11.5 removed legacy vanilla frontend (`src/`).
- **Verified:** first real LLM compression output at 328-373 words
  per chapter via OpenRouter, provider: openrouter.
- **Duplicate synopsis execution (post-4.13).** Two log lines fire:
  `[Synopsis]` (old path) and `[Synopsis Compression]` (new path).
  Both generate and complete. The 4.13 edit added the new code without
  removing the old. Also `--- SYNOPSIS PROMPT CONTEXT ---` and
  `--- SYNOPSIS COMPRESSION PROMPT ---` both print. Fix: remove the
  legacy `[Synopsis]` block from `generateSynopsis`. Confirm only one
  DB write to `book_representations` per call.
- **Test fixtures undersized for new slicer.** build4_2bc test book
  now produces 1 outline chapter (was 6). build4_2a smoke test also
  produces 1. Assertions were updated to pass, but the fixtures need
  enlarging (5,000–12,000 words) so they exercise the multi-chapter
  slicing path. Not urgent — tests still pass — but future coverage
  is thinner than before.

- **Import pipeline stages skip job rows.** Import calls
  SEMANTIC_INDEX, SYNOPSIS, and SYNTHESIS with `{ skipJob: true }`,
  so only INGEST and CLASSIFICATION appear in `processing_jobs`
  during import. Artifacts are created (chunks, reps, outline rows
  all present) but the stepper cannot show real progress for
  SYNOPSIS/SYNTHESIS stages. Decision needed for Phase 4.7 cinematic
  import: (a) flip skipJob: false for those stages, or (b) infer
  from artifacts. Phase 4.7 prerequisite.

- **BookDetailsRoute + LibraryRoute full rewrites in 2b9172c.**
  Verified clean at HEAD (no append-hazard duplicates), but note
  the pattern: agent used "Created" not "Edited" for both files.
  If future edits to these files behave unexpectedly, suspect the
  rewrite-pattern.
- **ImportRoute.tsx fully rewritten in 1d5bd02.** Verified at HEAD
  with single export. Same rewrite pattern as LibraryRoute/BookDetailsRoute
  in 2b9172c. Watch these files for regressions.
- **Editor buffer drift (2026-09-21).** After commit 1d5bd02, three
  files (bookRoutes.js, webAcquisitionService.js, ImportRoute.tsx)
  showed as modified in the working tree with broken content —
  duplicated loops, unclosed braces, re-injected old JSX. Cause:
  stale editor buffer flushed to disk after commit. HEAD was clean;
  only the working tree was corrupted. Fix: `git checkout HEAD --
  <file>` for each. Rule: after every commit, run `git status
  --short`. If files show modified immediately after a clean commit,
  suspect buffer drift — verify with `git diff` before staging.
- **Agent transcript spelunking returned during Phase 4.6.** The agent
  extracted the original prompt from .system_generated/logs/transcript_full.jsonl
  via Select-String + scratch file writes. Worked this time (read-only)
  but the same pattern produced mojibake and duplicate declarations in
  earlier sessions. Rule: re-paste, do not mine.
- **Phase 4.8.3 — Even-distribution source slicing.** Current planner
  accumulates chunks until ~2,500 words, so a book's final unit can
  be a small remainder (observed in 4.14 eval: 396-word unit → 1.76:1
  ratio, flagged as outlier). Fix: compute N = round(W / 2000), slice
  the whole body evenly into N units of ~S = W/N words, snapping each
  boundary to the nearest chapter break if within ±10%. Every unit
  lands in the 1,500–2,500 word band. Matches PRODUCT_VISION
  §"The backend model" — word-count-driven, not chapter-driven.
  ~30 min, Flash Medium. Priority: medium. Recorded 2026-09-22,
  not yet performed.
- **Parser chapter detection on SEC filings and two-column papers
  is shallow (by design).** 4.15a: ResNet arXiv detected as 2 sections
  vs ~8 real; Apple 10-K detected as 3 vs ~20 real. This does NOT
  block the product — the editorial planner re-segments body content
  into 1,500–2,500 word units regardless of source chapter boundaries.
  Smart Reader creates its own editorial chapter structure; it does
  not inherit source chapter counts. Only front/back matter
  classification matters, and 4.15b verifies that holds. Informational,
  not a fix.
- **math-heavy.pdf yields 1 editorial candidate from 61 chunks.**
  4.15b: NIST FIPS 197 is 8 front_matter + 52 appendix + 1 chapter.
  Filter correctly rejects 60/61 chunks as non-body. Honest behavior
  for a document shape that isn't book-like — a NIST standard
  produces a 1-chapter Smart Reading. Informational, not a fix.
- **Full suite runtime is ~5-6 min.** Adding more tests will push
  past convenient. Future: two-tier npm scripts (test:fast with
  no-LLM suites, test:full including synthesis). Informational.
- **Transcript spelunking — 6th incident (2026-09-23).** During
  4.7.1 the agent searched transcript.jsonl / transcript_full.jsonl
  for the prompt instead of using the pasted text. Recovered
  successfully this time but the pattern persists across every
  session. Rule for all future prompts: if the prompt doesn't
  appear in the current context, re-paste — do NOT let the agent
  mine its own transcript logs.
- **`git reset --hard HEAD` used post-commit (2026-09-23).** After
  committing 832658e, the agent ran `git reset --hard HEAD` to
  discard drift. Safe this time (nothing meaningful was lost), but
  destructive habit. Rule: use `git checkout HEAD -- <file>` for
  targeted cleanup, never `git reset --hard` on a pushed branch.

## Phase 4.21 — Bug cluster (2026-09-23 discovery + fix session)

Nine bugs surfaced during manual verification of 4.7.1 cinematic
import. All nine targeted for fix in tonight's session.

### Backend bugs (high severity)

1. **`ERR_HTTP_HEADERS_SENT` fires 42× on failed import.**
   Route handler at `backend/routes/bookRoutes.js` responds via
   `res.json()` and then falls through to the error handler which
   calls `res.status().json()` again. Stack trace pointed to
   bookRoutes.js:34 and :97. Missing `return` statements.

2. **Phantom books appear in Library after failed imports.**
   Import of an OCR-needed PDF created a `books` row that survives
   the parse failure. Library shows it as `0 ch · 0 min`. The row
   has no `status='failed'` marker and no chapter cleanup on error.

### Backend bugs (medium severity)

3. **Synopsis fallback fires for canonical PDF.** During verification
   the DERIVED · SYNOPSIS panel showed "Structured synopsis — model
   unavailable. This synopsis was not generated by the AI." for the
   canonical book. Either (a) the AI provider is not configured in
   .env, or (b) the fallback path fires too eagerly. Diagnostic
   required to determine which.

4. **Synopsis fallback renders raw markdown.** The fallback text
   contains literal `## Editorial Synopsis:` and `** bold **` markers
   that render as plain text in the UI. Even honest fallback should
   not display raw markdown — strip it or pass through the canonical
   block renderer.

5. **EditorialPlanner produces oversize units despite 4.8.3.**
   Log: `[EditorialPlanner] 2 source units exceed 2800 words:
   3153, 3477`. The 4.8.3 even-distribution slicing was supposed to
   produce units in [1500, 2500]. Either section-boundary edge case
   or ordering bug in the new slicer.

### Frontend bugs (polish)

6. **Progress number jumps 0 → 45 → 67 → 93 → 100.** Backend emits
   discrete checkpoints; frontend polls at 500/800/1200ms intervals.
   Between polls the number is frozen; on poll it snaps. UX expects
   a smooth count up. Fix: `useSmoothedProgress` hook — animate the
   displayed value toward each new target over the polling interval.
   Never overshoot; snap to 100 on completion.

7. **Book Details feels "numb."** Structurally correct — hero, chips,
   chapter list, semantic panel all present — but lacks visual
   weight. No cover tint behind title, no subtle depth on cards.
   Deferred to Phase 5.5 (Library polish).

8. **`/research` route is an empty placeholder.** Phase 4.6 shipped
   the Web + Paste *import tabs*. The collection-view half — where
   a research dossier across multiple books is displayed — never
   shipped. `/research` renders nothing.

9. **Kaggle import duplicated.** "Kaggle and Code Dojo 1" appears
   twice in Library with the same title. Likely same content hashed
   differently on two import attempts, or leftover from testing.
   Cleanup: identify the duplicate ID and mark one status='failed'.

10. **Phase 5.x: Tag chips relocation (UI/UX phase).**
    - *Current:* Book Details hero row shows all classification tags inline
      alongside content-type and reading-level.
    - *Desired:* Hero shows content-type + reading-level only. Tags move to
      a collapsed expander or into a dedicated filter/search surface.
    - *Rationale:* Hero row gets visually crowded on books with 5–8 tags.
      Filter chips belong in the Library filter system, not the hero.
      Defer to the UI/UX polish phase (likely Phase 5.5).

11. **Informational finding: synopsis prompt degraded for sources without preface/TOC.**
    Observed during Apple 10-K import (2026-09-23): synopsis compression
    prompt received `INPUTS: (None provided)`, `TOC: (None provided)`. Only
    chapter-1-opening and last-chapter-opening were supplied. Result: output
    landed 139 words (below 180 floor), retried once, produced acceptable
    prose. Not a bug — SEC filings genuinely lack preface and TOC. But the
    synopsis path depends on structured inputs (preface + TOC + samples)
    that some source types (SEC filings, pasted text, some web dumps) don't
    provide. The retry logic saves it, but the path is fragile. Log as
    informational; no fix scheduled.

## OCR deferred to Python sidecar (decision, 2026-09-23)

**Context.** During 4.21 verification, an image-only PDF (a chat
export) failed with the honest message: "This PDF document contains
little or no selectable text. It may be a scanned image or bitmap
document, which requires OCR (not supported in Build 2)."

**Decision.** OCR is deferred to the winter Build 6-7 window, where
part of the codebase moves from pure Node to a Node + Python sidecar
architecture.

**Rationale.**
- Node OCR options are thin. Tesseract.js is the only serious one
  and it's WASM-based: slower than native, weak on CJK, and its
  rasterization path requires `@napi-rs/canvas` (per-platform native
  binding). Workable, but a lot of scaffolding for a subsystem that
  only needs to exist once.
- Python has the mature stack. PaddleOCR (strongest CJK), EasyOCR,
  and `pytesseract` are all Python-first. The same sidecar that will
  carry Discussion Mode (Ollama) and Story Mode (Diffusers) can
  carry OCR with no additional runtime.
- Doing OCR now in Node = throwaway work when the Python sidecar
  lands in winter.
- The Node core stays the orchestrator. Python handles model-heavy
  workloads. Communication is localhost-only. No architectural
  rewrite — additive.

**Until then.**
- Empty-content PDFs fail honestly with the current message.
- Phase 4.21 ensures this failure path is clean: no phantom books,
  no stuck jobs, no ERR_HTTP_HEADERS_SENT cascade.
- When a user hits OCR-needed content, they get a clear message and
  the book does not appear in the Library.

**Target structure (for the winter refactor).**
  Node (existing)                Python sidecar (new)
  ─────────────────────          ──────────────────────
  API server                     OCR service (PaddleOCR)
  Pipeline orchestration         Discussion service (Ollama)
  SQLite                         Story service (Diffusers)
  BGE-M3 embeddings              Model management
  Frontend API
        ↓                              ↑
        └─────── localhost HTTP ───────┘

**Roadmap impact.** Add Phase 5.7 — Python sidecar architecture
decision. Bundle OCR, Discussion (Build 6), Story (Build 7) into it.
Update the winter window label from "Build 6-7" to "Build 6-7 +
sidecar."

---

*End of handoff. Update at the end of every session.*