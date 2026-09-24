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
    const embedded = [];

    for (const chunk of chunks) {
      const vector = await this.embedChunk(chunk);
      embedded.push({
        ...chunk,
        embedding: vector,
      });
    }

    return embedded;
  }

  cosineSimilarity(vecA, vecB) {
    return this.activeProvider.cosineSimilarity(vecA, vecB);
  }
}

const serviceInstance = new EmbeddingService();
serviceInstance.warmup = () => serviceInstance.bgeProvider.warmup();
serviceInstance.EMBEDDING_DIM = EMBEDDING_DIM;

module.exports = serviceInstance;
