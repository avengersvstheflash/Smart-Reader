# Omnitome — Session Handoff

> **Purpose.** Any assistant (Claude, GPT, Gemini, or a fresh DeepSeek) reads this and is fully oriented in one turn. This file answers: *where are we, how do we work, what's next.*
>
> **Companion docs:** `PRODUCT_VISION.md` (thesis, invariants, three laws) · `ROADMAP_2026-09.md` (long-term) · `ARCHITECTURE_AUDIT.md` (backend) · `RIGHTS.md` (licensing) · `CONTINUITY.md` (60-second orientation).
>
> **Working title:** Omnitome. **Repository:** `Smart-Reader` (rename is a separate future decision).

---

## 1. Current State

| | |
|---|---|
| **HEAD** | `5a4451c` — 5.8.0j.1 session 2: chat-log parser end-to-end |
| **Origin** | synced (`origin/main`) |
| **Working tree** | clean |
| **Tests** | 27 registered suites. Targeted: `5.8.0j` suite 14/14 green. Full suite still blocked by `build3a_test.js` network hang. |
| **Frontend** | `tsc --noEmit` / `npm run build` clean |
| **Last release tag** | `v0.6.0` @ `55d0855` (Phase 5.7.2 close) |
| **Phase 5** | **CLOSED** |
| **Phase 5.8.0** | **CLOSED** (repair + F18 + F24 all fixed) |
| **Phase 5.8** | **IN PROGRESS** |

**Immediate next task:** `5.8.0g.2` — label honesty (only show Omni time when generated === total). Then `5.8.0j.2` (F23 math glyphs, design doc ready), then F18 end-to-end verify (reimport ML PDF, confirm Parts 13–15 read "Chapter 3").

---

## 2. What Omnitome Is

**One-line thesis:** A local-first neural reading library whose differentiator is **loss-bounded, provenance-aware semantic compression**.

**Not this:** "AI summarizes your books."
**This:** Source → compressed reading layer → traceable back to source.

### The Two-Representation Invariant

| | |
|---|---|
| **Original Reading** | Immutable source. Authoritative. Lives in Research. |
| **Omni Reading** | Derived, compressed, traceable. Lives in Library. **This is the product.** |

**Guiding principle:** *Omni is the product. Original is the proof.*

The reader defaults to Omni. Original is reached contextually, via provenance — not as a peer toggle.

### Three Design Laws

1. **Source is paper.** Original/source feels neutral, calm, book-like.
2. **The lens is tinted.** Omni carries a quiet derived identity. No sparkles, no wands.
3. **Derivation never masquerades as source.** Every Omni claim retains a provenance path.

### Core Distinction

**Compression, not summarization.** Preserve distinct concepts, arguments, factual claims, and causal relationships — expressed much more densely. Target ~7:1 for Omni Chapters (250–360 words from a 1,500–2,500-word source unit).

---

## 3. Phase Status

| Phase | Status | Closed |
|---|---|---|
| 4.x | ✅ CLOSED | 2026-09-23 |
| 5.1a, 5.1b | ✅ CLOSED | 2026-09-24 |
| 5.2 | ✅ CLOSED | 2026-09-25 |
| 5.3 | ✅ CLOSED | 2026-09-26 |
| 5.5 series | ✅ CLOSED | 2026-09-29 |
| 5.6 series | ✅ CLOSED | 2026-09-29 |
| 5.7.1 (Python sidecar + OCR) | ✅ CLOSED | 2026-09-30 |
| 5.7.2 (NLP migration + parallelism + attribution) | ✅ CLOSED | 2026-10-02 |
| 5.7.3 (capability router + DOCX/RTF) | ✅ CLOSED | 2026-10-03 |
| **5.8.0 (compression contract repair)** | ✅ **CLOSED** | 2026-10-03 |
| **5.8.0g.1 (reading-time label)** | ✅ CLOSED | 2026-10-04 |
| **5.8.0h.2 (F18)** | ✅ CLOSED | 2026-10-04 |
| **5.8.0j.1 (F24 — chat-log parser)** | ✅ CLOSED | 2026-10-04 |
| **5.8 (pre-Tauri close-out)** | 🔄 **IN PROGRESS** | — |
| 5.9 (Kokoro TTS) | ⏸ PLANNED | — |
| 6 (Tauri packaging) | ⏸ PLANNED | — |

