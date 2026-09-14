const repeatedBlockDetector = require('./repeatedBlockDetector');
const contentNormalizer = require('../ingestion/normalizers/contentNormalizer');
const { CanonicalDocument } = require('../ingestion/models/canonicalContent');

/**
 * Document Structure Engine for Smart Reader (Build 3B.1.6)
 * 
 * Deterministically constructs a normalized hierarchical structural tree
 * from parsed documents (PDF, EPUB, Markdown, Plain Text, Web).
 * 
 * Features:
 * - Multi-signal chapter detection with priority ranking (TOC, Numbered Headings, Style Hierarchy, Boundaries)
 * - True nested section hierarchy (e.g. 4.1.2.1 as child of 4.1.2 as child of 4.1 as child of Chapter 4)
 * - Accurate front/back matter and appendix/index classification
 * - Repeated header/footer filtering
 * - Explicit source provenance (pages, offsets, block ranges)
 * - Deterministic confidence scoring and graceful low-confidence fallbacks
 */

class DocumentStructureEngine {
  constructor() {
    this.FRONT_MATTER_REGEX = /^(?:title\s*page|half\s*title|copyright|dedication|table\s*of\s*contents|contents|preface|foreword|prologue|acknowledg(?:e)?ments|about\s*the\s*author(?:s)?|overview|brief\s*contents)$/i;
    this.BACK_MATTER_REGEX = /^(?:epilogue|afterword|bibliography|references|glossary|further\s*reading|colophon|notes)$/i;
    this.CHAPTER_LOCAL_BACK_MATTER_REGEX = /^(?:further\s+reading|exercises?|references?|summary|notes?|problems?|review\s+questions?)\b/i;
    this.APPENDIX_REGEX = /^(?:appendix(?:\s+[a-z0-9]+)?)$/i;
    this.INDEX_REGEX = /^(?:index|subject\s*index|author\s*index)$/i;

    // Numbered heading regexes
    this.CHAPTER_EXPLICIT_REGEX = /^(?:chapter|part|unit|module|book|volume)\s+([0-9]+|[ivxlcdm]+|[a-z]+)(?:\s*[:.—–-]\s*(.*))?$/i;
    this.STANDALONE_NUMBERED_CHAPTER_REGEX = /^(\d+)\s+([A-Z][A-Za-z0-9\s—–-]{2,80})$/;
    this.SECTION_NUMBERED_REGEX = /^([A-Z]|\d+)(?:\.([0-9]+))+(?:\.([0-9]+))*(?:\.([0-9]+))*\s*(.*)$/;
    this.TOC_LINE_REGEX = /(?:\s*\.{2,}\s*|\s{2,}|\t+)(?:\d+|[ivxlcdm]+)\s*$/i;
  }

