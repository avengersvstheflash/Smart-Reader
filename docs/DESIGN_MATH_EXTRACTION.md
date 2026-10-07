# F31 — Math Extraction via pdfmath

## Problem
Born-digital PDFs and academic textbooks often leak mathematical formulas as jumbled ASCII strings or disconnected unicode characters during text extraction. Without math structure recovery, downstream readers and AI summarizers cannot properly render equations.

## Architecture
Three-tier extraction and preservation pipeline:

1. **Python Sidecar (`sidecars/python/math/extract.py`)**:
   - Exposes `POST /v1/math/extract`.
   - Decodes base64 PDF into an ephemeral temporary file.
   - Utilizes `pdfmath` (`extract_pages`, `find_equations`, `parse_region`, `to_latex`).
   - Preserves mathematical layout:
     - Inline formulas: wrapped in `\( ... \)`
     - Display equations: wrapped in `\[ ... \]`
   - Maps glyph streams to `text_original` for exact span replacement.
   - Never crashes the endpoint; logs failures per-region and returns structured JSON stats.

2. **Node Service Client (`backend/services/ai/mathExtractor.js`)**:
   - Exposes `extractMath(pdfBuffer, options)`.
   - Follows `sidecarBase` URL resolution.
   - Handles empty buffers without network hops.
   - Returns `null` on sidecar offline / HTTP 500 (honest fallback).

3. **Ingestion Hook (`backend/services/ingestion/ingestionService.js`)**:
   - Fires during PDF ingestion post `pdfjsParser.parse`.
   - Matches `textOriginal` against chapter source content and `canonicalBlocks`.
   - Performs non-destructive replacements, retaining all non-math text.
   - Logs `[MathExtractor] N math blocks replaced` or honest unchanged message.

## Delimiters & Frontend Compatibility
KaTeX is configured in `CanonicalBlock.tsx` to recognize:
- Inline: `\( ... \)`
- Display: `\[ ... \]`
Equations render natively via `MathRenderer.tsx` without additional frontend changes.
