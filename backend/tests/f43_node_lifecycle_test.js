/**
 * backend/tests/f43_node_lifecycle_test.js
 *
 * Phase 4 & Phase 4a Node Lifecycle Integration Test Suite
 *
 * Verifies:
 * - N1: checkModelReady('embed') against mock returning LOADED returns { ready: true, state: 'LOADED' }
 * - N2: checkModelReady('embed') against mock returning UNLOADED returns { ready: false, state: 'UNLOADED' }
 * - N3: checkModelReady falls back to checkReady when /v1/lifecycle/status returns 404
 * - N4: checkOcrReady wraps checkModelReady and returns { ready: false, reason: 'unloaded', state: 'UNLOADED' }
 * - N5: warmModel('embed') POSTs to /v1/lifecycle/warm?model=embed and returns { ok: true } on 200
 * - N6: pdfjsParser caller: warms OCR and succeeds when OCR starts in UNLOADED state
 * - N7: pdfjsParser caller: rejects honestly with clear diagnostic when sidecar is DOWN
 *
 * Uses ephemeral port (port: 0) mock HTTP server without external dependencies.
 */

'use strict';

const assert = require('node:assert');
const http = require('node:http');

const {
  checkReady,
  checkModelReady,
  warmModel,
} = require('../services/ai/sidecarBase');
const {
  checkOcrReady,
  warmOcr,
} = require('../services/ai/ocrClient');
const pythonSidecarClient = require('../services/ai/pythonSidecarClient');
const pdfjsParser = require('../services/ingestion/parsers/pdfjsParser');

/**
 * Minimal in-memory 1-page PDF buffer containing 0 selectable text characters
 * to trigger the < 20 character OCR routing branch in pdfjsParser.
 */
