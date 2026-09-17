# Architecture Report: `src/style.css`

## 1. CSS variables / design tokens

| Name | Value | Purpose |
| --- | --- | --- |
| `--bg-app` | `#f7f6f2` | Main application background |
| `--bg-card` | `#ffffff` | Primary container/card background |
| `--bg-panel` | `#fdfdfc` | Secondary container/panel background |
| `--bg-subtle` | `#f0eee9` | Subtle background for hovering, chips, badges |
| `--border-*` | `#e5e2da` / `#d2cec3` | UI borders, subtle and strong variants |
| `--text-*` | `#1c1f24`, `#5e646e`, `#898f99` | Typography hierarchy (main, muted, light) |
| `--brand-primary` | `#293845` | Primary brand color (buttons, highlights) |
| `--brand-accent` | `#c46d3b` | Secondary accent color (active states, callouts) |
| `--status-*` | Success, Warning, Error colors | Status indicators, badges, toasts |
| `--radius-*` | `6px`, `10px`, `14px`, `9999px` | Border radius scale (sm, md, lg, pill) |
| `--shadow-*` | `0 1px 3px...`, etc. | Elevation scale (sm, md, lg) |
| `--font-*` | `Plus Jakarta Sans`, `Lora`, `Cinzel` | Font stacks (UI, reading, display) |
| `--glass-blur` | `blur(16px) saturate(180%)` | Theme-specific backdrop filter token |

*Note: Overridden in `body.theme-warm`, `body.theme-dark`, and `body.theme-glass` to apply global theme switching.*

## 2. Global vs. component-scoped selectors

**Global reset/base**
- `*, *::before, *::after` (Box-sizing reset)
- `body` (Font family, background, text color, min-height)
- `button, input, select, textarea` (Form typography inheritance)
- `a` (Text decoration, color inheritance)

**Utility-style (single-purpose, reusable)**
- `.flex-1`, `.flex-2`, `.flex-3` (Flex growth)
- `.align-center`, `.align-left`, `.align-right` (Text alignment in tables)
- `.hidden` (Display none for modals)

**Component-scoped (view-specific)**
- `.app-header`, `.books-grid`, `.book-details-hero`, `.reader-canvas` (High-level layout)
- `.btn-*`, `.badge-*`, `.status-pill` (UI components)
- `.canonical-*` (Markdown rendering blocks)
- `.editorial-*`, `.semantic-*` (Smart Reading / Semantic Memory specific views)

## 3. Structural dependencies (fragile for React)

| Selector | Depends On | Why it's fragile |
| --- | --- | --- |
| `body.theme-glass .app-header` (and ~20 others) | Global `body` class | Relies on CSS cascade penetrating deep into independent component trees |
| `.canonical-table tbody tr:last-child td` | Exact `tbody > tr > td` tree | Breaks if React renders intermediate wrappers or fragments |
| `.reader-content-body p:first-of-type` | Sequential `<p>` tags | Breaks if the renderer inserts `div` wrappers around text blocks |
| `.drop-zone.drag-over` | Imperative JS class toggling | React uses state for this (`isDragOver`), standard class names are unnecessary |
| `.proc-step.done .proc-step-dot` | Specific nesting for stepper | Component composition in React would handle active/done state directly on the Dot component |

## 4. Layout system

- **Flexbox vs. Grid:** 
  - Flexbox is heavily used for 1D layouts (`display: flex; align-items: center; justify-content: space-between`).
  - Grid is used strictly for 2D responsive repeating layouts (`.books-grid`, `.ai-choice-grid`, `.ingestion-steps`, `.semantic-intelligence-grid`).
- **Recurring spacing values:** Linear 4px scale used extensively (`4px`, `8px`, `12px`, `16px`, `24px`, `32px`, `48px`, `60px`).
- **Breakpoints and @media strategy:** Desktop-first (Mobile-down) approach using `max-width`. Breakpoints include `1024px`, `860px`, `840px`, `768px`, `680px`, `640px`, `420px`, `360px`.

## 5. Color palette / typography

