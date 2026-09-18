# Smart Reader — Session Handoff

> **Purpose.** Any assistant (Claude, GPT, Gemini, or a fresh DeepSeek) reads this and is fully oriented. Companion to `docs/ROADMAP_2026-09.md` (long-term), `docs/FRONTEND_BLUEPRINT.md` (narrative), `docs/FRONTEND_BLUEPRINT_SPEC.md` (contract). This file answers: *where are we, how do we work, what's next.*

---

## 1. Where we are

**Last shipped commit:** `4823f98` — Phase 3 C2, canonical typography.
**Test state:** 13/13 root suites green. Frontend build passes,
typecheck 0 errors.
**Live in browser (`localhost:5173` with backend on `:3000`):**
- Library → Book Details → Reader works via clicks
- Book Details: hero with title-hash cover, synopsis panel, chapter
  list with roving tabindex, semantic intelligence panel with real
  chunk count from backend
- Reader: canonical blocks render with correct typography (headings
  at proper weight, list bullets, blockquote left-rule, code blocks)
- Original ↔ Smart toggle works; Smart mode shows honest empty state
- Dark mode persists across all routes
- Commit history is clean — Phase 1, Phase 2 (B1/B2/B3), Phase 3
  (C1/C2/C3) each as their own labeled commit

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

## 4. Tomorrow — Phase 3.5 (Modals + Generation wiring)

**Deliverables:**
1. `ModalProvider` + `Modal` shell (per spec §S.4.14, §S.5.1)
2. Wire "Generate synopsis" → `POST /api/books/:id/synopsis`
3. Wire "Ask this book" → `POST /api/books/:id/ask`
4. Wire "Attach source" → Supporting Material modal
5. Wire "Delete book" → ConfirmDelete modal (typed title confirmation
   for books with >0 chapters, per spec §S.5.1)
6. Wire "+ Add chapter" → AddChapter modal
7. Smart mode render: pass representations from `useChapter` into
   `ReaderView`; render synthesized canonicalBlocks when a representation
   exists
8. Smart empty state: `+1 / +3 / +5 / +10` buttons → `POST /api/books/
   :id/editorial/synthesize-next`, poll `/api/books/:id/editorial/progress`
   via React Query

**Model:** Gemini 3.8 Flash · Medium (mechanical). Escalate to Pro High
only if ModalProvider design stalls.

**Milestone:** every disabled button on Book Details becomes live; the
two-representation invariant demos end-to-end (Original → Smart with
real synthesis).

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

---

*End of handoff. Update at the end of every session.*