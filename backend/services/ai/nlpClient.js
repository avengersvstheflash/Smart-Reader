/**
 * backend/services/ai/nlpClient.js
 *
 * Client for Python sidecar NLP endpoints (/v1/nlp/split and /v1/nlp/chunk).
 *
 * Invariants:
 * - Node remains sole SQLite writer (zero DB access here).
 * - Dependency-free (native fetch, AbortSignal in Node 22).
 * - Graceful degradation: throws NLP_SIDECAR_UNAVAILABLE when unreachable.
 */

'use strict';

const config = require('../../config');
const { resolveBaseUrl } = require('./sidecarBase');

/**
 * Splits text into sentence spans using the Python sidecar (pysbd).
 *
 * @param {string} text
 * @param {string|{ baseUrl?: string, timeoutMs?: number, language?: string, clean?: boolean }} [options]
 * @returns {Promise<{ sentences: Array<{ text: string, start: number, end: number }>, model: string }>}
 */
async function splitSentences(text, options = {}) {
  const baseUrl = typeof options === 'string' ? options : options?.baseUrl;
  const targetUrl = resolveBaseUrl(baseUrl);
  const timeoutMs = (typeof options === 'object' && options?.timeoutMs)
    ? options.timeoutMs
    : (config.PYTHON_SIDECAR_TIMEOUT_MS || 30000);
  const language = (typeof options === 'object' && options?.language) || 'en';
  const clean = typeof options === 'object' && options?.clean !== undefined ? options.clean : false;

  let res;
  try {
    const signal = AbortSignal.timeout(timeoutMs);
    res = await fetch(`${targetUrl}/v1/nlp/split`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language, clean }),
      signal,
    });
  } catch (err) {
    const unavailableErr = new Error(
      'NLP via the Python sidecar is unavailable. Please ensure the sidecar is running.'
    );
    unavailableErr.code = 'NLP_SIDECAR_UNAVAILABLE';
    unavailableErr.cause = err;
    throw unavailableErr;
  }

  if (res.ok) {
    return await res.json();
  }

  if (res.status >= 500) {
    const err = new Error('NLP sentence split failed in sidecar');
    err.code = 'NLP_PROCESSING_FAILED';
    throw err;
  }

  const err = new Error(`NLP sentence split failed with status ${res.status}`);
  err.code = 'NLP_PROCESSING_FAILED';
  throw err;
}

/**
 * Chunks blocks into token-bounded chunks using the Python sidecar.
 *
 * @param {Array<{ id?: string, text: string }>} blocks
 * @param {string|{ baseUrl?: string, timeoutMs?: number, target_tokens?: number, overlap_tokens?: number }} [options]
 * @returns {Promise<{ chunks: Array<{ id: string, text: string, tokenCount: number, startBlockId?: string, endBlockId?: string }>, model: string }>}
 */
async function chunkBlocks(blocks, options = {}) {
  const baseUrl = typeof options === 'string' ? options : options?.baseUrl;
  const targetUrl = resolveBaseUrl(baseUrl);
  const timeoutMs = (typeof options === 'object' && options?.timeoutMs)
    ? options.timeoutMs
    : (config.PYTHON_SIDECAR_TIMEOUT_MS || 30000);
  const target_tokens = (typeof options === 'object' && options?.target_tokens) || 1500;
  const overlap_tokens = (typeof options === 'object' && options?.overlap_tokens) || 150;

  let res;
  try {
    const signal = AbortSignal.timeout(timeoutMs);
    res = await fetch(`${targetUrl}/v1/nlp/chunk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks, target_tokens, overlap_tokens }),
      signal,
    });
  } catch (err) {
    const unavailableErr = new Error(
      'NLP via the Python sidecar is unavailable. Please ensure the sidecar is running.'
    );
    unavailableErr.code = 'NLP_SIDECAR_UNAVAILABLE';
    unavailableErr.cause = err;
    throw unavailableErr;
  }

  if (res.ok) {
    return await res.json();
  }

  if (res.status >= 500) {
    const err = new Error('NLP chunking failed in sidecar');
    err.code = 'NLP_PROCESSING_FAILED';
    throw err;
  }

  const err = new Error(`NLP chunking failed with status ${res.status}`);
  err.code = 'NLP_PROCESSING_FAILED';
  throw err;
}

module.exports = {
  splitSentences,
  chunkBlocks,
};
