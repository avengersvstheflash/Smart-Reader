````markdown
# Smart Reader — Session Handoff

> **Purpose.** Any assistant (Claude, GPT, Gemini, or a fresh DeepSeek) reads this and is fully oriented. Companion to `docs/ROADMAP_2026-09.md` (long-term), `docs/FRONTEND_BLUEPRINT.md` (narrative), `docs/FRONTEND_BLUEPRINT_SPEC.md` (contract). This file answers: *where are we, how do we work, what's next.*
>
> Working title: **Omnitome** (see PRODUCT_VISION.md §"Working title").

---

## 1. Where we are

**Phase 5.7.2 CLOSED 2026-10-02.** All 25 test suites green. Frontend build clean. Origin synced. Tagged v0.6.0.

**Current HEAD:** `4165935` — Phase 5.7.2 Session 3c: Add reranker/centroid attribution fallback stages.

**Test state:** 25/25 root suites green. Frontend `tsc --noEmit` / `npm run build` clean. Origin synced.

- `phase5_7_ocr_test.js`: OCR integration: checkReady, ocrPdf error translation, parser OCR routing, OCR_EMPTY_OUTPUT guard. 9 tests.
- `phase5_7_2_nlp_test.js`: NLP integration: pysbd sentence split, chunk stub, modular/shim client contract, error taxonomy, rerank client contract. 12 tests.
- `phase5_7_2_embed_test.js`: Embedding integration: embedClient contract, warming backoff, error taxonomy, shim integrity. 6 tests.
- `phase5_7_2_parallel_test.js`: Parallel synthesis infrastructure: promise pool concurrency bounds, atomic status claims, rate-limit backoff, skipped-chapter handler. 6 tests.

**Next phase:** Phase 5.7.3 — capability router + DOCX/RTF ingestion. Then Phase 6 Tauri packaging.

### Previously shipped

**Phase 5.7.2 arc (in progress):**

- **Session 3b-1 (2026-10-02)** — parallel synthesis infrastructure. `runWithConcurrency` promise pool (`backend/services/synthesis/promisePool.js`), atomic `claimForSynthesis()` on smart chapter repository (`UPDATE ... WHERE status='pending'`), `callOpenRouterWithBackoff` in `openrouterProvider.js` with exponential backoff + jitter, `editorialService.synthesizeNextChapters()` reworked to pool-based execution (`OPENROUTER_CONCURRENCY=2` default). Progress reporting switched from sequential `currentChapterId` to `chaptersInFlight` array + `completedCount` tally.
- **Session 3a (2026-10-01)** — BGE reranker infrastructure. `/v1/nlp/rerank` endpoint (Python, lazy CrossEncoder load), `nlpClient.rerankCandidates()`, `SynthesisService.rerankParagraphCandidates()` helper (not yet wired — Session 3c). Fixed WinError 127 torch/Paddle DLL load order via `import torch` at top of `main.py`. Live measured: 562ms for 10 candidates, sharp ranking.
- **Session 2b (2026-10-01)** — slicer to Python + dynamic chapter budget. `/v1/nlp/slice` endpoint, `sliceIntoSourceUnitsAsync` wrapper with JS fallback, `computeChapterWordBudget` dynamic 1500–2500 for sources ≥5000 words (~22% retention), downstream clamp raised 450 → 2500.
- **Session 2a (2026-10-01)** — BGE-M3 Python embedder. `/v1/embed/batch` endpoint, `embedClient.js`, runtime switch via `USE_PYTHON_EMBEDDER` (default false), migration script `scripts/migrate-bge-to-python.js` (created, not yet run). Sidecar modularized into `ocr/`, `nlp/`, `embed/` packages.
- **Session 1 (2026-09-30)** — NLP sidecar endpoints. `pysbd` sentence split, chunk stub, modular Node clients (`sidecarBase.js` + `ocrClient.js` + `nlpClient.js`), `pythonSidecarClient.js` shim.

