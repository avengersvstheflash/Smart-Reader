# Smart Reader — Session Handoff

> **Purpose.** Any assistant (Claude, GPT, Gemini, or a fresh DeepSeek) reads this and is fully oriented. Companion to `docs/ROADMAP_2026-09.md` (long-term), `docs/FRONTEND_BLUEPRINT.md` (narrative), `docs/FRONTEND_BLUEPRINT_SPEC.md` (contract). This file answers: *where are we, how do we work, what's next.*

---

## 1. Where we are

**Last shipped commit:** `36fb643` — Phase 1, Library route with real backend data.
**Last tag:** `v0.4.5` — BGE-M3 1024d embedding provider.
**Test state:** 13/13 root suites green. Frontend build passes, typecheck 0 errors.

**Repo:** https://github.com/avengersvstheflash/Smart-Reader

**Stack:**
- Backend: Node 22 + Express + better-sqlite3 + pdfjs-dist
- AI: OpenRouter → DeepSeek V4 Flash (text), BGE-M3 1024d (embeddings, local)
- Frontend: React 18.3.1 + Vite 5.1.6 + TS 5.3.3 strict + Tailwind 3.4.1
- Allowed deps: `react-router-dom`, `zustand`, `@tanstack/react-query`, `lucide-react`, `@tailwindcss/typography`

**Live:**
- Backend ingests PDFs/EPUBs/web, chunks, embeds (BGE-M3), outlines, auto-synthesizes 3 Smart Chapters
- Frontend serves Library route at `localhost:5173` with real backend data via Vite proxy `/api` → `:3000`

**Not yet built:** Reader route (Original + Smart toggle), Canonical block renderer, Import route UI, Research route UI, 11 modals, Progressive Smart Reading UI, Audio (Build 5), Discussion (Build 6), Story (Build 7), Tauri wrap (Phase 4.5 decision gate)

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

## 4. Tomorrow — Phase 2 (Reader + Canonical)

**Deliverable:** Reading a real chapter from the backend in a browser, with Original/Smart toggle working, canonical blocks rendering.

**Scope:**
1. `frontend/src/hooks/useChapters.ts` — React Query: `GET /api/books/:id/chapters`, `GET /api/chapters/:id`
2. `frontend/src/components/reader/CanonicalBlock.tsx` — recursive renderer (paragraph, heading, quote, list, code, separator, callout, table)
3. `frontend/src/routes/ReaderRoute.tsx`
4. `frontend/src/components/reader/ReaderView.tsx` — `<article class="prose prose-reader source-text">`, `id="blk-{chapterId}-{i}"` wrappers
5. `frontend/src/components/reader/ChapterNav.tsx` — prev/next + jumper (roving tabindex)
6. `frontend/src/components/reader/ScrollProgress.tsx` — 2px hairline, `aria-hidden`
7. Original↔Smart toggle in header — `?rep=`, defaults `original`, persists per-book in `sr.reader.prefs`
8. `frontend/src/store/useReaderStore.ts` — zustand, persisted

**Verification:** `cd frontend && npm run dev` → `localhost:5173/read/<bookId>/<chapterId>` → real chapter text → toggle Smart mode.

**Model:** Gemini 3.8 Flash · Medium. Contract in `FRONTEND_BLUEPRINT_SPEC.md` §S.4.8–§S.4.10.

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

*End of handoff. Update at the end of every session.*