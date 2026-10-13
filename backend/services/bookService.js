const fs = require('fs');
const path = require('path');
const bookRepository = require('../repositories/bookRepository');
const chapterRepository = require('../repositories/chapterRepository');
const jobRepository = require('../repositories/jobRepository');
const ingestionService = require('./ingestion/ingestionService');
const { resetAndSeedDatabase } = require('../db/database');
const config = require('../config');

/**
 * Classifies which post-import pipeline stages should run based on chapter count and word count.
 * @param {number} chapterCount
 * @param {number} wordCount
 * @returns {{ qualifiesForOutline: boolean, qualifiesForSynopsis: boolean, runOutline: boolean, runSynopsis: boolean }}
 */
function classifyPipelineStages(chapterCount, wordCount) {
  const cCount = Number.isFinite(chapterCount) ? chapterCount : 0;
  const wCount = Number.isFinite(wordCount) ? wordCount : 0;
  const qualifiesForOutline = cCount >= 1 && wCount >= 2000;
  const qualifiesForSynopsis = cCount >= 1 && wCount >= 500;
  return {
    qualifiesForOutline,
    qualifiesForSynopsis,
    runOutline: qualifiesForOutline,
    runSynopsis: qualifiesForSynopsis,
  };
}

function countWordsFast(str) {
  if (!str) return 0;
  let count = 0;
  let inWord = false;
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) <= 32) {
      inWord = false;
    } else if (!inWord) {
      inWord = true;
      count++;
    }
  }
  return count;
}

function _persistStage(tId, stageName, status) {
  if (!tId) return;
  try {
    const importQueueRepository = require('../repositories/importQueueRepository');
    importQueueRepository.updateStage(tId, stageName, status);
  } catch (err) {
    console.warn(`[bookService] Failed to persist stage ${stageName} for task ${tId}:`, err.message);
  }
}

/**
 * Post-ingest pipeline: SEMANTIC_INDEX -> CLASSIFY -> OUTLINE -> SYNOPSIS -> SYNTHESIS -> ATTRIBUTION.
 * Blocks sequentially until all downstream pipeline operations conclude.
 */
