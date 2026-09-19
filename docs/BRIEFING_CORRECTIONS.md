# Briefing Corrections

> **Purpose.** A fresh chat's "Repository Report" (dated 2026-09-19) contained
> several inaccurate claims. This document corrects them against verified
> repo state, so future agents don't propagate the drift. Read alongside
> `SESSION_HANDOFF.md` and `PRODUCT_VISION.md`.

**Verified against HEAD `9505506` on 2026-09-19.**

---

## Claims that were wrong

### 1. Reader route pattern
- **Briefing said:** `/book/:bookId/read/:chapterId`
- **Actual:** `/read/:bookId/:chapterId`
- **Evidence:** `frontend/src/App.tsx:27`
- **Implication:** Nested route pattern was hallucinated. Simple flat pattern in use.

### 2. Theme count and names
- **Briefing said:** three themes (`theme-light`, `theme-warm`, `theme-dark`)
- **Actual:** four themes — `default`, `warm`, `dark`, `glass` — applied via `data-theme="..."` on `<html>`.
- **Evidence:** `frontend/src/styles/index.css:14, 37, 60, 83`
- **Implication:** `glass` theme exists (frosted backdrop-filter treatment) and is load-bearing for the design system.

### 3. Test suite count
- **Briefing said:** 11 suites
- **Actual:** 13 suites
- **Evidence:** `scripts/run-all-tests.js` — 13 matches
- **Missing from briefing:**
  - `build4_4_progressive_synthesis_test.js`
  - `build4_5_bge_migration_test.js`

### 4. BGE-M3 stated as "cloud"
- **Briefing said:** *"Local TF-IDF/BM25 hashed vectors for zero-dependency offline operation; cloud BGE-M3 1024d for higher quality."*
- **Actual:** BGE-M3 runs **locally** via `@huggingface/transformers` + `Xenova/bge-m3` (q8 INT8, 559.6 MB cached). No cloud call. The `LocalDenseSemanticVectorizer` (256d) is the legacy fallback, not the default.
- **Evidence:** `backend/services/semantic/embeddings/bgeEmbeddingProvider.js`, `v0.4.5` tag
- **Implication:** A future agent must not design a "cloud embedding tier" — the tiers are *legacy (256d) vs BGE-M3 (1024d)*, both local.

### 5. "Neo Sans" typography mode
- **Briefing said:** the reader has a typography mode called "Neo Sans"
- **Actual:** `useReaderStore` has `fontSize` (16–22 clamped) and `align` (`left` / `justify`) only. No typography mode field. No "Neo Sans" reference anywhere.
- **Evidence:** `frontend/src/store/useReaderStore.ts:7–11, 19, 35–37`
- **Implication:** Hallucination. Ignore.

---

## Claim that revealed a spec bug (not a briefing bug)

### 6. Chapter update method
- **My spec said:** `PATCH /api/chapters/:id`
- **Actual code:** `PUT /api/chapters/:id`
- **Evidence:** `backend/routes/chapterRoutes.js:20`
- **Action required:** Update `FRONTEND_BLUEPRINT_SPEC.md` §S.4.9 and any frontend code that calls this endpoint to use PUT.
- **Frontend status:** no caller exists yet. Verified 2026-09-19 — `Select-String` for `PUT|PATCH|method:` in `useChapters.ts` and `BookDetailsRoute.tsx` returns only false positives (`input` matching `put`). The read-status toggle is not yet wired in the frontend; it will use PUT when built.

---

## Claims the briefing made that were correct

- `resolveSafeProvider()` exists and never leaks secrets
- Chunker token targets: min 80, max 350, hard 550
- `semanticLifecycle` progress at 10/25/50/75/complete
- Pipeline narrative (extraction → parsing → canonical → structure → chunking → index → plan → synthesis)
- File tree structure (backend/, frontend/, docs/, scripts/, src/ legacy)
- Three AI providers: Ollama (local), Gemini (cloud), OpenRouter (cloud, default `deepseek/deepseek-v4-flash`)
- `canonicalBlocks` block types: heading, paragraph, quote, list, table, separator, code
- "Never mutate source content" invariant
- `contextBuilder` provenance format `[Source N: Title, Section: ...]`
- `sourcePage` provenance on canonical blocks

---

## What was missing from the briefing entirely

These are the pieces a fresh agent needs and the briefing didn't include:

### 1. Namespace mismatch (Phase 4 blocker)
Editorial synthesis writes representations keyed to **synthetic chapter ids**
(`book-editorial-<bookId>-ch-plan-N`), while the reader navigates by **source
chapter ids** (`ch-clockwork-2`). The two namespaces don't map. Content is
real (verified 12,523 and 8,430 chars in the DB) but unreachable — Smart
mode falls back to `SmartEmptyState`.

**Bridge:** `semantic_chunks.chapter_id` — a semantic chunk carries both its
own `id` (referenced in `sourceSectionIds`) and the source chapter id it
came from. That's the join.

### 2. Frontend migration phase status
The briefing implies the frontend is at "Reader Modes UI" (as if Phase 1).
Actual shipped state:
- Phase 1 — Library route ✅
- Phase 2 — Reader + Canonical blocks ✅
- Phase 3 — Book Details + typography ✅
- Phase 3.5 — Modals + Smart mode + progressive generation ✅ (D4 Import not yet shipped)

### 3. `PRODUCT_VISION.md` refinements
The vision doc contains specific refinements beyond the thesis:
- **Sentence-level citation enforcement** (prompt + validation + UI layers)
- **Position not page** — format-appropriate coordinates per source type
- **Smart Chapters as their own object** — independent titles, numbering, length
- **Text-first source view for v1** — no in-browser PDF rendering
- **Synopsis-before-chapters sequencing**
- **Chapter-boundary tolerance ±10%**

### 4. Two-document blueprint split
- `FRONTEND_BLUEPRINT.md` — public narrative (no markers)
- `FRONTEND_BLUEPRINT_SPEC.md` — engineering contract (with `<!-- BEGIN -->` / `<!-- END -->` markers)

The briefing conflates them.

### 5. Session-logs infrastructure
`docs/session-logs/` is gitignored, local-only. Purpose: personal retrospectives,
not portable project state. Distinct from `SESSION_HANDOFF.md`.

### 6. Tauri Phase 4.5 decision gate
The app is **web-first**. Tauri packaging is a separate, later decision to be
made at the end of Phase 4. Do not design frontend features assuming a native
shell.

---

## Recommended briefing template for future agents

When handing off to a fresh chat or model, include:

1. **`SESSION_HANDOFF.md`** — current state, how we work, next phase
2. **`PRODUCT_VISION.md`** — the North Star
3. **`FRONTEND_BLUEPRINT_SPEC.md`** — engineering contract
4. **`BRIEFING_CORRECTIONS.md`** (this file) — corrections against drift
5. **Repo read access** — GitHub URL or local clone

Docs describe what we're doing. Code verifies. Both are required.

---

*End of corrections. Update when new discrepancies surface.*