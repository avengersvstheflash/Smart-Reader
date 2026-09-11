const express = require('express');
const aiService = require('../services/ai/aiService');

const router = express.Router();

// GET /api/ai/status - provider health & readiness
router.get('/status', async (req, res) => {
  try {
    const status = await aiService.getStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/mode - switch processing mode (local vs cloud)
router.post('/mode', (req, res) => {
  try {
    const { mode } = req.body;
    if (!mode) {
      return res.status(400).json({ error: 'Processing mode ("local" or "cloud") is required.' });
    }
    const result = aiService.setProcessingMode(mode);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/ai/provider - switch active AI provider (ollama vs gemini)
router.post('/provider', (req, res) => {
  try {
    const { provider } = req.body;
    if (!provider) {
      return res.status(400).json({ error: 'Provider name is required.' });
    }
    aiService.setActiveProvider(provider);
    res.json({
      success: true,
      activeProvider: aiService.activeProviderName,
      activeMode: aiService.activeProviderName === 'ollama' ? 'local' : 'cloud',
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/ai/summarize - summarize arbitrary passage
router.post('/summarize', async (req, res) => {
  const { text, title, provider } = req.body;
  if (!text || text.trim() === '') {
    return res.status(400).json({ error: 'No text provided to summarize.' });
  }

  const targetProvider = provider || aiService.activeProviderName;

  try {
    const result = await aiService.summarizeText(text, title, { provider: targetProvider });
    res.json(result);
  } catch (err) {
    res.status(502).json({
      error: err.message,
      provider: targetProvider,
    });
  }
});

module.exports = router;
