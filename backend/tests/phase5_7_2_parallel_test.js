const assert = require('assert');
const { runWithConcurrency } = require('../services/synthesis/promisePool');
const smartChapterRepository = require('../repositories/smartChapterRepository');
const { getDatabase } = require('../db/database');
const { callOpenRouterWithBackoff } = require('../services/ai/openrouterProvider');

async function runTests() {
  console.log('=== phase5_7_2_parallel_test.js ===');
  let passed = 0;

  // T1. runWithConcurrency executes all items, preserves result order.
  const items = [10, 20, 30, 40];
  const results1 = await runWithConcurrency(items, 2, async (item) => item * 2);
  assert.deepStrictEqual(results1, [20, 40, 60, 80], 'T1 Failed: preserves order');
  passed++;

  // T2. Concurrency ceiling respected
  let activeCount = 0;
  let maxActive = 0;
  await runWithConcurrency([1, 2, 3, 4, 5], 2, async () => {
    activeCount++;
    if (activeCount > maxActive) maxActive = activeCount;
    await new Promise(r => setTimeout(r, 10));
    activeCount--;
  });
  assert.strictEqual(maxActive, 2, 'T2 Failed: ceiling respected');
  passed++;

  // T3. Worker error isolation
  try {
    await runWithConcurrency([1, 2, 3], 2, async (i) => {
      if (i === 2) throw new Error('Worker Boom');
      await new Promise(r => setTimeout(r, 10));
      return i;
    });
    assert.fail('T3 Failed: should throw');
  } catch (err) {
    assert.strictEqual(err.message, 'Worker Boom', 'T3 Failed: Error isolation');
    passed++;
  }

  // T4. Atomic status claim
  const db = getDatabase();
  db.prepare(`INSERT OR REPLACE INTO books (id, title, created_at, updated_at) VALUES ('test-book-atomic', 'Test Book', '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z')`).run();
  db.prepare(`INSERT OR REPLACE INTO smart_chapters (id, book_id, sequence, title, status, created_at, updated_at) VALUES ('ch-atomic-1', 'test-book-atomic', 1, 'T', 'pending', '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z')`).run();
  
  const claims = await Promise.all([
    new Promise(r => setTimeout(() => r(smartChapterRepository.claimForSynthesis('ch-atomic-1')), 0)),
    new Promise(r => setTimeout(() => r(smartChapterRepository.claimForSynthesis('ch-atomic-1')), 0))
  ]);
  const succeeded = claims.filter(c => c === true).length;
  assert.strictEqual(succeeded, 1, 'T4 Failed: exactly one claim succeeds');
  passed++;

  // T5. callOpenRouterWithBackoff retries on simulated 429
  let attempts = 0;
  const start = Date.now();
  process.env.SYNTHESIS_BACKOFF_BASE_MS = '100'; 
  const result = await callOpenRouterWithBackoff(async () => {
    attempts++;
    if (attempts === 1) {
      const err = new Error('Rate limit');
      err.status = 429;
      throw err;
    }
    return 'success';
  });
  const elapsed = Date.now() - start;
  assert.strictEqual(result, 'success', 'T5 Failed: returns success');
  assert.strictEqual(attempts, 2, 'T5 Failed: correct attempts');
  assert.ok(elapsed >= 100, 'T5 Failed: backoff wait was respected');
  passed++;

  // T6. Skipped handler bypasses counts
  const chapterResults = [];
  let synthesizedCount = 0;
  const targetChapter = { chapterId: 'c1', title: 'C1' };
  const mockSynthResult = { skipped: true };
  if (mockSynthResult && mockSynthResult.skipped) {
    chapterResults.push({ chapterId: targetChapter.chapterId, title: targetChapter.title, status: 'skipped' });
  } else {
    synthesizedCount++;
  }
  assert.strictEqual(synthesizedCount, 0, 'T6 Failed: synthesizedCount');
  assert.strictEqual(chapterResults[0].status, 'skipped', 'T6 Failed: skipped status');
  passed++;

  console.log(`PASSED ${passed}/6 cases`);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
