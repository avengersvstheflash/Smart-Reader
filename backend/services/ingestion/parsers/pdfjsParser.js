const fs = require('fs');
const path = require('path');
const { CanonicalDocument } = require('../models/canonicalContent');
const contentNormalizer = require('../normalizers/contentNormalizer');
const documentStructureAnalyzer = require('../structure/documentStructureAnalyzer');

/**
 * PDF Parser for Smart Reader (Build 3B.1.9)
 * Uses pdfjs-dist font-size and coordinate data to cleanly decompose
 * complex textbook layouts into canonical blocks without line interleaving.
 */
class PDFJSParser {
  /**
   * Parses a PDF buffer into structured chapters and canonical content
   * @param {Buffer} buffer
   * @param {object} options
   */
  async parse(buffer, options = {}) {
    if (!buffer || buffer.length === 0) {
      throw new Error('Empty PDF file buffer provided.');
    }

    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = new Uint8Array(buffer);
    const loadingTask = pdfjsLib.getDocument({
      data,
      useSystemFonts: true,
      disableFontFace: true,
    });

    let doc;
    try {
      doc = await loadingTask.promise;
    } catch (err) {
      throw new Error(`Failed to load PDF document: ${err.message}`);
    }

    const pageCount = doc.numPages;
    const pages = [];
    const allBlocks = [];
    let tablesCount = 0;

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await doc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const items = textContent.items || [];

      // Extract spans with coordinates and font sizes
      const spans = [];
      for (const item of items) {
        if (!item.str || item.str.trim() === '') continue;
        spans.push({
          text: item.str,
          fontSize: Math.round(item.transform[0] || item.height || 10),
          height: Math.round(item.height || 10),
          x: Math.round(item.transform[4] || 0),
          y: Math.round(item.transform[5] || 0),
          fontName: item.fontName || '',
        });
      }

      // Extract blocks for this page using font-size and coordinate rules
      const pageBlocks = this.extractBlocksFromSpans(spans, pageNum);
      allBlocks.push(...pageBlocks);

      // Build text representation of the page
      const pageText = pageBlocks.map((b) => b.text).join('\n\n');
      pages.push({
        num: pageNum,
        text: pageText,
        spans,
      });
    }

    // Check for scanned / image-only PDF with zero text
    const combinedRawText = pages.map((p) => p.text || '').join('\n\n').trim();
    if (!combinedRawText || combinedRawText.length < 20) {
      throw new Error(
        'This PDF document contains little or no selectable text. It may be a scanned image or bitmap document, which requires OCR (not supported in Build 2).'
      );
    }

    let docTitle = options.title || '';
    let docAuthor = options.author || '';

    // If title was not found, search for first heading
    if (!docTitle && allBlocks.length > 0) {
      const firstHeading = allBlocks.find((b) => b.type === 'heading' && b.level === 1);
      if (firstHeading && firstHeading.text && firstHeading.text.length < 100) {
        docTitle = firstHeading.text.replace(/^Chapter\s+\d+[:.]?\s*/i, '');
      }
    }

