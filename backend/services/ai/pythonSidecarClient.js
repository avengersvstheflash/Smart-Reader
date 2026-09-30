/**
 * backend/services/ai/pythonSidecarClient.js
 *
 * Node-side interface to the Python sidecar process.
 * Provides OCR capabilities for scanned/image-only PDFs via FastAPI + PaddleOCR.
 *
 * Invariants:
 * - Node remains sole SQLite writer (zero DB access here).
 * - Dependency-free (uses native global fetch, FormData, Blob, AbortSignal in Node 22).
 * - Configuration derived from backend/config.js (never hardcoded localhost:8765).
 */

'use strict';

const config = require('../../config');

const DEFAULT_MAX_WAIT_MS = 60000;

/**
 * Resolves the effective base URL for the sidecar service.
 * Respects explicit parameter, environment override, and config default in order.
 * @param {string} [baseUrl]
 * @returns {string}
 */
function resolveBaseUrl(baseUrl) {
  return baseUrl || process.env.PYTHON_SIDECAR_URL || config.PYTHON_SIDECAR_URL;
}

/**
 * Probes the sidecar's GET /v1/ready endpoint with a strict 500ms timeout.
 * @param {string} [baseUrl]
 * @returns {Promise<{ ready: true } | { ready: false, reason: 'down' | 'warming' }>}
 */
async function checkReady(baseUrl) {
  const targetUrl = resolveBaseUrl(baseUrl);
  try {
    const signal = AbortSignal.timeout(500);
    const res = await fetch(`${targetUrl}/v1/ready`, { signal });
    if (res.status === 200) {
      return { ready: true };
    }
    if (res.status === 503) {
      return { ready: false, reason: 'warming' };
    }
    return { ready: false, reason: 'down' };
  } catch (_err) {
    // ECONNREFUSED, network abort, or timeout
    return { ready: false, reason: 'down' };
  }
}

/**
 * Polls checkReady() every 1000ms until ready or maxWaitMs has elapsed.
 * @param {number} [maxWaitMs=60000]
 * @param {string} [baseUrl]
 * @returns {Promise<boolean>}
 */
async function waitForReady(maxWaitMs = DEFAULT_MAX_WAIT_MS, baseUrl) {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    const status = await checkReady(baseUrl);
    if (status.ready) {
      return true;
    }
    const elapsed = Date.now() - startTime;
    const remaining = maxWaitMs - elapsed;
    if (remaining <= 0) {
      break;
    }
    const sleepTime = Math.min(1000, remaining);
    await new Promise((resolve) => setTimeout(resolve, sleepTime));
  }
  return false;
}

/**
 * Submits a PDF buffer to the Python sidecar for OCR extraction.
 * Assumes the sidecar is verified ready by the caller.
 *
 * @param {Buffer} pdfBuffer
 * @param {string} [baseUrl]
 * @returns {Promise<{ pages: Array<{ num: number, text: string }>, model: string }>}
 */
async function ocrPdf(pdfBuffer, baseUrl) {
  const targetUrl = resolveBaseUrl(baseUrl);
  const timeoutMs = config.PYTHON_SIDECAR_TIMEOUT_MS || 110000;

  const formData = new FormData();
  const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
  formData.append('file', blob, 'document.pdf');

  let res;
  try {
    const signal = AbortSignal.timeout(timeoutMs);
    res = await fetch(`${targetUrl}/v1/ocr/pdf`, {
      method: 'POST',
      body: formData,
      signal,
    });
  } catch (err) {
    const unavailableErr = new Error(
      'OCR via the Python sidecar is unavailable. Please ensure the sidecar is running (see docs) and retry.'
    );
    unavailableErr.code = 'OCR_SIDECAR_UNAVAILABLE';
    unavailableErr.cause = err;
    throw unavailableErr;
  }

  if (res.ok) {
    return await res.json();
  }

  if (res.status === 422) {
    let errBody = {};
    try {
      errBody = await res.json();
    } catch (_) {}
    if (errBody.code === 'OCR_LANGUAGE_UNSUPPORTED') {
      const err = new Error(
        'This document appears to be in a language not yet supported by OCR. Currently English and Chinese are supported.'
      );
      err.code = 'OCR_LANGUAGE_UNSUPPORTED';
      throw err;
    }
  }

  if (res.status >= 500) {
    const err = new Error('OCR processing failed in sidecar');
    err.code = 'OCR_PROCESSING_FAILED';
    throw err;
  }

  const err = new Error(`OCR processing failed with status ${res.status}`);
  err.code = 'OCR_PROCESSING_FAILED';
  throw err;
}

module.exports = {
  checkReady,
  waitForReady,
  ocrPdf,
  DEFAULT_MAX_WAIT_MS,
};
