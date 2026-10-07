const path = require('path');
const contentNormalizer = require('./normalizers/contentNormalizer');
const textParser = require('./parsers/textParser');
const markdownParser = require('./parsers/markdownParser');
const pdfjsParser = require('./parsers/pdfjsParser');
const epubParser = require('./parsers/epubParser');
const docxParser = require('./parsers/docxParser');
const rtfParser = require('./parsers/rtfParser');
const config = require('../../config');
const chapterDetector = require('./structure/chapterDetector');
const documentStructureEngine = require('../structure/documentStructureEngine');
const { classifySection, buildSectionMapFast } = require('../ai/sectionClassifier');
const { extractMath } = require('../ai/mathExtractor');
const { CanonicalDocument } = require('./models/canonicalContent');

/**
 * Ingestion Service for Smart Reader
 * Implements the modular ingestion pipeline:
 * Source File / Text -> Normalizer -> Structure Detection -> Parser -> Canonical Content
 */
class IngestionService {
  /**
   * Processes incoming text or uploaded file buffer into structured chapters with canonical content
   * @param {object} params
   * @param {string} params.title
   * @param {string} params.author
   * @param {string} params.rawText
   * @param {Buffer} params.fileBuffer
   * @param {string} params.originalFilename
   * @param {string} params.contentType
   * @returns {Promise<{ format: string, title?: string, author?: string, pageCount?: number, tablesCount?: number, chapters: Array, totalWordCount: number }>}
   */
  async ingest({
    title = '',
    author = '',
    description = '',
    rawText = '',
    fileBuffer = null,
    originalFilename = '',
    contentType = 'novel',
    url = '',
  }) {
    // 0. Web Acquisition Pipeline
    const targetUrl = url || (rawText && /^(https?:\/\/[^\s]+)$/.test(rawText.trim()) ? rawText.trim() : null);
    if (targetUrl) {
      const webAcquisitionService = require('../web/webAcquisitionService');
      const webResult = await webAcquisitionService.acquireFromUrl(targetUrl, {
        title,
        author,
        description,
        contentType,
      });

      return {
        format: 'web',
        title: webResult.book.title,
        author: webResult.book.author,
        pageCount: webResult.book.page_count,
        tablesCount: webResult.tablesCount || 0,
        chapters: webResult.chapters,
        totalWordCount: webResult.totalWordCount,
        book: webResult.book,
        webAcquired: true,
      };
    }

    const format = this.detectFormat(rawText, originalFilename, fileBuffer, url);

    // 1. PDF Pipeline
    if (format === 'pdf') {
      if (!fileBuffer || fileBuffer.length === 0) {
        throw new Error('PDF ingestion requires a valid file buffer.');
      }

      let structureMap = null;
      try {
        structureMap = await buildSectionMapFast(fileBuffer);
      } catch (_e) {
        structureMap = { method: 'none', warnings: ['sidecar_down'] };
      }

      if (structureMap && (structureMap.method === 'toc' || structureMap.method === 'heuristic')) {
        console.log(`[Ingestion] Structure: fast path (${structureMap.method})`);
      } else {
        console.log('[Ingestion] Structure: fallback to per-block classifier');
      }

      const pdfResult = await pdfjsParser.parse(fileBuffer, {
        title,
        author,
        originalFilename,
        structureMap,
      });

      // F31: Hook PDF math extraction via pdfmath (gated behind ENABLE_MATH_EXTRACTION)
      if (format === 'pdf' || format === 'PDF') {
        if (process.env.ENABLE_MATH_EXTRACTION === 'true') {
          const mathResult = await extractMath(fileBuffer);
          if (mathResult?.success && mathResult.latexBlocks && mathResult.latexBlocks.length > 0) {
            let replacedCount = 0;
            for (const mBlock of mathResult.latexBlocks) {
              if (!mBlock.textOriginal || !mBlock.latex || mBlock.textOriginal === mBlock.latex) {
                continue;
              }
              let blockReplaced = false;
              for (const ch of (pdfResult.chapters || [])) {
                if (ch.content && ch.content.includes(mBlock.textOriginal)) {
                  ch.content = ch.content.replaceAll(mBlock.textOriginal, mBlock.latex);
                  blockReplaced = true;
                }
                if (Array.isArray(ch.canonicalBlocks)) {
                  for (const cb of ch.canonicalBlocks) {
                    if (cb.text && cb.text.includes(mBlock.textOriginal)) {
                      cb.text = cb.text.replaceAll(mBlock.textOriginal, mBlock.latex);
                      blockReplaced = true;
                    }
                  }
                }
              }
              if (blockReplaced) {
                replacedCount++;
              }
            }
            console.log(`[MathExtractor] ${replacedCount} math blocks replaced`);
          } else {
            console.log('[MathExtractor] no math found (or sidecar down), text unchanged');
          }
        } else {
          console.log('[MathExtractor] DISABLED by default (ENABLE_MATH_EXTRACTION !== true). Skipping.');
        }
      }

      const totalWords = pdfResult.totalWordCount || pdfResult.chapters.reduce((sum, ch) => sum + ch.wordCount, 0);

      return {
        format: 'pdf',
        title: pdfResult.title || title || path.basename(originalFilename, '.pdf'),
        author: pdfResult.author || author || 'Unknown Author',
        pageCount: pdfResult.pageCount || 1,
        sectionCount: pdfResult.sectionCount || 0,
        tablesCount: pdfResult.tablesCount || 0,
        chapters: pdfResult.chapters,
        totalWordCount: totalWords,
        integrityStatus: pdfResult.integrityStatus || (totalWords === 0 ? 'empty_content' : 'valid'),
        integrityWarning: pdfResult.integrityWarning || (totalWords === 0 ? 'Content extraction incomplete: no selectable text found in the PDF source.' : ''),
        parse_mode: pdfResult.parse_mode,
        parse_confidence: pdfResult.parse_confidence,
      };
    }

    // 2. EPUB Pipeline
    if (format === 'epub') {
      if (!fileBuffer || fileBuffer.length === 0) {
        throw new Error('EPUB ingestion requires a valid file buffer.');
      }
      const epubResult = epubParser.parse(fileBuffer, {
        title,
        author,
        originalFilename,
      });

      // Count extracted tables across chapters and build nested section hierarchy
      let tablesCount = 0;
      let totalSections = 0;
      for (const ch of epubResult.chapters) {
        if (Array.isArray(ch.canonicalBlocks)) {
          tablesCount += ch.canonicalBlocks.filter((b) => b.type === 'table').length;
          const { sections } = documentStructureEngine.buildNestedSectionHierarchy(ch.canonicalBlocks);
          ch.sections = sections;
          ch.sectionCount = documentStructureEngine.countTotalSections(sections);
          ch.structuralRole = ch.structuralRole || documentStructureEngine.classifyRoleFromTitle(ch.title);
          ch.confidence = 0.95;
          totalSections += ch.sectionCount;
        }
      }

      const totalWords = epubResult.totalWordCount || epubResult.chapters.reduce((sum, ch) => sum + ch.wordCount, 0);

      return {
        format: 'epub',
        title: epubResult.title || title || path.basename(originalFilename, '.epub'),
        author: epubResult.author || author || 'Unknown Author',
        pageCount: epubResult.chapters.length, // logical chapter pagination
        sectionCount: totalSections,
        tablesCount,
        chapters: epubResult.chapters,
        totalWordCount: totalWords,
        integrityStatus: totalWords === 0 ? 'empty_content' : 'valid',
        integrityWarning: totalWords === 0 ? 'Content extraction incomplete: EPUB archive contained no readable chapter text.' : '',
      };
    }

    // 3. DOCX Pipeline
    if (format === 'unsupported_zip') {
      const err = new Error('Unsupported ZIP-based file. Supported archives: DOCX, EPUB.');
      err.code = 'UNSUPPORTED_FORMAT';
      throw err;
    }

    if (format === 'docx') {
      if (!config.USE_PYTHON_PARSER) {
        const err = new Error('Python parser is disabled. DOCX and RTF files are not currently supported.');
        err.code = 'UNSUPPORTED_FORMAT';
        throw err;
      }
      if (!fileBuffer || fileBuffer.length === 0) {
        throw new Error('DOCX ingestion requires a valid file buffer.');
      }
      console.log('[Routing: Ingestion] Format: DOCX | Decision: PYTHON_PARSER | Bytes: ' + fileBuffer.length + ' | Reason: Recognized DOCX extension and magic bytes');
      const docxResult = await docxParser.parse(fileBuffer, { title, author, originalFilename });
      return { format: 'docx', ...docxResult };
    }

    if (format === 'rtf') {
      if (!config.USE_PYTHON_PARSER) {
        const err = new Error('Python parser is disabled. DOCX and RTF files are not currently supported.');
        err.code = 'UNSUPPORTED_FORMAT';
        throw err;
      }
      if (!fileBuffer || fileBuffer.length === 0) {
        throw new Error('RTF ingestion requires a valid file buffer.');
      }
      console.log('[Routing: Ingestion] Format: RTF | Decision: PYTHON_PARSER | Bytes: ' + fileBuffer.length + ' | Reason: Recognized RTF extension and magic bytes');
      const rtfResult = await rtfParser.parse(fileBuffer, { title, author, originalFilename });
      return { format: 'rtf', ...rtfResult };
    }

    // 3. Text & Markdown Pipeline (buffer or text string)
    let text = rawText;
    if (!text && fileBuffer) {
      text = fileBuffer.toString('utf-8');
    }

    if (!text || text.trim() === '') {
      throw new Error('No readable content provided for ingestion.');
    }

    // Normalize input
    const normalizedText = contentNormalizer.normalize(text);

    // Raw text/block extraction
    const rawBlocks = documentStructureEngine.blocksFromText(normalizedText, format);

    // F32.1: Structure detection - try fast path first if PDF buffer is available
    let structureMap = null;
    if (fileBuffer && (format === 'pdf' || (fileBuffer.length >= 4 && fileBuffer[0] === 0x25 && fileBuffer[1] === 0x50))) {
      try {
        structureMap = await buildSectionMapFast(fileBuffer);
      } catch (_e) {
        structureMap = { method: 'none', warnings: ['sidecar_down'] };
      }
    }

    let priorSection = null;
    const classifiedBlocks = [];
    const storedSections = [];

    if (structureMap && (structureMap.method === 'toc' || structureMap.method === 'heuristic')) {
      console.log(`[Ingestion] Structure: fast path (${structureMap.method})`);
      // Fast path: skip front-matter pages, mark heading candidates; do NOT run per-block loop
      const fmRange = structureMap.frontMatterPageRange;
      const bmRange = structureMap.backMatterPageRange;
      const headingCandidateTexts = new Set(
        (structureMap.headingCandidates || []).map((h) => (h.text || '').trim().toLowerCase())
      );

      for (let i = 0; i < rawBlocks.length; i++) {
        const block = rawBlocks[i];
        const page = block.page || block.pageNum || 1;
        const isFrontMatter = fmRange && page >= fmRange[0] && page <= fmRange[1];
        const isBackMatter = bmRange && page >= bmRange[0] && page <= bmRange[1];
        const blockText = (block.text || '').trim().toLowerCase();
        const isHeading = headingCandidateTexts.has(blockText);

        block.section = isFrontMatter ? 'TOC' : (isBackMatter ? 'INDEX' : 'BODY');
        block.sectionConfidence = 0.9;
        if (isHeading) {
          block.isHeadingCandidate = true;
        }
        classifiedBlocks.push(block);
        storedSections.push({
          id: block.id,
          section: block.section,
          confidence: block.sectionConfidence,
          text: block.text,
          type: block.type,
        });
      }
    } else {
      if (structureMap && structureMap.method === 'none') {
        console.log('[Ingestion] Structure: fallback to per-block classifier');
      }
      // Current per-block loop
      for (let i = 0; i < rawBlocks.length; i++) {
        const block = rawBlocks[i];
        const context = {
          bookTitle: title || 'Full Text',
          isFirstBlock: i === 0,
          isLastBlock: i === rawBlocks.length - 1,
          priorSection,
        };
        const result = await classifySection(block, context);
        block.section = result.section;
        block.sectionConfidence = result.confidence;
        priorSection = result.section;
        classifiedBlocks.push(block);
        storedSections.push({
          id: block.id,
          section: result.section,
          confidence: result.confidence,
          text: block.text,
          type: block.type,
        });
      }
    }

    // Filter: only BODY blocks pass to chapter detection
    const bodyBlocks = classifiedBlocks.filter((b) => b.section === 'BODY');
    const blocksForChapterDetection = bodyBlocks.length > 0 ? bodyBlocks : classifiedBlocks;

    // Structure & Chapter Detection via DocumentStructureEngine
    let tree = null;
    if (structureMap && structureMap.method === 'toc' && structureMap.toc && structureMap.toc.length >= 3) {
      const tocChapters = documentStructureEngine.buildChaptersFromToc(structureMap.toc, blocksForChapterDetection, {
        title: title || 'Full Text',
        author: author || 'Unknown Author',
      });
      
      if (tocChapters) {
        console.log(`[Ingestion] Structure: TOC-driven chapter build (${structureMap.toc.length} entries)`);
        tree = {
          chapters: tocChapters.map((ch, index) => {
            const canonicalDoc = new CanonicalDocument(ch.blocks);
            const { sections } = documentStructureEngine.buildNestedSectionHierarchy(ch.blocks);
            return {
              id: `chap-${index + 1}`,
              number: index + 1,
              title: ch.title,
              structuralRole: 'chapter',
              confidence: 0.95,
              sourceLocation: {
                startOffset: ch.blocks[0]?.startOffset || 0,
                endOffset: ch.blocks[ch.blocks.length - 1]?.endOffset || 0,
                startPage: ch.pageStart,
                endPage: ch.pageEnd,
              },
              wordCount: canonicalDoc.calculateWordCount(),
              characterCount: canonicalDoc.toPlainText().length,
              canonicalBlocks: ch.blocks,
              sections: sections || [],
              sectionCount: documentStructureEngine.countTotalSections(sections || []),
              content: canonicalDoc.toPlainText(),
            };
          })
        };
      }
    }

    if (!tree) {
      tree = documentStructureEngine.buildStructureTree({
        format,
        rawText: normalizedText,
        blocks: blocksForChapterDetection,
        metadata: {
          title: title || 'Full Text',
          author: author || 'Unknown Author',
        },
      });
    }

    let tablesCount = 0;
    let totalSections = 0;

    // Process structured chapters and ensure canonical blocks
    const chapters = tree.chapters.map((ch, index) => {
      let blocks = ch.canonicalBlocks;
      if (!blocks || blocks.length === 0) {
        let canonicalDoc;
        if (format === 'markdown') {
          canonicalDoc = markdownParser.parse(ch.content || '');
        } else {
          canonicalDoc = textParser.parse(ch.content || '');
        }

        if (canonicalDoc.getBlocks().length === 0 && ch.content && ch.content.trim()) {
          canonicalDoc = CanonicalDocument.fromPlainText(ch.content);
        }
        blocks = canonicalDoc.toJSON();
      }

      tablesCount += blocks.filter((b) => b.type === 'table').length;
      const sCount = ch.sectionCount || (ch.sections ? ch.sections.length : 0);
      totalSections += sCount;

      return {
        number: index + 1,
        title: ch.title || `Chapter ${index + 1}`,
        structuralRole: ch.structuralRole || 'chapter',
        confidence: ch.confidence,
        sourceLocation: ch.sourceLocation,
        content: ch.content, // original source preserved immutable
        canonicalBlocks: blocks,
        sections: ch.sections,
        sectionCount: sCount,
        wordCount: ch.wordCount,
        characterCount: ch.characterCount,
      };
    });

    const totalWordCount = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);
    const isZero = totalWordCount === 0;

