/**
 * AI Output Normalizer
 * Converts raw LLM output into Smart Reader's structured Canonical Block representation.
 * Prevents raw Markdown syntax (### #1., **, ***, |, ---) and raw HTML tags (<strong>, <em>, etc.)
 * from leaking into the reading canvas.
 */

class AINormalizer {
  /**
   * Normalizes raw AI output string into an array of canonical blocks
   * @param {string} rawText
   * @returns {Array<Object>} Canonical blocks
   */
  normalize(rawText) {
    if (!rawText || typeof rawText !== 'string' || rawText.trim() === '') {
      return [{ type: 'paragraph', text: 'No summary content generated.' }];
    }

    // Pre-normalize text to handle HTML tags, carriage returns, and stray tokens
    const cleanedText = this.sanitizeRawText(rawText);
    const lines = cleanedText.split(/\r?\n/);
    const blocks = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // 1. Skip empty lines or lone empty hash markers (e.g. "###" or "##")
      if (!trimmed || /^#{1,6}\s*$/.test(trimmed)) {
        i++;
        continue;
      }

      // 2. Fenced code blocks
      if (trimmed.startsWith('```')) {
        const lang = trimmed.replace(/^```\s*/, '').trim();
        const codeLines = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        if (i < lines.length && lines[i].trim().startsWith('```')) {
          i++;
        }
        blocks.push({
          type: 'code',
          language: lang || 'text',
          text: codeLines.join('\n'),
        });
        continue;
      }

      // 3. Separator lines (---, ***, ___, ✦ ✦ ✦)
      if (/^(?:[-*_]\s*){3,}$/.test(trimmed) || /^(?:✦\s*){3,}$/.test(trimmed)) {
        blocks.push({ type: 'separator' });
        i++;
        continue;
      }

      // 4. ATX Headings: # Heading, ## Heading, ### #1. Heading, ### 1. Heading
      const atxMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (atxMatch) {
        const level = atxMatch[1].length;
        let headingText = atxMatch[2].trim();
        // Clean duplicate leading hashes e.g. "### #1. Title" -> "1. Title"
        headingText = headingText.replace(/^#+\s*/, '');
        // Clean bold/italic markers inside heading
        headingText = this.stripMarkdownSymbols(headingText);

        if (headingText) {
          blocks.push({
            type: 'heading',
            level: Math.min(4, Math.max(1, level)),
            text: headingText,
          });
        }
        i++;
        continue;
      }

      // 5. Standalone Bold / Italic line acting as a section header
      // Examples: "**Zero-Dollar Architecture:**" or "***Multimodal Content Delivery:***"
      const boldHeadingMatch = trimmed.match(/^\*{2,3}(.+?)\*{2,3}:?\s*$/);
      if (boldHeadingMatch && boldHeadingMatch[1].length > 1 && boldHeadingMatch[1].length < 120) {
        const headerText = this.stripMarkdownSymbols(boldHeadingMatch[1]).replace(/:$/, '').trim();
        if (headerText) {
          blocks.push({
            type: 'heading',
            level: 3,
            text: headerText,
          });
        }
        i++;
        continue;
      }

      // 6. Blockquote or Callout (> quote or > **Note:** ...)
      if (trimmed.startsWith('>')) {
        const quoteLines = [];
        while (i < lines.length && lines[i].trim().startsWith('>')) {
          const content = lines[i].trim().replace(/^>\s?/, '');
          quoteLines.push(content);
          i++;
        }
        const fullQuote = quoteLines.join(' ').trim();

        // Check for Callout pattern (> **Key Takeaway:** ..., > [!NOTE] ..., > **Warning:** ...)
        const calloutMatch = fullQuote.match(
          /^(?:\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\]|\*\*(Abstract|Note|Tip|Warning|Summary|Key Insight|Takeaway|Key Takeaway|Significance):?\*\*|\*\*(Abstract|Note|Tip|Warning|Summary|Key Insight|Takeaway|Key Takeaway|Significance)\*\*:?)\s*(.+)$/is
        );

        if (calloutMatch) {
          const rawTone = (calloutMatch[1] || calloutMatch[2] || calloutMatch[3] || 'Note').toLowerCase();
          let variant = 'note';
          if (rawTone.includes('warn') || rawTone.includes('caution')) variant = 'warning';
          else if (rawTone.includes('tip')) variant = 'tip';
          else if (rawTone.includes('abstract') || rawTone.includes('summary')) variant = 'abstract';

          const title = (calloutMatch[1] || calloutMatch[2] || calloutMatch[3] || 'Key Insight').replace(/:$/, '');
          const bodyText = this.cleanInlineText(calloutMatch[4].trim());

          blocks.push({
            type: 'callout',
            variant,
            title,
            text: bodyText,
          });
        } else {
          blocks.push({
            type: 'quote',
            text: this.cleanInlineText(fullQuote),
          });
        }
        continue;
      }

      // 7. Markdown Table (| Header 1 | Header 2 |)
      if (trimmed.includes('|') && i + 1 < lines.length) {
        const nextTrimmed = lines[i + 1].trim();
        if (/^\|?\s*:?-+:?\s*(\|?\s*:?-+:?\s*)+\|?$/.test(nextTrimmed)) {
          const headers = this.parseTableRow(trimmed);
          const alignments = this.parseTableAlign(nextTrimmed, headers.length);
          const rows = [];
          i += 2; // skip header and delimiter row

          while (i < lines.length && lines[i].trim().includes('|') && lines[i].trim() !== '') {
            const rowCells = this.parseTableRow(lines[i].trim());
            if (rowCells.length > 0) {
              while (rowCells.length < headers.length) rowCells.push('');
              rows.push(rowCells.slice(0, headers.length));
            }
            i++;
          }

          blocks.push({
            type: 'table',
            headers,
            rows,
            alignments,
          });
          continue;
        }
      }

      // 8. Unordered List (- item, * item, + item, • item)
      if (/^(?:[-*+]|•|⁃|‣)\s+/.test(trimmed)) {
        const items = [];
        while (i < lines.length && /^(?:[-*+]|•|⁃|‣)\s+/.test(lines[i].trim())) {
          const itemText = lines[i].trim().replace(/^(?:[-*+]|•|⁃|‣)\s+/, '');
          items.push(this.cleanInlineText(itemText));
          i++;
        }
        blocks.push({
          type: 'list',
          ordered: false,
          items,
        });
        continue;
      }

      // 9. Ordered List (1. item, 2. item)
      if (/^\d+\.\s+/.test(trimmed)) {
        const items = [];
        while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
          const itemText = lines[i].trim().replace(/^\d+\.\s+/, '');
          items.push(this.cleanInlineText(itemText));
          i++;
        }
        blocks.push({
          type: 'list',
          ordered: true,
          items,
        });
        continue;
      }

