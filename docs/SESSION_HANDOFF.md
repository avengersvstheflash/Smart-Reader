# Smart Reader — Session Handoff

> **Purpose.** Any assistant (Claude, GPT, Gemini, or a fresh DeepSeek) reads this and is fully oriented. Companion to `docs/ROADMAP_2026-09.md` (long-term), `docs/FRONTEND_BLUEPRINT.md` (narrative), `docs/FRONTEND_BLUEPRINT_SPEC.md` (contract). This file answers: *where are we, how do we work, what's next.*
>
> Working title: **Omnitome** (see PRODUCT_VISION.md §"Working title").

---

## 1. Where we are

**Phase 5.7.2 Session 2b COMPLETE 2026-10-01.** All 24 test suites green. Frontend build clean. Origin synced.

**Current HEAD:** `20a4d30` — feat(phase5.7.2): slicer to Python + dynamic chapter budget.

**Test state:** 23/23 root suites green. Frontend `tsc --noEmit` / `npm run build` clean. Origin synced.
- `phase5_7_ocr_test.js`: OCR integration: checkReady, ocrPdf error translation, parser OCR routing, OCR_EMPTY_OUTPUT guard. 9 tests.
- `phase5_7_2_nlp_test.js`: NLP integration: pysbd sentence split, chunk stub, modular/shim client contract, error taxonomy (6 tests).
- `phase5_7_2_embed_test.js`: Embedding integration: embedClient contract, warming backoff, error taxonomy, shim integrity (6 tests).

**Next phase:** Phase 5.7.2 Session 3 — BGE-M3 reranker + parallel synthesis + attribution refinement.

### What ships today (2026-09-29)

- **Phase 5.5e.2 — reader chip zero-space when hidden**: width collapse via `max-width: 0; padding: 0; border-width: 0; margin-left: 0; overflow: hidden`, removing visible reading-flow gaps when chips are hidden.
- **Phase 5.5e.3 — chip animation polish**: reflow isolation via `contain: layout paint style`, `will-change` GPU hint, and expo-out easing (100ms) for smooth expand/collapse.
- **Phase 5.6.5 — author extraction + multi-author display**: Oxford-comma `formatAuthorList()` in domain.ts, `bibliographic.authors` as source of truth across hero, cover, and SOURCE · BIBLIOGRAPHY panel, plus startup database backfill for existing records.
- **Phase 5.6.6 — synopsis markdown normalization + full render**: rendered paragraphs with `renderInlineText` (bold styled without raw `**` tokens), write-time markdown stripping on `books.description`, and removal of arbitrary `.slice(0, 300)` mid-sentence truncation.
- **Phase 5.6.4 — multi-source provenance granularity**: `MULTI_CHUNK_DELTA_THRESHOLD = 0.08`, `SINGLE_SENTENCE_WEIGHT_FLOOR = 0.25`, `chunk_ids` array per segment, `haveSameChunks()` grouping, stacked popup source cards with uppercase section badges, defensive `[Section: X]` prefix stripping from excerpts, and dynamic `Source (N)` chip labels.

### Previously shipped (Phase 5.5 & 5.6 series)

- **Phase 5.5a–b**: `smart_chapters` table, reading progress API, database schema migrations, and resume-target queries.
- **Phase 5.5c.1–3**: Library filter persistence, expandable tag panel, and relative-time indicators.
- **Phase 5.5d–d.2**: Dedicated reader route reading directly from `/api/smart-chapters/:id` with 4-state status views and scroll progress tracking.
- **Phase 5.5e–e.1**: Reader chip stability (oscillation fix) and abbreviation-aware sentence splitting.
- **Phase 5.6.1–3**: Pre-LLM source validation guards, post-LLM `aiRetryGuard` with auto-resynthesis, semantic chunker hardening (heading glue + post-pass merge), and PDF parser heading/math refinement.

### Phase 4 & 5 shipped, complete list

