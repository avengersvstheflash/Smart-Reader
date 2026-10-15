/**
 * backend/routes/ttsRoutes.js
 *
 * REST API routes for Kokoro TTS synthesis, audio retrieval, cache management,
 * and engine health inspection.
 */

'use strict';

const express = require('express');
const fs = require('fs');
const router = express.Router();
const ttsClient = require('../services/ai/ttsClient');

const HASH_REGEX = /^[a-f0-9]{64}$/;

/**
 * POST /api/tts/synthesize
 * Body: { text: string, voice?: string, speed?: number }
 * Returns: { hash, cached, durationMs, audioUrl }
 */
router.post('/synthesize', async (req, res, next) => {
  const { text, voice, speed } = req.body || {};
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({
      error: 'text parameter is required and must be a non-empty string',
      code: 'INVALID_INPUT',
    });
  }

  try {
    const result = await ttsClient.synthesizeSentence({ text, voice, speed });
    return res.json({
      hash: result.hash,
      cached: result.cached,
      durationMs: result.durationMs,
      audioUrl: result.audioUrl,
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({
      error: err.message || 'TTS synthesis failed',
      code: err.code || 'TTS_SYNTHESIS_FAILED',
    });
  }
});

/**
 * GET /api/tts/audio/:hash
 * Query: ?voice=af_heart
 * Serves 24kHz 16-bit mono WAV file with static cache headers.
 */
router.get('/audio/:hash', (req, res) => {
  const { hash } = req.params;
  if (!hash || !HASH_REGEX.test(hash)) {
    return res.status(400).json({
      error: 'Invalid hash format. Expected 64-character lowercase hexadecimal SHA-256 digest.',
      code: 'INVALID_HASH',
    });
  }

  const voice = req.query.voice || 'af_heart';
  const { filePath } = ttsClient.resolveAudioPath(hash, voice);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      error: 'Audio file not found in cache.',
      code: 'AUDIO_NOT_FOUND',
    });
  }

  res.set('Content-Type', 'audio/wav');
  res.set('Accept-Ranges', 'bytes');
  res.set('Cache-Control', 'public, max-age=31536000, immutable');

  return res.sendFile(filePath);
});

/**
 * GET /api/tts/status
 * Reports sidecar readiness, model state, installed voices, and cache footprint.
 */
router.get('/status', async (req, res) => {
  const status = await ttsClient.getStatus();
  return res.json(status);
});

/**
 * POST /api/tts/cache/clear
 * Flushes all cached WAV audio files.
 */
router.post('/cache/clear', (req, res) => {
  try {
    const result = ttsClient.clearCache();
    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      error: err.message || 'Failed to clear TTS cache',
      code: 'CACHE_CLEAR_FAILED',
    });
  }
});

module.exports = router;

