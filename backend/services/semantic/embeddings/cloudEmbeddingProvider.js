const EmbeddingProvider = require('./embeddingProvider');
const LocalEmbeddingProvider = require('./localEmbeddingProvider');

class CloudEmbeddingProvider extends EmbeddingProvider {
  constructor(apiKey) {
    super();
    this.apiKey = apiKey || process.env.GEMINI_API_KEY;
    this.localFallback = new LocalEmbeddingProvider();
    this.dimension = 768; // Standard Gemini text-embedding-004 dimension
    this.aiClient = null;

    if (this.apiKey) {
      try {
        const { GoogleGenAI } = require('@google/genai');
        this.aiClient = new GoogleGenAI({ apiKey: this.apiKey });
      } catch (e) {
        console.warn('Could not initialize GoogleGenAI client for embeddings, using local fallback:', e.message);
      }
    }
  }

  getName() {
    return this.aiClient ? 'Gemini text-embedding-004 (Cloud)' : 'Local Fallback Embedding Provider';
  }

  getDimension() {
    return this.aiClient ? this.dimension : this.localFallback.getDimension();
  }

  async embedText(text) {
    if (!this.aiClient || !text) {
      return this.localFallback.embedText(text);
    }

    try {
      const response = await this.aiClient.models.embedContent({
        model: 'text-embedding-004',
        contents: text,
      });

      if (response && response.embedding && Array.isArray(response.embedding.values)) {
        return response.embedding.values;
      }
      return this.localFallback.embedText(text);
    } catch (err) {
      console.warn('Cloud embedding failed, using local fallback:', err.message);
      return this.localFallback.embedText(text);
    }
  }

  async embedBatch(texts) {
    if (!Array.isArray(texts) || texts.length === 0) return [];
    if (!this.aiClient) {
      return this.localFallback.embedBatch(texts);
    }

    try {
      // Process batch
      const results = [];
      for (const text of texts) {
        results.push(await this.embedText(text));
      }
      return results;
    } catch (err) {
      console.warn('Cloud batch embedding failed, fallback to local:', err.message);
      return this.localFallback.embedBatch(texts);
    }
  }
}

module.exports = CloudEmbeddingProvider;
