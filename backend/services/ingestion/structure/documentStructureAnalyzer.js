const { CanonicalDocument } = require('../models/canonicalContent');
const documentStructureEngine = require('../../structure/documentStructureEngine');

/**
 * Document Structure Analyzer for Smart Reader (Build 3B.1)
 * 
 * Provides structural intelligence across document types:
 * - Differentiates Document vs Chapter vs Section vs Metadata
 * - Detects Table of Contents (TOC) and anchors genuine chapter boundaries
 * - Suppresses running headers, footers, and repeated artifacts
 * - Keeps subheadings (1.1, 1.2, etc.) as sections within their parent chapter
 * - Preserves tables, callouts, and page provenance (sourcePage)
 * - Identifies Front Matter, Body Chapters, and Back Matter
 * - Detects empty/unusable content truthfully
 */
class DocumentStructureAnalyzer {
  /**
   * Main analysis entry point
   * @param {object} params
   * @param {string} params.format - 'pdf', 'epub', 'markdown', 'text', 'web'
   * @param {Array<object>} [params.pages] - Array of { num: number, text: string, lines: Array<string> }
   * @param {Array<object>} [params.blocks] - Pre-extracted Canonical blocks with metadata
   * @param {string} [params.rawText] - Raw text if blocks/pages not available
   * @param {object} [params.metadata] - Title, author, originalFilename
   * @returns {object} Structured document analysis
   */
  analyze({ format = 'text', pages = [], blocks = [], rawText = '', metadata = {} }) {
    if (format === 'pdf' && pages.length > 0) {
      return this.analyzePdfStructure(pages, blocks, metadata);
    }

    if (format === 'web' && blocks.length > 0) {
      return this.analyzeWebStructure(blocks, metadata);
    }

    // Markdown or Plain Text
    return this.analyzeTextOrMarkdownStructure(blocks, rawText, format, metadata);
  }

  /**
   * Analyzes PDF document structure using pages, layout cues, running headers, and TOC
   */
  analyzePdfStructure(pages, initialBlocks = [], metadata = {}) {
    const pageCount = pages.length;

    // Use DocumentStructureEngine for robust, multi-signal structure analysis
    const tree = documentStructureEngine.buildStructureTree({
      format: 'pdf',
      pages,
      blocks: initialBlocks,
      metadata,
    });

    let totalSectionCount = 0;
    let totalTablesCount = 0;

    const chapters = tree.chapters.map((ch, idx) => {
      const tables = (ch.canonicalBlocks || []).filter((b) => b.type === 'table');
      totalTablesCount += tables.length;
      totalSectionCount += (ch.sectionCount || 0);

      const startPage = ch.sourceLocation?.startPage || ch.startPage || 1;
      const endPage = ch.sourceLocation?.endPage || ch.endPage || startPage;

      return {
        number: idx + 1,
        title: ch.title,
        structuralRole: ch.structuralRole || 'chapter',
        startPage,
        endPage,
        canonicalBlocks: ch.canonicalBlocks,
        sections: ch.sections,
        sectionCount: ch.sectionCount,
        content: ch.content,
        wordCount: ch.wordCount,
        confidence: ch.confidence,
        sourceLocation: ch.sourceLocation,
        metadata: {
          startPage,
          endPage,
          sectionsCount: ch.sectionCount,
          tablesCount: tables.length,
          structuralRole: ch.structuralRole,
          confidence: ch.confidence,
        },
      };
    });

    const isZeroContent = tree.totalWordCount === 0 || chapters.length === 0;

    return {
      documentType: 'textbook',
      pageCount,
      chapterCount: chapters.length,
      sectionCount: totalSectionCount,
      tablesCount: totalTablesCount,
      totalWordCount: tree.totalWordCount,
      chapters,
      tocDetected: Boolean(tree.confidence > 0.8),
      confidence: tree.confidence,
      integrityStatus: isZeroContent ? 'empty_content' : 'valid',
      integrityWarning: isZeroContent
        ? 'Content extraction incomplete: no selectable text found in the PDF source.'
        : '',
    };
  }

