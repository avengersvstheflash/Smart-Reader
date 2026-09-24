# FRONTEND_BLUEPRINT_SPEC.md

> **Engineering contract.** This is the authoritative source for prop shapes, token values, Tailwind configuration, and accessibility requirements. For the *why* — the thesis, the three laws, the market reasoning, the screen wireframes — see [`FRONTEND_BLUEPRINT.md`](./FRONTEND_BLUEPRINT.md).
>
> **Division of authority.** Philosophy and visual language: public doc wins. Prop shapes and config: this doc wins. Where both touch the same topic (§3.3 anchor scheme, §6 tokens), they must stay in sync — grep both filenames for the term when editing.
>
> **Modular document.** Every section is wrapped in `<!-- BEGIN: x -->` / `<!-- END: x -->` markers. Replace a section by finding its marker pair, swapping the block, restoring the markers, and committing with `spec(<section>): <summary>`. Antigravity reads markers as comments and ignores them; they exist for surgical diffs.
>
> **Authoritative inputs:** `docs/ARCHITECTURE_AUDIT.md` (= `docs/FRONTEND_ARCHITECTURE.md`), the three `architecture-*.md` extraction reports, and the six source blueprints referenced in `docs/BLUEPRINT_COMPARISON.md`.

**Allowed runtime dependencies (no others):** `react-router-dom`, `zustand`, `@tanstack/react-query`, `lucide-react`, `@tailwindcss/typography`.

---

<!-- BEGIN: spec-meta -->

## §S.0 — How This Spec Relates to the Public Blueprint

| Topic | Public doc (`FRONTEND_BLUEPRINT.md`) | This spec (`FRONTEND_BLUEPRINT_SPEC.md`) |
|---|---|---|
| §0 Invariants | Full | Cross-referenced only |
| §1 Visual Language | Full | Token values mirrored in §S.6 |
| §2 Screens | Full | Not duplicated |
| §3 Interaction Model | Full | Cross-referenced |
| §4 Component APIs | Bullet summary | **Full prop tables (authoritative)** |
| §5 Interaction Patterns | Bullet summary | Cross-referenced |
| §6 Tailwind Config | Partial | **Full config + CSS (authoritative)** |
| §7 Accessibility | Short | **Full baseline (authoritative)** |
| §8 Migration Improvements | Bullets | **Full justifications (authoritative)** |

**Rule for scaffold phase:** Antigravity reads this file plus `docs/ARCHITECTURE_AUDIT.md`. It does not need the public doc to scaffold. The public doc is for humans.

<!-- END: spec-meta -->

---

<!-- BEGIN: component-apis -->

## §S.4 — Component API Drafts

TypeScript-flavored notation. `LucideIcon` = `import('lucide-react').LucideIcon`. Every store hook (`useReaderStore`, `useThemeStore`, `useModalStore`, `useUIStore`) is **zustand**; props below remain the public contract regardless of internal store access. Auxiliary components (marked `*`) are extracted from the vanilla source but not in the 15 named by the brief — documented here because they carry shared behavior.

### §S.4.0 — Shared Domain Types

```ts
type Theme    = 'default' | 'warm' | 'dark' | 'glass';
type RepMode  = 'original' | 'smart';
type JobState = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

interface Book {
  id: string;
  title: string;
  author?: string;
  contentType: string;
  chapterCount: number;
  wordCount?: number;
  integrityStatus?: 'ok' | 'empty_content';
}

interface Chapter {
  id: string;
  number: number;
  title: string;
  wordCount: number;
  status: 'unread' | 'reading' | 'read';
}

interface CanonicalBlock {
  type: 'paragraph' | 'heading' | 'quote' | 'list' | 'code'
      | 'separator' | 'callout' | 'table';
  [key: string]: unknown;
}

interface ProvenanceRef {
  chunkId: string;
  bookId: string;
  bookTitle: string;
  chapterId: string;
  chapterTitle?: string;
  sectionHeading?: string;
  blockStart: number;
  blockEnd: number;
}

interface SmartChapter {
  id: string;
  outlineId: string;
  title: string;
  order: number;
  status: 'not-generated' | 'queued' | 'generating' | 'ready' | 'failed';
  progress?: number;
  representationId?: string;
}
```

### §S.4.1 — `Layout`

App shell: `Header` + `Nav` + scroll-restoring `<main>` + host layers (`ModalHost`, `ToastRegion`, skip link). Reads the theme store and sets `data-theme` on `document.documentElement`.

| Prop | Type | Req | Default |
|---|---|---|---|
| `mode` | `'app' \| 'reader'` | no | `'app'` |
| `children` | `ReactNode` | no | `<Outlet/>` |

**Events:** none. **Notes:** `mode="reader"` hides `Nav`, renders the compact header variant, disables page-level `max-w-6xl` so the reader controls its own measure. Skip link is first focusable in both modes. Owns the `<ScrollProgress>` mounting point in reader mode.

### §S.4.2 — `Header`

Sticky top bar: wordmark/back, title, contextual slot, status cluster, utility buttons.

| Prop | Type | Req | Default |
|---|---|---|---|
| `title` | `ReactNode` | no | app wordmark (Cinzel) |
| `backTo` | `string \| null` | no | `null` |
| `contextual` | `ReactNode` | no | `null` — right-of-center slot (reader hosts `ModeToggle`) |
| `compact` | `boolean` | no | `false` |
| `onBack` | `() => void` | no | `router.navigate(backTo ?? -1)` |

**Events:** `onBack`. **Notes:** `bg-app/85 backdrop-blur border-b border-line`; glass theme uses `--glass-blur`. Jobs badge count from polled jobs query — single source, no prop drilling. Height 56px desktop / 52px mobile. Title truncates with `truncate`, full text in `title` attr.

### §S.4.3 — `Nav`

Primary navigation: desktop = inline in header; mobile = fixed bottom bar (hidden in reader mode).

| Prop | Type | Req | Default |
|---|---|---|---|
| `items` | `NavItem[]` | no | `[Library, Research, Import]` |
| `orientation` | `'horizontal' \| 'vertical'` | no | breakpoint-derived |

`NavItem = { to: string; label: string; icon: LucideIcon; badge?: number; end?: boolean }`

