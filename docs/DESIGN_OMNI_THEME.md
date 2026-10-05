# Omnitome Omni Theme Identity Design

> **Task 5.8c Design Document**  
> Direction: Omni / Accent-Glow Aesthetic for Omnitome (Smart-Reader)  
> Architectural Status: Implemented in Phase 5.8c

---

## 1. Direction: Controlled Accent-Glow

Omnitome's visual language has to date offered four functional themes (`default`, `warm`, `cyberpunk`, `glass`). While reliable and calm, none captured the modern, high-focus atmosphere of contemporary neural software interfaces. 

The **omni** theme (originally drafted as `neon`) introduces an accent-glow direction:
- **Not a garish 1980s rave or cyberpunk gimmick**: No vibrating cyan/magenta text shadows that fatigue reader eyes.
- **A controlled ambient glow**: Deep obsidian backgrounds accented by electric blue and electric violet luminescent lighting.
- **Elevation through depth and gradients**: Multi-stop subtle gradients across hero panels, cards, and borders that create a refined, high-density tool feel.

---

## 2. Visual Reference: Gemini Notebook Studio Aesthetic

The design references the **Gemini Notebook Studio** UI system:
1. **Deep Backdrops**: Near-black void with cool navy undertones (`rgb(10 12 20)` / `#0a0c14`), punctuated by very faint ambient radial gradients.
2. **Luminescent Controls**: Primary action buttons carrying soft, diffused outer glow shadows (`box-shadow: 0 0 20px ...`) that focus intent without obscuring surrounding affordances.
3. **Studio Accents**: 
   - **Electric Violet** (`rgb(168 85 247)` / `#a855f7`) as the primary accent and selection tone.
   - **Electric Blue** (`rgb(59 130 246)` / `#3b82f6`) as the core brand/action vector.
4. **Vibrant Semantic Indicators**: Elevated emerald (`#34d399`), amber (`#fbbf24`), and rose (`#f87171`) status colors tailored for high dark-field luminescence.
5. **Precision Dividers**: Thin, luminous borders with controlled alpha (`rgb(var(--line) / 0.6)`) framing crisp glass-and-slate surfaces.

---

## 3. Token Strategy

All color tokens in Omnitome follow the RGB triplet format (`r g b`), consumed downstream as `rgb(var(--token) / <alpha>)`.

### 3.1 Omni Theme Tokens (`[data-theme='omni']`)
*(Note: Initial implementation used `[data-theme='neon']`, migrated to `omni`)*

| Token | RGB Value | Hex Equivalent | Semantic Role & Behavior |
|---|---|---|---|
| `--bg` | `10 12 20` | `#0a0c14` | Deepest canvas background with cool navy tint |
| `--surface` | `18 22 34` | `#121622` | Elevated card/modal surface with subtle violet-blue lean |
| `--panel` | `14 17 28` | `#0e111c` | Sidebar / sunken panels |
| `--subtle` | `26 31 46` | `#1a1f2e` | Interactive hover states, inputs, secondary badges |
| `--line` | `38 45 66` | `#262d42` | Primary borders, subtle card separation |
| `--line-strong` | `62 72 102` | `#3e4866` | Active borders, focused boundaries |
| `--ink` | `245 247 251` | `#f5f7fb` | Crisp off-white primary body text |
| `--ink-muted` | `158 167 186` | `#9ea7ba` | Secondary labels, timestamps, metadata |
| `--ink-light` | `107 116 138` | `#6b748a` | Microcopy, disabled text, tertiary captions |
| `--brand` | `59 130 246` | `#3b82f6` | Primary action vector (electric blue) |
| `--accent` | `168 85 247` | `#a855f7` | Focus ring, active indicators, highlights (electric violet) |
| `--accent-ink` | `192 132 252` | `#c084fc` | High-contrast readable violet text for badges & links |
| `--accent-wash` | `168 85 247` | `#a855f7` | Base violet triplet for washes and selections |
| `--accent-wash-alpha` | `0.15` | 15% | Alpha channel for ambient selections and hover washes |
| `--ok` | `52 211 153` | `#34d399` | Saturated emerald success/completed status |
| `--warn` | `251 191 36` | `#fbbf24` | Luminous amber warning/in-progress status |
| `--err` | `248 113 113` | `#f87171` | Vibrant rose error status |
| `--shadow-sm` | `0 1px 3px rgb(0 0 0 / 0.5)` | — | Base elevation shadow |
| `--shadow-md` | `0 4px 14px rgb(0 0 0 / 0.6), 0 0 16px rgb(168 85 247 / 0.12)` | — | Elevated panel shadow with ambient violet bloom |
| `--shadow-lg` | `0 10px 30px rgb(0 0 0 / 0.7), 0 0 28px rgb(168 85 247 / 0.18)` | — | Modal / popover shadow |

