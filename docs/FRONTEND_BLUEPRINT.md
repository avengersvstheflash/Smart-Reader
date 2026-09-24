# FRONTEND_BLUEPRINT.md

> **Modular document.** Every section is wrapped in `<!-- BEGIN: x -->` /
> `<!-- END: x -->` markers. Any section can be replaced atomically —
> find the marker pair, replace the block, restore the markers, commit
> with `blueprint(<section>): <summary>`. No section depends on another
> section's internal details; cross-references use section names only.

**Authoritative input:** `docs/ARCHITECTURE_AUDIT.md` (= `docs/FRONTEND_ARCHITECTURE.md`, same document, alternate filename). This blueprint specifies *style, interaction, and configuration only*. It does not alter the component tree, API contracts, or the backend's original/derived representation model.

**Provenance:** best-of-six merge. Sources and per-decision attribution live in `docs/BLUEPRINT_COMPARISON.md`. Where this document chooses one source's approach, the choice is grounded in the two-representation invariant and the WCAG AA baseline — not in source preference.

**Allowed runtime dependencies (no others):** `react-router-dom`, `zustand`, `@tanstack/react-query`, `lucide-react`, `@tailwindcss/typography`.

---

<!-- BEGIN: invariants -->

## §0 — The Invariants

Every decision in this document serves one invariant, expressed here as three laws:

> **ORIGINAL READING** is immutable source. Never touched. No UI affordance implies mutability.
> **SMART READING** is a derived lens. Fully traceable back to source.

1. **Source is paper.** Original reading renders on calm neutral paper with zero accent chrome. No badges inside text, no AI affordances, no editable surfaces. It looks like a book because it *is* the book.
2. **The lens is tinted.** Smart reading carries a quiet accent identity: 2px accent rail, `DERIVED` micro-label, tinted chips and provenance links. You know which representation you are in without reading a word.
3. **Derivation never masquerades as source.** Smart text is never rendered without a provenance affordance. Copy never calls derived text "the book" — it is *"Smart reading — derived from the source, fully traceable."*

Origin: F (Qwen auto). E (Qwen 3.8 Max) uses the same invariant as a design table; F's law framing is more teachable and is preserved here.

**Implication for every component.** If a proposed affordance could be mistaken for editing source, it is wrong. If a proposed label could let derived text read as original, it is wrong. The four themes, the toggle, the two-pane reader, the provenance click-through, the modal system, and the toast hierarchy all exist to serve these three laws.

<!-- END: invariants -->

---

<!-- BEGIN: visual-language -->

## §1 — Visual Language

Reading-first. Quiet. Typographic. The app should feel like a well-made reading room — not a dashboard, not an "AI tool." Chrome recedes; text advances. Decoration is limited to hairlines, soft shadows, and one terracotta accent used *semantically*. The aesthetic is tuned for readers in Japan and Europe: generous leading, serif reading faces with CJK mincho fallbacks, restrained motion, no gamification.

### §1.1 — Typography

Four families, all already loaded by the vanilla app. No new fonts.

| Role | Family | Stack | Where |
|---|---|---|---|
| Display | **Cinzel** (500–600) | Cinzel, Lora, Georgia, serif | Wordmark, book hero titles, reader chapter title, collection title |
| Reading | **Lora** (400–600, incl. italic) | Lora, Georgia, **"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP"**, serif | Reader canvas, blockquotes, synopses |
| UI | **Plus Jakarta Sans** (400–700) | "Plus Jakarta Sans", system-ui, "Segoe UI", sans-serif | All chrome: nav, buttons, lists, forms, labels |
| Mono | **JetBrains Mono** (400–500) | "JetBrains Mono", Consolas, monospace | Code blocks, word counts, provenance IDs |

**CJK fallbacks are non-negotiable.** Lora has no Japanese glyphs; original-source chapters may contain Japanese text. Origin: F (Qwen auto) — the only blueprint to catch this. Given the Japan-first market in the roadmap, missing this would degrade the reader for the primary audience.

**Type scale** (mobile → desktop):

| Token | Size | Line-height | Family / weight | Use |
|---|---|---|---|---|
| `display` | 1.875rem → 2.25rem (30 → 36px) | 1.2 | Cinzel 600, `letter-spacing: 0.01em` | Book hero, collection title, reader chapter title |
| `h1` | 1.5rem → 1.75rem (24 → 28px) | 1.25 | PJS 700 | Screen titles |
| `h2` | 1.25rem (20px) | 1.3 | PJS 600 | Section headings |
| `h3` | 1.0625rem (17px) | 1.4 | PJS 600 | Card titles, panel headings |
| `body` | 1rem (16px) | 1.6 | PJS 400 | Default UI text |
| `ui-sm` | 0.8125rem (13px) | 1.45 | PJS 500 | Buttons, nav items, form labels |
| `reading` | `var(--reading-size, 1.125rem)` (18px default) | 1.75 (1.85 for `:lang(ja)`) | Lora 400 | Reader canvas prose only |
| `caption` | 0.75rem (12px) | 1.4 | PJS 500, `letter-spacing: 0.02em` | Badges, meta lines, chip counts |
| `micro` | 0.6875rem (11px) | 1.3 | PJS 600, uppercase, `letter-spacing: 0.08em` | Representation labels: `SOURCE`, `DERIVED`, `IMMUTABLE` |

**Reading-size control.** The `Aa` popover adjusts `--reading-size` from **16px to 22px in 1px steps** (never below 16 — accessibility floor). Persisted per user. All canonical block spacing is `em`-relative, so the entire canvas scales proportionally when the variable changes. Floor of 16 rather than 14: E allowed 14px; F's 16px floor is the safer default and is preserved here. Power users can override via devtools; the UI does not go lower.

**Reading measure.** Source and lens canvases cap at **`max-w-[34em]`** (~65ch in Lora). Default alignment is **left** (ragged right); justified is offered in `Aa` with `hyphens: auto` and `lang`-aware dictionaries. Paragraphs are spaced, not indented. Origin: F.

### §1.2 — Color — four themes

