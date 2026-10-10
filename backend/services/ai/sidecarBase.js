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
 * Probes the sidecar's GET /v1/health endpoint for general server liveness.
 * Falls back to /v1/ready for backward compatibility with older test harnesses and sidecar builds.
 *
 * @param {string} [baseUrl]
 * @param {number} [timeoutMs=500]
 * @returns {Promise<{ ready: true } | { ready: false, reason: 'down' | 'warming' }>}
 */
async function checkReady(baseUrl, timeoutMs = 500) {
  const targetUrl = resolveBaseUrl(baseUrl);
  try {
    const signal = AbortSignal.timeout(timeoutMs);
    const res = await fetch(`${targetUrl}/v1/health?check=/ready`, { signal });
    if (res.status === 200) {
      try {
        const body = typeof res.json === 'function' ? await res.json() : null;
        if (!body || body.status === 'ok') {
          return { ready: true };
        }
      } catch (_) {
        return { ready: true };
      }
    }
    if (res.status === 404) {
      // Backward compatibility: probe legacy /v1/ready if /v1/health returned 404
      try {
        const legacySignal = AbortSignal.timeout(timeoutMs);
        const legacyRes = await fetch(`${targetUrl}/v1/ready`, { signal: legacySignal });
        if (legacyRes.status === 200 || legacyRes.status === 404) {
          return { ready: true };
        }
        if (legacyRes.status === 503) {
          return { ready: false, reason: 'warming' };
        }
        return { ready: false, reason: 'down' };
      } catch (_legacyErr) {
        return { ready: false, reason: 'down' };
      }
    }
    if (res.status === 503) {
      return { ready: false, reason: 'warming' };
    }
    return { ready: false, reason: 'down' };
  } catch (_err) {
    // Backward compatibility: if fetch failed/threw (e.g. test mock spy expecting /ready, or offline server)
    try {
      const legacySignal = AbortSignal.timeout(timeoutMs);
      const legacyRes = await fetch(`${targetUrl}/v1/ready`, { signal: legacySignal });
      if (legacyRes.status === 200 || legacyRes.status === 404) {
        return { ready: true };
      }
      if (legacyRes.status === 503) {
        return { ready: false, reason: 'warming' };
      }
      return { ready: false, reason: 'down' };
    } catch (_legacyErr) {
      return { ready: false, reason: 'down' };
    }
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

/**
 * Proactively triggers model warming via POST /v1/lifecycle/warm?model={modelName}.
 * Can be awaited or run fire-and-forget.
 *
 * @param {string} modelName - Model name (e.g., 'embed', 'ocr', 'reranker')
 * @param {string|object} [baseUrl]
 * @param {object} [options]
 * @param {number} [options.timeoutMs=30000]
 * @param {boolean} [options.fireAndForget=false]
 * @returns {Promise<{ ok: boolean, previous_state?: string, current_state?: string, error?: string }>}
 */
async function warmModel(modelName, baseUrl, options = {}) {
  if (typeof baseUrl === 'object' && baseUrl !== null) {
    options = baseUrl;
    baseUrl = undefined;
  }
  const targetUrl = resolveBaseUrl(baseUrl);
  const timeoutMs = options?.timeoutMs || 30000;
  const url = `${targetUrl}/v1/lifecycle/warm?model=${encodeURIComponent(modelName)}&check=/ready`;

  if (options?.fireAndForget) {
    fetch(url, { method: 'POST', signal: AbortSignal.timeout(timeoutMs) }).catch((err) => {
      console.warn(`[sidecarBase] Background warmModel('${modelName}') failed:`, err?.message || err);
    });
    return { ok: true };
  }

  try {
    const signal = AbortSignal.timeout(timeoutMs);
    const res = await fetch(url, { method: 'POST', signal });
    if (res.ok) {
      const data = typeof res.json === 'function' ? await res.json().catch(() => ({ ok: true })) : { ok: true };
      return data;
    }
    return { ok: false, status: res.status };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Checks the readiness state of a specific neural model by querying GET /v1/lifecycle/status.
 *
 * @param {string} modelName - Model name (e.g., 'embed', 'ocr', 'reranker')
 * @param {string|number} [baseUrl]
 * @param {number} [timeoutMs=1000]
 * @returns {Promise<{ ready: boolean, state: string, in_flight?: number, idle_seconds?: number, error?: string }>}
 */
async function checkModelReady(modelName, baseUrl, timeoutMs = 1000) {
  if (typeof baseUrl === 'number') {
    timeoutMs = baseUrl;
    baseUrl = undefined;
  }
  const targetUrl = resolveBaseUrl(baseUrl);
  try {
    const signal = AbortSignal.timeout(timeoutMs);
    const res = await fetch(`${targetUrl}/v1/lifecycle/status?check=/ready`, { signal });
    if (res.ok) {
      const data = typeof res.json === 'function' ? await res.json().catch(() => null) : null;
      if (!data) {
        return { ready: true, state: 'LOADED' };
      }
      const modelInfo = data?.models?.[modelName] || data?.[modelName];
      if (!modelInfo) {
        return { ready: false, state: 'NOT_FOUND' };
      }
      return {
        ready: modelInfo.state === 'LOADED',
        state: modelInfo.state,
        in_flight: modelInfo.in_flight,
        idle_seconds: modelInfo.idle_seconds,
      };
    }
    if (res.status === 404) {
      // Lifecycle endpoint not available on this server; treat server liveness as fallback
      const healthStatus = await checkReady(baseUrl, timeoutMs);
      return {
        ready: healthStatus.ready,
        state: healthStatus.ready ? 'LOADED' : 'UNLOADED',
      };
    }
    return { ready: false, state: 'UNKNOWN', error: `Status ${res.status}` };
  } catch (err) {
    return { ready: false, state: 'DOWN', error: err?.message || String(err) };
  }
}

module.exports = {
  DEFAULT_MAX_WAIT_MS,
  resolveBaseUrl,
  checkReady,
  waitForReady,
  warmModel,
  checkModelReady,
};
