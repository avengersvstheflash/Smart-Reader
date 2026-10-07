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


async function sliceSections(sections, options = {}) {
  const baseUrl = typeof options === 'string' ? options : options?.baseUrl;
  const targetUrl = resolveBaseUrl(baseUrl);
  const timeoutMs = (typeof options === 'object' && options?.timeoutMs) ? options.timeoutMs : 30000;
  let res;
  try {
    const signal = AbortSignal.timeout(timeoutMs);
    res = await fetch(targetUrl + '/v1/nlp/slice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sections }),
      signal,
    });
  } catch (err) {
    const unavailableErr = new Error('NLP via the Python sidecar is unavailable.');
    unavailableErr.code = 'NLP_SIDECAR_UNAVAILABLE';
    unavailableErr.cause = err;
    throw unavailableErr;
  }
  if (res.ok) return await res.json();
  const err = new Error('NLP slicing failed');
  err.code = 'NLP_PROCESSING_FAILED';
  throw err;
}


/**
 * Reranks candidate chunks for a query using the Python sidecar (BGE reranker).
 *
 * @param {string} query
 * @param {Array<{ id: string, text: string }>} candidates
 * @param {string|{ baseUrl?: string, timeoutMs?: number }} [options]
 * @returns {Promise<{ scores: Array<{ id: string, score: number }>, model: string }>}
 */
async function rerankCandidates(query, candidates, options = {}) {
  const baseUrl = typeof options === 'string' ? options : options?.baseUrl;
  const targetUrl = resolveBaseUrl(baseUrl);
  const timeoutMs = (typeof options === 'object' && options?.timeoutMs)
    ? options.timeoutMs
    : (config.PYTHON_SIDECAR_TIMEOUT_MS || 60000);

  let res;
  try {
    const signal = AbortSignal.timeout(timeoutMs);
    res = await fetch(`${targetUrl}/v1/nlp/rerank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, candidates }),
      signal,
    });
  } catch (err) {
    // 5.8.0i: distinguish a timeout from an unreachable sidecar.
    // AbortSignal.timeout throws a DOMException named 'TimeoutError' on
    // modern Node, or an AbortError depending on the fetch implementation.
    // Wrapping with a cause chain means the inner error may also carry
    // the signal. Check all three surfaces.
    const isTimeout = Boolean(
      err && (
        err.name === 'TimeoutError' ||
        err.name === 'AbortError' ||
        (err.cause && err.cause.name === 'TimeoutError')
      )
    );
    if (isTimeout) {
      const timeoutErr = new Error(
        `NLP reranker timed out after ${timeoutMs}ms (sidecar may be warming or slow)`
      );
      timeoutErr.code = 'NLP_SIDECAR_TIMEOUT';
      timeoutErr.cause = err;
      throw timeoutErr;
    }
    const unavailableErr = new Error(
      'NLP reranker via the Python sidecar is unavailable. Please ensure the sidecar is running.'
    );
    unavailableErr.code = 'NLP_SIDECAR_UNAVAILABLE';
    unavailableErr.cause = err;
    throw unavailableErr;
  }

  if (res.ok) {
    return await res.json();
  }

  if (res.status === 503) {
    let body = {};
    try {
      body = await res.json();
    } catch (_) {}
    if (body.code === 'RERANKER_WARMING') {
      const warmingErr = new Error('Reranker model is still warming up');
      warmingErr.code = 'RERANKER_WARMING';
      throw warmingErr;
    }
  }

  if (res.status >= 500) {
    const err = new Error('NLP reranker failed in sidecar');
    err.code = 'NLP_PROCESSING_FAILED';
    throw err;
  }

  const err = new Error(`NLP reranker failed with status ${res.status}`);
  err.code = 'NLP_PROCESSING_FAILED';
  throw err;
}

/**
 * Reranks candidate chunks in batches using the Python sidecar /v1/nlp/rerank-batch endpoint.
 *
 * @param {string} query
 * @param {Array<{ id: string, text: string }>} candidates
 * @param {string|{ baseUrl?: string, timeoutMs?: number, chunkSize?: number, batchSize?: number, top_k?: number }} [options]
 * @returns {Promise<{ scores: Array<{ id: string, score: number }>, model?: string, warning?: string|null }>}
 */
async function rerankCandidatesBatch(query, candidates, options = {}) {
  if (!candidates || candidates.length === 0) {
    return {
      scores: [],
      warning: null,
      model: 'bge-reranker-v2-m3',
    };
  }

  const baseUrl = typeof options === 'string' ? options : options?.baseUrl;
  const targetUrl = resolveBaseUrl(baseUrl);
  const timeoutMs = (typeof options === 'object' && options?.timeoutMs)
    ? options.timeoutMs
    : (config.PYTHON_SIDECAR_TIMEOUT_MS || 60000);
  const chunkSize = (typeof options === 'object' && (options?.chunkSize || options?.batchSize))
    ? (options.chunkSize || options.batchSize)
    : 75;

  const slices = [];
  for (let i = 0; i < candidates.length; i += chunkSize) {
    slices.push(candidates.slice(i, i + chunkSize));
  }

  const allScores = [];
  let modelName = 'bge-reranker-v2-m3';

  for (const slice of slices) {
    let res;
    try {
      const signal = AbortSignal.timeout(timeoutMs);
      res = await fetch(`${targetUrl}/v1/nlp/rerank-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          candidates: slice,
          top_k: options?.top_k,
        }),
        signal,
      });
    } catch (err) {
      const isTimeout = Boolean(
        err && (
          err.name === 'TimeoutError' ||
          err.name === 'AbortError' ||
          (err.cause && err.cause.name === 'TimeoutError')
        )
      );
      if (isTimeout) {
        const timeoutErr = new Error(
          `NLP batch reranker timed out after ${timeoutMs}ms (sidecar may be warming or slow)`
        );
        timeoutErr.code = 'NLP_SIDECAR_TIMEOUT';
        timeoutErr.cause = err;
        throw timeoutErr;
      }
      const unavailableErr = new Error(
        'NLP reranker via the Python sidecar is unavailable. Please ensure the sidecar is running.'
      );
      unavailableErr.code = 'NLP_SIDECAR_UNAVAILABLE';
      unavailableErr.cause = err;
      throw unavailableErr;
    }

    if (res.status === 503) {
      let body = {};
      try {
        body = await res.json();
      } catch (_) {}
      const warmingErr = new Error(
        body.message || 'Reranker model is still warming up'
      );
      warmingErr.code = 'RERANKER_WARMING';
      throw warmingErr;
    }

    if (!res.ok) {
      const err = new Error(
        res.status >= 500
          ? 'NLP batch reranker failed in sidecar'
          : `NLP batch reranker failed with status ${res.status}`
      );
      err.code = 'NLP_PROCESSING_FAILED';
      throw err;
    }

    const data = await res.json();
    if (data.model) modelName = data.model;
    if (Array.isArray(data.scores)) {
      allScores.push(...data.scores);
    }
  }

  return {
    scores: allScores,
    warning: null,
    model: modelName,
  };
}