  /**
   * Builds a normalized structural document tree
   * @param {object} input
   * @param {string} input.format - 'pdf', 'epub', 'markdown', 'text', 'web'
   * @param {string} [input.rawText] - Normalized or raw text string
   * @param {Array<object>} [input.blocks] - Canonical blocks
   * @param {Array<object>} [input.pages] - Page objects { num, text, lines }
   * @param {object} [input.metadata] - Title, author, originalFilename
   * @returns {object} Normalized structural document tree
   */
  buildStructureTree({ format = 'text', rawText = '', blocks = [], pages = [], metadata = {} }) {
    let workingBlocks = Array.isArray(blocks) && blocks.length > 0 ? [...blocks] : [];
    let workingText = rawText || '';

    // Identify TOC pages upfront so blocks on TOC pages are never treated as body chapter openers
    const tocPages = new Set();
    const searchPages = pages.slice(0, Math.min(pages.length, 30));
    for (const page of searchPages) {
      if (/(?:^|\n)\s*(?:table\s+of\s+contents|brief\s+contents|contents)\b/im.test(page.text || '')) {
        tocPages.add(page.num);
      }
    }

    // 1. If blocks are missing but text/pages are present, generate canonical blocks
    if (workingBlocks.length === 0) {
      if (pages.length > 0) {
        workingBlocks = this.blocksFromPages(pages, tocPages);
      } else if (workingText) {
        workingBlocks = this.blocksFromText(workingText, format);
      }
    } else if (tocPages.size > 0) {
      // Mark existing blocks with isTocPage
      workingBlocks.forEach((b) => {
        if (b.sourcePage && tocPages.has(b.sourcePage)) {
          b.isTocPage = true;
        }
      });
    }

    // 2. Filter repeated running headers and footers across pages
    const repeatedResult = repeatedBlockDetector.filterRepeatedBlocks(workingBlocks);
    workingBlocks = repeatedResult.filteredBlocks;

    // Ensure blocks have offset tracking if rawText is available
    this.annotateOffsets(workingBlocks, workingText);

    // 3. Multi-Signal Structural Boundary Identification
    // Priority 1: Table of Contents (TOC)
    const tocCandidate = this.detectAndParseTOC(pages, workingBlocks, workingText, tocPages);

    // Priority 2: Chapter Headings and Boundaries
    const candidateNodes = this.identifyChapterCandidates({
      blocks: workingBlocks,
      pages,
      rawText: workingText,
      tocCandidate,
      tocPages,
      format,
    });

    // 4. Group blocks and build hierarchical chapters and nested sections
    const { chapters, docConfidence } = this.assembleChapterTree({
      candidates: candidateNodes,
      blocks: workingBlocks,
      pages,
      metadata,
      hasTocMatch: Boolean(tocCandidate && tocCandidate.matchedChaptersCount >= 2),
    });

    const docTitle = metadata.title || (chapters[0] ? chapters[0].title : 'Document');
    const docAuthor = metadata.author || 'Unknown Author';

    const totalWordCount = chapters.reduce((sum, ch) => sum + (ch.wordCount || 0), 0);
    const totalCharCount = chapters.reduce((sum, ch) => sum + (ch.characterCount || 0), 0);

    return {
      title: docTitle,
      author: docAuthor,
      structuralRole: 'document',
      confidence: docConfidence,
      format,
      pageCount: pages.length || (workingBlocks[workingBlocks.length - 1]?.sourcePage || 1),
      chapterCount: chapters.length,
      totalWordCount,
      totalCharacterCount: totalCharCount,
      removedRunningArtifactsCount: repeatedResult.removedCount,
      chapters,
    };
  }

  /**
   * Annotates canonical blocks with startOffset and endOffset if text is available
   */
  annotateOffsets(blocks, rawText) {
    if (!rawText) return;
    let searchPos = 0;

    for (const block of blocks) {
      const blockSnippet = (block.text || '').substring(0, 40).trim();
      if (!blockSnippet) continue;

      const idx = rawText.indexOf(blockSnippet, searchPos);
      if (idx !== -1) {
        block.startOffset = idx;
        block.endOffset = idx + (block.text ? block.text.length : 0);
        searchPos = block.endOffset;
      }
    }
  }

  /**
   * Converts page objects into canonical blocks with sourcePage attribution
   */
  blocksFromPages(pages, tocPages = new Set()) {
    const blocks = [];
    for (const page of pages) {
      const pageNum = page.num || 1;
      const isTocPage = tocPages.has(pageNum);
      const text = contentNormalizer.normalize(page.text || '');
      if (!text) continue;

      const lines = text.split('\n');
      let curPara = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) {
          if (curPara.length > 0) {
            blocks.push({
              id: `blk-${blocks.length + 1}`,
              type: 'paragraph',
              text: curPara.join(' '),
              sourcePage: pageNum,
              isTocPage,
            });
            curPara = [];
          }
          continue;
        }

        // On TOC pages, do not convert lines into chapter headings
        if (isTocPage || this.TOC_LINE_REGEX.test(line)) {
          curPara.push(line);
          continue;
        }

        // Check for two-line chapter opener:
        // Line i: "CHAPTER 1"
        // Line i+1: "The Machine Learning Workflow"
        const chKeyword = line.match(/^(?:chapter|part|unit|module)\s+([0-9]+|[ivxlcdm]+|[a-z]+)$/i);
        if (chKeyword && i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          if (nextLine.length > 2 && nextLine.length < 90 && !this.isSentence(nextLine) && !this.detectHeadingLine(nextLine)) {
            if (curPara.length > 0) {
              blocks.push({
                id: `blk-${blocks.length + 1}`,
                type: 'paragraph',
                text: curPara.join(' '),
                sourcePage: pageNum,
              });
              curPara = [];
            }
            blocks.push({
              id: `blk-${blocks.length + 1}`,
              type: 'heading',
              level: 1,
              text: `${line}: ${nextLine}`,
              sourcePage: pageNum,
            });
            i++; // skip nextLine
            continue;
          }
        }

        const hMatch = this.detectHeadingLine(line);
        if (hMatch) {
          if (curPara.length > 0) {
            blocks.push({
              id: `blk-${blocks.length + 1}`,
              type: 'paragraph',
              text: curPara.join(' '),
              sourcePage: pageNum,
            });
            curPara = [];
          }
          blocks.push({
            id: `blk-${blocks.length + 1}`,
            type: 'heading',
            level: hMatch.level,
            text: hMatch.text,
            sourcePage: pageNum,
          });
          continue;
        }

        curPara.push(line);
      }

