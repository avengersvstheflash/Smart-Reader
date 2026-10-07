/**
 * backend/tests/f34_rerank_batch_test.js
 *
 * Test suite for F34 / Phase 5.8p.1: Batch rerank endpoint and client.
 * Verifies batching of >75 candidates, order preservation, error handling
 * (warming 503, offline sidecar, partial batch 500), and empty candidate handling.
 * Uses ephemeral mock HTTP server (no real Python sidecar process required).
 */

'use strict';

const http = require('http');
const assert = require('assert');
const { rerankCandidatesBatch } = require('../services/ai/nlpClient');

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
          res.end(JSON.stringify({ scores: [], warning: null }));
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
  console.log('🚀 RUNNING F34 BATCH RERANK TEST SUITE');
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

  // T1: rerankCandidatesBatch returns scores in input order on 200
  try {
    requestCount = 0;
    requestBodies = [];
    mockHandler = (req, res, body) => {
      assert.strictEqual(req.url, '/v1/nlp/rerank-batch');
      assert.strictEqual(req.method, 'POST');
      const candidates = body.candidates || [];
      const scores = candidates.map((c, idx) => ({
        id: c.id,
        score: Number((0.95 - idx * 0.1).toFixed(2)),
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ scores, warning: null }));
    };

    const inputCandidates = [
      { id: 'c-1', text: 'Candidate one text' },
      { id: 'c-2', text: 'Candidate two text' },
      { id: 'c-3', text: 'Candidate three text' },
    ];

    const res = await rerankCandidatesBatch('sample query', inputCandidates, { baseUrl });
    assert.ok(res && Array.isArray(res.scores), 'Expected res.scores array');
    assert.strictEqual(res.scores.length, 3);
    assert.strictEqual(res.scores[0].id, 'c-1');
    assert.strictEqual(res.scores[0].score, 0.95);
    assert.strictEqual(res.scores[1].id, 'c-2');
    assert.strictEqual(res.scores[1].score, 0.85);
    assert.strictEqual(res.scores[2].id, 'c-3');
    assert.strictEqual(res.scores[2].score, 0.75);
    pass('T1: rerankCandidatesBatch returns scores in input order on 200');
  } catch (err) {
    fail('T1: rerankCandidatesBatch returns scores in input order on 200', err);
  }

  // T2: batches >75 candidates into multiple HTTP calls (spy on fetch)
  try {
    requestCount = 0;
    requestBodies = [];
    mockHandler = (req, res, body) => {
      const candidates = body.candidates || [];
      const scores = candidates.map((c) => ({
        id: c.id,
        score: 0.8,
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ scores, warning: null }));
    };

    // 80 candidates: should split into 75 + 5 (2 HTTP calls)
    const candidates80 = [];
    for (let i = 0; i < 80; i++) {
      candidates80.push({ id: `cand-${i}`, text: `Candidate text for chunk ${i}` });
    }

    const res = await rerankCandidatesBatch('batch query', candidates80, { baseUrl });
    assert.strictEqual(requestCount, 2, `Expected 2 HTTP calls for 80 candidates, got ${requestCount}`);
    assert.strictEqual(requestBodies[0].body.candidates.length, 75, 'First batch should have 75 candidates');
    assert.strictEqual(requestBodies[1].body.candidates.length, 5, 'Second batch should have 5 candidates');
    assert.strictEqual(res.scores.length, 80, 'Expected 80 combined scores returned');
    pass('T2: batches >75 candidates into multiple HTTP calls (spy on fetch)');
  } catch (err) {
    fail('T2: batches >75 candidates into multiple HTTP calls', err);
  }

  // T3: sidecar warming (503) -> RERANKER_WARMING
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
      await rerankCandidatesBatch('query', [{ id: 'c-1', text: 'txt' }], { baseUrl });
    } catch (err) {
      caughtErr = err;
    }
    assert.ok(caughtErr, 'Expected 503 to throw error');
    assert.strictEqual(caughtErr.code, 'RERANKER_WARMING', `Expected code RERANKER_WARMING, got ${caughtErr.code}`);
    pass('T3: sidecar warming (503) -> RERANKER_WARMING');
  } catch (err) {
    fail('T3: sidecar warming (503)', err);
  }

  // T4: sidecar down -> NLP_SIDECAR_UNAVAILABLE
  try {
    const offlineUrl = 'http://127.0.0.1:59998';
    let caughtErr = null;
    try {
      await rerankCandidatesBatch('query', [{ id: 'c-1', text: 'txt' }], { baseUrl: offlineUrl, timeoutMs: 500 });
    } catch (err) {
      caughtErr = err;
    }
    assert.ok(caughtErr, 'Expected offline sidecar to throw error');
    assert.strictEqual(caughtErr.code, 'NLP_SIDECAR_UNAVAILABLE', `Expected NLP_SIDECAR_UNAVAILABLE, got ${caughtErr.code}`);
    pass('T4: sidecar down -> NLP_SIDECAR_UNAVAILABLE');
  } catch (err) {
    fail('T4: sidecar down', err);
  }

  // T5: empty candidates -> returns empty array without HTTP call
  try {
    requestCount = 0;
    const res = await rerankCandidatesBatch('query', [], { baseUrl });
    assert.ok(res && Array.isArray(res.scores), 'Expected res.scores array');
    assert.strictEqual(res.scores.length, 0, 'Expected empty scores array');
    assert.strictEqual(requestCount, 0, 'Expected 0 HTTP calls for empty candidates');

    const resNull = await rerankCandidatesBatch('query', null, { baseUrl });
    assert.ok(resNull && Array.isArray(resNull.scores), 'Expected resNull.scores array');
    assert.strictEqual(resNull.scores.length, 0);
    assert.strictEqual(requestCount, 0, 'Expected 0 HTTP calls for null candidates');
    pass('T5: empty candidates -> returns empty array without HTTP call');
  } catch (err) {
    fail('T5: empty candidates', err);
  }

  // T6: partial batch failure -> reports error, does not silently drop
  try {
    requestCount = 0;
    mockHandler = (req, res, body) => {
      // First batch (candidates 0..74) succeeds, second batch fails with 500
      if (requestCount === 1) {
        const scores = body.candidates.map((c) => ({ id: c.id, score: 0.9 }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ scores, warning: null }));
      } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', code: 'RERANKER_FAILED', message: 'Inference OOM' }));
      }
    };

    const candidates100 = [];
    for (let i = 0; i < 100; i++) {
      candidates100.push({ id: `c-${i}`, text: `text ${i}` });
    }

    let caughtErr = null;
    try {
      await rerankCandidatesBatch('query', candidates100, { baseUrl });
    } catch (err) {
      caughtErr = err;
    }
    assert.ok(caughtErr, 'Expected error on second batch failure');
    assert.strictEqual(caughtErr.code, 'NLP_PROCESSING_FAILED', `Expected NLP_PROCESSING_FAILED, got ${caughtErr.code}`);
    pass('T6: partial batch failure -> reports error, does not silently drop');
  } catch (err) {
    fail('T6: partial batch failure', err);
  }

  // T7: preserves ordering between input and output
  try {
    requestCount = 0;
    mockHandler = (req, res, body) => {
      const candidates = body.candidates || [];
      const scores = candidates.map((c, idx) => ({
        id: c.id,
        score: Number((1.0 / (idx + 1)).toFixed(4)),
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ scores, warning: null }));
    };

    const candidates100 = [];
    for (let i = 0; i < 100; i++) {
      candidates100.push({ id: `ordered-${i}`, text: `Ordering check chunk ${i}` });
    }

    const res = await rerankCandidatesBatch('ordering query', candidates100, { baseUrl });
    assert.strictEqual(res.scores.length, 100, 'Expected all 100 candidate scores');
    for (let i = 0; i < 100; i++) {
      assert.strictEqual(res.scores[i].id, `ordered-${i}`, `Mismatch at index ${i}: expected ordered-${i}, got ${res.scores[i].id}`);
    }
    pass('T7: preserves ordering between input and output');
  } catch (err) {
    fail('T7: preserves ordering between input and output', err);
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
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});

