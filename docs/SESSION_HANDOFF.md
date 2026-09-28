# Smart Reader — Session Handoff

> **Purpose.** Any assistant (Claude, GPT, Gemini, or a fresh DeepSeek) reads this and is fully oriented. Companion to `docs/ROADMAP_2026-09.md` (long-term), `docs/FRONTEND_BLUEPRINT.md` (narrative), `docs/FRONTEND_BLUEPRINT_SPEC.md` (contract). This file answers: *where are we, how do we work, what's next.*
>
> Working title: **Omnitome** (see PRODUCT_VISION.md §"Working title").

---

## 1. Where we are

**Phase 5.5 CLOSED 2026-09-27/28.** All 20 test suites green. Frontend build clean. Library polish complete. Smart Chapters promoted to first-class entities. Reading memory (toggle, indicators, resume) live.

**Last shipped commit:** `27ed088` — fix(frontend): enforce React rules of hooks in BookDetailsRoute.

**Test state:** 20/20 root suites green. Frontend `tsc --noEmit` clean. Runtime ~6–8 min. Origin synced.

**Next phase:** Phase 5.6 — Validation and refine loops.

### What ships today (Phase 5.5)

**Backend**
- New `smart_chapters` table: id, book_id, sequence, title, status (pending | generating | generated | failed), planned_source_section_ids, planned_word_count, content, synthesis_type, metadata_json, opened_at, read_at, read_source, created_at, updated_at.
- `paragraph_attributions` rebuilt with `smart_chapter_id` FK.
- PRAGMA user_version = 1 migration guard. Idempotent; initSchema no longer contains DROPs.
- `chapter_representations` narrowed to SUMMARY / BOOK_SUMMARY.
- `GET /api/books` filter now checks `EXISTS (smart_chapters WHERE book_id)`.
- `GET /api/smart-chapters/book/:bookId` — list + counts
- `GET /api/smart-chapters/:id` — full content + attributions
- `GET /api/smart-chapters/:id/provenance` — migrated
- `POST /api/smart-chapters/:id/progress` — opened / read / unread
- `GET /api/books/:id/resume-target` — last-touched generated chapter
- `chapterRepository.getEditorialRepresentationsForSourceChapter` uses `json_each(planned_source_section_ids)` — bypasses editorial_outlines
- `scripts/wipe-data.js` — dev DB wipe (test-data.db protected)

**Frontend**
- Three tabs remain: Import / Library / Research.
- Library: filter persistence (sessionStorage `library-filters-v1`), expandable tag panel (collapsed inline, expanded wrapped grid, no horizontal scroll), "N of M read" indicator (render only when > 0).
- Book Details: hero card elevation, section panel consistency, section headers with presence, Smart Chapters list with status badges + relative-time read/opened indicators + "Continue: Chapter N" button.
- Reader: reads from `/api/smart-chapters/:id`. Four-state status view. Toggle "Mark as read" / "✓ Read" in chrome. Fires opened on mount, read-scroll at 80% with scrollY > 200 guard.
- `useSmartChapters`, `useSmartChapter`, `useResumeTarget`, `useUpdateSmartChapterProgress` — new hooks.
- `formatRelativeTime` — just now / Nm / Nh / Nd / Mon D.
- `ExpandableTagPanel` — one component, two call sites.

### Phase 4 & 5 shipped, complete list

4.5 → 4.6 → 4.7 → 4.7.1 → 4.7.5 → 4.8 → 4.8.1 → 4.8.2 → 4.8.3 → 4.9
→ 4.10 → 4.10.5 → 4.11 → 4.11.1 → 4.11.5 → 4.11.6 → 4.12 → 4.13 →
4.13.1 → 4.14 → 4.15a → 4.15b → 4.16 → 4.19 → 4.20 → 4.21 → 4.21.1 →
4.24 → 4.25 → 5.1a → 5.1b → 5.1b.1 → 5.1b.2 → 5.2 → 5.2.1 → 5.2.2 →
5.2.3 → 5.3a → 5.3b → 5.3b.1 → 5.3d → 5.3d.1 → 5.3e → 5.3f → 5.5a →
5.5b → 5.5c.1 → 5.5c.2 → 5.5c.3 → 5.5d → 5.5d.1 → 5.5d.2

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

