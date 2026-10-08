/**
 * backend/tests/f37_2_embed_batch_size_test.js
 *
 * Verifies F37.2:
 * T1: embedBatch with 200 texts -> 3 HTTP calls (spy on fetch at 75/call)
 * T2: embedBatch with 50 texts -> 1 HTTP call
 * T3: embedBatch with 0 texts -> 0 HTTP calls, returns []
 * T4: results preserve input order across batch boundaries
 * T5: sidecar warming (503) -> retries then succeeds
 * T6: sidecar down -> EMBED_MODEL_UNAVAILABLE
 */

'use strict';

const assert = require('assert');
const embedClient = require('../services/ai/embedClient');

async function runTests() {
  console.log('================================================================');
  console.log('🚀 RUNNING F37.2 EMBED BATCH SIZE & CLIENT VERIFICATION TESTS');
  console.log('================================================================\n');

  const origFetch = global.fetch;

  try {
    // --------------------------------------------------------------------------
    // T1: embedBatch with 200 texts -> 3 HTTP calls (at 75/call: 75, 75, 50)
    // --------------------------------------------------------------------------
    {
      const calls = [];
      global.fetch = async (url, opts) => {
        const body = JSON.parse(opts.body);
        calls.push({ url, textCount: body.texts.length, texts: body.texts });
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            embeddings: body.texts.map((t) => [t]),
            model: 'bge-m3-python-fp32',
            dims: 1024,
          }),
        };
      };

      const texts200 = Array.from({ length: 200 }, (_, i) => `item-${i}`);
      const res = await embedClient.embedBatch(texts200);

      assert.strictEqual(calls.length, 3, `T1 failed: expected 3 HTTP calls, got ${calls.length}`);
      assert.strictEqual(calls[0].textCount, 75, `T1 failed: expected batch 1 size 75, got ${calls[0].textCount}`);
      assert.strictEqual(calls[1].textCount, 75, `T1 failed: expected batch 2 size 75, got ${calls[1].textCount}`);
      assert.strictEqual(calls[2].textCount, 50, `T1 failed: expected batch 3 size 50, got ${calls[2].textCount}`);
      assert.strictEqual(res.embeddings.length, 200, 'T1 failed: expected 200 embeddings returned');
      console.log('[PASS] T1: embedBatch with 200 texts -> 3 HTTP calls (75, 75, 50)');
    }

    // --------------------------------------------------------------------------
    // T2: embedBatch with 50 texts -> 1 HTTP call
    // --------------------------------------------------------------------------
    {
      const calls = [];
      global.fetch = async (url, opts) => {
        const body = JSON.parse(opts.body);
        calls.push({ url, textCount: body.texts.length });
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            embeddings: body.texts.map((t) => [t]),
            model: 'bge-m3-python-fp32',
            dims: 1024,
          }),
        };
      };

      const texts50 = Array.from({ length: 50 }, (_, i) => `item-${i}`);
      const res = await embedClient.embedBatch(texts50);

      assert.strictEqual(calls.length, 1, `T2 failed: expected 1 HTTP call, got ${calls.length}`);
      assert.strictEqual(calls[0].textCount, 50, `T2 failed: expected batch size 50, got ${calls[0].textCount}`);
      assert.strictEqual(res.embeddings.length, 50, 'T2 failed: expected 50 embeddings returned');
      console.log('[PASS] T2: embedBatch with 50 texts -> 1 HTTP call');
    }

    // --------------------------------------------------------------------------
    // T3: embedBatch with 0 texts -> 0 HTTP calls, returns []
    // --------------------------------------------------------------------------
    {
      let callCount = 0;
      global.fetch = async () => {
        callCount++;
        return { ok: true, status: 200, json: async () => ({}) };
      };

      const resEmpty = await embedClient.embedBatch([]);
      assert.strictEqual(callCount, 0, `T3 failed: expected 0 HTTP calls, got ${callCount}`);
      assert.ok(Array.isArray(resEmpty), 'T3 failed: expected array return');
      assert.strictEqual(resEmpty.length, 0, 'T3 failed: expected 0 length');
      assert.deepStrictEqual(resEmpty.embeddings, [], 'T3 failed: expected embeddings to be empty');
      console.log('[PASS] T3: embedBatch with 0 texts -> 0 HTTP calls, returns []');
    }

    // --------------------------------------------------------------------------
    // T4: results preserve input order across batch boundaries
    // --------------------------------------------------------------------------
    {
      global.fetch = async (url, opts) => {
        const body = JSON.parse(opts.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            embeddings: body.texts.map((t) => [`vec-for-${t}`]),
            model: 'bge-m3-python-fp32',
            dims: 1024,
          }),
        };
      };

      const texts = Array.from({ length: 220 }, (_, i) => `key-${i}`);
      const res = await embedClient.embedBatch(texts);

      assert.strictEqual(res.embeddings.length, 220);
      for (let i = 0; i < texts.length; i++) {
        assert.deepStrictEqual(
          res.embeddings[i],
          [`vec-for-key-${i}`],
          `T4 failed: ordering mismatch at index ${i}`
        );
      }
      console.log('[PASS] T4: results preserve input order across batch boundaries');
    }

    // --------------------------------------------------------------------------
    // T5: sidecar warming (503) -> retries then succeeds
    // --------------------------------------------------------------------------
    {
      let attempts = 0;
      global.fetch = async (url, opts) => {
        attempts++;
        if (attempts === 1) {
          return {
            ok: false,
            status: 503,
            json: async () => ({ code: 'EMBED_MODEL_WARMING' }),
          };
        }
        const body = JSON.parse(opts.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            embeddings: body.texts.map(() => [0.42]),
            model: 'bge-m3-python-fp32',
            dims: 1024,
          }),
        };
      };

      const res = await embedClient.embedBatch(['warm-test'], {
        retryIntervals: [10, 20],
      });
      assert.strictEqual(attempts, 2, `T5 failed: expected 2 attempts, got ${attempts}`);
      assert.strictEqual(res.embeddings.length, 1);
      console.log('[PASS] T5: sidecar warming (503) -> retries then succeeds');
    }

    // --------------------------------------------------------------------------
    // T6: sidecar down -> EMBED_MODEL_UNAVAILABLE
    // --------------------------------------------------------------------------
    {
      global.fetch = async () => {
        throw new TypeError('fetch failed: connect ECONNREFUSED 127.0.0.1:8765');
      };

      let threw = false;
      let errCode = null;
      try {
        await embedClient.embedBatch(['fail-test']);
      } catch (err) {
        threw = true;
        errCode = err.code;
      }

      assert.strictEqual(threw, true, 'T6 failed: expected embedBatch to throw when sidecar is down');
      assert.strictEqual(errCode, 'EMBED_MODEL_UNAVAILABLE', `T6 failed: expected EMBED_MODEL_UNAVAILABLE, got ${errCode}`);
      console.log('[PASS] T6: sidecar down -> EMBED_MODEL_UNAVAILABLE');
    }
  } finally {
    global.fetch = origFetch;
  }

  console.log('\n================================================================');
  console.log('RESULTS: 6 passed, 0 failed');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('f37_2_embed_batch_size_test failed:', err);
  process.exit(1);
});