**Theme names are exact: `default`, `warm`, `dark`, `glass`.** Applied as `data-theme="…"` on `<html>`, replacing the vanilla `body.theme-*` class cascade.

**Token format: RGB triplets.** Consumed as `rgb(var(--token) / <alpha-value>)` so Tailwind opacity utilities (`bg-app/85`, `text-ink/60`) work throughout. This is the modern Tailwind idiom and enables compositing the glass theme's alpha channel cleanly. Origin: E. F's hex format is simpler but loses alpha composability — a real cost for the glass theme.

**Token rename map** (vanilla → canonical):

| Vanilla (`style.css`) | Canonical |
|---|---|
| `--bg-app` | `--bg` |
| `--bg-card` | `--bg-card` |
| `--bg-panel` | `--bg-panel` |
| `--bg-subtle` | `--bg-subtle` |
| `--text-primary` | `--text` |
| `--text-secondary` | `--text-muted` |
| `--text-light` | `--text-faint` |
| `--brand-primary` | `--brand` |
| `--brand-accent` | `--accent` |
| `--border` / `--border-strong` | unchanged |
| `--status-*` | unchanged |
| `--glass-blur` | unchanged (glass theme only) |

**All-token table** — canonical declarations for §6's `index.css`:

| Token | default | warm | dark | glass |
|---|---|---|---|---|
| `--bg` | `247 246 242` | `243 234 217` | `21 24 29` | `237 240 243`¹ |
| `--bg-card` | `255 255 255` | `250 244 230` | `28 32 39` | `255 255 255`² |
| `--bg-panel` | `253 253 252` | `247 240 223` | `25 29 35` | `255 255 255`² |
| `--bg-subtle` | `240 238 233` | `236 225 201` | `35 40 48` | `255 255 255`² |
| `--border` | `229 226 218` | `226 213 186` | `43 49 59` | `255 255 255`² |
| `--border-strong` | `210 206 195` | `203 187 149` | `61 69 83` | `28 31 36`² |
| `--text` | `28 31 36` | `58 47 34` | `217 220 225` | `32 36 43` |
| `--text-muted` | `94 100 110` | `111 95 73` | `154 161 171` | `86 93 104` |
| `--text-faint` | `137 143 153`³ | `138 118 86`³ | `110 118 129`³ | `121 128 139`³ |
| `--brand` | `41 56 69` | `74 56 38` | `143 163 181` | `41 56 69` |
| `--accent` | `196 109 59`³ | `164 85 42` | `217 138 91` | `178 92 46` |
| `--accent-ink`⁴ | `164 85 42` | `143 71 34` | `226 154 109` | `150 73 31` |
| `--accent-wash` | `244 233 223` | `234 217 194` | `51 38 29` | `196 109 59 / 0.12` |
| `--status-success` | `47 122 82` | `63 107 72` | `116 183 140` | `47 122 82` |
| `--status-warning` | `150 105 26` | `138 100 20` | `213 164 81` | `138 100 20` |
| `--status-error` | `166 58 58` | `156 58 52` | `224 133 133` | `166 58 58` |
| `--shadow-sm` | `0 1px 2px rgb(28 31 36 / .05)` | `0 1px 2px rgb(58 47 34 / .06)` | `0 1px 2px rgb(0 0 0 / .40)` | `0 1px 2px rgb(28 31 36 / .06)` |
| `--shadow-md` | `0 2px 8px rgb(28 31 36 / .08)` | `0 2px 8px rgb(58 47 34 / .09)` | `0 2px 10px rgb(0 0 0 / .45)` | `0 8px 32px rgb(28 31 36 / .12)` |
| `--shadow-lg` | `0 8px 24px rgb(28 31 36 / .10)` | `0 8px 24px rgb(58 47 34 / .12)` | `0 8px 28px rgb(0 0 0 / .50)` | `0 12px 40px rgb(28 31 36 / .16)` |
| `--glass-blur` | — | — | — | `blur(16px) saturate(180%)` |
| `--glass-gradient` | — | — | — | `linear-gradient(165deg, #dfe7ee 0%, #efe9dc 48%, #e3e9ef 100%)` |

¹ The `--bg` value is the solid fallback. The glass theme paints `--glass-gradient` fixed behind frosted panels — see §6.
² Glass card/panel/subtle/border tokens carry alpha (0.40 / 0.55 / 0.72 / 0.65). Consumed via `rgb(var(--token) / <alpha>)` — the alpha is already in the token value.
³ `--text-faint` and `--accent` clear only **3:1** on the app background — reserved for large text, icons, borders, and non-text UI (WCAG 1.4.11). Body-size accent text always uses `--accent-ink`.
⁴ **New token.** The vanilla `--brand-accent #c46d3b` is ~3.9:1 on white — fine for chips and icons, failing AA for prose-size text. `--accent-ink` is the text-safe accent split. Origin: E, and independently arrived at by F. Both Qwen runs flagged this — it's a real fix, not a nicety.

> **ASSUMPTION.** Only the `default` theme's exact hexes are documented in `ARCHITECTURE_AUDIT.md` / `architecture-style-css.md`. The `warm`, `dark`, and `glass` values above are reconstructed from the same slate/terracotta family the vanilla overrides used, tuned for WCAG AA. **Before scaffolding, replace these three themes' values with the exact hexes from the vanilla `body.theme-warm`, `body.theme-dark`, `body.theme-glass` blocks if they differ.** Token *names* and *roles* are correct regardless.

**Semantic color rules** (the invariant, in pigment):

- `--accent` / `--accent-wash` are the **derived-representation signature**. The Smart rail, `DERIVED` labels, provenance links, generation progress, and active smart chips use them. **Original-mode chrome never uses accent.** Only `--brand`, `--text-*`, and `--border`.
- `--status-*` colors are for job/integration states only (success, warning, error badges; toasts; pipeline steps). Never decorative.
- Elevation is theme-aware: light themes use soft shadows; `dark` leans on `--border` contrast; `glass` uses blur plus a wide soft shadow.
- Book cover spines use a deterministic hash of the title mapped into a **fixed earth-tone set** (slate, terracotta, olive, sand, plum-grey, navy) at low saturation. Calm enough to read a page; colorful enough to scan a shelf. Origin: F.