### Immediate: Docs close for Phase 5.5

Before opening 5.6, complete the phase close:
- SESSION_HANDOFF §1, §4, §5, §8 updates (this document)
- docs/session-logs/2026-09-27.md
- Roadmap reshape per §5 below

### Phase 5.6 — Validation and refine loops (2–3 sessions)

**Goal:** Make the compression pipeline self-correcting. Today the system produces output and marks failures honestly, but it does not verify or repair.

**Scope:**
1. **Pre-LLM source guard.** Before synthesis, verify that source chunks exist, are non-empty, and match the outline's planned section IDs. Fail honestly rather than compress garbage.
2. **Post-LLM output guard.** After synthesis, verify that output falls within the target word band and (where provenance is available) that compressed sentences map to cited chunks. Flag or retry if the ratio is wildly off.
3. **A3 resolution.** The uniform-character synthesis reps issue (flagged in Phase 4.25) — validate that generated reps have real sentence structure, not placeholder content.
4. **Compression overshoot tuning.** LLM self-assessment over-asks; the clamp enforces. Explore whether upstream prompts can reduce post-clamp violations.
5. **Retry policy consolidation.** Currently retries exist for word count violations in several places. Centralize the policy.

**Depends on:** Phase 5.5 (smart_chapters lifecycle enables the generating → generated → failed states used by validation).

**Not in scope for 5.6:**
- Slicer refactor (deferred to 5.7.2 — see below)
- Python sidecar (5.7)
- Tauri packaging (Phase 6)

---

## 5. Roadmap (reshaped 2026-09-27)

### Phase 5.6 (2–3 sessions) — Validation and refine loops
See §4 for scope.

### Phase 5.7.1 (2 sessions) — Python sidecar + OCR
Unchanged. FastAPI process on localhost:8765, PaddleOCR, Node integration, graceful fallback. Ships working OCR for image-only PDFs.

### Phase 5.7.2 (2–3 sessions) — Slicer refactor + hybrid parallelism
**Reshaped from original "Discussion + Story stubs".**

Bundles three concerns:
1. **Slicer refactor.** The chapter-slicing heuristic currently produces one Smart chapter per source section. On the ML PDF, this yielded 31 planned chapters where ~5–8 were expected. Target: segment by compressed-unit count, not source-section count. Same fix pass as the hybrid work below.
2. **BGE-M3 embedding migration to Python.** Current Node implementation serializes embedding calls. Python thread pool (sentence-transformers or equivalent) gives realistic 3–4× speedup on the ~3.5-minute ML PDF indexing step. Node keeps orchestration; Python owns the CPU-bound primitive.
3. **Parallel synthesis primitives.** Node-side promise pool for OpenRouter-bound work. Chapters within a book (or books within a batch) can synthesize concurrently with bounded concurrency. Rate-limit aware.

**Architectural boundary (locked):**
- Node owns: orchestration, OpenRouter calls, SQLite writes, HTTP API.
- Python owns: CPU-heavy primitives (embedding, OCR), exposed over local HTTP.
- No cross-process DB writes. Node is the sole writer.
- Interface between languages is small and versioned.

### Phase 5.7.3 (1–2 sessions) — Capability router + DOCX/RTF
Unchanged. Extension-based routing, content sniffing, try-Node-then-Python. DOCX and RTF ingestion via Python. Every routing decision logged.

### Phase 6 (3–5 sessions) — Tauri packaging
Unchanged. Desktop app: native dialogs, menus, bundled Node + Python sidecars, code signing, installers for Windows/macOS/Linux. Highest-risk phase. Budget for platform surprises.

### Build 5 (2–3 sessions) — Kokoro TTS
Unchanged. Local text-to-speech, sentence-level highlighting, playback UI, voice picker, auto-scroll. `data-tts-active` DOM stub is in place from Phase 5.2.

### Polish + Release (3–4 sessions)
Unchanged. Fixture licensing resolution, README, case study, real-content test, performance pass, accessibility pass, fresh-machine test, release notes, v1.0.0 tag.

### Dropped from roadmap (2026-09-27)
- **Discussion mode** — was a stub in 5.7.2. Now removed entirely. If it re-enters, it does so as a new module in a future build with its own plan, its own sessions, its own scope. Not folded into existing phases.
- **Story mode** — same. Removed from roadmap. Future build topic.