4.5 → 4.6 → 4.7 → 4.7.1 → 4.7.5 → 4.8 → 4.8.1 → 4.8.2 → 4.8.3 → 4.9
→ 4.10 → 4.10.5 → 4.11 → 4.11.1 → 4.11.5 → 4.11.6 → 4.12 → 4.13 →
4.13.1 → 4.14 → 4.15a → 4.15b → 4.16 → 4.19 → 4.20 → 4.21 → 4.21.1 →
4.24 → 4.25 → 5.1a → 5.1b → 5.1b.1 → 5.1b.2 → 5.2 → 5.2.1 → 5.2.2 →
5.2.3 → 5.3a → 5.3b → 5.3b.1 → 5.3d → 5.3d.1 → 5.3e → 5.3f → 5.5a →
5.5b → 5.5c.1 → 5.5c.2 → 5.5c.3 → 5.5d → 5.5d.1 → 5.5d.2 → 5.6.1 →
5.6.2 → 5.6.3 → 5.5e → 5.5e.1 → 5.5e.2 → 5.5e.3 → 5.6.5 → 5.6.6 → 5.6.4 → 5.7.1

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

### Phase 5.7.2 — NLP migration (chunker/slicer/splitter) + hybrid parallelism + attribution refinement (3–4 sessions)

**Goal:** Migrate CPU-bound NLP segmentation and embedding primitives to Python sidecar, refactor chapter slicing heuristic, and refine attribution granularity.

**Scope:**
1. NLP pipeline migration to Python (chunker, slicer, sentence splitter to Python sidecar; pysbd/spaCy).
2. Slicer refactor (segment by compressed-unit count ~5–8 chapters, not source-section count).
3. BGE-M3 embedding migration to Python thread pool.
4. Parallel synthesis primitives (Node-side promise pool for OpenRouter calls).
5. Attribution algorithm refinement (clause-aware split, cross-encoder reranking, paragraph-centroid anchoring).

---

## 5. Roadmap (reshaped 2026-09-28)

### Phase 5.6 & 5.6.4 (shipped 2026-09-28 & 2026-09-29) — Validation and refine loops
✅ **CLOSED**. Pre-LLM and post-LLM validation guards, centralized aiRetryGuard, auto-resynthesis on persistent violation, semantic chunker hardening (heading glue + post-pass merge), and PDF parser heading/math refinement. Reader chip stability (5.5e, 5.5e.1) and follow-up items 5.5e.2 (chip spacing), 5.5e.3 (chip animation), 5.6.5 (author extraction), 5.6.6 (synopsis markdown), and 5.6.4 (multi-source provenance granularity) all shipped and verified. Phase 5.5 and Phase 5.6 series formally closed.

### Phase 5.7.1 (shipped 2026-09-30) — Python sidecar + OCR
✅ **COMPLETE**. Python sidecar established (FastAPI on 127.0.0.1:8765, PaddleOCR ch_PP-OCRv4, boot warm-up with /v1/ready probe). Node client wraps the sidecar; pdfjsParser.js routes image-only PDFs (< 20 chars selectable text) to OCR with honest-failure fallback. 22/22 suites green.
- **Deferred to 5.7.2:** Nothing outstanding from 5.7.1 — the OCR_EMPTY_OUTPUT guard has a passing test (T9) and the redundant catch clause was removed in 06abb3a.

### Phase 5.7.2 (3 sessions, AMENDED SCOPE) — NLP migration (chunker/slicer/splitter) + hybrid parallelism + attribution refinement
**Status:** Sessions 1, 2a, 2b COMPLETE. Session 3 next.
- `/v1/nlp/chunk` is a placeholder — Node `semanticChunker.js` remains authoritative until a future phase ports it (R1 scope-hold resolution from the audit).

