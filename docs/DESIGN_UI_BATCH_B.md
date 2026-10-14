# Design Specification: UI Batch B (BookDetails & Persistent Import Dock)

**Date**: 2026-10-14  
**Scope**: F78 (Right-side Import Dock), F82 (Chapter Synthesis Hero Control), F79a (Supporting Materials Cleanup), F80 (Visual Metadata Blocks).  
**Status**: Design Sketch for Decision (Docs & Mocks Only).

---

## SECTION 1 — F78: Persistent Import Widget as Right-Side Dock

### Current State Problems
- **Visual Clutter & Bleed**: Positioned as a floating box in the bottom-right/top-right viewport with semi-transparent backdrop blur (`bg-panel/95 backdrop-blur-md`), bleeding underlying content and text through the widget.
- **Awkward Collapsed State**: When minimized, it hovers in the corner looking like a truncated, half-rendered box.
- **Content Occlusion**: Overlays floating action buttons, table rows, and reader navigation controls.
- **Reader Mode Conflicts**: In reading view, the floating pill collides with the reader footer bar.

### Proposed Direction
- Fixed right-side dock adhering to the right edge of the viewport.
- Fully opaque surface (`bg-card` / `bg-surface` with solid border), eliminating see-through bleed.
- Fixed 320px width when expanded; collapsible to a slender 48px vertical rail or auto-hidden when queue is idle.
- Displays active task progress, stage checklist, monotonic ETA, cancellation control, and queued items list.

---

### Option A: Right Rail with Icon-Collapse (Recommended)

#### Expanded (320px) vs. Collapsed (48px) ASCII Layout Mock

```text
[EXPANDED DOCK — 320px width]             [COLLAPSED RAIL — 48px width]
┌────────────────────────────────────────┐ ┌────┐
│ ⚡ IMPORT PIPELINE               [>]   │ │[<] │ <- Expand toggle
│ 3 tasks queued · ~1m 40s remaining     │ ├────┤
├────────────────────────────────────────┤ │ ◐  │ <- Animated progress ring (45%)
│ ACTIVE TASK                            │ │ 45%│
│ "Cognitive Architecture Survey.pdf"    │ ├────┤
│ [█████████████░░░░░░░░░] 45% · ~40s    │ │ 3  │ <- Queue count badge
├────────────────────────────────────────┤ │ ⏱  │
│ Stages:                                │ │ ~2m│ <- Monotonic ETA pill
│   ✓ Ingestion & format parsing         │ ├────┤
│   ✓ Semantic indexing                  │ │    │
│   ◐ Section classification             │ │    │
│   ○ Outline generation                 │ │    │
│   ○ Chapter synthesis                  │ │    │
│   ○ Attribution mapping                │ │    │
│ [Cancel Task]                          │ │    │
├────────────────────────────────────────┤ │    │
│ QUEUED (2)                             │ │    │
│ 1. Quantum_Attractors_Review.epub      │ │    │
│ 2. https://arxiv.org/abs/2402.0123     │ │    │
├────────────────────────────────────────┤ ├────┤
│ ↗ Full Import Workspace                │ │ ↗  │
└────────────────────────────────────────┘ └────┘
```

#### Pros
1. **Unobtrusive & Non-Overlapping**: The 48px rail stays tucked at the viewport perimeter, providing at-a-glance feedback without blocking reader text or main library tables.
2. **Instant Glanceability**: Live percentage, progress ring, and monotonic ETA remain visible on the rail even while reading or browsing.
3. **Smooth Slide Animation**: Transitions smoothly between 48px and 320px with zero layout jump.

#### Cons
1. Consumes 48px of right margin if left pinned during active task runs.
2. Rail icons require accessible tooltips to explain task states to screen-readers and hover states.

#### Zero Tasks Behavior
- When the queue is idle (zero active tasks, zero queued tasks, and recent completed task dismissed), the rail **completely auto-hides** (`translate-x-full` or unmounted). It consumes **0px** of screen real estate.
- When an import is enqueued, it slides in automatically from the right edge.

#### Narrow Viewports (<768px)
- On mobile/small tablets, horizontal rail space is too scarce. The widget switches to a compact floating bottom pill (`[ ⚡ Importing 45% · ~40s ]`). Tapping it opens a modal bottom-sheet overlay rather than a side dock.

---

### Option B: Top-Right Slide-In Drawer

#### ASCII Layout Mock

