const express = require('express');
const settingsService = require('../services/settings/settingsService');
const { scrubSecret } = settingsService;

const router = express.Router();

// GET /api/settings - retrieve current settings from memory cache
router.get('/', (req, res) => {
  try {
    const settings = settingsService.get();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings - update settings in memory cache & async save to disk
router.put('/', (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Request body must be a JSON object' });
    }
    const updated = settingsService.update(req.body);
    res.json({
      success: true,
      ...updated,
      settings: updated,
    });
  } catch (err) {
    const rawSecret = req.body?.openrouter?.apiKey || req.body?.local?.apiKey;
    res.status(400).json({ error: scrubSecret(err.message, rawSecret) });
  }
});

// POST /api/settings/test-connection - test provider connectivity with key scrubbing
router.post('/test-connection', async (req, res) => {
  const currentSettings = settingsService.get();
  const provider = String(req.body?.provider || currentSettings.aiProvider || 'openrouter').toLowerCase().trim();
  const apiKey = req.body?.apiKey !== undefined
    ? (req.body.apiKey === null ? '' : String(req.body.apiKey).trim())
    : (provider === 'openrouter' ? currentSettings.openrouter?.apiKey : currentSettings.local?.apiKey) || '';
  const model = req.body?.model !== undefined
    ? String(req.body.model).trim()
    : (provider === 'openrouter' ? currentSettings.openrouter?.model : currentSettings.local?.model) || '';
  const baseUrl = (req.body?.baseUrl !== undefined && req.body.baseUrl !== null && String(req.body.baseUrl).trim())
    ? String(req.body.baseUrl).trim()
    : (provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : currentSettings.local?.baseUrl || 'http://127.0.0.1:11434/v1');

  // OpenRouter requires an API key for live inference
  if (provider === 'openrouter' && !apiKey) {
    return res.json({
      success: false,
      latencyMs: 0,
      message: 'API key is required for OpenRouter',
    });
  }

  // Validate baseUrl protocol
  try {
    const parsed = new URL(baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.json({
        success: false,
        latencyMs: 0,
        message: 'Invalid base URL: must use http or https protocol',
      });
    }
  } catch (_) {
    return res.json({
      success: false,
      latencyMs: 0,
      message: 'Invalid base URL',
    });
  }

  const start = Date.now();
  let probeUrl = '';
  const headers = {};

  if (provider === 'openrouter') {
    probeUrl = baseUrl.includes('/models')
      ? baseUrl
      : `${baseUrl.replace(/\/+$/, '')}/models`;
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
  } else {
    // local / ollama
    const cleanBase = baseUrl.replace(/\/+$/, '');
    if (cleanBase.endsWith('/v1')) {
      probeUrl = `${cleanBase}/models`;
    } else {
      probeUrl = `${cleanBase}/v1/models`;
    }
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);

  try {
    // For OpenRouter with apiKey, first validate key authorization via /auth/key
    if (provider === 'openrouter' && apiKey) {
      const authUrl = baseUrl.includes('/v1')
        ? `${baseUrl.replace(/\/models$/, '').replace(/\/+$/, '')}/auth/key`
        : 'https://openrouter.ai/api/v1/auth/key';

      const authRes = await fetch(authUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      if (!authRes.ok) {
        const errBody = await authRes.text().catch(() => '');
        throw new Error(`OpenRouter authorization failed (HTTP ${authRes.status}): ${errBody || authRes.statusText}`);
      }
    }

    let response = await fetch(probeUrl, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    // Fallback for native Ollama without /v1/models
    if (!response.ok && (provider === 'ollama' || provider === 'local') && response.status === 404) {
      const tagsUrl = `${baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '')}/api/tags`;
      const fallbackRes = await fetch(tagsUrl, {
        method: 'GET',
        signal: controller.signal,
      }).catch(() => null);
      if (fallbackRes && fallbackRes.ok) {
        response = fallbackRes;
      }
    }

    clearTimeout(timer);

    const latencyMs = Date.now() - start;

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`Probe returned HTTP ${response.status}: ${errBody || response.statusText}`);
    }

    const data = await response.json().catch(() => ({}));
    const modelList = Array.isArray(data.data)
      ? data.data.map((m) => m.id || m.name)
      : Array.isArray(data.models)
        ? data.models.map((m) => m.name || m.id)
        : [];

    const modelFound = model ? modelList.some((m) => m === model || String(m).startsWith(model)) : true;

    return res.json({
      success: true,
      latencyMs,
      modelFound,
      message: modelFound ? `Connected (${latencyMs}ms)` : `Connected (${latencyMs}ms), target model not in available list`,
      modelsCount: modelList.length,
    });
  } catch (err) {
    clearTimeout(timer);
    const latencyMs = Date.now() - start;
    let rawMsg = err.message || 'Connection test failed';
    if (err.name === 'AbortError') {
      rawMsg = 'Connection timed out after 4000ms';
    }

    let scrubbedMessage = scrubSecret(rawMsg, apiKey);
    if (currentSettings.openrouter?.apiKey) {
      scrubbedMessage = scrubSecret(scrubbedMessage, currentSettings.openrouter.apiKey);
    }
    if (currentSettings.local?.apiKey) {
      scrubbedMessage = scrubSecret(scrubbedMessage, currentSettings.local.apiKey);
    }
    if (process.env.OPENROUTER_API_KEY) {
      scrubbedMessage = scrubSecret(scrubbedMessage, process.env.OPENROUTER_API_KEY);
    }
    if (process.env.LOCAL_API_KEY) {
      scrubbedMessage = scrubSecret(scrubbedMessage, process.env.LOCAL_API_KEY);
    }
    if (req.body?.apiKey) {
      scrubbedMessage = scrubSecret(scrubbedMessage, req.body.apiKey);
    }

    return res.json({
      success: false,
      latencyMs,
      message: scrubbedMessage,
    });
  }
});

// POST /api/settings/reset - clear overrides and reset to .env defaults
router.post('/reset', (req, res) => {
  try {
    const defaults = settingsService.reset();
    res.json({
      success: true,
      ...defaults,
      settings: defaults,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.scrubSecret = scrubSecret;