function createMinimalPdfBuffer() {
  const content = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 0 >>
stream
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000201 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
251
%%EOF`;
  return Buffer.from(content, 'binary');
}

async function runTests() {
  console.log('================================================================');
  console.log('🚀 RUNNING F43 PHASE 4/4A NODE LIFECYCLE TEST SUITE');
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
  console.log(`[Setup] Ephemeral mock sidecar server listening on ${mockBaseUrl}`);

  const originalEnvUrl = process.env.PYTHON_SIDECAR_URL;
  process.env.PYTHON_SIDECAR_URL = mockBaseUrl;

  try {
    // -------------------------------------------------------------------------
    // N1: checkModelReady('embed') returns { ready: true, state: 'LOADED' }
    // -------------------------------------------------------------------------
    console.log('\n[Test N1] checkModelReady(\'embed\') returns LOADED when state is LOADED');
    activeMockHandler = (req, res) => {
      if (req.url.startsWith('/v1/lifecycle/status') && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            models: {
              embed: { state: 'LOADED', in_flight: 0, idle_seconds: 12 },
              ocr: { state: 'LOADED', in_flight: 0, idle_seconds: 35 },
            },
          })
        );
        return;
      }
      res.writeHead(404);
      res.end();
    };

    const n1Res = await checkModelReady('embed', mockBaseUrl);
    assert.strictEqual(n1Res.ready, true, 'Expected n1Res.ready === true');
    assert.strictEqual(n1Res.state, 'LOADED', 'Expected n1Res.state === "LOADED"');
    assert.strictEqual(n1Res.in_flight, 0, 'Expected in_flight === 0');
    assert.strictEqual(n1Res.idle_seconds, 12, 'Expected idle_seconds === 12');
    console.log('  ✓ N1 passed: checkModelReady correctly parsed LOADED model state');

    // -------------------------------------------------------------------------
    // N2: checkModelReady('embed') returns { ready: false, state: 'UNLOADED' }
    // -------------------------------------------------------------------------
    console.log('\n[Test N2] checkModelReady(\'embed\') returns UNLOADED when state is UNLOADED');
    activeMockHandler = (req, res) => {
      if (req.url.startsWith('/v1/lifecycle/status') && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            models: {
              embed: { state: 'UNLOADED', in_flight: 0, idle_seconds: 910 },
            },
          })
        );
        return;
      }
      res.writeHead(404);
      res.end();
    };

    const n2Res = await checkModelReady('embed', mockBaseUrl);
    assert.strictEqual(n2Res.ready, false, 'Expected n2Res.ready === false');
    assert.strictEqual(n2Res.state, 'UNLOADED', 'Expected n2Res.state === "UNLOADED"');
    console.log('  ✓ N2 passed: checkModelReady correctly parsed UNLOADED model state');

    // -------------------------------------------------------------------------
    // N3: checkModelReady falls back to checkReady when /v1/lifecycle/status is 404
    // -------------------------------------------------------------------------
    console.log('\n[Test N3] checkModelReady falls back to checkReady when /v1/lifecycle/status returns 404');
    let healthCalled = false;
    activeMockHandler = (req, res) => {
      if (req.url.startsWith('/v1/lifecycle/status')) {
        res.writeHead(404);
        res.end();
        return;
      }
      if (req.url.startsWith('/v1/health') && req.method === 'GET') {
        healthCalled = true;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', service: 'python-sidecar' }));
        return;
      }
      res.writeHead(404);
      res.end();
    };

    const n3Res = await checkModelReady('embed', mockBaseUrl);
    assert.strictEqual(healthCalled, true, 'Expected /v1/health to be called as fallback');
    assert.strictEqual(n3Res.ready, true, 'Expected n3Res.ready === true on fallback');
    assert.strictEqual(n3Res.state, 'LOADED', 'Expected n3Res.state === "LOADED" on fallback');
    console.log('  ✓ N3 passed: checkModelReady cleanly fell back to /v1/health on 404');

    // -------------------------------------------------------------------------
    // N4: checkOcrReady wraps checkModelReady and returns { ready: false, reason: 'unloaded', state: 'UNLOADED' }
    // -------------------------------------------------------------------------
    console.log('\n[Test N4] checkOcrReady returns { ready: false, reason: "unloaded", state: "UNLOADED" }');
    activeMockHandler = (req, res) => {
      if (req.url.startsWith('/v1/lifecycle/status') && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            models: {
              ocr: { state: 'UNLOADED', in_flight: 0, idle_seconds: 305 },
            },
          })
        );
        return;
      }
      res.writeHead(404);
      res.end();
    };

    const n4Res = await checkOcrReady(mockBaseUrl);
    assert.strictEqual(n4Res.ready, false, 'Expected n4Res.ready === false');
    assert.strictEqual(n4Res.reason, 'unloaded', 'Expected n4Res.reason === "unloaded"');
    assert.strictEqual(n4Res.state, 'UNLOADED', 'Expected n4Res.state === "UNLOADED"');
    console.log('  ✓ N4 passed: checkOcrReady cleanly returns unloaded state for sleeping OCR');

    // -------------------------------------------------------------------------
    // N5: warmModel('embed') POSTs to /v1/lifecycle/warm?model=embed and returns { ok: true }
    // -------------------------------------------------------------------------
    console.log('\n[Test N5] warmModel(\'embed\') POSTs to /v1/lifecycle/warm?model=embed');
    let warmModelReceived = null;
    let warmMethod = null;
    activeMockHandler = (req, res) => {
      if (req.url.startsWith('/v1/lifecycle/warm')) {
        warmMethod = req.method;
        const parsedUrl = new URL(req.url, 'http://127.0.0.1');
        warmModelReceived = parsedUrl.searchParams.get('model');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            model: warmModelReceived,
            previous_state: 'UNLOADED',
            current_state: 'LOADED',
          })
        );
        return;
      }
      res.writeHead(404);
      res.end();
    };

    const n5Res = await warmModel('embed', mockBaseUrl);
    assert.strictEqual(warmMethod, 'POST', 'Expected warmModel to use POST');
    assert.strictEqual(warmModelReceived, 'embed', 'Expected query parameter model=embed');
    assert.strictEqual(n5Res.ok, true, 'Expected n5Res.ok === true');
    console.log('  ✓ N5 passed: warmModel correctly triggered POST warm endpoint and returned { ok: true }');

    // -------------------------------------------------------------------------
    // N6: pdfjsParser integration: OCR in UNLOADED state warms and completes
    // -------------------------------------------------------------------------
    console.log('\n[Test N6] pdfjsParser warms OCR and completes without 503 error when OCR is UNLOADED');
    let ocrWarmed = false;
    let ocrInvoked = false;
    activeMockHandler = (req, res) => {
      if (req.url.startsWith('/v1/lifecycle/status') && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            models: {
              ocr: { state: ocrWarmed ? 'LOADED' : 'UNLOADED', in_flight: 0 },
            },
          })
        );
        return;
      }
      if (req.url.startsWith('/v1/lifecycle/warm') && req.method === 'POST') {
        ocrWarmed = true;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, model: 'ocr', current_state: 'LOADED' }));
        return;
      }
      if (req.url === '/v1/ocr/pdf' && req.method === 'POST') {
        ocrInvoked = true;
        req.on('data', () => {});
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              status: 'success',
              pages: [
                { num: 1, text: 'Chapter 1: The Foundations of Computing. In modern times...' },
              ],
              model: 'ch_PP-OCRv4',
            })
          );
        });
        return;
      }
      res.writeHead(404);
      res.end();
    };

    const pdfBuffer = createMinimalPdfBuffer();
    const parseResult = await pdfjsParser.parse(pdfBuffer);
    assert.strictEqual(ocrWarmed, true, 'Expected warmOcr to be called before invoking OCR');
    assert.strictEqual(ocrInvoked, true, 'Expected OCR to be invoked after warming');
    assert.ok(parseResult && parseResult.chapters.length > 0, 'Expected canonical document chapters');
    console.log('  ✓ N6 passed: pdfjsParser successfully warmed OCR and parsed document');

    // -------------------------------------------------------------------------
    // N7: pdfjsParser integration: rejects honestly with clear diagnostic when sidecar is DOWN
    // -------------------------------------------------------------------------
    console.log('\n[Test N7] pdfjsParser rejects honestly when sidecar is DOWN');
    process.env.PYTHON_SIDECAR_URL = 'http://127.0.0.1:59997'; // guaranteed offline port

    let n7Error = null;
    try {
      await pdfjsParser.parse(pdfBuffer);
    } catch (err) {
      n7Error = err;
    }
    assert.ok(n7Error, 'Expected parser to throw when sidecar is offline');
    assert.ok(
      n7Error.message.includes('OCR via the Python sidecar was attempted but is unavailable'),
      `Expected honest failure error message, got: ${n7Error.message}`
    );
    console.log('  ✓ N7 passed: pdfjsParser surfaces honest failure when OCR sidecar is DOWN');

    console.log('\n================================================================');
    console.log('🎉 ALL 7 LIFECYCLE TESTS (N1–N7) PASSED');
    console.log('================================================================\n');
  } finally {
    process.env.PYTHON_SIDECAR_URL = originalEnvUrl;
    await new Promise((resolve) => server.close(resolve));
  }
}

runTests()
  .then(() => {
    setTimeout(() => process.exit(0), 50);
  })
  .catch((err) => {
    console.error('\n❌ F43 LIFECYCLE TEST SUITE FAILED:', err);
    setTimeout(() => process.exit(1), 50);
  });
