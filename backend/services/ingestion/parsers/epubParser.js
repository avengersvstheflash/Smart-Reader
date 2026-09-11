const path = require('path');
const AdmZip = require('adm-zip');
const { CanonicalDocument } = require('../models/canonicalContent');
const contentNormalizer = require('../normalizers/contentNormalizer');

/**
 * EPUB Parser for Smart Reader
 * Parses standard EPUB 2/3 e-books into structured chapters and canonical content.
 * Navigates container.xml -> OPF manifest & spine -> extracts XHTML chapters,
 * converting HTML structures (headings, paragraphs, blockquotes, tables, lists) into Canonical blocks.
 */
class EPUBParser {
  /**
   * Parses EPUB buffer into structured book with chapters
   * @param {Buffer} buffer
   * @param {object} options
   * @returns {{ title: string, author: string, chapters: Array, totalWordCount: number, format: string }}
   */
  parse(buffer, options = {}) {
    if (!buffer || buffer.length === 0) {
      throw new Error('Empty EPUB file buffer provided.');
    }

    let zip;
    try {
      zip = new AdmZip(buffer);
    } catch (err) {
      throw new Error(`Failed to read EPUB as zip archive: ${err.message}`);
    }

    const zipEntries = zip.getEntries();
    if (!zipEntries || zipEntries.length === 0) {
      throw new Error('Corrupted or empty EPUB archive.');
    }

    // 1. Locate container.xml to identify the OPF package file
    const containerEntry = zip.getEntry('META-INF/container.xml');
    let opfPath = 'OEBPS/content.opf'; // common default

    if (containerEntry) {
      const containerXml = containerEntry.getData().toString('utf-8');
      const rootfileMatch = containerXml.match(/full-path=["']([^"']+)["']/i);
      if (rootfileMatch && rootfileMatch[1]) {
        opfPath = rootfileMatch[1];
      }
    }

    // 2. Read OPF file
    let opfEntry = zip.getEntry(opfPath);
    if (!opfEntry) {
      // Search for any .opf file in the archive
      opfEntry = zipEntries.find((e) => e.entryName.toLowerCase().endsWith('.opf'));
    }

    if (!opfEntry) {
      throw new Error('EPUB package descriptor (.opf) could not be located in archive.');
    }

    const opfXml = opfEntry.getData().toString('utf-8');
    const opfDir = path.dirname(opfEntry.entryName);

    // Extract metadata
    const titleMatch = opfXml.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
    const authorMatch = opfXml.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i);
    const docTitle = options.title || (titleMatch ? titleMatch[1].trim() : '');
    const docAuthor = options.author || (authorMatch ? authorMatch[1].trim() : 'Unknown Author');

    // Extract manifest items (id -> href)
    const manifest = new Map();
    const itemRegex = /<item\s+[^>]*id=["']([^"']+)["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
    let itemMatch;
    while ((itemMatch = itemRegex.exec(opfXml)) !== null) {
      manifest.set(itemMatch[1], itemMatch[2]);
    }
    // Also support reversed attribute order: href then id
    const itemRegex2 = /<item\s+[^>]*href=["']([^"']+)["'][^>]*id=["']([^"']+)["'][^>]*>/gi;
    while ((itemMatch = itemRegex2.exec(opfXml)) !== null) {
      manifest.set(itemMatch[2], itemMatch[1]);
    }

    // Extract spine order (itemref idref="...")
    const spineItemRefs = [];
    const itemrefRegex = /<itemref\s+[^>]*idref=["']([^"']+)["'][^>]*>/gi;
    let refMatch;
    while ((refMatch = itemrefRegex.exec(opfXml)) !== null) {
      spineItemRefs.push(refMatch[1]);
    }

    // 3. Process spine items into chapters
    const chapters = [];
    let chapterIndex = 1;

    for (const idref of spineItemRefs) {
      const relHref = manifest.get(idref);
      if (!relHref) continue;

      // Filter out non-content files (CSS, images, etc.)
      const ext = path.extname(relHref).toLowerCase();
      if (!['.xhtml', '.html', '.htm', '.xml'].includes(ext)) continue;

      // Construct path inside zip
      const cleanRelHref = decodeURIComponent(relHref.split('#')[0]);
      let entryPath = opfDir ? path.posix.join(opfDir, cleanRelHref) : cleanRelHref;
      let chapterEntry = zip.getEntry(entryPath);

      if (!chapterEntry) {
        // Try fallback search by filename
        const baseFilename = path.basename(cleanRelHref);
        chapterEntry = zipEntries.find((e) => e.entryName.endsWith(baseFilename));
      }

      if (!chapterEntry) continue;

      const rawHtml = chapterEntry.getData().toString('utf-8');
      const { canonicalDoc, chapterTitle } = this.parseHtmlContent(rawHtml, chapterIndex);

      const blocks = canonicalDoc.getBlocks();
      if (blocks.length === 0) continue;

      const plainContent = canonicalDoc.toPlainText();
      if (plainContent.trim().length < 15) continue; // Skip empty boilerplate/cover wrapper pages

      const wordCount = canonicalDoc.calculateWordCount();

      chapters.push({
        number: chapterIndex,
        title: chapterTitle || `Chapter ${chapterIndex}`,
        content: plainContent,
        canonicalBlocks: blocks,
        wordCount,
      });

      chapterIndex++;
    }

    if (chapters.length === 0) {
      throw new Error('Could not extract readable chapter content from EPUB.');
    }

    return {
      title: docTitle || path.basename(options.originalFilename || 'EPUB Document', '.epub'),
      author: docAuthor,
      format: 'epub',
      chapters,
      totalWordCount: chapters.reduce((sum, ch) => sum + ch.wordCount, 0),
    };
  }