Bundles five concerns:
1. **NLP pipeline migration to Python.** Chunker, slicer, and sentence splitter all move from Node to Python sidecar. Rationale: pysbd/spaCy handle abbreviation-aware sentence boundaries, citations, math notation, and multi-language text correctly — the regex-based Node splitter required two hotfixes in a single session. Python owns text segmentation; Node keeps SQLite writes, HTTP API, and OpenRouter calls. Frontend receives pre-computed sentence_start/sentence_end indices from backend; the local splitter in frontend/src/types/domain.ts is removed. This expands 5.7.2 from ~2-3 sessions to ~3-4 sessions.
2. **Slicer refactor.** The chapter-slicing heuristic currently produces one Smart chapter per source section. On the ML PDF, this yielded 31 planned chapters where ~5–8 were expected. Target: segment by compressed-unit count, not source-section count.
3. **BGE-M3 embedding migration to Python.** Python thread pool (sentence-transformers or equivalent) gives realistic 3–4× speedup on the ~3.5-minute ML PDF indexing step. Node keeps orchestration; Python owns the CPU-bound primitive.
4. **Parallel synthesis primitives.** Node-side promise pool for OpenRouter-bound work. Chapters within a book (or books within a batch) can synthesize concurrently with bounded concurrency. Rate-limit aware.
5. **Attribution algorithm refinement.** Sentence-level attribution misses multi-source paragraphs when 2nd-best chunk similarity falls outside MULTI_CHUNK_DELTA_THRESHOLD (0.08). Real example: a paragraph synthesized from ~3 source chunks displays as `Source` (singular) because per-sentence similarity is too tight. Python migration unlocks clause-aware split (pysbd), cross-encoder reranking (sentence-transformers), and paragraph-centroid anchoring (see §9).

**Architectural boundary (locked):**
- Node owns: orchestration, OpenRouter calls, SQLite writes, HTTP API.
- Python owns: CPU-heavy primitives (embedding, OCR, NLP segmentation), exposed over local HTTP.
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

- **Buffer drift via editor flush (2026-09-28).** After committing 3468c83, the working tree showed M on multiple files whose buffers had flushed post-commit. Standard resolution worked: `git checkout HEAD -- <file>`. Never `git reset --hard`. This reinforces the standing rule: after every commit, run `git status --short` and inspect for unexpected modifications.

- **Fabricated verification — 1 incident (2026-09-23).** **Rule: verification evidence must always be pasted from actual terminal output. Any invented evidence is a project-integrity failure.**

- **Fabricated report output (2nd incident, 2026-09-28).** During 5.6.3, the agent reported "ALL 21 TEST SUITES PASSED" with a list of suite filenames that do not exist on disk (`phase4-synthesis-smoke.test.js`, `citation-integrity.test.js`, `heading-detection.test.js`, etc.). Actual suite names were verified independently by the user. The code fix was real; only the report's evidence list was fabricated. **Distinction from 4.24:** 4.24 was code-not-real + evidence-fabricated; this incident was code-real + evidence-fabricated. Same integrity violation, different shape.
  **Rule:** any claim of test passage must include the actual suite filenames as they appear in backend/tests/. "All X passed" without filenames is unverifiable and will be rejected.

- **Regex-based sentence splitting is fragile (2026-09-28).** The splitter required two hotfixes in a single session (5.5e and 5.5e.1) to handle English abbreviations, initials, and math notation correctly. Each fix introduced new edge cases. **Rule:** any future sentence-boundary work should target the Python NLP migration (5.7.2) rather than patching the regex further. pysbd/spaCy handle this natively.

- **Sandbox persistence failure (variant 2) (2026-09-30).** Antigravity reported file sizes (main.py 6,304 B; requirements.txt 155 B) that did not match the real filesystem. Both files were 0 bytes on disk when git read them at stage time. Commit a674887 contained empty blobs and was amended to 7f009db. **Rule:** after any Antigravity session that claims to create or modify files, run `Get-Item <file> | Select-Object Length` on each claimed file BEFORE `git add`. Any 0-byte file indicates sandbox persistence failure. Do not stage 0-byte files. Recreate manually and re-verify.

- **.gitignore encoding hazard (UTF-16) (2026-09-30).** A UTF-16-encoded `.gitignore` silently fails to parse in git (every line treated as garbage) while still reading correctly in PowerShell `Select-String`. The venv at `sidecars/python/.venv/` appeared as untracked files in VSCode despite the pattern being present in the file. Detection: `git check-ignore -v <path>` returns empty despite the pattern being visible in the file. **Rule:** `.gitignore` must be UTF-8 without BOM. If `git check-ignore` returns empty for a pattern that is visibly present, suspect encoding before suspecting the pattern.

- **Buffer drift incident #5 (2026-09-30).** `docs/RIGHTS.md` reverted to HEAD between the Antigravity session end and the git status check. Recovery: manual re-application of the fixture entry. **Rule:** existing rule (`git status --short` after every commit) still applies. This is the 5th occurrence; it is not rare.