**Events:** none — items are `<NavLink>`s; active styling via `aria-current="page"`. **Notes:** mobile bar `pb-[env(safe-area-inset-bottom)]`, 44px targets, `bg-card border-t border-line` (glass: frosted). Never more than 4 items.

### §S.4.4 — `ThemeToggle`

Four-way theme chooser (popover with labeled swatches; cycles on click when popover dismissed).

| Prop | Type | Req | Default |
|---|---|---|---|
| `value` | `Theme` | no | store (`sr.theme`) |
| `themes` | `Theme[]` | no | `['default','warm','dark','glass']` |
| `onChange` | `(t: Theme) => void` | no | store setter |

**Events:** `onChange`. **Notes:** trigger = `Palette` (md). Popover = `role="radiogroup"` with 4 `role="radio"` rows: swatch + label (**Paper / Sepia / Night / Glass**). Arrow keys move; `Esc` closes and restores focus. First visit with no stored theme: respect `prefers-color-scheme: dark`. Theme crossfade per §1.4.

### §S.4.5 — `BookCard`

Shelf card: cover area (spine gradient from title hash), title, author, meta line, optional selection checkbox.

| Prop | Type | Req | Default |
|---|---|---|---|
| `book` | `Book` | **yes** | — |
| `selected` | `boolean` | no | `false` |
| `selectionMode` | `boolean` | no | `false` |
| `onSelect` | `(id: string) => void` | no | no-op |
| `onOpen` | `(id: string) => void` | no | `navigate('/book/'+id)` |
| `variant` | `'grid' \| 'hero' \| 'row'` | no | `'grid'` |
| `footer` | `ReactNode` | no | meta line (`{chapterCount} ch · {readingTime}`) |

**Events:** `onOpen` (card click / Enter), `onSelect` (checkbox change). **Notes:** `<article>` containing a stretched `<Link>` + sibling checkbox — no nested interactive elements. `aspect-[3/4]` cover, `rounded-md`, `border border-line`, `bg-card`. Hover: `-translate-y-0.5 shadow-md border-line-strong` 150ms, `motion-reduce:` disabled. `integrityStatus === 'empty_content'` → amber `AlertTriangle` badge + text (never color-only). Reading time at ~200 wpm (wpm constant centralized in one util).

### §S.4.6 — `BookGrid`

Responsive grid + all aggregate states for Library and Research/Sources lists.

| Prop | Type | Req | Default |
|---|---|---|---|
| `books` | `Book[]` | **yes** | — |
| `loading` | `boolean` | no | `false` |
| `error` | `Error \| null` | no | `null` |
| `onRetry` | `() => void` | no | required when `error` set |
| `selectionMode` | `boolean` | no | `false` |
| `selectedIds` | `string[]` | no | `[]` |
| `onSelect` | `(id: string) => void` | no | no-op |
| `emptyState` | `ReactNode` | no | built-in |

**Events:** `onRetry`, `onSelect`. **Notes:** `grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4`. `loading` → 8 `BookCardSkeleton`s. Distinguishes first-load (skeletons) from background refetch (top hairline, content stays).

### §S.4.7 — `FilterChips`

Chip row for content-type filters (Library) and web categories (Import/Research).

| Prop | Type | Req | Default |
|---|---|---|---|
| `options` | `{ value: string; label: string; count?: number }[]` | **yes** | — |
| `value` | `string \| string[]` | **yes** | — |
| `onChange` | `(v: string \| string[]) => void` | **yes** | — |
| `multiple` | `boolean` | no | `false` |
| `size` | `'sm' \| 'md'` | no | `'sm'` |

**Events:** `onChange`. **Notes:** buttons with `aria-pressed`; single-select always includes a reset ("All"). Selected: `bg-brand text-white` in Original-side chrome; `bg-accent-wash text-accent-ink border-accent` in derived/research contexts. Mobile: `overflow-x-auto` + edge fade; 44px min height. Counts in `caption text-faint`.

### §S.4.8 — `ReaderView`

Reader itself. Owns data fetching (chapter + representations + outline), mode switch, both canvases, two-pane split.

| Prop | Type | Req | Default |
|---|---|---|---|
| `bookId` | `string` | **yes** | — |
| `chapterId` | `string` | **yes** | — |
| `mode` | `RepMode` | **yes** | — (from `?rep=` / prefs) |
| `onModeChange` | `(m: RepMode) => void` | **yes** | — |
| `fontSize` | `number` (16–22) | no | store or `18` |
| `align` | `'left' \| 'justify'` | no | store or `'left'` |
| `onChapterChange` | `(chapterId: string) => void` | no | router push |

**Events:** `onModeChange`, `onChapterChange`, `onFontSizeChange(n)`, `onAlignChange(a)`. **Notes:** window-level scrolling (mobile URL-hash friendly). Canonical blocks render under `prose-reader` with wrappers `id="blk-{chapterId}-{i}"`. Smart mode at `xl` renders `grid-cols-[240px_minmax(0,1fr)_minmax(0,1fr)]`; below `xl`, lens-only + toggle. Hash-driven provenance jumps handled by post-render effect (§3.3). Chapter switches keep previous content at 60% opacity (`keepPreviousData`) — never a spinner over text. Sets `--reading-size` on its root.

### §S.4.9 — `ChapterNav`

Footer navigation: prev/next + position readout; hosts the chapter jumper.

| Prop | Type | Req | Default |
|---|---|---|---|
| `chapters` | `Chapter[]` or `SmartChapter[]` | **yes** | — |
| `currentId` | `string` | **yes** | — |
| `onNavigate` | `(chapterId: string) => void` | **yes** | — |
| `positionLabel` | `string` | no | computed `"Chapter {n} of {m}"` |
| `compact` | `boolean` | no | `false` |

**Events:** `onNavigate`. **Notes:** disabled ends (`aria-disabled`, `text-faint`, no navigation). Mobile: sticky bottom, `min-h-[44px]` targets, `pb-[env(safe-area-inset-bottom)]`. Desktop center readout doubles as jumper trigger → popover listbox with roving tabindex, type-ahead, `aria-current="true"`. Keyboard `←`/`→` handled at `ReaderView` level, not here.

### §S.4.10 — `ScrollProgress`

