const semanticChunkRepository = require('../../repositories/semanticChunkRepository');
const embeddingService = require('./embeddings/embeddingService');
const { getDatabase } = require('../../db/database');

class SemanticIndex {
  constructor() {
    // In-memory cache for fast vector similarity scans
    // bookId -> Array<ChunkWithVector>
    this.memoryIndex = new Map();
  }

  // Load all chunks for a book into memory index
  loadBookIndex(bookId) {
    const chunks = semanticChunkRepository.getByBookId(bookId);
    this.memoryIndex.set(bookId, chunks);
    return chunks;
  }

  // Add or update chunks in the index
  async indexChunks(bookId, chunks) {
    if (!chunks || chunks.length === 0) return [];

    // Ensure chunks are properly attributed to this bookId
    const preparedChunks = chunks.map((c) => ({
      ...c,
      bookId,
      book_id: bookId,
    }));

    // Embed all chunks
    const embeddedChunks = await embeddingService.embedChunks(preparedChunks);

    // Save to DB
    semanticChunkRepository.insertBatch(embeddedChunks);

    // Refresh memory index
    this.loadBookIndex(bookId);

    // Update book table metadata
    const db = getDatabase();
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE books 
      SET semantic_status = 'indexed', 
          semantic_chunk_count = (SELECT COUNT(*) FROM semantic_chunks WHERE book_id = ?),
          semantic_indexed_at = ?
      WHERE id = ?
    `).run(bookId, now, bookId);

    return embeddedChunks;
  }

  // Delete book from index
  deleteBookIndex(bookId) {
    this.memoryIndex.delete(bookId);
    semanticChunkRepository.deleteByBookId(bookId);

    const db = getDatabase();
    db.prepare(`
      UPDATE books 
      SET semantic_status = 'unindexed', 
          semantic_chunk_count = 0,
          semantic_indexed_at = NULL
      WHERE id = ?
    `).run(bookId);
  }

  // Delete chapter from index
  deleteChapterIndex(chapterId, bookId) {
    semanticChunkRepository.deleteByChapterId(chapterId);
    if (bookId) {
      this.loadBookIndex(bookId);
      const db = getDatabase();
      db.prepare(`
        UPDATE books 
        SET semantic_chunk_count = (SELECT COUNT(*) FROM semantic_chunks WHERE book_id = ?)
        WHERE id = ?
      `).run(bookId, bookId);
    }
  }

  // Search index by semantic similarity
  async search(query, options = {}) {
    const {
      scope = 'book', // 'chapter' | 'book' | 'selected_books' | 'library'
      bookId,
      chapterId,
      bookIds = [],
      topK = 5,
      threshold = 0.05,
      contentTypes = null, // Array of strings or null for all
    } = options;

    if (!query || typeof query !== 'string') return [];

    // Embed the search query
    const queryVector = await embeddingService.embedText(query);
    if (!queryVector || queryVector.length === 0) return [];

    // Gather candidate chunks based on scope
    let candidates = [];

    if (scope === 'chapter' && chapterId) {
      candidates = semanticChunkRepository.getByChapterId(chapterId);
    } else if (scope === 'book' && bookId) {
      if (!this.memoryIndex.has(bookId)) {
        this.loadBookIndex(bookId);
      }
      candidates = this.memoryIndex.get(bookId) || [];
    } else if ((scope === 'selected_books' || scope === 'collection') && Array.isArray(bookIds)) {
      candidates = [];
      for (const bId of bookIds) {
        if (!this.memoryIndex.has(bId)) {
          this.loadBookIndex(bId);
        }
        candidates.push(...(this.memoryIndex.get(bId) || []));
      }
    } else {
      // Library scope - all chunks
      candidates = semanticChunkRepository.getAll();
    }

    // Filter by contentType if specified
    if (Array.isArray(contentTypes) && contentTypes.length > 0) {
      candidates = candidates.filter((c) => contentTypes.includes(c.contentType));
    }

    // Score candidates with Cosine Similarity
    const scored = [];
    for (const chunk of candidates) {
      if (!chunk.embedding || !Array.isArray(chunk.embedding)) continue;
      // Filter out stale or dimension-mismatched vectors (e.g. legacy 256d vs 1024d)
      if (chunk.embedding.length !== queryVector.length) continue;

      const score = embeddingService.cosineSimilarity(queryVector, chunk.embedding);
      if (score >= threshold) {
        scored.push({
          ...chunk,
          similarityScore: Number(score.toFixed(4)),
        });
      }
    }

    // Sort descending by similarityScore
    scored.sort((a, b) => b.similarityScore - a.similarityScore);

    return scored.slice(0, topK);
  }

  // Check if a book's chunks have stale embedding dimensions
  isBookIndexStale(bookId) {
    const chunks = semanticChunkRepository.getByBookId(bookId);
    if (!chunks || chunks.length === 0) return false;
    const currentDim = embeddingService.getDimension();
    return chunks.some((c) => c.embedding && Array.isArray(c.embedding) && c.embedding.length !== currentDim);
  }

  // Get index statistics for a book
  getStats(bookId) {
    const count = semanticChunkRepository.countByBookId(bookId);
    const db = getDatabase();
    const book = db.prepare('SELECT semantic_status, semantic_chunk_count, semantic_indexed_at FROM books WHERE id = ?').get(bookId);

    return {
      bookId,
      chunkCount: count,
      totalChunks: count,
      dimensions: 256,
      dimensions: embeddingService.getDimension(),
      status: book ? book.semantic_status : 'unknown',
      indexedAt: book ? book.semantic_indexed_at : null,
      provider: embeddingService.getProviderName(),
    };
  }
}

module.exports = new SemanticIndex();