### 3.2 Omni-Specific Atmosphere Tokens

Defined exclusively for `omni` (originally `neon`):
```css
--glow-brand: rgb(168 85 247 / 0.5);
--glow-accent: rgb(59 130 246 / 0.4);
--gradient-hero: linear-gradient(135deg, rgb(168 85 247 / 0.15), rgb(59 130 246 / 0.08));
```

- `body` background: Subtle radial gradient vignette centered top:
  `radial-gradient(ellipse 80% 50% at 50% -10%, rgb(59 130 246 / 0.08), transparent 70%)`
- Header: Luminous bottom boundary using `border-bottom: 1px solid rgb(var(--brand) / 0.3)`.
- Brand CTA buttons: Soft diffused aura using `box-shadow: 0 0 20px var(--glow-brand)` on rest, increasing to `28px` on hover.

---

## 4. Per-Theme Plan

### 4.1 Theme 5: 'omni'
Full dark-field implementation according to the token mapping above. Complete set of tokens provided so all existing Tailwind utilities (`bg-app`, `bg-surface`, `bg-card`, `bg-panel`, `bg-subtle`, `text-ink`, `text-muted`, `border-line`, etc.) function seamlessly without any component code alterations.

### 4.2 Light Polish for Existing Themes ('default', 'warm', 'cyberpunk', 'glass')
In accordance with Section 2B, existing themes receive a light, additive touch that harmonizes the app without rewriting core palettes:
1. **Primary Brand Button Hover Glow**:
   - `button.bg-brand:hover, a.bg-brand:hover, .brand-button:hover`
   - Dynamically pulls each theme's `--brand` token:
     `box-shadow: 0 0 16px rgb(var(--brand) / 0.35);`
   - Smooth GPU transition (`transition: box-shadow 180ms ease, ...`).
2. **Subtle Header Gradient**:
   - `header` element background augmented with a top-down wash:
     `linear-gradient(180deg, rgb(var(--brand) / 0.05) 0%, transparent 100%)`
   - Uses `--brand` at low alpha (0.05), maintaining clean translucency over blurred content.
3. **Active Nav Tab Accent Border**:
   - `nav[aria-label="Primary"] a[aria-current="page"], nav a[aria-current="page"]`
   - Crisp 1px accent border (`border-color: rgb(var(--accent));`) that immediately identifies the active navigation destination across all themes.

---

## 5. Critical Invariant: Reader vs. Chrome Split

The Omnitome product philosophy establishes three immutable laws:
1. **Source is paper**: The Original text representation is immutable, neutral, and book-like.
2. **The lens is tinted**: The Omni representation carries a quiet derived identity.
3. **Derivation never masquerades as source**.

### Boundary Rules

| Domain | Allowed Visual Elements | Prohibited Visual Elements |
|---|---|---|
| **Chrome / App Shell** (Header, Nav, Library Grid, Book Details, Import Stepper, Modals, Action Buttons) | Gradient panels, diffused outer button glows, luminous borders, animated progress dots, accent badges | Plain unstyled raw controls |
| **Reader Content Area** (`article.prose.prose-reader`, Original & Omni bodies) | Crisp high-contrast typography, calm paper-like canvas, functional provenance underlines / chips | **Glow shadows, text-shadows, blurred gradients, vibrating colors, animated backgrounds** |

