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
 * @param {string|{ baseUrl?: string, timeoutMs?: number, pageCount?: number }} [options]
 * @returns {Promise<{ pages: Array<{ num: number, text: string }>, model: string }>}
 */
async function ocrPdf(pdfBuffer, options = {}) {
  const baseUrl = typeof options === 'string' ? options : options?.baseUrl;
  const targetUrl = resolveBaseUrl(baseUrl);

  // Dynamic adaptive timeout:
  // Allocate ~25s per page on CPU + 60s base buffer to handle complex/dense scans
  let timeoutMs;
  if (typeof options === 'object' && typeof options?.timeoutMs === 'number') {
    timeoutMs = options.timeoutMs;
  } else if (typeof options === 'object' && typeof options?.pageCount === 'number') {
    timeoutMs = Math.max(
      config.PYTHON_SIDECAR_TIMEOUT_MS || 120000,
      options.pageCount * 25000 + 60000
    );
  } else {
    const estimatedPages = Math.max(1, Math.ceil((pdfBuffer?.length || 0) / (300 * 1024)));
    timeoutMs = Math.max(
      config.PYTHON_SIDECAR_TIMEOUT_MS || 180000,
      estimatedPages * 25000 + 60000
    );
  }

  const formData = new FormData();
  const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
  formData.append('file', blob, 'document.pdf');

  let res;
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    res = await fetch(`${targetUrl}/v1/ocr/pdf`, {
      method: 'POST',
      body: formData,
      signal,
    });
  } catch (err) {
    const isTimeout =
      err.name === 'TimeoutError' ||
      err.name === 'AbortError' ||
      signal.aborted ||
      Boolean(err.cause && (err.cause.name === 'TimeoutError' || err.cause.name === 'AbortError'));

    if (isTimeout) {
      const timeoutErr = new Error(
        `OCR via the Python sidecar timed out after ${Math.round(timeoutMs / 1000)}s. The document may contain many pages or complex scanned images.`
      );
      timeoutErr.code = 'OCR_TIMEOUT';
      timeoutErr.cause = err;
      throw timeoutErr;
    }

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
    let errDetail = '';
    try {
      const errJson = await res.json();
      if (errJson.message) errDetail = `: ${errJson.message}`;
    } catch (_) {}
    const err = new Error(`OCR processing failed in sidecar${errDetail}`);
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
