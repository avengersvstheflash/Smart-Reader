# Smart Reader — Session Handoff

> **Purpose.** Any assistant (Claude, GPT, Gemini, or a fresh DeepSeek) reads this and is fully oriented. Companion to `docs/ROADMAP_2026-09.md` (long-term), `docs/FRONTEND_BLUEPRINT.md` (narrative), `docs/FRONTEND_BLUEPRINT_SPEC.md` (contract). This file answers: *where are we, how do we work, what's next.*

---

## 1. Where we are

**Last shipped commit:** `6260aa5` — Phase 3.5 D3, progressive Smart generation wiring.
**Test state:** 13/13 root suites green. Frontend build passes,
typecheck 0 errors.
**Live in browser (`localhost:5173` with backend on `:3000`):**
- Library → Book Details → Reader works via clicks
- Book Details: hero with title-hash cover, synopsis panel, chapter
  list with roving tabindex, semantic intelligence panel with real
  chunk count from backend
- Reader: canonical blocks render with correct typography (headings
  at proper weight, list bullets, blockquote left-rule, code blocks)
- Reader Smart mode: Smart mode defaults when representation exists;
  SmartEmptyState shows honest state with +1/+3/+5/+10 buttons and Stop button
- Progressive synthesis wired to real backend DeepSeek synthesis endpoints
  with real progress polling and 5-min safety timeout
- `docs/PRODUCT_VISION.md` added (`f458667`) as North Star governing document
- **Namespace mismatch identified but unfixed:** editorial synthesis
  writes representations keyed to synthetic chapter ids
  (`book-editorial-<bookId>-ch-plan-N`), while reader navigates by source
  chapter id (`chapterId`). Phase 4 target.

---

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

## 4. Tomorrow — Phase 4: Namespace fix + Smart-default product reframe

**Deliverables (in order):**
1. Backend: editorial chapters must resolve from source chapter ids.
   Either (a) write per-source-chapter representation keys during
   synthesis, or (b) add a lookup endpoint that maps source chapter
   id → editorial representation id. Choose after reading
   editorialService.js outline creation + metadata_json.provenance.
2. Frontend: reader uses the mapping so Smart mode shows the real
   representation for the current source chapter.
3. Synopsis generation moved to run BEFORE chapters (from preface +
   TOC + strategic samples per PRODUCT_VISION.md).
4. Auto-run on import with real progress UI (game-like loading
   animation driven by processing_jobs).

**Reference:** docs/PRODUCT_VISION.md supersedes UI-first
interpretations.

---

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

---

*End of handoff. Update at the end of every session.*    -   B o o k   D e t a i l s   " D E R I V E D   �   S Y N O P S I S "   p a n e l   f e t c h e s   B O O K _ S U M M A R Y ,   n o t   S Y N O P S I S .   C o n f i r m   w h i c h   t y p e   t h e   U I   i n t e n d s   t o   s h o w   b e f o r e   f i x i n g .  
 