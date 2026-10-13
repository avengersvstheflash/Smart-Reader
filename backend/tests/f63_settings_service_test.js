/**
 * backend/tests/f63_settings_service_test.js
 *
 * Automated test suite for Settings backend infrastructure (Series 2 Deliverable 1).
 * Verifies:
 * - T1: init creates settings.json with .env defaults when missing
 * - T2: GET /api/settings returns full apiKey (localhost trust boundary)
 * - T3: PUT clamps importMaxSizeMB below 50 up to 50
 * - T4: PUT clamps importMaxSizeMB above 200 down to 200
 * - T5: PUT with invalid aiProvider rejected (400)
 * - T6: reset clears overrides and returns .env defaults
 * - T7: test-connection scrubs apiKey from error message (scrubSecret)
 * - T8: in-memory cache reflects PUT immediately (zero-I/O runtime read path)
 * - T9: PUT local provider validation (rejects invalid baseUrl)
 * - T10: PUT openrouter validation (rejects empty model)
 * - T11: /api/config/client dynamically reflects importMaxSizeMB
 */

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const config = require('../config');
const settingsService = require('../services/settings/settingsService');
const { scrubSecret } = require('../services/settings/settingsService');
const app = require('../server');

async function runSettingsTests() {
  console.log('=== RUNNING F63 SETTINGS SERVICE TEST SUITE ===');

  const settingsFilePath = settingsService.getFilePath();
  let originalFileBackup = null;
  if (fs.existsSync(settingsFilePath)) {
    originalFileBackup = fs.readFileSync(settingsFilePath, 'utf8');
  }

  // Create ephemeral HTTP test server
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // -------------------------------------------------------------------------
    // T1: init creates settings.json with .env defaults when missing
    // -------------------------------------------------------------------------
    console.log('\n[T1] init creates settings.json with .env defaults when missing');
    if (fs.existsSync(settingsFilePath)) {
      fs.unlinkSync(settingsFilePath);
    }
    assert.strictEqual(fs.existsSync(settingsFilePath), false, 'File should be removed for T1');

    const created = settingsService.init({ force: true });
    assert.strictEqual(fs.existsSync(settingsFilePath), true, 'settings.json must be created on disk');
    const diskContent = JSON.parse(fs.readFileSync(settingsFilePath, 'utf8'));

    assert.strictEqual(diskContent.version, 1);
    assert.ok(diskContent.openrouter, 'Should have openrouter config');
    assert.ok(diskContent.local, 'Should have local config');
    assert.ok(diskContent.importMaxSizeMB >= 50 && diskContent.importMaxSizeMB <= 200, 'importMaxSizeMB must be between 50 and 200');
    assert.strictEqual(created.importMaxSizeMB, diskContent.importMaxSizeMB);
    console.log('✓ T1 PASSED: settings.json created on disk with valid .env defaults');

    // -------------------------------------------------------------------------
    // T2: GET /api/settings returns full apiKey
    // -------------------------------------------------------------------------
    console.log('\n[T2] GET /api/settings returns full apiKey');
    const secretKey = 'sk-or-v1-secret-test-key-t2-localhost-trust';
    settingsService.update({
      openrouter: {
        apiKey: secretKey,
        model: 'deepseek/deepseek-v4-flash',
      },
    });

    const getRes = await fetch(`${baseUrl}/api/settings`);
    assert.strictEqual(getRes.status, 200, 'GET /api/settings should return 200');
    const getData = await getRes.json();
    assert.strictEqual(getData.openrouter?.apiKey, secretKey, 'GET /api/settings must return full apiKey on localhost');
    console.log('✓ T2 PASSED: GET /api/settings returns full apiKey across localhost trust boundary');

    // -------------------------------------------------------------------------
    // T3: PUT clamps importMaxSizeMB below 50 up to 50
    // -------------------------------------------------------------------------
    console.log('\n[T3] PUT clamps importMaxSizeMB below 50 up to 50');
    const putBelowRes = await fetch(`${baseUrl}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ importMaxSizeMB: 10 }),
    });
    assert.strictEqual(putBelowRes.status, 200, 'PUT /api/settings with low size should return 200');
    const putBelowData = await putBelowRes.json();
    assert.strictEqual(putBelowData.importMaxSizeMB, 50, 'Returned size should be clamped to 50');
    assert.strictEqual(settingsService.get().importMaxSizeMB, 50, 'In-memory size should be 50');
    assert.strictEqual(config.IMPORT_MAX_SIZE_MB, 50, 'config.IMPORT_MAX_SIZE_MB getter should be 50');
    console.log('✓ T3 PASSED: PUT correctly clamped importMaxSizeMB below 50 up to 50');

    // -------------------------------------------------------------------------
    // T4: PUT clamps importMaxSizeMB above 200 down to 200
    // -------------------------------------------------------------------------
    console.log('\n[T4] PUT clamps importMaxSizeMB above 200 down to 200');
    const putAboveRes = await fetch(`${baseUrl}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ importMaxSizeMB: 500 }),
    });
    assert.strictEqual(putAboveRes.status, 200, 'PUT /api/settings with high size should return 200');
    const putAboveData = await putAboveRes.json();
    assert.strictEqual(putAboveData.importMaxSizeMB, 200, 'Returned size should be clamped to 200');
    assert.strictEqual(settingsService.get().importMaxSizeMB, 200, 'In-memory size should be 200');
    assert.strictEqual(config.IMPORT_MAX_SIZE_MB, 200, 'config.IMPORT_MAX_SIZE_MB getter should be 200');
    console.log('✓ T4 PASSED: PUT correctly clamped importMaxSizeMB above 200 down to 200');

    // -------------------------------------------------------------------------
    // T5: PUT with invalid aiProvider rejected (400)
    // -------------------------------------------------------------------------
    console.log('\n[T5] PUT with invalid aiProvider rejected (400)');
    const putInvalidProviderRes = await fetch(`${baseUrl}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aiProvider: 'invalid-cloud-provider' }),
    });
    assert.strictEqual(putInvalidProviderRes.status, 400, 'Invalid aiProvider must return 400');
    const invalidErrData = await putInvalidProviderRes.json();
    assert.ok(invalidErrData.error, 'Must return error explanation');
    assert.notStrictEqual(settingsService.get().aiProvider, 'invalid-cloud-provider');
    console.log('✓ T5 PASSED: PUT with invalid aiProvider rejected with status 400');

    // -------------------------------------------------------------------------
    // T6: reset clears overrides and returns .env defaults
    // -------------------------------------------------------------------------
    console.log('\n[T6] reset clears overrides and returns .env defaults');
    // First customize something
    settingsService.update({
      importMaxSizeMB: 125,
      openrouter: {
        model: 'custom-override-model',
      },
    });
    assert.strictEqual(settingsService.get().importMaxSizeMB, 125);

    const resetRes = await fetch(`${baseUrl}/api/settings/reset`, {
      method: 'POST',
    });
    assert.strictEqual(resetRes.status, 200, 'POST /api/settings/reset must return 200');
    const resetData = await resetRes.json();
    const envDefaults = settingsService.get();

    assert.notStrictEqual(resetData.openrouter?.model, 'custom-override-model');
    assert.strictEqual(resetData.openrouter?.model, envDefaults.openrouter.model);
    assert.strictEqual(resetData.importMaxSizeMB, envDefaults.importMaxSizeMB);

    // Verify disk was also refreshed with defaults
    const resetDisk = JSON.parse(fs.readFileSync(settingsFilePath, 'utf8'));
    assert.strictEqual(resetDisk.openrouter?.model, envDefaults.openrouter.model);
    console.log('✓ T6 PASSED: reset restored all settings to .env defaults');

    // -------------------------------------------------------------------------
    // T7: test-connection scrubs apiKey from error message
    // -------------------------------------------------------------------------
    console.log('\n[T7] test-connection scrubs apiKey from error message');
    const bogusKey = 'sk-or-v1-bogus-token-super-sensitive-123456';
    
    // Direct scrubSecret test
    const rawError = `Failed to authorize with token ${bogusKey}: 401 Unauthorized`;
    const scrubbed = scrubSecret(rawError, bogusKey);
    assert.strictEqual(scrubbed.includes(bogusKey), false, 'scrubSecret must remove raw secret');
    assert.strictEqual(scrubbed, 'Failed to authorize with token [REDACTED]: 401 Unauthorized');

    // HTTP test against test-connection endpoint
    const testConnRes = await fetch(`${baseUrl}/api/settings/test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'openrouter',
        apiKey: bogusKey,
        model: 'deepseek/deepseek-v4-flash',
      }),
    });
    const testConnData = await testConnRes.json();
    assert.strictEqual(testConnData.success, false, 'Probe with bogus key should report success=false');
    assert.ok(testConnData.message, 'Should return error message');
    assert.strictEqual(
      testConnData.message.includes(bogusKey),
      false,
      'Error message must NOT contain bogusKey!'
    );
    console.log(`✓ T7 PASSED: test-connection scrubbed apiKey safely (result message: "${testConnData.message.slice(0, 80)}...")`);

    // -------------------------------------------------------------------------
    // T8: in-memory cache reflects PUT immediately (no disk re-read)
    // -------------------------------------------------------------------------
    console.log('\n[T8] in-memory cache reflects PUT immediately (no disk re-read)');
    let readFileSyncCalled = false;
    const originalReadFileSync = fs.readFileSync;
    
    // Put a new value
    const putRes = await fetch(`${baseUrl}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ importMaxSizeMB: 95 }),
    });
    assert.strictEqual(putRes.status, 200);

    // Spy on fs.readFileSync to guarantee zero disk I/O on reads
    fs.readFileSync = function (targetPath, ...args) {
      if (typeof targetPath === 'string' && targetPath.includes('settings.json')) {
        readFileSyncCalled = true;
      }
      return originalReadFileSync.apply(this, [targetPath, ...args]);
    };

    try {
      const memVal = settingsService.get().importMaxSizeMB;
      const configVal = config.IMPORT_MAX_SIZE_MB;
      assert.strictEqual(memVal, 95, 'Memory cache must immediately reflect PUT');
      assert.strictEqual(configVal, 95, 'config dynamic getter must immediately reflect PUT');
      assert.strictEqual(readFileSyncCalled, false, 'Must NOT re-read settings.json from disk on get()');
    } finally {
      fs.readFileSync = originalReadFileSync;
    }
    console.log('✓ T8 PASSED: Zero-I/O runtime read path verified (in-memory read without disk I/O)');

    // -------------------------------------------------------------------------
    // T9: PUT local provider validation (rejects invalid baseUrl)
    // -------------------------------------------------------------------------
    console.log('\n[T9] PUT local provider validation (rejects invalid baseUrl)');
    const putBadUrlRes = await fetch(`${baseUrl}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        local: {
          baseUrl: 'not-a-valid-url',
        },
      }),
    });
    assert.strictEqual(putBadUrlRes.status, 400, 'Invalid local.baseUrl must return 400');
    console.log('✓ T9 PASSED: local.baseUrl invalid URL rejected with 400');

    // -------------------------------------------------------------------------
    // T10: PUT openrouter validation (rejects empty model)
    // -------------------------------------------------------------------------
    console.log('\n[T10] PUT openrouter validation (rejects empty model)');
    const putEmptyModelRes = await fetch(`${baseUrl}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        openrouter: {
          model: '   ',
        },
      }),
    });
    assert.strictEqual(putEmptyModelRes.status, 400, 'Empty openrouter.model must return 400');
    console.log('✓ T10 PASSED: empty openrouter.model rejected with 400');

    // -------------------------------------------------------------------------
    // T11: GET /api/config/client reflects dynamic importMaxSizeMB
    // -------------------------------------------------------------------------
    console.log('\n[T11] GET /api/config/client reflects dynamic importMaxSizeMB');
    settingsService.update({ importMaxSizeMB: 160 });
    const clientConfigRes = await fetch(`${baseUrl}/api/config/client`);
    assert.strictEqual(clientConfigRes.status, 200);
    const clientConfigData = await clientConfigRes.json();
    assert.strictEqual(clientConfigData.maxImportSizeMB, 160, 'clientConfig must dynamically return 160');
    console.log('✓ T11 PASSED: /api/config/client dynamically reflects in-memory importMaxSizeMB');

    // -------------------------------------------------------------------------
    // T12: test-connection rejects OpenRouter when apiKey is empty/missing
    // -------------------------------------------------------------------------
    console.log('\n[T12] test-connection rejects OpenRouter when apiKey is empty/missing');
    const emptyKeyRes = await fetch(`${baseUrl}/api/settings/test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'openrouter',
        apiKey: '',
        model: 'deepseek/deepseek-v4-flash',
      }),
    });
    assert.strictEqual(emptyKeyRes.status, 200);
    const emptyKeyData = await emptyKeyRes.json();
    assert.strictEqual(emptyKeyData.success, false, 'OpenRouter with empty apiKey must fail');
    assert.ok(emptyKeyData.message.includes('API key is required'), 'Message must explain API key is required');
    console.log('✓ T12 PASSED: test-connection correctly rejects empty OpenRouter API key');

    // -------------------------------------------------------------------------
    // T13: scrubSecret scrubs URL-encoded keys and local.apiKey
    // -------------------------------------------------------------------------
    console.log('\n[T13] scrubSecret scrubs URL-encoded keys and local.apiKey');
    const tokenWithSpecialChars = 'sk-or-v1-special+token/with=chars';
    const errorWithUrlEncoded = `Error contacting https://api.example.com?auth=${encodeURIComponent(tokenWithSpecialChars)}`;
    const scrubbedEncoded = scrubSecret(errorWithUrlEncoded, tokenWithSpecialChars);
    assert.strictEqual(scrubbedEncoded.includes(tokenWithSpecialChars), false);
    assert.strictEqual(scrubbedEncoded.includes(encodeURIComponent(tokenWithSpecialChars)), false);
    assert.ok(scrubbedEncoded.includes('[REDACTED]'), 'URL-encoded token must be redacted');
    console.log('✓ T13 PASSED: scrubSecret successfully scrubs URL-encoded secrets');

    // -------------------------------------------------------------------------
    // T14: PUT rejects non-object openrouter and local payloads
    // -------------------------------------------------------------------------
    console.log('\n[T14] PUT rejects non-object openrouter and local payloads');
    const putBadOpenRouterRes = await fetch(`${baseUrl}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ openrouter: 'invalid-string' }),
    });
    assert.strictEqual(putBadOpenRouterRes.status, 400, 'openrouter as string must return 400');

    const putBadLocalRes = await fetch(`${baseUrl}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ local: 'invalid-string' }),
    });
    assert.strictEqual(putBadLocalRes.status, 400, 'local as string must return 400');
    console.log('✓ T14 PASSED: Non-object openrouter and local payloads rejected with 400');

    // -------------------------------------------------------------------------
    // T15: rapid consecutive PUT requests update cache immediately
    // -------------------------------------------------------------------------
    console.log('\n[T15] rapid consecutive PUT requests update cache immediately');
    const p1 = fetch(`${baseUrl}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ importMaxSizeMB: 70 }),
    });
    const p2 = fetch(`${baseUrl}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ importMaxSizeMB: 80 }),
    });
    const p3 = fetch(`${baseUrl}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ importMaxSizeMB: 90 }),
    });
    await Promise.all([p1, p2, p3]);
    assert.strictEqual(settingsService.get().importMaxSizeMB, 90, 'Final rapid PUT value must be 90');
    console.log('✓ T15 PASSED: Rapid consecutive PUT requests serialized cleanly');

    console.log('\n======================================================');
    console.log('🎉 ALL F63 SETTINGS SERVICE TESTS PASSED (15/15)!');
    console.log('======================================================\n');
  } finally {
    // Teardown
    await new Promise((resolve) => server.close(resolve));
    if (originalFileBackup !== null) {
      fs.writeFileSync(settingsFilePath, originalFileBackup, 'utf8');
    }
  }
}

if (require.main === module) {
  runSettingsTests()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('FAILED F63 TEST:', err);
      process.exit(1);
    });
}

module.exports = { runSettingsTests };
