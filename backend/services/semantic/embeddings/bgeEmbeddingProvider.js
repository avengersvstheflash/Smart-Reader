const { pipeline } = require('@huggingface/transformers');
const EmbeddingProvider = require('./embeddingProvider');

const EMBEDDING_DIM = 1024;
let extractor = null;

async function loadModel() {
  if (extractor) return extractor;
  extractor = await pipeline('feature-extraction', 'Xenova/bge-m3', { dtype: 'q8' });
  return extractor;
}

async function embed(texts, options = {}) {
  const isSingle = typeof texts === 'string';
  const input = isSingle ? [texts] : (Array.isArray(texts) ? texts : [String(texts)]);
  const model = await loadModel();
  // CLS pooling per BGE-M3 reference; verified 1.68x separation gap
  // vs mean pooling on passage retrieval (see build4_5 test).
  const pooling = options.pooling || 'cls';
  const out = await model(input, { pooling, normalize: true });
  const list = out.tolist(); // [N, 1024]

  if (isSingle) {
    const single = list[0];
    single.dims = EMBEDDING_DIM;
    return single;
  }
  list.dims = [list.length, EMBEDDING_DIM];
  return list;
}

async function warmup() {
  await loadModel();
}

class BgeEmbeddingProvider extends EmbeddingProvider {
  constructor() {
    super();
    this.dimension = EMBEDDING_DIM;
  }

  getName() {
    return 'BGE-M3 (1024d, Xenova/bge-m3 q8)';
  }

  getDimension() {
    return this.dimension;
  }

  async embedText(text, options = {}) {
    if (!text || typeof text !== 'string') return new Array(this.dimension).fill(0);
    const result = await embed(text, options);
    return result;
  }

  async embedBatch(texts, options = {}) {
    if (!Array.isArray(texts) || texts.length === 0) return [];
    return embed(texts, options);
  }

  async warmup() {
    return warmup();
  }
}

const defaultProviderInstance = new BgeEmbeddingProvider();

module.exports = {
  BgeEmbeddingProvider,
  bgeProvider: defaultProviderInstance,
  embed,
  warmup,
  EMBEDDING_DIM,
  getName: () => defaultProviderInstance.getName(),
  getDimension: () => defaultProviderInstance.getDimension(),
  embedText: (text, opt) => defaultProviderInstance.embedText(text, opt),
  embedBatch: (texts, opt) => defaultProviderInstance.embedBatch(texts, opt),
  cosineSimilarity: (a, b) => defaultProviderInstance.cosineSimilarity(a, b),
};

