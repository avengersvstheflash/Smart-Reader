# Week Objectives — 2026-09-20 to 2026-09-26

> **Scope.** This is the working plan for the week following Phase 4
> completion. Every item below serves one goal: make the primary
> Smart Reader experience feel like a real library of the user's own
> content, with processing that feels alive.

---

## The one-sentence goal

**Make importing a book feel like watching a workshop build something
beautiful, and make the resulting Smart Library feel like a real
collection of the user's own materials.**

Everything this week serves that sentence.

---

## Part 1 — The Cinematic Import Vision

This is the design target for Phase 4.7. Not a nice-to-have — it's
what separates "developer tool" from "product people want to use."

### The core principle

**Every animation is driven by real `processing_jobs` progress.
Nothing is faked.** The presentation is cinematic. The data is real.
The user is watching actual work happen, not a `setTimeout` theatre.

### The scene-by-scene experience

| Real backend signal | What the user sees |
|---|---|
| `INGEST` job at 10% | "Reading the file…" with a **page-turning animation** — pages flip open in the UI as if the book is being opened for the first time |
| `INGEST` at 40% | "Extracting text…" with a **light sweep** across the pages |
| `INGEST` at 60% | "Detecting structure…" with **chapter cards materializing**, one by one, into a vertical column |
| `INGEST` at 85% | "Normalizing content…" with the chapter cards **aligning and settling** into their final positions |
| `SEMANTIC_INDEX` job | "Building semantic memory…" with **chunk particles gathering** — small dots converge from the chapter cards into a single constellation |
| `SYNOPSIS` job | "Drawing out the thesis…" with a **scan-over-preface effect** — a soft horizontal band sweeps across the front matter, and text excerpts lift off into a summary card |
| Editorial outline | "Planning Smart Chapters…" with a **chapter grid filling in** — Smart Chapter placeholders appear in a grid, each title typing itself in |
| Per-chapter synthesis (`+1/+3/+5/+10` batches) | "Writing Chapter N…" with **lines streaming into each chapter card**, one sentence at a time |
| `BOOK_SUMMARY` job | "Completing the collection…" with a final **settle animation** — everything aligns, a soft pulse, done |

### What makes it feel alive

- **Motion is meaningful.** Each phase transition has its own rhythm.
- **Text is specific.** Not "Loading…" — "Reading the file…", "Detecting
  structure…", "Writing Chapter 3 of 6…". The user always knows what's
  happening.
- **Progress is visible per-phase AND cumulative.** A subtle overall
  progress bar at the top; detailed phase steps below.
- **It scales with real duration.** A 2-second import doesn't play a
  30-second animation. A 3-minute synthesis doesn't rush through.
  The animation adapts to actual `job.progress` updates.
- **Reduced motion is respected.** Under `prefers-reduced-motion:
  reduce`, all animations collapse to static text + a progress bar.
  The information remains. Only the theatre is removed.

### What it is not

- Not a fake loading screen with a progress bar that goes to 100% in
  3 seconds regardless of actual work
- Not a modal that blocks the whole app
- Not an overlay that can't be dismissed
- Not pre-recorded animation sequences — every motion maps to a real
  backend event

The user can leave the tab, come back, and see the real current state.
Because it's driven by `processing_jobs`, they see truth.

---

## Part 2 — The Web Import Vision

Web sources are peer imports, not a secondary feature.

### What "web source" means

A URL is a library item. It has:
- Its own `source_url` (visible in Book Details)
- Its own `source_site` (Wikipedia, arXiv, Substack, blog)
- A retrieval timestamp
- A content hash for change detection
- Its own author, title, publication date where extractable

The Library should treat web sources with the same respect as PDFs.

### The Web tab experience

- **Search bar** at the top (already have `GET /api/web/search`)
- **Category chips** (data-cat, already exist: technical, article, essay)
- **Result cards** with: preview snippet, source site badge, URL
- **Multi-select** — pick 2–10 sources, import as a dossier
- **Preview per result** — clicking a card opens a preview panel
- **Selected sources get a floating bar** at the bottom: "Import 3
  selected →"
- **Import runs through the same cinematic pipeline** as file import

### The Paste tab experience

- Title field (required)
- Author field (optional)
- Content textarea (required, min length)
- Same cinematic pipeline on submit

### Why this matters

A "digital and smart library" doesn't distinguish between a PDF the
user downloaded and an article they saved from the web. Both are their
content. Both deserve Smart Chapters. Both deserve provenance.

---

## Part 3 — The Week's Scope

### Phase 4.5 — Reading UX refinements
**1 session · Flash · Medium**

| Item | Deliverable |
|---|---|
| A | Hide `[Source N]` markers from rendered Smart text. Backend keeps them for provenance; frontend strips them at render |
| B | Book opens in Smart mode by default (whole-book, not per-chapter) |
| C | Book Details "SYNOPSIS" panel shows actual SYNOPSIS (currently shows BOOK_SUMMARY — bug) |
| D | Library card shows "Smart Ready" badge when a book has an editorial outline |

**End state:** Clicking a book lands in Smart mode. No `[Source N]`
visible. Synopsis is correct. Library signals which books have Smart
content.

