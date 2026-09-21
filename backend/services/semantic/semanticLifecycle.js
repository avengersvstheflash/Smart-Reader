const preprocessor = require('./preprocessor');
const semanticChunker = require('./semanticChunker');
const semanticIndex = require('./semanticIndex');
const chapterRepository = require('../../repositories/chapterRepository');
const bookRepository = require('../../repositories/bookRepository');
const jobRepository = require('../../repositories/jobRepository');
const { getDatabase } = require('../../db/database');

class SemanticLifecycle {
  async indexBook(bookId, options = {}) {
    const book = bookRepository.getById(bookId);
    if (!book) throw new Error(`Book not found: ${bookId}`);

    const chapters = chapterRepository.getByBookId(bookId);
    const jobId = options.jobId || `job-index-${bookId}-${Date.now()}`;

    // Record job if not already started
    if (!options.skipJob) {
      if (!options.jobId) {
        jobRepository.create({
          id: jobId,
          book_id: bookId,
          type: 'SEMANTIC_INDEX',
          status: 'PROCESSING',
          progress: 10,
        });
      } else {
        jobRepository.update(jobId, { status: 'PROCESSING', progress: 10 });
      }
    }

    try {
      const db = getDatabase();
      db.prepare("UPDATE books SET semantic_status = 'indexing' WHERE id = ?").run(bookId);

      // 1. Stage: Preprocess all chapters into structural units
      if (!options.skipJob) jobRepository.update(jobId, { progress: 25, error: null });
      const allUnits = [];

      for (const ch of chapters) {
        const units = preprocessor.preprocessChapter(ch, book);
        allUnits.push(...units);
      }

      // 2. Stage: Semantic Chunking
      if (!options.skipJob) jobRepository.update(jobId, { progress: 50 });
      const chunks = semanticChunker.chunkPreprocessedUnits(allUnits, book);

      // 3. Stage: Embed & Index (incremental: reuse existing hash vectors)
      if (!options.skipJob) jobRepository.update(jobId, { progress: 75 });
      
      // Clean previous chunks for this book to avoid duplicates
      semanticIndex.deleteBookIndex(bookId);

      // Re-index all chunks
      const indexedChunks = await semanticIndex.indexChunks(bookId, chunks);

      // 4. Mark Ready
      if (!options.skipJob) {
        jobRepository.complete(jobId);
      }

      return {
        bookId,
        chapterCount: chapters.length,
        unitCount: allUnits.length,
        chunkCount: indexedChunks.length,
        status: 'ready',
      };
    } catch (err) {
      console.error(`Error in semantic lifecycle for book ${bookId}:`, err);
      const db = getDatabase();
      db.prepare("UPDATE books SET semantic_status = 'failed' WHERE id = ?").run(bookId);

      if (!options.skipJob) {
        jobRepository.fail(jobId, err.message);
      }
      throw err;
    }
  }

  async indexChapter(chapterId, options = {}) {
    const chapter = chapterRepository.getById(chapterId);
    if (!chapter) throw new Error(`Chapter not found: ${chapterId}`);
    const book = bookRepository.getById(chapter.book_id);

    // Delete existing chunks for this chapter
    semanticIndex.deleteChapterIndex(chapterId, chapter.book_id);

    // Preprocess & chunk
    const units = preprocessor.preprocessChapter(chapter, book);
    const chunks = semanticChunker.chunkPreprocessedUnits(units, book);

    if (chunks.length > 0) {
      await semanticIndex.indexChunks(chapter.book_id, chunks);
    }

    return {
      chapterId,
      bookId: chapter.book_id,
      chunkCount: chunks.length,
      status: 'ready',
    };
  }

  async invalidateBook(bookId) {
    semanticIndex.deleteBookIndex(bookId);
  }
}

module.exports = new SemanticLifecycle();