async function _runPostIngestPipeline(book, options = {}) {
  const {
    jobId,
    taskId,
    chapterEntities = [],
    totalWords = 0,
    pipelineT0 = Date.now(),
    stageTimings = {},
    qualifiesForOutline = false,
    qualifiesForSynopsis = false,
  } = options;

  try {
    _persistStage(taskId, 'semantic_index', 'running');
    const semanticLifecycle = require('./semantic/semanticLifecycle');
    const indexJob = jobRepository.create({
      book_id: book.id,
      type: 'SEMANTIC_INDEX',
      status: 'PROCESSING',
      progress: 0,
    });

    const t0Index = Date.now();
    try {
      await semanticLifecycle.indexBook(book.id, { skipJob: false, jobId: indexJob.id });
      stageTimings.indexMs = Date.now() - t0Index;
      jobRepository.complete(indexJob.id);
      _persistStage(taskId, 'semantic_index', 'done');
      console.log(`[Pipeline] Stage 2/5: SEMANTIC_INDEX complete in ${(stageTimings.indexMs / 1000).toFixed(2)}s`);
    } catch (err) {
      jobRepository.fail(indexJob.id, err);
      _persistStage(taskId, 'semantic_index', 'failed');
      throw err;
    }

    _persistStage(taskId, 'classify', 'running');
    console.log(`[Import] Classifying ${book.id}...`);
    const t0Classify = Date.now();
    const bookClassifier = require('./ai/bookClassifier');
    try {
      await bookClassifier.classifyBook(book.id, { fast: false });
      stageTimings.classifyMs = Date.now() - t0Classify;
      _persistStage(taskId, 'classify', 'done');
      console.log(`[Pipeline] Stage 3/5: CLASSIFY complete in ${(stageTimings.classifyMs / 1000).toFixed(2)}s`);
    } catch (classErr) {
      console.warn(`[Import] Classification warning for ${book.id}:`, classErr.message);
      _persistStage(taskId, 'classify', 'failed');
    }

    let outline = null;
    if (qualifiesForOutline) {
      _persistStage(taskId, 'outline', 'running');
      console.log(`[Import] Generating outline for ${book.id}...`);
      const t0Outline = Date.now();
      const editorialService = require('./synthesis/editorialService');
      try {
        outline = await editorialService.generateSingleBookOutline(book.id, { fast: true });
        stageTimings.outlineMs = Date.now() - t0Outline;
        _persistStage(taskId, 'outline', 'done');
        console.log(`[Pipeline] Stage 4/5: OUTLINE complete in ${(stageTimings.outlineMs / 1000).toFixed(2)}s`);
      } catch (outErr) {
        console.warn(`[Import] Outline warning for ${book.id}:`, outErr.message);
        _persistStage(taskId, 'outline', 'failed');
      }
    } else {
      _persistStage(taskId, 'outline', 'skipped');
    }

    if (qualifiesForSynopsis) {
      _persistStage(taskId, 'synopsis', 'running');
      console.log(`[Import] Generating synopsis for ${book.id}...`);
      const t0Synopsis = Date.now();
      const synopsisJob = jobRepository.create({
        book_id: book.id,
        type: 'SYNOPSIS',
        status: 'PROCESSING',
        progress: 0,
      });
      const intelligentSummarizer = require('./ai/intelligentSummarizer');
      try {
        await intelligentSummarizer.generateSynopsis(book.id, { jobId: synopsisJob.id });
        stageTimings.synopsisMs = Date.now() - t0Synopsis;
        console.log(`[Pipeline] Stage 5/5: SYNOPSIS complete in ${(stageTimings.synopsisMs / 1000).toFixed(2)}s`);
        jobRepository.complete(synopsisJob.id);
        _persistStage(taskId, 'synopsis', 'done');
      } catch (err) {
        console.warn(`[Import] Synopsis failed: ${err.message}`);
        jobRepository.fail(synopsisJob.id, err);
        _persistStage(taskId, 'synopsis', 'failed');
      }
    } else {
      _persistStage(taskId, 'synopsis', 'skipped');
    }

    if (qualifiesForOutline) {
      if (outline && outline.chapters && outline.chapters.length > 0) {
        _persistStage(taskId, 'synthesis', 'running');
        console.log(`[Import] Auto-synthesizing initial chapters for ${book.id}...`);
        const synthesisJob = jobRepository.create({
          book_id: book.id,
          type: 'SYNTHESIS',
          status: 'PROCESSING',
          progress: 0,
        });
        try {
          const editorialService = require('./synthesis/editorialService');
          const result = await editorialService.synthesizeNextChapters(book.id, 3, { jobId: synthesisJob.id });
          jobRepository.complete(synthesisJob.id);
          _persistStage(taskId, 'synthesis', 'done');
          bookRepository.update(book.id, { synthesis_completed_at: new Date().toISOString() });
          if (result) {
            console.log(`[Import] Auto-synthesized ${result.synthesizedCount}/3 chapters for ${book.id}`);
          }
        } catch (err) {
          console.warn(`[Import] Synthesis failed: ${err.message}`);
          jobRepository.fail(synthesisJob.id, err);
          _persistStage(taskId, 'synthesis', 'failed');
          bookRepository.update(book.id, { synthesis_completed_at: new Date().toISOString() });
        }
      } else {
        console.warn(`[Import] No outline for ${book.id}; skipping auto-synthesis`);
        _persistStage(taskId, 'synthesis', 'skipped');
        bookRepository.update(book.id, { synthesis_completed_at: new Date().toISOString() });
      }
    } else {
      _persistStage(taskId, 'synthesis', 'skipped');
      bookRepository.update(book.id, { synthesis_completed_at: new Date().toISOString() });
    }

    _persistStage(taskId, 'attribution', 'running');
    // Awaited PROVENANCE_VERIFY pass
    const provenanceResolver = require('./semantic/provenanceResolver');
    try {
      const pvRes = await provenanceResolver.triggerVerificationForBook(book.id);
      _persistStage(taskId, 'attribution', 'done');
      bookRepository.update(book.id, { attribution_completed_at: new Date().toISOString() });
      console.log(`[Import] Provenance verified for ${book.id}: ${pvRes ? pvRes.verifiedCount : 0} chapter(s)`);
    } catch (pvErr) {
      console.warn(`[Import] Provenance verification warning for ${book.id}:`, pvErr.message);
      _persistStage(taskId, 'attribution', 'failed');
      bookRepository.update(book.id, { attribution_completed_at: new Date().toISOString() });
    }
  } catch (err) {
    console.error(`[Import] Post-ingest pipeline failed for ${book.id}:`, err.message);
    throw err;
  } finally {
    const totalSec = ((Date.now() - pipelineT0) / 1000).toFixed(1);
    console.log(
      `\n============================================================\n` +
      `📊 PIPELINE TELEMETRY SUMMARY: "${book.title}" (${totalSec}s total)\n` +
      `  - 1. Ingest & Parse:   ${((stageTimings.ingestMs || 0) / 1000).toFixed(1)}s\n` +
      `  - 2. Semantic Index:   ${((stageTimings.indexMs || 0) / 1000).toFixed(1)}s\n` +
      `  - 3. Classification:   ${((stageTimings.classifyMs || 0) / 1000).toFixed(1)}s\n` +
      `  - 4. Outline Gen:      ${((stageTimings.outlineMs || 0) / 1000).toFixed(1)}s\n` +
      `  - 5. Synopsis Gen:     ${((stageTimings.synopsisMs || 0) / 1000).toFixed(1)}s\n` +
      `============================================================\n`
    );
  }
}