**Build 1 / v1.0 = Phase 5.8 → Phase 5.9 → Phase 6.** Nothing else enters Build 1.

---

## 4. Phase 5.8 — Active Track

**Goal:** Close all remaining pre-packaging UX, branding, and refactor work before Tauri. No new external features enter Build 1 beyond this.

| ID | Scope | Status |
|---|---|---|
| 5.8.0 | Compression contract repair | ✅ CLOSED |
| 5.8.0g.1 | Reading-time label (source words vs Omni words) | ✅ CLOSED (g.2 follow-up pending) |
| 5.8.0h.2 | F18 — ancestor resolution when chapter heading isn't distinct | ✅ CLOSED |
| 5.8.0j.1 | F24 — chat-log parser branch (verified on Kaggle OCR PDF) | ✅ CLOSED |
| **5.8.0g.2** | Label honesty: only show Omni time when `generated === total` | **NEXT** |
| 5.8.0j.2 | F23 — math glyph handling (Option D per design doc) | Pending |
| 5.8a | Rebrand Smart Reader → Omnitome (user-visible strings) | Pending |
| 5.8b | Omni feature naming (Smart Reading → Omni Reading, etc.) | Pending |
| 5.8c | Violet lens identity (color tokens, themes) | Pending |
| 5.8d | Background import tracking + notification system | Pending |
| 5.8e | Paste tab → attach source to existing Research item | Pending |
| 5.8f | Research → Synthesize Omni Chapters action | Pending |
| 5.8g | Cross-linking Research ↔ Library indicators | Pending |
| 5.8h | Compressor terminology refactor (files + identifiers only) | Pending |
| 5.8i | Frontend verification + polish (from manual walkthrough) | Pending |
| 5.8j | Settings page (provider config, theme, storage, privacy) | Pending |
| 5.8k | Help / guide page (PlanRight-style, local JSON, no LLM) | Pending |

**Dependencies:**
- 5.8d must precede 5.8f (background tracking needed for background synthesis)
- 5.8j should follow 5.9 (Settings includes TTS controls)

### Naming Rule (locked)

User-visible language becomes **Omni** (Omnitome, Omni Reading, Omni Chapters).

**Internal identifiers stay unchanged:**
- `smart_chapters` table
- `/api/smart-chapters/*` routes
- `EDITORIAL_SYNTHESIS`, `SYNTHESIS` enum values
- `synthesis_type` columns

No migration risk. Product-language cleanup, not schema rewrite.

---

## 5. Phase 5.8.0 — Compression Contract Repair (CLOSED 2026-10-03)

**Commits:** `0867434` (a–i) + `7b943f5` (j) + `5e3af95` (chore) + `e5e0e31` (close) + `e024cf0` (roadmap sync)

### Shipped

- **5.8.0a** — Compressor ceiling `0.25 → 0.15` (7:1 target)
- **5.8.0b** — Python slicer target `8500 → 2000`
- **5.8.0c** — Removed `min(8)` chapter cap from slicer
- **5.8.0d** — Slicer docstring update
- **5.8.0e** — Reranker payload normalization (`{id, text}`) — fixed silent 422 → centroid fallback
- **5.8.0f** — Chapter title ancestor resolution + duplicate disambiguation
- **5.8.0g** — Book Details word count uses `chapters.word_count`, not `planned_word_count`
- **5.8.0h** — Multi-chunk highlight in Research viewer
- **5.8.0h.1** — Highlight by real `blk-…` block IDs, not chunk sequence
- **5.8.0i** — Reranker GPU path + boot warmup + 5-candidate batch + 10s timeout
- **5.8.0j** — Provenance unification across auto/batch/manual synthesis paths

### Runtime Evidence

