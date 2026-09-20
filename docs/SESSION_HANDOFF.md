# Smart Reader — Session Handoff

> **Purpose.** Any assistant (Claude, GPT, Gemini, or a fresh DeepSeek) reads this and is fully oriented. Companion to `docs/ROADMAP_2026-09.md` (long-term), `docs/FRONTEND_BLUEPRINT.md` (narrative), `docs/FRONTEND_BLUEPRINT_SPEC.md` (contract). This file answers: *where are we, how do we work, what's next.*

---

## 1. Where we are

**Last shipped commit:** `70a31c4` — phase4.8.2: exclude front matter from editorial candidates

**Test state:** 13/13 root suites green. Frontend build clean,
typecheck 0 errors.

**Live in browser:**
- `[Source N]` markers hidden from rendered Smart text (Phase 4.5 A)
- Books with Smart content open in Smart by default via [Read]
  button (Phase 4.5 B)
- Book Details synopsis panel now fetches SYNOPSIS, not BOOK_SUMMARY
  (Phase 4.5 C)
- Library cards show "Smart" badge on books with editorial content
  (Phase 4.5 D)
- Parser verified against a real PDF (new import landed in Original
  form, no breakage)

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

## 4. Phase 4.6 + 4.7 + 4.8

## Phase 4.6 — Web + Paste import (~1 session, Flash Medium)
## Phase 4.7 — Cinematic import experience (~1–2 sessions, Pro High)
## Phase 4.8 — Smart chapter word count enforcement (~1 session, Pro High)

Phase 4.8 is now the priority backend fix. Details:

PROBLEM: Editorial planner targets 1500–3000 words per chapter.
PRODUCT_VISION.md specifies 250–360 words (hard bounds 180–450).

Real evidence: an imported 2125-word Smart chapter. Compression
ratio today is ~1:1 (compression didn't happen).

CHANGE:
  1. backend/services/synthesis/editorialPlanner.js — target
     250–360 words per editorial chapter, not 1500–3000.
  2. backend/services/synthesis/synthesisService.js — synthesis
     prompt must instruct: "Output must be 250–360 words. If you
     exceed 360, cut content."
  3. Validation: if output < 180 or > 450, regenerate once. Log
     the failure if the retry also exceeds.
  4. If batching source chunks is needed to fit the smaller target,
     resolve in editorialPlanner (chunk-to-chapter mapping).

Verify: synthesize a fresh chapter and confirm word count in the
target range. Show the DB word count.

Reference: docs/PRODUCT_VISION.md §"The backend model".

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
  front matter fix, 4.9 shipped, README rewrite.
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

---

*End of handoff. Update at the end of every session.*