class BookService {
  classifyPipelineStages(chapterCount, wordCount) {
    return classifyPipelineStages(chapterCount, wordCount);
  }

  getAllBooks() {
    const books = bookRepository.getAll();
    const { getDatabase } = require('../db/database');
    const db = getDatabase();
    const hasLifecycle = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='book_lifecycle'").get();
    if (!hasLifecycle) return books;

    const rows = db.prepare('SELECT book_id, in_library FROM book_lifecycle').all();
    const map = new Map(rows.map((r) => [r.book_id, r.in_library]));
    return books.filter((b) => {
      if (map.has(b.id)) {
        return map.get(b.id) === 1;
      }
      return true;
    });
  }

  getAllSources() {
    const books = bookRepository.getAllSources();
    const { getDatabase } = require('../db/database');
    const db = getDatabase();
    const hasLifecycle = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='book_lifecycle'").get();
    if (!hasLifecycle) return books;

    const rows = db.prepare('SELECT book_id, in_research FROM book_lifecycle').all();
    const map = new Map(rows.map((r) => [r.book_id, r.in_research]));
    return books.filter((b) => {
      if (map.has(b.id)) {
        return map.get(b.id) === 1;
      }
      return true;
    });
  }

  getAllDossiers() {
    const raw = bookRepository.getAllDossiers();
    const { getDatabase } = require('../db/database');
    const db = getDatabase();
    const hasLifecycle = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='book_lifecycle'").get();
    let filtered = raw;
    if (hasLifecycle) {
      const rows = db.prepare('SELECT book_id, in_research FROM book_lifecycle').all();
      const map = new Map(rows.map((r) => [r.book_id, r.in_research]));
      filtered = raw.filter((b) => {
        if (map.has(b.id)) {
          return map.get(b.id) === 1;
        }
        return true;
      });
    }

    return filtered.map((b) => {
      let parsedMeta = {};
      try {
        parsedMeta = typeof b.metadata_json === 'string' ? JSON.parse(b.metadata_json || '{}') : (b.metadata_json || {});
      } catch {}
      return {
        ...b,
        metadata_json: parsedMeta,
        metadata: parsedMeta,
        isDossier: true,
      };
    });
  }