- ML PDF: **31 chapters / 69,399 source words / 250–360 words per Omni chapter**
- Zero `RERANKER_FALLBACK` in backend; 100% `200 OK` from sidecar
- Reranker on CUDA: `[Warmup] Reranker using GPU: NVIDIA GeForce RTX 3050`
- Popup source matches highlighted block on every sampled chapter
- Manual synthesis (Chapter 4) fires arbiter and renders SOURCE chip

### Verification — Honest Label

**5 targeted suites green:** parse 9/9, nlp 12/12, embed 6/6, parallel 6/6, validation 8/8 (41 tests total).

**Full suite run was BLOCKED by `build3a_test.js` network hang.** Do not paraphrase this as "all green."

### Discipline Note

Hand-edited end-to-end. **Zero Antigravity involvement. First drift-free session in recent history.**

---

## 6. Findings Ledger

Last reconciled: **2026-10-04 evening** (post F24 session 2).

### Closed this session

| ID | Description | Closed |
|---|---|---|
| **F18** | Ancestor skipping — `Part N` numeric-prefix headings now promote as chapter ancestors | `3f80e93` |
| **F24** | Chat-log PDFs — extended detector + parser branch + post-OCR routing gate; verified on Kaggle at confidence 1.000 | `5a4451c` |
| **5.8.0g.1** | Reading-time label — source words + Omni read time | `39dcb09` + `077e557` |

### Open — near term

| ID | Description | Severity | Next task |
|---|---|---|---|
| **5.8.0g.2** | g.1 label reads "31 chapters · 6 min Omni read" even when only 5/31 generated — show Omni time only when generated === total | 🟢 Low | NEXT |
| **F23** | PDF math glyph extraction (Type3/CMap → tofu boxes) — Option D per `DESIGN_MATH_EXTRACTION.md` | 🟡 Medium | 5.8.0j.2 |
| **F26** | First-turn fallback title reads `Turn 1` when OCR preamble precedes first user prompt | 🟢 Low | Small |
| **F27** | Editorial planner picks up `Chapter N` ancestors from chat-log body text | 🟢 Low | Defer / small |

### Open — low priority

| ID | Description | Severity | Next task |
|---|---|---|---|
| **F20** | Synopsis sampler picks `Index` as last chapter | 🟢 Low | Small fix in `intelligentSummarizer.js` |
| **F21** | "Opened just now" label lag | 🟢 Low | Cosmetic |

**F23 and F24 are distinct.** F23 = character-level extraction. F24 = document-level structural classification. Do not conflate.

---

## 7. Next Tasks

### 5.8.0g.2 — Label honesty (quick)

**Problem:** Book Details reads `31 chapters · 69,399 source words · ~6 min Omni read` even when only 5/31 Omni chapters are generated. Reads as if the whole book compresses to 6 minutes.

**Fix:** show Omni segment only when `smartGenerated === smartTotal`. Otherwise source-only caption, or an honest qualifier like `5 of 31 Omni · ~6 min`.

**Likely file:** `frontend/src/routes/BookDetailsRoute.tsx` (~line 183 omniReadingCaption block).

### 5.8.0j.2 — F23 math glyph handling

Per `docs/DESIGN_MATH_EXTRACTION.md` — Option D (detect Type3/CMap unmappable glyph clusters, emit a distinct block, render an honest placeholder).

### F18 end-to-end verify (quick)

Reimport `practical_machine_learning.pdf` and confirm Parts 13–15 now read `Chapter 3`.

---

## 8. How We Work

**Standard:** *"Something I can talk about with confidence, not shame."*

Every claim verified against raw terminal output. No commits on a dirty tree. No commits on a red suite. Divergence rebased, never force-pushed.

### Workflow Pattern
Establish current state (git log, status, tests)

Identify the next concrete gate

Diagnose before changing

Smallest architectural change

Run the real system

Inspect failures and edge cases

Record the decision

Commit a clean checkpoint

Update handoff

Move to the next gate


### Hard Rules

