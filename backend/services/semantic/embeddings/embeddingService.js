const LocalEmbeddingProvider = require('./localEmbeddingProvider');
const CloudEmbeddingProvider = require('./cloudEmbeddingProvider');
const semanticChunkRepository = require('../../../repositories/semanticChunkRepository');

class EmbeddingService {
  constructor() {
    this.localProvider = new LocalEmbeddingProvider();
    this.cloudProvider = new CloudEmbeddingProvider();
    // Default to localProvider for fast deterministic offline performance, with cloud provider available on demand
    this.activeProvider = this.localProvider;
    this.embeddingCache = new Map(); // hash -> vector
  }

  setProvider(type) {
    if (type === 'cloud' && process.env.GEMINI_API_KEY) {
      this.activeProvider = this.cloudProvider;
    } else {
      this.activeProvider = this.localProvider;
    }
  }

  getProviderName() {
    return this.activeProvider.getName();
  }

  async embedText(text) {
    return this.activeProvider.embedText(text);
  }

  async embedChunk(chunk) {
    if (!chunk) return null;

    // Check memory cache
    if (chunk.contentHash && this.embeddingCache.has(chunk.contentHash)) {
      return this.embeddingCache.get(chunk.contentHash);
    }

    // Check DB for existing hash
    if (chunk.contentHash) {
      const existing = semanticChunkRepository.findByHash(chunk.contentHash);
      if (existing && existing.embedding && Array.isArray(existing.embedding)) {
        this.embeddingCache.set(chunk.contentHash, existing.embedding);
        return existing.embedding;
      }
    }

    // Text to embed combines section heading context and body content
    const textToEmbed = chunk.sectionHeading
      ? `[${chunk.sectionHeading}] ${chunk.textContent}`
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

module.exports = new EmbeddingService();