  createDossier({ title, description, author }) {
    if (!title || !title.trim()) {
      throw new Error('Dossier title is required.');
    }
    const id = `book-dossier-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    return this.createBook({
      id,
      title: title.trim(),
      author: author ? author.trim() : 'Research Dossier',
      description: description ? description.trim() : 'Research dossier compiling multiple documents and text sources.',
      content_type: 'research',
      source_format: 'dossier',
      source_site: 'Multi-Source Dossier',
      status: 'active',
      import_started_at: now,
      import_completed_at: now,
      synthesis_completed_at: now,
      attribution_completed_at: now,
      metadata_json: {
        isDossier: true,
        isMultiSource: true,
        sourcesCount: 0,
        sources: [],
        createdAt: now,
      },
    });
  }

  async addContentToDossier(dossierId, { title, author, text, description }) {
    const dossier = this.getBook(dossierId);
    if (!text || !text.trim()) {
      throw new Error('Text content is required.');
    }

    const trimmedText = text.trim();
    const docTitle = (title && title.trim()) || 'Pasted Research Material';
    const docAuthor = (author && author.trim()) || 'Unknown Author';

    let parsed = null;
    try {
      parsed = await ingestionService.ingest({
        title: docTitle,
        author: docAuthor,
        rawText: trimmedText,
        contentType: 'research',
      });
    } catch (err) {
      console.warn('[addContentToDossier] Ingestion fallback:', err.message);
    }

    const existingChapters = chapterRepository.getByBookId(dossierId);
    let nextNumber = existingChapters.length > 0
      ? Math.max(...existingChapters.map((c) => c.number)) + 1
      : 1;

    const chaptersToAdd = (parsed && parsed.chapters && parsed.chapters.length > 0)
      ? parsed.chapters
      : [{
          title: docTitle,
          content: trimmedText,
          canonicalBlocks: [{ type: 'paragraph', text: trimmedText }],
          wordCount: countWordsFast(trimmedText),
        }];

    const createdChapters = [];
    let addedWords = 0;
    for (const ch of chaptersToAdd) {
      const chapterId = `chap-${Date.now()}-${nextNumber}-${Math.random().toString(36).substring(2, 5)}`;
      const savedCh = chapterRepository.create({
        id: chapterId,
        book_id: dossierId,
        number: nextNumber++,
        title: ch.title || docTitle,
        structural_role: ch.structuralRole || 'chapter',
        content: ch.content || trimmedText,
        canonical_content: ch.canonicalBlocks ? JSON.stringify(ch.canonicalBlocks) : null,
        word_count: ch.wordCount || countWordsFast(ch.content || trimmedText),
        metadata_json: JSON.stringify({
          sourceTitle: docTitle,
          sourceAuthor: docAuthor,
          addedAt: new Date().toISOString(),
          ...(ch.metadata || {}),
        }),
      });
      createdChapters.push(savedCh);
      addedWords += savedCh.word_count || 0;
    }

    // Update dossier metadata
    let currentMeta = {};
    try {
      currentMeta = typeof dossier.metadata_json === 'string'
        ? JSON.parse(dossier.metadata_json || '{}')
        : (dossier.metadata_json || {});
    } catch {}

    const sources = Array.isArray(currentMeta.sources) ? [...currentMeta.sources] : [];
    sources.push({
      title: docTitle,
      author: docAuthor,
      wordCount: addedWords,
      chaptersCount: createdChapters.length,
      addedAt: new Date().toISOString(),
    });
    currentMeta.sources = sources;
    currentMeta.sourcesCount = sources.length;
    currentMeta.isDossier = true;
    currentMeta.isMultiSource = true;

    const allChapters = chapterRepository.getByBookId(dossierId);
    const totalWords = allChapters.reduce((sum, c) => sum + (c.word_count || 0), 0);
    const totalPages = Math.max(1, Math.ceil(totalWords / 250));
    const totalSections = allChapters.reduce((sum, c) => sum + (c.section_count || 0), 0);

    bookRepository.update(dossierId, {
      metadata_json: currentMeta,
      page_count: totalPages,
      section_count: totalSections,
      updated_at: new Date().toISOString(),
    });

    // Semantic index update
    try {
      const semanticLifecycle = require('./semantic/semanticLifecycle');
      semanticLifecycle.indexBook(dossierId, { skipJob: true }).catch((err) => {
        console.warn(`[addContentToDossier] Indexing notice: ${err.message}`);
      });
    } catch (_) {}

    return {
      dossier: bookRepository.getById(dossierId),
      chaptersAdded: createdChapters,
      totalWords,
      addedWords,
    };
  }

  getBook(id) {
    const book = bookRepository.getById(id);
    if (!book) {
      throw new Error(`Book with ID '${id}' was not found.`);
    }
    return book;
  }

  createBook(data) {
    if (!data.title || data.title.trim() === '') {
      throw new Error('Book title is required.');
    }

    const id =
      data.id ||
      `book-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    return bookRepository.create({
      id,
      title: data.title.trim(),
      author: data.author ? data.author.trim() : 'Unknown Author',
      description: data.description ? data.description.trim() : '',
      cover_path: data.cover_path || '',
      content_type: data.content_type || 'novel',
      status: data.status || 'active',
      source_format: data.source_format || 'text',
      source_url: data.source_url || '',
      source_site: data.source_site || '',
      original_filename: data.original_filename || '',
      page_count: data.page_count || 1,
      section_count: data.section_count || 0,
      integrity_status: data.integrity_status || 'valid',
      integrity_warning: data.integrity_warning || '',
      metadata_json: data.metadata_json || {},
      import_started_at: data.import_started_at || null,
      import_completed_at: data.import_completed_at || null,
      synthesis_completed_at: data.synthesis_completed_at || null,
      attribution_completed_at: data.attribution_completed_at || null,
    });
  }