      // 10. Regular Paragraph
      const paraLines = [];
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        !lines[i].trim().startsWith('#') &&
        !lines[i].trim().startsWith('>') &&
        !lines[i].trim().startsWith('```') &&
        !/^\*{2,3}.+?\*{2,3}:?\s*$/.test(lines[i].trim()) &&
        !/^(?:[-*+]|•|⁃|‣)\s+/.test(lines[i].trim()) &&
        !/^\d+\.\s+/.test(lines[i].trim()) &&
        !/^(?:[-*_]\s*){3,}$/.test(lines[i].trim()) &&
        !(lines[i].trim().includes('|') && i + 1 < lines.length && /^\|?\s*:?-+:?\s*(\|?\s*:?-+:?\s*)+\|?$/.test(lines[i + 1].trim()))
      ) {
        paraLines.push(lines[i].trim());
        i++;
      }

      if (paraLines.length > 0) {
        const fullPara = paraLines.join(' ');
        const cleanedPara = this.cleanInlineText(fullPara);
        if (cleanedPara) {
          blocks.push({
            type: 'paragraph',
            text: cleanedPara,
          });
        }
      }
    }

    if (blocks.length === 0) {
      blocks.push({ type: 'paragraph', text: this.cleanInlineText(rawText) || 'No summary content generated.' });
    }

    return blocks;
  }

  /**
   * Sanitizes raw text from LLMs before parsing:
   * Replaces raw HTML tags (<strong>, <em>, <b>, <i>, <code>, <del>, <br>)
   * with clean markdown tokens, strips dangerous tags, and removes carriage returns.
   */
  sanitizeRawText(str) {
    if (!str) return '';
    return str
      // Replace raw HTML formatting tags with markdown tokens
      .replace(/<\/?(?:strong|b)>/gi, '**')
      .replace(/<\/?(?:em|i)>/gi, '*')
      .replace(/<\/?code>/gi, '`')
      .replace(/<\/?del>/gi, '~~')
      .replace(/<br\s*\/?>/gi, '\n')
      // Strip block HTML tags if LLM emitted them
      .replace(/<\/?(?:p|div|span|section|article)>/gi, '\n')
      .replace(/<blockquote[^>]*>/gi, '> ')
      .replace(/<\/blockquote>/gi, '\n')
      // Remove any other stray HTML tags
      .replace(/<[^>]+>/g, '');
  }

  /**
   * Cleans inline text inside blocks:
   * Strips stray unclosed asterisks, lone leading hashes, and normalizes links and spacing.
   */
  cleanInlineText(str) {
    if (!str) return '';
    let s = str
      // Links: [Text](url) -> Text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Strip stray hash markers leaking into inline paragraphs
      .replace(/^#+\s*/, '')
      .replace(/\s+#+\s*/g, ' ')
      .trim();

    // Fix unclosed bold/italic markers e.g. "**Only one side" -> "Only one side"
    const starCount = (s.match(/\*/g) || []).length;
    if (starCount % 2 !== 0) {
      // Unpaired asterisk: remove isolated asterisks
      s = s.replace(/(?<!\*)\*(?!\*)/g, '');
    }

    return s;
  }

  /**
   * Cleans inline markdown symbols completely for plain headings/labels
   */
  stripMarkdownSymbols(str) {
    if (!str) return '';
    return str
      .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
      .replace(/_{1,3}([^_]+)_{1,3}/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/^#+\s*/, '')
      .trim();
  }

  /**
   * Formats inline markdown safely for rich typography:
   * Standardizes inline formatting without leaking raw HTML or broken tokens.
   */
  formatInlineMarkdown(str) {
    return this.cleanInlineText(str);
  }

  parseTableRow(line) {
    let raw = line.trim();
    if (raw.startsWith('|')) raw = raw.slice(1);
    if (raw.endsWith('|')) raw = raw.slice(0, -1);
    return raw.split('|').map((cell) => this.cleanInlineText(cell.trim()));
  }

  parseTableAlign(sepLine, count) {
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

module.exports = new AINormalizer();
