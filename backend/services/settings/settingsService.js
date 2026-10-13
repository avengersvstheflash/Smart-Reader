const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(ROOT_DIR, 'storage');

// Lightweight .env loader if process.env was not populated yet
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

function getEnvDefaults() {
  const envAiProvider = String(process.env.AI_PROVIDER || 'ollama').toLowerCase().trim();
  let defaultProvider = 'ollama';
  if (envAiProvider.includes('openrouter')) {
    defaultProvider = 'openrouter';
  } else if (envAiProvider.includes('ollama') || envAiProvider === 'local') {
    defaultProvider = envAiProvider === 'local' ? 'local' : 'ollama';
  }

  const rawImportSize = parseInt(process.env.IMPORT_MAX_SIZE_MB || '50', 10);
  const clampedImportSize = isNaN(rawImportSize) ? 50 : Math.min(200, Math.max(50, rawImportSize));

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    aiProvider: defaultProvider,
    openrouter: {
      apiKey: process.env.OPENROUTER_API_KEY || '',
      model: process.env.OPENROUTER_MODEL || 'deepseek/deepseek-v4-flash',
      timeoutMs: parseInt(process.env.OPENROUTER_TIMEOUT_MS || '30000', 10),
    },
    local: {
      preset: 'ollama',
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
      model: process.env.OLLAMA_MODEL || 'llama3',
      apiKey: process.env.LOCAL_API_KEY || '',
      timeoutMs: parseInt(process.env.OLLAMA_TIMEOUT_MS || '30000', 10),
    },
    importMaxSizeMB: clampedImportSize,
    parallelBookSynthesis: false,
  };
}

function mergeWithDefaults(saved, defaults) {
  return {
    version: saved.version || defaults.version,
    updatedAt: saved.updatedAt || defaults.updatedAt,
    aiProvider: saved.aiProvider || defaults.aiProvider,
    openrouter: {
      ...defaults.openrouter,
      ...(saved.openrouter || {}),
    },
    local: {
      ...defaults.local,
      ...(saved.local || {}),
    },
    importMaxSizeMB: typeof saved.importMaxSizeMB === 'number'
      ? Math.min(200, Math.max(50, saved.importMaxSizeMB))
      : defaults.importMaxSizeMB,
    parallelBookSynthesis: typeof saved.parallelBookSynthesis === 'boolean'
      ? saved.parallelBookSynthesis
      : (defaults.parallelBookSynthesis ?? false),
  };
}

function cleanOllamaBaseUrl(url) {
  if (!url || typeof url !== 'string') return url;
  return url.trim().replace(/\/+$/, '').replace(/\/v1$/, '');
}

function notifyAiProviders(settings) {
  try {
    const aiService = require('../ai/aiService');
    if (aiService && aiService.providers) {
      const ollama = aiService.providers.get('ollama');
      if (ollama) {
        if (settings.local?.baseUrl) ollama.baseUrl = cleanOllamaBaseUrl(settings.local.baseUrl);
        if (settings.local?.model) ollama.model = settings.local.model;
        if (settings.local?.timeoutMs) ollama.timeoutMs = settings.local.timeoutMs;
      }
      const openrouter = aiService.providers.get('openrouter');
      if (openrouter) {
        if (settings.openrouter?.apiKey !== undefined) openrouter.apiKey = settings.openrouter.apiKey;
        if (settings.openrouter?.model) openrouter.model = settings.openrouter.model;
        if (settings.openrouter?.timeoutMs) openrouter.timeoutMs = settings.openrouter.timeoutMs;
      }
      if (settings.aiProvider) {
        const resolved = aiService.resolveModeToProvider(settings.aiProvider);
        if (aiService.providers.has(resolved)) {
          aiService.activeProviderName = resolved;
          if (resolved === 'openrouter' || resolved === 'gemini') {
            aiService.activeCloudProvider = resolved;
          }
        }
      }
    }
  } catch (_) {
    // aiService may not be loaded yet or running in isolated unit test
  }
}

