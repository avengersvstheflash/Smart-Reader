/**
 * backend/services/ai/structureDetector.js
 *
 * Fast structure detector client connecting to the Python sidecar.
 * Layer 0: PyMuPDF doc.get_toc() (embedded bookmarks)
 * Layer 1: font-size + numbering heuristics in Python
 * Returns null if sidecar is unavailable.
 */

'use strict';

const config = require('../../config');
const { resolveBaseUrl } = require('./sidecarBase');

/**
 * Detects document structure of a PDF via the Python sidecar.
 *
 * @param {Buffer} pdfBuffer
 * @param {object|string} [options]
 * @param {string} [options.baseUrl]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{
 *   hasEmbeddedToc: boolean,
 *   toc: Array<{level: number, title: string, page: number}>,
 *   headingCandidates: Array<{page: number, text: string, fontSize: number, isHeading: boolean}>,
 *   frontMatterPageRange: [number, number] | null,
 *   backMatterPageRange: [number, number] | null,
 *   estimatedChapterCount: number,
 *   method: 'toc' | 'heuristic' | 'none',
 *   warnings: string[]
 * } | null>}
 */
async function detectStructure(pdfBuffer, options = {}) {
  const isBufferLike = pdfBuffer && (
    Buffer.isBuffer(pdfBuffer) ||
    typeof pdfBuffer === 'string' ||
    ArrayBuffer.isView(pdfBuffer) ||
    pdfBuffer instanceof ArrayBuffer
  );

  const length = isBufferLike ? (pdfBuffer.length ?? pdfBuffer.byteLength ?? 0) : 0;

  if (!isBufferLike || length === 0) {
    return {
      hasEmbeddedToc: false,
      toc: [],
      headingCandidates: [],
      frontMatterPageRange: null,
      backMatterPageRange: null,
      estimatedChapterCount: 0,
      method: 'none',
      warnings: ['empty_pdf_buffer'],
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
    res = await fetch(`${targetUrl}/v1/parse/structure`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pdf_base64: pdfBase64 }),
      signal,
    });
  } catch (err) {
    console.warn(`[StructureDetector] sidecar unavailable: ${err.message}`);
    return null;
  }

  if (!res.ok) {
    console.warn(`[StructureDetector] sidecar returned HTTP ${res.status}`);
    return null;
  }

  try {
    const data = await res.json();
    const rawCandidates = data.heading_candidates || data.headingCandidates || [];
    const headingCandidates = rawCandidates.map((c) => ({
      page: c.page,
      text: c.text,
      fontSize: typeof c.fontSize === 'number' ? c.fontSize : (c.font_size || 0),
      isHeading: typeof c.isHeading === 'boolean' ? c.isHeading : Boolean(c.is_heading),
    }));

    return {
      hasEmbeddedToc: Boolean(data.has_embedded_toc ?? data.hasEmbeddedToc),
      toc: data.toc || [],
      headingCandidates,
      frontMatterPageRange: data.front_matter_page_range ?? data.frontMatterPageRange ?? null,
      backMatterPageRange: data.back_matter_page_range ?? data.backMatterPageRange ?? null,
      estimatedChapterCount: data.estimated_chapter_count ?? data.estimatedChapterCount ?? 0,
      method: data.method || 'none',
      warnings: data.warnings || [],
    };
  } catch (parseErr) {
    console.warn(`[StructureDetector] failed to parse response: ${parseErr.message}`);
    return null;
  }
}

module.exports = {
  detectStructure,
};
module.exports.detectStructure = detectStructure;
module.exports.default = detectStructure;

