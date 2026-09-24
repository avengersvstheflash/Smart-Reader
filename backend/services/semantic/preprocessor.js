const crypto = require('crypto');

class Preprocessor {
  preprocessChapter(chapter, book = {}) {
    if (!chapter) return [];

    let canonicalBlocks = [];
    if (chapter.canonical_content) {
      try {
        canonicalBlocks = typeof chapter.canonical_content === 'string'
          ? JSON.parse(chapter.canonical_content)
          : chapter.canonical_content;
      } catch {
        canonicalBlocks = [];
      }
    }

    // If no canonical blocks, create basic blocks from raw content
    if (!Array.isArray(canonicalBlocks) || canonicalBlocks.length === 0) {
      canonicalBlocks = this.textToBasicBlocks(chapter.content || '');
    }

    return this.preprocessBlocks(canonicalBlocks, {
      bookId: book.id || chapter.book_id || chapter.bookId,
      bookTitle: book.title || '',
      chapterId: chapter.id,
      chapterNumber: chapter.number,
      chapterTitle: chapter.title,
      structuralRole: chapter.structural_role || chapter.structuralRole || 'chapter',
    });
  }

  preprocessBlocks(blocks, context = {}) {
    if (!Array.isArray(blocks)) return [];

    const units = [];
    let currentHeading = context.chapterTitle
      ? `Chapter ${context.chapterNumber ? context.chapterNumber + ': ' : ''}${context.chapterTitle}`
      : 'General';

    let sequence = 0;

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      if (!block) continue;

      const sourcePage = block.sourcePage || (block.metadata && block.metadata.sourcePage) || null;
      const structuralRole = context.structuralRole || 'chapter';

      if (block.type === 'heading') {
        const headingText = (block.text || '').trim();
        if (headingText) {
          currentHeading = headingText;
        }
        // Include heading block itself as a navigational marker or context
        units.push({
          sequence: sequence++,
          bookId: context.bookId,
          chapterId: context.chapterId,
          sectionHeading: currentHeading,
          contentType: 'heading',
          textContent: headingText,
          canonicalBlock: block,
          sourceReference: this.buildSourceRef(context, currentHeading, sourcePage),
          sourcePage,
          structuralRole,
          tokenCount: this.estimateTokens(headingText),
          contentHash: this.hashContent(`heading:${currentHeading}:${headingText}`),
        });
        continue;
      }

      if (block.type === 'paragraph') {
        const text = (block.text || '').trim();
        if (!text) continue;

        units.push({
          sequence: sequence++,
          bookId: context.bookId,
          chapterId: context.chapterId,
          sectionHeading: currentHeading,
          contentType: 'paragraph',
          textContent: text,
          canonicalBlock: block,
          sourceReference: this.buildSourceRef(context, currentHeading, sourcePage),
          sourcePage,
          structuralRole,
          tokenCount: this.estimateTokens(text),
          contentHash: this.hashContent(`para:${currentHeading}:${text}`),
        });
        continue;
      }

      if (block.type === 'list') {
        const items = Array.isArray(block.items) ? block.items : [];
        if (items.length === 0) continue;

        const listText = items.map((item, idx) => `• ${typeof item === 'string' ? item : item.text || ''}`).join('\n');
        units.push({
          sequence: sequence++,
          bookId: context.bookId,
          chapterId: context.chapterId,
          sectionHeading: currentHeading,
          contentType: 'list',
          textContent: listText,
          canonicalBlock: block,
          sourceReference: this.buildSourceRef(context, currentHeading, sourcePage),
          sourcePage,
          structuralRole,
          tokenCount: this.estimateTokens(listText),
          contentHash: this.hashContent(`list:${currentHeading}:${listText}`),
        });
        continue;
      }

      if (block.type === 'quote' || block.type === 'blockquote') {
        const quoteText = (block.text || '').trim();
        if (!quoteText) continue;
        const author = block.author ? ` — ${block.author}` : '';
        const fullQuote = `"${quoteText}"${author}`;

        units.push({
          sequence: sequence++,
          bookId: context.bookId,
          chapterId: context.chapterId,
          sectionHeading: currentHeading,
          contentType: 'quote',
          textContent: fullQuote,
          canonicalBlock: block,
          sourceReference: this.buildSourceRef(context, currentHeading, sourcePage),
          sourcePage,
          structuralRole,
          tokenCount: this.estimateTokens(fullQuote),
          contentHash: this.hashContent(`quote:${currentHeading}:${fullQuote}`),
        });
        continue;
      }

      if (block.type === 'table') {
        const headers = Array.isArray(block.headers) ? block.headers : [];
        const rows = Array.isArray(block.rows) ? block.rows : [];
        
        let tableText = '';
        if (headers.length > 0) {
          tableText += `| ${headers.join(' | ')} |\n`;
          tableText += `| ${headers.map(() => '---').join(' | ')} |\n`;
        }
        for (const row of rows) {
          if (Array.isArray(row)) {
            tableText += `| ${row.join(' | ')} |\n`;
          }
        }

        if (tableText.trim()) {
          units.push({
            sequence: sequence++,
            bookId: context.bookId,
            chapterId: context.chapterId,
            sectionHeading: currentHeading,
            contentType: 'table',
            textContent: tableText.trim(),
            canonicalBlock: block,
            sourceReference: this.buildSourceRef(context, currentHeading, sourcePage),
            sourcePage,
            structuralRole,
            tokenCount: this.estimateTokens(tableText),
            contentHash: this.hashContent(`table:${currentHeading}:${tableText}`),
          });
        }
        continue;
      }

      if (block.type === 'callout') {
        const title = (block.title || '').trim();
        const text = (block.text || '').trim();
        const variant = block.variant || 'info';
        const formatted = `[${variant.toUpperCase()}${title ? ': ' + title : ''}] ${text}`;

        units.push({
          sequence: sequence++,
          bookId: context.bookId,
          chapterId: context.chapterId,
          sectionHeading: currentHeading,
          contentType: 'callout',
          textContent: formatted,
          canonicalBlock: block,
          sourceReference: this.buildSourceRef(context, currentHeading, sourcePage),
          sourcePage,
          structuralRole,
          tokenCount: this.estimateTokens(formatted),
          contentHash: this.hashContent(`callout:${currentHeading}:${formatted}`),
        });
        continue;
      }

      // Fallback for custom or code blocks
      const fallbackText = (block.text || block.content || JSON.stringify(block)).trim();
      if (fallbackText) {
        units.push({
          sequence: sequence++,
          bookId: context.bookId,
          chapterId: context.chapterId,
          sectionHeading: currentHeading,
          contentType: block.type || 'unknown',
          textContent: fallbackText,
          canonicalBlock: block,
          sourceReference: this.buildSourceRef(context, currentHeading, sourcePage),
          sourcePage,
          structuralRole,
          tokenCount: this.estimateTokens(fallbackText),
          contentHash: this.hashContent(`custom:${currentHeading}:${fallbackText}`),
        });
      }
    }