### §1.3 — Spacing — 4px base

The vanilla app already uses a strict 4px scale (4/8/12/16/24/32/48/60). Maps 1:1 onto Tailwind's default spacing (`1`=4px … `15`=60px). **No custom scale is defined.** Only disciplined usage:

| Tailwind | px | Canonical use |
|---|---|---|
| `gap-1` / `p-1` | 4 | Icon↔label gap, inline chip internals |
| `gap-2` / `p-2` | 8 | Chip padding-y, hairline separators |
| `p-3` / `gap-3` | 12 | Card padding (mobile), mobile grid gaps |
| `p-4` / `gap-4` | 16 | Card padding (desktop), mobile gutters |
| `p-6` / `gap-6` | 24 | Section padding, panel gaps, desktop gutters |
| `p-8` | 32 | Reader canvas vertical padding |
| `p-12` | 48 | Hero vertical margins, empty-state centering |
| `p-[60px]` | 60 | Vanilla's largest rhythm value — major section breaks |

**Reading-specific metrics:** canvas `px-5 md:px-10`, measure `max-w-[34em]`, paragraph spacing `1.25em` (canonical.css), chapter title margin-bottom `1.5em`. Shell content `max-w-6xl mx-auto`. Touch targets **≥44×44px** on mobile for every reader control (nav arrows, toggle, `Aa`).

### §1.4 — Motion

Calm means: **short, small, quiet.** Nothing in the reading column ever animates except the provenance flash. Motion communicates state change, never personality.

| Token | Value | Use |
|---|---|---|
| `--dur-instant` | 100ms | Press feedback (`active:scale-[0.98]`), checkbox fills |
| `--dur-fast` | 150ms | Hover states, chip toggles, icon swaps |
| `--dur-base` | 220ms | Modal enter, popover open, theme crossfade, pane swaps |
| `--dur-slow` | 320ms | Toast slide-up, bottom sheet, selection bar |
| `--dur-ambient` | 500ms+ | Skeleton pulse cycle (opacity only), AI status dot |

**Easings:** `--ease-calm: cubic-bezier(0.2, 0, 0, 1)` (default for everything), `--ease-enter: cubic-bezier(0, 0, 0.2, 1)` (arrivals), `--ease-exit: cubic-bezier(0.4, 0, 1, 1)` (departures). Exits are ~⅔ the duration of enters.

**Hard rules:**

- Card hover lifts **≤2px** (`hover:-translate-y-0.5`) + shadow-sm→md, 150ms. No scaling of text surfaces.
- Chapter change: previous chapter stays visible (dimmed to 60% opacity) until the next resolves. No blank flash. No spinner over text.
- Smart chapters **stream in** on completion: `animate-fade-in` + 4px rise, staggered by arrival. `motion-reduce:` disables.
- Progress bars transition `width` only (150ms linear). Never striped, never shimmering — fake motion over a real number is noise.
- Theme switch crossfades `background-color`/`color`/`border-color` at 220ms via a temporary `.theme-transition` class on `<html>` (removed on `transitionend`) so layout never animates.

**Reduced motion** — three layers:

1. **Global CSS kill-switch** in `index.css`: all animation/transition durations → `0.01ms`, `scroll-behavior: auto`.
2. **Per-component `motion-reduce:`** variants on card lift, toast slide, chapter stagger, modal scale.
3. **`useReducedMotion()` hook** (matchMedia, no dependency) for imperative behavior: `scrollIntoView({ behavior: 'auto' })` in provenance jumps, and the provenance flash → static 2px accent outline for 3s.

**Reduced transparency** (unique to D — DeepSeek). Under `prefers-reduced-transparency: reduce`, the `glass` theme falls back to `default` tokens. Glass's backdrop-filter can affect users with vestibular or low-vision sensitivities. This is a real accessibility requirement, not a nicety. Origin: D.

### §1.5 — Iconography

One icon set: **lucide-react**. No icon fonts. No inline SVG duplication (the vanilla file hand-copied SVGs everywhere — that ends here).

| Size | px | strokeWidth | Where |
|---|---|---|---|
| `xs` | 14 | 2 | Inline with caption/micro text: provenance arrows, badge icons |
| `sm` | 16 | 2 | Inside buttons, chips, list rows |
| `md` (default) | 20 | 1.75 | Nav, header, top bar, Aa controls |
| `lg` | 24 | 1.75 | Empty states, tab icons, modal headers |
| `xl` | 32 | 1.5 | Hero empty-state marks only |

`strokeWidth: 1.75` at ≥20px is a deliberate step down from lucide's default 2 — thinner strokes read as calmer next to Cinzel/Lora. Below 16px, stay at 2 for legibility.

**Rules:** icons inherit `currentColor` and sit in `text-muted`, brightening to `text-ink` (or `text-accent-ink` in smart chrome) on active/hover. Every icon is `aria-hidden="true"` unless it is the sole content of a control — then it gets `role="img"` + `<title>` *and* the control gets an `sr-only` label. Status is never icon-only; always pair with text or color+shape (WCAG 1.4.1).

**Concept → icon map** (consistent everywhere):

| Concept | Icon | Rationale |
|---|---|---|
| Original representation | `BookOpenText` | The book itself |
| Smart representation | `Layers` | A lens *stacked over* source — deliberately **not** `Sparkles`/`Wand2`. The product must not read as "AI tool." Origin: D + E + F agree. |
| Provenance jump | `ArrowUpRight` | "Go to the origin" |
| Library / Research / Import (nav) | `Library` / `FolderSearch` / `Plus` | |
| Jobs | `ListChecks` | |
| Theme | `Palette` | A four-way choice, not a light/dark binary |
| AI status | 6px CSS dot + `Info` explainer | Quiet; pulse only while checking |
| Settings / Delete / Close | `Settings` / `Trash2` / `X` | |
| File / Web / Paste (import tabs) | `FileText` / `Globe` / `ClipboardPaste` | |
| Chapter rail | `AlignLeft` (mobile sheet trigger) | |
| Search / Filter | `Search` / `SlidersHorizontal` | |
| Read status | `Check` inside bordered square → filled on read | Manual toggle |
| Empty library | `BookMarked` (xl, `text-faint`) | |
| Smart empty state | `Feather` (xl, `text-faint`) | Derived, hand-written connotation |