```text
[COLLAPSED NAVBAR STATE]
┌────────────────────────────────────────────────────────────────────────┐
│ Omnitome Library    Search books...               [ ⚡ 3 tasks · ~2m ]  │
└────────────────────────────────────────────────────────────────────────┘
                                                            │ (click)
                                                            ▼
[SLIDE-IN OVERLAY DRAWER — 320px]
┌───────────────────────────────────────────────┬────────────────────────┐
│                                               │ ⚡ IMPORT QUEUE    [X] │
│                                               ├────────────────────────┤
│                                               │ ACTIVE:                │
│                                               │ Cognitive Survey.pdf   │
│             MAIN PAGE CONTENT                 │ [████████░░░░░░░] 45%  │
│         (dimmed behind overlay scrim)         │ ETA: ~40s              │
│                                               │ ✓ Ingest               │
│                                               │ ◐ Classify             │
│                                               │ ○ Synthesis            │
│                                               ├────────────────────────┤
│                                               │ QUEUED:                │
│                                               │ 1. Quantum_Review.epub │
└───────────────────────────────────────────────┴────────────────────────┘
```

#### Pros
1. Zero screen footprint when collapsed: lives as a native pill inside the top header.
2. Familiar drawer interaction pattern with backdrop click-away dismiss.

#### Cons
1. **Occlusive**: When open, it darkens/overlays page content with a scrim; user cannot read or navigate while keeping the drawer open.
2. **High Friction**: User cannot monitor checklist progress passively while reading — each glance requires clicking to open, which blocks interaction.

#### Zero Tasks Behavior
- The top-right navbar pill vanishes completely when the queue is idle.

#### Narrow Viewports (<768px)
- Natural fit: the navbar pill remains in the header and opens a full-screen drawer or mobile bottom sheet.

---

### Option C: Full-Height Right Sidebar (Permanent Push-Layout)

#### ASCII Layout Mock

```text
[PUSH-LAYOUT SIDEBAR — 320px Permanent Column]
┌───────────────────────────────────────────────┬────────────────────────┐
│ Omnitome Library                              │ ⚡ IMPORT PIPELINE [X] │
├───────────────────────────────────────────────┼────────────────────────┤
│                                               │ Active:                │
│ Main content container dynamically adjusts    │ Cognitive Survey.pdf   │
│ width (calc(100% - 320px)):                   │ [████████░░░░░░░] 45%  │
│                                               │ ETA: ~40s              │
│ - Book hero flexes narrower                   │                        │
│ - 2-column grid adjusts to single column      │ Stages:                │
│ - Reader font size remains responsive         │ ✓ Ingestion            │
│                                               │ ◐ Indexing             │
│ (No content is occluded or overlaid)          │ ○ Synthesis            │
│                                               │                        │
│                                               │ Queued (2 tasks)       │
└───────────────────────────────────────────────┴────────────────────────┘
```

#### Pros
1. **Zero Occlusion**: Completely eliminates overlaying — main content is resized and shifted left.
2. **Deep Visibility**: Everything stays open side-by-side with reading.

#### Cons
1. **Severe Reflow**: Mounting/unmounting when tasks start or finish triggers full-page layout jumps, reflowing text and resetting scroll positions in long documents.
2. **Cramps Medium Screens**: On 1024px–1280px laptop screens, shrinking main content by 320px crushes BookDetails' 65/35 grid into vertical stacks.

#### Zero Tasks Behavior
- Sidebar collapses to width 0px with CSS grid transition `grid-template-columns: 1fr 0px`.

#### Narrow Viewports (<768px)
- Impossible to push layout horizontally on mobile; must fall back to a full overlay.

---

### Section 1 Recommendation
**We recommend Option A (Right Rail with Icon-Collapse).**
- **Rationale**:
  - Solves the transparency bleed-through immediately with an opaque `bg-card` surface.
  - The 48px collapsed rail provides passive telemetry (percentage + pulsing stage ring) without forcing users to open an overlay drawer (Option B) and without violently shrinking the reading layout (Option C).
  - Auto-hides when idle, preserving full minimalist canvas when no imports are running.

---

## SECTION 2 — F82: Chapter Synthesis Control in BookDetails Hero