**Rationale:** Bundled features drag on scope. Multi-agent discussion and diffuser-based story generation are each substantial enough to warrant their own phase when the time comes. They are not stubs to be filled in during a slicer refactor.

### Future builds (post-v1.0.0, timing to be determined)
- **Discussion mode** — local multi-agent conversation over the corpus. Python sidecar with Ollama bindings. Entry point: a new top-level tab or a per-book surface. Own plan, own sessions.
- **Story mode** — narrative generation using Diffusers or equivalent. Python sidecar with GPU-bound models. Own plan, own sessions.
- **Additional modules** — the architecture is deliberately modular: Library / Research / Import are peer tabs; new capabilities enter as additional tabs or as sub-modules within the existing surfaces.

TOTAL: ~15–22 sessions over 4–5 weeks from today.
REALISTIC: 5–6 weeks with cleanup cycles.
TARGET: end of October 2026 / early November 2026, still feasible if 5.6 and 5.7 run clean.

---

## 6. Tracked items

### Active bugs / observations (unresolved)

- **A3 — Synthesis reps landed at uniform 250 chars on canonical import (2026-09-23).** Cannot verify whether this is a cap, spec mismatch, or silent fallback without the Phase 5.6 validation loop. **Hard dependency on Phase 5.6.** Do not investigate A3 before 5.6 ships.
- **Kaggle import duplicated.** "Kaggle and Code Dojo 1" appears twice in Library with the same title. Cleanup: identify duplicate ID, mark one `status='failed'`.
- **Smoothed progress counter.** Backend emits discrete checkpoints; frontend snaps on poll. Fix: `useSmoothedProgress` hook — animate displayed value toward each new target. Never overshoot; snap to 100 on completion.
- **Test fixtures undersized for slicer.** `build4_2bc` test book now produces 1 outline chapter (was 6); `build4_2a` smoke test also produces 1. Assertions updated to pass, but fixtures should enlarge to 5,000–12,000 words for multi-chapter coverage. Not urgent.

### Informational — by design, not bugs

- **Phase 5.6 input — ReaderRoute representation selection was non-deterministic (fixed 2026-09-25, 5.2.3).** `ReaderRoute.tsx` used `representations.find(r => r.type === 'EDITORIAL_SYNTHESIS')` against a list returned `ORDER BY created_at DESC`. Fixed by prioritizing: (1) `fromRep` query param, (2) outline chapter sequence, (3) ascending creation order. **Validation loops (5.6) should assert that representation↔chapter mapping is 1:1 for single-book reads.**
- **Phase 5.2 complete (2026-09-25).** Interactive provenance layer shipped: inline chips, hover wash, gradient highlights, preview card, return arrow, `data-tts-active` DOM stub.
- **Phase 5.6 input — A vs C agreement rate varies by document type.** On two-column ResNet, Signal A agreed with C's top chunk in only 14%, producing 6 b_arbitrated calls vs 55% on textbook. Investigate in Phase 5.6 with a correctness benchmark.
- **AI planning path — oversize units.** `plan()` (used only when `options.fast` is false) can assign 3,000–4,200 word source units. The 4.24 defensive guard applies to `sliceIntoSourceUnits`. Not a bug.
- **Parser chapter detection on SEC filings and two-column papers is shallow by design.** Editorial planner re-segments body content into 1,500–2,500 word units regardless of source chapter boundaries.
- **`math-heavy.pdf` yields 1 editorial candidate from 61 chunks.** Honest behavior for a document shape that isn't book-like.
- **Synopsis degradation on preface-less sources.** SEC filings, pasted text lack preface + TOC. Retry logic saves it today. Fragile.
- **Full suite runtime ~5–7 min.** Future: two-tier npm scripts (`test:fast` no-LLM, `test:full` including synthesis). Informational.

---

## 7. Phase 5.6 — Validation and refine loops (design intent)

Two loops, building on top of Phase 5.1/5.5:
- **Loop 1 — Pre-LLM source guard.** After slicing, verify all source units fall within [1,500, 2,500] words. If any unit is out of band: re-slice → re-verify → only when clean, dispatch to the LLM.
- **Loop 2 — Post-LLM output guard.** After the LLM returns a Smart Chapter, verify: word band [250, 360], grounding (each sentence traces to a source chunk), no fallback markers. If any check fails: re-prompt with stricter compression bounds → re-verify → ship clean or mark `fell_back` honestly.

