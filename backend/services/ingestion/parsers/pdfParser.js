const { PDFParse } = require('pdf-parse');
const { CanonicalDocument } = require('../models/canonicalContent');
const contentNormalizer = require('../normalizers/contentNormalizer');
const documentStructureAnalyzer = require('../structure/documentStructureAnalyzer');

/**
 * PDF Parser for Smart Reader (Build 3B.1)
 * Extracts text and structure page-by-page from PDF documents.
 * Employs DocumentStructureAnalyzer to understand document hierarchy:
 * - Table of Contents detection & chapter boundary anchoring
 * - Distinction between Chapters, Sections (1.1, 1.2), and Tables
 * - Running headers / footers suppression
 * - Preserving page provenance (sourcePage)
 */
class PDFParser {
  /**
   * Parses a PDF buffer into structured chapters and canonical content
   * @param {Buffer} buffer
   * @param {object} options
   * @returns {Promise<{ title: string, author: string, pageCount: number, chapters: Array, fullText: string, tablesCount: number, sectionCount: number, integrityStatus: string, integrityWarning: string }>}
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

    // Check for scanned / image-only PDF with zero text
    const combinedRawText = pages.map((p) => p.text || '').join('\n\n').trim();
    if (!combinedRawText || combinedRawText.length < 20) {
      throw new Error(
        'This PDF document contains little or no selectable text. It may be a scanned image or bitmap document, which requires OCR (not supported in Build 2).'
      );
    }

    // Extract metadata if available
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

    // 1. Process pages into structured canonical blocks with sourcePage and table detection
    const { blocks, tablesCount } = this.extractBlocksFromPages(pages);

    // If title was still not found, try to extract first heading
    if (!docTitle && blocks.length > 0) {
      const firstHeading = blocks.find((b) => b.type === 'heading');
      if (firstHeading && firstHeading.text && firstHeading.text.length < 80) {
        docTitle = firstHeading.text;
      }
    }

    // 2. Structural Analysis via DocumentStructureAnalyzer
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
        // Examples: "1. Introduction", "1.1 Background", "Chapter 1", "Abstract", "Methodology"
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

        // Ambiguous chapter opener candidate: emit as paragraph block with preserved sourcePage and sectionHint
        // Defers final boundary interpretation to DocumentStructureEngine
        if (this.isAmbiguousChapterOpener(line)) {
          blocks.push({
            id: `blk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            type: 'paragraph',
            text: line,
            sourcePage: pageNum,
            sectionHint: line,
          });
          i++;
          continue;
        }

        // B. Check for Callout (e.g. Abstract or Note)
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

        // C. Check for Tabular data or Table Caption ("Table 1: ...", "Table 2. ...")
        const tableCaptionMatch = line.match(/^Table\s+(\d+[:.]?\s*[^\n]*)/i);
        const isTabularCandidate = this.isTabularLine(line);

        if (tableCaptionMatch || (isTabularCandidate && i + 1 < lines.length && this.isTabularLine(lines[i + 1].trim()))) {
          let caption = '';
          if (tableCaptionMatch) {
            caption = line;
            i++; // move past caption
          }

          // Gather tabular rows
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
            // Not a multi-row table, just add caption as text
            blocks.push({
              id: `blk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              type: 'paragraph',
              text: caption,
              sourcePage: pageNum,
            });
            continue;
          }
        }

        // D. Regular Paragraph lines (accumulate until empty line or section/table/opener)
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
   * Checks if a line might be an ambiguous chapter opener (glued number-title, DOI prefix, publisher metadata)
   * that should be emitted as a paragraph block and deferred to documentStructureEngine.
   */
  isAmbiguousChapterOpener(line) {
    if (!line || typeof line !== 'string') return false;
    const trimmed = line.trim();
    if (trimmed.length > 180 || /[.?!]$/.test(trimmed)) return false;

    // Glued number and title (e.g. "1Fundamentals of machine learning")
    if (/^\s*\d+[A-Z][a-zA-Z]{2,}/.test(trimmed)) return true;

    // Publisher DOI / metadata with embedded chapter number and title
    if (/DOI:\s*[\d.\/-]+/i.test(trimmed) && /\d+\s*[A-Z][a-zA-Z]/.test(trimmed)) return true;

    // Short standalone number followed by chapter title without punctuation: e.g. "1 Fundamentals of machine learning"
    if (/^\s*\d+\s+[A-Z][a-zA-Z0-9\s—–-]{3,60}$/.test(trimmed) && !trimmed.includes('.')) return true;

    return false;
  }

  /**
   * Detects if a line looks like an academic paper or document section heading
   */
  detectSectionHeading(line) {
    if (line.length > 90) return null;
    const isNumbered = /^(\d+\.\d+(?:\.\d+)?)\s+/.test(line);
    if (!isNumbered && /[.!]$/.test(line)) return null;

    // Academic standard section keywords
    const academicSections = /^(?:(?:\d+\.?(?:\d+)?\s+)?(Abstract|Introduction|Related Work|Background|Methodology|Methods|System Design|Architecture|Experiments|Evaluation|Results|Discussion|Conclusion|Conclusions|References|Appendix|Acknowledgments|Index|Glossary|Preface|Foreword))$/i;
    const academicMatch = line.match(academicSections);
    if (academicMatch) {
      return { title: line, level: 2 };
    }

    // Explicit chapter markers
    const chapterMatch = line.match(/^(?:Chapter|Section|Part|Act)\s+(?:\d+|[IVXLCDM]+|[A-Za-z]+)(?::\s*.+)?$/i);
    if (chapterMatch) {
      return { title: line, level: 1 };
    }

    // Numbered sections like "1.1 Introduction" or "1.1 WHAT IS MACHINE LEARNING?"
    const numberedSecMatch = line.match(/^(\d+\.\d+(?:\.\d+)?)\s+([A-Z][A-Za-z0-9\s—–\?.,'"-]{2,60})$/);
    if (numberedSecMatch) {
      const dots = numberedSecMatch[1].split('.').length - 1;
      return { title: line, level: Math.min(4, Math.max(2, dots + 1)) };
    }

    // All Caps short lines without trailing sentence punctuation that are clearly headings
    if (line.length >= 6 && line.length < 45 && /^[A-Z0-9\s:—–\?-]+$/.test(line) && !line.includes('PAGE') && !line.includes('HTTP') && !/^\d+$/.test(line)) {
      return { title: line, level: 2 };
    }

    return null;
  }

  /**
   * Checks whether a line appears to contain tabular columnar data
   * (e.g. separated by tabs, pipes, or 2+ consecutive spaces)
   */
  isTabularLine(line) {
    if (!line || line.length < 6) return false;
    if (line.includes('|') && line.split('|').length >= 3) return true;
    if (line.includes('\t') && line.split('\t').length >= 2) return true;
    const parts = line.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
    return parts.length >= 2 && parts.length <= 8;
  }

  /**
   * Splits a tabular text line into individual cell values
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
