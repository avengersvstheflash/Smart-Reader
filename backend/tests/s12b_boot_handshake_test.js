/**
 * backend/tests/s12b_boot_handshake_test.js
 *
 * S12b Dynamic Port Assignment & Two-Stage Boot Sentinel Handshake Test.
 *
 * Invariants:
 * 1. Stage 1: Strict Regex Syntax Assertion (^__OMNITOME_BOOT__\s+([a-zA-Z0-9_\-]+)\s+port=(\d+)\s*$)
 * 2. Stage 2: Service Whitelist Validation ({python-sidecar, node-backend})
 *    - Unknown service names with valid syntax MUST pass Stage 1 but fail Stage 2.
 * 3. Node backend supports --port 0 ephemeral socket allocation and emits valid sentinel.
 * 4. Python sidecar supports --port 0 zero-TOCTOU ephemeral socket allocation and emits valid sentinel.
 */

'use strict';

const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');

const ROOT = path.resolve(__dirname, '..', '..');

const SENTINEL_REGEX = /^__OMNITOME_BOOT__\s+([a-zA-Z0-9_\-]+)\s+port=(\d+)\s*$/;
const ALLOWED_SERVICES = new Set(['python-sidecar', 'node-backend']);

/**
 * Stage 1: Syntax / Regex Matcher
 * Returns { service, port } if valid format, or null if syntax invalid.
 */
function parseSentinelSyntax(line) {
  if (typeof line !== 'string') return null;
  const match = line.trim().match(SENTINEL_REGEX);
  if (!match) return null;
  return {
    service: match[1],
    port: parseInt(match[2], 10),
  };
}

/**
 * Stage 2: Semantic / Whitelist Validator
 * Returns true if service is in allowed whitelist, false otherwise.
 */
function validateSentinelService(service) {
  return ALLOWED_SERVICES.has(service);
}

/**
 * Combined Handshake Parser
 */
function parseAndValidateSentinel(line) {
  const parsed = parseSentinelSyntax(line);
  if (!parsed) return { valid: false, stage1: false, stage2: false, parsed: null };
  const stage2 = validateSentinelService(parsed.service);
  return {
    valid: stage2,
    stage1: true,
    stage2,
    parsed: stage2 ? parsed : null,
  };
}

