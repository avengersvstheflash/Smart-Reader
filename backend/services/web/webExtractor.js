const cheerio = require('cheerio');
const { CanonicalDocument } = require('../ingestion/models/canonicalContent');

/**
 * Web Extractor for Smart Reader
 * Cleans webpage chrome (navigation, footers, scripts, ads),
 * extracts rich metadata with full provenance,
 * and transforms semantic HTML elements into canonical content blocks.
 */
class WebExtractor {
  /**
   * Extracts clean metadata and canonical content from HTML
   * @param {string} html Raw HTML
   * @param {string} sourceUrl Original webpage URL
   * @returns {{ metadata: object, canonicalDoc: CanonicalDocument, plainText: string }}
   */
  extract(html, sourceUrl = '') {
    if (!html || typeof html !== 'string') {
      throw new Error('HTML content is required for extraction.');
    }

    const $ = cheerio.load(html, {
      decodeEntities: true,
    });

    const parsedUrl = sourceUrl ? this.safeParseUrl(sourceUrl) : null;

    // 1. Extract Provenance & Metadata
    const metadata = this.extractMetadata($, parsedUrl, sourceUrl);

    // 2. Remove Irrelevant Webpage Chrome
    this.cleanChrome($);

    // 3. Select Primary Content Container
    const contentRoot = this.findContentRoot($);

    // 4. Transform Semantic HTML into Canonical Blocks
    const canonicalDoc = new CanonicalDocument();
    this.extractBlocks($, contentRoot, canonicalDoc);

    // If no blocks were extracted (uncommon), fallback to paragraphs from text
    if (canonicalDoc.getBlocks().length === 0) {
      const fallbackText = contentRoot.text().trim();
      if (fallbackText) {
        const paras = fallbackText.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
        for (const p of paras) {
          canonicalDoc.addBlock({ type: 'paragraph', text: p });
        }
      }
    }

    const plainText = canonicalDoc.toPlainText();
    const wordCount = canonicalDoc.calculateWordCount();

    metadata.wordCount = wordCount;
    metadata.blockCount = canonicalDoc.getBlocks().length;

    return {
      metadata,
      canonicalDoc,
      plainText,
    };
  }

  safeParseUrl(urlStr) {
    try {
      return new URL(urlStr);
    } catch {
      return null;
    }
  }

  /**
   * Extracts structured provenance metadata
   */
  extractMetadata($, parsedUrl, originalUrl) {
    const domain = parsedUrl ? parsedUrl.hostname.replace(/^www\./i, '') : 'Web Source';

    // Site Name resolution
    let siteName = 
      $('meta[property="og:site_name"]').attr('content') ||
      $('meta[name="publisher"]').attr('content') ||
      $('meta[name="application-name"]').attr('content');

    if (!siteName && parsedUrl) {
      if (parsedUrl.hostname.includes('wikipedia.org')) siteName = 'Wikipedia';
      else if (parsedUrl.hostname.includes('openlibrary.org')) siteName = 'Open Library';
      else if (parsedUrl.hostname.includes('mozilla.org')) siteName = 'MDN Web Docs';
      else if (parsedUrl.hostname.includes('arxiv.org')) siteName = 'arXiv';
      else if (parsedUrl.hostname.includes('github.com')) siteName = 'GitHub';
      else siteName = domain;
    }

    // Title resolution
    let title = 
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('h1').first().text().trim() ||
      $('title').text().trim();

    // Clean common title suffixes (e.g., " - Wikipedia", " | MDN")
    if (title) {
      title = title
        .replace(/\s*[-–—|]\s*Wikipedia.*$/i, '')
        .replace(/\s*[-–—|]\s*MDN.*$/i, '')
        .replace(/\s*[-–—|]\s*Medium.*$/i, '')
        .replace(/\s*[-–—|]\s*Substack.*$/i, '')
        .trim();
    }
    if (!title && parsedUrl) {
      const slug = parsedUrl.pathname.split('/').filter(Boolean).pop();
      title = slug ? decodeURIComponent(slug).replace(/[_-]/g, ' ') : domain;
    }

    // Author resolution
    let author =
      $('meta[name="author"]').attr('content') ||
      $('meta[property="article:author"]').attr('content') ||
      $('meta[name="twitter:creator"]').attr('content') ||
      $('[rel="author"]').first().text().trim() ||
      $('.author, .byline, .article-author').first().text().trim();

    if (!author) {
      if (siteName === 'Wikipedia') author = 'Wikipedia Contributors';
      else author = siteName || 'Web Author';
    }

    // Description resolution
    const description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      $('meta[name="twitter:description"]').attr('content') ||
      '';

    // Published date resolution
    const publishedDate =
      $('meta[property="article:published_time"]').attr('content') ||
      $('meta[name="date"]').attr('content') ||
      $('time[datetime]').first().attr('datetime') ||
      null;

    const retrievalDate = new Date().toISOString();

    return {
      title: title || 'Untitled Web Document',
      author: author || 'Unknown Author',
      siteName: siteName || domain,
      originalUrl: originalUrl || '',
      domain,
      description: description ? description.trim() : '',
      publishedDate,
      retrievalDate,
      sourceFormat: 'web',
    };
  }

