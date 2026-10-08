/**
 * backend/services/ai/sidecarBase.js
 *
 * Base client and shared utilities for communicating with the Python sidecar.
 *
 * Invariants:
 * - Node remains sole SQLite writer (zero DB access here).
 * - Dependency-free (uses native global fetch, AbortSignal in Node 22).
 * - Configuration derived from backend/config.js.
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
 * Probes the sidecar's GET /v1/ready endpoint with a configurable timeout (default 500ms).
 * @param {string} [baseUrl]
 * @param {number} [timeoutMs=500]
 * @returns {Promise<{ ready: true } | { ready: false, reason: 'down' | 'warming' }>}
 */
async function checkReady(baseUrl, timeoutMs = 500) {
  const targetUrl = resolveBaseUrl(baseUrl);
  try {
    const signal = AbortSignal.timeout(timeoutMs);
    const res = await fetch(`${targetUrl}/v1/ready`, { signal });
    if (res.status === 200 || res.status === 404) {
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
 * Polls checkReady() until ready or maxWaitMs has elapsed.
 * Supports both signatures:
 *   waitForReady(maxWaitMs, baseUrl, intervalMs)
 *   waitForReady(baseUrl, maxWaitMs, intervalMs)
 *
 * @param {number|string} [arg1=60000]
 * @param {string|number} [arg2]
 * @param {number} [arg3=1000]
 * @returns {Promise<boolean>}
 */
async function waitForReady(arg1, arg2, arg3) {
  let maxWaitMs = DEFAULT_MAX_WAIT_MS;
  let baseUrl;
  let intervalMs = 1000;

  if (typeof arg1 === 'string') {
    baseUrl = arg1;
    if (typeof arg2 === 'number') maxWaitMs = arg2;
    if (typeof arg3 === 'number') intervalMs = arg3;
  } else {
    if (typeof arg1 === 'number') maxWaitMs = arg1;
    if (typeof arg2 === 'string') baseUrl = arg2;
    if (typeof arg3 === 'number') intervalMs = arg3;
  }

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
    const sleepTime = Math.min(intervalMs, remaining);
    await new Promise((resolve) => setTimeout(resolve, sleepTime));
  }
  return false;
}

module.exports = {
  DEFAULT_MAX_WAIT_MS,
  resolveBaseUrl,
  checkReady,
  waitForReady,
};