**Phase 5.7.1 (2026-09-30)** — Python sidecar + OCR. FastAPI on `127.0.0.1:8765`, PaddleOCR `ch_PP-OCRv4`, boot warm-up with `/v1/ready` probe. `pdfjsParser.js` routes image-only PDFs (< 20 chars selectable text) to OCR with honest-failure fallback (`OCR_EMPTY_OUTPUT` guard tested).

### Phase 5.5 & 5.6 series

- **5.6.4** — multi-source provenance granularity (`MULTI_CHUNK_DELTA_THRESHOLD = 0.08`, `SINGLE_SENTENCE_WEIGHT_FLOOR = 0.25`, `chunk_ids` array, stacked popup source cards, `Source (N)` chips).
- **5.6.5** — author extraction + multi-author display (Oxford-comma `formatAuthorList()`, bibliographic backfill).
- **5.6.6** — synopsis markdown normalization + full render (no `**` tokens, no `.slice(0, 300)` truncation).
- **5.6.1–3** — pre-LLM source guard, post-LLM `aiRetryGuard` with auto-resynthesis, semantic chunker hardening (heading glue + post-pass merge), PDF parser heading/math refinement.
- **5.5 series** — `smart_chapters` table, reading progress API, resume-target queries, Library filter persistence, expandable tag panel, relative-time indicators, dedicated reader route with 4-state status, chip stability (oscillation fix), abbreviation-aware sentence splitting.

### Phase 4 & 5 shipped, complete list

4.5 → 4.6 → 4.7 → 4.7.1 → 4.7.5 → 4.8 → 4.8.1 → 4.8.2 → 4.8.3 → 4.9
→ 4.10 → 4.10.5 → 4.11 → 4.11.1 → 4.11.5 → 4.11.6 → 4.12 → 4.13 →
4.13.1 → 4.14 → 4.15a → 4.15b → 4.16 → 4.19 → 4.20 → 4.21 → 4.21.1 →
4.24 → 4.25 → 5.1a → 5.1b → 5.1b.1 → 5.1b.2 → 5.2 → 5.2.1 → 5.2.2 →
5.2.3 → 5.3a → 5.3b → 5.3b.1 → 5.3d → 5.3d.1 → 5.3e → 5.3f → 5.5a →
5.5b → 5.5c.1 → 5.5c.2 → 5.5c.3 → 5.5d → 5.5d.1 → 5.5d.2 → 5.6.1 →
5.6.2 → 5.6.3 → 5.5e → 5.5e.1 → 5.5e.2 → 5.5e.3 → 5.6.5 → 5.6.6 → 5.6.4 →
5.7.1 → 5.7.2 S1 → 5.7.2 S2a → 5.7.2 S2b → 5.7.2 S3a → 5.7.2 S3b-1

---

## 2. How we work

**Standard:** *"Something I can talk about with confidence, not shame."* Every claim verified against raw output, not model summaries. No commits on a dirty tree. No commits on a red suite. Divergence rebased, never force-pushed.

**Guardrails:**

- One workstream per session
- Commit docs before code
- Never commit `.env` or keys
- Chat logs are historical; the filesystem is current
- Escalate model thinking level only after failure
- **Verification evidence must always be pasted from actual terminal output, never asserted.** Fabricated evidence is a project-integrity failure (see §8).
- **Re-paste, don't mine.** If the prompt doesn't appear in current context, paste it again. Do NOT let the agent extract prompts from its own transcript logs.
- **After every commit, run `git status --short`.** If unexpected `M` lines appear, suspect buffer drift — `git diff` first, then `git checkout HEAD -- <file>`. Never `git reset --hard`.
- **Commit before any agent task touches a file.** Uncommitted work is at risk from every agent operation. See §8 `git checkout` rule.

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

### Phase 5.7.2 Session 3b-2 — Empirical OpenRouter concurrency diagnostic

**Goal:** Ramp concurrency N ∈ [1,5] against real OpenRouter synthesis on a small synthetic test book, record 429/5xx counts, per-call latency, event-loop lag, success rate. Produce `docs/DIAGNOSTIC_2026-10_concurrency.md` with the measured numbers and a recommendation on whether the shipped default (2) should be raised.

**Scope:**