Hairline reading progress (2px), pinned under the header.

| Prop | Type | Req | Default |
|---|---|---|---|
| `container` | `'window' \| RefObject<HTMLElement>` | no | `'window'` |
| `height` | `number` (px) | no | `2` |
| `tone` | `'accent' \| 'brand'` | no | `'accent'` |

**Events:** none. **Notes:** passive scroll listener + `requestAnimationFrame` coalescing; direct width writes (no transition — the number *is* the animation). `aria-hidden="true"` — duplicates the `ChapterNav` readout which carries accessible text. Hidden when content shorter than viewport.

### §S.4.11 — `SmartChapterList`

Derived-chapter rail: statuses, progress, generation controls, keyboard navigation.

| Prop | Type | Req | Default |
|---|---|---|---|
| `chapters` | `SmartChapter[]` | **yes** | — |
| `activeId` | `string \| null` | no | `null` |
| `onSelect` | `(c: SmartChapter) => void` | **yes** | — |
| `onGenerateMore` | `(n: number) => void` | **yes** | — |
| `remaining` | `number` | **yes** | — |
| `queue` | `{ active, done, total, currentTitle? } \| null` | no | `null` |
| `multiSource` | `boolean` | no | `false` |

**Events:** `onSelect`, `onGenerateMore`, `onStopQueue()`, `onRetry(chapterId)`. **Notes:** `role="listbox"` + roving tabindex, `aria-current` on active. Status vocabulary: `✓ ready` / `◐ generating {pct}%` (`animate-pulse-dot`) / `○ queued` / `✕ failed — Retry`. Aggregate `role="progressbar"` above `GenerateMoreButtons`. Newly ready chapters fade in; auto-scroll only if list was at bottom (`motion-safe` only). Accent-wash tint on rail background — the list is derived-chrome.

### §S.4.12 — `GenerateMoreButtons`

The progressive-generation control: `+1 +3 +5 +10`.

| Prop | Type | Req | Default |
|---|---|---|---|
| `remaining` | `number` | **yes** | — |
| `onGenerate` | `(n: number) => void` | **yes** | — |
| `counts` | `number[]` | no | `[1, 3, 5, 10]` |
| `busy` | `boolean` | no | `false` |
| `disabled` | `boolean` | no | `false` |

**Events:** `onGenerate(n)`. **Notes:** `+1` is primary (`bg-brand text-white`), the rest quiet ghosts (`border-line hover:bg-subtle`). Buttons with `n > remaining` disable with `title="Only {remaining} left"`. While `busy`: `aria-busy="true"`, buttons disable, a `Stop` ghost button appears beside them (cancels remaining queue via `AbortController`). Group label (sr-only + visible caption): "Generate more chapters".

### §S.4.13 — `ProvenanceLink`

The click-through from derived text to immutable source (inline `↗`, drawer row, or chip).

| Prop | Type | Req | Default |
|---|---|---|---|
| `provenance` | `ProvenanceRef` | **yes** | — |
| `variant` | `'inline' \| 'drawer' \| 'chip'` | no | `'inline'` |
| `label` | `string` | no | `"View source"` (sr-only for inline) |
| `onJump` | `(p: ProvenanceRef) => void` | no | from `ProvenanceContext` |

**Events:** `onJump(provenance)`. **Notes:** `inline` = superscript `ArrowUpRight` (14px, `strokeWidth 2`, `text-accent-ink`), dotted underline on hover — a footnote, not a button-shaped button. `drawer` = full row: `[S1]` mono tag + `Book > Chapter > Section` (caption) + jump icon. `chip` = compact source tag used in Compare answers. Always a real `<button>`; `aria-label` composes the full reference (*"View source: Moby-Dick, Chapter 12, section Biographical"*). Flash + focus behavior lives in the jump handler, not here.

### §S.4.14 — `Modal`

One shell for all 11 legacy dialogs: portal, trap, escape, scroll-lock, sheet-on-mobile.

| Prop | Type | Req | Default |
|---|---|---|---|
| `open` | `boolean` | **yes** | — |
| `onClose` | `(reason: 'esc' \| 'backdrop' \| 'action') => void` | **yes** | — |
| `title` | `string` | **yes** | — |
| `description` | `string` | no | — (wires `aria-describedby`) |
| `size` | `'sm' \| 'md' \| 'lg'` | no | `'md'` → 400 / 560 / 720px |
| `footer` | `ReactNode` | no | `null` |
| `initialFocus` | `RefObject<HTMLElement> \| string` | no | first focusable |
| `closeOnBackdrop` | `boolean` | no | `true` |
| `closeOnEsc` | `boolean` | no | `true` |
| `danger` | `boolean` | no | `false` |

**Events:** `onClose(reason)`; content components receive `close()` from `ModalHost`. **Notes:** portal on `document.body`; `role="dialog"` `aria-modal="true"` `aria-labelledby`. Focus trap via sentinel nodes (no dependency). Focus restores to the opener element on close. Body scroll locked with `scrollbar-gutter` compensation. Enter `animate-modal-in` (220ms); exit 150ms; reduced-motion → 100ms opacity only. Mobile (<640px): bottom sheet (`animate-sheet-up`, `rounded-t-lg`, drag handle, `max-h-[85dvh]`). Backdrop `bg-ink/40 backdrop-blur-[2px]` (glass theme: heavier blur, lighter tint).

### §S.4.15 — `ImportDropzone`

Drag-and-drop file intake for `/import` and quick-add modal.

| Prop | Type | Req | Default |
|---|---|---|---|
| `onFiles` | `(files: File[]) => void` | **yes** | — |
| `accept` | `string` | no | `'.txt,.epub,.pdf,.html,.htm,.md'` |
| `multiple` | `boolean` | no | `false` |
| `disabled` | `boolean` | no | `false` |
| `compact` | `boolean` | no | `false` |
| `hint` | `string` | no | `'TXT · EPUB · PDF · HTML · Markdown'` |