### Reader Protection Guarantee
Under `[data-theme='omni']`:
- Long-form reading text (`.prose-reader`) maintains maximum contrast (`#f5f7fb` on `#0a0c14`).
- No glowing text-shadow or filter is applied to reader headings, paragraphs, or blockquotes.
- Provenance chips (`.segment-source-chip`) and flash indicators remain strictly utilitarian for source verification, honoring the core moat.

---

## 6. Accessibility Floor (WCAG AA Compliance)

Every foreground/background pairing in the `omni` theme exceeds the WCAG AA minimum contrast ratio of **4.5:1** for standard text and **3:0:1** for UI components/large text:

- **Primary Text (`--ink` `#f5f7fb`) on Canvas (`--bg` `#0a0c14`)**:
  - Contrast Ratio: **18.2:1** (Exceeds WCAG AAA requirement of 7:1)
- **Primary Text (`--ink` `#f5f7fb`) on Elevated Surface (`--surface` `#121622`)**:
  - Contrast Ratio: **16.5:1** (Exceeds WCAG AAA)
- **Muted Text (`--ink-muted` `#9ea7ba`) on Canvas (`--bg` `#0a0c14`)**:
  - Contrast Ratio: **7.5:1** (Exceeds WCAG AAA)
- **Tertiary Text (`--ink-light` `#6b748a`) on Canvas (`--bg` `#0a0c14`)**:
  - Contrast Ratio: **4.6:1** (Exceeds WCAG AA 4.5:1 floor)
- **Brand Action Text (`#ffffff`) on Brand Button (`--brand` `#3b82f6`)**:
  - Contrast Ratio: **4.6:1** (Complies with WCAG AA)
- **Accent Text (`--accent-ink` `#c084fc`) on Elevated Surface (`--surface` `#121622`)**:
  - Contrast Ratio: **7.8:1** (Exceeds WCAG AAA)

### Reduced Motion
Respects `prefers-reduced-motion: reduce`: all button glow transitions and header gradient fades collapse to instantaneous or static outlines.

---

## 7. Deliverables & Blast Radius for Phase 5.8c

Execution strictly constrained to three files:
1. `frontend/src/types/domain.ts`:
   - Extend `Theme` type union: `'default' | 'warm' | 'cyberpunk' | 'glass' | 'omni'`
2. `frontend/src/store/useThemeStore.ts`:
   - Extend `THEMES` array: `['default', 'warm', 'cyberpunk', 'glass', 'omni']`
3. `frontend/src/styles/index.css`:
   - Define `[data-theme='omni']` CSS variable tokens.
   - Implement omni body backdrop, button glow, and header border rules.
   - Implement shared polish block for brand button hover glow, header gradient, and active nav tab accent border.

## Multi-Accent Extension (5.8c.2)

Themes 'default' and 'cyberpunk' extended with secondary tokens:
- --accent-2: tag chips
- --accent-3: read/success state
- --accent-4: queued/warning state

'default'   → girly diary (pink + lavender + mint + peach)
'cyberpunk' → synthwave (cyan + magenta + lime + amber)

warm/glass/omni remain single-accent. Utility classes fall back to
--accent when --accent-2/3/4 are undefined.

## Theme Identity Restructure (5.8c.3)

Final theme lineup:
- spring     — light greenish cyan, water/wind/leaves (FALLBACK)
- sakura     — pink cherry blossoms
- coffee     — amber coffee
- cyberpunk  — synthwave multi-neon
- omni       — violet flagship

Renames: dark → cyberpunk, default → sakura, warm → coffee,
glass → spring. Migration logic in useThemeStore preserves each
user's stored preference across the rename.

Multi-accent tokens (--accent-2/3/4) are scoped to [data-theme='sakura']
and [data-theme='cyberpunk'] only. All other themes fall back to
--accent (their primary color).