- `scripts/diagnostic-concurrency.js` — self-contained, runtime-generates synthetic book, drives the ramp, writes artifact.
- No production code changes unless the measured data justifies a config default change.
- Commit diagnostic script + artifact when complete.

**After 3b-2 → Session 3c:** wire `SynthesisService.rerankParagraphCandidates()` into the write-time synthesis path, add schema for `reranker_score` if needed, apply clause-aware splitting via the new `pysbd` endpoint, integrate paragraph-centroid anchoring. Close two soft flags from 3a (dead 1.5s check, helper wiring).

---

## 5. Roadmap (reshaped 2026-09-28)

### Phase 5.6 & 5.6.4 (shipped 2026-09-28 & 2026-09-29) — Validation and refine loops

✅ **CLOSED**. Pre-LLM and post-LLM validation guards, centralized aiRetryGuard, auto-resynthesis on persistent violation, semantic chunker hardening (heading glue + post-pass merge), and PDF parser heading/math refinement. Reader chip stability (5.5e, 5.5e.1) and follow-up items 5.5e.2 (chip spacing), 5.5e.3 (chip animation), 5.6.5 (author extraction), 5.6.6 (synopsis markdown), and 5.6.4 (multi-source provenance granularity) all shipped and verified. Phase 5.5 and Phase 5.6 series formally closed.

### Phase 5.7.1 (shipped 2026-09-30) — Python sidecar + OCR

✅ **COMPLETE**. Python sidecar established (FastAPI on 127.0.0.1:8765, PaddleOCR ch_PP-OCRv4, boot warm-up with /v1/ready probe). Node client wraps the sidecar; pdfjsParser.js routes image-only PDFs (< 20 chars selectable text) to OCR with honest-failure fallback. 22/22 suites green at close.

- **Deferred to 5.7.2:** Nothing outstanding from 5.7.1 — the OCR_EMPTY_OUTPUT guard has a passing test (T9) and the redundant catch clause was removed in 06abb3a.

### Phase 5.7.2 (AMENDED SCOPE, ~6 sessions) — NLP migration + hybrid parallelism + attribution refinement

**Status:** Phase 5.7.2 CLOSED 2026-10-02. Sessions 1, 2a, 2b, 3a, 3b-1, 3b-2, 3c COMPLETE. Tagged v0.6.0.

- `/v1/nlp/chunk` is a placeholder — Node `semanticChunker.js` remains authoritative until a future phase ports it (R1 scope-hold resolution from the audit).

**Shipped so far:**

1. **Session 1** — NLP sidecar endpoints (pysbd split, chunk stub), modular Node clients.
2. **Session 2a** — BGE-M3 Python embedder (`/v1/embed/batch`, `embedClient.js`, `USE_PYTHON_EMBEDDER` flag). Sidecar modularized.
3. **Session 2b** — Slicer to Python (`/v1/nlp/slice`), dynamic chapter budget (1500–2500 words for substantial sources).
4. **Session 3a** — BGE reranker infrastructure (`/v1/nlp/rerank`, `nlpClient.rerankCandidates()`, helper in synthesisService).
5. **Session 3b-1** — Parallel synthesis with bounded promise pool + atomic status claim + backoff wrapper.

**Remaining:**

6. **Session 3b-2** — Empirical concurrency diagnostic + tuning + artifact.
7. **Session 3c** — Attribution refinement: wire reranker helper into write path, clause-aware splitting, paragraph-centroid anchoring, schema for `reranker_score`.

**Architectural boundary (locked):**

- Node owns: orchestration, OpenRouter calls, SQLite writes, HTTP API.
- Python owns: CPU-heavy primitives (embedding, OCR, NLP segmentation, reranking), exposed over local HTTP.
- No cross-process DB writes. Node is the sole writer.
- Interface between languages is small and versioned.

### Phase 5.7.3 (1–2 sessions) — Capability router + DOCX/RTF

Unchanged. Extension-based routing, content sniffing, try-Node-then-Python. DOCX and RTF ingestion via Python. Every routing decision logged.

### Phase 6 (3–5 sessions) — Tauri packaging

Unchanged. Desktop app: native dialogs, menus, bundled Node + Python sidecars, code signing, installers for Windows/macOS/Linux. Highest-risk phase. Budget for platform surprises.