<!-- END: visual-language -->

---

<!-- BEGIN: screens -->

## §2 — Screens

Routes (per `architecture-index-html.md` §6):

| Route | Screen | Notes |
|---|---|---|
| `/` | Library | Default landing |
| `/book/:bookId` | Book Details | |
| `/read/:bookId/:chapterId` | Reader | `?rep=original \| smart`, `#blk-…` anchors |
| `/import` | Ingestion / Import | Shares content with the legacy `addBookModal` |
| `/research` | Research Collection (index) | |
| `/research/:outlineId` | Research Collection (active) | |

The four vanilla top-level views become four routes. The Add Book **modal** becomes a modal *and* a route (`/import`); both render the same `ImportContent` component. The other 10 modals stay modal-only.

### §2.1 — Library (`/`)

```text
┌──────────────────────────────────────────────────────────────────────┐
│ HEADER                                                               │
│  ◆ Smart Reader (Cinzel)      Library · Research · Import            │
│                               [AI ●] [Jobs ²] [Palette] [Settings]   │
├──────────────────────────────────────────────────────────────────────┤
│ TOOLBAR                                                              │
│  ┌────────────────────────────────────────────────┐                  │
│  │ 🔍 Search your library…                        │                  │
│  └────────────────────────────────────────────────┘                  │
│ CHIPS (FilterChips, horizontally scrollable on mobile)               │
│  ( All 34 ) ( Books 12 ) ( Articles 9 ) ( Web 13 ) ( Docs 0 )        │
├──────────────────────────────────────────────────────────────────────┤
│ BOOK GRID (BookGrid → BookCard; grid-cols-2 md:3 xl:5)               │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐         │
│  │▌        │ │▌        │ │▌        │ │▌        │ │▌        │         │
│  │▌ cover  │ │▌ cover  │ │▌ cover  │ │▌ cover  │ │▌ cover  │         │
│  │▌ 3:4    │ │▌        │ │▌        │ │▌        │ │▌        │         │
│  └───────── └───────── └─────────┘ └─────────┘ └─────────┘         │
│   Moby-Dick   The Whale   Seascape    Letters     Field Notes        │
│   Melville    Hoare       —           Keats       —                  │
│   136 ch·14h  ( Article ) ( Web )     12 ch·1h    ⚠ empty_content    │
├──────────────────────────────────────────────────────────────────────┤
│ SELECTION BAR (only in selection mode; animate-slide-up, sticky)     │
│   3 selected           [ Create research collection ]  [ Clear ]     │
└──────────────────────────────────────────────────────────────────────┘
```

**Mobile layout:** header collapses to wordmark + Palette + menu. Primary nav moves to a fixed **bottom bar** (Library · Research · Import). Search sticks under the header on scroll. Grid is 2-column. A `+` FAB sits above the bottom bar. Selection bar docks above the bottom bar.

**Components:** `Layout`, `Header`, `Nav`, `ThemeToggle`, `SearchField`*, `FilterChips`, `BookGrid`, `BookCard`, `SelectionBar`*, `EmptyState`*, `ErrorPanel`*, `ToastRegion`*.

**Primary actions:** search (250ms debounce), filter by content type, open book (→ `/book/:id`), enter selection mode (long-press card / "Select" in header), select ≥2 books → Create research collection (→ `/research`), add a book (→ `/import`), open Jobs modal, open Settings modal, cycle theme.

**States:**
- *Loading:* 8 `BookCard` skeletons (3:4 cover block + two text lines, `animate-pulse`).
- *Empty (library):* centered `BookMarked` xl in `text-faint`, "Your library is empty." + "Add a book to begin reading." + primary **Add a book** + ghost **Load sample library** (vanilla `seedSampleLibrary`).
- *Empty (filtered):* "No books match *{query}*." + **Clear filters** ghost.
- *Error:* inline `ErrorPanel` in the grid region ("Your library couldn't load." + Retry). Toast only if a background refetch fails while stale data is shown.

### §2.2 — Book Details (`/book/:bookId`)

```text
┌──────────────────────────────────────────────────────────────────────┐
│ HEADER  [← Library]                              [Palette] [⋯ menu]  │
├──────────────────────────────────────────────────────────────────────┤
│ HERO                                                                 │
│  ┌──────   MOBY-DICK                          (display / Cinzel)    │
│  │▌cover│   Herman Melville                                          │
│  │▌     │   ( Book ) ( 136 chapters ) ( 215,400 words · ~14 h )      │
│  └──────   [ ▶ Read ]  [ Layers Smart read ]  [ ♻ Synopsis ]        │
├──────────────────────────────────────────────────────────────────────┤
│ SYNOPSIS PANEL (book_representations: SYNOPSIS)                      │
│  "A whaling voyage becomes a meditation on…"   — DERIVED micro-tag   │
│  or: quiet CTA card "No synopsis yet."  [ Generate synopsis ]        │
├────────────────────────────────┬─────────────────────────────────────┤
│ CHAPTERS (lg+ left column)     │ SEMANTIC INTELLIGENCE (right col)   │
│  1. Loomings          12m ○    │  Indexed: 1,204 chunks ● ready      │
│  2. The Carpet-Bag    10m ●    │  ┌───────────────────────────────┐  │
│  3. The Spouter-Inn   14m ○    │  │ Ask this book…            ➤   │  │
│  … (roving tabindex list)      │  └───────────────────────────────┘  │
│  [+ Add chapter]               │  Answer + [Source n] chips render   │
│                                │  below (grounded, cite chunks)      │
│                                │  SUPPORTING MATERIALS (3)           │
│                                │   • Melville biography  [open][✕]   │
│                                │   [+ Attach source]                 │
│                                │  DANGER: [ Delete book ]            │
└────────────────────────────────┴─────────────────────────────────────┘
```