### Phase 4.6 — Web + Paste import
**1 session · Flash · Medium**

| Item | Deliverable |
|---|---|
| A | Web search tab: search, preview, multi-select, import as dossier |
| B | Paste tab: title + author + content → import |
| C | Web sources render provenance correctly in Book Details (URL, site, retrieved-at) |

**End state:** Every source type a user has — file, web, paste — is
importable from the UI with full provenance.

### Phase 4.7 — Cinematic processing experience
**1–2 sessions · Pro · High (architecture) + Flash · Medium (implementation)**

| Item | Deliverable |
|---|---|
| A | Cinematic import scene component driven by real `processing_jobs` |
| B | Phase-specific animations for each real job type |
| C | Streaming chapter arrival for `+1/+3/+5/+10` batches |
| D | Reduced-motion fallback — static equivalent for every animation |
| E | Dismissible — user can close the scene and see progress as a
      compact widget in the header |

**End state:** Importing a book feels like watching a workshop build
the Smart version. Nothing is faked. The user trusts the progress
because it matches what the backend is actually doing.

### Phase 5.6 — Synthesis job tracking (bundled with any session)
**30 min · Flash · Medium**

| Item | Deliverable |
|---|---|
| A | Editorial outline + chapter synthesis write `processing_jobs` rows |
| B | Frontend normalizes job status strings (`'PROCESSING'` and `'in_progress'` → unified) |

**End state:** Stepper shows all phases honestly (7 steps, not 4).
Cinematic scene can show "Writing Chapter N…" driven by real job state.

---

## Part 4 — Milestone — "Minimum Product"

The floor where the app matches the vision. Reached after Phases 4.5,
4.6, 4.7 (this week), plus Phase 5 (next week, inline source tracker).

**The user flow:**

1. Open Smart Reader. See a library of *their own* books, articles, and
   saved web sources.
2. Click "Add" → choose File / Web / Paste.
3. Drop a PDF, paste a URL, or type text.
4. Watch a **cinematic pipeline** show actual work happening — pages
   turning, chapters materializing, chunks gathering, chapters writing.
5. Land on the book. **Smart mode is the default.** Synopsis at the
   top, drawn from preface + TOC.
6. Read compressed Smart chapters — 250–360 words each, sourced from
   1,500–2,500-word units. No `[Source N]` markers visible.
7. Click any line → source panel opens in-reader at the exact page.
8. Close panel → back to exact Smart scroll position.
9. Everything local. Everything private. Every line traceable.

**That's the milestone.** Everything else (Tauri, audio, story mode)
sits on top.

---

## Part 5 — What Comes After This Week

For orientation only — not in scope this week:

| Phase | What | When |
|---|---|---|
| 5 | Inline source tracker (the moat made interactive) | Next week |
| 5.5 | Library polish (covers, progress, filters, empty states) | Next week |
| 6 | Tauri wrap — native window, bundled backend, bundled model | After milestone |
| 7 | Audio mode (Build 5) — Kokoro-82M local TTS | After Tauri |
| 8 | Discussion mode (Build 6) — local Ollama multi-agent | Later |
| 9 | Story mode (Build 7) — narrative + images | Latest |

---

## Part 6 — Design Guardrails

Rules that apply to every item this week. These come from
`docs/PRODUCT_VISION.md` and cannot be overridden for convenience.

1. **Real progress only.** No `setTimeout` theatre. Every animation
   reads from `processing_jobs`. If the backend isn't tracking it,
   don't show it.

2. **No silent deception.** If a chapter was fallback-generated, it
   shows the caption. If a source has no preface, the synopsis isn't
   faked from body text. If a job failed, the user sees the error.

3. **Smart is the surface.** Books open in Smart. Original is reached
   by tracing, not by a peer toggle.

4. **Provenance is earned.** Every Smart line connects to a source
   passage. If we can't trace it, we don't render it as if we can.

5. **The user owns everything.** Local-first. No cloud calls without
   the user's configured provider. No telemetry.

6. **Motion is respectful.** `prefers-reduced-motion` collapses every
   animation to a static equivalent. Never gate information behind
   motion.

7. **The library is the product.** Every source type is a first-class
   citizen. Every book is a real item. Import isn't a side flow.

---

## Part 7 — What "Done" Looks Like on Friday

By end of week (2026-09-26):

- ✅ `[Source N]` markers invisible in the reader
- ✅ Books open in Smart mode by default
- ✅ Library shows "Smart Ready" badges
- ✅ Web search + import fully functional with provenance
- ✅ Paste import functional
- ✅ Cinematic pipeline plays on every import (with reduced-motion
      fallback)
- ✅ Per-chapter synthesis visible in real time during `+N` batches
- ✅ Stepper shows all 7 real phases (with synthesis job tracking)
- ✅ 13/13 tests still green
- ✅ Committed history is clean — every phase its own labeled commit

**Not done this week (next week's scope):**
- Source click-through panel (Phase 5)
- Mobile long-press interaction
- Cross-format position resolution
- Tauri wrap

---

## The one-line summary

> **This week turns the Smart Reader from a working prototype into a
> product someone would open twice. The library becomes real. The
> processing becomes cinematic. The vision becomes visible.**

---

*End of week objectives. Update at Friday close.*