function scrubSecret(message, secret) {
  if (!secret || typeof message !== 'string') return message;
  const raw = String(secret);
  if (!raw) return message;
  let result = message.split(raw).join('[REDACTED]');
  const trimmed = raw.trim();
  if (trimmed && trimmed !== raw) {
    result = result.split(trimmed).join('[REDACTED]');
  }
  try {
    const encoded = encodeURIComponent(trimmed || raw);
    if (encoded && encoded !== raw && encoded !== trimmed) {
      result = result.split(encoded).join('[REDACTED]');
    }
  } catch (_) {}
  return result;
}

function writeAtomicSync(filePath, data) {
  const content = JSON.stringify(data, null, 2);
  const tempFile = `${filePath}.tmp.${Date.now()}`;
  try {
    fs.writeFileSync(tempFile, content, 'utf8');
    try {
      fs.renameSync(tempFile, filePath);
    } catch (_) {
      // Fallback on Windows if atomic rename is blocked
      fs.writeFileSync(filePath, content, 'utf8');
      try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (_) {}
    }
  } catch (err) {
    console.error('[Settings] Failed to write settings.json:', err.message);
    try {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    } catch (_) {}
  }
}

class SettingsService {
  constructor() {
    this.storagePath = process.env.SETTINGS_FILE_PATH || path.join(STORAGE_DIR, 'settings.json');
    this.cachedSettings = null;
    this.sequence = 0;
    this.writePromise = Promise.resolve();
    this.init();
  }

  getFilePath() {
    return this.storagePath;
  }

  setFilePath(filePath) {
    this.storagePath = filePath;
  }

  init(options = {}) {
    if (options.filePath) {
      this.storagePath = options.filePath;
    }

    const dir = path.dirname(this.storagePath);
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (_) {}
    }

    const defaults = getEnvDefaults();

    if (!fs.existsSync(this.storagePath) || options.force) {
      this.cachedSettings = defaults;
      writeAtomicSync(this.storagePath, defaults);
    } else {
      try {
        const raw = fs.readFileSync(this.storagePath, 'utf8');
        const parsed = JSON.parse(raw);
        this.cachedSettings = mergeWithDefaults(parsed, defaults);
      } catch (err) {
        console.warn('[Settings] Failed to parse settings.json, falling back to defaults:', err.message);
        this.cachedSettings = defaults;
      }
    }