---

## 8. Hazards (rules learned from incidents)

- **PowerShell `Set-Content -Encoding UTF8` writes a BOM.** Windows PowerShell 5.1 prepends `0xEF 0xBB 0xBF` to every file written with `-Encoding UTF8`. Vite tolerates it in source files, but it inflates diffs by 3 bytes per file, breaks some tooling, and is invisible in most editors. **Rule:** after any file written via `Set-Content -Encoding UTF8`, strip BOM:
  ```powershell
  node -e "const fs=require('fs');const b=fs.readFileSync('file');if(b[0]===0xEF)fs.writeFileSync('file',b.subarray(3));"
  ```
  Verify with a batch BOM check on all modified files before commit.

- **Full-file rewrites via heredoc risk public API drift.** Even when build and tests pass, verify function signatures after any full-file rewrite. Precedent: `useEditorial.ts` and `ChapterNav.tsx` were fully rewritten in 5.5c.3. **Rule:** after a full-file rewrite, run:
  ```powershell
  git show HEAD~1:<file> | Select-String "export function"
  git show HEAD:<file> | Select-String "export function"
  ```
  and diff the export surfaces manually.

- **SQLite `CURRENT_TIMESTAMP` returns UTC without a Z marker.** Format is `"YYYY-MM-DD HH:MM:SS"` — no `T` separator, no `Z` suffix. Frontend `new Date()` parses this as **local time**, causing a false offset equal to the user's TZ offset. Live incident: "Read 5h ago" for a just-marked read (IST +5:30). **Rule:** normalize to ISO 8601 UTC at the repository boundary — `formatRow()` should convert `"YYYY-MM-DD HH:MM:SS"` to `"YYYY-MM-DDTHH:MM:SSZ"` before returning. Defense in depth: display helpers should also normalize before parsing.

- **Rules of Hooks enforcement before early returns.** Never place a hook call below conditional returns (e.g. loading skeletons, error states). All hooks must remain unconditionally at the top of the component. Live incident in 5.5d.2: `useResumeTarget` called below `if (isBookLoading) return <BookDetailsSkeleton />` triggered "Rendered more hooks than during previous render" on load.

- **Verify-before-stage (reinforced).** After every file write: `Get-Item <file> | Select-Object Length` (>0 required). Before commit: `git show :<file> | Measure-Object -Line` on every staged file. This rule paid off in 5.5c.3 (BOM caught) and 5.5d.2 (timestamp format fix verified via staged diff).

- **Backend restart after backend commits (reinforced).** Vite hot-reloads the frontend; Node does not. Every 5.5 backend commit required an explicit dev-server restart before manual verification. Followed cleanly through Phase 5.5 — no repeat of the 5.3d masking incident.

- **Transcript spelunking — 7 incidents.** Agent searches its own `.system_generated/logs/transcript*.jsonl` for prompts rather than using pasted text. **Rule: re-paste, don't mine.**

- **Buffer drift — 3 incidents.** Stale editor buffer flushes post-commit, corrupting working tree. **Rule: after every commit, `git status --short`. If unexpected `M` lines appear, `git diff` then `git checkout HEAD -- <file>`. Never `git reset --hard`.**

- **Fabricated verification — 1 incident (2026-09-23).** **Rule: verification evidence must always be pasted from actual terminal output. Any invented evidence is a project-integrity failure.**

- **License-check any fixture before git add.** See `docs/RIGHTS.md`.

---

## 8.5. Process notes

### Manual walkthrough remains the correctness gate
Phase 5.5 was largely caught by manual browser checks, not automated tests:
- Reading indicator alignment (5.5d.2) — no test would have caught it
- "5h ago" timezone bug (5.5d.2) — only visible in browser
- Live ML PDF import exposing 31-chapter slicer behavior — only real data surfaces this
- 5.5d resume button, toggle, indicators — all verified in browser

Automated suites remain essential for regression and for the backend contract. But the user-visible behaviors of this product need human eyes. Continue treating the browser walkthrough as the final gate.

