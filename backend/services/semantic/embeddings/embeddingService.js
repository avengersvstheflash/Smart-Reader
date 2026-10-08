const { BgeEmbeddingProvider, warmup, EMBEDDING_DIM } = require('./bgeEmbeddingProvider');
const LocalEmbeddingProvider = require('./localEmbeddingProvider');
const CloudEmbeddingProvider = require('./cloudEmbeddingProvider');
const semanticChunkRepository = require('../../../repositories/semanticChunkRepository');

class EmbeddingService {
  constructor() {
    this.bgeProvider = new BgeEmbeddingProvider();
    this.legacyProvider = new LocalEmbeddingProvider();
    this.cloudProvider = new CloudEmbeddingProvider();

    // Default to BGE-M3 1024d
    this.activeProvider = this.bgeProvider;
    this.localProvider = this.bgeProvider;
    this.embeddingCache = new Map();
    this.EMBEDDING_DIM = EMBEDDING_DIM;
  }

  setProvider(type) {
    if (type === 'cloud' && process.env.GEMINI_API_KEY) {
      this.activeProvider = this.cloudProvider;
    } else if (type === 'legacy' || type === 'deterministic') {
      this.activeProvider = this.legacyProvider;
    } else {
      this.activeProvider = this.bgeProvider;
    }
  }

  getDimension() {
    return this.activeProvider.getDimension();
  }

  getProviderName() {
    return this.activeProvider.getName();
  }

  async warmup() {
    return this.bgeProvider.warmup();
  }

  async embedText(text, options = {}) {
    return this.activeProvider.embedText(text, options);
  }

  async embedChunk(chunk) {
    if (!chunk) return null;

    const currentDim = this.getDimension();

    if (chunk.contentHash && this.embeddingCache.has(chunk.contentHash)) {
      const cached = this.embeddingCache.get(chunk.contentHash);
      if (cached && Array.isArray(cached) && cached.length === currentDim) {
        return cached;
      }
    }

    if (chunk.contentHash) {
      const existing = semanticChunkRepository.findByHash(chunk.contentHash);
      if (existing && existing.embedding && Array.isArray(existing.embedding) && existing.embedding.length === currentDim) {
        this.embeddingCache.set(chunk.contentHash, existing.embedding);
        return existing.embedding;
      }
    }

    const textToEmbed = chunk.sectionHeading
      ? '[' + chunk.sectionHeading + '] ' + chunk.textContent
      : chunk.textContent;

    const vector = await this.activeProvider.embedText(textToEmbed);

    if (chunk.contentHash && vector) {
      this.embeddingCache.set(chunk.contentHash, vector);
    }

    return vector;
  }

  async embedChunks(chunks) {
    if (!Array.isArray(chunks)) return [];
    if (chunks.length === 0) return [];

    const currentDim = this.activeProvider.getDimension();
    const results = new Array(chunks.length);
    const uncachedIndices = [];
    const uncachedTexts = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      let cachedVector = null;

      if (chunk.contentHash && this.embeddingCache.has(chunk.contentHash)) {
        const cached = this.embeddingCache.get(chunk.contentHash);
        if (cached && Array.isArray(cached) && cached.length === currentDim) {
          cachedVector = cached;
        }
      }

      if (!cachedVector && chunk.contentHash) {
        const existing = semanticChunkRepository.findByHash(chunk.contentHash);
        if (existing && existing.embedding && Array.isArray(existing.embedding) && existing.embedding.length === currentDim) {
          this.embeddingCache.set(chunk.contentHash, existing.embedding);
          cachedVector = existing.embedding;
        }
      }

      if (cachedVector) {
        results[i] = cachedVector;
      } else {
        const textToEmbed = chunk.sectionHeading
          ? '[' + chunk.sectionHeading + '] ' + chunk.textContent
          : chunk.textContent;
        uncachedIndices.push(i);
        uncachedTexts.push(textToEmbed);
      }
    }

    if (uncachedTexts.length > 0) {
      const vectors = await this.activeProvider.embedBatch(uncachedTexts);
      for (let j = 0; j < uncachedIndices.length; j++) {
        const originalIdx = uncachedIndices[j];
        const vector = Array.isArray(vectors) ? vectors[j] : null;
        results[originalIdx] = vector;

        const chunk = chunks[originalIdx];
        if (chunk.contentHash && vector) {
          this.embeddingCache.set(chunk.contentHash, vector);
        }
      }
    }

    return chunks.map((chunk, i) => ({
      ...chunk,
      embedding: results[i],
    }));
  }

  cosineSimilarity(vecA, vecB) {
    return this.activeProvider.cosineSimilarity(vecA, vecB);
  }
}

const serviceInstance = new EmbeddingService();
serviceInstance.warmup = () => serviceInstance.bgeProvider.warmup();
serviceInstance.EMBEDDING_DIM = EMBEDDING_DIM;

module.exports = serviceInstance;
