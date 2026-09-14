const { PDFParse } = require('pdf-parse');
const { CanonicalDocument } = require('../models/canonicalContent');
const contentNormalizer = require('../normalizers/contentNormalizer');
const documentStructureAnalyzer = require('../structure/documentStructureAnalyzer');

/**
 * PDF Parser for Smart Reader (Build 3B.1.8)
 * Extracts text and structure page-by-page from PDF documents.
 *
 * Responsibilities (per Build 3B.1.7 boundary rule):
 *  - Extraction / preservation ONLY.
 *  - No irreversible chapter-boundary decisions.
 *  - Emit blocks + sectionHint + (when detected) chapterHint.
 *  - Defer structural interpretation to DocumentStructureEngine.
 *
 * Additions in 3B.1.8:
 *  - extractChapterOpenerHint(): clean { number, title } from glued DOI lines
 *  - chapterHint attached to ambiguous chapter opener blocks
 *  - Tighter all-caps heading detection (rejects subsection-style sentences)
 *  - Extended character classes in numbered and glued-title patterns
 */
class PDFParser {
  /**
   * Parses a PDF buffer into structured chapters and canonical content
   */
  async parse(buffer, options = {}) {
    if (!buffer || buffer.length === 0) {
      throw new Error('Empty PDF file buffer provided.');
    }

    const parser = new PDFParse({ data: buffer });
    let infoResult;
    let textResult;

    try {
      infoResult = await parser.getInfo().catch(() => null);
      textResult = await parser.getText();
    } catch (err) {
      throw new Error(`Failed to parse PDF document: ${err.message}`);
    } finally {
      await parser.destroy().catch(() => {});
    }

    const pageCount = textResult.total || (textResult.pages ? textResult.pages.length : 1);
    const pages = textResult.pages || [];

    const combinedRawText = pages.map((p) => p.text || '').join('\n\n').trim();
    if (!combinedRawText || combinedRawText.length < 20) {
      throw new Error(
        'This PDF document contains little or no selectable text. It may be a scanned image or bitmap document, which requires OCR (not supported in Build 2).'
      );
    }

    let docTitle = options.title || '';
    if (!docTitle && infoResult?.info?.Title) {
      docTitle = String(infoResult.info.Title).trim();
    }
    let docAuthor = options.author || '';
    if (!docAuthor && infoResult?.info?.Author) {
      docAuthor = String(infoResult.info.Author).trim();
    }

    return this.parseFromPages(pages, {
      ...options,
      title: docTitle,
      author: docAuthor,
      totalPageCount: pageCount,
    });
  }

  /**
   * Parses pre-extracted page structures directly through the canonical block & structure pipeline
   */
  parseFromPages(pages, options = {}) {
    const pageCount = options.totalPageCount || pages.length;
    const combinedRawText = pages.map((p) => p.text || '').join('\n\n').trim();
    if (!combinedRawText || combinedRawText.length < 20) {
      throw new Error(
        'This PDF document contains little or no selectable text. It may be a scanned image or bitmap document, which requires OCR (not supported in Build 2).'
      );
    }

    let docTitle = options.title || '';
    let docAuthor = options.author || '';

    const { blocks, tablesCount } = this.extractBlocksFromPages(pages);

    if (!docTitle && blocks.length > 0) {
      const firstHeading = blocks.find((b) => b.type === 'heading');
      if (firstHeading && firstHeading.text && firstHeading.text.length < 80) {
        docTitle = firstHeading.text;
      }
    }

    const analysis = documentStructureAnalyzer.analyze({
      format: 'pdf',
      pages,
      blocks,
      rawText: combinedRawText,
      metadata: {
        title: docTitle || options.originalFilename || 'Imported PDF Document',
        author: docAuthor || 'Unknown Author',
      },
    });

    const finalTitle = docTitle || analysis.chapters[0]?.title || 'Imported PDF Document';

    return {
      title: finalTitle,
      author: docAuthor || 'Unknown Author',
      pageCount,
      chapterCount: analysis.chapterCount,
      sectionCount: analysis.sectionCount,
      tablesCount: analysis.tablesCount || tablesCount,
      chapters: analysis.chapters,
      totalWordCount: analysis.totalWordCount,
      fullText: combinedRawText,
      integrityStatus: analysis.integrityStatus,
      integrityWarning: analysis.integrityWarning,
    };
  }