  /**
   * Detects repeated running headers and footers across PDF pages
   */
  detectRunningHeadersAndFooters(pages) {
    const linePageMap = new Map();

    for (const page of pages) {
      const lines = (page.text || '')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 2 && l.length < 90);

      // Check first 3 lines (headers) and last 3 lines (footers)
      const candidateLines = [
        ...lines.slice(0, 3),
        ...lines.slice(-3),
      ];

      const seenOnThisPage = new Set();
      for (const line of candidateLines) {
        const normalized = line.replace(/\d+/g, '#').toLowerCase();
        if (!seenOnThisPage.has(normalized)) {
          seenOnThisPage.add(normalized);
          linePageMap.set(normalized, (linePageMap.get(normalized) || 0) + 1);
        }
      }
    }

    const runningArtifacts = new Set();
    for (const [normLine, count] of linePageMap.entries()) {
      // If it appears on 3 or more pages and covers > 10% of document or >= 3 pages
      if (count >= 3 && (count >= pages.length * 0.08 || count >= 4)) {
        runningArtifacts.add(normLine);
      }
    }

    return runningArtifacts;
  }

  /**
   * Detects Table of Contents and parses chapter entries
   */
  detectTableOfContents(earlyPages) {
    let hasToc = false;
    let tocStartPage = -1;
    let tocEndPage = -1;
    const entries = [];

    const tocHeadingRegex = /^(?:table\s+of\s+contents|contents|brief\s+contents)$/i;

    for (let i = 0; i < earlyPages.length; i++) {
      const page = earlyPages[i];
      const lines = (page.text || '').split('\n').map(l => l.trim());

      const foundTocHeading = lines.some(l => tocHeadingRegex.test(l));
      if (foundTocHeading) {
        hasToc = true;
        tocStartPage = page.num;
        tocEndPage = page.num;

        // Check if next pages are continuations of TOC
        for (let j = i; j < earlyPages.length; j++) {
          const checkPage = earlyPages[j];
          const pageLines = (checkPage.text || '').split('\n').map(l => l.trim());
          const dotCount = (checkPage.text || '').split('.').length;
          const pageNumCount = pageLines.filter(l => /\d+\s*$/.test(l)).length;

          // TOC pages typically have many dotted leaders or page numbers at line ends
          if (dotCount > 20 || pageNumCount >= 5 || j === i) {
            tocEndPage = checkPage.num;
            // Parse TOC entries
            for (const line of pageLines) {
              const entry = this.parseTocLine(line);
              if (entry) {
                entries.push(entry);
              }
            }
          } else {
            break;
          }
        }
        break;
      }
    }

    return {
      hasToc,
      tocStartPage,
      tocEndPage,
      entries,
    };
  }

  /**
   * Parses a single TOC line into { title, chapterNumber, page }
   */
  parseTocLine(line) {
    if (!line || line.length < 5) return null;

    // Pattern: Chapter 1 Introduction ........... 1
    // Pattern: 1.1 What is Distributed Systems .. 5
    // Pattern: 1 Foundations .................. 10
    const match = line.match(/^(?:Chapter\s+(\d+|[IVXLCDM]+)[:.]?\s+)?(.+?)(?:\.{2,}|\s{3,})(\d+)\s*$/i);
    if (match) {
      const chNum = match[1] || null;
      const title = match[2].trim();
      const page = parseInt(match[3], 10);
      const isSubSection = /^(\d+\.\d+|[A-Z]\.\d+|section\s+\d+\.\d+|subsection)/i.test(title) || (chNum && chNum.includes('.'));

      return {
        chapterNumber: chNum,
        title,
        page,
        isChapter: !isSubSection && (Boolean(chNum) || /^[A-Z]/.test(title)),
        isSubSection,
      };
    }

    return null;
  }

  /**
   * Identifies genuine PDF chapter boundaries using TOC or multi-signal detection
   */
  identifyPdfChapterBoundaries(pages, tocInfo, runningArtifacts) {
    const boundaries = [];
    const pageCount = pages.length;

    // 1. If TOC detected valid chapter entries with starting page numbers
    if (tocInfo.hasToc && tocInfo.entries && tocInfo.entries.length > 0) {
      const majorTocChapters = tocInfo.entries.filter(e => e.isChapter && !e.isSubSection && e.page > 0);

      if (majorTocChapters.length >= 2) {
        // Front Matter is page 1 up to the first major chapter
        const firstMajorPage = Math.min(...majorTocChapters.map(c => c.page));
        if (firstMajorPage > 1) {
          boundaries.push({
            pageNumber: 1,
            title: 'Front Matter & Overview',
            role: 'front_matter',
          });
        }

        // Add each TOC major chapter
        for (const tocCh of majorTocChapters) {
          // Verify the page exists within the PDF page bounds
          const actualPage = Math.min(pageCount, Math.max(1, tocCh.page));
          // Avoid duplicate page numbers
          if (!boundaries.some(b => b.pageNumber === actualPage)) {
            boundaries.push({
              pageNumber: actualPage,
              title: tocCh.title.startsWith('Chapter') ? tocCh.title : `Chapter ${tocCh.chapterNumber || boundaries.length}: ${tocCh.title}`,
              role: 'chapter',
            });
          }
        }

        // Sort by page number
        boundaries.sort((a, b) => a.pageNumber - b.pageNumber);
        if (boundaries.length >= 2) {
          return boundaries;
        }
      }
    }

    // 2. Heuristic Multi-Signal Chapter Boundary Detection
    // Used when TOC is absent or cannot resolve page numbers
    const detectedChapters = [];
    let hasFrontMatter = false;

    // Regex for genuine chapter headers (NOT 1.1 or 1.2 subsections)
    const chapterHeaderRegex = /^(?:chapter|part|book|volume)\s+(\d+|[ivxlcdm]+|[a-z]+)(?:\s*[:.—–-]\s*(.+))?$/i;
    const standaloneNumberedChapterRegex = /^(\d+)\s+([A-Z][A-Za-z0-9\s—–-]{3,60})$/;
    const backMatterRegex = /^(?:appendix(?:\s+[a-z0-9]+)?|references|bibliography|glossary|index)(?:\s*[:.—–-]\s*(.+))?$/i;

    for (let pIdx = 0; pIdx < pages.length; pIdx++) {
      const page = pages[pIdx];
      const lines = (page.text || '')
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);

      if (lines.length === 0) continue;

      // Check first 8 lines of each page for chapter titles
      const candidateLines = lines.slice(0, 8);

      for (let lIdx = 0; lIdx < candidateLines.length; lIdx++) {
        const line = candidateLines[lIdx];

        // Skip running headers
        const norm = line.replace(/\d+/g, '#').toLowerCase();
        if (runningArtifacts.has(norm)) continue;

        // Check if inside TOC range
        if (tocInfo.hasToc && page.num >= tocInfo.tocStartPage && page.num <= tocInfo.tocEndPage) {
          continue;
        }

        // 1. Explicit "Chapter X" pattern
        const chMatch = line.match(chapterHeaderRegex);
        if (chMatch) {
          const chNum = chMatch[1];
          let chTitle = chMatch[2] ? chMatch[2].trim() : '';

          // If title is on next line
          if (!chTitle && lIdx + 1 < candidateLines.length) {
            const nextLine = candidateLines[lIdx + 1];
            if (!chapterHeaderRegex.test(nextLine) && nextLine.length > 2 && nextLine.length < 80) {
              chTitle = nextLine;
            }
          }

          const fullTitle = chTitle ? `Chapter ${chNum}: ${chTitle}` : `Chapter ${chNum}`;
          detectedChapters.push({
            pageNumber: page.num,
            title: fullTitle,
            role: 'chapter',
          });
          break;
        }

        // 2. Back matter pattern ("Appendix A", "References", "Index")
        const bmMatch = line.match(backMatterRegex);
        if (bmMatch && pIdx > pages.length * 0.5) {
          detectedChapters.push({
            pageNumber: page.num,
            title: line,
            role: line.toLowerCase().includes('appendix') ? 'appendix' : 'back_matter',
          });
          break;
        }

        // 3. Standalone numbered chapter (e.g. "1 Characterization of Distributed Systems")
        // Only if not a subsection (like 1.1) and on page 1-100
        const numChMatch = line.match(standaloneNumberedChapterRegex);
        if (numChMatch && !line.includes('.')) {
          const num = parseInt(numChMatch[1], 10);
          const title = numChMatch[2].trim();

          // Must be single or reasonable chapter number
          if (num >= 1 && num <= 40) {
            detectedChapters.push({
              pageNumber: page.num,
              title: `Chapter ${num}: ${title}`,
              role: 'chapter',
            });
            break;
          }
        }
      }
    }

    // De-duplicate any detections on the exact same page or within 1 page if titles are similar
    const cleanBoundaries = [];
    for (const d of detectedChapters) {
      if (!cleanBoundaries.some(b => b.pageNumber === d.pageNumber)) {
        cleanBoundaries.push(d);
      }
    }

    // If detected chapters start after page 1, add Front Matter
    if (cleanBoundaries.length > 0 && cleanBoundaries[0].pageNumber > 1) {
      cleanBoundaries.unshift({
        pageNumber: 1,
        title: 'Front Matter & Overview',
        role: 'front_matter',
      });
    }

    // If no chapters detected at all, fallback to a single cohesive document
    if (cleanBoundaries.length === 0) {
      cleanBoundaries.push({
        pageNumber: 1,
        title: 'Document Content',
        role: 'chapter',
      });
    }

    return cleanBoundaries;
  }

  /**
   * Extracts canonical blocks for a chapter range, filtering running headers
   */
  extractBlocksForChapter(chapterPages, splitInfo, runningArtifacts, initialBlocks = [], endPage = Infinity) {
    // If pre-parsed blocks with page provenance are available
    if (initialBlocks.length > 0) {
      const startPage = splitInfo.pageNumber;
      const filtered = initialBlocks.filter(b => {
        const p = b.sourcePage || 1;
        return p >= startPage && p <= endPage;
      });
      if (filtered.length > 0) {
        return filtered;
      }
    }

    const blocks = [];
    const sectionHeadingRegex = /^(?:(\d+\.\d+(?:\.\d+)?)\s+(.+)|([A-Z0-9\s:—–-]{4,60}))$/;

    for (const page of chapterPages) {
      const lines = (page.text || '').split('\n');
      let currentParagraph = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) {
          if (currentParagraph.length > 0) {
            blocks.push({
              id: `blk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              type: 'paragraph',
              text: currentParagraph.join(' '),
              sourcePage: page.num,
            });
            currentParagraph = [];
          }
          continue;
        }

        // Suppress running headers and footers
        const norm = line.replace(/\d+/g, '#').toLowerCase();
        if (runningArtifacts.has(norm)) {
          continue;
        }

        // Suppress bare page numbers
        if (/^\d{1,4}$/.test(line)) {
          continue;
        }

        // Check for section headings (H2, H3)
        // e.g. "1.1 Introduction" or "1.2.3 Architecture"
        const secMatch = line.match(/^(\d+\.\d+(?:\.\d+)?)\s+(.+)$/);
        if (secMatch) {
          if (currentParagraph.length > 0) {
            blocks.push({
              id: `blk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              type: 'paragraph',
              text: currentParagraph.join(' '),
              sourcePage: page.num,
            });
            currentParagraph = [];
          }

          const dots = secMatch[1].split('.').length - 1;
          const level = Math.min(4, Math.max(2, dots + 1));
          blocks.push({
            id: `blk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            type: 'heading',
            level,
            text: line,
            sourcePage: page.num,
          });
          continue;
        }

        // Accumulate body text
        currentParagraph.push(line);
      }

      if (currentParagraph.length > 0) {
        blocks.push({
          id: `blk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          type: 'paragraph',
          text: currentParagraph.join(' '),
          sourcePage: page.num,
        });
      }
    }

    return blocks;
  }

  /**
   * Analyzes Web content structure
   * - Filters utility boilerplate (References, External links, See also)
   * - Structures into meaningful sections without artificial chapter proliferation
   */
  analyzeWebStructure(blocks, metadata = {}) {
    const docTitle = metadata.title || 'Web Document';

    // Filter out utility boilerplate headings and their subsequent blocks
    const boilerplateRegex = /^(?:references|see also|external links|further reading|notes|navigation|sources)$/i;

    const cleanedBlocks = [];
    let skippingBoilerplate = false;

    for (const block of blocks) {
      if (block.type === 'heading') {
        if (boilerplateRegex.test(block.text.trim())) {
          skippingBoilerplate = true;
          continue;
        } else {
          skippingBoilerplate = false;
        }
      }

      if (!skippingBoilerplate) {
        cleanedBlocks.push(block);
      }
    }

    // Check for major headings (H1, H2) - exclude subheadings (1.1, 1.2, etc.)
    const majorHeadings = [];
    const hasMultipleH1 = cleanedBlocks.filter(b => b.type === 'heading' && b.level === 1 && b.text.toLowerCase() !== docTitle.toLowerCase()).length >= 2;

    cleanedBlocks.forEach((block, index) => {
      if (block.type === 'heading') {
        const text = (block.text || '').trim();
        if (text.toLowerCase() === docTitle.toLowerCase()) return;

        // Subheadings like 1.1, 1.2.3, Section 2.1 MUST remain as sections within parent chapters
        const isSubSectionNumbering = /^(\d+\.\d+|[A-Z]\.\d+|section\s+\d+\.\d+|subsection|part\s+\d+\.\d+)/i.test(text);
        if (isSubSectionNumbering) {
          return;
        }

        if (block.level === 1) {
          majorHeadings.push({ index, block });
        } else if (block.level === 2 && !hasMultipleH1) {
          // If no multiple H1 chapters, allow major topical H2s as chapters
          majorHeadings.push({ index, block });
        }
      }
    });

    const doc = new CanonicalDocument(cleanedBlocks);
    const totalWordCount = doc.calculateWordCount();
    const isZeroContent = totalWordCount === 0 || cleanedBlocks.length === 0;

    // If fewer than 2 major headings, keep as a single unified reading item
    if (majorHeadings.length < 2) {
      const sections = cleanedBlocks
        .filter(b => b.type === 'heading' && b.level >= 2)
        .map(b => ({ title: b.text, level: b.level }));

      const tables = cleanedBlocks.filter(b => b.type === 'table');

      return {
        documentType: 'web_article',
        pageCount: Math.max(1, Math.ceil(totalWordCount / 250)),
        chapterCount: 1,
        sectionCount: sections.length,
        tablesCount: tables.length,
        totalWordCount,
        chapters: [
          {
            number: 1,
            title: docTitle,
            structuralRole: 'chapter',
            canonicalBlocks: cleanedBlocks,
            sections,
            sectionCount: sections.length,
            content: doc.toPlainText(),
            wordCount: totalWordCount,
            metadata: {
              sectionsCount: sections.length,
              tablesCount: tables.length,
              structuralRole: 'chapter',
            },
          },
        ],
        integrityStatus: isZeroContent ? 'empty_content' : 'valid',
        integrityWarning: isZeroContent ? 'Content extraction incomplete: web page contained no readable article body.' : '',
      };
    }

    // Otherwise group into structured thematic chapters
    const chapters = [];
    let currentChapterNum = 1;
    let totalSections = 0;
    let totalTables = 0;

    // Intro if content exists before first major heading
    if (majorHeadings[0].index > 0) {
      const introBlocks = cleanedBlocks.slice(0, majorHeadings[0].index);
      if (introBlocks.some(b => b.type === 'paragraph' && b.text.length > 20)) {
        const introDoc = new CanonicalDocument(introBlocks);
        const introWords = introDoc.calculateWordCount();
        chapters.push({
          number: currentChapterNum++,
          title: 'Introduction & Overview',
          structuralRole: 'front_matter',
          canonicalBlocks: introBlocks,
          sections: [],
          sectionCount: 0,
          content: introDoc.toPlainText(),
          wordCount: introWords,
          metadata: { structuralRole: 'front_matter' },
        });
      }
    }

    for (let i = 0; i < majorHeadings.length; i++) {
      const curr = majorHeadings[i];
      const next = majorHeadings[i + 1];
      const chapterBlocks = cleanedBlocks.slice(curr.index, next ? next.index : cleanedBlocks.length);
      const chapterDoc = new CanonicalDocument(chapterBlocks);
      const wordCount = chapterDoc.calculateWordCount();

      if (wordCount < 10 && chapterBlocks.length <= 1) continue; // Skip empty headings

      const sections = chapterBlocks
        .filter(b => b.type === 'heading' && b.level >= 2 && b !== curr.block)
        .map(b => ({ title: b.text, level: b.level }));

      const tables = chapterBlocks.filter(b => b.type === 'table');
      totalSections += sections.length;
      totalTables += tables.length;

      chapters.push({
        number: currentChapterNum++,
        title: curr.block.text.trim(),
        structuralRole: 'chapter',
        canonicalBlocks: chapterBlocks,
        sections,
        sectionCount: sections.length,
        content: chapterDoc.toPlainText(),
        wordCount,
        metadata: {
          sectionsCount: sections.length,
          tablesCount: tables.length,
          structuralRole: 'chapter',
        },
      });
    }

    return {
      documentType: 'web_article',
      pageCount: Math.max(1, Math.ceil(totalWordCount / 250)),
      chapterCount: chapters.length,
      sectionCount: totalSections,
      tablesCount: totalTables,
      totalWordCount,
      chapters,
      integrityStatus: isZeroContent ? 'empty_content' : 'valid',
      integrityWarning: isZeroContent ? 'Content extraction incomplete: web page contained no readable body text.' : '',
    };
  }

  /**
   * Analyzes Text or Markdown structure
   */
  analyzeTextOrMarkdownStructure(blocks, rawText, format, metadata = {}) {
    const tree = documentStructureEngine.buildStructureTree({
      format: format || 'markdown',
      blocks,
      rawText,
      metadata,
    });

    let totalSections = 0;
    let totalTables = 0;

    const chapters = tree.chapters.map((ch, idx) => {
      const tables = (ch.canonicalBlocks || []).filter((b) => b.type === 'table');
      totalTables += tables.length;
      totalSections += (ch.sectionCount || (ch.sections ? ch.sections.length : 0));

      return {
        number: idx + 1,
        title: ch.title,
        structuralRole: ch.structuralRole || 'chapter',
        canonicalBlocks: ch.canonicalBlocks,
        sections: ch.sections,
        sectionCount: ch.sectionCount || (ch.sections ? ch.sections.length : 0),
        content: ch.content,
        wordCount: ch.wordCount,
        confidence: ch.confidence,
        sourceLocation: ch.sourceLocation,
        metadata: {
          sectionsCount: ch.sectionCount || (ch.sections ? ch.sections.length : 0),
          tablesCount: tables.length,
          structuralRole: ch.structuralRole || 'chapter',
          confidence: ch.confidence,
        },
      };
    });

    const isZeroContent = tree.totalWordCount === 0 || chapters.length === 0;

    return {
      documentType: 'document',
      pageCount: tree.pageCount || Math.max(1, Math.ceil(tree.totalWordCount / 250)),
      chapterCount: chapters.length,
      sectionCount: totalSections,
      tablesCount: totalTables,
      totalWordCount: tree.totalWordCount,
      chapters,
      confidence: tree.confidence,
      integrityStatus: isZeroContent ? 'empty_content' : 'valid',
      integrityWarning: isZeroContent
        ? 'Content extraction incomplete: no selectable text found in the document.'
        : '',
    };
  }
}

module.exports = new DocumentStructureAnalyzer();
