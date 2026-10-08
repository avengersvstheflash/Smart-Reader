/**
 * backend/tests/f37_python_embedder_default_test.js
 *
 * Verifies F37:
 * T1: With no USE_PYTHON_EMBEDDER env var -> config value is true
 * T2: With USE_PYTHON_EMBEDDER=true -> config value is true
 * T3: With USE_PYTHON_EMBEDDER=false -> config value is false
 * T4: bgeEmbeddingProvider.getName() returns python sidecar when config is true
 * T5: bgeEmbeddingProvider.getName() returns node xenova when config is false
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const config = require('../config');
const { bgeProvider, bgeEmbeddingProvider } = require('../services/semantic/embeddings/bgeEmbeddingProvider');

function testConfigWithEnv(val) {
  const origEnv = process.env.USE_PYTHON_EMBEDDER;
  if (val === undefined) {
    delete process.env.USE_PYTHON_EMBEDDER;
  } else {
    process.env.USE_PYTHON_EMBEDDER = val;
  }

  const configPath = require.resolve('../config');
  delete require.cache[configPath];

  const origReadFileSync = fs.readFileSync;
  if (val === undefined) {
    fs.readFileSync = function (...args) {
      const res = origReadFileSync.apply(this, args);
      if (typeof res === 'string' && typeof args[0] === 'string' && args[0].endsWith('.env')) {
        return res.replace(/^\s*USE_PYTHON_EMBEDDER\s*=.*$/gm, '');
      }
      return res;
    };
  }

  try {
    const loadedConfig = require('../config');
    return loadedConfig.USE_PYTHON_EMBEDDER;
  } finally {
    fs.readFileSync = origReadFileSync;
    if (origEnv === undefined) {
      delete process.env.USE_PYTHON_EMBEDDER;
    } else {
      process.env.USE_PYTHON_EMBEDDER = origEnv;
    }
    delete require.cache[configPath];
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('🚀 RUNNING F37 PYTHON EMBEDDER DEFAULT TEST SUITE');
  console.log('================================================================\n');

  // T1: With no USE_PYTHON_EMBEDDER env var -> config value is true
  const t1Val = testConfigWithEnv(undefined);
  assert.strictEqual(t1Val, true, 'T1 failed: Default USE_PYTHON_EMBEDDER must be true when env var is unset');
  console.log('[PASS] T1: With no USE_PYTHON_EMBEDDER env var -> config value is true');

  // T2: With USE_PYTHON_EMBEDDER=true -> config value is true
  const t2Val = testConfigWithEnv('true');
  assert.strictEqual(t2Val, true, 'T2 failed: USE_PYTHON_EMBEDDER must be true when set to "true"');
  console.log('[PASS] T2: With USE_PYTHON_EMBEDDER=true -> config value is true');

  // T3: With USE_PYTHON_EMBEDDER=false -> config value is false
  const t3Val = testConfigWithEnv('false');
  assert.strictEqual(t3Val, false, 'T3 failed: USE_PYTHON_EMBEDDER must be false when set to "false"');
  console.log('[PASS] T3: With USE_PYTHON_EMBEDDER=false -> config value is false');

  // T4: bgeEmbeddingProvider.getName() returns python sidecar when config is true
  const origConfigVal = config.USE_PYTHON_EMBEDDER;
  try {
    config.USE_PYTHON_EMBEDDER = true;
    const nameTrue = (bgeEmbeddingProvider || bgeProvider).getName();
    assert.ok(
      nameTrue.includes('Python sidecar') || nameTrue === 'BGE-M3 (1024d, Python sidecar fp32)' || nameTrue === 'python-sidecar-bge-m3',
      `T4 failed: expected python sidecar name, got: ${nameTrue}`
    );
    console.log(`[PASS] T4: bgeEmbeddingProvider.getName() returns '${nameTrue}' when config is true`);

    // T5: bgeEmbeddingProvider.getName() returns node xenova when config is false
    config.USE_PYTHON_EMBEDDER = false;
    const nameFalse = (bgeEmbeddingProvider || bgeProvider).getName();
    assert.ok(
      nameFalse.includes('Xenova') || nameFalse === 'BGE-M3 (1024d, Xenova/bge-m3 q8)' || nameFalse === 'node-xenova-bge-m3',
      `T5 failed: expected node xenova name, got: ${nameFalse}`
    );
    console.log(`[PASS] T5: bgeEmbeddingProvider.getName() returns '${nameFalse}' when config is false`);
  } finally {
    config.USE_PYTHON_EMBEDDER = origConfigVal;
  }

  console.log('\n================================================================');
  console.log('RESULTS: 5 passed, 0 failed');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('F37 test suite failed:', err);
  process.exit(1);
});

