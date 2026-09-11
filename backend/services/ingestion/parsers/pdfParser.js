const { PDFParse } = require('pdf-parse');
const { CanonicalDocument } = require('../models/canonicalContent');
const contentNormalizer = require('../normalizers/contentNormalizer');

/**
 * PDF Parser for Smart Reader
 * Extracts text and structure page-by-page from PDF documents.
 * Recognizes document metadata, headings, sections, callouts/abstracts, and tables,
 * preserving original extracted text and associating canonical blocks with source pages.
 */
class PDFParser {
  /**
   * Parses a PDF buffer into structured chapters and canonical content
   * @param {Buffer} buffer
   * @param {object} options
   * @returns {Promise<{ title: string, author: string, pageCount: number, chapters: Array, fullText: string, tablesCount: number }>}
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

    // 1. Process pages into structured canonical blocks with sourcePage tracking
    const { blocks, detectedSections, tablesCount } = this.extractBlocksFromPages(pages);

    // If title was still not found, try to extract first heading
    if (!docTitle && blocks.length > 0) {
      const firstHeading = blocks.find((b) => b.type === 'heading');
      if (firstHeading && firstHeading.text && firstHeading.text.length < 80) {
        docTitle = firstHeading.text;
      }
    }

    // 2. Structure segmentation:
    // If the PDF has clear detected sections (e.g. Abstract, Introduction, Results, Chapter 1, etc.),
    // segment them into distinct chapters. Otherwise, provide a unified multi-page chapter.
    const chapters = this.segmentIntoChapters(blocks, detectedSections, {
      defaultTitle: docTitle || 'Document Content',
    });

    return {
      title: docTitle || 'Imported PDF Document',
      author: docAuthor || 'Unknown Author',
      pageCount,
      chapters,
      fullText: combinedRawText,
      tablesCount,
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
        // Examples: "1. Introduction", "Chapter 1", "Abstract", "Methodology", "Results & Discussion"
        const sectionMatch = this.detectSectionHeading(line);
        if (sectionMatch) {
          const headingBlock = {
            type: 'heading',
            level: sectionMatch.level || 2,
            text: sectionMatch.title,
            sourcePage: pageNum,
            section: sectionMatch.title,
          };
          blocks.push(headingBlock);
          detectedSections.push({
            title: sectionMatch.title,
            blockIndex: blocks.length - 1,
            sourcePage: pageNum,
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
              type: 'paragraph',
              text: caption,
              sourcePage: pageNum,
            });
            continue;
          }
        }

        // D. Regular Paragraph lines (accumulate until empty line or section/table)
        const paraLines = [];
        while (
          i < lines.length &&
          lines[i].trim() !== '' &&
          !this.detectSectionHeading(lines[i].trim()) &&
          !lines[i].trim().match(/^(?:Abstract|Executive Summary)[\s:—–-]+/i) &&
          !lines[i].trim().match(/^Table\s+\d+[:.]/i)
        ) {
          paraLines.push(lines[i].trim());
          i++;
        }

        if (paraLines.length > 0) {
          blocks.push({
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
   * Detects if a line looks like an academic paper or document section heading
   */
  detectSectionHeading(line) {
    if (line.length > 90 || /[.?!]$/.test(line)) return null;

    // Academic standard section keywords
    const academicSections = /^(?:(?:\d+\.?(?:\d+)?\s+)?(Abstract|Introduction|Related Work|Background|Methodology|Methods|System Design|Architecture|Experiments|Evaluation|Results|Discussion|Conclusion|Conclusions|References|Appendix|Acknowledgments))$/i;
    const academicMatch = line.match(academicSections);
    if (academicMatch) {
      return { title: line, level: 2 };
    }

    // Explicit chapter markers
    const chapterMatch = line.match(/^(?:Chapter|Section|Part|Act)\s+(?:\d+|[IVXLCDM]+|[A-Za-z]+)(?::\s*.+)?$/i);
    if (chapterMatch) {
      return { title: line, level: 1 };
    }

    // All Caps short lines without punctuation
    if (line.length >= 4 && line.length < 50 && /^[A-Z0-9\s:—–-]+$/.test(line) && !line.includes('PAGE') && !line.includes('HTTP')) {
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

  /**
   * Segments canonical blocks into chapters based on detected section boundaries
   */
  segmentIntoChapters(blocks, detectedSections, options = {}) {
    if (blocks.length === 0) {
      return [
        {
          title: options.defaultTitle || 'Document Content',
          content: '',
          canonicalBlocks: [],
          wordCount: 0,
        },
      ];
    }

    // If no distinct sections were detected, return single chapter
    if (detectedSections.length === 0) {
      const doc = new CanonicalDocument(blocks);
      const content = doc.toPlainText();
      return [
        {
          number: 1,
          title: options.defaultTitle || 'Full Document',
          content,
          canonicalBlocks: blocks,
          wordCount: doc.calculateWordCount(),
        },
      ];
    }

    // Segment blocks by detected section indices
    const chapters = [];
    const firstSectionIdx = detectedSections[0].blockIndex;

    // Handle introductory content before the first section heading
    if (firstSectionIdx > 0) {
      const preBlocks = blocks.slice(0, firstSectionIdx);
      const preDoc = new CanonicalDocument(preBlocks);
      const preContent = preDoc.toPlainText();
      if (preContent.length > 30) {
        chapters.push({
          number: 1,
          title: 'Opening & Overview',
          content: preContent,
          canonicalBlocks: preBlocks,
          wordCount: preDoc.calculateWordCount(),
        });
      }
    }

    for (let s = 0; s < detectedSections.length; s++) {
      const current = detectedSections[s];
      const startIdx = current.blockIndex;
      const endIdx = s < detectedSections.length - 1 ? detectedSections[s + 1].blockIndex : blocks.length;

      const sectionBlocks = blocks.slice(startIdx, endIdx);
      const sectionDoc = new CanonicalDocument(sectionBlocks);
      const sectionContent = sectionDoc.toPlainText();

      chapters.push({
        number: chapters.length + 1,
        title: current.title,
        content: sectionContent,
        canonicalBlocks: sectionBlocks,
        wordCount: sectionDoc.calculateWordCount(),
      });
    }

    return chapters.length > 0
      ? chapters
      : [
          {
            number: 1,
            title: options.defaultTitle || 'Document',
            content: new CanonicalDocument(blocks).toPlainText(),
            canonicalBlocks: blocks,
            wordCount: new CanonicalDocument(blocks).calculateWordCount(),
          },
        ];
  }
}

module.exports = new PDFParser();
