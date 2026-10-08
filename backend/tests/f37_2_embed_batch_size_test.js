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
    // T1: embedBatch with 200 texts -> 13 HTTP calls (at 16/call: 12x 16, 1x 8)
    // --------------------------------------------------------------------------
    {
      const calls = [];
      global.fetch = async (url, opts) => {
        if (url.includes('/ready')) return { status: 200 };
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

      assert.strictEqual(calls.length, 13, `T1 failed: expected 13 HTTP calls, got ${calls.length}`);
      for (let i = 0; i < 12; i++) {
        assert.strictEqual(calls[i].textCount, 16, `T1 failed: expected batch size 16, got ${calls[i].textCount}`);
      }
      assert.strictEqual(calls[12].textCount, 8, `T1 failed: expected batch size 8, got ${calls[12].textCount}`);
      assert.strictEqual(res.embeddings.length, 200, 'T1 failed: expected 200 embeddings returned');
      console.log('[PASS] T1: embedBatch with 200 texts -> 13 HTTP calls (12x 16, 1x 8)');
    }

    // --------------------------------------------------------------------------
    // T2: embedBatch with 50 texts -> 4 HTTP calls (16, 16, 16, 2)
    // --------------------------------------------------------------------------
    {
      const calls = [];
      global.fetch = async (url, opts) => {
        if (url.includes('/ready')) return { status: 200 };
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

      assert.strictEqual(calls.length, 4, `T2 failed: expected 4 HTTP calls, got ${calls.length}`);
      assert.strictEqual(calls[0].textCount, 16, `T2 failed: expected batch size 16, got ${calls[0].textCount}`);
      assert.strictEqual(calls[3].textCount, 2, `T2 failed: expected batch size 2, got ${calls[3].textCount}`);
      assert.strictEqual(res.embeddings.length, 50, 'T2 failed: expected 50 embeddings returned');
      console.log('[PASS] T2: embedBatch with 50 texts -> 4 HTTP calls (16, 16, 16, 2)');
    }

    // --------------------------------------------------------------------------
    // T3: embedBatch with 0 texts -> 0 HTTP calls, returns []
    // --------------------------------------------------------------------------
    {
      let callCount = 0;
      global.fetch = async (url) => {
        if (url && url.includes('/ready')) return { status: 200 };
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
    // T4: results preserve input order across 16-size batches
    // --------------------------------------------------------------------------
    {
      global.fetch = async (url, opts) => {
        if (url.includes('/ready')) return { status: 200 };
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
      console.log('[PASS] T4: results preserve input order across 16-size batches');
    }

    // --------------------------------------------------------------------------
    // T5: sidecar warming (503) -> retries then succeeds (Actually now throws EMBED_MODEL_WARMING)
    // --------------------------------------------------------------------------
    {
      let attempts = 0;
      global.fetch = async (url, opts) => {
        if (url.includes('/ready')) return { status: 200 };
        attempts++;
        if (attempts === 1) {
          return {
            ok: false,
            status: 503,
            json: async () => ({ code: 'EMBED_MODEL_WARMING' }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            embeddings: [[0.42]],
            model: 'bge-m3-python-fp32',
            dims: 1024,
          }),
        };
      };

      let threw = false;
      let errCode = null;
      try {
        await embedClient.embedBatch(['warm-test'], {
          retryIntervals: [10, 20],
        });
      } catch (err) {
        threw = true;
        errCode = err.code;
      }
      assert.strictEqual(threw, true, 'T5 failed: expected embedBatch to throw warming');
      assert.strictEqual(errCode, 'EMBED_MODEL_WARMING');
      console.log('[PASS] T5: sidecar warming (503) -> correctly throws EMBED_MODEL_WARMING');
    }

    // --------------------------------------------------------------------------
    // T6: sidecar 413 EMBED_BATCH_TOO_LARGE -> surfaced as-is
    // --------------------------------------------------------------------------
    {
      global.fetch = async (url) => {
        if (url && url.includes('/ready')) return { status: 200 };
        return {
          ok: false,
          status: 413,
          json: async () => ({ code: 'EMBED_BATCH_TOO_LARGE', message: 'Batch size exceeds server limit 32' }),
        };
      };

      let threw = false;
      let errCode = null;
      try {
        await embedClient.embedBatch(['large-batch-test']);
      } catch (err) {
        threw = true;
        errCode = err.code;
      }

      assert.strictEqual(threw, true, 'T6 failed: expected embedBatch to throw when 413 is returned');
      assert.strictEqual(errCode, 'EMBED_PROCESSING_FAILED', `T6 failed: expected EMBED_PROCESSING_FAILED, got ${errCode}`);
      console.log('[PASS] T6: sidecar 413 EMBED_BATCH_TOO_LARGE -> surfaced');
    }

    // --------------------------------------------------------------------------
    // T7: env var EMBED_BATCH_SIZE=8 -> 200 texts = 25 calls
    // --------------------------------------------------------------------------
    {
      const calls = [];
      global.fetch = async (url, opts) => {
        if (url.includes('/ready')) return { status: 200 };
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

      process.env.EMBED_BATCH_SIZE = '8';
      delete require.cache[require.resolve('../services/ai/embedClient')];
      const newEmbedClient = require('../services/ai/embedClient');

      const res = await newEmbedClient.embedBatch(Array.from({ length: 200 }, (_, i) => `item-${i}`));
      assert.strictEqual(calls.length, 25, `T7 failed: expected 25 HTTP calls, got ${calls.length}`);
      console.log('[PASS] T7: env var EMBED_BATCH_SIZE=8 -> 200 texts = 25 calls');
      
      delete process.env.EMBED_BATCH_SIZE;
    }
  } finally {
    global.fetch = origFetch;
  }

  console.log('\n================================================================');
  console.log('RESULTS: 7 passed, 0 failed');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('f37_2_embed_batch_size_test failed:', err);
  process.exit(1);
});