**Mobile:** single column — hero, synopsis, chapters, then semantic panel. Chapter list collapses after 8 rows with "Show all 136".

**Components:** `Header` (with `backTo`), `BookCard` (hero variant), `Badge`*, `ActionButton`*, `SynopsisPanel`*, `ChapterList`* (keyboard-navigable), `SemanticPanel`* (status + Ask form + grounded answers with provenance chips), `SupportingMaterialList`*, `Modal` (via provider: AddChapter, DeleteBookConfirm, SupportingSearch, SupportingReader, AiStatus).

**Primary actions:** **Read** (→ `/read/:bookId/:lastReadOrFirst?rep=original` — always lands on source), **Smart read** (→ `?rep=smart`; generates the book editorial outline on first use), open a chapter, toggle read status (optimistic `PATCH /api/chapters/:id`), ask the book (`POST /api/books/:id/ask`), generate synopsis / book summary, attach & read supporting materials, add a chapter manually, delete the book (confirm modal).

**States:**
- *Loading:* hero skeleton (cover block + 3 lines), 6 chapter-row skeletons, semantic panel shows a checking dot (`animate-pulse-dot`) — never a fake number.
- *Empty:* no chapters → "No chapters were detected." + **Add chapter**; no synopsis → CTA card; semantic index pending → honest status pill "Indexing… {progress}%" from job polling; no supporting materials → single ghost row "+ Attach source".
- *Error:* book fetch fails → full-region `ErrorPanel` + Retry. Ask/summarize failures → inline under the respective panel (never a toast over the answer area). `integrity_status === 'empty_content'` → persistent amber banner (`AlertTriangle`, "This document contained no extractable text.").

### §2.3 — Reader, Original mode (`/read/:bookId/:chapterId?rep=original`)

```text
┌──────────────────────────────────────────────────────────────────────┐
│ ▓▓▓▓▓▓▓▓▓▓ ScrollProgress — 2px accent-ink hairline, full width ▓▓▓  │
├──────────────────────────────────────────────────────────────────────┤
│ TOP BAR (compact, bg-app/85 backdrop-blur, border-b border-line)     │
│  [←]  Moby-Dick · 12. Biographical    [ Original │ Smart ]  [Aa] [☰] │
│                                           ↑ segmented radiogroup     │
├───────────────┬──────────────────────────────────────────────────────┤
│ CHAPTER RAIL  │            CANVAS  <article>  max-w-[34em]           │
│ (lg+, 240px,  │   SOURCE · IMMUTABLE              (micro, faint)     │
│  collapsible, │                                                      │
│  no accent)   │   Chapter 12 — Biographical        (display/Cinzel)  │
│               │   2,431 words · ~10 min            (caption, muted)  │
│   10. …       │   ─────────────────────────                          │
│   11. …       │                                                      │
│  ▸12. Biogr.  │   Lora 19px / 1.75, paragraphs, headings, quotes,    │
│   13. …       │   lists, code, separators, callouts — canonical      │
│               │   blocks, each wrapped id="blk-{chapterId}-{i}"      │
│               │                                                      │
│               │   Plain paper. Zero accent chrome. No inline UI.     │
├───────────────┴──────────────────────────────────────────────────────┤
│ FOOT NAV (sticky bottom on mobile, static on desktop, min-h 44px)    │
│   [ ← Prev ]          Chapter 12 of 136 · 68% of book    [ Next → ]  │
└──────────────────────────────────────────────────────────────────────┘
```

**Mobile:** rail becomes a bottom sheet via `[☰]`; top bar title truncates; foot nav sticky with 44px targets; `Aa` popover offers reading size (16–22), align, and a theme shortcut (sepia one tap away — the preferred reading theme).

**Components:** `Layout` (mode="reader"), `Header` (compact), `ScrollProgress`, `ChapterRail`*, `CanonicalBlock`* renderer under `prose-reader`, `ChapterNav`, `ReaderSettingsPopover`* (`Aa`).

**Primary actions:** read; prev/next chapter (buttons, keys `←`/`→`); jump via rail; toggle to Smart (`m` or segmented control); adjust typography; mark chapter read; back to book details.

**States:**
- *Loading:* first load → canvas skeleton (title block + 6 paragraph shapes). Chapter-to-chapter → **previous chapter remains, dimmed to 60%**, with a 2px top hairline. `keepPreviousData` means text is never replaced by a spinner.
- *Empty:* chapter has no `canonical_content` → render raw `content` as plain paragraphs (source of truth still shown). Zero-word chapter → "This chapter is empty in the source."
- *Error:* chapter fetch fails → centered card in the canvas region: "This chapter couldn't load." + Retry (does not clear the rail, so the user can jump elsewhere).

### §2.4 — Reader, Smart mode (`/read/:bookId/:chapterId?rep=smart`)

```text
┌──────────────────────────────────────────────────────────────────────┐
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ScrollProgress (accent) ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓   │
├──────────────────────────────────────────────────────────────────────┤
│ TOP BAR                                                              │
│  [←]  Moby-Dick · Smart reading   [ Original │ Smart ]  ⟳ 2/5  [Aa]  │
│                                                 (progress chip       │
│                                                  while busy)         │
├──────────────┬─────────────────────────────┬─────────────────────────┤
│ SMART LIST   │ SOURCE PANE (xl ≥1280 only) │ LENS PANE               │
│ (240px)      │ original chapter, read-only │ ▌DERIVED · TRACEABLE    │
│              │ chrome; text at full clarity│ ▌(micro-label + 2px     │
│ 1 Origins ✓  │                             │ ▌ accent left rail)     │
│ 2 The Hunt ✓ │                             │ ▌                       │
│▸3 Legacy  ✓  │   Chapter 12 — Biographical │ ▌ 3. The Legacy of the  │
│ 4 Myth    ◌──┤   …                         │ ▌    Whale              │
│ 5 Canon   ◌  │   …                         │ ▌                       │
│              │                             │ ▌  para … para ↗¹ …     │
│ ──────────   │   ┌─────────────────────┐   │ ▌  para … para ↗² …     │
│ GENERATE     │   │ blk-c12-42 flash:   │   │ ▌                       │
│ MORE         │   │ accent-wash 1.6s    │◄──┼─┤ ¹ provenance links    │
│ [+1][+3]     │   └─────────────────────┘   │ ▌   on derived paras    │
│ [+5][+10]    │                             │ ▌                       │
│ ═══════▌──   │   (provenance click scrolls │ ▌  [ Quote blocks cite  │
│ 2 of 5 done  │    this pane + flashes)     │ ▌    source inline ]    │
├──────────────┴─────────────────────────────┴─────────────────────────┤
│ FOOT NAV   [ ← Prev ]    Lens chapter 3 of 5 generated   [ Next → ]  │
└──────────────────────────────────────────────────────────────────────┘
```