**Events:** `onFiles(files)`, `onDragStateChange?(over)`. **Notes:** `role="button"` `tabIndex={0}`; Enter/Space opens picker; real `<input type="file" className="sr-only">` backs it. Drag state is React state (`isDragOver`), never imperative class toggling. Idle = `border-dashed border-line-strong bg-panel`; drag = `border-accent bg-accent-wash` + `Upload` icon rises 2px. Rejected file type → inline caption error + `aria-live="polite"` announce. Max height 240px desktop / 180px mobile; whole tab panel is also a drop target while route mounted.

### §S.4.16 — `SearchField` (auxiliary)

| Prop | Type | Req | Default |
|---|---|---|---|
| `value` | `string` | **yes** | — |
| `onChange` | `(v: string) => void` | **yes** | — |
| `placeholder` | `string` | no | `'Search your library…'` |
| `debounceMs` | `number` | no | `250` |

**Events:** `onChange`. **Notes:** wrapped in `<search>`; visible label collapses to `sr-only` ≥md. Mobile: sticky under header on scroll. Leading `Search` icon.

### §S.4.17 — `EmptyState` (auxiliary)

| Prop | Type | Req | Default |
|---|---|---|---|
| `icon` | `LucideIcon` | **yes** | — |
| `title` | `string` | **yes** | — |
| `body` | `string` | no | — |
| `action` | `{ label: string; onClick: () => void }` | no | — |
| `ghostAction` | `{ label: string; onClick: () => void }` | no | — |

**Events:** via `action.onClick` / `ghostAction.onClick`. **Notes:** centered; `py-12`+ whitespace. Icon xl in `text-faint`. Title `h2`-weight. At most one primary + one ghost CTA. **Never an illustration.**

### §S.4.18 — `ToastRegion` (auxiliary)

| Prop | Type | Req | Default |
|---|---|---|---|
| `position` | `'bottom-center'` | no | `'bottom-center'` |

**Events:** none — reads toast store. **Notes:** `role="status"` `aria-live="polite"`. Toasts auto-dismiss 5s (errors) / 2.5s (success), max 3 stacked, hover pauses. Above bottom bar on mobile. Icon + sentence, never color alone.

<!-- END: component-apis -->

---

<!-- BEGIN: tailwind-config -->

## §S.6 — Tailwind Configuration

Three files, and only three: `frontend/tailwind.config.js`, `frontend/src/styles/index.css` (Tailwind entry + theme tokens), and `frontend/src/styles/canonical.css` (the sanctioned exception for canonical-block/prose styling). Everything else is Tailwind utilities in JSX.

> **Tailwind version.** v3.4-style config provided. On Tailwind v4, keep the same file and add `@config "../tailwind.config.js";` at the top of `index.css`, replacing the three `@tailwind` directives with `@import "tailwindcss";` — token names and utilities are identical either way.

### §S.6.1 — `frontend/tailwind.config.js`

```javascript
/** @type {import('tailwindcss').Config} */
import typography from '@tailwindcss/typography';
import plugin from 'tailwindcss/plugin';

export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],

  // Themes are four peers selected via data-theme, not a light/dark binary.
  darkMode: ['selector', '[data-theme="dark"]'],

  theme: {
    screens: {
      xs: '420px',   // Inverted from vanilla max-width queries (1024/860/840/768/680/640/420/360)
      // sm/md/lg/xl/2xl: Tailwind defaults (640/768/1024/1280/1536)
    },
    extend: {
      colors: {
        // semantic surfaces
        bg:             'rgb(var(--bg) / <alpha-value>)',
        surface:        'rgb(var(--surface) / var(--surface-alpha, 1))',
        panel:          'rgb(var(--panel) / var(--panel-alpha, 1))',
        subtle:         'rgb(var(--subtle) / var(--subtle-alpha, 1))',
        // lines
        line:           'rgb(var(--line) / <alpha-value>)',
        'line-strong':  'rgb(var(--line-strong) / <alpha-value>)',
        // ink
        ink:            'rgb(var(--ink) / <alpha-value>)',
        'ink-muted':    'rgb(var(--ink-muted) / <alpha-value>)',
        'ink-light':    'rgb(var(--ink-light) / <alpha-value>)',
        // identity
        brand:          'rgb(var(--brand) / <alpha-value>)',
        accent:         'rgb(var(--accent) / <alpha-value>)',      // >=3:1 only: icons, rails, chips, bars
        'accent-ink':   'rgb(var(--accent-ink) / <alpha-value>)',  // AA text-safe accent
        'accent-wash':  'rgb(var(--accent-wash) / var(--accent-wash-alpha, 1))',
        // status
        ok:             'rgb(var(--ok) / <alpha-value>)',
        warn:           'rgb(var(--warn) / <alpha-value>)',
        err:            'rgb(var(--err) / <alpha-value>)',
      },
      fontFamily: {
        ui:      ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        reading: ['Lora', 'Georgia', '"Hiragino Mincho ProN"', '"Yu Mincho"', '"Noto Serif JP"', 'serif'],
        display: ['Cinzel', 'Lora', 'Georgia', 'serif'],
        mono:    ['"JetBrains Mono"', 'Consolas', 'monospace'],
      },
      fontSize: {
        micro:   ['0.6875rem', { lineHeight: '1.3',  letterSpacing: '0.08em' }],
        caption: ['0.75rem',   { lineHeight: '1.4',  letterSpacing: '0.02em' }],
        'ui-sm': ['0.8125rem', { lineHeight: '1.45' }],
        ui:      ['0.9375rem', { lineHeight: '1.5' }],
        body:    ['1rem',      { lineHeight: '1.6' }],
        h3:      ['1.0625rem', { lineHeight: '1.4' }],
        h2:      ['1.25rem',   { lineHeight: '1.3' }],
        h1:      ['1.5rem',    { lineHeight: '1.25' }],
        display: ['1.875rem',  { lineHeight: '1.2',  letterSpacing: '0.01em' }],
        reading: ['var(--reading-size, 1.125rem)', { lineHeight: '1.75' }],
      },
      maxWidth: {
        measure: '34em',   // reading column (~65ch in Lora)
        shell:   '72rem',  // app content shell
        reader:  '680px',  // hard cap on ultra-wide monitors
      },
      borderRadius: {
        sm: '6px', md: '10px', lg: '14px', pill: '9999px',  // vanilla --radius-* scale
      },
      boxShadow: {
        sm: 'var(--shadow-sm)', md: 'var(--shadow-md)', lg: 'var(--shadow-lg)',
      },
      backdropBlur: { glass: '16px' },  // pairs with saturate-[1.8] per --glass-blur
      transitionDuration: {
        instant: '100ms', fast: '150ms', base: '220ms', slow: '320ms',
      },
      transitionTimingFunction: {
        calm:  'cubic-bezier(0.2, 0, 0, 1)',
        enter: 'cubic-bezier(0, 0, 0.2, 1)',
        exit:  'cubic-bezier(0.4, 0, 1, 1)',
      },
      keyframes: {
        'fade-in':   { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up':  { from: { opacity: '0', transform: 'translateY(8px)' },
                       to:   { opacity: '1', transform: 'translateY(0)' } },
        'modal-in':  { from: { opacity: '0', transform: 'translateY(4px) scale(0.985)' },
                       to:   { opacity: '1', transform: 'translateY(0) scale(1)' } },
        'sheet-up':  { from: { transform: 'translateY(100%)' },
                       to:   { transform: 'translateY(0)' } },
        flash:       { '0%':   { backgroundColor: 'rgb(var(--accent-wash) / 1)' },
                       '100%': { backgroundColor: 'transparent' } },
        'pulse-dot': { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.35' } },
      },
      animation: {
        'fade-in':   'fade-in 220ms cubic-bezier(0, 0, 0.2, 1) both',
        'slide-up':  'slide-up 320ms cubic-bezier(0, 0, 0.2, 1) both',
        'modal-in':  'modal-in 220ms cubic-bezier(0, 0, 0.2, 1) both',
        'sheet-up':  'sheet-up 320ms cubic-bezier(0, 0, 0.2, 1) both',
        flash:       'flash 1600ms cubic-bezier(0.2, 0, 0, 1) both',
        'pulse-dot': 'pulse-dot 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [
    typography,
    plugin(({ addVariant }) => {
      // Structural overrides tokens can't express (glass blur, warm-only treatment)
      addVariant('glass', '[data-theme="glass"] &');
      addVariant('warm',  '[data-theme="warm"] &');
    }),
  ],
};
```