### Current Hero State
```text
[Cover]  Book Title
         Author Name
         [RESEARCH] [INTERMEDIATE] [⚡ Local LLM (12,400 tokens)]
         3 chapters · 42,100 source words · ~18 min Omni read
         [▶ Start reading] [View original]
```
Currently, after initial import (which synthesizes 3 seed chapters), there is no hero-level control to synthesize subsequent chapters. Users must navigate to individual chapter rows in the table.

---

### Option A: Inline Button "Synthesize next 5"

#### ASCII Layout Mock
```text
[Cover]  Book Title
         Author Name
         [RESEARCH] [INTERMEDIATE]
         3 of 28 chapters generated · 42,100 source words
         [▶ Start reading] [View original] [⚡ Synthesize next 5]
```

#### User Flow
1. User lands on BookDetails and notices "3 of 28 chapters generated".
2. Clicks `[⚡ Synthesize next 5]`.
3. Button switches to pending state: `[⚡ Synthesizing 1/5… (spinner)]` (disabled).
4. As each chapter completes, the counter increments `Synthesizing 2/5…`. Upon completion, button returns to `[⚡ Synthesize next 5]` (or adjusts to remaining count if fewer than 5 left).

#### Progress Location
- Inline progress badge directly inside the button, plus live chapter list updates.

#### When Book is Fully Synthesized
- Button changes to a disabled success indicator `[✓ All chapters synthesized]` or cleanly unmounts.

#### When Synthesis is Already in Flight
- Button disabled with animated spinner: `[⚡ Synthesizing 2/5… ]`.

#### Pros & Cons
- **Pros**: Zero cognitive overhead; 1-click immediate trigger.
- **Cons**: Rigid batch size; user cannot synthesize just 1 quick chapter or all remaining.

---

### Option B: Split/Dropdown Button `[Synthesize ▾]` (Recommended)

#### ASCII Layout Mock
```text
[Cover]  Book Title
         Author Name
         [RESEARCH] [INTERMEDIATE]
         3 of 28 chapters generated · 42,100 source words
         [▶ Start reading] [View original] [⚡ Synthesize next 3 ▾]
                                             ├ Next 1 chapter   (~15s)
                                             ├ Next 3 chapters  (~45s) [default]
                                             ├ Next 5 chapters  (~1.5m)
                                             ├ Next 10 chapters (~3.0m)
                                             └ All remaining (25 chapters)
```

#### User Flow
1. User clicks the primary button `[⚡ Synthesize next 3]` for instant default batching, OR clicks `[▾]` to open the dropdown menu.
2. Dropdown presents options scaled to remaining count: 1, 3, 5, 10, or All Remaining.
3. User selects an option (e.g., "Next 5 chapters").
4. Call is dispatched to existing endpoint `POST /api/books/:id/synthesize-next` with `{ count: 5 }`.
5. Hero button enters active progress state: `[⚡ Generating 5 chapters… (spin)]`.
6. Chapter list query invalidates progressively, rendering new chapters as they land.

#### Progress Location
- **Both**: High-level count in hero button (`Generating 3/5…`) AND detailed stage telemetry in the right-side import dock.

#### When Book is Fully Synthesized
- Replaced by clean badge: `<span className="text-caption text-ok font-medium">✓ All 28 Omni chapters ready</span>`.

#### When Synthesis is Already in Flight
- Dropdown trigger is locked; main button displays `[⚡ Generating… (2/5)]` with spinner.

#### Pros & Cons
- **Pros**:
  - Perfectly matches existing backend API (`POST /api/books/:id/synthesize-next` accepts `count: 1 | 3 | 5 | 10`).
  - Split button gives 1-click speed for standard batches while allowing custom batch sizes.
  - Zero modal disruption.
- **Cons**: Requires standard accessible dropdown menu interaction.

---

### Option C: Modal Wizard

#### ASCII Layout Mock
```text
┌────────────────────────────────────────────────────────┐
│ Synthesize Omni Reading Chapters                   [X] │
├────────────────────────────────────────────────────────┤
│ Book: "The Master and Margarita"                       │
│ Generated: 3 of 28 chapters (25 remaining)             │
│                                                        │
│ Choose batch size:                                     │
│ [ 1 chapter ]  [ 3 chapters ]  [ 5 chapters ]  [ ALL ] │
│                                                        │
│ Estimated time: ~1m 30s                                │
│ Estimated LLM compute: ~14,200 tokens via OpenRouter   │
│ Estimated cost: ~$0.003                                │
│                                                        │
│ [Cancel]                         [Start Synthesis ▶]   │
└────────────────────────────────────────────────────────┘
```