**Mobile / <1280px:** single pane = the lens. The source pane does not exist at this width; provenance taps route to Original view — that *is* the click-through (§3.3). The smart list opens as a bottom sheet from the list icon. `GenerateMoreButtons` live at the sheet's foot and inline after the last generated chapter.

**Components:** `ReaderView` (mode="smart"), `SmartChapterList`, `GenerateMoreButtons`, `ProgressBar`*, `ProvenanceLink`, `SourcePane`* (reuses the Original canvas renderer — one renderer, two hosts), `DerivedBadge`*, `ScrollProgress`, `ChapterNav`.

**Primary actions:** select a generated lens chapter; generate more (`+1/+3/+5/+10`); click a provenance link → jump to source; toggle back to Original; regenerate outline (top-bar overflow, confirm modal — marks stale representations per backend); read the source pane (xl) independently.

**States:**
- *Empty (no outline yet):* the screen that teaches the moat. Centered `Feather` xl, "Smart reading is a derived lens." + one quiet paragraph: "Chapters written *from* the source, every line traceable back to it. The original is never modified." + primary **Begin Smart reading** (generates outline + first chapter) + caption/muted note: "Without a configured AI provider, a deterministic outline is used." (per the backend graceful fallback, ARCHITECTURE_AUDIT §Section F).
- *Loading:* per-chapter skeleton inside the lens pane (rail line + 5 paragraph shapes) + honest aggregate progress. Queued chapters show a status dot; generating chapters show `animate-pulse-dot` + per-job percent.
- *Streaming:* as each chapter completes it fades in (4px rise, staggered) and becomes selectable immediately — reading is never blocked by the rest of the queue.
- *Error:* chapter-level failure → red status chip on that row + inline "Generation failed." + Retry (extract-fallback note if the backend returned structured extracts). Outline failure → region `ErrorPanel` + Retry, keeping the empty-state copy visible. **When the backend falls back to structured extracts, an honest caption appears: "Structured extract — model unavailable."** Origin: D.

### §2.5 — Ingestion / Import (`/import`)

```text
┌──────────────────────────────────────────────────────────────────────┐
│ HEADER  [←]  Add to library                                          │
├──────────────────────────────────────────────────────────────────────┤
│ TABS   ( FileText File )  ( Globe From the web )  ( Clipboard Paste ) │
├──────────────────────────────────────────────────────────────────────┤
│ FILE TAB                                                             │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                        IMPORT DROPZONE                         │  │
│  │                    ⬆  (lg, text-faint)                         │  │
│  │              Drag a file here, or  browse                      │  │
│  │              TXT · EPUB · PDF · HTML · Markdown   (caption)    │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  PIPELINE (PipelineStepper — real processing_jobs progress)          │
│   (1 Upload ✓)──(2 Parse ✓)──(3 Chapters ◐ 62%)──(4 Index ○)         │
│   ═══════════════════▌─────────────────  Overall 62%                 │
│   step captions from job type/status — never setTimeout theatre      │
│                                                                      │
│  RESULT CARD (on success)                                            │
│   ✓ "Moby-Dick" added · 136 chapters · indexed 1,204 chunks          │
│   [ Open book ]  [ Add another ]                                     │
├──────────────────────────────────────────────────────────────────────┤
│ WEB TAB:  search input + category chips (data-cat) → result cards    │
│           with checkbox + preview link → sticky bar                  │
│           "Import 3 selected"                                        │
│ PASTE TAB: title / author / content(textarea) → [ Add to library ]   │
└──────────────────────────────────────────────────────────────────────┘
```

**Components:** `ImportDropzone`, `TabBar`*, `PipelineStepper`*, `ProgressBar`*, `WebSearchPanel`* (SearchField, `FilterChips`, result cards), `SelectionBar`*, `PasteForm`*, `ResultCard`*, `Modal` host for the quick-add variant (see §5.1).

**Primary actions:** drop or browse a file (`POST /api/books/import` FormData); run a web search (`GET /api/web/search`); preview a source; select multiple web sources → import (`POST /api/web/import-multi`); paste raw text → import; open the resulting book; watch real progress; open the Jobs modal for background detail.

**States:**
- *Empty:* the dropzone **is** the empty state — nothing else on screen until a file, query, or paste exists. Web tab starts with a quiet prompt ("Search the web for articles and documents.").
- *Loading:* stepper with per-step state from `processing_jobs` (PENDING ○ / PROCESSING ◐ + % / COMPLETED ✓ / FAILED ✕) + overall bar; import button shows a 16px spinner and disables; web results use 3 card skeletons.
- *Error:* the failed step turns `--status-error` with the job's `error` message in a `<details>` disclosure; primary action **Try again** (resubmits); toast only if the failure happened while the user navigated away. `integrity_status: 'empty_content'` → amber result card: "Imported, but no text was found in this file."
- *Success:* result card with quiet `Check`, counts, **Open book** (primary) / **Add another** (ghost). Library query invalidated so the grid is warm on return.

### §2.6 — Research Collection (`/research`, `/research/:outlineId`)

