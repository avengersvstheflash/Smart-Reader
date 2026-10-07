/**
 * backend/tests/f33_surrogate_sanitize_test.js
 *
 * Test suite for F33: Surrogate sanitization in Python sidecar and NLP endpoints.
 * Verifies that lone UTF-16 surrogates (e.g. \ud835 from PDF math extractions)
 * are sanitized to U+FFFD instead of triggering UnicodeEncodeError 500s.
 * Tests Python sanitize module and mock sidecar integration.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const assert = require('assert');
const http = require('http');
const { spawnSync } = require('child_process');
const nlpClient = require('../services/ai/nlpClient');

const ROOT = path.resolve(__dirname, '..', '..');

// Find Python executable in local venv or system
function getPythonPath() {
  const venvWin = path.join(ROOT, 'sidecars', 'python', '.venv', 'Scripts', 'python.exe');
  if (fs.existsSync(venvWin)) return venvWin;
  const venvPosix = path.join(ROOT, 'sidecars', 'python', '.venv', 'bin', 'python');
  if (fs.existsSync(venvPosix)) return venvPosix;
  return 'python';
}

let server;
let serverPort;

function startMockServer() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        if (req.url === '/v1/nlp/slice' && req.method === 'POST') {
          // Mock sidecar returning sanitized slices
          const responseBody = JSON.stringify({
            units: [
              {
                sections: [
                  { id: 'sec-1', content: 'Math formula with sanitized \uFFFD symbol', wordCount: 8 }
                ],
                wordCount: 8
              }
            ]
          });
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(responseBody);
          return;
        }
        res.writeHead(404);
        res.end();
      });
    });
    server.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      resolve();
    });
  });
}

function stopMockServer() {
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
  console.log('🚀 RUNNING F33 SURROGATE SANITIZATION TEST SUITE');
  console.log('================================================================\n');

  await startMockServer();
  const mockBaseUrl = `http://127.0.0.1:${serverPort}`;
  const pythonBin = getPythonPath();

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

  // Helper to run inline Python code testing the sanitize module
  function runPythonSnippet(code) {
    const res = spawnSync(pythonBin, ['-c', code], {
      cwd: ROOT,
      encoding: 'utf-8',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
    return res;
  }

  // T1: POST /v1/nlp/slice with math alphanumeric text -> 200 (not 500)
  try {
    // 1. Direct Python endpoint invocation with surrogate
    const pyScript = `
import sys, json, asyncio
sys.path.insert(0, 'sidecars/python')
from nlp.routes import nlp_slice, SliceRequest

# Input with math alphanumeric and lone surrogate \ud835
sections = [{'content': 'Equation: \\ud835\\udc00 + lone \\ud835 in text', 'wordCount': 10}]
req = SliceRequest(sections=sections)
res = asyncio.run(nlp_slice(req))
out_bytes = json.dumps(res).encode('utf-8')
print("STATUS:200")
`;
    const pyRes = runPythonSnippet(pyScript);
    assert.strictEqual(pyRes.status, 0, `Python slice failed: ${pyRes.stderr}`);
    assert.ok(pyRes.stdout.includes('STATUS:200'), 'Expected Python slice endpoint to return 200 without UnicodeEncodeError');

    // 2. Node client call against mock sidecar
    const nodeRes = await nlpClient.sliceSections(
      [{ id: 'sec-1', content: 'Math formula: \uD835\uDC00' }],
      { baseUrl: mockBaseUrl }
    );
    assert.ok(nodeRes && Array.isArray(nodeRes.units), 'Expected valid units in slice response');
    assert.strictEqual(nodeRes.units.length, 1);
    pass('T1: POST /v1/nlp/slice with math alphanumeric text -> 200 (not 500)');
  } catch (err) {
    fail('T1: POST /v1/nlp/slice with math alphanumeric text -> 200', err);
  }

  // T2: Response body is valid UTF-8 (Buffer.from(res, 'utf8') round-trips)
  try {
    const pyScript = `
import sys, json
sys.path.insert(0, 'sidecars/python')
from nlp.sanitize import sanitize_deep

data = {'formula': 'E = \\ud835\\udc00 \\ud835'}
sanitized = sanitize_deep(data)
raw_json = json.dumps(sanitized)
# Verify Python UTF-8 encoding succeeds
utf8_bytes = raw_json.encode('utf-8')
print(raw_json)
`;
    const pyRes = runPythonSnippet(pyScript);
    assert.strictEqual(pyRes.status, 0, `UTF-8 encode check failed: ${pyRes.stderr}`);
    const jsonStr = pyRes.stdout.trim();
    // Test Node round-trip through UTF-8 Buffer
    const buf = Buffer.from(jsonStr, 'utf8');
    const roundTrip = buf.toString('utf8');
    assert.strictEqual(roundTrip, jsonStr, 'Buffer UTF-8 round-trip failed');
    assert.ok(!roundTrip.includes('\ud835'), 'Lone surrogate should not be present in output');
    pass('T2: Response body is valid UTF-8 (Buffer.from(res, \'utf8\') round-trips)');
  } catch (err) {
    fail('T2: Response body is valid UTF-8', err);
  }

  // T3: Non-ASCII text unaffected (café, naïve, 中文, emoji)
  try {
    const pyScript = `
import sys, json
sys.path.insert(0, 'sidecars/python')
from nlp.sanitize import sanitize_deep

test_str = "café, naïve, 中文, 🚀 😀"
result = sanitize_deep(test_str)
assert result == test_str, f"Mismatch: {result} != {test_str}"
print("PRESERVED")
`;
    const pyRes = runPythonSnippet(pyScript);
    assert.strictEqual(pyRes.status, 0, `Non-ASCII check failed: ${pyRes.stderr}`);
    assert.ok(pyRes.stdout.includes('PRESERVED'));
    pass('T3: Non-ASCII text unaffected (café, naïve, 中文, emoji)');
  } catch (err) {
    fail('T3: Non-ASCII text unaffected', err);
  }

  // T4: Empty string handled gracefully
  try {
    const pyScript = `
import sys
sys.path.insert(0, 'sidecars/python')
from nlp.sanitize import sanitize_deep, sanitize_surrogates

assert sanitize_surrogates("") == ""
assert sanitize_surrogates(None) is None
assert sanitize_deep("") == ""
assert sanitize_deep([]) == []
assert sanitize_deep({}) == {}
print("EMPTY_OK")
`;
    const pyRes = runPythonSnippet(pyScript);
    assert.strictEqual(pyRes.status, 0, `Empty check failed: ${pyRes.stderr}`);
    assert.ok(pyRes.stdout.includes('EMPTY_OK'));
    pass('T4: Empty string handled gracefully');
  } catch (err) {
    fail('T4: Empty string handled gracefully', err);
  }

  // T5: Nested dict with surrogate in a value -> sanitized
  try {
    const pyScript = `
import sys, json
sys.path.insert(0, 'sidecars/python')
from nlp.sanitize import sanitize_deep

nested = {
    "level1": {
        "items": [
            {"text": "valid text"},
            {"text": "lone surrogate: \\ud835 inside list"}
        ],
        "key_\\ud835": "lone surrogate in key"
    }
}

sanitized = sanitize_deep(nested)
# Verify encoding to UTF-8 bytes succeeds without UnicodeEncodeError
utf8_bytes = json.dumps(sanitized).encode('utf-8')
assert "\ud835" not in json.dumps(sanitized)
print("NESTED_SANITIZED")
`;
    const pyRes = runPythonSnippet(pyScript);
    assert.strictEqual(pyRes.status, 0, `Nested sanitize failed: ${pyRes.stderr}`);
    assert.ok(pyRes.stdout.includes('NESTED_SANITIZED'));
    pass('T5: Nested dict with surrogate in a value -> sanitized');
  } catch (err) {
    fail('T5: Nested dict with surrogate in a value -> sanitized', err);
  }

  await stopMockServer();

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

