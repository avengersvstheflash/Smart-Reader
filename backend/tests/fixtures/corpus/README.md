# Cross-Format Test Corpus (F42)

## Purpose
This diverse fixture corpus serves as the v1.0 quality gate for cross-format pipeline regression detection. It verifies that core parsing, structural decomposition, and chapter extraction function across varied document types, character sets, and formats without throwing unhandled exceptions.

## Corpus Inventory

### 01-narrative/
- **pride_and_prejudice.epub**
  - **Source**: Project Gutenberg (#1342)
  - **URL**: https://www.gutenberg.org/ebooks/1342
  - **Download Date**: 2026-10-10
  - **Format**: EPUB3
  - **Difficulty**: Standard narrative fiction with traditional chapter headings ("Chapter 1", etc.).
  - **License**: Public Domain (US / Project Gutenberg License)

- **moby_dick.epub**
  - **Source**: Project Gutenberg (#2701)
  - **URL**: https://www.gutenberg.org/ebooks/2701
  - **Download Date**: 2026-10-10
  - **Format**: EPUB3
  - **Difficulty**: Dense prose, archaic vocabulary, front matter ("Etymology", "Extracts"), 135 numbered chapters with thematic titles.
  - **License**: Public Domain (US / Project Gutenberg License)

### 02-poetry/
- **leaves_of_grass.epub**
  - **Source**: Project Gutenberg (#1322)
  - **URL**: https://www.gutenberg.org/ebooks/1322
  - **Download Date**: 2026-10-10
  - **Format**: EPUB3
  - **Difficulty**: Poetic structure, free verse, irregular line breaks, indented stanzas, varied section titles.
  - **License**: Public Domain (US / Project Gutenberg License)

### 03-nonenglish/
- **les_miserables_tome_1.epub**
  - **Source**: Project Gutenberg (#17489)
  - **URL**: https://www.gutenberg.org/ebooks/17489
  - **Download Date**: 2026-10-10
  - **Format**: EPUB3 (French)
  - **Difficulty**: Non-English Latin-1 / UTF-8 accents, multi-level hierarchy (Livre / Chapitre), French quotation dashes and typography.
  - **License**: Public Domain (US / Project Gutenberg License)

### 04-legacy-scan/
- **Status**: [TODO] Slot intentionally left empty.
  - **Difficulty**: Scanned typewriter OCR, skewed pages, noise artifacts.
  - **Notes**: Candidate identified is NIST 500-20 (1977) typewritten report (`ocr_calibration_sample.pdf`). Deferred to separate verification step to avoid large multi-page OCR latency during quick sweeps.

### 05-government/
- **Status**: [TODO] Slot intentionally left empty.
  - **Difficulty**: Multi-column technical report, tables, figures, metadata blocks.
  - **Notes**: USGS Open-File Report (1983 style) candidate search deferred to ensure clean standalone license verification and bounded size.

### 06-docx-rtf/
- **sample.docx**
  - **Source**: Generated locally from Pride and Prejudice text using `python-docx`.
  - **Format**: Microsoft Word OpenXML (`.docx`).
  - **Difficulty**: Structured headings (Level 1) and styled paragraph blocks via OpenXML container.
  - **License**: Public Domain (derived from Jane Austen's Pride and Prejudice)

- **sample.rtf**
  - **Source**: Generated locally from Pride and Prejudice text using standard RTF control words (`\rtf1\ansi`).
  - **Format**: Rich Text Format (`.rtf`).
  - **Difficulty**: Legacy text container format with font tables and paragraph control marks.
  - **License**: Public Domain (derived from Jane Austen's Pride and Prejudice)

### 07-epub/
- **common_sense.epub**
  - **Source**: Project Gutenberg (#147)
  - **URL**: https://www.gutenberg.org/ebooks/147
  - **Download Date**: 2026-10-10
  - **Format**: EPUB3 (Nonfiction / Political Treatise)
  - **Difficulty**: Non-fiction prose, political pamphlet structure, section introductions, numbered discourse sections.
  - **License**: Public Domain (US / Project Gutenberg License)

## Known Issues & Notes
- Slots `04-legacy-scan/` and `05-government/` are scaffolded and reserved for scanned PDF / government technical reports; pending verified standalone small public-domain specimens.
- Ingestion testing is invoked separately via `node scripts/run-corpus-tests.js` and is not part of the fast unit test runner.

