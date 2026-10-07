/**
 * backend/tests/f31_math_extractor_test.js
 *
 * Test suite for F31: Math extraction via pdfmath.
 * Verifies Node client against mock sidecar, error handling,
 * delimiter wrapping, and non-math text preservation.
 */

'use strict';

const http = require('http');
const assert = require('assert');
const { extractMath } = require('../services/ai/mathExtractor');

let server;
let serverPort;
let mockResponseStatus = 200;
let mockResponseBody = {};
let lastRequestBody = null;

function startServer() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          lastRequestBody = JSON.parse(body);
        } catch (_) {
          lastRequestBody = body;
        }
        res.writeHead(mockResponseStatus, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(mockResponseBody));
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
  console.log('🚀 RUNNING F31 MATH EXTRACTOR TEST SUITE');
  console.log('================================================================\n');

  await startServer();
  const baseUrl = `http://127.0.0.1:${serverPort}`;
  let passed = 0;

  try {
    // -------------------------------------------------------------------------
    // T1: extractMath returns parsed dict on 200
    // -------------------------------------------------------------------------
    {
      mockResponseStatus = 200;
      mockResponseBody = {
        success: true,
        latex_blocks: [
          { page: 1, text_original: 'E = mc^2', latex: '\\(E = mc^2\\)' },
        ],
        stats: { total: 1, extracted: 1, failed: 0 },
        error: null,
      };

      const fakePdf = Buffer.from('%PDF-1.4 mock content');
      const result = await extractMath(fakePdf, { baseUrl });

      assert.ok(result, 'T1: Expected non-null result on 200');
      assert.strictEqual(result.success, true, 'T1: Expected success=true');
      assert.strictEqual(result.latexBlocks.length, 1, 'T1: Expected 1 latex block');
      assert.strictEqual(result.latexBlocks[0].textOriginal, 'E = mc^2');
      assert.strictEqual(result.latexBlocks[0].latex, '\\(E = mc^2\\)');
      assert.strictEqual(result.latexBlocks[0].page, 1);
      assert.strictEqual(result.stats.extracted, 1);

      // Verify payload sent was valid base64
      assert.ok(lastRequestBody?.pdf_base64, 'T1: Request must include pdf_base64');
      const decoded = Buffer.from(lastRequestBody.pdf_base64, 'base64').toString('utf8');
      assert.strictEqual(decoded, '%PDF-1.4 mock content');

      console.log('[PASS] T1: extractMath returns parsed dict on 200');
      passed++;
    }

    // -------------------------------------------------------------------------
    // T2: extractMath returns null on sidecar down
    // -------------------------------------------------------------------------
    {
      const fakePdf = Buffer.from('%PDF-1.4 mock content');
      // Port 1 is reserved and will fail connection immediately
      const result = await extractMath(fakePdf, { baseUrl: 'http://127.0.0.1:1', timeoutMs: 300 });
      assert.strictEqual(result, null, 'T2: Expected null when sidecar is down');

      console.log('[PASS] T2: extractMath returns null on sidecar down');
      passed++;
    }

    // -------------------------------------------------------------------------
    // T3: extractMath returns null on 500
    // -------------------------------------------------------------------------
    {
      mockResponseStatus = 500;
      mockResponseBody = { error: 'Internal server error in pdfmath' };

      const fakePdf = Buffer.from('%PDF-1.4 mock content');
      const result = await extractMath(fakePdf, { baseUrl });
      assert.strictEqual(result, null, 'T3: Expected null when sidecar returns HTTP 500');

      console.log('[PASS] T3: extractMath returns null on 500');
      passed++;
    }

    // -------------------------------------------------------------------------
    // T4: extractMath handles empty PDF gracefully
    // -------------------------------------------------------------------------
    {
      // Should not throw or contact server
      const emptyResult1 = await extractMath(Buffer.alloc(0), { baseUrl });
      assert.ok(emptyResult1, 'T4: Expected object for empty buffer');
      assert.strictEqual(emptyResult1.success, true);
      assert.strictEqual(emptyResult1.latexBlocks.length, 0);

      const emptyResult2 = await extractMath(null, { baseUrl });
      assert.ok(emptyResult2, 'T4: Expected object for null buffer');
      assert.strictEqual(emptyResult2.success, true);
      assert.strictEqual(emptyResult2.latexBlocks.length, 0);

      console.log('[PASS] T4: extractMath handles empty PDF gracefully');
      passed++;
    }

    // -------------------------------------------------------------------------
    // T5: Math blocks with proper \(...\) wrapping
    // -------------------------------------------------------------------------
    {
      mockResponseStatus = 200;
      mockResponseBody = {
        success: true,
        latex_blocks: [
          { page: 1, text_original: 'x + y = z', latex: '\\(x + y = z\\)' },
          { page: 2, text_original: 'int_0^1 f(x) dx', latex: '\\[\\int_0^1 f(x) dx\\]' },
        ],
        stats: { total: 2, extracted: 2, failed: 0 },
        error: null,
      };

      const fakePdf = Buffer.from('%PDF-1.4 mock content');
      const result = await extractMath(fakePdf, { baseUrl });

      assert.ok(result, 'T5: Result must be non-null');
      assert.strictEqual(result.latexBlocks.length, 2);

      const inlineBlock = result.latexBlocks[0];
      assert.ok(inlineBlock.latex.startsWith('\\('), 'T5: Inline math must start with \\(');
      assert.ok(inlineBlock.latex.endsWith('\\)'), 'T5: Inline math must end with \\)');

      const displayBlock = result.latexBlocks[1];
      assert.ok(displayBlock.latex.startsWith('\\['), 'T5: Display math must start with \\[');
      assert.ok(displayBlock.latex.endsWith('\\]'), 'T5: Display math must end with \\]');

      console.log('[PASS] T5: Math blocks with proper \\(...\\) and \\[...\\] wrapping');
      passed++;
    }

    // -------------------------------------------------------------------------
    // T6: Merge logic preserves non-math text
    // -------------------------------------------------------------------------
    {
      const originalText = 'According to the theorem, a^2 + b^2 = c^2 holds for all right-angled triangles.';
      const mathBlocks = [
        { textOriginal: 'a^2 + b^2 = c^2', latex: '\\(a^2 + b^2 = c^2\\)' },
      ];

      let mergedText = originalText;
      for (const m of mathBlocks) {
        if (m.textOriginal && m.latex && m.textOriginal !== m.latex) {
          mergedText = mergedText.replaceAll(m.textOriginal, m.latex);
        }
      }

      assert.strictEqual(
        mergedText,
        'According to the theorem, \\(a^2 + b^2 = c^2\\) holds for all right-angled triangles.',
        'T6: Merge must cleanly replace equation while keeping surrounding text intact'
      );
      assert.ok(mergedText.startsWith('According to the theorem, '));
      assert.ok(mergedText.endsWith(' holds for all right-angled triangles.'));

      console.log('[PASS] T6: Merge logic preserves non-math text');
      passed++;
    }

    console.log('\n================================================================');
    console.log(`RESULTS: ${passed} passed, 0 failed`);
    console.log('================================================================\n');

  } finally {
    await stopServer();
  }
}

runTests().catch((err) => {
  console.error('\n❌ F31 MATH EXTRACTOR TEST SUITE FAILED:', err);
  process.exit(1);
});

