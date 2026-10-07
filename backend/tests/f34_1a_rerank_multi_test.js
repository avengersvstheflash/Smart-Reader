/**
 * backend/tests/f34_1a_rerank_multi_test.js
 *
 * Test suite for F34.1a: Multi-query batch rerank endpoint and client.
 * Verifies batching across multiple queries, chunking policy (>20 batches),
 * order preservation, empty input handling, error handling (503 warming, offline sidecar, 500 failure).
 * Uses ephemeral mock HTTP server (no real Python sidecar process required).
 */

'use strict';

const http = require('http');
const assert = require('assert');
const { rerankBatchMulti } = require('../services/ai/nlpClient');

let server;
let serverPort;
let requestCount = 0;
let requestBodies = [];
let mockHandler = null;

function startServer() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        requestCount++;
        let parsed = null;
        try {
          parsed = JSON.parse(body);
        } catch (_) {
          parsed = body;
        }
        requestBodies.push({ url: req.url, method: req.method, body: parsed });

        if (mockHandler) {
          mockHandler(req, res, parsed);
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ results: [], warning: null }));
        }
      });
    });
    server.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      resolve();
    });
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => resolve());
    } else {
      resolve();
    }
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('🚀 RUNNING F34.1A MULTI-BATCH RERANK TEST SUITE');
  console.log('================================================================\n');

  await startServer();
  const baseUrl = `http://127.0.0.1:${serverPort}`;

  let passed = 0;
  let failed = 0;

  function pass(name) {
    console.log(`[PASS] ${name}`);
    passed++;
  }

  function fail(name, err) {
    console.log(`[FAIL] ${name}\n${err.stack || err}`);
    failed++;
  }

  // T1: rerankBatchMulti with 3 batches returns 3 result objects in order
  try {
    requestCount = 0;
    requestBodies = [];
    mockHandler = (req, res, body) => {
      assert.strictEqual(req.url, '/v1/nlp/rerank-batch-multi');
      assert.strictEqual(req.method, 'POST');
      const batches = body.batches || [];
      const results = batches.map((b, bIdx) => ({
        id: b.id,
        scores: (b.candidates || []).map((c, cIdx) => ({
          id: c.id,
          score: Number((0.9 - bIdx * 0.1 - cIdx * 0.05).toFixed(2)),
        })),
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ results, warning: null }));
    };

    const inputBatches = [
      { id: 'p-1', query: 'first paragraph', candidates: [{ id: 'c-1', text: 'chunk 1' }] },
      { id: 'p-2', query: 'second paragraph', candidates: [{ id: 'c-2', text: 'chunk 2' }] },
      { id: 'p-3', query: 'third paragraph', candidates: [{ id: 'c-3', text: 'chunk 3' }] },
    ];

    const res = await rerankBatchMulti(inputBatches, { baseUrl });
    assert.ok(res && Array.isArray(res.results), 'Expected res.results array');
    assert.strictEqual(res.results.length, 3);
    assert.strictEqual(res.results[0].id, 'p-1');
    assert.strictEqual(res.results[0].scores[0].id, 'c-1');
    assert.strictEqual(res.results[1].id, 'p-2');
    assert.strictEqual(res.results[1].scores[0].id, 'c-2');
    assert.strictEqual(res.results[2].id, 'p-3');
    assert.strictEqual(res.results[2].scores[0].id, 'c-3');
    pass('T1: rerankBatchMulti with 3 batches returns 3 result objects in order');
  } catch (err) {
    fail('T1: rerankBatchMulti with 3 batches returns 3 result objects in order', err);
  }

  // T2: empty batches array → empty results, no HTTP call
  try {
    requestCount = 0;
    requestBodies = [];
    const res = await rerankBatchMulti([], { baseUrl });
    assert.strictEqual(requestCount, 0, 'No HTTP request should be made for empty batches');
    assert.ok(res && Array.isArray(res.results), 'Expected res.results array');
    assert.strictEqual(res.results.length, 0);
    pass('T2: empty batches array -> empty results, no HTTP call');
  } catch (err) {
    fail('T2: empty batches array -> empty results, no HTTP call', err);
  }

  // T3: > 20 batches → multiple HTTP calls (spy on fetch call count)
  try {
    requestCount = 0;
    requestBodies = [];
    mockHandler = (req, res, body) => {
      const batches = body.batches || [];
      const results = batches.map((b) => ({
        id: b.id,
        scores: (b.candidates || []).map((c) => ({ id: c.id, score: 0.85 })),
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ results, warning: null }));
    };

    // 25 batches: should chunk into 20 + 5 (2 HTTP calls)
    const batches25 = [];
    for (let i = 0; i < 25; i++) {
      batches25.push({
        id: `para-${i}`,
        query: `Paragraph query ${i}`,
        candidates: [{ id: `cand-${i}`, text: `Candidate text ${i}` }],
      });
    }

    const res = await rerankBatchMulti(batches25, { baseUrl });
    assert.strictEqual(requestCount, 2, `Expected 2 HTTP calls for 25 batches, got ${requestCount}`);
    assert.strictEqual(requestBodies[0].body.batches.length, 20, 'First slice must contain 20 batches');
    assert.strictEqual(requestBodies[1].body.batches.length, 5, 'Second slice must contain 5 batches');
    assert.strictEqual(res.results.length, 25, 'Expected 25 combined results returned');
    pass('T3: > 20 batches -> multiple HTTP calls (spy on fetch call count)');
  } catch (err) {
    fail('T3: > 20 batches -> multiple HTTP calls (spy on fetch call count)', err);
  }

  // T4: sidecar warming (503) -> RERANKER_WARMING
  try {
    requestCount = 0;
    mockHandler = (req, res) => {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'error',
        code: 'RERANKER_WARMING',
        message: 'Reranker is loading',
      }));
    };

    let caughtErr = null;
    try {
      await rerankBatchMulti([{ id: 'p-1', query: 'q', candidates: [{ id: 'c-1', text: 't' }] }], { baseUrl });
    } catch (err) {
      caughtErr = err;
    }
    assert.ok(caughtErr, 'Expected 503 to throw error');
    assert.strictEqual(caughtErr.code, 'RERANKER_WARMING', `Expected code RERANKER_WARMING, got ${caughtErr.code}`);
    pass('T4: sidecar warming (503) -> RERANKER_WARMING');
  } catch (err) {
    fail('T4: sidecar warming (503) -> RERANKER_WARMING', err);
  }

  // T5: sidecar down -> NLP_SIDECAR_UNAVAILABLE
  try {
    const offlineUrl = 'http://127.0.0.1:59997';
    let caughtErr = null;
    try {
      await rerankBatchMulti([{ id: 'p-1', query: 'q', candidates: [{ id: 'c-1', text: 't' }] }], {
        baseUrl: offlineUrl,
        timeoutMs: 500,
      });
    } catch (err) {
      caughtErr = err;
    }
    assert.ok(caughtErr, 'Expected offline sidecar to throw error');
    assert.strictEqual(
      caughtErr.code,
      'NLP_SIDECAR_UNAVAILABLE',
      `Expected NLP_SIDECAR_UNAVAILABLE, got ${caughtErr.code}`
    );
    pass('T5: sidecar down -> NLP_SIDECAR_UNAVAILABLE');
  } catch (err) {
    fail('T5: sidecar down -> NLP_SIDECAR_UNAVAILABLE', err);
  }

  // T6: partial batch failure -> error surfaced, does not silently drop
  try {
    requestCount = 0;
    mockHandler = (req, res) => {
      if (requestCount === 2) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'error',
          code: 'RERANKER_FAILED',
          message: 'Internal error on second batch',
        }));
      } else {
        const batches = requestBodies[requestBodies.length - 1].body.batches || [];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          results: batches.map((b) => ({ id: b.id, scores: [] })),
          warning: null,
        }));
      }
    };

    const batches25 = [];
    for (let i = 0; i < 25; i++) {
      batches25.push({ id: `p-${i}`, query: 'q', candidates: [{ id: `c-${i}`, text: 't' }] });
    }

    let caughtErr = null;
    try {
      await rerankBatchMulti(batches25, { baseUrl });
    } catch (err) {
      caughtErr = err;
    }
    assert.ok(caughtErr, 'Expected 500 on second batch to throw error');
    assert.strictEqual(
      caughtErr.code,
      'NLP_PROCESSING_FAILED',
      `Expected NLP_PROCESSING_FAILED, got ${caughtErr.code}`
    );
    pass('T6: partial batch failure -> error surfaced, does not silently drop');
  } catch (err) {
    fail('T6: partial batch failure -> error surfaced, does not silently drop', err);
  }

  // T7: preserves ordering between input batch ids and output result ids
  try {
    requestCount = 0;
    requestBodies = [];
    mockHandler = (req, res, body) => {
      const batches = body.batches || [];
      const results = batches.map((b) => ({
        id: b.id,
        scores: (b.candidates || []).map((c) => ({ id: c.id, score: 0.77 })),
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ results, warning: null }));
    };

    const inputBatches = [
      { id: 'batch-Z', query: 'query Z', candidates: [{ id: 'c-z', text: 'chunk z' }] },
      { id: 'batch-A', query: 'query A', candidates: [{ id: 'c-a', text: 'chunk a' }] },
      { id: 'batch-M', query: 'query M', candidates: [{ id: 'c-m', text: 'chunk m' }] },
    ];

    const res = await rerankBatchMulti(inputBatches, { baseUrl });
    assert.strictEqual(res.results.length, 3);
    assert.strictEqual(res.results[0].id, 'batch-Z');
    assert.strictEqual(res.results[1].id, 'batch-A');
    assert.strictEqual(res.results[2].id, 'batch-M');
    pass('T7: preserves ordering between input batch ids and output result ids');
  } catch (err) {
    fail('T7: preserves ordering between input batch ids and output result ids', err);
  }

  await stopServer();

  console.log('\n================================================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test failure:', err);
  process.exit(1);
});