### §S.6.2 — `frontend/src/styles/index.css`

```css
/* Fonts — same trio as vanilla + mono. Keep preconnect links in index.html. */
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600&family=Lora:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

/* The only other CSS file in the app: canonical block / prose styling. */
@import './canonical.css';

@tailwind base;
@tailwind components;
@tailwind utilities;

/* ── Theme tokens: RGB triplets; consumed as rgb(var(--t) / alpha) ── */

:root,
[data-theme='default'] {
  color-scheme: light;
  --bg: 247 246 242;
  --surface: 255 255 255;
  --panel: 253 253 252;
  --subtle: 240 238 233;
  --line: 229 226 218;
  --line-strong: 210 206 195;
  --ink: 28 31 36;
  --ink-muted: 94 100 110;
  --ink-light: 137 143 153;
  --brand: 41 56 69;
  --accent: 196 109 59;
  --accent-ink: 161 82 37;
  --accent-wash: 244 233 223;
  --ok: 47 125 92;
  --warn: 176 122 46;
  --err: 178 59 69;
  --shadow-sm: 0 1px 2px rgb(28 31 36 / 0.05);
  --shadow-md: 0 2px 8px rgb(28 31 36 / 0.08);
  --shadow-lg: 0 8px 24px rgb(28 31 36 / 0.10);
}

[data-theme='warm'] {
  color-scheme: light;
  --bg: 243 234 217;
  --surface: 250 244 230;
  --panel: 247 240 223;
  --subtle: 236 225 203;
  --line: 224 211 184;
  --line-strong: 203 185 149;
  --ink: 59 47 34;
  --ink-muted: 111 95 73;
  --ink-light: 149 132 107;
  --brand: 92 70 50;
  --accent: 161 92 47;
  --accent-ink: 143 77 36;
  --accent-wash: 234 217 194;
  --ok: 85 122 74;
  --warn: 160 107 35;
  --err: 168 64 63;
  --shadow-sm: 0 1px 2px rgb(58 47 34 / 0.06);
  --shadow-md: 0 2px 8px rgb(58 47 34 / 0.09);
  --shadow-lg: 0 8px 24px rgb(58 47 34 / 0.12);
}

[data-theme='dark'] {
  color-scheme: dark;
  --bg: 21 23 28;
  --surface: 28 31 38;
  --panel: 25 28 34;
  --subtle: 35 39 47;
  --line: 44 49 58;
  --line-strong: 58 65 76;
  --ink: 231 229 223;
  --ink-muted: 167 171 179;
  --ink-light: 125 130 139;
  --brand: 62 80 96;
  --accent: 208 138 90;
  --accent-ink: 224 160 117;
  --accent-wash: 51 38 29;
  --ok: 102 176 138;
  --warn: 208 162 79;
  --err: 212 112 122;
  --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.40);
  --shadow-md: 0 2px 10px rgb(0 0 0 / 0.45);
  --shadow-lg: 0 8px 28px rgb(0 0 0 / 0.50);
}

[data-theme='glass'] {
  color-scheme: light;
  --bg: 233 231 225;
  --surface: 255 255 255;
  --panel: 255 255 255;
  --subtle: 255 255 255;
  --line: 255 255 255;
  --line-strong: 28 31 36;
  --ink: 28 31 36;
  --ink-muted: 76 82 91;
  --ink-light: 115 122 132;
  --brand: 41 56 69;
  --accent: 179 95 49;
  --accent-ink: 156 79 36;
  --accent-wash: 196 109 59;
  --ok: 47 125 92;
  --warn: 160 107 35;
  --err: 178 59 69;
  /* Frost alphas */
  --surface-alpha: 0.72;
  --panel-alpha: 0.55;
  --subtle-alpha: 0.40;
  --line-alpha: 0.65;
  --line-strong-alpha: 0.14;
  --accent-wash-alpha: 0.12;
  --glass-blur: blur(16px) saturate(180%);
  --glass-gradient: linear-gradient(165deg, #dfe7ee 0%, #efe9dc 48%, #e3e9ef 100%);
  --shadow-sm: 0 1px 2px rgb(28 31 36 / 0.06);
  --shadow-md: 0 8px 32px rgb(28 31 36 / 0.12);
  --shadow-lg: 0 12px 40px rgb(28 31 36 / 0.16);
}

@layer base {
  html {
    -webkit-text-size-adjust: 100%;
    scroll-behavior: smooth;
  }

  body {
    @apply bg-bg text-ink font-ui antialiased;
    text-rendering: optimizeLegibility;
    min-height: 100dvh;
  }

  /* Glass paints its gradient behind everything, fixed. */
  [data-theme='glass'] body {
    background-image: var(--glass-gradient);
    background-attachment: fixed;
  }

  ::selection {
    background: rgb(var(--accent-wash) / var(--accent-wash-alpha, 1));
    color: var(--ink);
  }

  :focus-visible {
    outline: 2px solid rgb(var(--accent));
    outline-offset: 2px;
  }

  /* Theme crossfade: store adds .theme-transition for 240ms on switch. */
  .theme-transition,
  .theme-transition * {
    transition:
      background-color 220ms cubic-bezier(0.2, 0, 0, 1),
      color 220ms cubic-bezier(0.2, 0, 0, 1),
      border-color 220ms cubic-bezier(0.2, 0, 0, 1);
  }

  /* Reduced motion: global kill-switch. Components additionally use
     motion-reduce: variants and the useReducedMotion hook. */
  @media (prefers-reduced-motion: reduce) {
    html { scroll-behavior: auto; }
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }

  /* Reduced transparency: glass falls back to opaque surfaces. */
  @media (prefers-reduced-transparency: reduce) {
    [data-theme='glass'] {
      --surface-alpha: 1;
      --panel-alpha: 1;
      --subtle-alpha: 1;
      --line-alpha: 1;
      --line-strong-alpha: 1;
      --accent-wash-alpha: 1;
      --glass-blur: none;
    }
    [data-theme='glass'] body { background-image: none; }
  }
}
```

