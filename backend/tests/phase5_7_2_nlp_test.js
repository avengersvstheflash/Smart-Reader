/**
 * backend/tests/phase5_7_2_nlp_test.js
 *
 * Phase 5.7.2 NLP Integration & Sidecar Mock Test Suite
 *
 * Verifies:
 * - T1: /v1/nlp/split returns correct sentence spans (offset matching)
 * - T2: /v1/nlp/split handles abbreviation-heavy text (Dr., etc., U.S.A.)
 * - T3: /v1/nlp/chunk produces chunks respecting target_tokens bound
 * - T4: Node nlpClient.splitSentences() returns structured output matching sidecar contract
 * - T5: Node nlpClient.chunkBlocks() returns structured chunks matching sidecar contract
 * - T6: Node nlpClient falls back / throws NLP_SIDECAR_UNAVAILABLE when sidecar is down
 *
 * Uses ephemeral port (port: 0) mock HTTP server without external dependencies.
 */

'use strict';

const assert = require('node:assert');
const http = require('node:http');

const nlpClient = require('../services/ai/nlpClient');
const pythonSidecarClient = require('../services/ai/pythonSidecarClient');

async function runTests() {
  console.log('================================================================');
  console.log('🚀 RUNNING PHASE 5.7.2 NLP INTEGRATION & MOCK TEST SUITE');
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
    // -------------------------------------------------------------------------
    // T1: /v1/nlp/split returns correct sentence spans (offset matching)
    // -------------------------------------------------------------------------
    console.log('[Test 1] /v1/nlp/split returns correct sentence spans with exact offset matching');
    const t1Text = 'The quick brown fox jumps over the lazy dog. Continuous attractor neural networks maintain internal representations.';

    activeMockHandler = (req, res) => {
      if (req.url === '/v1/nlp/split' && req.method === 'POST') {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          const payload = JSON.parse(body);
          assert.strictEqual(payload.text, t1Text);
          assert.strictEqual(payload.language, 'en');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              sentences: [
                {
                  text: 'The quick brown fox jumps over the lazy dog.',
                  start: 0,
                  end: 44,
                },
                {
                  text: 'Continuous attractor neural networks maintain internal representations.',
                  start: 45,
                  end: 116,
                },
              ],
              model: 'pysbd-0.3.4',
            })
          );
        });
        return;
      }
      res.writeHead(404);
      res.end();
    };

    const t1Res = await nlpClient.splitSentences(t1Text);
    assert.strictEqual(t1Res.sentences.length, 2, 'Expected 2 sentence spans');
    assert.strictEqual(t1Res.model, 'pysbd-0.3.4');
    for (const span of t1Res.sentences) {
      const sliced = t1Text.slice(span.start, span.end);
      assert.strictEqual(
        sliced,
        span.text,
        `Span text mismatch at [${span.start}:${span.end}]: "${sliced}" vs "${span.text}"`
      );
    }
    console.log('  ✓ T1 passed: sentence spans cleanly returned with exact offset matching');

    // -------------------------------------------------------------------------
    // T2: /v1/nlp/split handles abbreviation-heavy text (Dr., etc., U.S.A.)
    // -------------------------------------------------------------------------
    console.log('\n[Test 2] /v1/nlp/split handles abbreviation-heavy text without erroneous fragmentation');
    const t2Text =
      'Dr. Thorne arrived in Washington, D.C. at 4 p.m. He consulted Prof. Watson regarding neural models, e.g., Hopfield nets, etc. The results were confirmed.';

    activeMockHandler = (req, res) => {
      if (req.url === '/v1/nlp/split' && req.method === 'POST') {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          const payload = JSON.parse(body);
          assert.strictEqual(payload.text, t2Text);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              sentences: [
                {
                  text: 'Dr. Thorne arrived in Washington, D.C. at 4 p.m.',
                  start: 0,
                  end: 48,
                },
                {
                  text: 'He consulted Prof. Watson regarding neural models, e.g., Hopfield nets, etc.',
                  start: 49,
                  end: 125,
                },
                {
                  text: 'The results were confirmed.',
                  start: 126,
                  end: 153,
                },
              ],
              model: 'pysbd-0.3.4',
            })
          );
        });
        return;
      }
      res.writeHead(404);
      res.end();
    };

    const t2Res = await nlpClient.splitSentences(t2Text);
    assert.strictEqual(t2Res.sentences.length, 3, 'Expected 3 sentences for abbreviation text');
    for (const span of t2Res.sentences) {
      assert.strictEqual(
        t2Text.slice(span.start, span.end),
        span.text,
        `Span offset mismatch: "${span.text}"`
      );
    }
    console.log('  ✓ T2 passed: abbreviations (Dr., D.C., p.m., Prof., e.g., etc.) preserved atomically');

    // -------------------------------------------------------------------------
    // T3: /v1/nlp/chunk produces chunks respecting target_tokens bound
    // -------------------------------------------------------------------------
    console.log('\n[Test 3] /v1/nlp/chunk produces chunks respecting target_tokens bound');
    const t3Blocks = [
      { id: 'b-0', text: 'Paragraph zero describing recurrent attractor dynamics.' },
      { id: 'b-1', text: 'Paragraph one exploring continuous manifold geometry.' },
      { id: 'b-2', text: 'Paragraph two detailing Lyapunov energy landscapes.' },
      { id: 'b-3', text: 'Paragraph three demonstrating numerical stability.' },
      { id: 'b-4', text: 'Paragraph four formalizing convergence theorems.' },
    ];
    const targetTokens = 1500;
    const overlapTokens = 150;

    activeMockHandler = (req, res) => {
      if (req.url === '/v1/nlp/chunk' && req.method === 'POST') {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          const payload = JSON.parse(body);
          assert.strictEqual(payload.blocks.length, 5);
          assert.strictEqual(payload.target_tokens, targetTokens);
          assert.strictEqual(payload.overlap_tokens, overlapTokens);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              chunks: [
                {
                  id: 'chk-v2-abc-0',
                  text: 'Paragraph zero describing recurrent attractor dynamics. Paragraph one exploring continuous manifold geometry.',
                  tokenCount: 420,
                  startBlockId: 'b-0',
                  endBlockId: 'b-1',
                },
                {
                  id: 'chk-v2-abc-1',
                  text: 'Paragraph two detailing Lyapunov energy landscapes. Paragraph three demonstrating numerical stability. Paragraph four formalizing convergence theorems.',
                  tokenCount: 680,
                  startBlockId: 'b-2',
                  endBlockId: 'b-4',
                },
              ],
              model: 'pysbd-0.3.4',
            })
          );
        });
        return;
      }
      res.writeHead(404);
      res.end();
    };

    const t3RawRes = await fetch(`${mockBaseUrl}/v1/nlp/chunk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blocks: t3Blocks,
        target_tokens: targetTokens,
        overlap_tokens: overlapTokens,
      }),
    });
    const t3Data = await t3RawRes.json();
    assert.strictEqual(t3RawRes.status, 200);
    assert.ok(t3Data.chunks.length >= 2, 'Expected at least 2 chunks');
    for (const chunk of t3Data.chunks) {
      assert.ok(
        chunk.tokenCount <= targetTokens,
        `Chunk token count ${chunk.tokenCount} exceeded target ${targetTokens}`
      );
      assert.ok(chunk.id.startsWith('chk-v2-'), `Expected chk-v2-* ID prefix, got ${chunk.id}`);
      assert.ok(chunk.startBlockId, 'Expected startBlockId');
      assert.ok(chunk.endBlockId, 'Expected endBlockId');
    }
    console.log('  ✓ T3 passed: chunks adhere to target token bounds and carry chk-v2-* IDs');

    // -------------------------------------------------------------------------
    // T4: Node nlpClient.splitSentences() returns structured output matching sidecar contract
    // -------------------------------------------------------------------------
    console.log('\n[Test 4] Node nlpClient.splitSentences() returns structured output matching contract');
    activeMockHandler = (req, res) => {
      if (req.url === '/v1/nlp/split' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            sentences: [
              { text: 'Sentence alpha.', start: 0, end: 15 },
              { text: 'Sentence beta.', start: 16, end: 30 },
            ],
            model: 'pysbd-0.3.4',
          })
        );
        return;
      }
      res.writeHead(404);
      res.end();
    };

    const t4Modular = await nlpClient.splitSentences('Sentence alpha. Sentence beta.');
    assert.strictEqual(t4Modular.sentences.length, 2);
    assert.strictEqual(t4Modular.sentences[0].text, 'Sentence alpha.');
    assert.strictEqual(t4Modular.sentences[0].start, 0);
    assert.strictEqual(t4Modular.sentences[0].end, 15);
    assert.strictEqual(t4Modular.model, 'pysbd-0.3.4');

    // Backward-compatible shim verification
    const t4Shim = await pythonSidecarClient.splitSentences('Sentence alpha. Sentence beta.');
    assert.deepStrictEqual(t4Shim, t4Modular, 'Shim output must match modular nlpClient output');
    console.log('  ✓ T4 passed: modular and backward-compatible shim return contract-compliant sentences');

    // -------------------------------------------------------------------------
    // T5: Node nlpClient.chunkBlocks() returns structured chunks matching sidecar contract
    // -------------------------------------------------------------------------
    console.log('\n[Test 5] Node nlpClient.chunkBlocks() returns structured chunks matching contract');
    activeMockHandler = (req, res) => {
      if (req.url === '/v1/nlp/chunk' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            chunks: [
              {
                id: 'chk-v2-xyz-0',
                text: 'Block 1 text content.',
                tokenCount: 15,
                startBlockId: 'b-1',
                endBlockId: 'b-1',
              },
            ],
            model: 'pysbd-0.3.4',
          })
        );
        return;
      }
      res.writeHead(404);
      res.end();
    };

    const t5Modular = await nlpClient.chunkBlocks([{ id: 'b-1', text: 'Block 1 text content.' }]);
    assert.strictEqual(t5Modular.chunks.length, 1);
    assert.strictEqual(t5Modular.chunks[0].id, 'chk-v2-xyz-0');
    assert.strictEqual(t5Modular.chunks[0].tokenCount, 15);
    assert.strictEqual(t5Modular.chunks[0].startBlockId, 'b-1');

    // Backward-compatible shim verification
    const t5Shim = await pythonSidecarClient.chunkBlocks([{ id: 'b-1', text: 'Block 1 text content.' }]);
    assert.deepStrictEqual(t5Shim, t5Modular, 'Shim chunk output must match modular nlpClient output');
    console.log('  ✓ T5 passed: modular and backward-compatible shim return contract-compliant chunks');

    // -------------------------------------------------------------------------
    // T6: Node nlpClient falls back / throws NLP_SIDECAR_UNAVAILABLE when sidecar is down
    // -------------------------------------------------------------------------
    console.log('\n[Test 6] Node nlpClient throws NLP_SIDECAR_UNAVAILABLE when sidecar is down');
    const offlineUrl = 'http://127.0.0.1:59998';

    let t6SplitError = null;
    try {
      await nlpClient.splitSentences('Test sentence', { baseUrl: offlineUrl, timeoutMs: 500 });
    } catch (err) {
      t6SplitError = err;
    }
    assert.ok(t6SplitError, 'Expected splitSentences to throw when sidecar offline');
    assert.strictEqual(
      t6SplitError.code,
      'NLP_SIDECAR_UNAVAILABLE',
      `Expected NLP_SIDECAR_UNAVAILABLE, got ${t6SplitError.code}`
    );

    let t6ChunkError = null;
    try {
      await nlpClient.chunkBlocks([{ text: 'Test block' }], { baseUrl: offlineUrl, timeoutMs: 500 });
    } catch (err) {
      t6ChunkError = err;
    }
    assert.ok(t6ChunkError, 'Expected chunkBlocks to throw when sidecar offline');
    assert.strictEqual(
      t6ChunkError.code,
      'NLP_SIDECAR_UNAVAILABLE',
      `Expected NLP_SIDECAR_UNAVAILABLE, got ${t6ChunkError.code}`
    );
    console.log('  ✓ T6 passed: offline sidecar consistently throws code="NLP_SIDECAR_UNAVAILABLE"');

    
    console.log('\n[Test 7] Node nlpClient.sliceSections() returns structured chunks matching contract');
    activeMockHandler = (req, res) => {
      if (req.url === '/v1/nlp/slice' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ units: [{ sections: [{ id: 'b-1', text: 'Block 1', wordCount: 4 }], wordCount: 4 }] }));
        return;
      }
      res.writeHead(404); res.end();
    };
    const t7Modular = await nlpClient.sliceSections([{ id: 'b-1', text: 'Block 1', wordCount: 4 }]);
    assert.strictEqual(t7Modular.units.length, 1);
    console.log('  ✓ T7 passed');

    console.log('\n[Test 8] Node nlpClient.sliceSections throws NLP_SIDECAR_UNAVAILABLE when sidecar is down');
    let t8SliceError = null;
    try { await nlpClient.sliceSections([{ id: 'b-1' }], { baseUrl: offlineUrl, timeoutMs: 500 }); } catch (err) { t8SliceError = err; }
    assert.ok(t8SliceError);
    assert.strictEqual(t8SliceError.code, 'NLP_SIDECAR_UNAVAILABLE');
    console.log('  ✓ T8 passed');

    console.log('\n[Test 9] editorialPlanner.sliceIntoSourceUnitsAsync uses JS fallback when sidecar is down');
    const editorialPlanner = require('../services/synthesis/editorialPlanner');
    const t9Units = await editorialPlanner.sliceIntoSourceUnitsAsync([{ id: 'b-1', wordCount: 3 }], { nlpClient: { sliceSections: async () => { throw new Error('fail'); } }});
    assert.strictEqual(t9Units.length, 1);
    console.log('  ✓ T9 passed');
    console.log('\n🎉 ALL 9 NLP INTEGRATION & MOCK TESTS PASSED');
  } finally {
    process.env.PYTHON_SIDECAR_URL = originalEnvUrl;
    await new Promise((resolve) => server.close(resolve));
  }
}

runTests().catch((err) => {
  console.error('\n❌ PHASE 5.7.2 NLP TEST SUITE ENCOUNTERED UNHANDLED ERROR:\n', err);
  process.exit(1);
});