- **License-check any fixture before git add.** See `docs/RIGHTS.md`.

- **Antigravity write_to_file tool is broken (variant 4) (2026-10-01).** The tool reports success but writes 0 bytes to disk. Affects every session since 5.7.1 Session 1. Workaround: have the agent generate a Node script that writes file contents via fs.writeFileSync, then run it with `node <script>`. Never trust write_to_file's success report. Always verify sizes with Get-Item.
  **Rule:** for any Antigravity task that creates more than 2 files, require the writer-script pattern in the prompt. Verify all target file sizes immediately after.

- **Fabrication incident #4 (2026-10-01, Session 2a).** The agent's first Session 2a report synthesized file contents, sizes, test output, and curl responses for files that were never actually written. Same pattern as incidents #1 (4.24) and #2 (5.6.3). Caught by `Get-Item` size verification.
  **Rule:** every report that claims file creation must include raw `Get-Item Name, Length` output. Every report that claims test passage must include the raw `=== <suite> ===` blocks from a fresh run. If either is missing or truncated, reject.

- **PowerShell here-string interpolation (2026-10-01, Session 2a).** `Set-Content -Value @" ... "@` (double-quoted here-string) interpolates `${...}` inside embedded content, silently corrupting JavaScript template literals. This caused two sessions' worth of broken write scripts.
  **Rule:** when embedding literal content that contains `${...}` or `$var`, use single-quoted here-string `@' ... '@`. Verify the generated file's content matches intent before running it.

- **git checkout on uncommitted files (2026-10-01, Phase 5.7.2 Session 2b).** During troubleshooting, the agent ran `git checkout <file>` on files whose changes had not been committed. This restored them to HEAD and wiped ~450 lines of completed, tested work. The agent did not report the loss; it was caught by manual terminal inspection.
  **Rule:** commit before any agent task touches a file. If a file must be in-flight while the agent operates, use `git stash` and treat the stash as sacred. Never let the agent execute `git checkout` on a working-tree file it did not itself stage.

- **PowerShell here-string ${...} interpolation (recurrence, 2026-10-01).** Same bug as the previous incident. `@"..."@` here-strings expand `${var}`, corrupting embedded JS template literals. The agent repeatedly regenerated the writer script after every failed run without recognizing the pattern.
  **Rule:** when a writer script fails twice, STOP generating it via PowerShell string literals. Switch to a Python generator using json.dumps() — Python has no shell interpolation issues.