    return units;
  }

  textToBasicBlocks(text) {
    if (!text || typeof text !== 'string') return [];
    const paragraphs = text.split(/\n\s*\n+/);
    const blocks = [];

    for (const p of paragraphs) {
      const trimmed = p.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('# ')) {
        blocks.push({ type: 'heading', level: 1, text: trimmed.replace(/^#\s+/, '') });
      } else if (trimmed.startsWith('## ')) {
        blocks.push({ type: 'heading', level: 2, text: trimmed.replace(/^##\s+/, '') });
      } else if (trimmed.startsWith('### ')) {
        blocks.push({ type: 'heading', level: 3, text: trimmed.replace(/^###\s+/, '') });
      } else if (trimmed.startsWith('>')) {
        blocks.push({ type: 'quote', text: trimmed.replace(/^>\s*/gm, '') });
      } else {
        blocks.push({ type: 'paragraph', text: trimmed });
      }
    }

    return blocks;
  }

  buildSourceRef(context, heading, sourcePage = null) {
    const parts = [];
    if (context.bookTitle) parts.push(context.bookTitle);
    if (context.chapterTitle) parts.push(context.chapterTitle);
    if (heading && heading !== context.chapterTitle) parts.push(heading);
    let ref = parts.join(' > ');
    if (sourcePage) {
      ref += ` (p. ${sourcePage})`;
    }
    return ref;
  }

  estimateTokens(text) {
    if (!text) return 0;
    // Standard rule of thumb: ~4 characters per token in English
    return Math.max(1, Math.ceil(text.length / 4));
  }

  hashContent(content) {
    return crypto.createHash('sha256').update(content || '', 'utf8').digest('hex');
  }
}

module.exports = new Preprocessor();
