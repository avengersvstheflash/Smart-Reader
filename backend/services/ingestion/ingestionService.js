const path = require('path');
const contentNormalizer = require('./normalizers/contentNormalizer');
const textParser = require('./parsers/textParser');
const markdownParser = require('./parsers/markdownParser');
const pdfParser = require('./parsers/pdfParser');
const epubParser = require('./parsers/epubParser');
const chapterDetector = require('./structure/chapterDetector');
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
      const pdfResult = await pdfParser.parse(fileBuffer, {
        title,
        author,
        originalFilename,
      });

      return {
        format: 'pdf',
        title: pdfResult.title || title || path.basename(originalFilename, '.pdf'),
        author: pdfResult.author || author || 'Unknown Author',
        pageCount: pdfResult.pageCount || 1,
        tablesCount: pdfResult.tablesCount || 0,
        chapters: pdfResult.chapters,
        totalWordCount: pdfResult.chapters.reduce((sum, ch) => sum + ch.wordCount, 0),
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

      // Count extracted tables across chapters
      let tablesCount = 0;
      for (const ch of epubResult.chapters) {
        if (Array.isArray(ch.canonicalBlocks)) {
          tablesCount += ch.canonicalBlocks.filter((b) => b.type === 'table').length;
        }
      }

      return {
        format: 'epub',
        title: epubResult.title || title || path.basename(originalFilename, '.epub'),
        author: epubResult.author || author || 'Unknown Author',
        pageCount: epubResult.chapters.length, // logical chapter pagination
        tablesCount,
        chapters: epubResult.chapters,
        totalWordCount: epubResult.totalWordCount,
      };
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

    // Structure & Chapter Detection
    const detectedSegments = chapterDetector.detect(normalizedText, {
      defaultTitle: title || 'Full Text',
      format,
    });

    let tablesCount = 0;

    // Canonical Content Parsing per Chapter
    const chapters = detectedSegments.map((seg, index) => {
      let canonicalDoc;

      if (format === 'markdown') {
        canonicalDoc = markdownParser.parse(seg.rawContent);
      } else {
        canonicalDoc = textParser.parse(seg.rawContent);
      }

      if (canonicalDoc.getBlocks().length === 0 && seg.rawContent.trim()) {
        canonicalDoc = CanonicalDocument.fromPlainText(seg.rawContent);
      }

      const blocks = canonicalDoc.toJSON();
      tablesCount += blocks.filter((b) => b.type === 'table').length;
      const wordCount = canonicalDoc.calculateWordCount() || seg.rawContent.split(/\s+/).filter(Boolean).length;

      return {
        number: index + 1,
        title: seg.title || `Chapter ${index + 1}`,
        content: seg.rawContent, // original source preserved immutable
        canonicalBlocks: blocks,
        wordCount,
      };
    });

    return {
      format,
      title: title || (chapters[0] ? chapters[0].title : 'Document'),
      author: author || 'Unknown Author',
      pageCount: 1,
      tablesCount,
      chapters,
      totalWordCount: chapters.reduce((sum, ch) => sum + ch.wordCount, 0),
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
      // Zip magic bytes: PK\x03\x04 (0x50, 0x4B, 0x03, 0x04) for EPUB
      if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
        return 'epub';
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

