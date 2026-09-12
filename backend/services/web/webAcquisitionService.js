const webSearchService = require('./webSearchService');
const webFetcher = require('./webFetcher');
const webExtractor = require('./webExtractor');
const webStructureDetector = require('./webStructureDetector');
const bookRepository = require('../../repositories/bookRepository');
const chapterRepository = require('../../repositories/chapterRepository');
const jobRepository = require('../../repositories/jobRepository');
const supportingMaterialRepository = require('../../repositories/supportingMaterialRepository');
const aiService = require('../ai/aiService');

/**
 * Web Acquisition Service for Smart Reader (Build 3A)
 * Orchestrates the full pipeline:
 * WEB SEARCH → USER SELECTION → FETCH → EXTRACT → CLEAN → CANONICAL CONTENT → STRUCTURE → LIBRARY ITEM
 */
class WebAcquisitionService {
  /**
   * Search across knowledge sources
   */
  async search(query, options = {}) {
    return webSearchService.search(query, options);
  }

  /**
   * Alias for acquireFromUrl used by ingestionService
   */
  async acquireFromUrl(url, options = {}) {
    return this.importSingle({
      url,
      customTitle: options.title,
      customAuthor: options.author,
      description: options.description,
      contentType: options.contentType,
    });
  }

  /**
   * Previews an accessible web source without importing yet
   */
  async preview(url) {
    if (!url) throw new Error('A valid URL is required.');

    const fetchResult = await webFetcher.fetch(url);
    const { metadata, canonicalDoc, plainText } = webExtractor.extract(fetchResult.html, fetchResult.url);
    const chapters = webStructureDetector.structure(canonicalDoc, metadata);

    const firstParagraph = canonicalDoc
      .getBlocks()
      .find((b) => b.type === 'paragraph')?.text || '';

    return {
      url: fetchResult.url,
      finalUrl: fetchResult.finalUrl,
      metadata,
      chaptersCount: chapters.length,
      detectedChapters: chapters.map((c) => ({
        number: c.number,
        title: c.title,
        wordCount: c.wordCount,
      })),
      snippet: metadata.description || (firstParagraph.slice(0, 280) + '...'),
      wordCount: metadata.wordCount,
      blockCount: metadata.blockCount,
    };
  }