**Distribution decisions (locked 2026-10-01):** single-installer bundle; quantize BGE-M3 + reranker to q8 (~1.5 GB combined vs ~4.5 GB fp32) to target ~1.5–2 GB installer; optional modules (TTS/audio, Discussion, Story, Video) ship as opt-in downloads, not bundled.

### Build 5 (2–3 sessions) — Kokoro TTS

Unchanged. Local text-to-speech, sentence-level highlighting, playback UI, voice picker, auto-scroll. `data-tts-active` DOM stub is in place from Phase 5.2. Ship as optional module.

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
TARGET: end of October 2026 / early November 2026.

---

## 6. Tracked items

> **Last reconciled:** 2026-10-02, after Session 3b-1. Some items below may be stale; verify against current code before acting.

### Active bugs / observations (unresolved)

- **Kaggle import duplicated.** "Kaggle and Code Dojo 1" appears twice in Library with the same title. Cleanup: identify duplicate ID, mark one `status='failed'`.
- **Smoothed progress counter.** Backend emits discrete checkpoints; frontend snaps on poll. Fix: `useSmoothedProgress` hook — animate displayed value toward each new target. Never overshoot; snap to 100 on completion.
- **Test fixtures undersized for slicer.** `build4_2bc` test book now produces 1 outline chapter (was 6); `build4_2a` smoke test also produces 1. Assertions updated to pass, but fixtures should enlarge to 5,000–12,000 words for multi-chapter coverage. Not urgent.

### Informational — by design, not bugs

- **Representation selection determinism (fixed 2026-09-25, 5.2.3).** `ReaderRoute.tsx` prioritizes: (1) `fromRep` query param, (2) outline chapter sequence, (3) ascending creation order. Validation loops (5.6) assert representation↔chapter mapping is 1:1 for single-book reads.
- **A vs C agreement rate varies by document type.** On two-column ResNet, Signal A agreed with C's top chunk in only 14%, producing 6 b_arbitrated calls vs 55% on textbook. Investigate in a future phase with a correctness benchmark.
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

- **Backend restart after backend commits (reinforced).** Vite hot-reloads the frontend; Node does not. Every backend commit requires an explicit dev-server restart before manual verification.

- **Transcript spelunking — 8+ incidents.** Agent searches its own `.system_generated/logs/transcript*.jsonl` for prompts rather than using pasted text. **Rule: re-paste, don't mine.**

- **Buffer drift — multiple incidents (5+).** Stale editor buffer flushes post-commit, corrupting working tree. Recovery: `git checkout HEAD -- <file>`. **Rule:** after every commit, `git status --short`. If unexpected `M` lines appear, `git diff` then `git checkout HEAD -- <file>`. Never `git reset --hard`.

