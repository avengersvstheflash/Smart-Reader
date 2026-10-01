/**
 * backend/services/synthesis/promisePool.js
 *
 * Bounded-concurrency promise pool. Executes worker functions over a
 * list of items, never exceeding `limit` concurrent workers.
 *
 * Phase 5.7.2 Session 3b-1.
 */

'use strict';

/**
 * Runs `workerFn(item, index)` over all items with at most `limit`
 * concurrent workers. Preserves input order in the results array.
 * If any worker throws, the error propagates and remaining workers
 * stop scheduling new items (in-flight ones complete).
 *
 * @param {Array} items
 * @param {number} limit
 * @param {(item: any, index: number) => Promise<any>} workerFn
 * @returns {Promise<Array>}
 */
async function runWithConcurrency(items, limit, workerFn) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const safeLimit = Math.max(1, Math.min(limit | 0, items.length));
  const results = new Array(items.length);
  let cursor = 0;

  const worker = async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await workerFn(items[i], i);
    }
  };

  const workers = Array.from({ length: safeLimit }, () => worker());
  await Promise.all(workers);
  return results;
}

module.exports = { runWithConcurrency };