    // Perform structural analysis via DocumentStructureAnalyzer
    const analysis = documentStructureAnalyzer.analyze({
      format: 'pdf',
      pages,
      blocks: allBlocks,
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
   * Extracts canonical blocks from page spans using font-size and layout classification
   * Supports:
   * - Giant number + title fragments (e.g. CRC Press 90pt + 32pt)
   * - Two-line explicit Chapter openers (e.g. IEEE / SWEBOK: "CHAPTER 02" + "Software Architecture")
   * - Single-line explicit chapter headings
   * - Top-to-bottom reading order preservation
   * @param {Array<object>} spans
   * @param {number} pageNum
   */
  extractBlocksFromSpans(spans, pageNum) {
    const blocks = [];

    // Filter out footers, watermarks, DOI lines, and running headers
    // 1. Y < 50: Footer / DOI / copyright / ProQuest watermark
    // 2. Y > 610 with fontSize <= 10: Running header (e.g. "2 • Practical Machine Learning")
    const validSpans = spans.filter((s) => {
      if (s.y < 50) return false;
      if (s.y > 610 && s.fontSize <= 10) return false;
      return true;
    });

    if (validSpans.length === 0) return blocks;

    // Check for CRC Press giant-number style chapter opener on this page (fontSize >= 80)
    const giantNumberSpans = validSpans.filter((s) => s.fontSize >= 80);
    const titleFragmentSpans = validSpans.filter((s) => s.fontSize >= 28 && s.fontSize < 80);

    let crcChapterHeadingBlock = null;
    if (giantNumberSpans.length > 0 && titleFragmentSpans.length > 0) {
      const chNum = parseInt(giantNumberSpans[0].text.trim(), 10);
      titleFragmentSpans.sort((a, b) => {
        if (Math.abs(b.y - a.y) > 3) return b.y - a.y;
        return a.x - b.x;
      });

      const rawTitle = titleFragmentSpans
        .map((s) => s.text.trim())
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Normalize Unicode dash/hyphen/soft-hyphen to ASCII '-'
      const normalizedTitle = rawTitle
        .replace(/[\u2010\u2011\u2012\u2013\u2014\u00AD\uFE63\uFF0D]/g, '-')
        // Collapse "word - word" into "word-word" (space before hyphen)
        .replace(/(\w)\s+-\s+(\w)/g, '$1-$2')
        // Collapse "word- word" into "word-word" (space after hyphen)
        .replace(/(\w)-\s+(\w)/g, '$1-$2');

      let fullTitle = normalizedTitle;

      crcChapterHeadingBlock = {
        id: `blk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        type: 'heading',
        level: 1,
        text: `Chapter ${chNum}: ${fullTitle}`,
        sourcePage: pageNum,
        chapterHint: {
          number: chNum,
          title: fullTitle,
        },
      };
    }

    // Group remaining spans into horizontal lines
    // If CRC opener matched, exclude those giant number and title fragment spans from line grouping
    const spansToGroup = crcChapterHeadingBlock
      ? validSpans.filter((s) => s.fontSize < 28) // only body and section spans
      : validSpans;

    const allLines = this.groupSpansIntoLines(spansToGroup);
    let currentParagraph = [];
    let lastLineY = null;

    const flushParagraph = () => {
      if (currentParagraph.length > 0) {
        blocks.push({
          id: `blk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          type: 'paragraph',
          text: currentParagraph.join(' '),
          sourcePage: pageNum,
        });
        currentParagraph = [];
      }
    };

    let i = 0;
    while (i < allLines.length) {
      const line = allLines[i];
      const lineText = line.map((s) => s.text.trim()).join(' ').replace(/\s+/g, ' ').trim();
      if (!lineText) {
        i++;
        continue;
      }

      const maxLineFontSize = Math.max(...line.map((s) => s.fontSize));
      const lineY = line[0].y;

      // 1. Two-line explicit Chapter Opener:
      // Line i is "CHAPTER 01" / "CHAPTER 2" at top/middle of page (Y > 300)
      // and Line i+1 is a title heading (fontSize >= 14 or title-case text)
      const chKeywordMatch = lineText.match(/^(?:CHAPTER|PART)\s+(\d{1,2})\s*$/i);
      if (chKeywordMatch && lineY > 300 && i + 1 < allLines.length) {
        const nextLine = allLines[i + 1];
        const nextLineText = nextLine.map((s) => s.text.trim()).join(' ').replace(/\s+/g, ' ').trim();
        const nextLineFontSize = Math.max(...nextLine.map((s) => s.fontSize));

        // If next line is a distinct title heading (e.g. fontSize >= 14 and not a section number)
        if (nextLineFontSize >= 14 && !/^\d+\.\d+/.test(nextLineText)) {
          flushParagraph();
          const chNum = parseInt(chKeywordMatch[1], 10);

          // Accumulate all consecutive title lines that share heading font size (>= 16)
          const titleParts = [nextLineText];
          let consumed = 1;
          while (i + 1 + consumed < allLines.length) {
            const extraLine = allLines[i + 1 + consumed];
            const extraFontSize = Math.max(...extraLine.map((s) => s.fontSize));
            const extraText = extraLine.map((s) => s.text.trim()).join(' ').replace(/\s+/g, ' ').trim();
            if (extraFontSize >= 18 && !/^\d+\.\d+/.test(extraText) && !/^(?:INTRODUCTION|ACRONYMS|ABSTRACT|OVERVIEW)\b/i.test(extraText)) {
              titleParts.push(extraText);
              consumed++;
            } else {
              break;
            }
          }

          const fullTitle = titleParts.join(' ');
          blocks.push({
            id: `blk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            type: 'heading',
            level: 1,
            text: `Chapter ${chNum}: ${fullTitle}`,
            sourcePage: pageNum,
            chapterHint: {
              number: chNum,
              title: fullTitle,
            },
          });
          i += (1 + consumed);
          lastLineY = null;
          continue;
        }
      }

      // 2. Single-line explicit Chapter Opener: "Chapter 1: Title"
      const singleLineMatch = lineText.match(/^(?:Chapter|Part)\s+(\d{1,2})[:.—–-]\s*(.+)$/i);
      if (singleLineMatch && lineY > 300) {
        flushParagraph();
        const chNum = parseInt(singleLineMatch[1], 10);
        blocks.push({
          id: `blk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          type: 'heading',
          level: 1,
          text: `Chapter ${chNum}: ${singleLineMatch[2].trim()}`,
          sourcePage: pageNum,
          chapterHint: {
            number: chNum,
            title: singleLineMatch[2].trim(),
          },
        });
        i++;
        lastLineY = null;
        continue;
      }

      // 3. Standalone major heading (e.g. Contents, Foreword, Preface, Appendix, Index)
      if (maxLineFontSize >= 28) {
        flushParagraph();
        let fullTitle = lineText.replace(/(\w+)-\s+(\w+)/g, '$1-$2');

        if (/^appendix\b/i.test(fullTitle)) {
          const sub = fullTitle.replace(/^appendix\s*[:.—–-]?\s*/i, '').trim();
          fullTitle = sub ? `Appendix: ${sub}` : 'Appendix';
        }

        const isBookTitleCover = pageNum < 10 && /practical machine learning|guide to the software/i.test(fullTitle);

        blocks.push({
          id: `blk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          type: 'heading',
          level: isBookTitleCover ? 3 : 1,
          text: fullTitle,
          sourcePage: pageNum,
        });
        i++;
        lastLineY = null;
        continue;
      }

      // 4. Section Headings (14 <= fontSize < 28)
      if (maxLineFontSize >= 14 && maxLineFontSize < 28) {
        flushParagraph();
        blocks.push({
          id: `blk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          type: 'heading',
          level: 2,
          text: lineText,
          sourcePage: pageNum,
          section: lineText,
          sectionHint: lineText,
        });
        i++;
        lastLineY = null;
        continue;
      }

      // 5. Body Text (fontSize < 14)
      if (lastLineY !== null && Math.abs(lastLineY - lineY) > 20) {
        flushParagraph();
      }

      currentParagraph.push(lineText);
      lastLineY = lineY;
      i++;
    }

    flushParagraph();

    if (crcChapterHeadingBlock) {
      return [crcChapterHeadingBlock, ...blocks];
    }

    return blocks;
  }

  /**
   * Groups spans into horizontal lines by Y coordinate (within 3pt threshold)
   * and sorts lines from top to bottom (descending Y)
   */
  groupSpansIntoLines(spans) {
    if (!spans || spans.length === 0) return [];

    // Sort by Y descending, then X ascending
    const sorted = [...spans].sort((a, b) => {
      if (Math.abs(b.y - a.y) > 3) return b.y - a.y;
      return a.x - b.x;
    });

    const lines = [];
    let currentLine = [];
    let currentY = null;

    for (const span of sorted) {
      if (currentY === null || Math.abs(span.y - currentY) <= 3) {
        currentLine.push(span);
        currentY = span.y;
      } else {
        if (currentLine.length > 0) {
          currentLine.sort((a, b) => a.x - b.x);
          lines.push(currentLine);
        }
        currentLine = [span];
        currentY = span.y;
      }
    }

    if (currentLine.length > 0) {
      currentLine.sort((a, b) => a.x - b.x);
      lines.push(currentLine);
    }

    return lines;
  }

  /**
   * Compatibility method for synthetic page fixtures (e.g. from unit tests)
   */
  parseFromPages(pages, options = {}) {
    const allBlocks = [];
    for (const p of pages) {
      let spans = p.spans;
      if (!Array.isArray(spans) || spans.length === 0) {
        // Synthesize basic spans from page.text (split into lines, default fontSize 12, Y coordinate incrementing)
        const lines = (p.text || '').split('\n');
        spans = lines.map((line, idx) => ({
          text: line,
          fontSize: 12,
          height: 12,
          x: 0,
          y: 500 - (idx * 15),
          fontName: 'default',
        }));
      }
      const pBlocks = this.extractBlocksFromSpans(spans, p.num || 1);
      allBlocks.push(...pBlocks);
    }
    const combinedRawText = pages.map((p) => p.text || '').join('\n\n').trim();

    const analysis = documentStructureAnalyzer.analyze({
      format: 'pdf',
      pages,
      blocks: allBlocks,
      rawText: combinedRawText,
      metadata: {
        title: options.title || 'Document',
        author: options.author || 'Unknown Author',
      },
    });

    return {
      title: options.title || analysis.chapters[0]?.title || 'Document',
      author: options.author || 'Unknown Author',
      pageCount: options.totalPageCount || pages.length,
      chapterCount: analysis.chapterCount,
      sectionCount: analysis.sectionCount,
      tablesCount: analysis.tablesCount || 0,
      chapters: analysis.chapters,
      totalWordCount: analysis.totalWordCount,
      fullText: combinedRawText,
      integrityStatus: analysis.integrityStatus,
      integrityWarning: analysis.integrityWarning,
    };
  }
}

module.exports = new PDFJSParser();