  /**
   * Extracts canonical blocks across all pages, annotating each block with sourcePage
   */
  extractBlocksFromPages(pages) {
    const blocks = [];
    const detectedSections = [];
    let tablesCount = 0;

    for (const page of pages) {
      const pageNum = page.num || 1;
      const normalizedPageText = contentNormalizer.normalize(page.text || '');
      if (!normalizedPageText) continue;

      const lines = normalizedPageText.split('\n');
      let i = 0;

      while (i < lines.length) {
        const line = lines[i].trim();
        if (!line) {
          i++;
          continue;
        }

        // A. Check for Section or Chapter Heading
        const sectionMatch = this.detectSectionHeading(line);
        if (sectionMatch) {
          const headingBlock = {
            id: `blk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            type: 'heading',
            level: sectionMatch.level || 2,
            text: sectionMatch.title,
            sourcePage: pageNum,
            section: sectionMatch.title,
            sectionHint: sectionMatch.title,
          };
          blocks.push(headingBlock);
          detectedSections.push({
            title: sectionMatch.title,
            level: sectionMatch.level || 2,
            blockIndex: blocks.length - 1,
            sourcePage: pageNum,
          });
          i++;
          continue;
        }

        // Ambiguous chapter opener candidate: emit as paragraph with
        // preserved sourcePage, sectionHint, and (best-effort) chapterHint.
        // Defers final boundary interpretation to DocumentStructureEngine.
        if (this.isAmbiguousChapterOpener(line)) {
          const chapterHint = this.extractChapterOpenerHint(line);
          blocks.push({
            id: `blk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            type: 'paragraph',
            text: line,
            sourcePage: pageNum,
            sectionHint: line,
            chapterHint: chapterHint || null,
          });
          i++;
          continue;
        }

        // B. Callout (Abstract / Executive Summary)
        const abstractMatch = line.match(/^(?:Abstract|Executive Summary)[\s:—–-]+(.*)$/i);
        if (abstractMatch) {
          const calloutText = abstractMatch[1].trim()
            ? abstractMatch[1].trim()
            : (lines[i + 1] ? lines[++i].trim() : '');
          blocks.push({
            id: `blk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            type: 'callout',
            tone: 'abstract',
            title: 'Abstract',
            text: calloutText,
            sourcePage: pageNum,
          });
          i++;
          continue;
        }

        // C. Table
        const tableCaptionMatch = line.match(/^Table\s+(\d+[:.]?\s*[^\n]*)/i);
        const isTabularCandidate = this.isTabularLine(line);

        if (tableCaptionMatch || (isTabularCandidate && i + 1 < lines.length && this.isTabularLine(lines[i + 1].trim()))) {
          let caption = '';
          if (tableCaptionMatch) {
            caption = line;
            i++;
          }

          const tableRows = [];
          while (i < lines.length && lines[i].trim() && this.isTabularLine(lines[i].trim())) {
            const cells = this.splitTabularCells(lines[i].trim());
            if (cells.length >= 2) {
              tableRows.push(cells);
            }
            i++;
          }

          if (tableRows.length >= 2) {
            const headers = tableRows[0];
            const rows = tableRows.slice(1);
            blocks.push({
              id: `blk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              type: 'table',
              caption,
              headers,
              rows,
              sourcePage: pageNum,
            });
            tablesCount++;
            continue;
          } else if (caption) {
            blocks.push({
              id: `blk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              type: 'paragraph',
              text: caption,
              sourcePage: pageNum,
            });
            continue;
          }
        }

        // D. Regular Paragraph accumulation
        const paraLines = [];
        while (
          i < lines.length &&
          lines[i].trim() !== '' &&
          !this.detectSectionHeading(lines[i].trim()) &&
          !this.isAmbiguousChapterOpener(lines[i].trim()) &&
          !lines[i].trim().match(/^(?:Abstract|Executive Summary)[\s:—–-]+/i) &&
          !lines[i].trim().match(/^Table\s+\d+[:.]/i)
        ) {
          paraLines.push(lines[i].trim());
          i++;
        }

        if (paraLines.length > 0) {
          blocks.push({
            id: `blk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            type: 'paragraph',
            text: paraLines.join(' '),
            sourcePage: pageNum,
          });
        }
      }
    }