async function runTests() {
  console.log('=== s12b_boot_handshake_test.js ===');
  let passed = 0;

  // -------------------------------------------------------------
  // UNIT TESTS: Stage 1 & Stage 2 Independence & Rejection Matrix
  // -------------------------------------------------------------

  // Case 1: Valid python-sidecar sentinel
  {
    const line = '__OMNITOME_BOOT__ python-sidecar port=54321';
    const s1 = parseSentinelSyntax(line);
    assert(s1 !== null, 'Case 1: Stage 1 must pass');
    assert.strictEqual(s1.service, 'python-sidecar');
    assert.strictEqual(s1.port, 54321);
    assert.strictEqual(validateSentinelService(s1.service), true, 'Case 1: Stage 2 must pass');
    console.log('[PASS] T1 Valid python-sidecar sentinel passes Stage 1 & Stage 2');
    passed++;
  }

  // Case 2: Valid node-backend sentinel
  {
    const line = '__OMNITOME_BOOT__ node-backend port=34567';
    const s1 = parseSentinelSyntax(line);
    assert(s1 !== null, 'Case 2: Stage 1 must pass');
    assert.strictEqual(s1.service, 'node-backend');
    assert.strictEqual(s1.port, 34567);
    assert.strictEqual(validateSentinelService(s1.service), true, 'Case 2: Stage 2 must pass');
    console.log('[PASS] T2 Valid node-backend sentinel passes Stage 1 & Stage 2');
    passed++;
  }

  // Case 3 (Amendment 1): Unknown service with valid format MUST pass Stage 1 but FAIL Stage 2
  {
    const line = '__OMNITOME_BOOT__ unknown-service port=8000';
    const s1 = parseSentinelSyntax(line);
    assert(s1 !== null, 'Case 3: Stage 1 regex MUST match valid syntax');
    assert.strictEqual(s1.service, 'unknown-service');
    assert.strictEqual(s1.port, 8000);
    const s2 = validateSentinelService(s1.service);
    assert.strictEqual(s2, false, 'Case 3: Stage 2 whitelist MUST reject unknown-service');
    const combined = parseAndValidateSentinel(line);
    assert.strictEqual(combined.stage1, true);
    assert.strictEqual(combined.stage2, false);
    assert.strictEqual(combined.valid, false);
    console.log('[PASS] T3 Unknown service passes Stage 1 regex but fails Stage 2 whitelist validation');
    passed++;
  }

  // Case 4: Non-sentinel log line
  {
    const line = '[Boot] python-sidecar Listening on port 54321';
    assert.strictEqual(parseSentinelSyntax(line), null, 'Case 4: Stage 1 must reject non-sentinel format');
    console.log('[PASS] T4 Non-sentinel log line rejected by Stage 1');
    passed++;
  }

  // Case 5: Missing port value
  {
    const line = '__OMNITOME_BOOT__ python-sidecar port=';
    assert.strictEqual(parseSentinelSyntax(line), null, 'Case 5: Stage 1 must reject missing port');
    console.log('[PASS] T5 Missing port rejected by Stage 1');
    passed++;
  }

  // Case 6: Non-numeric port value
  {
    const line = '__OMNITOME_BOOT__ python-sidecar port=invalid';
    assert.strictEqual(parseSentinelSyntax(line), null, 'Case 6: Stage 1 must reject non-numeric port');
    console.log('[PASS] T6 Non-numeric port rejected by Stage 1');
    passed++;
  }

  // Case 7: Leading text before sentinel (strict line anchor)
  {
    const line = 'INFO: __OMNITOME_BOOT__ python-sidecar port=8000';
    assert.strictEqual(parseSentinelSyntax(line), null, 'Case 7: Stage 1 must reject line with leading prefix');
    console.log('[PASS] T7 Leading prefix rejected by Stage 1');
    passed++;
  }

  // Case 8: Trailing text after sentinel (strict line anchor)
  {
    const line = '__OMNITOME_BOOT__ python-sidecar port=8000 (extra)';
    assert.strictEqual(parseSentinelSyntax(line), null, 'Case 8: Stage 1 must reject line with trailing suffix');
    console.log('[PASS] T8 Trailing suffix rejected by Stage 1');
    passed++;
  }

  // -------------------------------------------------------------
  // INTEGRATION TEST: Node backend --port 0 ephemeral spawn
  // -------------------------------------------------------------
  {
    const serverPath = path.join(ROOT, 'backend', 'server.js');
    const child = spawn(process.execPath, [serverPath, '--port', '0'], {
      cwd: ROOT,
      env: { ...process.env, PORT: '3000' }, // Verify --port 0 overrides default PORT
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let detectedPort = null;
    let sentinelReceived = false;

    const bootPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error('Node backend timed out waiting for sentinel'));
      }, 15000);

      child.stdout.on('data', (chunk) => {
        const lines = chunk.toString().split('\n');
        for (const rawLine of lines) {
          const res = parseAndValidateSentinel(rawLine);
          if (res.valid && res.parsed.service === 'node-backend') {
            sentinelReceived = true;
            detectedPort = res.parsed.port;
            clearTimeout(timer);
            resolve();
            break;
          }
        }
      });

      child.stderr.on('data', () => {});
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    await bootPromise;
    assert.strictEqual(sentinelReceived, true, 'Node backend must emit valid boot sentinel');
    assert(detectedPort > 0 && detectedPort !== 3000, `Node backend port must be non-zero ephemeral (got ${detectedPort})`);

    // Verify port is actually listening via loopback HTTP request
    const probePromise = new Promise((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${detectedPort}/api/books`, (res) => {
        assert.strictEqual(res.statusCode, 200);
        res.resume();
        resolve();
      });
      req.on('error', reject);
    });
    await probePromise;

    child.kill();
    console.log(`[PASS] T9 Node backend --port 0 spawned on ephemeral port ${detectedPort} and emitted verified sentinel`);
    passed++;
  }

  // -------------------------------------------------------------
  // INTEGRATION TEST: Python sidecar --port 0 ephemeral spawn
  // -------------------------------------------------------------
  {
    const pyExe = path.join(ROOT, 'sidecars', 'python', '.venv', 'Scripts', 'python.exe');
    const pyScript = path.join(ROOT, 'sidecars', 'python', 'main.py');

    const child = spawn(pyExe, [pyScript, '--port', '0'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let detectedPort = null;
    let sentinelReceived = false;

    const bootPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error('Python sidecar timed out waiting for sentinel'));
      }, 25000);

      child.stdout.on('data', (chunk) => {
        const lines = chunk.toString().split('\n');
        for (const rawLine of lines) {
          const res = parseAndValidateSentinel(rawLine);
          if (res.valid && res.parsed.service === 'python-sidecar') {
            sentinelReceived = true;
            detectedPort = res.parsed.port;
            clearTimeout(timer);
            resolve();
            break;
          }
        }
      });

      child.stderr.on('data', () => {});
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    await bootPromise;
    assert.strictEqual(sentinelReceived, true, 'Python sidecar must emit valid boot sentinel');
    assert(detectedPort > 0 && detectedPort !== 8765, `Python sidecar port must be non-zero ephemeral (got ${detectedPort})`);

    // Verify port is actually listening
    const probePromise = new Promise((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${detectedPort}/v1/health`, (res) => {
        assert.strictEqual(res.statusCode, 200);
        res.resume();
        resolve();
      });
      req.on('error', reject);
    });
    await probePromise;

    child.kill();
    console.log(`[PASS] T10 Python sidecar --port 0 spawned on ephemeral port ${detectedPort} and emitted verified sentinel`);
    passed++;
  }

  console.log(`=== s12b_boot_handshake_test.js ===`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: 0`);
}

runTests().catch((err) => {
  console.error('[FAIL] s12b_boot_handshake_test failed:', err);
  process.exit(1);
});