    return {
      format,
      title: title || (chapters[0] ? chapters[0].title : 'Document'),
      author: author || 'Unknown Author',
      pageCount: 1,
      sectionCount: totalSections,
      tablesCount,
      chapters,
      totalWordCount,
      integrityStatus: isZero ? 'empty_content' : 'valid',
      integrityWarning: isZero ? 'Content extraction incomplete: document contained no readable text.' : '',
      allBlocks: classifiedBlocks,
      storedSections,
    };
  }

  /**
   * Detects whether input is Web URL, PDF, EPUB, Markdown, or Plain Text
   */
  detectFormat(text = '', filename = '', buffer = null, url = '') {
    if (url || (text && /^(https?:\/\/[^\s]+)$/.test(text.trim()))) {
      return 'web';
    }

    if (filename) {
      const ext = path.extname(filename).toLowerCase();
      if (ext === '.pdf') return 'pdf';
      if (ext === '.epub') return 'epub';
      if (ext === '.md' || ext === '.markdown') return 'markdown';
      if (ext === '.txt' || ext === '.text') return 'text';
    }

    if (buffer && buffer.length >= 4) {
      // PDF magic bytes: %PDF- (0x25, 0x50, 0x44, 0x46)
      if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
        return 'pdf';
      }
      // Zip magic bytes: PK\x03\x04 (0x50, 0x4B, 0x03, 0x04)
      if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
        const ext = filename ? path.extname(filename).toLowerCase() : '';
        if (ext === '.docx') return 'docx';
        if (ext === '.epub') return 'epub'; // EPUB is supported
        return 'unsupported_zip';           // reject .odt, .xlsx, .zip, etc.
      }
      // RTF magic bytes: {\rtf (0x7B, 0x5C, 0x72, 0x74, 0x66)
      if (buffer.length >= 5 && buffer[0] === 0x7b && buffer[1] === 0x5c && buffer[2] === 0x72 && buffer[3] === 0x74 && buffer[4] === 0x66) {
        return 'rtf';
      }
    }

    // Heuristic detection based on markdown signals
    if (text) {
      const hasMdHeadings = /^#{1,6}\s+/m.test(text);
      const hasMdCodeFences = /^```/m.test(text);
      const hasMdTables = /\|.*\|.*\|/m.test(text);
      const hasMdBlockquotes = /^>\s+/m.test(text);
      const hasMdLists = /^[-*+]\s+/m.test(text);

      if (hasMdHeadings || hasMdCodeFences || hasMdTables || (hasMdBlockquotes && hasMdLists)) {
        return 'markdown';
      }
    }

    return 'text';
  }
}

module.exports = new IngestionService();

