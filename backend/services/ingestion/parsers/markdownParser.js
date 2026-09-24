const { CanonicalDocument } = require('../models/canonicalContent');

/**
 * Markdown Parser for Smart Reader
 * Transforms Markdown documents into structured CanonicalDocument blocks
 * so that formatting artifacts (#, ##, *, -, >, ---) do not leak into the reading experience.
 */
class MarkdownParser {
  /**
   * Parses markdown text into CanonicalDocument
   * @param {string} markdownText
   * @returns {CanonicalDocument}
   */
  parse(markdownText) {
    const doc = new CanonicalDocument();
    if (!markdownText || markdownText.trim() === '') {
      return doc;
    }

    const lines = markdownText.split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // 1. Skip empty lines
      if (!trimmedLine) {
        i++;
        continue;
      }

      // 2. Fenced code block
      const codeMatch = trimmedLine.match(/^```(\w*)/);
      if (codeMatch) {
        const language = codeMatch[1] || '';
        const codeLines = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        if (i < lines.length && lines[i].trim().startsWith('```')) {
          i++; // Skip closing ```
        }
        doc.addBlock({
          type: 'code',
          language,
          text: codeLines.join('\n'),
        });
        continue;
      }

      // 3. Separator / Horizontal Rule (---, ***, ___)
      if (/^(?:[-*_]\s*){3,}$/.test(trimmedLine)) {
        doc.addBlock({ type: 'separator' });
        i++;
        continue;
      }

      // 4. ATX Headings (# Heading)
      const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const text = this.cleanInlineMarkdown(headingMatch[2]);
        doc.addBlock({
          type: 'heading',
          level,
          text,
        });
        i++;
        continue;
      }

      // 5. Blockquote (> quote) or Callout (> [NOTE], > **Abstract:**)
      if (trimmedLine.startsWith('>')) {
        const quoteLines = [];
        while (i < lines.length && lines[i].trim().startsWith('>')) {
          const content = lines[i].trim().replace(/^>\s?/, '');
          quoteLines.push(content);
          i++;
        }
        const fullQuote = quoteLines.join(' ').trim();
        
        // Check for Callout pattern (> **Abstract:** ..., > **Abstract**: ..., > [!NOTE] ..., > **Warning:** ...)
        const calloutMatch = fullQuote.match(/^(?:\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\]|\*\*(Abstract|Note|Tip|Warning|Summary|Key Insight):?\*\*|\*\*(Abstract|Note|Tip|Warning|Summary|Key Insight)\*\*:?)\s*(.+)$/is);
        if (calloutMatch) {
          const matchedTitle = (calloutMatch[1] || calloutMatch[2] || calloutMatch[3] || 'Note').replace(/:$/, '');
          const rawType = matchedTitle.toLowerCase();
          let tone = 'info';
          if (rawType.includes('warn') || rawType.includes('caution')) tone = 'warning';
          else if (rawType.includes('tip')) tone = 'tip';
          else if (rawType.includes('abstract')) tone = 'abstract';

          doc.addBlock({
            type: 'callout',
            tone,
            title: matchedTitle,
            text: this.cleanInlineMarkdown(calloutMatch[4].trim()),
          });
        } else {
          doc.addBlock({
            type: 'quote',
            text: this.cleanInlineMarkdown(fullQuote),
          });
        }
        continue;
      }

      // 6. Markdown Table (| Header | Header |)
      if (trimmedLine.includes('|') && i + 1 < lines.length) {
        const nextTrimmed = lines[i + 1].trim();
        if (/^\|?\s*:?-+:?\s*(\|?\s*:?-+:?\s*)+\|?$/.test(nextTrimmed)) {
          const headers = this.parseTableRow(trimmedLine);
          const align = this.parseTableAlign(nextTrimmed, headers.length);
          const rows = [];
          i += 2; // skip header and separator row

          while (i < lines.length && lines[i].trim().includes('|') && lines[i].trim() !== '') {
            const rowCells = this.parseTableRow(lines[i].trim());
            if (rowCells.length > 0) {
              while (rowCells.length < headers.length) rowCells.push('');
              rows.push(rowCells);
            }
            i++;
          }

          doc.addBlock({
            type: 'table',
            headers,
            rows,
            align,
          });
          continue;
        }
      }

      // 7. Unordered List (- item, * item, + item)
      if (/^[-*+]\s+/.test(trimmedLine)) {
        const items = [];
        while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
          const itemText = lines[i].trim().replace(/^[-*+]\s+/, '');
          items.push(this.cleanInlineMarkdown(itemText));
          i++;
        }
        doc.addBlock({
          type: 'list',
          ordered: false,
          items,
        });
        continue;
      }

      // 8. Ordered List (1. item, 2. item)
      if (/^\d+\.\s+/.test(trimmedLine)) {
        const items = [];
        while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
          const itemText = lines[i].trim().replace(/^\d+\.\s+/, '');
          items.push(this.cleanInlineMarkdown(itemText));
          i++;
        }
        doc.addBlock({
          type: 'list',
          ordered: true,
          items,
        });
        continue;
      }

      // 9. Regular Paragraph (gather lines until blank line or block marker)
      const paraLines = [];
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        !lines[i].trim().startsWith('#') &&
        !lines[i].trim().startsWith('>') &&
        !lines[i].trim().startsWith('```') &&
        !/^[-*+]\s+/.test(lines[i].trim()) &&
        !/^\d+\.\s+/.test(lines[i].trim()) &&
        !/^(?:[-*_]\s*){3,}$/.test(lines[i].trim()) &&
        !(lines[i].trim().includes('|') && i + 1 < lines.length && /^\|?\s*:?-+:?\s*(\|?\s*:?-+:?\s*)+\|?$/.test(lines[i + 1].trim()))
      ) {
        paraLines.push(lines[i].trim());
        i++;
      }

      if (paraLines.length > 0) {
        const paraText = this.cleanInlineMarkdown(paraLines.join(' '));
        doc.addBlock({
          type: 'paragraph',
          text: paraText,
        });
      }
    }

    return doc;
  }

  /**
   * Cleans inline markdown artifacts (like **bold**, *italic*, `code`, [link](url))
   * so reading typography is elegant without bracket and asterisks clutter
   */
  cleanInlineMarkdown(str) {
    if (!str) return '';
    return str
      // Links: [Text](url) -> Text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Images: ![Alt](url) -> Alt
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      // Bold & Italic: ***text*** -> text
      .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
      // Bold: **text** or __text__ -> text
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      // Italic: *text* or _text_ -> text
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      // Inline code: `code` -> code
      .replace(/`([^`]+)`/g, '$1')
      // Strikethrough: ~~text~~ -> text
      .replace(/~~([^~]+)~~/g, '$1')
      .trim();
  }

  parseTableRow(line) {
    let raw = line.trim();
    if (raw.startsWith('|')) raw = raw.slice(1);
    if (raw.endsWith('|')) raw = raw.slice(0, -1);
    return raw.split('|').map((cell) => this.cleanInlineMarkdown(cell.trim()));
  }

  parseTableAlign(sepLine, expectedCols) {
    let raw = sepLine.trim();
    if (raw.startsWith('|')) raw = raw.slice(1);
    if (raw.endsWith('|')) raw = raw.slice(0, -1);
    const parts = raw.split('|').map((p) => p.trim());
    return parts.map((p) => {
      const left = p.startsWith(':');
      const right = p.endsWith(':');
      if (left && right) return 'center';
      if (right) return 'right';
      return 'left';
    });
  }
}

module.exports = new MarkdownParser();
