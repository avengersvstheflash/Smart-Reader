const { CanonicalDocument } = require('../ingestion/models/canonicalContent');

/**
 * Web Structure Detector for Smart Reader
 * Intelligently groups canonical blocks into logical chapters or sections
 * (e.g., Introduction, Methodology, Results, Reference, Overview)
 * without forcing artificial splits on short or single-topic articles.
 */
class WebStructureDetector {
  /**
   * Structures canonical blocks into chapters
   * @param {CanonicalDocument} canonicalDoc
   * @param {object} metadata
   * @returns {Array<{ number: number, title: string, canonicalBlocks: Array<object>, content: string, wordCount: number }>}
   */
  structure(canonicalDoc, metadata = {}) {
    const blocks = canonicalDoc.getBlocks();
    if (!blocks || blocks.length === 0) {
      return [
        {
          number: 1,
          title: metadata.title || 'Document Content',
          canonicalBlocks: [],
          content: '',
          wordCount: 0,
        },
      ];
    }

    const docTitle = metadata.title || 'Web Document';

    // 1. Scan for major headings (level 1 or 2)
    const majorHeadings = [];
    blocks.forEach((block, index) => {
      if (block.type === 'heading' && (block.level === 1 || block.level === 2)) {
        // Exclude headings that match docTitle exactly
        if (block.text.toLowerCase() !== docTitle.toLowerCase()) {
          majorHeadings.push({ index, block });
        }
      }
    });

    // If there are fewer than 2 major headings, keep as single chapter
    // (Per requirement: "Do not force artificial chapters where the source does not support them.")
    if (majorHeadings.length < 2) {
      const singleDoc = new CanonicalDocument(blocks);
      const text = singleDoc.toPlainText();
      return [
        {
          number: 1,
          title: docTitle,
          canonicalBlocks: blocks,
          content: text,
          wordCount: singleDoc.calculateWordCount(),
        },
      ];
    }

    // 2. Partition into structured chapters based on major headings
    const chapters = [];
    let currentChapterTitle = 'Introduction';
    let currentBlocks = [];

    // If there are blocks before the first major heading
    const firstHeadingIdx = majorHeadings[0].index;
    if (firstHeadingIdx > 0) {
      const introBlocks = blocks.slice(0, firstHeadingIdx);
      if (introBlocks.some(b => b.type === 'paragraph' && b.text.length > 20)) {
        const introDoc = new CanonicalDocument(introBlocks);
        chapters.push({
          number: chapters.length + 1,
          title: 'Introduction & Overview',
          canonicalBlocks: introBlocks,
          content: introDoc.toPlainText(),
          wordCount: introDoc.calculateWordCount(),
        });
      }
    }

    for (let i = 0; i < majorHeadings.length; i++) {
      const headingInfo = majorHeadings[i];
      const nextHeadingInfo = majorHeadings[i + 1];

      const startIndex = headingInfo.index;
      const endIndex = nextHeadingInfo ? nextHeadingInfo.index : blocks.length;

      const chapterBlocks = blocks.slice(startIndex, endIndex);
      const chapterHeading = headingInfo.block.text.trim();
      const chapterDoc = new CanonicalDocument(chapterBlocks);
      const wordCount = chapterDoc.calculateWordCount();

      // Skip empty or trivial utility headings (e.g., "See Also", "External Links", "Notes")
      const lowerHeading = chapterHeading.toLowerCase();
      if (
        (lowerHeading === 'see also' || lowerHeading === 'external links' || lowerHeading === 'references' || lowerHeading === 'further reading') &&
        wordCount < 40
      ) {
        continue;
      }

      chapters.push({
        number: chapters.length + 1,
        title: chapterHeading || `Section ${chapters.length + 1}`,
        canonicalBlocks: chapterBlocks,
        content: chapterDoc.toPlainText(),
        wordCount,
      });
    }

    // If filtering left us with 0 chapters, fallback to single chapter
    if (chapters.length === 0) {
      const fullDoc = new CanonicalDocument(blocks);
      return [
        {
          number: 1,
          title: docTitle,
          canonicalBlocks: blocks,
          content: fullDoc.toPlainText(),
          wordCount: fullDoc.calculateWordCount(),
        },
      ];
    }

    return chapters;
  }
}

module.exports = new WebStructureDetector();
