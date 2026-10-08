/**
 * backend/services/ai/embedClient.js
 */

'use strict';

const config = require('../../config');
const { resolveBaseUrl } = require('./sidecarBase');

const DEFAULT_BATCH_SIZE = 75;
const WARMING_RETRY_INTERVALS_MS = [2000, 4000, 8000];

async function embedBatch(texts, options = {}) {
  if (!Array.isArray(texts) || texts.length === 0) {
    return Object.assign([], {
      status: 'success',
      embeddings: [],
      model: 'bge-m3-python-fp32',
      dims: 1024,
    });
  }

  const baseUrl = typeof options === 'string' ? options : options?.baseUrl;
  const targetUrl = resolveBaseUrl(baseUrl);
  const timeoutMs = (typeof options === 'object' && options?.timeoutMs)
    ? options.timeoutMs
    : (config.PYTHON_SIDECAR_TIMEOUT_MS || 30000);
  const retryIntervals = (typeof options === 'object' && options?.retryIntervals)
    ? options.retryIntervals
    : WARMING_RETRY_INTERVALS_MS;
  const maxRetries = (typeof options === 'object' && options?.maxWarmingRetries !== undefined)
    ? options.maxWarmingRetries
    : retryIntervals.length;
  const batchSize = (typeof options === 'object' && options?.batchSize)
    ? options.batchSize
    : DEFAULT_BATCH_SIZE;

  const allEmbeddings = [];
  let lastModel = 'bge-m3-python-fp32';
  let lastDims = 1024;

  for (let i = 0; i < texts.length; i += batchSize) {
    const chunkTexts = texts.slice(i, i + batchSize);
    let attempt = 0;

    while (true) {
      let res;
      try {
        const signal = AbortSignal.timeout(timeoutMs);
        res = await fetch(`${targetUrl}/v1/embed/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texts: chunkTexts }),
          signal,
        });
      } catch (err) {
        const isReset =
          err?.code === 'ECONNRESET' ||
          err?.cause?.code === 'ECONNRESET' ||
          (typeof err?.message === 'string' && err.message.includes('ECONNRESET')) ||
          (typeof err?.cause?.message === 'string' && err.cause.message.includes('ECONNRESET'));

        if (isReset && attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, retryIntervals[attempt]));
          attempt++;
          continue;
        }

        const unavailableErr = new Error(
          'Embedding model via the Python sidecar is unavailable. Please ensure the sidecar is running.'
        );
        unavailableErr.code = 'EMBED_MODEL_UNAVAILABLE';
        unavailableErr.cause = err;
        throw unavailableErr;
      }

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.embeddings)) {
          for (let k = 0; k < data.embeddings.length; k++) {
            allEmbeddings.push(data.embeddings[k]);
          }
        }
        if (data.model) lastModel = data.model;
        if (data.dims) lastDims = data.dims;
        break;
      }

      if (res.status === 503) {
        let isWarming = true;
        try {
          const body = await res.json();
          if (body.code !== undefined && body.code !== 'EMBED_MODEL_WARMING') {
            isWarming = false;
          }
        } catch (_) {
          // If we fail to parse, assume it's still warming since status was 503
        }
        if (isWarming) {
          if (attempt < maxRetries) {
            await new Promise((r) => setTimeout(r, retryIntervals[attempt]));
            attempt++;
            continue;
          } else {
            const err = new Error('Embedding model is still warming up after max retries');
            err.code = 'EMBED_MODEL_WARMING';
            throw err;
          }
        }
      }

      if (res.status >= 500) {
        const err = new Error('Embedding computation failed in sidecar');
        err.code = 'EMBED_PROCESSING_FAILED';
        throw err;
      }

      const err = new Error(`Embedding computation failed with status ${res.status}`);
      err.code = 'EMBED_PROCESSING_FAILED';
      throw err;
    }
  }

  return Object.assign([...allEmbeddings], {
    status: 'success',
    embeddings: allEmbeddings,
    model: lastModel,
    dims: lastDims,
  });
}

module.exports = {
  embedBatch,
  WARMING_RETRY_INTERVALS_MS,
};