- **Colors:** Deep Slate/Navy primary (`#293845`), Terracotta accent (`#c46d3b`). Semantic statuses (Emerald, Amber, Crimson). Themes map these heavily to background/foreground tokens.
- **Font families:** 
  - UI: `Plus Jakarta Sans`, system fallbacks
  - Reading: `Lora`, Georgia, serif
  - Display: `Cinzel`, `Lora`, serif
  - Code: `JetBrains Mono`, Consolas, monospace
- **Font size scale:** Primarily relies on px (`10px` through `32px`), with `.canonical-*` classes shifting to `em`/`rem` for proportional reading scaling.

## 6. Third-party CSS

- None explicitly loaded via `@import` in this CSS file. Assumes fonts (Google Fonts) and icons are loaded in the HTML `<head>`. Uses standard CSS reset techniques manually.

## 7. Animations and transitions

| Selector | Trigger | Property | Tailwind equivalent |
| --- | --- | --- | --- |
| `.ui-icon.spin` | `.spin` class | `rotate(0deg)` to `360deg` | `animate-spin` |
| `.status-pill.checking .status-dot` | `.checking` class | opacity pulse | `animate-pulse` |
| `.toast` | Mount | translateY + opacity (`slideUp`) | custom `animate-slide-up` |
| `.collection-floating-bar` | Mount | translateY + opacity (`slideUpFade`) | custom `animate-slide-up-fade` |
| `.editorial-provenance-drawer` | Mount | translateY + opacity (`fadeIn`) | custom `animate-fade-in` |
| `.book-card:hover` | `:hover` | `transform: translateY`, `box-shadow`, `border-color` | `hover:-translate-y-1 hover:shadow-md hover:border-blue-400 transition-all` |

## 8. Structural observations for React/Tailwind migration

- **What maps cleanly:** Padding, margins, flex/grid layouts, border radii, simple colors, and typography map 1:1 to Tailwind utility classes.
- **What must become Tailwind config tokens:** The entire `:root` variable set, custom fonts, and all theme overrides (warm, dark, glass) must be mapped into the `tailwind.config.js` `theme.extend` and colors payload.
- **What should be deleted:** Imperative `.hidden` toggles, global reset blocks (Tailwind provides Preflight), and component-specific hover transitions that can be handled inline via `hover:` utilities.
- **What needs a CSS-in-JS or CSS Module approach:** The `.theme-glass` deep backdrop-filter overrides and `.canonical-*` parsed markdown HTML are too complex for inline utilities. The canonical styles should be replaced by Tailwind Typography (`@tailwindcss/typography`) or scoped CSS modules.

## 9. Top 10 things to know for migration

1. The application uses a desktop-first responsive strategy via `max-width` media queries that must be inverted to Tailwind's mobile-first `min-width` approach.
2. Theme switching (Warm, Dark, Glass) operates by overriding CSS variables globally on the `body` tag, which translates perfectly to CSS variables in Tailwind config.
3. The `theme-glass` is a heavy, experimental UI mode relying on deep cascading `backdrop-filter` and `background-image` that will require custom Tailwind base layers.
4. There are practically zero utility classes in this file; it strictly uses BEM-lite component class scoping.
5. The `.canonical-*` namespace is a custom markdown-rendering engine that should be replaced with Tailwind Typography (`prose`).
6. Animations rely on `@keyframes` defined in CSS (slide, fade, pulse), which will need to be ported to `tailwind.config.js` `keyframes` and `animation` settings.
7. Grid layouts are specifically reserved for responsive cards and steppers, utilizing `repeat(auto-fill, ...)` which maps to Tailwind `grid-cols-*`.
8. The reading view (`.reader-content-body`) uses specific typography resets and `em`-based spacing to handle adjustable font sizes gracefully.
9. CSS pseudo-elements (`::before`, `::after`) are extensively used for styling book cover spines and table-of-contents separators.
10. The UI relies on a strict 4px spacing scale that perfectly aligns with Tailwind's default spacing system (`p-1`, `p-2`, `p-3`, etc).