  /**
   * Imports a single web source as a new Library Item
   */
  async importSingle({ url, customTitle, customAuthor, contentType, description }) {
    if (!url) throw new Error('URL is required for web import.');

    const bookId = `book-web-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    // 1. Create a processing job to track acquisition lifecycle
    const job = jobRepository.create({
      book_id: bookId,
      type: 'WEB_IMPORT',
      status: 'PROCESSING',
      progress: 10,
    });

    try {
      // 2. Fetch
      jobRepository.update(job.id, { progress: 25 });
      const fetchResult = await webFetcher.fetch(url);

      // 3. Extract & Clean (strip chrome, remove ads, extract canonical blocks)
      jobRepository.update(job.id, { progress: 50 });
      const { metadata, canonicalDoc } = webExtractor.extract(fetchResult.html, fetchResult.url);

      // 4. Structure Detection (identify major sections / chapters)
      jobRepository.update(job.id, { progress: 75 });
      const detectedChapters = webStructureDetector.structure(canonicalDoc, metadata);

      // 5. Create Library Book with full provenance
      const title = (customTitle && customTitle.trim()) || metadata.title || 'Imported Web Document';
      const author = (customAuthor && customAuthor.trim()) || metadata.author || 'Web Author';
      const resolvedContentType = contentType || this.inferContentType(metadata, detectedChapters);
      const resolvedDesc = (description && description.trim()) || metadata.description || `Acquired from ${metadata.siteName || url}`;

      const totalWords = detectedChapters.reduce((sum, c) => sum + (c.wordCount || 0), 0);
      const estPages = Math.max(1, Math.ceil(totalWords / 250));
      const isZeroContent = totalWords === 0 || detectedChapters.length === 0;
      const totalSections = detectedChapters.reduce((sum, c) => sum + (c.sectionCount || (c.sections ? c.sections.length : 0)), 0);

      const book = bookRepository.create({
        id: bookId,
        title,
        author,
        description: resolvedDesc,
        content_type: resolvedContentType,
        status: 'active',
        source_format: 'web',
        source_url: url,
        source_site: metadata.siteName || '',
        page_count: estPages,
        section_count: totalSections,
        integrity_status: isZeroContent ? 'empty_content' : 'valid',
        integrity_warning: isZeroContent ? 'Content extraction incomplete: web page contained no readable article body.' : '',
        metadata_json: {
          ...metadata,
          sourceUrl: url,
          sourceSite: metadata.siteName,
          retrievalDate: metadata.retrievalDate,
          detectedSectionsCount: totalSections,
          importedVia: 'Smart Reader Web Intelligence',
        },
      });

      // 6. Create Chapters with Canonical Content
      const savedChapters = [];
      for (const ch of detectedChapters) {
        const chapterId = `chap-${Date.now()}-${ch.number}-${Math.random().toString(36).substring(2, 5)}`;
        const savedCh = chapterRepository.create({
          id: chapterId,
          book_id: bookId,
          number: ch.number,
          title: ch.title,
          structural_role: ch.structuralRole || 'chapter',
          section_count: ch.sectionCount || (ch.sections ? ch.sections.length : 0),
          content: ch.content,
          word_count: ch.wordCount,
          canonical_content: ch.canonicalBlocks,
          metadata_json: ch.metadata || {},
        });
        savedChapters.push(savedCh);
      }

      jobRepository.update(job.id, {
        status: 'COMPLETED',
        progress: 100,
        completed_at: new Date().toISOString(),
      });

      // 7. Auto-index imported book into Semantic Memory if content is valid
      if (!isZeroContent) {
        try {
          const semanticLifecycle = require('../semantic/semanticLifecycle');
          semanticLifecycle.indexBook(bookId, { skipJob: true }).catch((e) => console.warn('Web book indexing warning:', e.message));
        } catch (e) {}
      }

      return {
        book,
        chapters: savedChapters,
        job: jobRepository.getById(job.id),
      };
    } catch (err) {
      jobRepository.update(job.id, {
        status: 'FAILED',
        error: err.message,
        completed_at: new Date().toISOString(),
      });
      throw err;
    }
  }

  /**
   * Imports multiple web sources into a single structured research/document item
   * Preserves distinct source boundaries and provenance for each source.
   */
  async importMulti({ sources, title, contentType, description }) {
    if (!Array.isArray(sources) || sources.length === 0) {
      throw new Error('At least one source is required for multi-source import.');
    }

    const bookId = `book-dossier-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const bookTitle = (title && title.trim()) || `Web Research Dossier (${sources.length} Sources)`;
    const bookContentType = contentType || 'research';

    const sourceProvenanceList = [];
    const allChapters = [];
    let currentChapterNum = 1;
    let totalWords = 0;

    for (let i = 0; i < sources.length; i++) {
      const sourceItem = sources[i];
      const sourceUrl = typeof sourceItem === 'string' ? sourceItem : sourceItem.url;
      if (!sourceUrl) continue;

      try {
        const fetchResult = await webFetcher.fetch(sourceUrl);
        const { metadata, canonicalDoc } = webExtractor.extract(fetchResult.html, fetchResult.url);
        const detectedSections = webStructureDetector.structure(canonicalDoc, metadata);

        sourceProvenanceList.push({
          sourceIndex: i + 1,
          url: sourceUrl,
          title: sourceItem.title || metadata.title,
          siteName: metadata.siteName,
          author: metadata.author,
          retrievalDate: metadata.retrievalDate,
        });

        // Each source contributes chapters, clearly preserving source boundary
        for (const sec of detectedSections) {
          const chapterTitle = detectedSections.length > 1
            ? `[Source ${i + 1}: ${metadata.siteName}] ${sec.title}`
            : `[Source ${i + 1}] ${sourceItem.title || metadata.title}`;

          // Prepend a provenance callout block to the canonical content
          const provenanceBlock = {
            id: `blk-prov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            type: 'callout',
            variant: 'note',
            title: `Source Provenance: ${metadata.siteName}`,
            text: `Original URL: ${sourceUrl} | Retrieved: ${new Date(metadata.retrievalDate).toLocaleDateString()} by Smart Reader`,
          };

          const combinedBlocks = [provenanceBlock, ...sec.canonicalBlocks];
          totalWords += sec.wordCount || 0;

          allChapters.push({
            number: currentChapterNum++,
            title: chapterTitle,
            content: `[Source: ${sourceUrl}]\n\n${sec.content}`,
            wordCount: sec.wordCount,
            canonicalBlocks: combinedBlocks,
          });
        }
      } catch (err) {
        console.warn(`[WebAcquisitionService] Skipping source "${sourceUrl}":`, err.message);
      }
    }

    if (allChapters.length === 0) {
      throw new Error('None of the selected web sources could be acquired.');
    }

    const estPages = Math.max(1, Math.ceil(totalWords / 250));
    const totalSections = allChapters.reduce((sum, c) => sum + (c.sectionCount || (c.sections ? c.sections.length : 0)), 0);

    // Create container book
    const book = bookRepository.create({
      id: bookId,
      title: bookTitle,
      author: `Multiple Sources (${sourceProvenanceList.length} contributors)`,
      description: description || `Structured multi-source research dossier containing ${sourceProvenanceList.length} verified web sources.`,
      content_type: bookContentType,
      status: 'active',
      source_format: 'web',
      source_url: sourceProvenanceList[0]?.url || '',
      source_site: 'Multi-Source Dossier',
      page_count: estPages,
      section_count: totalSections,
      integrity_status: totalWords === 0 ? 'empty_content' : 'valid',
      integrity_warning: totalWords === 0 ? 'Content extraction incomplete: sources contained no readable text.' : '',
      metadata_json: {
        isMultiSource: true,
        sourcesCount: sourceProvenanceList.length,
        sources: sourceProvenanceList,
        retrievalDate: new Date().toISOString(),
      },
    });

    // Save chapters
    const savedChapters = [];
    for (const ch of allChapters) {
      const chapterId = `chap-${Date.now()}-${ch.number}-${Math.random().toString(36).substring(2, 5)}`;
      const saved = chapterRepository.create({
        id: chapterId,
        book_id: bookId,
        number: ch.number,
        title: ch.title,
        structural_role: ch.structuralRole || 'chapter',
        section_count: ch.sectionCount || (ch.sections ? ch.sections.length : 0),
        content: ch.content,
        word_count: ch.wordCount,
        canonical_content: ch.canonicalBlocks,
        metadata_json: ch.metadata || {},
      });
      savedChapters.push(saved);
    }

    if (totalWords > 0) {
      try {
        const semanticLifecycle = require('../semantic/semanticLifecycle');
        semanticLifecycle.indexBook(bookId, { skipJob: true }).catch((e) => console.warn('Dossier indexing warning:', e.message));
      } catch (e) {}
    }

    return {
      book,
      chapters: savedChapters,
      sourcesCount: sourceProvenanceList.length,
    };
  }

  /**
   * Enriches an existing book with supporting web material (Requirement 6)
   * Leaves the original book and its chapters 100% UNMODIFIED.
   */
  async enrichBookWithSupportingMaterial(bookId, { url, title, snippet, contentType = 'web' }) {
    const book = bookRepository.getById(bookId);
    if (!book) {
      throw new Error(`Book not found with ID: ${bookId}`);
    }

    let extractedMetadata = {};
    let canonicalBlocks = [];
    let fullText = snippet || '';

    if (url) {
      const fetchResult = await webFetcher.fetch(url);
      const extracted = webExtractor.extract(fetchResult.html, fetchResult.url);
      extractedMetadata = extracted.metadata;
      canonicalBlocks = extracted.canonicalDoc.getBlocks();
      fullText = extracted.plainText;
    }

    const resolvedTitle = title || extractedMetadata.title || 'Supporting Web Reference';
    const resolvedSite = extractedMetadata.siteName || (url ? new URL(url).hostname : 'Web Source');
    const resolvedAuthor = extractedMetadata.author || 'Web Reference';
    const resolvedSnippet = snippet || extractedMetadata.description || fullText.slice(0, 300);

    const material = supportingMaterialRepository.create({
      book_id: bookId,
      title: resolvedTitle,
      url: url || '',
      source_site: resolvedSite,
      author: resolvedAuthor,
      content_type: contentType,
      snippet: resolvedSnippet,
      content: fullText,
      canonicalBlocks,
      metadata_json: {
        ...extractedMetadata,
        attachedAt: new Date().toISOString(),
        parentBookTitle: book.title,
      },
    });

    return material;
  }

  /**
   * Retrieves all supporting materials attached to a book
   */
  getSupportingMaterials(bookId) {
    return supportingMaterialRepository.getByBookId(bookId);
  }

  /**
   * Removes a supporting material item
   */
  deleteSupportingMaterial(materialId) {
    return supportingMaterialRepository.delete(materialId);
  }

  /**
   * Generates an editorial synopsis for a book using available chapter content (Requirement 7)
   */
  async generateSynopsis(bookId) {
    const book = bookRepository.getById(bookId);
    if (!book) throw new Error(`Book not found: ${bookId}`);

    const chapters = chapterRepository.getByBookId(bookId);
    if (!chapters || chapters.length === 0) {
      throw new Error('This item has no chapters or content from which to synthesize a synopsis.');
    }

    // Collect representative text from chapters
    const combinedSamples = chapters
      .slice(0, 5)
      .map((c) => `--- Chapter ${c.number}: ${c.title} ---\n${(c.content || '').slice(0, 1500)}`)
      .join('\n\n');

    if (combinedSamples.trim().length < 50) {
      throw new Error('Insufficient readable material to synthesize a synopsis.');
    }

    const prompt = `You are a master literary editor and knowledge curator. Read the following excerpt from "${book.title}" by ${book.author} and generate a compelling, comprehensive 2-to-3 paragraph editorial synopsis. Capture the core subject matter, key themes, and primary insights.\n\n${combinedSamples}`;

    const provider = aiService.getActiveProvider();
    let synopsisText = '';

    try {
      if (typeof provider.generateCompletion === 'function') {
        synopsisText = await provider.generateCompletion(prompt);
      } else if (typeof provider.summarize === 'function') {
        const res = await provider.summarize({ text: combinedSamples, title: book.title });
        synopsisText = res.summary;
      }
    } catch (err) {
      // Graceful fallback if AI is unavailable or unconfigured
      synopsisText = `Editorial Synopsis for ${book.title}: This work explores foundational concepts across ${chapters.length} structured sections, authored by ${book.author}. Sourced from ${book.source_site || 'the personal knowledge repository'}.`;
    }

    synopsisText = (synopsisText || '').trim();

    // Update book description without touching chapters
    const updatedBook = bookRepository.update(bookId, {
      description: synopsisText,
      metadata_json: {
        ...(typeof book.metadata_json === 'string' ? JSON.parse(book.metadata_json || '{}') : (book.metadata_json || {})),
        synopsisGeneratedAt: new Date().toISOString(),
      },
    });

    return {
      synopsis: synopsisText,
      book: updatedBook,
    };
  }

  inferContentType(metadata, chapters) {
    const text = ((metadata.title || '') + ' ' + (metadata.description || '')).toLowerCase();
    if (text.includes('manga') || text.includes('comic') || text.includes('webtoon')) return 'manga';
    if (text.includes('research') || text.includes('paper') || text.includes('study') || text.includes('journal')) return 'research';
    if (text.includes('textbook') || text.includes('course') || text.includes('curriculum')) return 'textbook';
    if (text.includes('documentation') || text.includes('guide') || text.includes('api reference')) return 'document';
    if (text.includes('novel') || text.includes('fiction') || text.includes('story')) return 'novel';
    return 'document';
  }
}

module.exports = new WebAcquisitionService();
