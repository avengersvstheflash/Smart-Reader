class EmbeddingProvider {
  getName() {
    throw new Error('getName() must be implemented by subclass');
  }

  getDimension() {
    throw new Error('getDimension() must be implemented by subclass');
  }

  async embedText(text) {
    throw new Error('embedText() must be implemented by subclass');
  }

  async embedBatch(texts) {
    if (!Array.isArray(texts)) return [];
    const results = [];
    for (const t of texts) {
      results.push(await this.embedText(t));
    }
    return results;
  }

  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

module.exports = EmbeddingProvider;
