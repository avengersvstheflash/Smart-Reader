const semanticIndex = require('./semanticIndex');
const bookRepository = require('../../repositories/bookRepository');
const chapterRepository = require('../../repositories/chapterRepository');

class RetrievalService {
  async retrieveForChapter(chapterId, query, options = {}) {
    const chapter = chapterRepository.getById(chapterId);
    if (!chapter) throw new Error(`Chapter not found: ${chapterId}`);

    const topK = options.topK || 6;
    const threshold = options.threshold || 0.05;

    const results = await semanticIndex.search(query, {
      scope: 'chapter',
      chapterId,
      topK,
      threshold,
      contentTypes: options.contentTypes,
    });

    return {
      scope: 'chapter',
      query,
      chapter: {
        id: chapter.id,
        number: chapter.number,
        title: chapter.title,
        bookId: chapter.book_id,
      },
      chunks: results,
      totalRetrieved: results.length,
    };
  }

  async retrieveForBook(bookId, query, options = {}) {
    const book = bookRepository.getById(bookId);
    if (!book) throw new Error(`Book not found: ${bookId}`);

    const topK = options.topK || 8;
    const threshold = options.threshold || 0.05;

    const results = await semanticIndex.search(query, {
      scope: 'book',
      bookId,
      topK: topK * 2, // Fetch slightly more for diversity re-ranking
      threshold,
      contentTypes: options.contentTypes,
    });

    // Apply diversity re-ranking across chapters/sections if requested
    const reranked = options.diverse ? this.diversifyByChapter(results, topK) : results.slice(0, topK);

    return {
      scope: 'book',
      query,
      book: {
        id: book.id,
        title: book.title,
        author: book.author,
        contentType: book.content_type,
      },
      chunks: reranked,
      totalRetrieved: reranked.length,
    };
  }

  async retrieveRepresentativeBookContent(bookId, options = {}) {
    const book = bookRepository.getById(bookId);
    if (!book) throw new Error(`Book not found: ${bookId}`);

    // Retrieve broad representative material across the book
    // Rather than single search query, we gather landmark chunks across chapters
    const chapters = chapterRepository.getByBookId(bookId);
    const targetChunks = options.maxChunks || 12;

    const representativeChunks = [];
    const chunksPerChapter = Math.max(1, Math.floor(targetChunks / Math.max(1, chapters.length)));

    for (const ch of chapters) {
      const chChunks = await semanticIndex.search(book.title || 'overview premise core', {
        scope: 'chapter',
        chapterId: ch.id,
        topK: chunksPerChapter,
        threshold: 0.01,
      });

      for (const c of chChunks) {
        representativeChunks.push({
          ...c,
          chapterTitle: ch.title,
          chapterNumber: ch.number,
        });
      }
    }

    // Sort by sequence across the book
    representativeChunks.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

    return {
      scope: 'book_representative',
      book: {
        id: book.id,
        title: book.title,
        author: book.author,
        contentType: book.content_type,
      },
      chunks: representativeChunks.slice(0, targetChunks),
      totalRetrieved: Math.min(representativeChunks.length, targetChunks),
    };
  }

  async retrieveForLibrary(query, options = {}) {
    const topK = options.topK || 10;
    const threshold = options.threshold || 0.08;

    const results = await semanticIndex.search(query, {
      scope: 'library',
      topK,
      threshold,
      contentTypes: options.contentTypes,
    });

    return {
      scope: 'library',
      query,
      chunks: results,
      totalRetrieved: results.length,
    };
  }

  diversifyByChapter(chunks, targetCount) {
    if (!chunks || chunks.length <= targetCount) return chunks;

    const seenChapters = new Set();
    const diverse = [];
    const remaining = [];

    // First pass: 1 item per chapter to guarantee coverage
    for (const chunk of chunks) {
      const chKey = chunk.chapterId || 'root';
      if (!seenChapters.has(chKey)) {
        seenChapters.add(chKey);
        diverse.push(chunk);
      } else {
        remaining.push(chunk);
      }
      if (diverse.length >= targetCount) break;
    }

    // Second pass: fill remaining slots by similarity score
    while (diverse.length < targetCount && remaining.length > 0) {
      diverse.push(remaining.shift());
    }

    return diverse;
  }
}

module.exports = new RetrievalService();