- **One workstream per session.** Do not bundle unrelated changes.
- **Commit docs before code.**
- **Never commit `.env` or keys.**
- **Chat logs are historical. The filesystem is current.**
- **Escalate model thinking level only after failure.**
- **Verification evidence is pasted, never asserted.** Fabrication is a project-integrity failure.
- **Re-paste, don't mine.** If a prompt isn't in current context, re-paste. Do NOT extract prompts from transcript logs.
- **After every commit:** `git status --short`. If unexpected `M` lines appear → `git diff` → `git checkout HEAD -- <file>`. Never `git reset --hard`.
- **Commit before any agent task touches a file.** Uncommitted work is at risk from every agent operation.
- **A summary is not verification.** Any test-pass claim requires raw `=== <suite> ===` output with real suite filenames from `backend/tests/`.
- **Never call partial verification "fully green."** If infrastructure blocked part of the run, say so.

### Content Flow

Chat draft → user saves file in VS Code → commit. Agents write to disk only from explicit prompts.

---

## 9. Hazards — Rules Learned from Incidents

### Buffer Drift (5+ incidents — VS Code and Antigravity both)

Stale editor buffer flushes post-commit, corrupting the working tree while HEAD stays clean.

**Recovery:** `git diff <file>` → confirm stale → `git checkout HEAD -- <file>`. Never `git reset --hard` without inspecting first.

**Prevention:** `git status --short` after every commit. Unexpected `M` → investigate before staging anything.

- **VS Code Git extension auto-revert (confirmed root cause 2026-10-04).** The VS Code Git extension can silently revert working-tree changes to files with active editor buffers, causing partial commits where `git add` accepts paths that are no longer modified. This is now understood as a primary cause of the recurring "buffer drift" incidents attributed across chats. **Rule:** disable auto-stash / auto-revert in the VS Code Git extension. After every multi-file edit, verify each target file with `Select-String` on a unique string from the edit BEFORE running `git add`. After commit, run `Select-String` again to confirm changes are still on disk.

### Agent Git on Working Tree (3+ incidents)

Agents have run `git checkout <file>` / `git restore` / `git reset` on uncommitted work, wiping hundreds of lines.

**Rule:** Never let an agent run checkout/restore/reset on working-tree files it did not itself stage. If a file must be in flight, commit first or use `git stash` (treat stash as sacred).

### Unauthorized Commits

Prompt said "Do NOT commit." Agent ran `git add . && git commit`. Commit was local-only, recovery clean, but session invalidated.

**Rule:** If agent commits when prompt says not to → session requires re-audit from HEAD.

### Transcript Spelunking (8+ incidents)

Agent searches its own `.system_generated/logs/*.jsonl` for prompts instead of using pasted text.

**Rule:** Re-paste. Don't mine.

### Fabricated Verification (4+ incidents: 4.24, 5.6.3, 5.7.2-S1, 5.7.2-S2a)

Agent reported test passage with invented suite filenames. Synthesized file sizes, test output, curl responses for files never written.

**Rule:** Every report must include raw terminal output for every claim. "Success" without pasted command output is unverifiable and rejected.

### Sandbox Persistence Failures (2 variants)

Antigravity `write_to_file` reports success but writes 0 bytes. Variant: reports sizes that don't match filesystem.

**Rule:** After any agent task that claims to create/modify files, run `Get-Item <file> | Select-Object Length` on each BEFORE `git add`. Any 0-byte file indicates persistence failure. Recreate manually.

### PowerShell Hazards (recurring)

- **BOM:** `Set-Content -Encoding UTF8` prepends `EF BB BF`. Strip after: `node -e "const fs=require('fs');const b=fs.readFileSync('file');if(b[0]===0xEF)fs.writeFileSync('file',b.subarray(3));"`
- **Here-string interpolation:** Double-quoted `@" ... "@` interpolates `${...}` inside embedded JS template literals.
- **Two-layer escaping is always wrong.** Use a Python generator with `json.dumps()`, or a standalone `.js` file written by a plain text editor. Never string substitution.

### Writer-Script Iteration Spiral

Agent consumed 6+ write-script iterations before succeeding in Session 3b-1. Same failure modes as Session 2a.

**Rule:** Every multi-file Antigravity prompt requires the **Python-generator + Node-writer two-layer pattern by name.** Do not let the agent improvise.

### Verify-Before-Stage

After every write: `Get-Item <file> | Select-Object Length` (>0 required). Before commit: `git show :<file> | Measure-Object -Line` on every staged file.

