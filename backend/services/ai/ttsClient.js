/**
 * backend/services/ai/ttsClient.js
 *
 * Client service for local Kokoro neural text-to-speech synthesis.
 * Handles deterministic sentence hashing, two-level sharded filesystem caching,
 * sidecar readiness/warmup coordination, and atomic audio writes.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../../config');
const { resolveBaseUrl, checkModelReady, warmModel } = require('./sidecarBase');

const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');
const STORAGE_DIR = process.env.STORAGE_DIR || (config && config.STORAGE_DIR) || path.join(ROOT_DIR, 'storage');
const TTS_CACHE_DIR = path.join(STORAGE_DIR, 'tts');

const VOICE_WHITELIST = ['af_heart', 'am_adam', 'bf_alice', 'bm_george'];

/**
 * Computes deterministic SHA-256 digest of normalized sentence tuple.
 * Whitespace variants and citation markers are normalized.
 *
 * @param {string} text
 * @param {string} [voice='af_heart']
 * @param {number} [speed=1.0]
 * @returns {string}
 */
function computeSentenceHash(text, voice = 'af_heart', speed = 1.0) {
  if (!text || typeof text !== 'string') return '';
  const cleaned = text
    .replace(/\s*\[Source \d+\]/g, '')
    .replace(/\s*\(Sources? \d+(?:\s*-\s*\d+)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*\)/g, '')
    .trim()
    .replace(/\s+/g, ' ');
  const normVoice = String(voice || 'af_heart').toLowerCase().trim();
  const normSpeed = Number(speed !== undefined && speed !== null ? speed : 1.0).toFixed(2);
  const payload = `${normVoice}:${normSpeed}:${cleaned}`;
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * Resolves directory and target file path for a cached audio hash.
 * Two-level sharding prevents filesystem directory traversal degradation.
 *
 * @param {string} hash
 * @param {string} [voice='af_heart']
 * @returns {{ dir: string, filePath: string }}
 */
function resolveAudioPath(hash, voice = 'af_heart') {
  const normVoice = String(voice || 'af_heart').toLowerCase().trim();
  const prefix = hash.slice(0, 2);
  const dir = path.join(TTS_CACHE_DIR, normVoice, prefix);
  const filePath = path.join(dir, `${hash}.wav`);
  return { dir, filePath };
}

/**
 * Synthesizes a sentence to 24kHz 16-bit mono WAV audio.
 * Checks local filesystem cache before dispatching to Python sidecar.
 *
 * @param {Object} options
 * @param {string} options.text
 * @param {string} [options.voice='af_heart']
 * @param {number} [options.speed=1.0]
 * @param {number} [options.timeoutMs=30000]
 * @param {string} [options.baseUrl]
 * @returns {Promise<{ hash: string, cached: boolean, filePath: string, durationMs: number, audioUrl: string }>}
 */
async function synthesizeSentence({ text, voice = 'af_heart', speed = 1.0, timeoutMs = 30000, baseUrl } = {}) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    const err = new Error('TTS: text parameter must be a non-empty string');
    err.code = 'INVALID_INPUT';
    err.status = 400;
    throw err;
  }

  const rawVoice = String(voice || 'af_heart').toLowerCase().trim();
  const normVoice = VOICE_WHITELIST.includes(rawVoice) ? rawVoice : 'af_heart';
  const normSpeed = Math.max(0.5, Math.min(2.0, Number(speed !== undefined && speed !== null ? speed : 1.0)));

  const hash = computeSentenceHash(text, normVoice, normSpeed);
  const { dir, filePath } = resolveAudioPath(hash, normVoice);

  // 1. Check local filesystem cache
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    const durationMs = Math.round(Math.max(0, stats.size - 44) / (24000 * 2) * 1000);
    return {
      hash,
      cached: true,
      filePath,
      durationMs,
      audioUrl: `/api/tts/audio/${hash}?voice=${normVoice}`,
    };
  }

  // 2. Prepare destination directory
  fs.mkdirSync(dir, { recursive: true });

  // 3. Coordinate sidecar readiness and warmup lock
  const targetUrl = resolveBaseUrl(baseUrl);
  try {
    const status = await checkModelReady('tts', targetUrl, 1500);
    if (!status.ready && status.state !== 'DOWN') {
      await warmModel('tts', targetUrl, { timeoutMs: 15000 });
    }
  } catch (_) {
    // Non-blocking: fetch will handle connection failure or warming error
  }

  // 4. Request synthesis from sidecar
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${targetUrl}/v1/tts/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voice: normVoice,
        speed: normSpeed,
        format: 'wav',
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      let errJson = {};
      try {
        errJson = await res.json();
      } catch (_) {}
      const err = new Error(errJson.message || `Sidecar TTS returned HTTP ${res.status}`);
      err.code = errJson.code || (res.status === 404 ? 'MODEL_NOT_INSTALLED' : 'TTS_SYNTHESIS_FAILED');
      err.status = res.status;
      throw err;
    }

    // 5. Atomic write to avoid corrupted audio files on crash
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const tempPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
    fs.writeFileSync(tempPath, buffer);
    fs.renameSync(tempPath, filePath);

    const durationMs = Math.round(Math.max(0, buffer.length - 44) / (24000 * 2) * 1000);

    return {
      hash,
      cached: false,
      filePath,
      durationMs,
      audioUrl: `/api/tts/audio/${hash}?voice=${normVoice}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Removes all files and directories in the TTS audio cache.
 *
 * @returns {{ cleared: boolean, freedBytes: number }}
 */
function clearCache() {
  if (!fs.existsSync(TTS_CACHE_DIR)) {
    return { cleared: true, freedBytes: 0 };
  }
  let freedBytes = 0;
  function walkAndUnlink(dir) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkAndUnlink(fullPath);
        try {
          fs.rmdirSync(fullPath);
        } catch (_) {}
      } else {
        try {
          const stats = fs.statSync(fullPath);
          freedBytes += stats.size;
          fs.unlinkSync(fullPath);
        } catch (_) {}
      }
    }
  }
  walkAndUnlink(TTS_CACHE_DIR);
  return { cleared: true, freedBytes };
}

/**
 * Returns summary metrics of the current TTS cache.
 *
 * @returns {{ totalFiles: number, totalBytes: number }}
 */
function getCacheStats() {
  if (!fs.existsSync(TTS_CACHE_DIR)) {
    return { totalFiles: 0, totalBytes: 0 };
  }
  let totalFiles = 0;
  let totalBytes = 0;
  function walk(dir) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.wav')) {
        totalFiles++;
        try {
          totalBytes += fs.statSync(fullPath).size;
        } catch (_) {}
      }
    }
  }
  walk(TTS_CACHE_DIR);
  return { totalFiles, totalBytes };
}

/**
 * Probes the sidecar's GET /v1/tts/status endpoint and combines with cache statistics.
 *
 * @param {Object} [options]
 * @param {string} [options.baseUrl]
 * @returns {Promise<Object>}
 */
async function getStatus({ baseUrl } = {}) {
  const targetUrl = resolveBaseUrl(baseUrl);
  const cacheStats = getCacheStats();
  try {
    const signal = AbortSignal.timeout(2000);
    const res = await fetch(`${targetUrl}/v1/tts/status`, { signal });
    if (res.ok) {
      const body = await res.json();
      return {
        ...body,
        cache: cacheStats,
      };
    }
  } catch (_) {}
  return {
    ready: false,
    modelState: 'DOWN',
    installed: false,
    voices: VOICE_WHITELIST,
    cache: cacheStats,
  };
}

module.exports = {
  computeSentenceHash,
  resolveAudioPath,
  synthesizeSentence,
  clearCache,
  getCacheStats,
  getStatus,
  TTS_CACHE_DIR,
  VOICE_WHITELIST,
};