### §S.6.3 — `frontend/src/styles/canonical.css`

The sanctioned exception file: prose typography plugin wiring + canonical block details utilities can't express cleanly (nested tables, code, provenance flash).

```css
/* Reader prose: map @tailwindcss/typography onto theme tokens.
   Applied as: <article class="prose prose-reader"> */
.prose-reader {
  --tw-prose-body: rgb(var(--ink));
  --tw-prose-headings: rgb(var(--ink));
  --tw-prose-lead: rgb(var(--ink-muted));
  --tw-prose-links: rgb(var(--accent-ink));
  --tw-prose-bold: rgb(var(--ink));
  --tw-prose-counters: rgb(var(--ink-muted));
  --tw-prose-bullets: rgb(var(--line-strong));
  --tw-prose-hr: rgb(var(--line));
  --tw-prose-quotes: rgb(var(--ink-muted));
  --tw-prose-quote-borders: rgb(var(--line-strong));
  --tw-prose-captions: rgb(var(--ink-light));
  --tw-prose-code: rgb(var(--ink));
  --tw-prose-pre-code: rgb(var(--ink));
  --tw-prose-pre-bg: rgb(var(--subtle));
  --tw-prose-th-borders: rgb(var(--line-strong));
  --tw-prose-td-borders: rgb(var(--line));
  max-width: 34em;
  font-size: var(--reading-size, 1.125rem);
  line-height: 1.75;
}

/* Japanese source text: mincho fallback already in stack; give it air. */
.prose-reader :lang(ja) { line-height: 1.85; letter-spacing: 0.01em; }

/* Canonical blocks — typed objects from chapters.canonical_content and
   representation canonicalBlocks. Wrappers carry id="blk-…" anchors. */
.canonical-block + .canonical-block { margin-top: 1.25em; }

.canonical-callout {
  border-left: 2px solid rgb(var(--accent));
  background: rgb(var(--accent-wash) / var(--accent-wash-alpha, 1));
  border-radius: 0 6px 6px 0;
  padding: 0.75em 1em;
}

.canonical-table { width: 100%; border-collapse: collapse; font-size: 0.85em; }
.canonical-table th,
.canonical-table td {
  border: 1px solid rgb(var(--line));
  padding: 0.5em 0.75em;
  text-align: left;
}
.canonical-table th { background: rgb(var(--subtle)); font-weight: 600; }
.canonical-table .align-center { text-align: center; }
.canonical-table .align-right  { text-align: right; }

.canonical-code {
  font-family: 'JetBrains Mono', Consolas, monospace;
  background: rgb(var(--subtle));
  border: 1px solid rgb(var(--line));
  border-radius: 6px;
  padding: 0.9em 1em;
  overflow-x: auto;
  font-size: 0.8em;
}

/* Provenance flash — the one animation allowed inside the source pane. */
.provenance-flash { animation: flash 1600ms cubic-bezier(0.2, 0, 0, 1) both; }
@media (prefers-reduced-motion: reduce) {
  .provenance-flash {
    animation: none;
    outline: 2px solid rgb(var(--accent));
    outline-offset: 2px;
  }
}

/* First-paragraph treatment (vanilla .reader-content-body p:first-of-type).
   Applied only to source text, never to derived text — so the two
   representations stay distinguishable even in typography. */
.prose-reader.source-text > p:first-of-type::first-line {
  font-variant: small-caps;
  letter-spacing: 0.04em;
}
```

<!-- END: tailwind-config -->

---

<!-- BEGIN: accessibility -->

## §S.7 — Accessibility Baseline

Target: **WCAG 2.1 AA** across all four themes. Calm and accessible are the same thing here — nothing in this baseline adds visual noise.

### §S.7.1 — Semantic HTML per screen