  deleteBook(id, operation = 'B') {
    const bookLifecycleService = require('./lifecycle/bookLifecycleService');
    const upperOp = (operation || 'B').toUpperCase();
    switch (upperOp) {
      case 'A':
        return bookLifecycleService.executeOperationA(id);
      case 'B':
        return bookLifecycleService.executeOperationB(id);
      case 'C':
        return bookLifecycleService.executeOperationC(id);
      case 'D':
        return bookLifecycleService.executeOperationD(id);
      default:
        throw new Error(`Invalid delete operation: ${operation}. Must be one of A, B, C, D.`);
    }
  }

  getChapters(bookId) {
    this.getBook(bookId); // Validates book existence
    return chapterRepository.getByBookId(bookId);
  }

  getChapter(id) {
    const chapter = chapterRepository.getById(id);
    if (!chapter) {
      throw new Error(`Chapter with ID '${id}' was not found.`);
    }
    return chapter;
  }

  addChapter(bookId, data) {
    this.getBook(bookId);
    if (!data.title || data.title.trim() === '') {
      throw new Error('Chapter title is required.');
    }
    if (!data.content || data.content.trim() === '') {
      throw new Error('Chapter content is required.');
    }

    const existingChapters = chapterRepository.getByBookId(bookId);
    const nextNumber =
      existingChapters.length > 0
        ? Math.max(...existingChapters.map((c) => c.number)) + 1
        : 1;

    const chapterId =
      data.id ||
      `ch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // Parse into canonical blocks via Ingestion Service
    let canonicalBlocks = [];
    let wordCount = 0;
    try {
      const parsed = ingestionService.ingest({
        title: data.title,
        rawText: data.content,
        contentType: 'novel',
      });
      if (parsed.chapters && parsed.chapters.length > 0) {
        canonicalBlocks = parsed.chapters[0].canonicalBlocks;
        wordCount = parsed.chapters[0].wordCount;
      }
    } catch {
      canonicalBlocks = null;
      wordCount = data.content.trim().split(/\s+/).length;
    }

    const createdChapter = chapterRepository.create({
      id: chapterId,
      book_id: bookId,
      number: data.number || nextNumber,
      title: data.title.trim(),
      content: data.content.trim(),
      canonical_content: canonicalBlocks
        ? JSON.stringify(canonicalBlocks)
        : null,
      word_count: wordCount || data.content.trim().split(/\s+/).length,
      status: data.status || 'unread',
    });

    try {
      const semanticLifecycle = require('./semantic/semanticLifecycle');
      semanticLifecycle
        .indexChapter(chapterId)
        .catch((e) => console.warn('Chapter indexing warning:', e.message));
    } catch (e) {
      // Non-fatal: chapter is saved even if indexing fails
    }

    return createdChapter;
  }

  updateChapter(id, updates) {
    this.getChapter(id);
    return chapterRepository.update(id, updates);
  }

  /**
   * Imports a book from raw text or uploaded file buffer, running through the
   * canonical Ingestion Pipeline (Normalizer -> Structure Detector -> Parser -> Canonical Document)
   */
  async importBook({
    id,
    title,
    author,
    description,
    contentType = 'novel',
    text,
    fileBuffer,
    originalFilename,
    taskId,
  }) {
    let provisionalTitle = title;
    if (!provisionalTitle && originalFilename) {
      provisionalTitle = path
        .basename(originalFilename, path.extname(originalFilename))
        .replace(/[_-]/g, ' ');
    }
    if (!provisionalTitle || provisionalTitle.trim() === '') {
      provisionalTitle = 'Imported Reading Material';
    }

    if (
      (!text || text.trim() === '') &&
      (!fileBuffer || fileBuffer.length === 0)
    ) {
      throw new Error('No readable text or file buffer provided for import.');
    }

    // 0. Web Acquisition Pipeline
    if (text && /^(https?:\/\/[^\s]+)$/.test(text.trim())) {
      const ingestionResult = await ingestionService.ingest({
        title: provisionalTitle,
        author: author || '',
        description: description || '',
        rawText: text,
        fileBuffer,
        originalFilename,
        contentType,
      });
      if (ingestionResult.webAcquired && ingestionResult.book) {
        return {
          format: 'web',
          book: ingestionResult.book,
          chapterCount:
            (ingestionResult.chapters && ingestionResult.chapters.length) || 1,
          totalWordCount: ingestionResult.totalWordCount || 0,
          tablesCount: ingestionResult.tablesCount || 0,
          pageCount: ingestionResult.pageCount || 1,
          message: `Successfully acquired web content into library.`,
        };
      }
    }

    // 1. Create a provisional book entry first so polling finds the book immediately
    const provisionalFormat = originalFilename
      ? path.extname(originalFilename).replace('.', '').toLowerCase()
      : 'text';

    const importStartedAt = new Date().toISOString();
    const book = this.createBook({
      ...(id ? { id } : {}),
      title: provisionalTitle.trim(),
      author: (author || '').trim() || 'Unknown Author',
      description:
        description ||
        `Importing ${originalFilename || provisionalFormat}...`,
      content_type: contentType,
      source_format: provisionalFormat,
      original_filename: originalFilename || '',
      status: 'processing',
      import_started_at: importStartedAt,
    });

    const pipelineT0 = Date.now();
    const stageTimings = {};

    // 2. Create Ingestion Job at start of lifecycle (0%)
    const job = jobRepository.create({
      book_id: book.id,
      type: 'INGEST',
      status: 'PROCESSING',
      progress: 0,
    });
    jobRepository.update(job.id, { progress: 5 }); // 5%: format and inputs verified

    try {
      // 3. Process through Ingestion Service Pipeline (20% before parse, 60% after parse)
      jobRepository.update(job.id, { progress: 20 });
      const t0Ingest = Date.now();
      const ingestionResult = await ingestionService.ingest({
        title: provisionalTitle,
        author: author || '',
        description: description || '',
        rawText: text || '',
        fileBuffer,
        originalFilename,
        contentType,
      });
      stageTimings.ingestMs = Date.now() - t0Ingest;
      jobRepository.update(job.id, { progress: 60 });
      console.log(`[Pipeline] Stage 1/5: INGEST complete in ${(stageTimings.ingestMs / 1000).toFixed(2)}s`);

      if (ingestionResult.webAcquired && ingestionResult.book) {
        jobRepository.complete(job.id);
        return {
          format: 'web',
          book: ingestionResult.book,
          chapterCount:
            (ingestionResult.chapters && ingestionResult.chapters.length) || 1,
          totalWordCount: ingestionResult.totalWordCount || 0,
          tablesCount: ingestionResult.tablesCount || 0,
          pageCount: ingestionResult.pageCount || 1,
          message: `Successfully acquired web content into library.`,
        };
      }

      const finalTitle = title || ingestionResult.title || provisionalTitle;
      const finalAuthor = author || ingestionResult.author || 'Unknown Author';

      // 75%: after chapter detection and section analysis
      jobRepository.update(job.id, { progress: 75 });

      // Update book with rich parsed metadata
      bookRepository.update(book.id, {
        title: finalTitle.trim(),
        author: finalAuthor.trim(),
        description:
          description ||
          `Imported from ${originalFilename || ingestionResult.format}.`,
        content_type: contentType,
        source_format: ingestionResult.format,
        original_filename: originalFilename || '',
        page_count: ingestionResult.pageCount || 1,
        section_count: ingestionResult.sectionCount || 0,
        integrity_status: ingestionResult.integrityStatus || 'valid',
        integrity_warning: ingestionResult.integrityWarning || '',
        status: 'active',
        metadata_json: {
          tablesCount: ingestionResult.tablesCount || 0,
          sectionCount: ingestionResult.sectionCount || 0,
          sourceFormat: ingestionResult.format,
          importedAt: new Date().toISOString(),
          parse_mode: ingestionResult.parse_mode || 'book',
          parse_confidence:
            typeof ingestionResult.parse_confidence === 'number'
              ? ingestionResult.parse_confidence
              : 1.0,
        },
      });

      // 85%: after canonical normalization
      jobRepository.update(job.id, { progress: 85 });

      // 4. Transform into Chapter Entities
      const chapterEntities = ingestionResult.chapters.map((ch, idx) => ({
        id: `ch-${book.id}-${idx + 1}-${Math.random()
          .toString(36)
          .substring(2, 6)}`,
        book_id: book.id,
        number: idx + 1,
        title: ch.title,
        structural_role: ch.structuralRole || 'chapter',
        section_count:
          ch.sectionCount || (ch.sections ? ch.sections.length : 0),
        content: ch.content,
        canonical_content: JSON.stringify(ch.canonicalBlocks),
        metadata_json: JSON.stringify(ch.metadata || {}),
        word_count: ch.wordCount,
        status: 'unread',
      }));

      // 5. Batch Insert Chapters
      chapterRepository.createBatch(chapterEntities);

      // 95%: after DB write
      jobRepository.update(job.id, { progress: 95 });

      bookRepository.update(book.id, {
        import_completed_at: new Date().toISOString(),
      });
      _persistStage(taskId, 'ingest', 'done');

      // 6. Complete Job (100%)
      jobRepository.complete(job.id);

      // 7. Auto-index imported book into Semantic Memory only if content is valid.
      //    Then, if it qualifies, generate outline + auto-synthesize first 3 chapters.
      //    This whole chain runs in the background after the HTTP response is returned.
      const isValidContent =
        ingestionResult.integrityStatus !== 'empty_content' &&
        (ingestionResult.totalWordCount > 0 ||
          (chapterEntities.length > 0 &&
            chapterEntities[0].word_count > 0));

      if (isValidContent) {
        if (config.USE_PYTHON_EMBEDDER) {
          try {
            const { warmModel } = require('./ai/sidecarBase');
            warmModel('embed', null, { fireAndForget: true }).catch(() => {});
          } catch (_) {}
        }
        const totalWords =
          ingestionResult.totalWordCount ||
          chapterEntities.reduce((acc, c) => acc + (c.word_count || 0), 0);
        const { qualifiesForOutline, qualifiesForSynopsis } = classifyPipelineStages(
          chapterEntities.length,
          totalWords
        );

        console.log(`[Import] Indexing ${book.id}...`);
        await _runPostIngestPipeline(book, {
          jobId: job.id,
          taskId,
          chapterEntities,
          totalWords,
          pipelineT0,
          stageTimings,
          qualifiesForOutline,
          qualifiesForSynopsis,
        });
      } else {
        _persistStage(taskId, 'semantic_index', 'skipped');
        _persistStage(taskId, 'classify', 'skipped');
        _persistStage(taskId, 'outline', 'skipped');
        _persistStage(taskId, 'synopsis', 'skipped');
        _persistStage(taskId, 'synthesis', 'skipped');
        _persistStage(taskId, 'attribution', 'skipped');
        bookRepository.update(book.id, {
          synthesis_completed_at: new Date().toISOString(),
          attribution_completed_at: new Date().toISOString(),
        });
      }

      // 8. Return final book state with full pipeline results
      return {
        book: bookRepository.getById(book.id) || book,
        format: ingestionResult.format,
        chapterCount: chapterEntities.length,
        pageCount: ingestionResult.pageCount || 1,
        sectionCount: ingestionResult.sectionCount || 0,
        tablesCount: ingestionResult.tablesCount || 0,
        totalWordCount: ingestionResult.totalWordCount,
        integrityStatus: ingestionResult.integrityStatus || 'valid',
        integrityWarning: ingestionResult.integrityWarning || '',
        chapters: chapterRepository.getByBookId(book.id),
        job: jobRepository.getById(job.id),
      };
    } catch (err) {
      jobRepository.fail(job.id, err);
      try {
        bookRepository.update(book.id, { status: 'failed' });
      } catch (_) {}
      throw err;
    }
  }

  /**
   * Resets database to clean initial state with sample books
   */
  resetDevelopmentData() {
    return resetAndSeedDatabase();
  }
}

const bookServiceInstance = new BookService();
bookServiceInstance.classifyPipelineStages = classifyPipelineStages;
module.exports = bookServiceInstance;
module.exports.classifyPipelineStages = classifyPipelineStages;