  /**
   * Parses XHTML/HTML content of a single chapter into CanonicalDocument blocks
   */
  parseHtmlContent(html, fallbackNum) {
    const doc = new CanonicalDocument();
    let detectedTitle = null;

    // Clean XML/HTML declarations and scripts/styles
    let clean = html
      .replace(/<\?xml[^>]*\?>/gi, '')
      .replace(/<!DOCTYPE[^>]*>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '');

    // Extract body content if present
    const bodyMatch = clean.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      clean = bodyMatch[1];
    }

    // Split into tag blocks using regex
    // We match: <h1>..</h1>, <p>..</p>, <blockquote>..</blockquote>, <table>..</table>, <ul>/<ol>, etc.
    const blockRegex = /<(h[1-6]|p|blockquote|pre|table|ul|ol|hr)(?:\s+[^>]*)?>([\s\S]*?)<\/\1>|<hr\s*\/?>/gi;
    let match;

    while ((match = blockRegex.exec(clean)) !== null) {
      const tag = (match[1] || 'hr').toLowerCase();
      const innerHtml = match[2] || '';

      switch (tag) {
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6': {
          const level = parseInt(tag.charAt(1), 10);
          const text = this.stripHtmlTags(innerHtml).trim();
          if (text) {
            if (!detectedTitle && level <= 2) {
              detectedTitle = text;
            }
            doc.addBlock({ type: 'heading', level, text });
          }
          break;
        }
        case 'p': {
          const text = this.stripHtmlTags(innerHtml).trim();
          if (text) {
            doc.addBlock({ type: 'paragraph', text });
          }
          break;
        }
        case 'blockquote': {
          const text = this.stripHtmlTags(innerHtml).trim();
          if (text) {
            doc.addBlock({ type: 'quote', text });
          }
          break;
        }
        case 'pre': {
          const text = this.stripHtmlTags(innerHtml);
          if (text) {
            doc.addBlock({ type: 'code', text });
          }
          break;
        }
        case 'hr': {
          doc.addBlock({ type: 'separator' });
          break;
        }
        case 'ul':
        case 'ol': {
          const items = [];
          const liRegex = /<li(?:\s+[^>]*)?>([\s\S]*?)<\/li>/gi;
          let liMatch;
          while ((liMatch = liRegex.exec(innerHtml)) !== null) {
            const liText = this.stripHtmlTags(liMatch[1]).trim();
            if (liText) items.push(liText);
          }
          if (items.length > 0) {
            doc.addBlock({
              type: 'list',
              ordered: tag === 'ol',
              items,
            });
          }
          break;
        }
        case 'table': {
          const tableBlock = this.parseHtmlTable(innerHtml);
          if (tableBlock) {
            doc.addBlock(tableBlock);
          }
          break;
        }
      }
    }

    // Fallback if no block tags matched (plain text document inside body)
    if (doc.getBlocks().length === 0) {
      const rawText = this.stripHtmlTags(clean);
      const normalized = contentNormalizer.normalize(rawText);
      const paragraphs = normalized.split(/\n\s*\n/).filter(Boolean);
      paragraphs.forEach((p) => doc.addBlock({ type: 'paragraph', text: p.trim() }));
    }

    return { canonicalDoc: doc, chapterTitle: detectedTitle };
  }

  /**
   * Parses an HTML <table> into canonical table block
   */
  parseHtmlTable(tableHtml) {
    let caption = '';
    const capMatch = tableHtml.match(/<caption[^>]*>([\s\S]*?)<\/caption>/i);
    if (capMatch) {
      caption = this.stripHtmlTags(capMatch[1]).trim();
    }

    const headers = [];
    const rows = [];

    // Check for <thead>
    const theadMatch = tableHtml.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
    if (theadMatch) {
      const thRegex = /<th(?:\s+[^>]*)?>([\s\S]*?)<\/th>/gi;
      let thMatch;
      while ((thMatch = thRegex.exec(theadMatch[1])) !== null) {
        headers.push(this.stripHtmlTags(thMatch[1]).trim());
      }
    }

    // Process <tr> rows
    const trRegex = /<tr(?:\s+[^>]*)?>([\s\S]*?)<\/tr>/gi;
    let trMatch;

    while ((trMatch = trRegex.exec(tableHtml)) !== null) {
      const rowHtml = trMatch[1];
      const cells = [];
      const cellRegex = /<(?:td|th)(?:\s+[^>]*)?>([\s\S]*?)<\/(?:td|th)>/gi;
      let cellMatch;

      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        cells.push(this.stripHtmlTags(cellMatch[1]).trim());
      }

      if (cells.length > 0) {
        // If no headers were in <thead> and this is the first row with <th> cells
        if (headers.length === 0 && rowHtml.includes('<th')) {
          headers.push(...cells);
        } else {
          rows.push(cells);
        }
      }
    }

    if (headers.length === 0 && rows.length > 0) {
      // Use first row as headers if no th exists
      const firstRow = rows.shift();
      headers.push(...firstRow);
    }

    if (headers.length === 0 && rows.length === 0) return null;

    return {
      type: 'table',
      caption,
      headers,
      rows,
    };
  }

  /**
   * Strips HTML tags and decodes common HTML entities
   */
  stripHtmlTags(html) {
    if (!html) return '';
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&mdash;/g, '—')
      .replace(/&ndash;/g, '–')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

module.exports = new EPUBParser();
