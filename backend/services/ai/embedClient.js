/**
 * backend/services/ai/embedClient.js
 */

'use strict';

const config = require('../../config');
const { resolveBaseUrl, waitForReady, warmModel, checkModelReady } = require('./sidecarBase');

const DEFAULT_BATCH_SIZE = process.env.EMBED_BATCH_SIZE ? parseInt(process.env.EMBED_BATCH_SIZE, 10) : 16;
const WARMING_RETRY_INTERVALS_MS = [
  2000, 4000, 8000, 10000, 15000, 20000, 20000, 20000, 20000, 20000, 20000, 20000
];

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
    : (config.PYTHON_SIDECAR_TIMEOUT_MS || 90000);
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

  const readyWaitMs = (typeof options === 'object' && options?.timeoutMs) ? options.timeoutMs : 90000;
  const isReady = (readyWaitMs !== 90000)
    ? await waitForReady(targetUrl, readyWaitMs)
    : await waitForReady(targetUrl, 90000);

  if (!isReady) {
    const unavailableErr = new Error(
      `Python sidecar is not available at ${targetUrl}: server not ready within ${readyWaitMs}ms`
    );
    unavailableErr.code = 'EMBED_MODEL_UNAVAILABLE';
    throw unavailableErr;
  }

  // Proactively warm embed model if unloaded/idle, respecting backpressure
  try {
    const embedStatus = await checkModelReady('embed', targetUrl, 2000);
    if (embedStatus.state === 'LOADED' && embedStatus.in_flight >= 4) {
      await new Promise((r) => setTimeout(r, 400 + Math.random() * 400));
      await checkModelReady('embed', targetUrl, 2000);
    } else if (!embedStatus.ready && embedStatus.state !== 'DOWN') {
      await warmModel('embed', targetUrl, { timeoutMs });
    }
  } catch (_warmErr) {
    // Non-blocking: batch fetch loop handles on-demand loading or retry
  }

  const totalBatches = Math.ceil(texts.length / batchSize);
  const embedStartTime = Date.now();
  if (totalBatches > 1) {
    console.log(
      `[Embed] Starting embedding for ${texts.length} chunks across ${totalBatches} batches (batchSize=${batchSize})...`
    );
  }

  for (let i = 0; i < texts.length; i += batchSize) {
    const chunkTexts = texts.slice(i, i + batchSize);
    const batchIndex = Math.floor(i / batchSize) + 1;
    const batchT0 = Date.now();
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

        if (totalBatches > 1) {
          const batchSec = (Date.now() - batchT0) / 1000;
          const elapsedSec = (Date.now() - embedStartTime) / 1000;
          const avgSec = elapsedSec / batchIndex;
          const remaining = totalBatches - batchIndex;
          const etaSec = Math.round(avgSec * remaining);
          console.log(
            `[Embed] Batch ${batchIndex}/${totalBatches} complete (${chunkTexts.length} chunks in ${batchSec.toFixed(2)}s) | Elapsed: ${elapsedSec.toFixed(1)}s | ETA: ${etaSec}s`
          );
        }
        break;
      }


      if (res.status === 503) {
        let isWarming = true;
        let bodyCode = null;
        try {
          const body = await res.json();
          bodyCode = body.code;
          if (body.code !== undefined && body.code !== 'EMBED_MODEL_WARMING' && body.code !== 'MODEL_WARMING') {
            isWarming = false;
          }
        } catch (_) { }
        if (isWarming) {
          // Trigger warming in case model was in UNLOADED state
          warmModel('embed', targetUrl, { fireAndForget: true }).catch(() => {});

          // Actively wait for embed model to transition out of LOADING/UNLOADED before retrying this specific batch
          const waitStartTime = Date.now();
          const maxWaitMs = timeoutMs || 180000;
          let modelReady = false;

          while (Date.now() - waitStartTime < maxWaitMs && attempt < maxRetries) {
            const delay = retryIntervals[attempt] !== undefined ? retryIntervals[attempt] : 2000;
            await new Promise((r) => setTimeout(r, delay));
            attempt++;

            try {
              const status = await checkModelReady('embed', targetUrl, 2000);
              if (status.state === 'LOADED') {
                modelReady = true;
                break;
              }
            } catch (_) {
              // Sidecar may be briefly unreachable or busy
            }
          }

          if (modelReady || attempt < maxRetries) {
            continue; // Retry this specific batch now that model is ready
          }

          const err = new Error('Embedding model is still warming up');
          err.code = 'EMBED_MODEL_WARMING';
          throw err;
        } else {
          console.error(`[embedClient] 503 but not warming! code=${bodyCode}`);
        }
      }

      if (res.status >= 500) {
        console.error(`[embedClient] 500+ error: status=${res.status}`);
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
