/**
 * backend/services/ai/mathExtractor.js
 *
 * Math extraction client connecting to the Python sidecar via pdfmath.
 * Recovers LaTeX math blocks from PDFs with proper \( ... \) and \[ ... \] wrapping.
 * Returns null if sidecar is unavailable or returns an error.
 */

'use strict';

const config = require('../../config');
const { resolveBaseUrl } = require('./sidecarBase');

/**
 * Extracts math formulas from a PDF buffer via the Python sidecar.
 *
 * @param {Buffer} pdfBuffer
 * @param {object|string} [options]
 * @param {string} [options.baseUrl]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{
 *   success: boolean,
 *   latexBlocks: Array<{ page: number, textOriginal: string, latex: string }>,
 *   stats: { total: number, extracted: number, failed: number },
 *   error: string | null
 * } | null>}
 */
async function extractMath(pdfBuffer, options = {}) {
  const isBufferLike = pdfBuffer && (
    Buffer.isBuffer(pdfBuffer) ||
    typeof pdfBuffer === 'string' ||
    ArrayBuffer.isView(pdfBuffer) ||
    pdfBuffer instanceof ArrayBuffer
  );

  const length = isBufferLike ? (pdfBuffer.length ?? pdfBuffer.byteLength ?? 0) : 0;

  if (!isBufferLike || length === 0) {
    return {
      success: true,
      latexBlocks: [],
      stats: { total: 0, extracted: 0, failed: 0 },
      error: null,
    };
  }

  const baseUrl = typeof options === 'string' ? options : options?.baseUrl;
  const targetUrl = resolveBaseUrl(baseUrl);
  const timeoutMs = (typeof options === 'object' && options?.timeoutMs)
    ? options.timeoutMs
    : (config.PYTHON_SIDECAR_TIMEOUT_MS || 30000);

  const pdfBase64 = Buffer.isBuffer(pdfBuffer)
    ? pdfBuffer.toString('base64')
    : Buffer.from(pdfBuffer).toString('base64');

  let res;
  try {
    const signal = AbortSignal.timeout(timeoutMs);
    res = await fetch(`${targetUrl}/v1/math/extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pdf_base64: pdfBase64 }),
      signal,
    });
  } catch (err) {
    console.warn(`[MathExtractor] sidecar unavailable: ${err.message}`);
    return null;
  }

  if (!res.ok) {
    console.warn(`[MathExtractor] sidecar returned HTTP ${res.status}`);
    return null;
  }

  try {
    const data = await res.json();
    const rawBlocks = data.latex_blocks || data.latexBlocks || [];
    const latexBlocks = rawBlocks.map((b) => ({
      page: b.page,
      textOriginal: b.text_original || b.textOriginal || '',
      latex: b.latex || '',
    }));

    return {
      success: Boolean(data.success),
      latexBlocks,
      stats: data.stats || {
        total: latexBlocks.length,
        extracted: latexBlocks.length,
        failed: 0,
      },
      error: data.error || null,
    };
  } catch (parseErr) {
    console.warn(`[MathExtractor] failed to parse response: ${parseErr.message}`);
    return null;
  }
}

module.exports = {
  extractMath,
};
module.exports.extractMath = extractMath;
module.exports.default = extractMath;