- **Fabricated verification (multiple incidents: #1 4.24, #2 5.6.3, #3 5.7.2-S1, #4 5.7.2-S2a).** Reported test passage with invented suite filenames; synthesized file contents, sizes, test output, and curl responses for files never written. **Rule:** any claim of test passage must include the actual suite filenames and raw output as they appear in the runner. "All X passed" without filenames is unverifiable and rejected. Every report that claims file creation must include raw `Get-Item Name, Length` output. Every report that claims test passage must include the raw `=== <suite> ===` blocks from a fresh run. If either is missing or truncated, reject.

- **Regex-based sentence splitting is fragile (2026-09-28).** The splitter required two hotfixes in a single session (5.5e and 5.5e.1) to handle English abbreviations, initials, and math notation correctly. **Rule:** future sentence-boundary work targets the Python NLP migration (shipped in 5.7.2 S1). pysbd handles this natively.

- **Sandbox persistence failure (variant 2) (2026-09-30).** Antigravity reported file sizes that did not match the real filesystem. Files were 0 bytes on disk when git read them at stage time. Commit a674887 contained empty blobs and was amended. **Rule:** after any Antigravity session that claims to create or modify files, run `Get-Item <file> | Select-Object Length` on each claimed file BEFORE `git add`. Any 0-byte file indicates sandbox persistence failure. Recreate manually and re-verify.

- **.gitignore encoding hazard (UTF-16) (2026-09-30).** A UTF-16-encoded `.gitignore` silently fails to parse in git (every line treated as garbage) while still reading correctly in PowerShell `Select-String`. Detection: `git check-ignore -v <path>` returns empty despite the pattern being visible in the file. **Rule:** `.gitignore` must be UTF-8 without BOM. If `git check-ignore` returns empty for a pattern that is visibly present, suspect encoding before suspecting the pattern.

- **License-check any fixture before git add.** See `docs/RIGHTS.md`.

- **Antigravity write_to_file tool is broken (variant 4) (2026-10-01).** The tool reports success but writes 0 bytes to disk. Workaround: have the agent generate a Node script that writes file contents via `fs.writeFileSync`, then run it with `node <script>`. Never trust write_to_file's success report. Always verify sizes with Get-Item.
  **Rule:** for any Antigravity task that creates more than 2 files, require the writer-script pattern in the prompt. Verify all target file sizes immediately after.

- **PowerShell here-string interpolation (recurring, 2026-10-01).** `Set-Content -Value @" ... "@` (double-quoted here-string) interpolates `${...}` inside embedded content, silently corrupting JavaScript template literals. This caused multiple sessions' worth of broken write scripts. When a writer script fails twice, STOP regenerating via PowerShell string literals — switch to a Python generator using `json.dumps()`. Python has no shell interpolation issues. **Rule:** two-layer escaping is always wrong. Use a data serialization layer (Python json.dumps, or a standalone .js file written by a plain text editor) rather than string substitution.

- **git checkout on uncommitted files (2026-10-01, Session 2b).** During troubleshooting, the agent ran `git checkout <file>` on files whose changes had not been committed. This restored them to HEAD and wiped ~450 lines of completed, tested work. The agent did not report the loss; caught by manual terminal inspection. **Rule:** commit before any agent task touches a file. If a file must be in-flight, use `git stash` and treat the stash as sacred. Never let the agent execute `git checkout` on a working-tree file it did not itself stage. Never let the agent run `git restore` or `git reset` on the working tree.

- **Empty-success report (2026-10-01, Session 2b).** The agent's final report was a numbered list of "Success" claims with no diffs, no file contents, and no raw test output. Same fabrication pattern, dressed as confirmation rather than evidence. **Rule:** every report must include raw terminal output for every claim. "Success" without a pasted command output is unverifiable and rejected.

- **Uncommitted-work discipline (2026-10-01).** Sessions 2a and 2b both saw work nearly lost because it sat uncommitted while the agent operated on the same files. **Rule:** commit after every verified change. Do not batch multiple agent passes onto an uncommitted tree.

- **Agent committed without approval (2026-10-02, Session 3c).** Prompt said "Do NOT commit." Agent ran `git add . && git commit` anyway, then `git commit --amend --no-edit`. Commit was local-only; recovery clean. **Rule:** a commit from the agent when the prompt says no invalidates the session and forces re-audit from HEAD.

- **`git checkout` on working tree (3rd occurrence, 2026-10-02).** Agent ran `git checkout HEAD -- provenanceResolver.js` during its own troubleshooting. **Rule:** never let the agent run checkout/restore/reset on working-tree files.

- **Parallel replace_file_content clobbering (2026-10-02).** Two simultaneous edits to provenanceResolver.js; one overwrote the other. **Rule:** serialize multi-edit passes on a single file.

- **"Phase closed" claim before verification (2026-10-02).** Agent declared phase closure after committing an incomplete change. **Rule:** agents never declare phase closure; the user does after docs-close and tag.

- **Session passed tests for the wrong reason (2026-10-02).** Plan deliverable was resolver consuming reranker_scores; commit had 1 supporting line. T13 passed via the legacy path. **Rule:** verify the diff shows the actual new branch; consider disabling the new branch and re-running — if the test still passes, it isn't exercising the new code.

- **Test FK bypass to silence schema (2026-10-02, Session 3b-1).** The agent wrote a test that inserted a `smart_chapters` row without a parent `books` row and disabled foreign keys (`PRAGMA foreign_keys = OFF`) to make it pass. This bypasses production schema semantics. Caught during terminal verification. Fixed manually by inserting a real parent row. **Rule:** test schema must match production schema semantics. Disabling constraints to make a test pass is a rejection, not a fix. Test fixtures should provision real parent records.

- **Writer-script iteration spiral (2026-10-02, Session 3b-1).** The agent consumed 6+ write-script iterations during Session 3b-1 before succeeding — PowerShell here-string escaping, base64 detour, `git restore` usage. Same failure modes as Session 2a. The two-layer Python generator pattern works reliably but must be explicitly required in the prompt. **Rule:** every multi-file Antigravity prompt requires the Python-generator + Node-writer two-layer pattern by name. Do not let the agent improvise a writer.

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

Transcript spelunking incidents stopped mid-Phase 5.5. Prompts now re-paste context explicitly. Continue.

### Model delegation is now habitual

- Flash Medium: mechanical backend + frontend wiring.
- Claude Sonnet: primary reading surface, visual hierarchy.
- Gemini Pro: architectural plans, feasibility audits.
- `/boost`: verification-critical sessions (data migration, or paths that touch cross-tab state).

---

## 9. Deferred & Ideas

> **Last reconciled:** 2026-10-02, after Session 3b-1.

### Completed (retained for reference; do not re-open)

- ✅ **Sidecar modularization** — Shipped Session 2a. `sidecars/python/main.py` split into `ocr/`, `nlp/`, `embed/` packages.
- ✅ **Slicer refactor** — Shipped Session 2b. `/v1/nlp/slice` Python endpoint, dynamic chapter budget 1500–2500 words, clamp raised 450 → 2500.
- ✅ **NLP pipeline migration to Python** — Shipped Sessions 1 & 2b. `pysbd` sentence split + slicer in Python sidecar. Frontend receives pre-computed sentence boundaries where applicable.
- ✅ **BGE-M3 embedding migration to Python** — Shipped Session 2a. `sentence-transformers` fp32 in Python sidecar. `USE_PYTHON_EMBEDDER` flag (default false), migration script ready.

### Deferred (tracked, with target)

- **BGE-M3 migration execution (target 5.7.2 close or later)** — `scripts/migrate-bge-to-python.js` created but not run. Requires sidecar running + `USE_PYTHON_EMBEDDER=true`. Run on real DB when ready. Decision on flipping the default at phase close.
- **Attribution algorithm refinement (target 5.7.2 Session 3c)** — Sentence-level attribution misses multi-source paragraphs when 2nd-best chunk similarity falls outside `MULTI_CHUNK_DELTA_THRESHOLD` (0.08). Real example: a paragraph synthesized from ~3 source chunks displays as `Source` (singular). Python migration unlocks: clause-aware split, cross-encoder reranking (BGE-reranker-v2-m3 endpoint shipped in 3a), paragraph-centroid anchor for multi-source detection.
- **Reranker wiring into write path (target Session 3c)** — `SynthesisService.rerankParagraphCandidates()` helper exists (Session 3a) but no caller. Soft flag: the helper's 1.5s check is dead code because the client's `AbortSignal.timeout` fires first. Either drop the check or raise the client timeout above it.
- **Citation integrity check** — dropped from Phase 5.6; deferred to post-Python hybrid phase. Sentence-level verification of `[Source N]` grounding against indexed chunk vectors.
- **Fixture licensing swap** — RIGHTS.md, pre-commercial release.
- **Preface-less source handling** — synopsis degradation on sources lacking preface + TOC. Retry logic saves it today; fragile.
- **Compression overshoot tuning** — prompt-level tuning and adaptive ratio validation (ongoing).
- **Timestamp format consistency** — repository normalizes to ISO 8601 UTC. Check any future timestamp fields for the same pattern before shipping.
- **`formatRelativeTime` scope drift** — spec only asked for `just now / Nm / Nh / Nd / Mon D`. Verify `Xmo` / `Xy` variants on next touch.
- **Empty chapter handling** in synthesis (pre-existing).
- ✅ **Attribution algorithm refinement (completed 2026-10-02, Session 3c).** Resolver consumes weights_json.attribution_stage and reranker_scores, applies MULTI_CHUNK_DELTA_THRESHOLD paragraph-level inclusion, falls through to legacy when stage is legacy.
- **Adaptive concurrency controller (target Phase 5.8+, provisional).** Today the shipped `OPENROUTER_CONCURRENCY` default is 2 (static, per Decision Record §2.7). The Session 3b-2 diagnostic (2026-10-02) proved this account supports N=5 with zero 429s and 100% success — but that is one snapshot of one tier on one provider. A dynamic controller that adapts N to observed 429 rate would benefit users on higher OpenRouter tiers. **Not before Phase 5.8**, for these reasons:
  - **Insufficient data.** One account, one provider, one time-of-day window, ~40 calls. OpenRouter's effective limits vary by tier, provider (DeepSeek vs Claude vs Gemini), time of day, and token-rate vs request-rate. A controller designed from one snapshot overfits to that snapshot.
  - **Control-loop failure modes.** AIMD (additive increase, multiplicative decrease) sounds simple but has known traps: oscillation between ramp and throttle states, stale 429 observations counting against the current window, and interaction with the existing `callOpenRouterWithBackoff` retry logic (a successful retry — does that count as a real 429 for the controller?).
  - **Testability.** Mocking 429s is easy. Testing a controller that correctly ramps 2 to 5 over 200 realistic calls with one transient 429 near the end requires a new class of temporal test infrastructure.
  **Three-step path:**
  1. **Now (static + manual override).** Keep default 2. Ship the diagnostic artifact as evidence this account supports 5. Document that power users can run `scripts/diagnostic-concurrency.js` once, then set `OPENROUTER_CONCURRENCY=<measured safe N>` in `.env`.
  2. **Phase 5.8 (data collection).** Add status logging to every OpenRouter call to `storage/or-calls.log` or a new DB table capturing timestamp, status, latencyMs, concurrencyAtCallTime. Surface a "concurrency health" panel in Settings showing observed N and 429 rate. Still static; users set their own ceiling based on their own data.
  3. **Phase 6.x or later (adaptive, contingent).** Only build the controller if Phase 5.8 data shows users with the same tier converging to wildly different optimal N. If they converge, static remains the honest default. Same discipline as the multi-source provenance threshold in 5.6.4: measure first, then decide.

### Ideas (not scheduled, recorded for context)

- **Hybrid Node + Python is the target model.** Not a fallback. Node owns orchestration, I/O, HTTP, SQLite writes. Python owns CPU-heavy primitives. Each language does what it is uniquely good at. The interface between them is small and stable.
- **Modular product shape.** Library / Research / Import are peer tabs today. Future capabilities (Discussion, Story, other modes) enter as additional peer tabs or as sub-modules within existing surfaces. No capability is bundled with another.
- **Parallelism is real but not free.** Multi-chapter synthesis and batch imports can be parallelized Node-side (promise pool shipped in 3b-1) but introduce race conditions, partial-failure semantics, and a real scheduler.
- **Reading progress could extend to per-paragraph precision.** Currently chapter-level (`opened_at`, `read_at`). Paragraph-level would require a new table. Not worth the schema cost until reading analytics become a product surface.
- **Session log as durable artifact.** `docs/session-logs/` is gitignored but that may change. If the project becomes a portfolio artifact, the session logs are the strongest proof of process discipline. Decision deferred.

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

1. Open fresh chat.
2. Paste: *"Read `docs/SESSION_HANDOFF.md`, `docs/PRODUCT_VISION.md`, and `docs/CONTINUITY.md`. Confirm orientation, then tell me the next task in one paragraph."*
3. Any competent model orients in one turn.

**Carry forward:**

- Two-representation invariant (Original immutable, Smart traceable)
- Three laws (Source is paper / Lens is tinted / Derivation never masquerades)
- Raw-output verification over model summaries
- One workstream per session
- Commit docs before code
- Verification evidence is pasted, never asserted
- Commit before any agent task touches a file

---

*End of handoff. Update at the end of every session.*