```text
┌──────────────────────────────────────────────────────────────────────┐
│ HEADER  [←]  Research · "Melville and the Sea"     [Regenerate] [⋯]   │
├──────────────────────────────────────────────────────────────────────┤
│ SOURCE STRIP:  [▌Moby-Dick ✕]  [▌The Whale ✕]  [+ Add sources]        │
├──────────────────────────────────────────────────────────────────────┤
│ TABS   ( Editorial )  ( Sources )  ( Compare )                        │
├────────────────────────────┬─────────────────────────────────────────┤
│ EDITORIAL CHAPTERS         │ CHAPTER CANVAS                          │
│ (SmartChapterList variant) │  ▌DERIVED FROM 3 SOURCES   (micro)      │
│  1. Origins        ✓       │  ▌                                      │
│ ▸2. The Hunt       ✓       │  ▌ 2. The Hunt                          │
│  3. Legacy         ◐ 40%   │  ▌ …paragraph … ↗[S1: Moby-Dick >       │
│  4. Reception      ◌       │  ▌            Ch.36 > The Quarter-Deck] │
│  ─────────────             │  ▌ …paragraph … ↗[S2: The Whale > p.4]  │
│  GENERATE MORE             │  ▌                                      │
│  [+1][+3][+5][+10]         │  PROVENANCE DRAWER (expandable, bottom) │
│  ══════▌────  2 of 4       │  ▲ 6 source sections for this chapter   │
│                            │   • [Source 1] Moby-Dick > Ch.36 > …  ↗ │
│                            │   • [Source 2] The Whale > §4 > …     ↗ │
├────────────────────────────┴─────────────────────────────────────────┤
│ SOURCES TAB: grid of source BookCards + [ View original book ] each  │
│ COMPARE TAB:  cross-source question input → grounded answer with     │
│               [Source n] chips (queryCrossSource) + provenance ↗     │
└──────────────────────────────────────────────────────────────────────┘
```

**Mobile:** tabs become a segmented control under the source strip; editorial list is a bottom sheet; canvas full-width; provenance drawer is a full-height sheet.

**Components:** `CollectionHeader`*, `SourceChips`*, `TabBar`*, `SmartChapterList` (multi-source variant — provenance carries `bookId`), `GenerateMoreButtons`, `ProvenanceLink`, `ProvenanceDrawer`*, chapter canvas (same CanonicalBlock renderer), `ComparePanel`*, `BookGrid`/`BookCard` (Sources tab), `Modal` (DeleteOutline confirm, RegenerateConfirm).

**Primary actions:** generate/regenerate the outline (fast vs deep choice in the confirm modal — maps to the backend `fast` flag and provider mode); select an editorial chapter (auto-synthesizes on first open, per vanilla `selectEditorialChapter`); generate more (`+1/+3/+5/+10`); expand the provenance drawer; jump to any source position (→ `/read/:bookId/:chapterId?rep=original#blk-…`); run a cross-source comparison query; add/remove sources; view an original book; delete the outline.

**States:**
- *Empty (no collection):* quiet hero — `FolderSearch` xl, "Research collections read across books." + "Select two or more books in your library to begin." + **Go to library**.
- *Empty (outline not generated):* source strip + primary **Generate outline** + the same derived-lens explanation as §2.4's empty state, plus the deterministic-fallback note.
- *Loading:* chapter-list skeletons; canvas shows per-chapter skeleton + honest progress; Compare answers show three pulsing dots (`animate-pulse-dot`, no spinner over text).
- *Error:* outline failure → region `ErrorPanel` + Retry + fallback note; chapter failure → row chip + inline retry; compare failure → inline under the input, input preserved.

<!-- END: screens -->

---

<!-- BEGIN: interaction-model -->

## §3 — Smart Reader Interaction Model

### §3.1 — Original ↔ Smart toggle

The single most consequential control in the app. Every rule below exists to make the two-representation invariant **felt in the fingers**.

**Position.** Reader top bar, right-of-center — a two-item segmented control (`role="radiogroup"`, `aria-label="Reading representation"`): `[ BookOpenText Original │ Layers Smart ]`. Same slot on every breakpoint. On mobile it shrinks to icons + a `micro` label under the active item. It is the only accent-bearing control in Original mode, and the only paper-colored control in Smart mode — **the toggle itself teaches the invariant.**

**Behavior.** Switching is a route-level URL change (`?rep=original|smart`) within the same `ReaderView`. The canvas crossfades at `--dur-base` (`animate-fade-in`). The active chapter mapping is preserved: Original shows `:chapterId`; Smart shows the active lens chapter, defaulting to the one whose provenance contains the current source chapter.

**Keyboard.** `m` toggles (when no editable field is focused); arrow keys inside the radiogroup move selection per the WAI-ARIA radio pattern.

**Persistence (three layers, in priority order):**

1. **URL is truth** — `?rep=` wins on every load. Back/forward and shared links are faithful.
2. **Per-book memory** — zustand `persist` store `sr.reader.prefs` → `{ repModeByBook: { [bookId]: 'original' | 'smart' }, fontSize, align }`. Seeds the URL when a book is opened without `?rep=`.
3. **Global default = `original`** — a book always opens on the source unless the reader explicitly chose the lens for *that book* before. Landing on source is a product principle: the immutable original is the home position.

### §3.2 — Progressive generation (`+1 / +3 / +5 / +10`)

The Smart lens is generated **chapter by chapter, on demand, in reading order** — never all at once, never before the reader asks.

**Model.** The outline (from `POST /api/books/:id/editorial` or `POST /api/synthesis/outline` for collections) plans N derived chapters. Each has status `not-generated → queued → generating → ready | failed`. `GenerateMoreButtons` enqueues the next `n` ungenerated chapters (`n ∈ {1,3,5,10}`, capped at `remaining`; buttons beyond `remaining` disable with `title="Only {remaining} left"`). Each queued chapter fires `POST …/synthesize`, tracked server-side in `processing_jobs`.

**Live progress.** While any job is active, React Query polls the job list (`refetchInterval: 1500ms`, stops when all settle). The aggregate bar shows `done/total` of the *current queue*; the overall bar sits beneath it (`2 of 5 chapters`). The top bar condenses this to a progress chip (`⟳ 2/5`). **All numbers come from `processing_jobs.progress` — see §8.1. There are no simulated steps anywhere.**

