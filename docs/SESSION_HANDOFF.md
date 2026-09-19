# Smart Reader — Session Handoff

> **Purpose.** Any assistant (Claude, GPT, Gemini, or a fresh DeepSeek) reads this and is fully oriented. Companion to `docs/ROADMAP_2026-09.md` (long-term), `docs/FRONTEND_BLUEPRINT.md` (narrative), `docs/FRONTEND_BLUEPRINT_SPEC.md` (contract). This file answers: *where are we, how do we work, what's next.*

---

## 1. Where we are

**Last shipped commit:** f3a9873 — Phase 4 complete:
import route with real XHR upload progress + job-driven pipeline stepper.
**Test state:** 13/13 root suites green. Frontend build clean,
typecheck 0 errors.

**Live in browser:**
- Library -> Book Details -> Reader works via clicks
- Reader resolves editorial representations from source chapter ids
  (Phase 4 Gate 1, `fe78429`) via the semantic_chunks bridge
- Fallback chapters marked with fell_back / fallback_reason /
  duplicate metadata and honest UI captions (Gate 2.5, `0f36f4e`)
- Synopsis-first sequencing: preface + TOC + samples before chapters
  (Gate 3, `1d768e0`)
- Import route: file upload with real XHR progress, result card,
  [Open book] navigation (Gate 4 Step 1, `0e7d279`)
- Import pipeline stepper: 4 real jobs (INGEST, SEMANTIC_INDEX,
  SYNOPSIS, BOOK_SUMMARY) polled via `/api/jobs/book/:bookId`
  (Gate 4 Step 2)

**Open items carried forward:**
- `[Source N]` markers still visible in rendered Smart chapter text
- Book opens per-chapter Smart/Original; not yet "book opens in Smart"
- Original still a route peer, not a source panel from Smart
- Editorial outline + chapter synthesis do NOT write to
  processing_jobs (stepper shows 4 steps, not 7)

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

## 4. Phase 4.5 — Reading UX refinements (next session)

The following changes align the frontend with the PRODUCT_VISION model
of "Smart is the surface, Original is depth":

### A. Hide [Source N] markers from rendered text (immediate, ~20 min)
Currently synthesized Smart chapters include inline `[Source 1]`,
`[Source 2]` markers in body text. These are backend bookkeeping and
should not appear to the reader.

v1 implementation:
  - In `frontend/src/components/reader/CanonicalBlock.tsx`, strip
    `\[Source \d+\]` from paragraph and quote text before render
  - Optional: render a subtle superscript dot instead of nothing
  - Do NOT modify backend synthesis prompt yet (v2 work)

### B. Book opens in Smart mode by default (~30 min)
Currently per-chapter mode resolution (Phase 3.5 D3). Users opening a
book from Library see inconsistent behavior — some chapters Smart,
some Original.

Change: on book open (`BookDetailsRoute` Read/Smart-read buttons),
resolve the first chapter with a representation and route to it in
Smart mode. Original remains accessible via toggle (until C lands).

### C. Original becomes a source panel, not a route (2-3 sessions)
This is the inline source tracker workstream — the moat made
interactive.

Target UX: Smart is the view. Clicking [Source N] or hover/long-press
opens a source panel inside the reader at the exact position. Original
is never reached by toggle — only by tracing from a Smart passage.

Requirements:
  - Sentence-level citation enforcement (backend prompt change)
  - SourcePanel / SourceOverlay component (frontend)
  - Cross-format position resolution (PDF page / EPUB location / line)
  - Round-trip scroll restoration (return to exact Smart position)
  - Mobile interaction pattern (long-press + haptic)

Reference: docs/PRODUCT_VISION.md §"Inline source tracker" and
§"The frontend model".

**Model:** A and B are Flash · Medium. C is Pro · High.

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

---

*End of handoff. Update at the end of every session.*