    return { blocks, detectedSections, tablesCount };
  }

  /**
   * Best-effort extraction of { number, title } from a chapter opener line.
   * Handles DOI prefixes, license disclaimers, and glued number-title forms.
   * Returns null if the line is not confidently a chapter opener.
   *
   * Examples successfully parsed:
   *   "1\tDOI: 10.1201/9781003486817-1 1Fundamentals of machine learning"
   *   "18 \tDOI: 10.1201/... license. 2Mathematics for machine learning"
   *   "DOI: 10.1201/...-4 95 ... license. 4Machine learning operations"
   *   "1 Fundamentals of machine learning"
   *   "5 Machine learning software and hardware requirements"
   */
  extractChapterOpenerHint(line) {
    if (!line || typeof line !== 'string') return null;

    let text = line.trim();
    const hadMetadata = /DOI:\s*[\d.\/-]+/i.test(text) || /This chapter has been made available under/i.test(text);
    const hadLeadingNumber = /^\s*\d+\s*[\t\s]+/.test(text);
    if (!hadMetadata && !hadLeadingNumber) return null;

    // 1. Strip license disclaimer FIRST — it contains "4.0" which confuses later steps.
    text = text.replace(/This chapter has been made available under[^\n]*?license\.?/gi, ' ');

    // 2. Strip DOI URI.
    text = text.replace(/\bDOI:\s*10\.\d{4,9}\/[^\s]+/gi, ' ');

    // 3. Strip leading page number ("18 \t", "76 ", etc).
    text = text.replace(/^\s*\d+\s*[\t\s]+/, ' ');

    // 4. Strip any middle page number that precedes a glued chapter number (" 95 4Machine").
    text = text.replace(/\s+\d+\s+(?=\d+[A-Z])/g, ' ');

    // 5. Strip trailing folio.
    text = text.replace(/\s+\d+\s*$/, '');

    // 6. Collapse whitespace.
    text = text.replace(/\s+/g, ' ').trim();

    // 7. Match glued ("2Mathematics...") or spaced ("2 Mathematics...") chapter openers.
    const match = text.match(/^(\d+)\s*([A-Z][a-zA-Z][a-zA-Z0-9\s—–\-,&:;'"?()]{2,120})$/);
    if (!match) return null;

    const num = parseInt(match[1], 10);
    const title = match[2].trim();

    if (!Number.isFinite(num) || num < 1 || num > 100) return null;
    if (title.length < 3) return null;

    // Sanity: reject if title looks like a fragment of the license text.
    if (/^license\b/i.test(title) || /^DOI:/i.test(title)) return null;

    return { number: num, title, rawTitle: title };
  }

  /**
   * Detects potential ambiguous chapter openers (glued number-title, DOI prefix,
   * publisher metadata) that should be emitted as paragraph blocks and deferred
   * to documentStructureEngine.
   */
  isAmbiguousChapterOpener(line) {
    if (!line || typeof line !== 'string') return false;
    const trimmed = line.trim();

    // Hard exclusions: too long, or ends with strong sentence punctuation.
    if (trimmed.length > 200) return false;
    if (/[.!?]$/.test(trimmed) && !/\d+[A-Z]/.test(trimmed)) return false;

    // (a) Glued number + Capitalized word: "1Fundamentals of machine learning"
    if (/^\s*\d+[A-Z][a-zA-Z]{2,}/.test(trimmed)) return true;

    // (b) DOI metadata with embedded chapter number and title.
    if (/DOI:\s*[\d.\/-]+/i.test(trimmed) && /\d+\s*[A-Z][a-zA-Z]/.test(trimmed)) return true;

    // (c) Standalone number followed by capitalized title without sentence punctuation:
    //     "1 Fundamentals of machine learning"
    if (
      /^\s*\d+\s+[A-Z][a-zA-Z0-9\s—–\-,&:;'"?()]{3,120}$/.test(trimmed) &&
      !/[.!?]$/.test(trimmed)
    ) {
      return true;
    }

    return false;
  }

  /**
   * Detects if a line looks like an academic paper or document section heading
   */
  detectSectionHeading(line) {
    if (line.length > 90) return null;
    const isNumbered = /^(\d+\.\d+(?:\.\d+)?)\s+/.test(line);
    if (!isNumbered && /[.!]$/.test(line)) return null;

    // Academic standard section keywords (front / back matter)
    const academicSections = /^(?:(?:\d+\.?(?:\d+)?\s+)?(Abstract|Introduction|Related Work|Background|Methodology|Methods|System Design|Architecture|Experiments|Evaluation|Results|Discussion|Conclusion|Conclusions|References|Appendix|Acknowledgments|Index|Glossary|Preface|Foreword))$/i;
    const academicMatch = line.match(academicSections);
    if (academicMatch) {
      return { title: line, level: 2 };
    }

    // Explicit chapter markers: "Chapter 1", "Part II", "Section 3", etc.
    const chapterMatch = line.match(/^(?:Chapter|Section|Part|Act)\s+(?:\d+|[IVXLCDM]+|[A-Za-z]+)(?::\s*.+)?$/i);
    if (chapterMatch) {
      return { title: line, level: 1 };
    }

    // Numbered sections like "1.1 Introduction" or "1.1 WHAT IS MACHINE LEARNING?"
    // Extended character class to allow '?' ',' "'" and other punctuation in titles.
    const numberedSecMatch = line.match(/^(\d+\.\d+(?:\.\d+)?)\s+([A-Z][A-Za-z0-9\s—–\?.,'"()&:;-]{2,80})$/);
    if (numberedSecMatch) {
      const dots = numberedSecMatch[1].split('.').length - 1;
      return { title: line, level: Math.min(4, Math.max(2, dots + 1)) };
    }

    // All-caps short lines. Tightened in 3B.1.8 to reject subsection-style sentences.
    if (
      line.length >= 6 &&
      line.length < 45 &&
      /^[A-Z0-9\s:—–\?-]+$/.test(line) &&
      !line.includes('PAGE') &&
      !line.includes('HTTP') &&
      !/^\d+$/.test(line)
    ) {
      const words = line.split(/\s+/).filter((w) => w.length > 0);
      // Reject if too many words (likely a sentence, not a heading).
      if (words.length > 6) return null;
      // Reject if it contains AND / OR / WITH / FOR plus 4+ words (subsection-style).
      const hasConnector = /\b(AND|OR|WITH|FOR)\b/.test(line);
      if (hasConnector && words.length >= 4) return null;
      return { title: line, level: 2 };
    }

    return null;
  }

  /**
   * Checks whether a line appears to contain tabular columnar data.
   */
  isTabularLine(line) {
    if (!line || line.length < 6) return false;
    if (line.includes('|') && line.split('|').length >= 3) return true;
    if (line.includes('\t') && line.split('\t').length >= 2) return true;
    const parts = line.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
    return parts.length >= 2 && parts.length <= 8;
  }

  /**
   * Splits a tabular text line into individual cell values.
   */
  splitTabularCells(line) {
    if (line.includes('|')) {
      let raw = line.trim();
      if (raw.startsWith('|')) raw = raw.slice(1);
      if (raw.endsWith('|')) raw = raw.slice(0, -1);
      return raw.split('|').map((s) => s.trim());
    }
    if (line.includes('\t')) {
      return line.split('\t').map((s) => s.trim()).filter(Boolean);
    }
    return line.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
  }
}

module.exports = new PDFParser();