  /**
   * Strips ads, scripts, navigation, footer, and unneeded widgets
   */
  cleanChrome($) {
    const selectorsToRemove = [
      'script',
      'style',
      'noscript',
      'nav',
      'header',
      'footer',
      'aside',
      'iframe',
      'form',
      'button',
      'input',
      'select',
      'textarea',
      'svg',
      // Common web clutter
      '.ad',
      '.ads',
      '.advertisement',
      '.cookie-banner',
      '.cookie-notice',
      '.consent-banner',
      '.social-share',
      '.share-buttons',
      '.sidebar',
      '.nav-menu',
      '.navigation',
      '.comments',
      '#comments',
      '#disqus_thread',
      '.noprint',
      '.menu',
      '[role="navigation"]',
      '[role="banner"]',
      '[role="contentinfo"]',
      // Wikipedia specific clutter
      '.mw-editsection',
      '.reflist',
      '.navbox',
      '.catlinks',
      '.hatnote',
      '.reference',
      '.mw-jump-link',
      '.shortdescription',
      '.mw-empty-elt',
      '.portal',
      '.metadata',
    ];

    $(selectorsToRemove.join(', ')).remove();
  }

  /**
   * Finds the most informative content container
   */
  findContentRoot($) {
    const candidateSelectors = [
      'article',
      '[role="main"]',
      'main',
      '.mw-parser-output', // Wikipedia article container
      '.post-content',
      '.entry-content',
      '.article-body',
      '.content-area',
      '#mw-content-text',
      '#content',
      '#main-content',
    ];

    for (const selector of candidateSelectors) {
      const el = $(selector);
      if (el.length > 0 && el.text().trim().length > 150) {
        return el.first();
      }
    }

    return $('body').length > 0 ? $('body') : $.root();
  }

  /**
   * Converts HTML DOM nodes into canonical blocks
   */
  extractBlocks($, rootEl, canonicalDoc) {
    const self = this;

    // Traverse direct semantic elements
    rootEl.children().each(function () {
      self.processElement($, $(this), canonicalDoc);
    });
  }

  processElement($, el, canonicalDoc) {
    const tagName = (el.prop('tagName') || '').toLowerCase();

    // Headings
    if (/^h[1-6]$/.test(tagName)) {
      const level = Math.min(parseInt(tagName[1], 10), 4);
      const text = this.cleanText(el.text());
      if (text) {
        canonicalDoc.addBlock({ type: 'heading', level, text });
      }
      return;
    }

    // Paragraphs
    if (tagName === 'p') {
      const text = this.cleanText(el.text());
      if (text && text.length > 2) {
        canonicalDoc.addBlock({ type: 'paragraph', text });
      }
      return;
    }

    // Blockquotes
    if (tagName === 'blockquote') {
      const text = this.cleanText(el.text());
      if (text) {
        canonicalDoc.addBlock({ type: 'quote', text });
      }
      return;
    }

    // Lists (Ordered / Unordered)
    if (tagName === 'ul' || tagName === 'ol') {
      const items = [];
      el.find('> li').each(function () {
        const itemText = $(this).text().trim();
        if (itemText) items.push(itemText);
      });
      if (items.length > 0) {
        canonicalDoc.addBlock({
          type: 'list',
          ordered: tagName === 'ol',
          items,
        });
      }
      return;
    }

    // Tables
    if (tagName === 'table') {
      const headers = [];
      const rows = [];

      el.find('thead tr th, tr:first-child th').each(function () {
        headers.push($(this).text().trim());
      });

      const trSelector = headers.length > 0 ? 'tbody tr, tr:not(:first-child)' : 'tr';
      el.find(trSelector).each(function () {
        const rowData = [];
        $(this).find('td, th').each(function () {
          rowData.push($(this).text().trim());
        });
        if (rowData.length > 0 && rowData.some(c => c !== '')) {
          rows.push(rowData);
        }
      });

      if (headers.length > 0 || rows.length > 0) {
        const caption = el.find('caption').text().trim() || undefined;
        canonicalDoc.addBlock({
          type: 'table',
          headers: headers.length > 0 ? headers : (rows[0] || []),
          rows: headers.length > 0 ? rows : rows.slice(1),
          caption,
        });
      }
      return;
    }

    // Pre / Code Blocks
    if (tagName === 'pre') {
      const codeEl = el.find('code');
      const text = (codeEl.length > 0 ? codeEl.text() : el.text()).trim();
      if (text) {
        const classAttr = codeEl.attr('class') || el.attr('class') || '';
        const langMatch = classAttr.match(/(?:language|lang)-(\w+)/);
        canonicalDoc.addBlock({
          type: 'code',
          language: langMatch ? langMatch[1] : 'text',
          text,
        });
      }
      return;
    }

    // Horizontal Rules / Separators
    if (tagName === 'hr') {
      canonicalDoc.addBlock({ type: 'separator' });
      return;
    }

    // Callouts / Admonitions / Alert boxes
    const classAttr = (el.attr('class') || '').toLowerCase();
    if (
      classAttr.includes('callout') ||
      classAttr.includes('admonition') ||
      classAttr.includes('alert') ||
      classAttr.includes('infobox') ||
      classAttr.includes('note') ||
      classAttr.includes('warning')
    ) {
      const title = el.find('.callout-title, .admonition-title, strong, b').first().text().trim() || 'Note';
      const text = this.cleanText(el.text().replace(title, ''));
      if (text) {
        canonicalDoc.addBlock({
          type: 'callout',
          variant: classAttr.includes('warning') ? 'warning' : 'note',
          title,
          text,
        });
        return;
      }
    }

    // Containers (div, section, article) - recursively inspect children
    if (tagName === 'div' || tagName === 'section' || tagName === 'article') {
      const self = this;
      el.children().each(function () {
        self.processElement($, $(this), canonicalDoc);
      });
    }
  }

  cleanText(str) {
    if (!str) return '';
    return str
      .replace(/\r\n/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/[ \u00A0]+/g, ' ')
      .replace(/\n\s*\n+/g, '\n\n')
      .trim();
  }
}

module.exports = new WebExtractor();
