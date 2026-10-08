const { pipeline } = require('@huggingface/transformers');
const EmbeddingProvider = require('./embeddingProvider');
const config = require('../../../config');
const embedClient = require('../../ai/embedClient');

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
  
  if (config.USE_PYTHON_EMBEDDER) {
    const res = await embedClient.embedBatch(input, options);
    if (isSingle) {
      const single = res.embeddings[0];
      single.dims = EMBEDDING_DIM;
      return single;
    }
    const list = res.embeddings;
    list.dims = [list.length, EMBEDDING_DIM];
    return list;
  }

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
  if (config.USE_PYTHON_EMBEDDER) {
    const start = Date.now();
    while (Date.now() - start < 120000) {
      try {
        await embedClient.embedBatch(['warmup']);
        return;
      } catch (err) {
        if (err.code === 'EMBED_MODEL_WARMING') {
          await new Promise(r => setTimeout(r, 1000));
        } else {
          throw err;
        }
      }
    }
    throw new Error('Timeout waiting for Python embedder to warm up');
  }
  await loadModel();
}

class BgeEmbeddingProvider extends EmbeddingProvider {
  constructor() {
    super();
    this.dimension = EMBEDDING_DIM;
  }

  getName() {
    if (config.USE_PYTHON_EMBEDDER) {
      return 'BGE-M3 (1024d, Python sidecar fp32)';
    }
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
  bgeEmbeddingProvider: defaultProviderInstance,
  embed,
  warmup,
  EMBEDDING_DIM,
  getName: () => defaultProviderInstance.getName(),
  getDimension: () => defaultProviderInstance.getDimension(),
  embedText: (text, opt) => defaultProviderInstance.embedText(text, opt),
  embedBatch: (texts, opt) => defaultProviderInstance.embedBatch(texts, opt),
  cosineSimilarity: (a, b) => defaultProviderInstance.cosineSimilarity(a, b),
};
