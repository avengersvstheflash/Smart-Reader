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

module.exports = {
  PORT: 3000,
  ROOT_DIR,
  STORAGE_DIR,
  BOOKS_DIR: path.join(STORAGE_DIR, 'books'),
  COVERS_DIR: path.join(STORAGE_DIR, 'covers'),
  PAGES_DIR: path.join(STORAGE_DIR, 'pages'),
  GENERATED_DIR: path.join(STORAGE_DIR, 'generated'),
  DB_PATH: process.env.DB_PATH || path.join(STORAGE_DIR, 'data.db'),
  
  // AI Provider Configuration (strictly safe identifier, never secrets)
  AI_PROVIDER: resolveSafeProvider(process.env.AI_PROVIDER || 'ollama'),
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'llama3',
  OLLAMA_TIMEOUT_MS: parseInt(process.env.OLLAMA_TIMEOUT_MS || '30000', 10),
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || 'deepseek/deepseek-v4-flash',
  OPENROUTER_TIMEOUT_MS: parseInt(process.env.OPENROUTER_TIMEOUT_MS || '30000', 10),
};