    return this.cachedSettings;
  }

  get() {
    if (!this.cachedSettings) {
      this.init();
    }
    return {
      ...this.cachedSettings,
      openrouter: { ...(this.cachedSettings.openrouter || {}) },
      local: { ...(this.cachedSettings.local || {}) },
    };
  }

  update(payload = {}) {
    if (!this.cachedSettings) {
      this.init();
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('Payload must be a JSON object');
    }

    // Validation
    if (payload.aiProvider !== undefined) {
      const provider = String(payload.aiProvider).trim().toLowerCase();
      if (!['openrouter', 'ollama', 'local'].includes(provider)) {
        throw new Error("Invalid aiProvider. Must be one of: 'openrouter', 'ollama', 'local'");
      }
    }

    if (payload.openrouter !== undefined) {
      if (typeof payload.openrouter !== 'object' || payload.openrouter === null || Array.isArray(payload.openrouter)) {
        throw new Error('openrouter must be an object');
      }
      if (payload.openrouter.model !== undefined) {
        if (typeof payload.openrouter.model !== 'string' || !payload.openrouter.model.trim()) {
          throw new Error('openrouter.model must be a non-empty string');
        }
      }
    }

    if (payload.local !== undefined) {
      if (typeof payload.local !== 'object' || payload.local === null || Array.isArray(payload.local)) {
        throw new Error('local must be an object');
      }
      if (payload.local.baseUrl !== undefined) {
        if (typeof payload.local.baseUrl !== 'string' || !payload.local.baseUrl.trim()) {
          throw new Error('local.baseUrl must be a valid URL string');
        }
        try {
          const parsed = new URL(payload.local.baseUrl.trim());
          if (!['http:', 'https:'].includes(parsed.protocol)) {
            throw new Error('local.baseUrl must use http or https protocol');
          }
        } catch (e) {
          throw new Error('local.baseUrl must be a valid URL');
        }
      }
    }

    if (payload.parallelBookSynthesis !== undefined) {
      if (typeof payload.parallelBookSynthesis !== 'boolean') {
        throw new Error('parallelBookSynthesis must be a boolean');
      }
    }

    const updated = {
      ...this.cachedSettings,
      version: 1,
      updatedAt: new Date().toISOString(),
    };

    if (payload.aiProvider !== undefined) {
      updated.aiProvider = String(payload.aiProvider).trim().toLowerCase();
    }

    if (payload.parallelBookSynthesis !== undefined) {
      updated.parallelBookSynthesis = Boolean(payload.parallelBookSynthesis);
    }

    if (payload.importMaxSizeMB !== undefined) {
      const parsed = parseInt(payload.importMaxSizeMB, 10);
      if (isNaN(parsed)) {
        updated.importMaxSizeMB = this.cachedSettings.importMaxSizeMB || 50;
      } else {
        updated.importMaxSizeMB = Math.min(200, Math.max(50, parsed));
      }
    }

    if (payload.openrouter) {
      updated.openrouter = {
        ...this.cachedSettings.openrouter,
        ...payload.openrouter,
      };
      if (payload.openrouter.model !== undefined) {
        updated.openrouter.model = String(payload.openrouter.model).trim();
      }
      if (payload.openrouter.apiKey !== undefined) {
        updated.openrouter.apiKey = payload.openrouter.apiKey === null ? '' : String(payload.openrouter.apiKey).trim();
      }
      if (payload.openrouter.timeoutMs !== undefined) {
        updated.openrouter.timeoutMs = parseInt(payload.openrouter.timeoutMs, 10) || 30000;
      }
    }

    if (payload.local) {
      updated.local = {
        ...this.cachedSettings.local,
        ...payload.local,
      };
      if (payload.local.baseUrl !== undefined) {
        updated.local.baseUrl = String(payload.local.baseUrl).trim();
      }
      if (payload.local.apiKey !== undefined) {
        updated.local.apiKey = payload.local.apiKey === null ? '' : String(payload.local.apiKey).trim();
      }
      if (payload.local.timeoutMs !== undefined) {
        updated.local.timeoutMs = parseInt(payload.local.timeoutMs, 10) || 30000;
      }
    }

    // 1. Immediately update in-memory cache (Zero-I/O runtime read path)
    this.cachedSettings = updated;
    this.sequence += 1;
    const currentSeq = this.sequence;

    // 2. Notify AI providers synchronously
    notifyAiProviders(this.cachedSettings);

    // 3. Persist asynchronously to disk with atomic write and sequence protection
    const filePath = this.storagePath;
    const content = JSON.stringify(updated, null, 2);
    const tempFile = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;

    this.writePromise = this.writePromise
      .then(async () => {
        if (this.sequence !== currentSeq) {
          // Newer write has superseded this one
          return;
        }
        try {
          await fs.promises.writeFile(tempFile, content, 'utf8');
          if (this.sequence !== currentSeq) {
            try { if (fs.existsSync(tempFile)) await fs.promises.unlink(tempFile); } catch (_) {}
            return;
          }
          try {
            await fs.promises.rename(tempFile, filePath);
          } catch (_) {
            // Windows fallback if rename is blocked
            await fs.promises.writeFile(filePath, content, 'utf8');
            try { if (fs.existsSync(tempFile)) await fs.promises.unlink(tempFile); } catch (_) {}
          }
        } catch (err) {
          console.error('[Settings] Asynchronous save to settings.json failed:', err.message);
          try {
            if (fs.existsSync(tempFile)) await fs.promises.unlink(tempFile);
          } catch (_) {}
        }
      })
      .catch(() => {});

    return this.get();
  }

  reset() {
    const defaults = getEnvDefaults();
    this.cachedSettings = defaults;
    this.sequence += 1;

    notifyAiProviders(this.cachedSettings);
    writeAtomicSync(this.storagePath, defaults);

    return this.get();
  }
}

const instance = new SettingsService();

module.exports = instance;
module.exports.SettingsService = SettingsService;
module.exports.scrubSecret = scrubSecret;
module.exports.getEnvDefaults = getEnvDefaults;

