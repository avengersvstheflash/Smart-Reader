# Rights and Licensing

> Status: personal use / pre-commercial. This document records the
> current licensing state and the decisions that must be made before
> public or commercial release. It is not legal advice.

## Repo license

MIT (see LICENSE). Applies to code only. Does not supersede the
licenses of third-party fixtures committed to the repo.

## Current stage

Personal reading library. Open-source project. No commercial intent
as of 2026-09-22. Working title: **Omnitome**.

## Committed test fixtures

| File | Source | License | Commercial redistribution |
|---|---|---|---|
| `backend/tests/fixtures/practical_machine_learning.pdf` | CRC Press, *Practical Machine Learning* (2025) | CC-BY-NC-ND 4.0 | ✗ blocked (NC + ND) |
| `backend/tests/fixtures/stress/two-column.pdf` | arXiv:1512.03385 (ResNet) | arXiv non-exclusive | ⚠ gray (underlying IEEE copyright) |
| `backend/tests/fixtures/stress/math-heavy.pdf` | NIST FIPS 197-upd1 (AES) | Public Domain (US Gov) | ✓ clean |
| `backend/tests/fixtures/stress/table-heavy.pdf` | SEC EDGAR, Apple Inc. FY23 10-K | Public Domain (filing) | ✓ clean |
| `backend/tests/fixtures/stress/code-heavy.pdf` | Think Python 2e, Allen Downey | CC BY-NC 3.0 | ✗ blocked (NC) |

### Fixture swap plan (before any commercial release)

1. **Practical ML PDF** — swap for a public-domain or CC-BY textbook
   fixture. Candidates: Project Gutenberg technical texts, US Gov
   training manuals, NIST publications. Do NOT commit a replacement
   until the license is verified.
2. **Think Python** — swap for a CC-BY programming text. Candidates:
   *Eloquent JavaScript* (CC BY-NC — same problem), *Structure and
   Interpretation of Computer Programs* (CC BY-SA — share-alike,
   acceptable if the repo can meet the SA clause for that file only).
   Alternatively, generate a synthetic code-heavy PDF from public-domain
   code samples.
3. **ResNet arXiv** — keep. arXiv non-exclusive allows redistribution
   of the arXiv-hosted PDF. Note in NOTICE.md.
4. **NIST FIPS 197** — keep. Public domain.
5. **Apple 10-K** — keep. Public domain filing.

## User content

Smart Reader processes user-uploaded content locally. The user retains
all rights to their source material. The app does not:
- Train any model on user content
- Send user content to third parties except the configured AI provider
  (visible in Book Details — see `ai_provider` disclosure)

Source text goes to OpenRouter/DeepSeek only when compression runs.
Users who configure Ollama operate fully offline.

## Distribution model (undecided)

Options under consideration for pre-launch:
- **Gumroad** — simple one-time purchase, indie-friendly
- **itch.io** — accepts non-game software, good for tools
- **GitHub Releases** — free, requires no store
- **Direct download from project site** — full control, no store fees

Decision deferred until Phase 6 (Tauri packaging) completes. The
installer format (`.dmg`, `.exe`, `.AppImage`) will also be finalized
then.

## Pre-launch decisions checklist

- [ ] Swap CC-BY-NC-ND and CC-BY-NC fixtures for redistributable
      alternatives (see fixture swap plan above)
- [ ] Add NOTICE.md at repo root listing all third-party content and
      licenses
- [ ] Decide distribution channel (see above)
- [ ] Register trademark for Omnitome if pursuing commercial release
- [ ] Confirm the "You own your content. You own the AI." positioning
      is legally accurate given the cloud provider dependency — either
      ship local-LLM default or disclose provider clearly
- [ ] Review CC-BY-SA implications if any share-alike fixture enters
      the repo
- [ ] Legal review of AI-generated derived content rights
      (per jurisdiction: Japan, EU, US)

## Out of scope for this document

- App content policy (what users can upload)
- Terms of service (post-launch)
- Privacy policy (post-launch)
- DMCA process (post-launch, only if public distribution)
- Patent strategy (separate track, not addressed here)
