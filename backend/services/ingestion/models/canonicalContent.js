/**
 * Canonical Content Model for Smart Reader
 * Defines the structured, format-agnostic representation of document content.
 * All parsers (TXT, Markdown, and future EPUB, PDF, Manga) normalize into this format.
 */

class CanonicalDocument {
  constructor(blocks = []) {
    this.blocks = Array.isArray(blocks) ? blocks : [];
  }

  /**
   * Adds a block to the document
   * Supported types: 'paragraph', 'heading', 'quote', 'list', 'separator', 'code', 'table', 'callout'
   */
  addBlock(block) {
    if (!block || !block.type) return;
    if (!block.id) {
      block.id = `blk-${this.blocks.length + 1}-${Math.random().toString(36).substring(2, 6)}`;
    }
    this.blocks.push(block);
  }

  getBlocks() {
    return this.blocks;
  }

  /**
   * Converts canonical blocks into clean plain text (useful for AI prompts and full-text search)
   */
  toPlainText() {
    const textSegments = [];

    for (const block of this.blocks) {
      switch (block.type) {
        case 'heading':
          textSegments.push(`\n${block.text}\n`);
          break;
        case 'paragraph':
          textSegments.push(block.text);
          break;
        case 'quote':
          textSegments.push(`"${block.text}"`);
          break;
        case 'callout':
          textSegments.push(`[${block.title || 'Note'}]: ${block.text}`);
          break;
        case 'list':
          if (Array.isArray(block.items)) {
            const listText = block.items
              .map((item, idx) => (block.ordered ? `${idx + 1}. ${item}` : `• ${item}`))
              .join('\n');
            textSegments.push(listText);
          }
          break;
        case 'code':
          textSegments.push(block.text);
          break;
        case 'table':
          if (Array.isArray(block.headers) && Array.isArray(block.rows)) {
            const tableLines = [];
            if (block.caption) tableLines.push(`Table: ${block.caption}`);
            if (block.headers.length > 0) {
              tableLines.push(`| ${block.headers.join(' | ')} |`);
              tableLines.push(`| ${block.headers.map(() => '---').join(' | ')} |`);
            }
            for (const row of block.rows) {
              if (Array.isArray(row)) {
                tableLines.push(`| ${row.join(' | ')} |`);
              }
            }
            textSegments.push(tableLines.join('\n'));
          }
          break;
        case 'separator':
          textSegments.push('\n---\n');
          break;
        default:
          if (block.text) textSegments.push(block.text);
      }
    }

    return textSegments.join('\n\n').trim();
  }

  /**
   * Calculates total word count across all text blocks
   */
  calculateWordCount() {
    const plain = this.toPlainText();
    if (!plain) return 0;
    return plain.split(/\s+/).filter(Boolean).length;
  }

  toJSON() {
    return this.blocks;
  }

  static fromJSON(blocksJson) {
    if (!blocksJson) return new CanonicalDocument([]);
    try {
      const parsed = typeof blocksJson === 'string' ? JSON.parse(blocksJson) : blocksJson;
      return new CanonicalDocument(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new CanonicalDocument([]);
    }
  }

  /**
   * Fallback converter: converts raw plain text into basic canonical paragraphs
   */
  static fromPlainText(rawText) {
    if (!rawText) return new CanonicalDocument([]);
    const paragraphs = rawText
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);

    const blocks = paragraphs.map((text) => ({
      type: 'paragraph',
      text,
    }));

    return new CanonicalDocument(blocks);
  }
}

module.exports = {
  CanonicalDocument,
};
