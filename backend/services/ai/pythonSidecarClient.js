/**
 * backend/services/ai/pythonSidecarClient.js
 *
 * @deprecated Since Phase 5.7.2. Modularized into:
 *   - backend/services/ai/sidecarBase.js (resolveBaseUrl, checkReady, waitForReady, DEFAULT_MAX_WAIT_MS)
 *   - backend/services/ai/ocrClient.js (ocrPdf)
 *   - backend/services/ai/nlpClient.js (splitSentences, chunkBlocks)
 *
 * This file is retained as a backward-compatible shim so existing callers continue to work seamlessly.
 */

'use strict';

const sidecarBase = require('./sidecarBase');
const ocrClient = require('./ocrClient');
const nlpClient = require('./nlpClient');

module.exports = {
  ...sidecarBase,
  ...ocrClient,
  ...nlpClient,
};
