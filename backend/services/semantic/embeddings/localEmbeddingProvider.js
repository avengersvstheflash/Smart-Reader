const EmbeddingProvider = require('./embeddingProvider');

class LocalEmbeddingProvider extends EmbeddingProvider {
  constructor() {
    super();
    this.dimension = 256;
    this.stopwords = new Set([
      'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
      'any', 'are', 'aren\'t', 'as', 'at', 'be', 'because', 'been', 'before', 'being',
      'below', 'between', 'both', 'but', 'by', 'can\'t', 'cannot', 'could', 'couldn\'t',
      'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t', 'down', 'during',
      'each', 'few', 'for', 'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t',
      'have', 'haven\'t', 'having', 'he', 'he\'d', 'he\'ll', 'he\'s', 'her', 'here',
      'here\'s', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'how\'s', 'i',
      'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if', 'in', 'into', 'is', 'isn\'t', 'it',
      'it\'s', 'its', 'itself', 'let\'s', 'me', 'more', 'most', 'mustn\'t', 'my',
      'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other',
      'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'shan\'t',
      'she', 'she\'d', 'she\'ll', 'she\'s', 'should', 'shouldn\'t', 'so', 'some',
      'such', 'than', 'that', 'that\'s', 'the', 'their', 'theirs', 'them', 'themselves',
      'then', 'there', 'there\'s', 'these', 'they', 'they\'d', 'they\'ll', 'they\'re',
      'they\'ve', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up',
      'very', 'was', 'wasn\'t', 'we', 'we\'d', 'we\'ll', 'we\'re', 'we\'ve', 'were',
      'weren\'t', 'what', 'what\'s', 'when', 'when\'s', 'where', 'where\'s', 'which',
      'while', 'who', 'who\'s', 'whom', 'why', 'why\'s', 'with', 'won\'t', 'would',
      'wouldn\'t', 'you', 'you\'d', 'you\'ll', 'you\'re', 'you\'ve', 'your', 'yours',
      'yourself', 'yourselves'
    ]);

    // Conceptual clusters for domain-aware projection (indices 128..191)
    this.semanticAnchors = [
      { id: 0, terms: ['science', 'physics', 'quantum', 'mechanics', 'energy', 'particle', 'atomic', 'wave', 'experiment', 'theory'] },
      { id: 1, terms: ['time', 'chronometer', 'temporal', 'future', 'past', 'history', 'clock', 'duration', 'era', 'epoch'] },
      { id: 2, terms: ['character', 'protagonist', 'antagonist', 'person', 'hero', 'villain', 'voice', 'dialogue', 'speech', 'feeling'] },
      { id: 3, terms: ['conflict', 'battle', 'war', 'danger', 'fight', 'struggle', 'crisis', 'threat', 'enemy', 'tension'] },
      { id: 4, terms: ['space', 'universe', 'planet', 'celestial', 'star', 'cosmic', 'orbit', 'galaxy', 'void', 'sky'] },
      { id: 5, terms: ['computer', 'data', 'algorithm', 'system', 'network', 'code', 'digital', 'protocol', 'server', 'machine'] },
      { id: 6, terms: ['mystery', 'secret', 'clue', 'investigation', 'hidden', 'crypt', 'ancient', 'symbol', 'puzzle', 'riddle'] },
      { id: 7, terms: ['academic', 'method', 'research', 'hypothesis', 'study', 'analysis', 'finding', 'evidence', 'conclusion', 'paper'] },
      { id: 8, terms: ['education', 'learning', 'chapter', 'lesson', 'concept', 'definition', 'example', 'exercise', 'principle', 'core'] },
      { id: 9, terms: ['emotion', 'love', 'fear', 'sorrow', 'joy', 'hope', 'despair', 'memory', 'heart', 'mind'] },
      { id: 10, terms: ['society', 'culture', 'people', 'city', 'world', 'kingdom', 'empire', 'politics', 'law', 'order'] },
      { id: 11, terms: ['magic', 'supernatural', 'spell', 'arcane', 'power', 'ritual', 'enchantment', 'relic', 'mystic', 'mana'] },
    ];
  }

  getName() {
    return 'LocalDenseSemanticVectorizer (256d)';
  }

  getDimension() {
    return this.dimension;
  }

  async embedText(text) {
    const vector = new Float64Array(this.dimension);
    if (!text || typeof text !== 'string') return Array.from(vector);

    const clean = text.toLowerCase();
    const words = clean.match(/[a-z0-9_]{2,}/g) || [];

    if (words.length === 0) return Array.from(vector);

    // 1. Subword & N-gram hashing into bucket [0..127]
    for (const word of words) {
      const isStop = this.stopwords.has(word);
      const weight = isStop ? 0.2 : 1.0;

      // Whole word hash
      const wHash = this.hashString(word) % 128;
      vector[wHash] += 1.5 * weight;

      // Character trigrams
      if (word.length >= 3) {
        for (let i = 0; i <= word.length - 3; i++) {
          const tri = word.substring(i, i + 3);
          const triHash = this.hashString(tri) % 128;
          vector[triHash] += 0.4 * weight;
        }
      }
    }

    // 2. Semantic Anchor Lexicon mapping into bucket [128..191]
    const wordFreq = {};
    for (const w of words) {
      wordFreq[w] = (wordFreq[w] || 0) + 1;
    }

    for (let aIdx = 0; aIdx < this.semanticAnchors.length; aIdx++) {
      const anchor = this.semanticAnchors[aIdx];
      let anchorScore = 0;
      for (const t of anchor.terms) {
        if (wordFreq[t]) {
          anchorScore += wordFreq[t] * 2.5;
        }
      }
      if (anchorScore > 0) {
        const slot = 128 + (aIdx * 4);
        vector[slot] += anchorScore;
        vector[slot + 1] += Math.log1p(anchorScore) * 1.5;
      }
    }

    // 3. TF / Frequency saturation projection into bucket [192..255]
    for (const [w, count] of Object.entries(wordFreq)) {
      if (this.stopwords.has(w)) continue;
      const tfWeight = Math.log1p(count);
      const slot = 192 + (this.hashString(w) % 64);
      vector[slot] += tfWeight * 2.0;
    }

    // 4. L2 Normalization
    let norm = 0;
    for (let i = 0; i < this.dimension; i++) {
      norm += vector[i] * vector[i];
    }

    if (norm > 0) {
      const invNorm = 1.0 / Math.sqrt(norm);
      for (let i = 0; i < this.dimension; i++) {
        vector[i] = Number((vector[i] * invNorm).toFixed(6));
      }
    }

    return Array.from(vector);
  }

  hashString(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}

module.exports = LocalEmbeddingProvider;
