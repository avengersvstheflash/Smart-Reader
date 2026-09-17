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