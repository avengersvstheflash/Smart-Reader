const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

// Lightweight .env loader if present
const envPath = path.join(ROOT_DIR, '.env');
if (fs.existsSync(envPath)) {
  try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (key && !(key in process.env)) {
          process.env[key] = val;
        }
      }
    }
  } catch (_) {}
}

const STORAGE_DIR = process.env.STORAGE_DIR || path.join(ROOT_DIR, 'storage');

// Safe provider identifier resolver (gemini | ollama)
// Safe provider identifier resolver (gemini | ollama | openrouter)
function resolveSafeProvider(raw) {
  const str = String(raw || '').trim().toLowerCase();
  if (str.includes('ollama') || str === 'local') return 'ollama';
  if (str.includes('openrouter')) return 'openrouter';
  return 'gemini';
}

// Import size cap resolver (50-200 MB, default 50 MB)
function resolveImportMaxSizeMB() {
  const raw = process.env.IMPORT_MAX_SIZE_MB;
  if (raw === undefined || raw === '') {
    const val = 50;
    console.log(`[Config] Import size cap: ${val} MB`);
    return val;
  }

  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed < 50) {
    console.warn(`[Config] IMPORT_MAX_SIZE_MB=${raw} is outside 50-200 MB range. Falling back to 50.`);
    console.log(`[Config] Import size cap: 50 MB`);
    return 50;
  }

  if (parsed > 200) {
    console.warn(`[Config] IMPORT_MAX_SIZE_MB=${raw} exceeds v1.0 ceiling of 200. Clamping to 200. Streaming upload required for larger files (v1.5).`);
    console.log(`[Config] Import size cap: 200 MB`);
    return 200;
  }

  console.log(`[Config] Import size cap: ${parsed} MB`);
  return parsed;
}

const IMPORT_MAX_SIZE_MB = resolveImportMaxSizeMB();

module.exports = {
  PORT: 3000,
  ROOT_DIR,
  STORAGE_DIR,
  IMPORT_MAX_SIZE_MB,
  BOOKS_DIR: path.join(STORAGE_DIR, 'books'),
  COVERS_DIR: path.join(STORAGE_DIR, 'covers'),
  PAGES_DIR: path.join(STORAGE_DIR, 'pages'),
  GENERATED_DIR: path.join(STORAGE_DIR, 'generated'),
  DB_PATH: process.env.DB_PATH || path.join(__dirname, '..', 'storage', 'data.db'),
  
  // AI Provider Configuration (strictly safe identifier, never secrets)
  AI_PROVIDER: resolveSafeProvider(process.env.AI_PROVIDER || 'ollama'),
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'llama3',
  OLLAMA_TIMEOUT_MS: parseInt(process.env.OLLAMA_TIMEOUT_MS || '30000', 10),
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || 'deepseek/deepseek-v4-flash',
  OPENROUTER_TIMEOUT_MS: parseInt(process.env.OPENROUTER_TIMEOUT_MS || '30000', 10),

  // Synthesis Validation & Refine Loops (Phase 5.6)
  MIN_SOURCE_CHUNK_WORDS: parseInt(process.env.MIN_SOURCE_CHUNK_WORDS || '75', 10),
  AUTO_RESYNTHESIZE_ON_VIOLATION: process.env.AUTO_RESYNTHESIZE_ON_VIOLATION !== undefined
    ? process.env.AUTO_RESYNTHESIZE_ON_VIOLATION === 'true'
    : true,
  MAX_AUTO_RESYNTHESIZE_ATTEMPTS: parseInt(process.env.MAX_AUTO_RESYNTHESIZE_ATTEMPTS || '2', 10),

  // Python Sidecar OCR Configuration (Phase 5.7.1)
  PYTHON_SIDECAR_URL: process.env.PYTHON_SIDECAR_URL || 'http://127.0.0.1:8765',
  // Base timeout for OCR requests (120s base; multi-page PDFs scale dynamically in ocrClient and pdfjsParser).
  PYTHON_SIDECAR_TIMEOUT_MS: parseInt(process.env.PYTHON_SIDECAR_TIMEOUT_MS, 10) || 120000,

  // Python Sidecar Embedding Configuration (Phase 5.7.2 / F37)
  // Default true: use Python sidecar for BGE-M3 embeddings (GPU-accelerated).
  // Set to 'false' to fall back to Node ONNX (CPU).
  USE_PYTHON_EMBEDDER: process.env.USE_PYTHON_EMBEDDER !== 'false',
  get usePythonEmbedder() {
    return this.USE_PYTHON_EMBEDDER;
  },

  // Python Sidecar Parse Configuration (Phase 5.7.3)
  USE_PYTHON_PARSER: process.env.USE_PYTHON_PARSER !== 'false',

  // Parallel synthesis concurrency (Phase 5.7.2)
  // Conservative default of 2. Empirical diagnostic (Session 3b-2)
  // may justify raising it. Raise via env for higher tiers.
  OPENROUTER_CONCURRENCY: parseInt(process.env.OPENROUTER_CONCURRENCY, 10) || 2,

  // Exponential backoff base for synthesis retries (Phase 5.7.2).
  // Derived from Phase-5.7.2-Decision-Record.md §2.2's 2s/4s/8s
  // heuristic. Actual wait = base * 2^attempt + jitter.
  SYNTHESIS_BACKOFF_BASE_MS: parseInt(process.env.SYNTHESIS_BACKOFF_BASE_MS, 10) || 2000
};
