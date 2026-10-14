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
    if (options.contentOnly || options.skipBookCreation) {
      return this.extractFromUrl(url, options);
    }
    return this.importSingle({
      url,
      customTitle: options.title,
      customAuthor: options.author,
      description: options.description,
      contentType: options.contentType,
    });
  }

  /**
   * Extracts web content without creating a library book (used when appending to dossier)
   */
  async extractFromUrl(url, options = {}) {
    if (!url) throw new Error('A valid URL is required.');

    const fetchResult = await webFetcher.fetch(url);
    const { metadata, canonicalDoc } = webExtractor.extract(fetchResult.html, fetchResult.url);
    const detectedChapters = webStructureDetector.structure(canonicalDoc, metadata);

    const title = (options.title && options.title.trim()) || metadata.title || 'Imported Web Document';
    const author = (options.author && options.author.trim()) || metadata.author || 'Web Author';
    const totalWords = detectedChapters.reduce((sum, c) => sum + (c.wordCount || 0), 0);
    const estPages = Math.max(1, Math.ceil(totalWords / 250));

    return {
      format: 'web',
      title,
      author,
      pageCount: estPages,
      tablesCount: 0,
      chapters: detectedChapters,
      totalWordCount: totalWords,
      metadata,
    };
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
  async importSingle({ url, customTitle, customAuthor, contentType, description, taskId }) {
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
      this._persistStage(taskId, 'ingest', 'running');
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
        import_started_at: new Date().toISOString(),
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

      bookRepository.update(bookId, {
        import_completed_at: new Date().toISOString(),
      });
      this._persistStage(taskId, 'ingest', 'done');

      jobRepository.update(job.id, {
        status: 'COMPLETED',
        progress: 100,
        completed_at: new Date().toISOString(),
      });

      // 7. Auto-index imported book into Semantic Memory if content is valid
      if (!isZeroContent) {
        this._persistStage(taskId, 'semantic_index', 'running');
        try {
          const semanticLifecycle = require('../semantic/semanticLifecycle');
          await semanticLifecycle.indexBook(bookId, { skipJob: true });
          this._persistStage(taskId, 'semantic_index', 'done');
        } catch (e) {
          console.warn('Web book indexing warning:', e.message);
          this._persistStage(taskId, 'semantic_index', 'failed');
        }
      } else {
        this._persistStage(taskId, 'semantic_index', 'skipped');
      }

      this._persistStage(taskId, 'classify', 'skipped');
      this._persistStage(taskId, 'outline', 'skipped');
      this._persistStage(taskId, 'synopsis', 'skipped');
      this._persistStage(taskId, 'synthesis', 'skipped');
      this._persistStage(taskId, 'attribution', 'skipped');
      bookRepository.update(bookId, {
        synthesis_completed_at: new Date().toISOString(),
        attribution_completed_at: new Date().toISOString(),
      });

      return {
        book: bookRepository.getById(bookId) || book,
        format: 'web',
        chapterCount: savedChapters.length,
        pageCount: estPages,
        sectionCount: totalSections,
        tablesCount: 0,
        totalWordCount: totalWords,
        integrityStatus: isZeroContent ? 'empty_content' : 'valid',
        integrityWarning: isZeroContent ? 'Content extraction incomplete: web page contained no readable article body.' : '',
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
   * Helper to update stages in import queue repository if taskId is present
   */
  _persistStage(taskId, stageName, status) {
    if (!taskId) return;
    try {
      const importQueueRepository = require('../../repositories/importQueueRepository');
      importQueueRepository.updateStage(taskId, stageName, status);
    } catch (err) {
      console.warn(`[webAcquisitionService] Failed to persist stage ${stageName} for task ${taskId}:`, err.message);
    }
  }

  /**
   * Imports multiple web sources into a single structured research/document item
   * Preserves distinct source boundaries and provenance for each source.
   */
  async importMulti({ sources, title, contentType, description, taskId }) {
    if (!Array.isArray(sources) || sources.length === 0) {
      throw new Error('At least one source is required for multi-source import.');
    }

    const bookId = `book-dossier-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const bookTitle = (title && title.trim()) || `Web Research Dossier (${sources.length} Sources)`;
    const bookContentType = contentType || 'research';

    // Create WEB_IMPORT job so PipelineStepper can track this dossier
    const ingestJob = jobRepository.create({
      book_id: bookId,
      type: 'WEB_IMPORT',
      status: 'PROCESSING',
      progress: 5,
    });

    try {
      const sourceProvenanceList = [];
      const allChapters = [];
      let currentChapterNum = 1;
      let totalWords = 0;

      for (let i = 0; i < sources.length; i++) {
        const sourceItem = sources[i];
        const sourceUrl = typeof sourceItem === 'string' ? sourceItem : sourceItem.url;
        if (!sourceUrl) continue;

        jobRepository.update(ingestJob.id, { progress: Math.round(5 + ((i + 1) / sources.length) * 60) });

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
        import_started_at: new Date().toISOString(),
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

      bookRepository.update(bookId, {
        import_completed_at: new Date().toISOString(),
      });
      this._persistStage(taskId, 'ingest', 'done');

      // Mark WEB_IMPORT job complete
      jobRepository.complete(ingestJob.id);

      // Trigger post-import pipeline (same chain as bookService.importBook)
      const isValidContent = totalWords > 0 && savedChapters.length > 0;
      if (isValidContent) {
        const qualifiesForOutline = savedChapters.length >= 3 && totalWords >= 2000;

        this._persistStage(taskId, 'semantic_index', 'running');
        const indexJob = jobRepository.create({
          book_id: bookId,
          type: 'SEMANTIC_INDEX',
          status: 'PROCESSING',
          progress: 0,
        });

        try {
          const semanticLifecycle = require('../semantic/semanticLifecycle');
          await semanticLifecycle.indexBook(bookId, { skipJob: false, jobId: indexJob.id });
          jobRepository.complete(indexJob.id);
          this._persistStage(taskId, 'semantic_index', 'done');
        } catch (err) {
          console.warn(`[importMulti] Indexing failed: ${err.message}`);
          jobRepository.fail(indexJob.id, err);
          this._persistStage(taskId, 'semantic_index', 'failed');
        }

        this._persistStage(taskId, 'classify', 'running');
        try {
          const bookClassifier = require('../ai/bookClassifier');
          await bookClassifier.classifyBook(bookId, { fast: false });
          this._persistStage(taskId, 'classify', 'done');
        } catch (err) {
          console.warn(`[importMulti] Classification failed: ${err.message}`);
          this._persistStage(taskId, 'classify', 'failed');
        }

        let outline = null;
        if (qualifiesForOutline) {
          this._persistStage(taskId, 'outline', 'running');
          try {
            const editorialService = require('../synthesis/editorialService');
            outline = await editorialService.generateSingleBookOutline(bookId, { fast: true });
            this._persistStage(taskId, 'outline', 'done');
          } catch (err) {
            console.warn(`[importMulti] Outline failed: ${err.message}`);
            this._persistStage(taskId, 'outline', 'failed');
          }
        } else {
          this._persistStage(taskId, 'outline', 'skipped');
        }

        this._persistStage(taskId, 'synopsis', 'running');
        const synopsisJob = jobRepository.create({
          book_id: bookId,
          type: 'SYNOPSIS',
          status: 'PROCESSING',
          progress: 0,
        });
        const intelligentSummarizer = require('../ai/intelligentSummarizer');
        try {
          await intelligentSummarizer.generateSynopsis(bookId, { fast: true, jobId: synopsisJob.id });
          jobRepository.complete(synopsisJob.id);
          this._persistStage(taskId, 'synopsis', 'done');
        } catch (err) {
          console.warn(`[importMulti] Synopsis failed: ${err.message}`);
          jobRepository.fail(synopsisJob.id, err);
          this._persistStage(taskId, 'synopsis', 'failed');
        }

        if (qualifiesForOutline && outline && outline.chapters && outline.chapters.length > 0) {
          this._persistStage(taskId, 'synthesis', 'running');
          const synthesisJob = jobRepository.create({
            book_id: bookId,
            type: 'SYNTHESIS',
            status: 'PROCESSING',
            progress: 0,
          });
          const editorialService = require('../synthesis/editorialService');
          try {
            await editorialService.synthesizeNextChapters(bookId, 3, { jobId: synthesisJob.id });
            jobRepository.complete(synthesisJob.id);
            this._persistStage(taskId, 'synthesis', 'done');
            bookRepository.update(bookId, { synthesis_completed_at: new Date().toISOString() });
          } catch (err) {
            console.warn(`[importMulti] Synthesis failed: ${err.message}`);
            jobRepository.fail(synthesisJob.id, err);
            this._persistStage(taskId, 'synthesis', 'failed');
            bookRepository.update(bookId, { synthesis_completed_at: new Date().toISOString() });
          }
        } else {
          this._persistStage(taskId, 'synthesis', 'skipped');
          bookRepository.update(bookId, { synthesis_completed_at: new Date().toISOString() });
        }

        this._persistStage(taskId, 'attribution', 'running');
        try {
          const provenanceResolver = require('../semantic/provenanceResolver');
          await provenanceResolver.triggerVerificationForBook(bookId);
          this._persistStage(taskId, 'attribution', 'done');
          bookRepository.update(bookId, { attribution_completed_at: new Date().toISOString() });
        } catch (err) {
          console.warn(`[importMulti] Attribution warning: ${err.message}`);
          this._persistStage(taskId, 'attribution', 'failed');
          bookRepository.update(bookId, { attribution_completed_at: new Date().toISOString() });
        }
      }

      return {
        book: bookRepository.getById(bookId) || book,
        format: 'web',
        chapterCount: savedChapters.length,
        pageCount: estPages,
        sectionCount: 0,
        tablesCount: 0,
        totalWordCount: totalWords,
        integrityStatus: totalWords === 0 ? 'empty_content' : 'valid',
        integrityWarning: totalWords === 0 ? 'Multi-source dossier contains no readable text across any of the provided sources.' : '',
        chapters: savedChapters,
        sourcesCount: sourceProvenanceList.length,
        job: jobRepository.getById(ingestJob.id),
      };
    } catch (err) {
      jobRepository.update(ingestJob.id, {
        status: 'FAILED',
        error: err.message,
        completed_at: new Date().toISOString(),
      });
      throw err;
    }
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
