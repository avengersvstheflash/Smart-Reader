/**
 * backend/tests/f85_kokoro_tts_sidecar_test.js
 *
 * Test suite for Series 3 S07: Kokoro TTS sidecar endpoint + Node client + cache.
 * Verifies:
 * - T1: computeSentenceHash returns stable SHA-256 across whitespace variants
 * - T2: computeSentenceHash produces different hashes for different voices
 * - T3: computeSentenceHash produces different hashes for different speeds
 * - T4: Cache MISS path writes a .wav file and returns cached:false
 * - T5: Cache HIT path returns cached:true without sidecar call
 * - T6: GET /api/tts/audio/:hash rejects invalid hash format (400)
 * - T7: GET /api/tts/audio/:hash serves an existing file with audio/wav content-type
 * - T8: Sidecar MODEL_NOT_INSTALLED propagates with correct error code (404)
 * - T9: Sidecar UNSUPPORTED_LANGUAGE propagates with correct error code (422)
 * - T10: POST /api/tts/cache/clear removes all files and reports freed bytes
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const ttsClient = require('../services/ai/ttsClient');
const app = require('../server');

function createDummyWav(durationSeconds = 1, sampleRate = 24000) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = durationSeconds * byteRate;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF chunk descriptor
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt sub-chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data sub-chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

async function runF85Tests() {
  console.log('=== RUNNING F85 KOKORO TTS TEST SUITE ===');

  let passed = 0;
  const originalTtsDir = ttsClient.TTS_CACHE_DIR;

  // 1. Start a mock sidecar server on ephemeral port
  let sidecarCallCount = 0;
  let lastSidecarPayload = null;

  const mockSidecar = http.createServer((req, res) => {
    sidecarCallCount++;
    const url = new URL(req.url, 'http://127.0.0.1');

    if (req.method === 'GET' && url.pathname === '/v1/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'python-sidecar', version: '1.0.0', ready: true }));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/v1/lifecycle/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        models: {
          tts: { state: 'LOADED', in_flight: 0, idle_seconds: 5 }
        }
      }));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/v1/tts/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ready: true,
        modelState: 'LOADED',
        installed: true,
        voices: ['af_heart', 'am_adam', 'bf_alice', 'bm_george']
      }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/v1/tts/synthesize') {
      let bodyStr = '';
      req.on('data', (chunk) => { bodyStr += chunk; });
      req.on('end', () => {
        try {
          const body = JSON.parse(bodyStr);
          lastSidecarPayload = body;

          if (body.text && body.text.includes('TRIGGER_NOT_INSTALLED')) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              status: 'error',
              code: 'MODEL_NOT_INSTALLED',
              message: 'Kokoro weights not found at sidecars/python/models/kokoro/kokoro-v0_19.pth',
              model: 'tts'
            }));
            return;
          }

          if (body.text && body.text.includes('TRIGGER_UNSUPPORTED_LANG')) {
            res.writeHead(422, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              status: 'error',
              code: 'UNSUPPORTED_LANGUAGE',
              message: 'Predominantly non-English scripts are not supported in v1.0',
              model: 'tts'
            }));
            return;
          }

          const wavBuffer = createDummyWav(1, 24000);
          res.writeHead(200, {
            'Content-Type': 'audio/wav',
            'X-TTS-Voice': body.voice || 'af_heart',
            'X-TTS-Sample-Rate': '24000',
            'X-TTS-Duration-Ms': '1000',
            'X-TTS-Character-Count': String((body.text || '').length)
          });
          res.end(wavBuffer);
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', code: 'SYNTHESIS_FAILED', message: err.message }));
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  await new Promise((resolve) => mockSidecar.listen(0, resolve));
  const mockPort = mockSidecar.address().port;
  const mockSidecarUrl = `http://127.0.0.1:${mockPort}`;

  // 2. Start Express test server on ephemeral port
  const appServer = http.createServer(app);
  await new Promise((resolve) => appServer.listen(0, resolve));
  const appPort = appServer.address().port;
  const appBaseUrl = `http://127.0.0.1:${appPort}`;

  try {
    // -------------------------------------------------------------------------
    // T1: computeSentenceHash returns stable SHA-256 across whitespace variants
    // -------------------------------------------------------------------------
    console.log('[T1] computeSentenceHash returns stable SHA-256 across whitespace variants');
    const h1 = ttsClient.computeSentenceHash('Call me Ishmael. Some years ago.');
    const h2 = ttsClient.computeSentenceHash('   Call   me   Ishmael.   Some years ago.  ');
    const h3 = ttsClient.computeSentenceHash('Call me Ishmael. [Source 1] Some years ago.');
    assert.strictEqual(h1.length, 64, 'Hash must be 64-character SHA-256 hex string');
    assert.strictEqual(h1, h2, 'Whitespace variations must produce identical hashes');
    assert.strictEqual(h1, h3, 'Citation markers must be normalized out of hash payload');
    passed++;
    console.log('✓ T1 PASSED');

    // -------------------------------------------------------------------------
    // T2: computeSentenceHash produces different hashes for different voices
    // -------------------------------------------------------------------------
    console.log('\n[T2] computeSentenceHash produces different hashes for different voices');
    const hVoiceHeart = ttsClient.computeSentenceHash('Testing voice distinction.', 'af_heart');
    const hVoiceAdam = ttsClient.computeSentenceHash('Testing voice distinction.', 'am_adam');
    assert.notStrictEqual(hVoiceHeart, hVoiceAdam, 'Different voices must yield distinct hashes');
    passed++;
    console.log('✓ T2 PASSED');

    // -------------------------------------------------------------------------
    // T3: computeSentenceHash produces different hashes for different speeds
    // -------------------------------------------------------------------------
    console.log('\n[T3] computeSentenceHash produces different hashes for different speeds');
    const hSpeedNormal = ttsClient.computeSentenceHash('Testing speed distinction.', 'af_heart', 1.0);
    const hSpeedFast = ttsClient.computeSentenceHash('Testing speed distinction.', 'af_heart', 1.25);
    assert.notStrictEqual(hSpeedNormal, hSpeedFast, 'Different speeds must yield distinct hashes');
    passed++;
    console.log('✓ T3 PASSED');

    // -------------------------------------------------------------------------
    // T4: Cache MISS path writes a .wav file and returns cached:false
    // -------------------------------------------------------------------------
    console.log('\n[T4] Cache MISS path writes a .wav file and returns cached:false');
    ttsClient.clearCache();
    sidecarCallCount = 0;
    const testSentence = 'The quick brown fox jumps over the lazy dog.';
    const resMiss = await ttsClient.synthesizeSentence({
      text: testSentence,
      voice: 'af_heart',
      speed: 1.0,
      baseUrl: mockSidecarUrl
    });

    assert.strictEqual(resMiss.cached, false, 'First request must be a cache miss');
    assert.strictEqual(fs.existsSync(resMiss.filePath), true, 'WAV file must exist on disk after miss');
    assert.ok(fs.statSync(resMiss.filePath).size > 44, 'File size must be greater than WAV header size');
    assert.strictEqual(sidecarCallCount > 0, true, 'Sidecar must be called on cache miss');
    passed++;
    console.log('✓ T4 PASSED');

    // -------------------------------------------------------------------------
    // T5: Cache HIT path returns cached:true without sidecar call
    // -------------------------------------------------------------------------
    console.log('\n[T5] Cache HIT path returns cached:true without sidecar call');
    const sidecarCallsBeforeHit = sidecarCallCount;
    const resHit = await ttsClient.synthesizeSentence({
      text: testSentence,
      voice: 'af_heart',
      speed: 1.0,
      baseUrl: mockSidecarUrl
    });

    assert.strictEqual(resHit.cached, true, 'Subsequent request must be a cache hit');
    assert.strictEqual(resHit.hash, resMiss.hash, 'Hash must match between miss and hit');
    assert.strictEqual(sidecarCallCount, sidecarCallsBeforeHit, 'Sidecar must NOT be called on cache hit');
    passed++;
    console.log('✓ T5 PASSED');

    // -------------------------------------------------------------------------
    // T6: GET /api/tts/audio/:hash rejects invalid hash format (400)
    // -------------------------------------------------------------------------
    console.log('\n[T6] GET /api/tts/audio/:hash rejects invalid hash format (400)');
    const resBadHash = await fetch(`${appBaseUrl}/api/tts/audio/invalid-hash-format`);
    assert.strictEqual(resBadHash.status, 400, 'Invalid hash format must return 400');
    const badHashJson = await resBadHash.json();
    assert.strictEqual(badHashJson.code, 'INVALID_HASH');
    passed++;
    console.log('✓ T6 PASSED');

    // -------------------------------------------------------------------------
    // T7: GET /api/tts/audio/:hash serves an existing file with audio/wav content-type
    // -------------------------------------------------------------------------
    console.log('\n[T7] GET /api/tts/audio/:hash serves an existing file with audio/wav');
    const resServe = await fetch(`${appBaseUrl}/api/tts/audio/${resMiss.hash}?voice=af_heart`);
    assert.strictEqual(resServe.status, 200, 'Existing audio hash must return 200');
    assert.strictEqual(resServe.headers.get('content-type'), 'audio/wav', 'Content-Type must be audio/wav');
    assert.strictEqual(resServe.headers.get('accept-ranges'), 'bytes', 'Must advertise Accept-Ranges');
    const audioBytes = await resServe.arrayBuffer();
    assert.ok(audioBytes.byteLength > 44, 'Audio payload must contain audio frames');
    passed++;
    console.log('✓ T7 PASSED');

    // -------------------------------------------------------------------------
    // T8: Sidecar MODEL_NOT_INSTALLED propagates with correct error code (404)
    // -------------------------------------------------------------------------
    console.log('\n[T8] Sidecar MODEL_NOT_INSTALLED propagates with correct error code (404)');
    let modelNotInstalledErr = null;
    try {
      await ttsClient.synthesizeSentence({
        text: 'This will TRIGGER_NOT_INSTALLED now.',
        voice: 'af_heart',
        speed: 1.0,
        baseUrl: mockSidecarUrl
      });
    } catch (err) {
      modelNotInstalledErr = err;
    }
    assert.ok(modelNotInstalledErr, 'Must throw error when model is not installed');
    assert.strictEqual(modelNotInstalledErr.code, 'MODEL_NOT_INSTALLED');
    assert.strictEqual(modelNotInstalledErr.status, 404);
    passed++;
    console.log('✓ T8 PASSED');

    // -------------------------------------------------------------------------
    // T9: Sidecar UNSUPPORTED_LANGUAGE propagates with correct error code (422)
    // -------------------------------------------------------------------------
    console.log('\n[T9] Sidecar UNSUPPORTED_LANGUAGE propagates (422)');
    let unsuppLangErr = null;
    try {
      await ttsClient.synthesizeSentence({
        text: 'This will TRIGGER_UNSUPPORTED_LANG now.',
        voice: 'af_heart',
        speed: 1.0,
        baseUrl: mockSidecarUrl
      });
    } catch (err) {
      unsuppLangErr = err;
    }
    assert.ok(unsuppLangErr, 'Must throw error on unsupported language');
    assert.strictEqual(unsuppLangErr.code, 'UNSUPPORTED_LANGUAGE');
    assert.strictEqual(unsuppLangErr.status, 422);
    passed++;
    console.log('✓ T9 PASSED');

    // -------------------------------------------------------------------------
    // T10: POST /api/tts/cache/clear removes all files and reports freed bytes
    // -------------------------------------------------------------------------
    console.log('\n[T10] POST /api/tts/cache/clear removes all files and reports freed bytes');
    const statsBefore = ttsClient.getCacheStats();
    assert.ok(statsBefore.totalFiles > 0, 'Cache must contain at least 1 file before clear');

    const resClear = await fetch(`${appBaseUrl}/api/tts/cache/clear`, { method: 'POST' });
    assert.strictEqual(resClear.status, 200, 'Clear cache endpoint must return 200');
    const clearJson = await resClear.json();
    assert.strictEqual(clearJson.cleared, true);
    assert.ok(clearJson.freedBytes > 0, 'freedBytes must be greater than zero');

    const statsAfter = ttsClient.getCacheStats();
    assert.strictEqual(statsAfter.totalFiles, 0, 'Total files in cache must be 0 after clear');
    passed++;
    console.log('✓ T10 PASSED');

    console.log(`\nAll ${passed} tests in f85_kokoro_tts_sidecar_test.js passed!`);
  } finally {
    // Teardown test servers
    await new Promise((resolve) => mockSidecar.close(resolve));
    await new Promise((resolve) => appServer.close(resolve));
    ttsClient.clearCache();
  }
}

if (require.main === module) {
  runF85Tests()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('f85_kokoro_tts_sidecar_test.js FAILED:', err);
      process.exit(1);
    });
}

module.exports = { runF85Tests };