| Screen | Structure |
|---|---|
| Shell | `<header>` (banner), `<nav aria-label="Primary">`, `<main id="main">`, skip link as first focusable, `<aside aria-label="…">` for rails, modal/toast portals last in body |
| Library | `<h1 class="sr-only">Library</h1>`; search = `<search>` wrapping a labeled input; chips = buttons with `aria-pressed` inside a toolbar role; grid = `<ul>` of `<li><article>` (BookCard); selection bar = `role="region" aria-label="Selection"` |
| Book Details | `<h1>` = book title (Cinzel display); hero `<header>`; chapters `<ol>` (order matters) with per-row `aria-label` including read state; semantic panel `<section aria-labelledby>`; ask-form labeled; answers = `<article>`s citing sources |
| Reader (both modes) | `<article>` per chapter canvas; Original canvas additionally `class="source-text"`; mode toggle = `role="radiogroup" aria-label="Reading representation"`; chapter rail = `<nav aria-label="Chapters">` (original) / listbox (smart); foot nav = `<footer>`; progress hairline `aria-hidden` (readout duplicated in foot nav text) |
| Import | Tabs = `role="tablist"/"tab"/"tabpanel"` with arrow-key roving; stepper = `<ol>` of steps, active step `aria-current="step"`; overall bar = `role="progressbar"` with real `aria-valuenow`; dropzone = `role="button"` + live region announcements |
| Research | Collection `<h1>`; source chips = list of removable tokens (button + `aria-label="Remove {title}"`); editorial list = listbox; provenance drawer = `<section aria-label="Provenance">`, disclosure button with `aria-expanded` |

**Live regions:** toasts `aria-live="polite"`; generation status (`2 of 5 chapters generated`) `role="status"`; provenance jump announcements `role="status"`; import step changes `aria-live="polite"` **throttled to step boundaries, not percentages** — a screen reader doesn't want 62, 63, 64.

### §S.7.2 — Focus management

- **Modals:** focus moves to `initialFocus` (default: first focusable; destructive dialogs: the **cancel** button, so Enter never deletes by accident). Tab cycles inside via sentinel nodes; `Esc` closes; on close, focus returns to the exact opener element (ref captured at open). Backdrop inert-izes the page behind (`aria-hidden` + `inert` on the shell root while open). Body scroll lock with `scrollbar-gutter: stable` compensation.
- **Route changes:** on navigation, focus moves to the screen's `<h1 tabIndex={-1}>` and `document.title` updates (`{screen} · Smart Reader`); scroll restores per `sr.progress` in the reader, top elsewhere. Browser back from a provenance jump restores both focus and scroll in the lens pane (§3.3).
- **Popovers** (Aa, theme, chapter jumper): focus enters on open, arrow keys rove, `Esc` closes and restores the trigger.
- **Reader canvas:** provenance targets receive `tabIndex={-1}` focus on jump so screen-reader context follows the reader's eyes.
- **No focus traps by accident:** the two-pane reader keeps both panes in natural tab order (**source pane first** — DOM order matches the invariant: source before derivation).

### §S.7.3 — Keyboard shortcuts

Global rule: shortcuts are ignored when the event target is `input/textarea/select/[contenteditable]`, when any modifier beyond those listed is held, and inside modals (except `Esc` and `?`).