#### User Flow
1. User clicks `[⚡ Synthesize more…]` in hero.
2. Modal opens displaying remaining chapters, token estimates, and count selector.
3. User selects count and confirms.
4. Modal closes and triggers synthesis.

#### Progress Location
- Handled by persistent dock and chapter list.

#### When Book is Fully Synthesized
- Hero button hidden.

#### When Synthesis is Already in Flight
- Button shows "Synthesis in progress"; clicking opens modal in read-only status mode with cancel button.

#### Pros & Cons
- **Pros**: Allows rich token cost telemetry and educational context on what synthesis does.
- **Cons**: Excessive friction and click fatigue for a repeated routine operation.

---

### Section 2 Recommendation
**We recommend Option B (Split/Dropdown Button `[⚡ Synthesize next 3 ▾]`).**
- **Rationale**:
  - Leverages existing backend architecture immediately (`POST /api/books/:id/synthesize-next` is already implemented and validated).
  - Split button combines 1-click execution for the recommended 3-chapter batch with dropdown flexibility for 1, 5, 10, or All remaining.
  - Clean hero aesthetic that integrates seamlessly alongside `[Start reading]` and `[View original]`.

---

## SECTION 3 — Implementation Sketch (No Code, Just Plan)

### 1. F78: Persistent Import Widget → Right-Side Dock
- **Blast Radius**:
  - `frontend/src/components/import/PersistentImportWidget.tsx` (redesign into fixed right-dock with opaque surface, rail toggle, and slide-out panel)
  - `frontend/src/store/useImportQueueStore.ts` (store flag `isDockExpanded`, dock toggle action)
- **Estimated Effort**: 1 hour
- **Dependencies**: None.
- **Regression Risk**: Low. Presentation-layer only; no backend changes. Automated test suites (`import_queue_pipeline_test.js`, `f58_1_dossier_dedup_test.js`) are decoupled from frontend markup.

### 2. F79a: Remove "Supporting Materials" Dead UI
- **Blast Radius**:
  - `frontend/src/routes/BookDetailsRoute.tsx` (remove lines 715–728: dead "Supporting materials" header, disabled "Attach source" button, and placeholder caption)
- **Estimated Effort**: 15 minutes
- **Dependencies**: None.
- **Regression Risk**: None. Dead UI component with no data bindings.

### 3. F80: Metadata (Chapters, Words, Imported, Ready) → Visual Blocks
- **Blast Radius**:
  - `frontend/src/routes/BookDetailsRoute.tsx` (replace line 445 dot-separated caption with a 4-card responsive grid: Chapters count, Source Words count, Omni Read duration, and Lifecycle Ready status)
- **Estimated Effort**: 30 minutes
- **Dependencies**: None.
- **Regression Risk**: None. Purely visual JSX styling.

### 4. F82: Chapter Synthesis Control in BookDetails Hero
- **Blast Radius**:
  - `frontend/src/routes/BookDetailsRoute.tsx` (integrate synthesis button in hero action bar, hook to trigger `POST /api/books/:id/synthesize-next`, query invalidation on `smartChapters`)
  - `frontend/src/components/book/ChapterSynthesisButton.tsx` (new clean modular component for the split/dropdown control)
  - `backend/routes/bookRoutes.js` (if "all remaining" requires a dynamic count cap or accepts `count: 'all'`)
- **Estimated Effort**: 1 hour
- **Dependencies**: Relies on existing `POST /api/books/:id/synthesize-next` endpoint.
- **Regression Risk**: Low. Backend endpoint already covered by `build4_4_progressive_synthesis_test.js`.

---

## Summary Decision Matrix

| Feature | Primary Goal | Recommendation | Blast Radius Files |
| :--- | :--- | :--- | :--- |
| **F78** | Eliminate bleed-through & intrusive overlay | **Option A**: 48px rail collapsible to 320px dock | `PersistentImportWidget.tsx`, `useImportQueueStore.ts` |
| **F82** | Hero trigger for progressive chapter synthesis | **Option B**: Split dropdown `[Synthesize next 3 ▾]` | `BookDetailsRoute.tsx`, `ChapterSynthesisButton.tsx` |
| **F79a** | Clean dead UI | Remove "Supporting materials" block | `BookDetailsRoute.tsx` |
| **F80** | Visual hierarchy for book statistics | 4-card responsive stats grid | `BookDetailsRoute.tsx` |

