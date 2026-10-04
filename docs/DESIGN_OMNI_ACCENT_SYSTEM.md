# Omni Per-Theme Accent System

> Design document for Phase 5.8c.1
> Status: DRAFT — implementation 2026-10-06
> Predecessor: DESIGN_OMNI_THEME.md

## 1. Problem
The omni theme uses neon violet (#A855F7) which works on dark backgrounds
but fails WCAG 4.5:1 contrast on light/warm surfaces. Using one accent
across all themes produces washed-out UI on light themes.

## 2. Research basis
- Neon shades fail WCAG 4.5:1 on pale backgrounds
- Industry pattern: dark themes use lightest accent; light themes darkest
- Reference: tinct, Material Design dynamic color

## 3. Proposed per-theme accent calibration
| Theme   | Background      | Accent               | Rationale                          |
|---------|-----------------|----------------------|------------------------------------|
| default | #F8F7FC         | #7C3AED (violet-600) | Deep violet for light surface      |
| warm    | cream           | #B45309 (amber-700)  | Warm identity, distinct from violet|
| dark    | #1A1D24         | #A855F7 (violet-500) | Calm violet for dark               |
| glass   | translucent     | #0D9488 (teal-600)   | Cool teal for glass                |
| omni    | #0A0C14         | #A855F7 (violet-500) | Flagship neon violet               |

Each theme defines:
- --accent, --accent-ink
- --accent-wash, --accent-wash-alpha (calibrated per background)
- --glow-brand, --glow-accent (only where appropriate — dark/omni)

## 4. Source highlight adaptation
Research source highlight currently uses neutral wash. Under omni/dark,
adapt to violet wash for consistency with the derived lens. Under
light/warm/glass, use calibrated theme accent.

## 5. Verification plan
- Manual walkthrough of each of the 5 themes
- WCAG contrast check: accent vs background ≥ 4.5:1
- Reader prose invariant confirmed under every theme

## 6. Open questions (resolve at implementation)
- Does 'omni' replace 'dark', or do both exist? (currently both exist)
- Should 'warm' keep amber, or shift to a warm violet?
- Theme cycle order: [default, warm, dark, glass, omni] — keep?

## 7. Out of scope for 5.8c.1
- Font changes
- Layout changes
- New theme additions
- Component-level restyling (accent tokens only)