- **JSON double-escaping spiral (2026-10-01, Phase 5.7.2 Session 2b).** When escaping JS inside PowerShell inside a here-string, backslashes accumulated (\`, \${). The result was syntactically valid in the shell but produced invalid JS on disk. The agent then attempted base64 encoding as a workaround.
  **Rule:** two-level escaping is always wrong. Use a data serialization layer (Python json.dumps, or a standalone .js file written by a plain text editor) rather than string substitution.

- **Empty-success report (2026-10-01, Phase 5.7.2 Session 2b).** The agent's final report was a numbered list of "Success" claims with no diffs, no file contents, and no raw test output. It was the same fabrication pattern previously logged (incidents #1–#4), but dressed as confirmation rather than evidence.
  **Rule:** every report must include raw terminal output for every claim. "Success" without a pasted command output is unverifiable and rejected.

- **Uncommitted-work discipline (2026-10-01).** Sessions 2a and 2b both saw work nearly lost because it sat uncommitted while the agent operated on the same files. In every near-loss, the fix was committing immediately after a verification pass, before opening any new agent prompt.
  **Rule:** commit after every verified change. Do not batch multiple agent passes onto an uncommitted tree.

- **Fabrication incident #3 — partial synthesis of test output (2026-09-30, Phase 5.7.2 Session 1 correction pass).** The agent reported the full fresh test suite output. The output for build3a_test.js and build3b_test.js was synthesized (did not match file contents) and fifteen other suites were paraphrased rather than pasted raw. Caught only by cross-checking against historical reports.
  **Rule:** When a prompt requests full test output, it must explicitly require every `=== <suite> ===` block from the raw runner output — never a summary. Cross-check at least two suites against prior reports before accepting. When in doubt, bypass Antigravity: have the user run the suite in their own terminal and paste the raw output.

- **Buffer-lock / write-drop incident (variant 3) (2026-09-30, Phase 5.7.2 Session 1).** main.py, CanonicalBlock.tsx, and pythonSidecarClient.js writes did not persist on the first attempt. Agent used a Python script to write files directly as fallback. Same class as the empty-blob incident from Phase 5.7.1, different trigger.
  **Rule:** existing verify-before-stage rule (`Get-Item <file> | Select Length` after every write, non-zero required) still applies. When the write path is bypassed, verify twice.

- **Manifest file line concatenation (2026-09-30, Phase 5.7.2 Session 1).** `Add-Content` was used to append `pysbd==0.3.4` to `sidecars/python/requirements.txt` without a trailing newline, concatenating it onto the previous line (`opencv-python-headless<=4.6.0.66pysbd==0.3.4`). File also contained a duplicate `opencv-python-headless` line from an earlier session.
  **Rule:** never use `Add-Content` on manifest or config files. Use `[System.IO.File]::WriteAllText` with explicit content and UTF8Encoding($false) (no BOM). Verify line count after writing.

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
- **Sidecar modularization before embed (target 5.7.2 Session 2)** — In Session 2, before adding `/v1/embed/batch`, consider splitting `sidecars/python/main.py` into `sidecars/python/nlp/` and `sidecars/python/embed/` packages — current `main.py` is 11.3 KB with NLP + OCR combined.
- **Attribution algorithm refinement (target 5.7.2)** — Sentence-level attribution misses multi-source paragraphs when 2nd-best chunk similarity falls outside MULTI_CHUNK_DELTA_THRESHOLD (0.08). Real example: a paragraph synthesized from ~3 source chunks displays as `Source` (singular) because per-sentence similarity is too tight. The behavior is honest (single chip = single source per resolver) but under-inclusive. Python migration (5.7.2) unlocks the deeper fix:
  - `pysbd` for clause-aware sentence boundaries
  - `sentence-transformers` with cross-encoder reranking
  - paragraph-centroid anchor for multi-source detection
  Current 5.6.4 fix (multi-chunk Δ ≤ 0.08) is a partial improvement; the full solution ships with the NLP migration.
- **NLP pipeline migration to Python (part of 5.7.2, AMENDED SCOPE).** Chunker, slicer, and sentence splitter all move from Node to Python sidecar. Rationale: pysbd/spaCy handle abbreviation-aware sentence boundaries, citations, math notation, and multi-language text correctly — the regex-based Node splitter required two hotfixes in a single session. Python owns text segmentation; Node keeps SQLite writes, HTTP API, and OpenRouter calls. Frontend receives pre-computed sentence_start/sentence_end indices from backend; the local splitter in `frontend/src/types/domain.ts` is removed. This expands 5.7.2 from ~2-3 sessions to ~3-4 sessions.
- **Slicer refactor** — target Phase 5.7.2 (unchanged). Real ML PDF import yielded 31 Smart chapters (one per source section). Target ~5–8 by segmenting on compressed-unit count. Bundled with hybrid parallelism work.
- **Citation integrity check** — dropped from Phase 5.6; deferred to post-Python hybrid phase (Phase 5.7+). Sentence-level verification of [Source N] grounding against indexed chunk vectors is best performed alongside embedding-accelerated Python primitives.
- **Fixture licensing swap** — RIGHTS.md, pre-commercial release.
- **Preface-less source handling** — synopsis degradation on sources lacking preface + TOC. Retry logic saves it today; fragile.
- **Compression overshoot tuning** — prompt-level compression tuning and adaptive ratio validation (ongoing).
- **Timestamp format consistency** — non-blocking. Repository now normalizes to ISO 8601 UTC. Check any future timestamp fields for the same pattern before shipping.
- **`formatRelativeTime` scope drift** — report mentioned `Xmo ago` and `Xy ago` in the implementation. Spec only asked for `just now / Nm / Nh / Nd / Mon D`. Verify on next touch; non-blocking.
- **Empty chapter handling** in synthesis (pre-existing).

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
