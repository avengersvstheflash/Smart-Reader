const outlineRepository = require('../../repositories/outlineRepository');
const bookRepository = require('../../repositories/bookRepository');
const semanticChunkRepository = require('../../repositories/semanticChunkRepository');
const chapterRepository = require('../../repositories/chapterRepository');
const retrievalService = require('../semantic/retrievalService');
const contextBuilder = require('../semantic/contextBuilder');
const aiService = require('../ai/aiService');
const sectionFilter = require('./sectionFilter');
const redundancyDetector = require('./redundancyDetector');
const editorialPlanner = require('./editorialPlanner');
const { getDatabase } = require('../../db/database');

const progressByBook = new Map();

class EditorialService {
  /**
   * Generates an editorial outline across multiple sources.
   * Transforms raw source structure into a coherent, reader-oriented outline (5–10 chapters)
   * while preserving full provenance to real source sections.
   */
  async generateOutline(bookIdsOrParams, topicOrOptions = '', maybeOptions = {}) {
    let bookIds = [];
    let topic = '';
    let options = {};
    let title = '';
    let collectionId = 'default';

    if (typeof bookIdsOrParams === 'object' && !Array.isArray(bookIdsOrParams)) {
      bookIds = bookIdsOrParams.bookIds || [];
      topic = bookIdsOrParams.topic || bookIdsOrParams.prompt || '';
      title = bookIdsOrParams.title || '';
      collectionId = bookIdsOrParams.collectionId || 'default';
      options = { ...bookIdsOrParams };
    } else {
      bookIds = Array.isArray(bookIdsOrParams) ? bookIdsOrParams : [];
      if (typeof topicOrOptions === 'object') {
        options = { ...topicOrOptions };
        topic = options.topic || options.prompt || '';
        title = options.title || '';
        collectionId = options.collectionId || 'default';
      } else {
        topic = topicOrOptions || '';
        options = { ...maybeOptions };
        title = options.title || '';
        collectionId = options.collectionId || 'default';
      }
    }

    if (!Array.isArray(bookIds) || bookIds.length === 0) {
      throw new Error('At least one bookId is required to generate an editorial outline.');
    }

    const books = bookIds.map((id) => bookRepository.getById(id)).filter(Boolean);
    if (books.length === 0) {
      throw new Error(`None of the specified books were found: ${bookIds.join(', ')}`);
    }

    // Step 1: Gather candidate section descriptors from semantic chunks and chapters
    const rawSections = [];
    const seenChunkIds = new Set();

    // Priority retrieval if topic is provided
    if (topic && topic.trim().length > 0) {
      try {
        const searchResults = await retrievalService.search(topic, {
          bookIds,
          scope: 'collection',
          topK: 20,
          minScore: 0.1,
        });

        for (const group of searchResults) {
          for (const c of group.chunks) {
            if (!seenChunkIds.has(c.chunkId)) {
              seenChunkIds.add(c.chunkId);
              rawSections.push({
                sectionId: c.chunkId,
                id: c.chunkId,
                sourceId: group.bookId,
                bookId: group.bookId,
                sourceTitle: group.bookTitle,
                sectionTitle: c.heading || 'Topical Section',
                sectionType: 'paragraph',
                contentType: 'research',
                wordCount: (c.content || '').split(/\s+/).filter(Boolean).length,
                summary: (c.content || '').slice(0, 140),
                keywords: (c.heading || '').split(/\s+/).filter((w) => w.length > 3),
                content: c.content,
              });
            }
          }
        }
      } catch (err) {
        console.warn('[EditorialService] Topic retrieval note:', err.message);
      }
    }

    // Gather landmark chunks across all books
    for (const b of books) {
      const bookChunks = semanticChunkRepository.getByBookId(b.id);
      for (const c of bookChunks) {
        if (!seenChunkIds.has(c.id)) {
          seenChunkIds.add(c.id);
          const text = c.textContent || '';
          rawSections.push({
            sectionId: c.id,
            id: c.id,
            sourceId: b.id,
            bookId: b.id,
            sourceTitle: b.title,
            sectionTitle: c.sectionHeading || c.sourceReference || 'Section',
            sectionType: c.contentType || 'paragraph',
            contentType: b.content_type || 'research',
            wordCount: text.split(/\s+/).filter(Boolean).length,
            summary: text.slice(0, 140),
            keywords: (c.sectionHeading || '').split(/\s+/).filter((w) => w.length > 3),
            content: text,
          });
        }
      }
    }

    if (rawSections.length === 0) {
      throw new Error('No indexed semantic chunks found for the selected books. Please index the books first.');
    }

    // Step 2: Filter low-information sections (author, date, bibliography, navigation, <50 words with no summary)
    const { candidates, filtered } = sectionFilter.filter(rawSections);
    const activeCandidates = candidates.length > 0 ? candidates : rawSections;

    // Step 3: Detect redundancies across sources (groups into semantic concepts)
    const clusters = redundancyDetector.detect(activeCandidates);

    // Step 4: Plan reader-oriented chapters using EditorialPlanner
    const isMultiSource = books.length > 1 || books.some((b) => b.author && b.author.includes('Multiple Sources'));
    const contentType = books[0].content_type || (isMultiSource ? 'research' : 'general');
    const outlineTitle = title || (topic ? `Editorial Synthesis: ${topic}` : `Comparative Study: ${books.map((b) => b.title).join(' & ')}`);

    let chapters = [];
    const validChunkIds = new Set(rawSections.map((s) => s.id));

    if (!options.fast && aiService.isAvailable && aiService.isAvailable()) {
      try {
        const planResult = await editorialPlanner.plan({
          contentType,
          isMultiSource,
          totalSections: activeCandidates.length,
          clusters,
          standalone: clusters.standalone || [],
          candidateSections: activeCandidates,
          topic: topic || outlineTitle,
        }, { aiService });

        if (planResult.status === 'success' && Array.isArray(planResult.chapters) && planResult.chapters.length > 0) {
          chapters = planResult.chapters;
        }
      } catch (err) {
        console.warn('[EditorialService] AI planning failed, falling back to deterministic:', err.message);
      }
    }

    // If AI was skipped, failed, or produced no valid chapters, use deterministic reader-oriented planning
    if (!chapters || chapters.length === 0) {
      const detPlan = editorialPlanner.planDeterministic({
        contentType,
        isMultiSource,
        totalSections: activeCandidates.length,
        candidateSections: activeCandidates,
      });
      chapters = detPlan.chapters;
    }

    // Fallback safety check: verify every chapter has valid chunks
    if (!chapters || chapters.length === 0) {
      chapters = this.createAdaptiveOutlineChapters(books, rawSections, topic);
    }

    // Step 5: Persist outline
    const outlineId = options.outlineId || `outline-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    for (let i = 0; i < chapters.length; i++) {
      if (!chapters[i].sourceSectionIds || chapters[i].sourceSectionIds.length === 0) {
        const fallback = activeCandidates[i % activeCandidates.length];
        chapters[i].sourceSectionIds = [fallback.id];
      }
      const rawId = chapters[i].id || chapters[i].chapterId || `ch-${i + 1}`;
      const fullId = rawId.startsWith(outlineId) ? rawId : `${outlineId}-${rawId}`;
      chapters[i].chapterId = fullId;
      chapters[i].id = fullId;
    }

    const saved = outlineRepository.saveOutline({
      outlineId,
      collectionId,
      title: outlineTitle,
      type: options.type || (isMultiSource ? 'multi_source' : 'single_book'),
      chapters,
      createdAt: new Date().toISOString(),
    });

    return saved;
  }

  /**
   * Regenerates an editorial outline:
   * - Invalidates affected synthesized representations
   * - Preserves original source material
   * - Does not leave orphaned provenance
   * - Overwrites the outline without creating duplicates
   */
  async regenerateOutline(outlineId, options = {}) {
    const outline = outlineRepository.getById(outlineId);
    if (!outline) {
      throw new Error(`Outline not found: ${outlineId}`);
    }

    // 1. Invalidate affected synthesized representations
    if (Array.isArray(outline.chapters)) {
      for (const ch of outline.chapters) {
        if (ch.chapterId) {
          const reps = chapterRepository.getRepresentations(ch.chapterId);
          for (const r of reps) {
            chapterRepository.deleteRepresentation(r.id);
          }
        }
      }
    }
    chapterRepository.deleteRepresentationsByBook(outlineId);

    // 2. Resolve book IDs
    let bookIds = options.bookIds;
    if (!bookIds || bookIds.length === 0) {
      const allChunkIds = (outline.chapters || []).flatMap((c) => c.sourceSectionIds || []);
      if (allChunkIds.length > 0) {
        const placeholders = allChunkIds.map(() => '?').join(',');
        const db = getDatabase();
        const chunks = db.prepare(`SELECT DISTINCT book_id FROM semantic_chunks WHERE id IN (${placeholders})`).all(...allChunkIds);
        bookIds = chunks.map((c) => c.book_id);
      }
    }

    if (!bookIds || bookIds.length === 0) {
      // Fallback: check all books in library
      const allBooks = bookRepository.getAll();
      bookIds = allBooks.map((b) => b.id);
    }

    // 3. Re-generate outline using existing outlineId
    const regenerated = await this.generateOutline({
      ...options,
      bookIds,
      outlineId,
      title: options.title || outline.title,
      collectionId: outline.collectionId || 'default',
    });

    return regenerated;
  }

  /**
   * Deterministically constructs adaptive chapters based on source material and content types.
   */
  createAdaptiveOutlineChapters(books, sourceChunks, topic) {
    const isResearch = books.some((b) => b.content_type === 'research' || b.source_format === 'web');
    const isNovel = books.every((b) => b.content_type === 'fiction');

    const numChapters = Math.min(4, Math.max(2, Math.ceil(sourceChunks.length / 3)));
    const chapters = [];

    const titlesResearch = [
      '1. Foundational Tenets & Problem Formulation',
      '2. Methodological Perspectives & Core Mechanisms',
      '3. Comparative Evidence & Divergent Findings',
      '4. Synthesis, Reconciliations & Open Questions',
    ];

    const titlesNovel = [
      '1. Narrative Worlds & Thematic Convergence',
      '2. Character Trajectories & Psychological Arcs',
      '3. Conflict Dynamics & Clashing Worldviews',
      '4. Comparative Resolution & Literary Resonance',
    ];

    const titlesGeneral = [
      '1. Overview & Core Premises Across Sources',
      '2. Comparative Analysis & Differing Approaches',
      '3. Detailed Evidence & Key Case Studies',
      '4. Synthesis & Evaluative Takeaways',
    ];

    const titles = isResearch ? titlesResearch : (isNovel ? titlesNovel : titlesGeneral);

    for (let i = 0; i < numChapters; i++) {
      const chapterId = `ch-${i + 1}`;
      const chapterTitle = titles[i] || `Chapter ${i + 1}: Cross-Source Analysis`;

      const assignedChunkIds = [];
      for (let j = 0; j < sourceChunks.length; j++) {
        if (j % numChapters === i) {
          assignedChunkIds.push(sourceChunks[j].id);
        }
      }

      if (assignedChunkIds.length === 0 && sourceChunks.length > 0) {
        assignedChunkIds.push(sourceChunks[i % sourceChunks.length].id);
      }

      chapters.push({
        chapterId,
        title: chapterTitle,
        sourceSectionIds: assignedChunkIds,
      });
    }

    return chapters;
  }

  getOutline(outlineId) {
    return outlineRepository.getById(outlineId);
  }

  getOutlines(collectionId = 'default') {
    return outlineRepository.getByCollectionId(collectionId);
  }

  listOutlines() {
    return outlineRepository.getAll();
  }

  /**
   * Generates an editorial outline for a single book.
   * - Uses semantic chunks belonging to the book
   * - Sets isMultiSource: false
   * - Uses outlineId: `book-editorial-${bookId}`
   * - Persists with type: 'single_book'
   * - Idempotent: Overwrites existing outline for this book
   */
  async generateSingleBookOutline(bookId, options = {}) {
    const book = bookRepository.getById(bookId);
    if (!book) {
      throw new Error(`Book not found: ${bookId}`);
    }

    const outlineId = `book-editorial-${bookId}`;
    const outlineTitle = options.title || `Smart Reading: ${book.title}`;

    return this.generateOutline({
      ...options,
      bookIds: [bookId],
      outlineId,
      collectionId: bookId,
      title: outlineTitle,
      type: 'single_book',
      isMultiSource: false,
    });
  }

  getSingleBookOutline(bookId) {
    return outlineRepository.getByBookId(bookId);
  }

  getSynthesisProgress(bookId) {
    if (progressByBook.has(bookId)) {
      return progressByBook.get(bookId);
    }
    return { status: 'idle' };
  }

  async synthesizeNextChapters(bookId, count, options = {}) {
    const validCounts = [1, 3, 5, 10];
    if (typeof count !== 'number' || !validCounts.includes(count)) {
      throw new Error('Invalid count: must be 1, 3, 5, or 10');
    }

    const outline = this.getSingleBookOutline(bookId);
    if (!outline) {
      throw new Error(`No outline for book ${bookId}`);
    }

    const synthesisService = require('./synthesisService');

    // 1. Collect chapters where isSynthesized === false in outline order
    const chapters = outline.chapters || [];
    const unSynthesized = [];

    for (const ch of chapters) {
      const rep = synthesisService.getSynthesis(outline.outlineId, ch.chapterId);
      if (!rep) {
        unSynthesized.push(ch);
      }
    }

    // 2. Take the first `count` chapters (bounded by available)
    const toSynthesize = unSynthesized.slice(0, count);

    // Track progress in-memory
    progressByBook.set(bookId, {
      bookId,
      currentChapterId: toSynthesize[0] ? toSynthesize[0].chapterId : null,
      status: 'generating',
      startedAt: Date.now(),
      targetCount: toSynthesize.length,
      completedCount: 0,
    });

    const chapterResults = [];
    let synthesizedCount = 0;
    let failedCount = 0;

    try {
      for (let i = 0; i < toSynthesize.length; i++) {
        const targetChapter = toSynthesize[i];
        const progress = progressByBook.get(bookId);
        if (progress) {
          progress.currentChapterId = targetChapter.chapterId;
        }

        console.log(`[Synthesis] Generating chapter ${i + 1}/${toSynthesize.length}: ${targetChapter.title}`);

        try {
          await synthesisService.synthesizeChapter(outline.outlineId, targetChapter.chapterId, {
            ...options,
            fast: options.fast !== undefined ? options.fast : false,
          });

          synthesizedCount++;
          if (progress) progress.completedCount++;

          chapterResults.push({
            chapterId: targetChapter.chapterId,
            title: targetChapter.title,
            status: 'completed',
          });
        } catch (err) {
          failedCount++;
          console.error(`[Synthesis] Failed chapter ${targetChapter.chapterId} (${targetChapter.title}): ${err.message}`);
          chapterResults.push({
            chapterId: targetChapter.chapterId,
            title: targetChapter.title,
            status: 'failed',
            error: err.message,
          });
        }
      }
    } finally {
      progressByBook.delete(bookId);
    }

    // Recount remaining un-synthesized chapters after batch
    let remainingCount = 0;
    for (const ch of chapters) {
      const rep = synthesisService.getSynthesis(outline.outlineId, ch.chapterId);
      if (!rep) {
        remainingCount++;
      }
    }

    return {
      requestedCount: count,
      synthesizedCount,
      failedCount,
      remainingCount,
      chapters: chapterResults,
    };
  }

  deleteOutline(outlineId) {
    const outline = outlineRepository.getById(outlineId);
    if (outline && Array.isArray(outline.chapters)) {
      for (const ch of outline.chapters) {
        if (ch.chapterId) {
          const reps = chapterRepository.getRepresentations(ch.chapterId);
          for (const r of reps) {
            chapterRepository.deleteRepresentation(r.id);
          }
        }
      }
    }
    chapterRepository.deleteRepresentationsByBook(outlineId);
    if (outline && outline.collectionId && outline.collectionId !== outlineId) {
      chapterRepository.deleteRepresentationsByBook(outline.collectionId);
    }
    return outlineRepository.delete(outlineId);
  }
}

module.exports = new EditorialService();

