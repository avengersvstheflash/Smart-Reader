/**
 * backend/tests/phase5_7_2_embed_test.js
 *
 * Phase 5.7.2 Embed Integration & Mock Test Suite
 */

'use strict';

const assert = require('node:assert');
const http = require('node:http');

const embedClient = require('../services/ai/embedClient');
const pythonSidecarClient = require('../services/ai/pythonSidecarClient');
const { bgeProvider } = require('../services/semantic/embeddings/bgeEmbeddingProvider');
const config = require('../config');

async function runTests() {
  console.log('================================================================');
  console.log('🚀 RUNNING PHASE 5.7.2 EMBED INTEGRATION & MOCK TEST SUITE');
  console.log('================================================================\n');

  let activeMockHandler = (_req, res) => {
    res.writeHead(404);
    res.end();
  };

  const server = http.createServer((req, res) => {
    activeMockHandler(req, res);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const mockBaseUrl = `http://127.0.0.1:${port}`;
  const originalEnvUrl = process.env.PYTHON_SIDECAR_URL;
  process.env.PYTHON_SIDECAR_URL = mockBaseUrl;

  console.log(`[Setup] Ephemeral mock sidecar server listening on ${mockBaseUrl}`);

  try {
    // T1
    console.log('[Test 1] embedClient.embedBatch returns correctly shaped response on 200');
    activeMockHandler = (req, res) => {
      if (req.url === '/v1/embed/batch' && req.method === 'POST') {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          const payload = JSON.parse(body);
          assert.deepStrictEqual(payload.texts, ['Alpha passage', 'Beta passage']);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              status: 'success',
              embeddings: [new Array(1024).fill(0.1), new Array(1024).fill(0.2)],
              model: 'bge-m3-python-fp32',
              dims: 1024,
            })
          );
        });
        return;
      }
      res.writeHead(404);
      res.end();
    };

    const t1Res = await embedClient.embedBatch(['Alpha passage', 'Beta passage']);
    assert.strictEqual(t1Res.status, 'success');
    assert.strictEqual(t1Res.model, 'bge-m3-python-fp32');
    assert.strictEqual(t1Res.dims, 1024);
    assert.strictEqual(t1Res.embeddings.length, 2);
    assert.strictEqual(t1Res.embeddings[0].length, 1024);
    console.log('  ✓ T1 passed: embedClient.embedBatch correct behavior');

    // T2
    console.log('\n[Test 2] embedClient retries on first 503 EMBED_MODEL_WARMING, then succeeds');
    let t2CallCount = 0;
    activeMockHandler = (req, res) => {
      if (req.url === '/v1/embed/batch' && req.method === 'POST') {
        t2CallCount++;
        if (t2CallCount === 1) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ code: 'EMBED_MODEL_WARMING' }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'success', embeddings: [[0.1]], model: 'bge-m3-python-fp32', dims: 1024 }));
        }
        return;
      }
      res.writeHead(404);
      res.end();
    };

    const t2Res = await embedClient.embedBatch(['test'], { retryIntervals: [10] });
    assert.strictEqual(t2CallCount, 2);
    assert.strictEqual(t2Res.status, 'success');
    console.log('  ✓ T2 passed: retry on warming works');

    // T3
    console.log('\n[Test 3] embedClient throws .code === EMBED_MODEL_UNAVAILABLE when sidecar is down');
    let t3Error = null;
    try {
      await embedClient.embedBatch(['test'], { baseUrl: 'http://127.0.0.1:59999', timeoutMs: 500 });
    } catch (err) {
      t3Error = err;
    }
    assert.ok(t3Error);
    assert.strictEqual(t3Error.code, 'EMBED_MODEL_UNAVAILABLE');
    console.log('  ✓ T3 passed: offline throws EMBED_MODEL_UNAVAILABLE');

    // T4
    console.log('\n[Test 4] embedClient throws .code === EMBED_PROCESSING_FAILED on mock 500');
    activeMockHandler = (req, res) => {
      if (req.url === '/v1/embed/batch') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'fail' }));
        return;
      }
      res.writeHead(404);
      res.end();
    };
    let t4Error = null;
    try {
      await embedClient.embedBatch(['test']);
    } catch (err) {
      t4Error = err;
    }
    assert.ok(t4Error);
    assert.strictEqual(t4Error.code, 'EMBED_PROCESSING_FAILED');
    console.log('  ✓ T4 passed: 500 throws EMBED_PROCESSING_FAILED');

    // T5
    console.log('\n[Test 5] bgeEmbeddingProvider.getName() returns Node Xenova string when flag is false');
    const origUsePython = config.USE_PYTHON_EMBEDDER;
    try {
      config.USE_PYTHON_EMBEDDER = false;
      const name = bgeProvider.getName();
      assert.strictEqual(name, 'BGE-M3 (1024d, Xenova/bge-m3 q8)');
    } finally {
      config.USE_PYTHON_EMBEDDER = origUsePython;
    }
    console.log('  ✓ T5 passed: getName() responds correctly based on config');

    // T6
    console.log('\n[Test 6] pythonSidecarClient.embedBatch is identical to embedClient.embedBatch');
    assert.strictEqual(pythonSidecarClient.embedBatch, embedClient.embedBatch);
    console.log('  ✓ T6 passed: shim integrity verified');

    console.log('\n================================================================');
    console.log('🎉 ALL 6 EMBED INTEGRATION & MOCK TESTS PASSED');
    console.log('================================================================\n');

  } finally {
    process.env.PYTHON_SIDECAR_URL = originalEnvUrl;
    await new Promise(resolve => server.close(resolve));
  }
}

runTests().then(() => {
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
