/**
 * backend/services/ai/ocrClient.js
 *
 * Client for Python sidecar OCR endpoints.
 *
 * Invariants:
 * - Node remains sole SQLite writer (zero DB access here).
 * - Dependency-free (uses native global fetch, FormData, Blob, AbortSignal in Node 22).
 */

'use strict';

const config = require('../../config');
const { resolveBaseUrl } = require('./sidecarBase');

/**
 * Submits a PDF buffer to the Python sidecar for OCR extraction.
 * Assumes the sidecar is verified ready by the caller.
 *
 * @param {Buffer} pdfBuffer
 * @param {string|{ baseUrl?: string, timeoutMs?: number }} [options]
 * @returns {Promise<{ pages: Array<{ num: number, text: string }>, model: string }>}
 */
async function ocrPdf(pdfBuffer, options = {}) {
  const baseUrl = typeof options === 'string' ? options : options?.baseUrl;
  const targetUrl = resolveBaseUrl(baseUrl);
  const timeoutMs = (typeof options === 'object' && options?.timeoutMs)
    ? options.timeoutMs
    : (config.PYTHON_SIDECAR_TIMEOUT_MS || 110000);

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
  ocrPdf,
};