/**
 * Reranks multiple batches of query+candidates in chunks of 20 batches per HTTP call.
 *
 * @param {Array<{ id: string, query: string, candidates: Array<{ id: string, text: string }> }>} batches
 * @param {string|{ baseUrl?: string, timeoutMs?: number, chunkSize?: number, batchSize?: number }} [options]
 * @returns {Promise<{ results: Array<{ id: string, scores: Array<{ id: string, score: number }> }>, warning: string|null, model?: string }>}
 */
async function rerankBatchMulti(batches, options = {}) {
  if (!batches || batches.length === 0) {
    return {
      results: [],
      warning: null,
      model: 'bge-reranker-v2-m3',
    };
  }

  const baseUrl = typeof options === 'string' ? options : options?.baseUrl;
  const targetUrl = resolveBaseUrl(baseUrl);
  const timeoutMs = (typeof options === 'object' && options?.timeoutMs)
    ? options.timeoutMs
    : (config.PYTHON_SIDECAR_TIMEOUT_MS || 60000);
  const chunkSize = (typeof options === 'object' && (options?.chunkSize || options?.batchSize))
    ? (options.chunkSize || options.batchSize)
    : 20;

  const slices = [];
  for (let i = 0; i < batches.length; i += chunkSize) {
    slices.push(batches.slice(i, i + chunkSize));
  }

  const allResults = [];
  let modelName = 'bge-reranker-v2-m3';

  for (const slice of slices) {
    let res;
    try {
      const signal = AbortSignal.timeout(timeoutMs);
      res = await fetch(`${targetUrl}/v1/nlp/rerank-batch-multi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batches: slice,
        }),
        signal,
      });
    } catch (err) {
      const isTimeout = Boolean(
        err && (
          err.name === 'TimeoutError' ||
          err.name === 'AbortError' ||
          (err.cause && err.cause.name === 'TimeoutError')
        )
      );
      if (isTimeout) {
        const timeoutErr = new Error(
          `NLP multi-batch reranker timed out after ${timeoutMs}ms (sidecar may be warming or slow)`
        );
        timeoutErr.code = 'NLP_SIDECAR_TIMEOUT';
        timeoutErr.cause = err;
        throw timeoutErr;
      }
      const unavailableErr = new Error(
        'NLP reranker via the Python sidecar is unavailable. Please ensure the sidecar is running.'
      );
      unavailableErr.code = 'NLP_SIDECAR_UNAVAILABLE';
      unavailableErr.cause = err;
      throw unavailableErr;
    }

    if (res.status === 503) {
      let body = {};
      try {
        body = await res.json();
      } catch (_) {}
      const warmingErr = new Error(
        body.message || 'Reranker model is still warming up'
      );
      warmingErr.code = 'RERANKER_WARMING';
      throw warmingErr;
    }

    if (!res.ok) {
      const err = new Error(
        res.status >= 500
          ? 'NLP multi-batch reranker failed in sidecar'
          : `NLP multi-batch reranker failed with status ${res.status}`
      );
      err.code = 'NLP_PROCESSING_FAILED';
      throw err;
    }

    const data = await res.json();
    if (data.model) modelName = data.model;
    if (Array.isArray(data.results)) {
      allResults.push(...data.results);
    }
  }

  return {
    results: allResults,
    warning: null,
    model: modelName,
  };
}

module.exports = {
  sliceSections,
  splitSentences,
  chunkBlocks,
  rerankCandidates,
  rerankCandidatesBatch,
  rerankBatchMulti,
};