**Streaming chapters.** "Streaming" means **chapter-granular arrival**, not token-level SSE.

> **ASSUMPTION.** The documented synthesis endpoints return a complete representation per chapter (no streaming transport in the audited API). Each chapter that reaches `COMPLETED` invalidates its representation query, fades into the list, and becomes immediately readable while the rest of the queue keeps working. The lens pane of the *active* chapter swaps skeleton → text in place, with scroll position preserved.

**Interruption & recovery.** "Stop" cancels the remaining queue (in-flight server jobs finish; their results are kept — generation is idempotent per chapter). Origin: E (Qwen 3.8 Max) — the only blueprint to specify `AbortController` explicitly. Because status is job-backed, a page refresh mid-generation resumes the exact progress view; nothing is lost or faked.

**Failure isolation.** A failed chapter is a red chip + Retry on its row; the queue continues past it. The backend's extract fallback (ARCHITECTURE_AUDIT §Section F) is surfaced honestly: caption "Structured extract — model unavailable."

### §3.3 — Provenance click-through (Smart line → source position)

The moat, made physical: every derived paragraph carries a `ProvenanceLink`; activating it lands the reader on the **exact immutable source span**.

**Anchor ID scheme.** Stable because the source is immutable.

| Surface | Element | ID | Notes |
|---|---|---|---|
| Original canvas | every canonical block wrapper | `blk-{chapterId}-{blockIndex}` | `blockIndex` = position in `chapters.canonical_content` — an immutable JSON array, so IDs are permanent and safe in shared URLs |
| Original canvas | heading blocks (additionally) | `h-{chapterId}-{slug(title)}` | Human-readable deep links / TOC |
| Lens pane | every derived block | `sblk-{representationId}-{blockIndex}` | Return-jump targets (source → back to lens position) |
| Research canvas | same as lens, multi-book | `sblk-{representationId}-{blockIndex}` | Jump target includes `bookId` from the provenance ref |

Origin: F (Qwen auto). E's scheme (`o-{chapterId}-b{n}`) is close but lacks a symmetric smart-side anchor; F's `blk-` / `sblk-` pairing solves the round-trip cleanly. **The prefix naming is preserved.**

**Provenance payload.** Synthesized representations store `metadata_json.provenance` — an array of chunk references (ARCHITECTURE_AUDIT Q19). The frontend consumes it as:

```ts
interface ProvenanceRef {
  chunkId: string; bookId: string; bookTitle: string;
  chapterId: string; chapterTitle?: string; sectionHeading?: string;
  blockStart: number; blockEnd: number;   // canonical block indices in the source chapter
}
```

> **ASSUMPTION.** `blockStart` / `blockEnd` are derivable server-side from the chunk's `chapter_id` + `sequence`. If the API only yields `chunkId`, the frontend resolves it via a chunk lookup (`GET /api/chunks/:id` → `{ chapterId, blockStart }`); failing that, it degrades gracefully to `h-{chapterId}-{slug(sectionHeading)}`, then to chapter top. The UI never dead-ends.

**Interaction flow:**

1. **Affordance.** In the lens pane, derived paragraphs end with a superscript `↗` (`ArrowUpRight`, 14px, `text-accent-ink`, dotted underline on hover). The provenance drawer lists full `[Source n] Book > Chapter > Section` references in mono/caption. Both are real `<button>`s — keyboard reachable, `focus-visible` ring.
2. **Two-pane (≥1280px, Smart).** Click → the source pane loads/scrolls the target chapter, then `document.getElementById('blk-…').scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })`, applies `.provenance-flash` (accent-wash background fading over 1.6s; reduced-motion → static 2px accent outline for 3s), moves focus to the anchor (`tabIndex={-1}`), and announces via `role="status"`: "Jumped to source — Chapter 12, section ‘Biographical'." The lens pane keeps its scroll position; the reader is never lost.
3. **Single-pane (mobile / Original-hosted Smart).** Click → `router.navigate('/read/{bookId}/{chapterId}?rep=original&from=smart#blk-{chapterId}-{blockStart}')`. `ReaderView` runs a post-render effect (`useLayoutEffect` + double `requestAnimationFrame`, after canonical blocks mount) that resolves `location.hash`, scrolls with the same behavior/flash/focus rules, then `history.replaceState` keeps the hash canonical. The smart scroll offset was stored (keyed by `sblk` id) before navigating, so **browser Back restores the exact lens position** — the round-trip Source ↔ Lens is a first-class navigation loop. Origin: C (Claude Sonnet 5) — the only blueprint to name the round-trip as a design principle. F independently adds the `sblk-` target that makes it work.
4. **Copy link.** Every anchor is URL-shareable (`…?rep=original#blk-c12-42`); a "Copy link to source" item sits in the provenance drawer.

### §3.4 — State and persistence map

All persistence flows through `zustand persist`, namespaced under `sr.`. Nothing else writes to localStorage. This is the full map.

| Key | Shape | Feeds |
|---|---|---|
| `sr.theme` | `'default' \| 'warm' \| 'dark' \| 'glass'` | `data-theme` on `<html>` |
| `sr.reader.prefs` | `{ repModeByBook: Record<string, 'original' \| 'smart'>, fontSize: number (16–22), align: 'left' \| 'justify' }` | Toggle default, `Aa` popover |
| `sr.progress` | `{ lastRead: { bookId, chapterId }, scrollByChapter: Record<string, number> }` | Resume reading, scroll restore (§8.5) |
| `sr.onboarding` | `{ aiModeChosen: boolean }` | Gates the first-run `AiSelectionModal` |

Server state is owned entirely by React Query: books, chapters, representations, outlines, jobs, semantic status. The UI is always a projection of real state, never of `innerHTML` string building. Cache invalidation on mutation success is the contract: `invalidateQueries(['books'])` after import, `['representations', id]` after synthesis, `['jobs']` while any job is active.

No other persistence. No session cookies, no IndexedDB, no additional localStorage keys without a documented update to this section.

<!-- END: interaction-model -->