### Backend Restart Required

Vite hot-reloads frontend. Node does not. Every backend commit requires explicit dev-server restart before manual verification.

### .gitignore Encoding

UTF-16 `.gitignore` silently fails to parse. If `git check-ignore -v <path>` returns empty for a pattern visibly present in the file → suspect encoding. Must be UTF-8 without BOM.

### SQLite `CURRENT_TIMESTAMP`

Returns `"YYYY-MM-DD HH:MM:SS"` — no `T`, no `Z`. JS `new Date()` parses this as **local time**, causing false offsets. Normalize to ISO 8601 UTC at the repository boundary.

### Rules of Hooks

Never place a hook below a conditional return. All hooks unconditionally at top of component.

### Full-File Rewrite Drift

Full-file rewrites can silently alter public function signatures even when builds pass. After any full-file rewrite, diff export surfaces:
```powershell
git show HEAD~1:<file> | Select-String "export function"
git show HEAD:<file> | Select-String "export function"
```

### Test Schema Bypass
Agent wrote a test that inserted a child row without parent and disabled FK constraints (PRAGMA foreign_keys = OFF) to make it pass. Rejected. Test schema must match production schema semantics. Fixtures provision real parent records.

### Agent Scope Violation
Agent rewrote docs/ROADMAP_2026-09.md unrequested and injected a fictitious provider plan ("Gemini 2.0 Flash"). Real system is OpenRouter → DeepSeek V4 Flash.

Rule: Stay inside stated blast radius. Never trust an agent's roadmap summary over verified project state.

### Parallel File Edits
Two simultaneous edits to one file → one clobbers the other. Serialize multi-edit passes on a single file.

### Phase Closure Authority
Agents never declare phase closure. The user does, after docs-close and tag.

### Test Passing for the Wrong Reason
Test passed via legacy path when the plan required the new path. Rule: verify the diff shows the new branch. Consider disabling the new branch — if the test still passes, it isn't exercising new code.

10. Model Delegation Matrix
Task	Model	Level
Strategic / architectural	Gemini 3.1 Pro	High
UI design, component styling, visual hierarchy	Claude Sonnet 4.6	adaptive
Backend wiring, hooks, API clients, tests	Gemini 3.8 Flash	Medium
Build runs, git ops, file creation	Gemini 3.8 Flash	Low
Concurrency / timing bugs (escalation)	Gemini 3.8 Flash	High
Verification-critical sessions	/boost	—
Tauri packaging (reserved)	Claude Opus 4.6	—
Production AI inference	OpenRouter → DeepSeek V4 Flash	n/a
Operating rule: Escalate thinking level only after failure. Start lower.