      if (curPara.length > 0) {
        blocks.push({
          id: `blk-${blocks.length + 1}`,
          type: 'paragraph',
          text: curPara.join(' '),
          sourcePage: pageNum,
          isTocPage,
        });
      }
    }
    return blocks;
  }

  /**
   * Converts plain text into blocks with basic heading detection
   */
  blocksFromText(rawText, format) {
    const norm = contentNormalizer.normalize(rawText);
    const paragraphs = norm.split(/\n\s*\n/);
    const blocks = [];

    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) continue;

      if (format === 'markdown') {
        const hMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
        if (hMatch) {
          blocks.push({
            id: `blk-${blocks.length + 1}`,
            type: 'heading',
            level: hMatch[1].length,
            text: hMatch[2].trim(),
          });
          continue;
        }
      }

      const hMatch = this.detectHeadingLine(trimmed);
      if (hMatch && !trimmed.includes('\n')) {
        blocks.push({
          id: `blk-${blocks.length + 1}`,
          type: 'heading',
          level: hMatch.level,
          text: hMatch.text,
        });
        continue;
      }

      blocks.push({
        id: `blk-${blocks.length + 1}`,
        type: 'paragraph',
        text: trimmed.replace(/\n+/g, ' '),
      });
    }

    return blocks;
  }

  /**
   * Helper to detect if a single line is a chapter or section heading
   */
  detectHeadingLine(line) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 100) return null;

    // A line that ends with dotted leaders or wide spaces and page numbers is a TOC entry, NEVER a heading
    if (this.TOC_LINE_REGEX.test(trimmed)) {
      return null;
    }

    // Explicit chapter marker
    if (this.CHAPTER_EXPLICIT_REGEX.test(trimmed)) {
      return { level: 1, text: trimmed };
    }

    // Markdown heading
    const mdMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (mdMatch) {
      return { level: mdMatch[1].length, text: mdMatch[2].trim() };
    }

    // Section numbering: 1.1, 4.1.2, etc.
    const secMatch = trimmed.match(this.SECTION_NUMBERED_REGEX);
    if (secMatch) {
      const dots = (trimmed.split(/\s+/)[0].match(/\./g) || []).length;
      return { level: Math.min(6, dots + 1), text: trimmed };
    }

    // Standalone numbered chapter (e.g. "1 Foundations of Machine Learning")
    const standAloneMatch = trimmed.match(this.STANDALONE_NUMBERED_CHAPTER_REGEX);
    if (standAloneMatch && !trimmed.includes('.')) {
      const num = parseInt(standAloneMatch[1], 10);
      if (num >= 1 && num <= 50) {
        return { level: 1, text: trimmed };
      }
    }

    // Special Front/Back Matter markers
    if (this.isFrontOrBackMatterHeading(trimmed)) {
      return { level: 1, text: trimmed };
    }

    return null;
  }

  isFrontOrBackMatterHeading(text) {
    const lower = text.trim().toLowerCase().replace(/[:.—–-].*$/, '').trim();
    return (
      this.FRONT_MATTER_REGEX.test(lower) ||
      this.BACK_MATTER_REGEX.test(lower) ||
      this.APPENDIX_REGEX.test(lower) ||
      this.INDEX_REGEX.test(lower)
    );
  }

  /**
   * Detects and extracts TOC entries, then anchors them against body blocks
   */
  detectAndParseTOC(pages, blocks, rawText, tocPages = new Set()) {
    const tocEntries = [];
    let maxTocPage = 0;

    // Check first 30 pages for Table of Contents
    const searchPages = pages.slice(0, Math.min(pages.length, 30));

    for (const page of searchPages) {
      const text = page.text || '';
      if (tocPages.has(page.num) || /(?:^|\n)\s*(?:table\s+of\s+contents|brief\s+contents|contents)\b/im.test(text)) {
        maxTocPage = Math.max(maxTocPage, page.num);
        const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

        for (const line of lines) {
          // Patterns:
          // 1 Introduction ................... 1
          // Chapter 1: Introduction ........ 12
          // Appendix A: Derivations ......... 340
          // 1 \tFundamentals of machine learning \t1
          const match = line.match(/^(?:(?:Chapter|Part)\s+(\d+|[IVXLCDM]+)[:.]?\s+)?(.+?)(?:\s*\.{2,}\s*|\s{2,}|\t+)(\d+|[ivxlcdm]+)\s*$/i);
          if (match) {
            let chNum = match[1] || null;
            let titlePart = match[2].trim();
            const printedPage = match[3];

            // If chapter number is leading in titlePart (e.g. "1 Fundamentals of machine learning" or "1\tFundamentals")
            const leadingNumMatch = titlePart.match(/^(\d+)\s*[\t\s]+(.+)$/);
            if (leadingNumMatch && !chNum) {
              chNum = leadingNumMatch[1];
              titlePart = leadingNumMatch[2].trim();
            }
            titlePart = titlePart.replace(/\t+/g, ' ').trim();

            // Ignore subsection entries (e.g. 1.1 or 2.3.1) in major TOC anchor
            const isSub = /^(\d+\.\d+|[A-Z]\.\d+)/.test(titlePart) || (chNum && chNum.includes('.'));
            if (!isSub) {
              tocEntries.push({
                chapterNumber: chNum,
                title: titlePart,
                printedPage,
              });
            }
          }
        }
      }
    }

    if (tocEntries.length < 2) {
      return null;
    }

    // Anchor TOC entries to body blocks by searching for matching headings in body blocks
    let matchedCount = 0;
    const anchoredEntries = [];

    for (const entry of tocEntries) {
      const normEntry = this.normalizeTitleForMatch(entry.title);
      // Search in blocks that appear AFTER the TOC pages
      const foundIdx = blocks.findIndex((b, idx) => {
        if (b.isTocPage || (b.sourcePage && (tocPages.has(b.sourcePage) || b.sourcePage <= maxTocPage))) {
          return false;
        }

        // Match chapter openers (including metadata-prefixed or glued ones)
        const opener = this.extractChapterOpener(b.text || '');
        if (opener) {
          if (entry.chapterNumber && String(opener.number) === String(entry.chapterNumber)) {
            return true;
          }
          const normOpener = this.normalizeTitleForMatch(opener.rawTitle || opener.title);
          if (normOpener && (normOpener.includes(normEntry) || normEntry.includes(normOpener))) {
            return true;
          }
        }

        if (b.type !== 'heading' && !(b.type === 'paragraph' && (b.text || '').length < 90)) {
          return false;
        }
        const normBlock = this.normalizeTitleForMatch(b.text || '');
        return (
          normBlock.includes(normEntry) ||
          (normEntry.length > 5 && normBlock === normEntry) ||
          (entry.chapterNumber && normBlock.startsWith(`chapter${entry.chapterNumber}`))
        );
      });

      if (foundIdx !== -1) {
        matchedCount++;
        anchoredEntries.push({
          ...entry,
          blockIndex: foundIdx,
          block: blocks[foundIdx],
        });
      }
    }

    return {
      entries: tocEntries,
      anchoredEntries,
      matchedChaptersCount: matchedCount,
    };
  }

  normalizeTitleForMatch(title) {
    return (title || '')
      .toLowerCase()
      .replace(/^chapter\s+\d+[:.]?\s*/i, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  /**
   * Normalizes and extracts chapter openers that may be glued with publisher/DOI metadata
   * Handles patterns like:
   * "1\tDOI: 10.1201/9781003486817-1 1Fundamentals of machine learning"
   * "18 \tDOI: 10.1201/9781003486817-2 ... 2Mathematics for machine learning"
   * Preserves raw block content; returns derived chapter structure { number, title, rawTitle }.
   */
  extractChapterOpener(text) {
    if (!text || typeof text !== 'string') return null;
    const lines = text.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      let candidate = line;
      if (/DOI:\s*[\d.\/-]+/i.test(candidate) || /license/i.test(candidate)) {
        candidate = candidate.replace(/^\s*\d+\s*[\t\s]+/g, ' ');
        candidate = candidate.replace(/DOI:\s*10\.\d{4,9}\/[^\s]+/gi, ' ');
        candidate = candidate.replace(/This chapter has been made available under[^\n]*?license\.?/gi, ' ');
        candidate = candidate.replace(/\b\d+\b(?=\s*$)/, '');
        candidate = candidate.trim();
      }

      // 1. Check for glued or spaced chapter number followed by title
      const match = candidate.match(/(?:^|\s)(\d+)\s*([A-Z][a-zA-Z][a-zA-Z\s—–-]+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num >= 1 && num <= 50) {
          return {
            number: num,
            title: `Chapter ${num}: ${match[2].trim()}`,
            rawTitle: match[2].trim(),
          };
        }
      }

      // 2. Direct check with DOI & publisher metadata prefix pattern
      const directDoiMatch = line.match(/^\s*\d+\s*\t?\s*DOI:\s*[\d.\/-]+\s*[^\n]*?(\d+)\s*([A-Z][a-zA-Z].*)$/i);
      if (directDoiMatch) {
        let rawT = directDoiMatch[2].trim();
        rawT = rawT.replace(/^.*?license\.\s*/i, '');
        const glued = rawT.match(/^(\d+)?\s*([A-Z][a-zA-Z].*)$/);
        const num = glued && glued[1] ? parseInt(glued[1], 10) : parseInt(directDoiMatch[1], 10);
        const titleText = glued ? glued[2].trim() : rawT;
        if (num >= 1 && num <= 50) {
          return {
            number: num,
            title: `Chapter ${num}: ${titleText}`,
            rawTitle: titleText,
          };
        }
      }
    }
    return null;
  }

  /**
   * Scans canonical blocks and pages to identify structural chapter boundaries
   */
  identifyChapterCandidates({ blocks, pages = [], rawText, tocCandidate, tocPages = new Set(), format }) {
    const candidates = [];
    const totalPages = pages.length || (blocks[blocks.length - 1]?.sourcePage || 1);

    // Strategy 1: If TOC anchored at least 2 distinct chapter positions, use them
    if (tocCandidate && tocCandidate.anchoredEntries.length >= 2) {
      for (const anc of tocCandidate.anchoredEntries) {
        let candTitle = anc.title;
        const opener = this.extractChapterOpener(anc.block?.text || '');
        if (opener) {
          candTitle = opener.title;
        } else if (anc.chapterNumber && !anc.title.toLowerCase().startsWith('chapter')) {
          candTitle = `Chapter ${anc.chapterNumber}: ${anc.title}`;
        }

        candidates.push({
          blockIndex: anc.blockIndex,
          title: candTitle,
          sourcePage: anc.block.sourcePage || 1,
          startOffset: anc.block.startOffset || 0,
          detectionSignal: 'toc_anchored',
          confidence: 0.95,
        });
      }
      return this.sortAndDedupeCandidates(candidates);
    }

    // Strategy 2: Multi-line and Numbered Chapter Pattern Matching
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const text = (block.text || '').trim();
      if (!text) continue;

      // Never treat blocks from TOC pages or TOC-like lines as body chapter candidates
      if (block.isTocPage || (block.sourcePage && tocPages.has(block.sourcePage)) || this.TOC_LINE_REGEX.test(text)) {
        continue;
      }

      // Check chapter opener with publisher metadata or glued number-title (Task 4)
      const opener = this.extractChapterOpener(text);
      if (opener) {
        candidates.push({
          blockIndex: i,
          title: opener.title,
          sourcePage: block.sourcePage || 1,
          startOffset: block.startOffset || 0,
          detectionSignal: 'normalized_chapter_opener',
          confidence: 0.93,
        });
        continue;
      }

      // Check for two-line chapter opener:
      // Block i: "CHAPTER 1" or "Chapter 1"
      // Block i+1: "The Foundations of Learning" (if next block is a short heading/paragraph)
      const chKeywordMatch = text.match(/^(?:chapter|part|unit|module)\s+([0-9]+|[ivxlcdm]+|[a-z]+)$/i);
      if (chKeywordMatch && i + 1 < blocks.length) {
        const nextBlock = blocks[i + 1];
        const nextText = (nextBlock.text || '').trim();
        if (nextText.length > 2 && nextText.length < 90 && !this.isSentence(nextText)) {
          const combinedTitle = `${text}: ${nextText}`;
          candidates.push({
            blockIndex: i,
            title: combinedTitle,
            sourcePage: block.sourcePage || 1,
            startOffset: block.startOffset || 0,
            detectionSignal: 'two_line_chapter',
            confidence: 0.92,
            skipNextBlock: true,
          });
          i++; // Skip the title block as it's merged into chapter title
          continue;
        }
      }

      // Explicit single-line Chapter heading: "Chapter 1: The Foundations of Learning"
      const explicitMatch = text.match(this.CHAPTER_EXPLICIT_REGEX);
      if (explicitMatch) {
        candidates.push({
          blockIndex: i,
          title: text,
          sourcePage: block.sourcePage || 1,
          startOffset: block.startOffset || 0,
          detectionSignal: 'explicit_chapter',
          confidence: 0.9,
        });
        continue;
      }

      // Standalone Numbered Chapter: "1 The Foundations of Learning"
      const standaloneMatch = text.match(this.STANDALONE_NUMBERED_CHAPTER_REGEX);
      if (standaloneMatch && !text.includes('.')) {
        const num = parseInt(standaloneMatch[1], 10);
        // Chapter numbers typically between 1 and 50
        if (num >= 1 && num <= 50) {
          candidates.push({
            blockIndex: i,
            title: `Chapter ${num}: ${standaloneMatch[2].trim()}`,
            sourcePage: block.sourcePage || 1,
            startOffset: block.startOffset || 0,
            detectionSignal: 'numbered_chapter',
            confidence: 0.88,
          });
          continue;
        }
      }

      // Front Matter & Back Matter Keywords (e.g. Preface, Appendix, Index, References)
      if (block.type === 'heading' || text.length < 50) {
        const role = this.classifyRoleFromTitle(text, block.sourcePage, totalPages);
        if (role !== 'chapter' && role !== 'section') {
          // If it's a known structural boundary (and not downgraded to chapter-local section)
          candidates.push({
            blockIndex: i,
            title: text,
            sourcePage: block.sourcePage || 1,
            startOffset: block.startOffset || 0,
            detectionSignal: 'matter_boundary',
            confidence: 0.85,
          });
          continue;
        }
      }

      // Markdown Level 1 Headings (# Heading)
      if (block.type === 'heading' && block.level === 1) {
        // Only accept if not a subsection like "1.1"
        if (!/^\d+\.\d+/.test(text)) {
          candidates.push({
            blockIndex: i,
            title: text,
            sourcePage: block.sourcePage || 1,
            startOffset: block.startOffset || 0,
            detectionSignal: 'h1_heading',
            confidence: 0.78,
          });
          continue;
        }
      }
    }

    // If candidate list contains multiple entries with substantive gaps between them, accept them
    const deduped = this.sortAndDedupeCandidates(candidates);
    if (deduped.length >= 2) {
      return deduped;
    }

    // Strategy 3: Level 2 Headings if no Level 1 or explicit chapters exist and there are multiple H2s
    if (candidates.length < 2) {
      const h2Candidates = [];
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        if (b.type === 'heading' && b.level === 2 && !/^\d+\.\d+/.test(b.text || '')) {
          h2Candidates.push({
            blockIndex: i,
            title: b.text,
            sourcePage: b.sourcePage || 1,
            startOffset: b.startOffset || 0,
            detectionSignal: 'h2_fallback',
            confidence: 0.6,
          });
        }
      }
      if (h2Candidates.length >= 2) {
        return this.sortAndDedupeCandidates(h2Candidates);
      }
    }

    // Default fallback: single document chapter
    return [];
  }

  sortAndDedupeCandidates(candidates) {
    const sorted = [...candidates].sort((a, b) => a.blockIndex - b.blockIndex);
    const result = [];

    for (const c of sorted) {
      if (result.length === 0) {
        result.push(c);
        continue;
      }
      const prev = result[result.length - 1];
      // If candidates are right next to each other (blockIndex distance <= 1), merge or keep higher confidence
      if (c.blockIndex - prev.blockIndex <= 1) {
        if (c.confidence > prev.confidence) {
          result[result.length - 1] = c;
        }
      } else {
        result.push(c);
      }
    }

    return result;
  }

  isSentence(text) {
    return /[.?!]$/.test(text.trim()) || text.split(/\s+/).length > 15;
  }

  /**
   * Classifies structural role of a chapter/section based on its title
   * Returns: 'front_matter' | 'chapter' | 'appendix' | 'back_matter' | 'index' | 'section'
   */
  classifyRoleFromTitle(title = '', sourcePage = null, totalPages = null) {
    const clean = title.trim().toLowerCase().replace(/^#+\s*/, '').replace(/[:.—–-].*$/, '').trim();
    if (this.INDEX_REGEX.test(clean)) return 'index';
    if (this.APPENDIX_REGEX.test(clean)) return 'appendix';
    if (this.FRONT_MATTER_REGEX.test(clean)) return 'front_matter';
    if (this.BACK_MATTER_REGEX.test(clean)) {
      // Task 5 Part B: When back_matter appears BEFORE 80% of document page count:
      // Downgrade to 'section' (chapter-local trailing material), NOT 'back_matter'
      if (sourcePage !== null && totalPages !== null && totalPages > 0) {
        if (sourcePage < 0.8 * totalPages && this.CHAPTER_LOCAL_BACK_MATTER_REGEX.test(clean)) {
          return 'section';
        }
      }
      return 'back_matter';
    }
    return 'chapter';
  }

  /**
   * Groups blocks into chapters and parses nested section trees
   */
  assembleChapterTree({ candidates, blocks, pages = [], metadata, hasTocMatch }) {
    const chapters = [];
    const totalBlocks = blocks.length;
    const totalPages = pages.length || (blocks[blocks.length - 1]?.sourcePage || 1);

    // Filter out candidates whose role is downgraded to chapter-local section
    const validCandidates = candidates.filter((cand) => {
      const role = this.classifyRoleFromTitle(cand.title, cand.sourcePage, totalPages);
      return role !== 'section';
    });

    // Handle leading blocks before the first detected candidate as Front Matter
    if (validCandidates.length > 0 && validCandidates[0].blockIndex > 0) {
      const frontBlocks = blocks.slice(0, validCandidates[0].blockIndex);
      const doc = new CanonicalDocument(frontBlocks);
      const wCount = doc.calculateWordCount();

      if (wCount > 0) {
        const firstHeading = frontBlocks.find((b) => b.type === 'heading');
        const frontTitle = firstHeading ? firstHeading.text : 'Front Matter & Overview';
        const role = this.classifyRoleFromTitle(frontTitle, frontBlocks[0]?.sourcePage || 1, totalPages);

        const { sections } = this.buildNestedSectionHierarchy(frontBlocks);

        chapters.push({
          id: `chap-1`,
          number: 1,
          title: frontTitle,
          structuralRole: role === 'chapter' ? 'front_matter' : role,
          confidence: 0.9,
          sourceLocation: {
            startOffset: frontBlocks[0]?.startOffset || 0,
            endOffset: frontBlocks[frontBlocks.length - 1]?.endOffset || 0,
            startPage: frontBlocks[0]?.sourcePage || 1,
            endPage: frontBlocks[frontBlocks.length - 1]?.sourcePage || 1,
          },
          wordCount: wCount,
          characterCount: doc.toPlainText().length,
          canonicalBlocks: frontBlocks,
          sections,
          sectionCount: this.countTotalSections(sections),
          content: doc.toPlainText(),
        });
      }
    }

    // If no candidates were detected at all, treat entire document as a single chapter
    if (validCandidates.length === 0) {
      const doc = new CanonicalDocument(blocks);
      const wCount = doc.calculateWordCount();
      const firstHeading = blocks.find((b) => b.type === 'heading');
      const docTitle = metadata.title || (firstHeading ? firstHeading.text : 'Document Content');
      const { sections } = this.buildNestedSectionHierarchy(blocks);

      chapters.push({
        id: `chap-1`,
        number: 1,
        title: docTitle,
        structuralRole: 'chapter',
        confidence: 0.4, // Low confidence fallback
        sourceLocation: {
          startOffset: blocks[0]?.startOffset || 0,
          endOffset: blocks[blocks.length - 1]?.endOffset || 0,
          startPage: blocks[0]?.sourcePage || 1,
          endPage: blocks[blocks.length - 1]?.sourcePage || 1,
        },
        wordCount: wCount,
        characterCount: doc.toPlainText().length,
        canonicalBlocks: blocks,
        sections,
        sectionCount: this.countTotalSections(sections),
        content: doc.toPlainText(),
      });

      return { chapters, docConfidence: 0.4 };
    }

    // Segment each detected chapter
    for (let cIdx = 0; cIdx < validCandidates.length; cIdx++) {
      const cand = validCandidates[cIdx];
      const startBlockIdx = cand.blockIndex;
      const nextCand = validCandidates[cIdx + 1];
      const endBlockIdx = nextCand ? nextCand.blockIndex : totalBlocks;

      const chapterBlocks = blocks.slice(startBlockIdx, endBlockIdx);
      const doc = new CanonicalDocument(chapterBlocks);
      const wCount = doc.calculateWordCount();

      const role = this.classifyRoleFromTitle(cand.title, cand.sourcePage, totalPages);
      const { sections } = this.buildNestedSectionHierarchy(chapterBlocks);

      const chNumber = chapters.length + 1;
      chapters.push({
        id: `chap-${chNumber}`,
        number: chNumber,
        title: cand.title,
        structuralRole: role === 'section' ? 'chapter' : role,
        confidence: cand.confidence || 0.85,
        sourceLocation: {
          startOffset: chapterBlocks[0]?.startOffset || cand.startOffset || 0,
          endOffset: chapterBlocks[chapterBlocks.length - 1]?.endOffset || 0,
          startPage: chapterBlocks[0]?.sourcePage || cand.sourcePage || 1,
          endPage: chapterBlocks[chapterBlocks.length - 1]?.sourcePage || cand.sourcePage || 1,
        },
        wordCount: wCount,
        characterCount: doc.toPlainText().length,
        canonicalBlocks: chapterBlocks,
        sections,
        sectionCount: this.countTotalSections(sections),
        content: doc.toPlainText(),
      });
    }

    // Calculate document-level confidence
    const avgConfidence = chapters.reduce((sum, c) => sum + (c.confidence || 0.8), 0) / (chapters.length || 1);
    const docConfidence = hasTocMatch ? Math.max(0.92, avgConfidence) : Number(avgConfidence.toFixed(2));

    return { chapters, docConfidence };
  }

  /**
   * Builds a nested section tree (parent-child hierarchy) from blocks
   * Examples:
   * Chapter 4 -> 4.1 -> 4.1.1 -> 4.1.1.1
   */
  buildNestedSectionHierarchy(chapterBlocks) {
    const rootSections = [];
    // Stack tracks current active ancestor sections: [level1, level2, level3, ...]
    const stack = [];

    // The first heading in chapter blocks may be the chapter title itself; skip it if identical
    const firstHeading = chapterBlocks.find((b) => b.type === 'heading');

    for (let i = 0; i < chapterBlocks.length; i++) {
      const block = chapterBlocks[i];
      if (block.type !== 'heading') continue;
      if (block === firstHeading && (block.level === 1 || this.CHAPTER_EXPLICIT_REGEX.test(block.text || ''))) {
        continue; // Skip root chapter heading itself
      }

      const rawText = (block.text || '').trim();
      const secNumberMatch = this.extractSectionNumber(rawText);
      const depth = this.determineSectionDepth(rawText, block.level, secNumberMatch);

      // Extract section text and calculate counts for this section (until next heading)
      const secBlocks = [];
      let nextHeadingIdx = chapterBlocks.length;
      for (let j = i + 1; j < chapterBlocks.length; j++) {
        if (chapterBlocks[j].type === 'heading') {
          nextHeadingIdx = j;
          break;
        }
        secBlocks.push(chapterBlocks[j]);
      }
      const secDoc = new CanonicalDocument(secBlocks);
      const secWordCount = secDoc.calculateWordCount();
      const secCharCount = secDoc.toPlainText().length;

      const sectionNode = {
        id: `sec-${block.id || `${i + 1}`}`,
        number: secNumberMatch || '',
        title: rawText,
        level: depth,
        sourceLocation: {
          startOffset: block.startOffset || 0,
          endOffset: secBlocks[secBlocks.length - 1]?.endOffset || block.endOffset || 0,
          startPage: block.sourcePage || 1,
          endPage: secBlocks[secBlocks.length - 1]?.sourcePage || block.sourcePage || 1,
        },
        wordCount: secWordCount,
        characterCount: secCharCount,
        sections: [],
      };

      // Find appropriate parent in the stack
      while (stack.length > 0 && stack[stack.length - 1].level >= depth) {
        stack.pop();
      }

      if (stack.length === 0) {
        rootSections.push(sectionNode);
      } else {
        stack[stack.length - 1].sections.push(sectionNode);
      }

      stack.push(sectionNode);
    }

    return { sections: rootSections };
  }

  extractSectionNumber(text) {
    const match = text.match(this.SECTION_NUMBERED_REGEX);
    if (match) {
      const parts = text.split(/\s+/)[0].replace(/[:.—–-]$/, '');
      return parts;
    }
    return '';
  }

  determineSectionDepth(text, headingLevel, sectionNumber) {
    if (sectionNumber) {
      // Depth derived from dotted numbering: "4.1" -> 2, "4.1.2" -> 3, "4.1.2.1" -> 4
      const dots = (sectionNumber.match(/\./g) || []).length;
      return dots + 1;
    }

    if (headingLevel && headingLevel >= 2) {
      return headingLevel;
    }

    return 2;
  }

  countTotalSections(sections = []) {
    let count = 0;
    for (const sec of sections) {
      count++;
      if (sec.sections && sec.sections.length > 0) {
        count += this.countTotalSections(sec.sections);
      }
    }
    return count;
  }
}

module.exports = new DocumentStructureEngine();