| Keys | Scope | Action |
|---|---|---|
| `←` / `→` | Reader | Previous / next chapter (in the current mode's sequence) |
| `m` | Reader | Toggle Original ↔ Smart (focus stays on the radiogroup) |
| `+` / `−` | Reader (Aa open) | Reading size up/down (1px steps, 16–22) |
| `g` then `1`/`3`/`5` | Reader (Smart) | Queue +1/+3/+5 chapters |
| `/` | Library | Focus search |
| `t` | Global | Cycle theme (default → warm → dark → glass) |
| `?` | Global | Shortcut help modal |
| `Esc` | Overlays | Close topmost popover/sheet/modal |
| `Enter` / `Space` | Lists | Activate focused chapter/card row (roving tabindex, `Home`/`End`, type-ahead in chapter jumper) |

All actions reachable by shortcut are also reachable by visible controls — **shortcuts never gate functionality**.

### §S.7.4 — Color contrast (WCAG AA minimums)

Body text ≥ 4.5:1; large text (≥18.66px bold / 24px) and UI components/icons ≥ 3:1. Verified pairs (ratios ≈, against each theme's actual surfaces):

| Pair | default | warm | dark | glass |
|---|---|---|---|---|
| `--ink` on `--bg` | ≈14.9 ✓ | ≈10.9 ✓ | ≈12.9 ✓ | ≈13.4 ✓ |
| `--ink-muted` on `--bg` | ≈5.6 ✓ | ≈5.1 ✓ | ≈6.8 ✓ | ≈6.4 ✓ |
| `--ink-light` on `--bg` | ≈3.2 (UI/large only) | ≈3.6 (UI/large only) | ≈3.9 (UI/large only) | ≈3.5 (UI/large only) |
| `--accent-ink` on `--surface` | ≈5.4 ✓ | ≈5.9 ✓ | ≈7.7 ✓ | ≈6.4 ✓ |
| `--accent` on `--surface` | ≈3.9 (UI/rails/chips only) | ≈4.8 ✓ | ≈6.5 ✓ | ≈4.6 ✓ |
| white on `--brand` (primary buttons) | ≈9.9 ✓ | ≈8.6 ✓ | n/a (dark uses `--bg` text on `--brand`, ≈6.1 ✓) | ≈9.9 ✓ |

**Enforced rules:**
- `--ink-light` never carries body-size information.
- Accent-colored *text* is always `--accent-ink`.
- Status colors pair with icons/labels — never color-only.
- The `default` theme's `--accent` is decorative/UI-only on white — this is why `--accent-ink` exists.
- Contrast is re-verified for glass against its **frosted effective background** (white panel at 72% over the light gradient ≈ `#f6f7f5`), not the raw gradient.

### §S.7.5 — Reduced motion and transparency

**Three layers, per §1.4:** (1) global `prefers-reduced-motion` kill-switch in `index.css`; (2) `motion-reduce:` variants on the handful of component animations (card lift, toast slide, chapter stagger, modal scale); (3) the `useReducedMotion()` hook for imperative behavior — `scrollIntoView({ behavior })` in provenance jumps and chapter navigation, and the flash → static-outline swap in `canonical.css`. Reading-progress and generation numbers remain fully perceivable without motion (text readouts everywhere a bar exists). **Nothing essential is ever motion-only.**

**Reduced transparency:** under `prefers-reduced-transparency: reduce`, the `glass` theme falls back to opaque surfaces (`--surface-alpha: 1`, `--glass-blur: none`, gradient removed). This is the only blueprint-sourced accessibility requirement unique to the glass theme, and it is non-negotiable.

### §S.7.6 — Baseline compliance

- Touch targets ≥ 44px in reader and bottom nav.
- Text resizable to 200% without loss (all `rem`/`em`; reader size is a first-class control).
- `lang` attributes on rendered content blocks (source chapters may be Japanese — `lang` comes from book metadata).
- No `title`-only information.
- Forms have visible labels — placeholder never substitutes.
- Status is never icon-only; always text or color + shape (WCAG 1.4.1).

<!-- END: accessibility -->

---

<!-- BEGIN: migration-improvements -->

## §S.8 — Migration-Inspired Improvements

Five concrete upgrades the React migration makes possible. Each maps to a **documented** vanilla deficiency — none adds a dependency, none touches the component tree.

### §S.8.1 — Real job-driven progress replaces the `setTimeout` theatre

**Vanilla problem (documented):** `handleAddBookSubmit` and `runWebIngestionPipeline` animate ingestion steps with hardcoded `setTimeout(…, 450/950/1450)` *alongside* the real API call — `architecture-script-js.md` §6 flags this as *"suspicious fake progress… could race with actual API completion."* Steps can show ✓ while the import has failed, or crawl to 100% long before the backend finishes. `fetchJobs()` exists but no polling loop does.

**Improvement:** the backend already tracks truth — `processing_jobs` with `type` (INGEST/SEMANTIC_INDEX), `status`, and `progress 0–100` (ARCHITECTURE_AUDIT Q23). Wire it: import mutations return a job id; React Query `useQuery(['jobs', id], …, { refetchInterval: (q) => isActive(q.state.data) ? 1500 : false })` drives the stepper and bars. The same mechanism powers §3.2's generation queue — **one honest progress system for the whole app.**

**Why it matters beyond honesty:** progress survives refresh and route changes (server state); failures surface the job's real `error` at the real step; and "Stop" semantics become meaningful.

**Acceptance:** kill the network mid-import → UI shows the failed step with the server reason, never a false ✓.

### §S.8.2 — Modal focus trap, `Esc`, and focus restore

**Vanilla problem:** modals toggle a `.hidden` class (`architecture-index-html.md` §6; `architecture-script-js.md` §7.8). No focus management: Tab walks into the page *behind* the dialog, screen readers never learn a dialog opened, `Esc` does nothing, background scrolls, closing dumps focus at `document.body`.

**Improvement:** the single `Modal` shell (§S.4.14) traps focus with sentinel nodes (no dependency), sets `role="dialog" aria-modal="true"` + labelledby/describedby, closes on `Esc`/backdrop with reason tracking, restores focus to the opener ref, and locks scroll with `scrollbar-gutter` compensation. Mobile: the same shell becomes a bottom sheet — **one implementation, eleven dialogs fixed at once.**

**Why it matters:** the largest accessibility gap in the vanilla app (11 dialogs × every keyboard/AT user), and consolidation means the fix is written once and cannot regress per-dialog.

### §S.8.3 — Keyboard-navigable chapter lists

**Vanilla problem:** chapter lists are `innerHTML`-injected `<div>`/`<li>` strings with inline `onclick` (`architecture-script-js.md` §3, §7.6) — mouse-only. A reader who tabs cannot reach chapter 42; a screen-reader user hears nothing meaningful.

**Improvement:** both chapter surfaces (Book Details list, `SmartChapterList`, the ChapterNav jumper popover) implement the listbox/roving-tabindex pattern: one tab stop for the whole list, `↑↓` move, `Home/End` jump, type-ahead finds "Biographical" in two keystrokes, `Enter` opens, `aria-current` marks the active chapter, each row announces number, title, and read/generated status. The `←`/`→` chapter shortcuts (§S.7.3) complement this for in-canvas navigation.

**Why it matters:** chapter navigation is the reader's most repeated action after turning pages; making it keyboard-first serves power readers and AT users identically — and it's nearly free once lists are real React components instead of strings.

### §S.8.4 — URL-addressable reader position

**Vanilla problem:** routing is `display: none` toggling (`navigateTo(viewName)`); position lives only in a mutable `state` object plus a `localStorage` last-read pointer. Nothing is linkable, the back button leaves the SPA, and provenance has no addressable target.

**Improvement:** position is fully encoded:

```
/read/:bookId/:chapterId?rep=smart#sblk-{representationId}-{i}
/read/:bookId/:chapterId?rep=original#blk-{chapterId}-{i}
```

**Consequences:**
- Browser back/forward work as readers expect (including the Source ↔ Lens round-trip of §3.3).
- Any reading position — and any *provenance target* — is a copy-pasteable URL.
- Refresh resumes exactly; react-router scroll restoration + `sr.progress.scrollByChapter` handle sub-chapter offsets.
- **The stable `blk-` scheme is only possible because of the immutability invariant** — the URL is safe forever *because the source never changes*. The moat becomes literally addressable.

**Why it matters beyond UX:** the technical foundation of provenance click-through on mobile (single-pane jumps are navigations, not scrolls) and of sharing citations between researchers.

### §S.8.5 — Per-chapter scroll memory and honest resume

**Vanilla problem:** persistence is "last-read book/chapter" only (`architecture-script-js.md` §7.10); reopening a 40-page chapter throws the reader back to the top, and `updateScrollProgress` computes a percentage that is displayed but never restored.

**Improvement:** a throttled (250ms, passive) scroll listener stores `{ chapterId → pct, offset }` in `sr.progress`; returning to a chapter — via back button, rail click, or app reopen — restores the exact offset after the post-render effect settles (`useLayoutEffect` + double `requestAnimationFrame`, the same machinery as provenance jumps). The foot-nav readout ("68% of book") and `ScrollProgress` now describe a position **the app actually remembers**. Read-status suggestion stays manual: crossing ~90% surfaces a quiet, dismissible "Mark as read?" affordance — never auto-toggled.

**Why it matters:** resuming mid-chapter is the single most felt quality of a serious reading app; the vanilla app computes the data and discards it. Cost is one store slice and one listener — and it compounds with §S.8.4: restored position + addressable URL means a reader can leave on their phone and resume on their laptop at the same sentence.

<!-- END: migration-improvements -->