Antigravity Tooling
Command	Purpose
/plan	Complex multi-session phases; produces reviewable artifact
/grill-me	Interactive design interview
/goal	Bounded autonomous execution
/boost	Multi-agent verification-critical work
/browser	Not available (Chrome unsupported in user's env)
/learn	Capture successful tooling patterns
Artifact Review Policy = Request Review. Use native review, don't embed "STOP and await approval" in prompts.

11. Provider Decision — LOCKED 2026-10-03
v1.0 supports two provider shapes:

OpenRouter (cloud) — existing path

Local (OpenAI-compatible) — single adapter serving /v1/chat/completions

Works with: Ollama, LM Studio, llama.cpp server, vLLM, LocalAI, and any other OpenAI-compatible server.

Ollama pre-filled at http://localhost:11434/v1 — but not exclusive.

Principle: Ollama-first UX, OpenAI-compatible architecture.

Settings (5.8j) exposes:

Provider dropdown (OpenRouter | Local)

Base URL, model name, optional API key

"Test connection" probe against /v1/models

## 12. Architecture — Node + Python Hybrid (LOCKED)
Not a fallback. The target model.

```text
Node
├── API / HTTP
├── Orchestration
├── SQLite (sole writer)
├── Application lifecycle
└── Capability routing
        ↓ localhost HTTP
Python sidecar (127.0.0.1:8765)
├── PaddleOCR (image-only PDFs)
├── pysbd (sentence splitting)
├── BGE-M3 (embeddings)
├── BGE-reranker-v2-m3
├── DOCX/RTF parsing (python-docx, striprtf)
├── Kokoro TTS (Phase 5.9)
└── Future: Discussion, Story
```

Hard boundary: Node is the sole SQLite writer. Python never writes to the DB directly.

Principle: Each language does what it's uniquely good at. Interface between them is small, versioned, HTTP-based.

## 13. Re-entry Rules
### Dropped Features
Discussion mode and Story mode are removed from the roadmap.

If either re-enters, it does so as a new top-level module in a future build — with its own plan, its own sessions, its own scope. No folding into existing phases. No stubs.

Any Future Large Feature
Same rule: separate plan, separate sessions, deliberate inclusion. Bundling is a scope hazard.

## 14. Deferred & Tracked
### Deferred (with target)
BGE-M3 migration execution — scripts/migrate-bge-to-python.js created, not run. Requires sidecar + USE_PYTHON_EMBEDDER=true. Decision on default at phase close.

Citation integrity check — post-Python hybrid phase. Verify [Source N] grounding against indexed chunk vectors.

Fixture licensing swap — see docs/RIGHTS.md. Pre-commercial release.

Preface-less source handling — synopsis degradation on sources lacking preface + TOC. Retry logic saves it today; fragile.

Compression overshoot tuning — ongoing measurement.

formatRelativeTime scope drift — verify Xmo / Xy variants on next touch.

Empty chapter handling — pre-existing synthesis issue.

Adaptive concurrency controller — Phase 5.8+ provisional. One account, one provider, one window of ~40 calls proved N=5 works with zero 429s. Insufficient data for a controller. Three-step path: (1) static + manual override now, (2) data collection in 5.8, (3) adaptive only if data justifies.

Web search source expansion — currently Wikipedia + OpenLibrary. Candidates: CrossRef, arXiv, Project Gutenberg.

Format expansion — Markdown + .txt upload is the smallest candidate (5.8l).

### Informational (by design, not bugs)
A vs C agreement varies by document type. 14% on two-column ResNet, 55% on canonical textbook.

Parser chapter detection on SEC filings and two-column papers is shallow by design. Editorial planner re-segments into 1,500–2,500-word units.

math-heavy.pdf yields 1 candidate from 61 chunks. Honest behavior for a non-book-like shape.

Full suite runtime ~5–7 min. Future: test:fast / test:full split.

## 15. Continuity
Docs that survive any chat loss
docs/SESSION_HANDOFF.md — this file

docs/PRODUCT_VISION.md — thesis, invariants, three laws

docs/CONTINUITY.md — 60-second orientation

docs/ROADMAP_2026-09.md — long-term plan

docs/ARCHITECTURE_AUDIT.md — backend architecture

docs/RIGHTS.md — licensing state

docs/CANONICAL_TEST_BOOK.md — fixture ground truth

docs/FRONTEND_BLUEPRINT.md / _SPEC.md — frontend narrative + contract

docs/SCAFFOLD_PLAN.md — frontend structure

docs/DESIGN_MATH_EXTRACTION.md — F23 design

docs/DESIGN_DOSSIER_FOUNDATION.md — Research architecture design

docs/DESIGN_CHATLOG_PARSING.md — F24 design

### Restart with a new assistant
Open fresh chat.

Paste: "Read docs/SESSION_HANDOFF.md, docs/PRODUCT_VISION.md, and docs/CONTINUITY.md. Confirm orientation, then tell me the next task in one paragraph."

Any competent model orients in one turn.

### Carry Forward — Always
Two-representation invariant (Original immutable, Omni traceable)

Three laws (Source is paper / Lens is tinted / Derivation never masquerades)

Raw-output verification over model summaries

One workstream per session

Commit docs before code

Verification evidence is pasted, never asserted

Commit before any agent task touches a file

Re-paste, don't mine

Never git reset --hard

Agents never declare phase closure

## 16. The Invariant
ORIGINAL READING is immutable source. Never touched.
OMNI READING is a derived lens. Fully traceable back to source.

Every decision serves this.

End of handoff. Update at the end of every session.