### The dev DB is disposable; the test DB is not
Phase 5.5 wiped `storage/data.db` to escape legacy state. The `resetAndSeedDatabase()` fixtures in `database.js` now generate battle-hardened data:
- Fixture A: minimal (3 planned, 2 generated, 1 pending)
- Fixture B: realistic (8 planned, 5 generated, 2 pending, 1 failed)
- Fixture C: multi-source dossier (4 planned, drawing from 3 books)

These fixtures exercise the full state matrix and are now the source of truth for what the schema looks like in production. Any schema change requires fixture update in the same commit.

### Re-paste, don't mine — reinforced
Transcript spelunking incidents stopped mid-Phase 5.5. Prompts now re-paste context explicitly. This works. Continue.

### Model delegation is now habitual
- Flash Medium: mechanical backend + frontend wiring.
- Claude Sonnet: primary reading surface, visual hierarchy.
- Gemini Pro: architectural plans, feasibility audits.
- `/boost`: verification-critical sessions (data migration, or paths that touch cross-tab state).

---

## 9. Deferred & Ideas

### Deferred (tracked, with target)
- **Citation integrity check** — dropped from Phase 5.6; deferred to post-Python hybrid phase (Phase 5.7+). Sentence-level verification of [Source N] grounding against indexed chunk vectors is best performed alongside embedding-accelerated Python primitives.
- **Slicer refactor** — target Phase 5.7.2. Real ML PDF import yielded 31 Smart chapters (one per source section). Target ~5–8 by segmenting on compressed-unit count. Bundled with hybrid parallelism work.
- **Timestamp format consistency** — non-blocking. Repository now normalizes to ISO 8601 UTC. Check any future timestamp fields for the same pattern before shipping.
- **`formatRelativeTime` scope drift** — report mentioned `Xmo ago` and `Xy ago` in the implementation. Spec only asked for `just now / Nm / Nh / Nd / Mon D`. Verify on next touch; non-blocking.
- **Empty chapter handling** in synthesis (pre-existing).
- **Fixture licensing swap** — RIGHTS.md, pre-commercial release.

### Ideas (not scheduled, recorded for context)
- **Hybrid Node + Python is the target model.** Not a fallback. Node owns orchestration, I/O, HTTP, SQLite writes. Python owns CPU-heavy primitives (embedding, OCR, future ML). Each language does what it is uniquely good at. The interface between them is small and stable. This is a philosophy, not a workaround.
- **Modular product shape.** Library / Research / Import are peer tabs today. Future capabilities (Discussion, Story, other modes) enter as additional peer tabs or as sub-modules within existing surfaces. No capability is bundled with another. Each gets its own plan and its own sessions when it arrives.
- **Parallelism is real but not free.** Multi-chapter synthesis and batch imports can be parallelized Node-side (promise pool) but this introduces race conditions, partial-failure semantics, and a real scheduler. Parked as a 5.7.2 concern alongside the Python migration.
- **Reading progress could extend to per-paragraph precision.** Currently chapter-level (opened_at, read_at). Paragraph-level would require a new table. Not worth the schema cost until reading analytics become a product surface. Logged for future consideration.
- **Session log as durable artifact.** Docs/session-logs/ is gitignored but that may change. If the project becomes a portfolio artifact, the session logs are the strongest proof of process discipline. Decision deferred.

### Re-entry rules for dropped features
- **Discussion mode** and **Story mode** are removed from the roadmap. If either re-enters, it does so as a new top-level module in a future build — with its own plan, its own sessions, its own scope. No folding into existing phases. No stubs.
- **Any future large feature** follows the same rule: separate plan, separate sessions, deliberate inclusion. Bundling is a scope hazard.

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
2. Paste: *"Read `docs/SESSION_HANDOFF.md`, `docs/PRODUCT_VISION.md`, and `docs/CONTINUITY.md`. Confirm orientation, then tell me tomorrow's Phase 5.6 task in one paragraph."*
3. Any competent model orients in one turn

**Carry forward:**
- Two-representation invariant (Original immutable, Smart traceable)
- Three laws (Source is paper / Lens is tinted / Derivation never masquerades)
- Raw-output verification over model summaries
- One workstream per session
- Commit docs before code
- Verification evidence is pasted, never asserted

---

*End of handoff. Update at the end of every session.*
