/**
 * backend/tests/s13_resource_manager_test.js
 *
 * Automated regression suite for Series 4 Session 13:
 * Resource Manager & First-Run UX.
 *
 * Validates:
 * - T1: Manifest schema validation (tar.gz format, null sha256, target subdirs)
 * - T2: Disk space pre-flight validation (rejects insufficient space with 400)
 * - T3: Status probe (correctly detects missing vs installed models)
 * - T4: Lockfile protocol (manifest.lock.json dynamic SHA-256 recording)
 * - T5: Safe archive extraction (tar.gz unpacking via staging to atomic promotion)
 * - T6: Safe zip extraction (zip unpacking via staging to atomic promotion)
 * - T7: AbortController streaming cancellation & tmp file cleanup
 * - T8: Server-Sent Events (SSE) progress streaming
 * - T9: Startup warmup guard (areAllInstalled returns false when missing)
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const tar = require('tar');
const AdmZip = require('adm-zip');

const { ResourceManager } = require('../services/resourceManager');
const app = require('../server');

async function runS13Tests() {
  console.log('=== RUNNING S13 RESOURCE MANAGER TEST SUITE ===');
  let passed = 0;

  const testTmpBase = path.join(os.tmpdir(), `omnitome_s13_test_${Date.now()}`);
  fs.mkdirSync(testTmpBase, { recursive: true });

  const testModelsDir = path.join(testTmpBase, 'models');
  fs.mkdirSync(testModelsDir, { recursive: true });

  const manager = new ResourceManager(testModelsDir);

  // Helper for HTTP requests against Express app
  let server = null;
  let serverPort = 0;

  function makeRequest(method, reqPath, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
      const opts = {
        hostname: '127.0.0.1',
        port: serverPort,
        path: reqPath,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      };

      const req = http.request(opts, (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let data = raw;
          try {
            data = JSON.parse(raw);
          } catch (_) {}
          resolve({ status: res.statusCode, headers: res.headers, data, raw });
        });
      });

      req.on('error', reject);
      if (body) {
        req.write(typeof body === 'string' ? body : JSON.stringify(body));
      }
      req.end();
    });
  }

  try {
    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        serverPort = server.address().port;
        resolve();
      });
    });

    // ----------------------------------------------------
    // T1: Manifest schema validation
    // ----------------------------------------------------
    console.log('[T1] Validating models.json manifest schema and archive targets...');
    const manifestPath = path.join(__dirname, '..', 'config', 'models.json');
    assert.ok(fs.existsSync(manifestPath), 'models.json must exist');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    assert.ok(manifest.version, 'Manifest must have version');
    assert.ok(manifest.minFreeDiskSpaceBytes >= 4000000000, 'minFreeDiskSpaceBytes must be at least 4 GB');
    assert.ok(Array.isArray(manifest.models), 'models must be an array');
    assert.strictEqual(manifest.models.length, 4, 'Must define exactly 4 core models');

    const bgeM3 = manifest.models.find((m) => m.id === 'bge-m3');
    assert.ok(bgeM3, 'bge-m3 must exist in manifest');
    assert.strictEqual(bgeM3.targetSubdir, 'sentence_transformers/models--BAAI--bge-m3');
    assert.strictEqual(bgeM3.sha256, null, 'bge-m3 initial sha256 must be null');
    const validBgeWeights = ['model.safetensors', 'pytorch_model.bin'];
    assert.ok(
      bgeM3.markerFiles.some((f) => validBgeWeights.includes(f)),
      'bge-m3 must require a valid weight file (model.safetensors or pytorch_model.bin)'
    );

    const reranker = manifest.models.find((m) => m.id === 'bge-reranker');
    assert.ok(reranker, 'bge-reranker must exist in manifest');
    assert.strictEqual(reranker.format, 'tar.gz', 'bge-reranker format must be tar.gz');
    assert.strictEqual(reranker.targetSubdir, 'sentence_transformers/models--BAAI--bge-reranker-v2-m3');
    assert.strictEqual(reranker.sha256, null, 'bge-reranker initial sha256 must be null');

    const paddleocr = manifest.models.find((m) => m.id === 'paddleocr');
    assert.ok(paddleocr, 'paddleocr must exist');
    assert.strictEqual(paddleocr.format, 'tar');

    const kokoro = manifest.models.find((m) => m.id === 'kokoro');
    assert.ok(kokoro, 'kokoro must exist');
    assert.strictEqual(kokoro.format, 'direct');
    assert.strictEqual(kokoro.targetSubdir, 'kokoro');
    assert.ok(kokoro.markerFiles.includes('kokoro-v1_0.pth'));

    passed++;
    console.log('✓ T1 PASS: Manifest schema, tar.gz format, and subdirs verified.');

    // ----------------------------------------------------
    // T2: Disk space pre-flight validation
    // ----------------------------------------------------
    console.log('[T2] Validating disk space pre-flight validation...');
    const diskCheck = await manager.checkDiskSpace(100);
    assert.strictEqual(typeof diskCheck.availableBytes, 'number');
    assert.ok(diskCheck.availableBytes > 0, 'Available disk space must be positive');
    assert.strictEqual(diskCheck.hasSpace, true);

    // Test rejection with impossible requirement (10,000 TB)
    const impossibleCheck = await manager.checkDiskSpace(1e16);
    assert.strictEqual(impossibleCheck.hasSpace, false, 'Should fail when required bytes exceed drive space');

    // Test endpoint behavior on insufficient disk space
    // Temporarily wrap startDownloads to verify 400 status
    const origCheck = manager.checkDiskSpace;
    manager.checkDiskSpace = async () => ({ availableBytes: 500, requiredBytes: 5000000000, hasSpace: false });

    // Mock startDownloads on default instance used by routes
    const defaultManager = require('../services/resourceManager');
    const origDefaultCheck = defaultManager.checkDiskSpace;
    const origDefaultIsOnline = defaultManager.isOnline;
    defaultManager.isOnline = async () => true;
    defaultManager.checkDiskSpace = async () => ({
      availableBytes: 500,
      requiredBytes: 5000000000,
      hasSpace: false,
    });

    const resFail = await makeRequest('POST', '/api/resources/download', {});
    assert.strictEqual(resFail.status, 400, 'Must return HTTP 400 for insufficient disk space');
    assert.strictEqual(resFail.data.code, 'INSUFFICIENT_DISK_SPACE');
    assert.strictEqual(resFail.data.success, false);

    defaultManager.checkDiskSpace = origDefaultCheck;
    defaultManager.isOnline = origDefaultIsOnline;
    manager.checkDiskSpace = origCheck;

    passed++;
    console.log('✓ T2 PASS: Insufficient disk space pre-flight rejection verified.');

    // ----------------------------------------------------
    // T3: Status probe (missing vs installed models)
    // ----------------------------------------------------
    console.log('[T3] Validating status probe (missing vs installed detection)...');
    assert.strictEqual(manager.areAllInstalled(), false, 'Should report false on empty test dir');

    const status1 = await manager.getStatus();
    assert.strictEqual(status1.allInstalled, false);
    assert.strictEqual(status1.models.length, 4);
    assert.ok(status1.models.every((m) => m.status === 'missing'));

    // Simulate kokoro being installed
    const kokoroDir = path.join(testModelsDir, 'kokoro');
    fs.mkdirSync(kokoroDir, { recursive: true });
    fs.writeFileSync(path.join(kokoroDir, 'kokoro-v1_0.pth'), 'dummy-weights');

    const status2 = await manager.getStatus();
    const kokoroStatus = status2.models.find((m) => m.id === 'kokoro');
    assert.strictEqual(kokoroStatus.status, 'installed', 'Kokoro should now report installed');
    assert.strictEqual(status2.allInstalled, false, 'Still false because others are missing');

    passed++;
    console.log('✓ T3 PASS: Status probe correctly distinguishes missing and installed models.');

    // ----------------------------------------------------
    // T4: Lockfile protocol (manifest.lock.json)
    // ----------------------------------------------------
    console.log('[T4] Validating dynamic lockfile pinning...');
    const dummyHash = '5617a9f61b028005a4858fdac845db406aefb181b5e0ce3470abf5ef3831aa1b';
    manager.recordLockedHash('bge-m3', dummyHash, 2240000000);

    const lockfilePath = path.join(testModelsDir, 'manifest.lock.json');
    assert.ok(fs.existsSync(lockfilePath), 'manifest.lock.json must be created');
    const lockdata = JSON.parse(fs.readFileSync(lockfilePath, 'utf8'));

    assert.ok(lockdata.models['bge-m3'], 'Lockfile must contain bge-m3 entry');
    assert.strictEqual(lockdata.models['bge-m3'].sha256, dummyHash);
    assert.strictEqual(lockdata.models['bge-m3'].sizeBytes, 2240000000);
    assert.ok(lockdata.models['bge-m3'].installedAt, 'Must record installedAt timestamp');

    passed++;
    console.log('✓ T4 PASS: Dynamic lockfile recording and persistence verified.');

    // ----------------------------------------------------
    // T5: Safe tar.gz staging extraction and atomic promotion
    // ----------------------------------------------------
    console.log('[T5] Validating safe tar.gz extraction via staging directory...');
    const tarFixtureDir = path.join(testTmpBase, 'tar_fixture');
    fs.mkdirSync(tarFixtureDir, { recursive: true });
    fs.writeFileSync(path.join(tarFixtureDir, 'model.safetensors'), 'dummy-model-safetensors');
    fs.writeFileSync(path.join(tarFixtureDir, 'config.json'), '{"architectures":["XLMRobertaModel"]}');

    const tarGzPath = path.join(testTmpBase, 'test_model.tar.gz');
    await tar.c(
      {
        gzip: true,
        file: tarGzPath,
        cwd: tarFixtureDir,
      },
      ['model.safetensors', 'config.json']
    );

    const testTarModel = {
      id: 'bge-m3',
      format: 'tar.gz',
      targetSubdir: 'sentence_transformers/models--BAAI--bge-m3',
      markerFiles: ['model.safetensors', 'config.json'],
    };

    await manager._unpackAndPromote(testTarModel, tarGzPath);

    const targetDir = path.join(testModelsDir, testTarModel.targetSubdir);
    assert.ok(fs.existsSync(targetDir), 'Target destination dir must exist');
    assert.ok(fs.existsSync(path.join(targetDir, 'model.safetensors')), 'model.safetensors must be unpacked');
    assert.ok(fs.existsSync(path.join(targetDir, 'config.json')), 'config.json must be unpacked');

    // Verify staging directory is cleaned up
    const stagingDir = path.join(testModelsDir, '.staging');
    if (fs.existsSync(stagingDir)) {
      const remainingStaging = fs.readdirSync(stagingDir);
      assert.strictEqual(remainingStaging.length, 0, 'Staging directory must be empty after promotion');
    }

    passed++;
    console.log('✓ T5 PASS: Safe tar.gz staging extraction and atomic promotion verified.');

    // ----------------------------------------------------
    // T6: Safe zip staging extraction and atomic promotion
    // ----------------------------------------------------
    console.log('[T6] Validating safe zip extraction via staging directory...');
    const zipPath = path.join(testTmpBase, 'test_model.zip');
    const zip = new AdmZip();
    zip.addFile('inference.pdmodel', Buffer.from('pdmodel-bytes'));
    zip.addFile('inference.pdiparams', Buffer.from('pdiparams-bytes'));
    zip.writeZip(zipPath);

    const testZipModel = {
      id: 'paddleocr',
      format: 'zip',
      targetSubdir: 'paddleocr/whl/rec/ch/ch_PP-OCRv4_rec_infer',
      markerFiles: ['inference.pdmodel', 'inference.pdiparams'],
    };

    await manager._unpackAndPromote(testZipModel, zipPath);

    const zipDest = path.join(testModelsDir, testZipModel.targetSubdir);
    assert.ok(fs.existsSync(zipDest), 'Zip target dir must exist');
    assert.ok(fs.existsSync(path.join(zipDest, 'inference.pdmodel')));
    assert.ok(fs.existsSync(path.join(zipDest, 'inference.pdiparams')));

    passed++;
    console.log('✓ T6 PASS: Safe zip staging extraction and atomic promotion verified.');

    // ----------------------------------------------------
    // T7: AbortController streaming cancellation & cleanup
    // ----------------------------------------------------
    console.log('[T7] Validating AbortController download cancellation and cleanup...');
    let abortServerCalls = 0;
    const slowServer = http.createServer((req, res) => {
      abortServerCalls++;
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': '1000000',
      });
      res.write(Buffer.alloc(1024, 'a'));
      // Keep socket open without sending end
    });

    let slowPort = 0;
    await new Promise((resolve) => {
      slowServer.listen(0, '127.0.0.1', () => {
        slowPort = slowServer.address().port;
        resolve();
      });
    });

    const abortModel = {
      id: 'cancel-test',
      url: `http://127.0.0.1:${slowPort}/stream`,
      sizeBytes: 1000000,
      format: 'direct',
      targetSubdir: 'cancel_test',
      markerFiles: ['file.bin'],
    };

    const downloadPromise = manager.downloadModel(abortModel);

    // Wait 150ms for stream to start and write initial bytes
    await new Promise((r) => setTimeout(r, 150));

    const tmpFile = path.join(testModelsDir, '.downloading', `${abortModel.id}.tmp`);
    assert.ok(manager.activeDownloads.has(abortModel.id), 'Active download must be registered');

    // Cancel download
    let downloadRejected = false;
    const cancelPromise = downloadPromise.catch((err) => {
      if (err.name === 'AbortError') downloadRejected = true;
    });
    manager.cancelDownload(abortModel.id);
    await cancelPromise;

    // Verify cleanup
    assert.strictEqual(manager.activeDownloads.has(abortModel.id), false, 'Active download must be removed');
    assert.strictEqual(fs.existsSync(tmpFile), false, 'Partial .tmp file must be deleted upon cancellation');
    const state = manager.modelStates.get(abortModel.id);
    assert.strictEqual(state.status, 'missing', 'State should be reset to missing');

    // Test queue abort: multiple models queued, cancel should abort the entire queue
    let model2Executed = false;
    const testQueueManager = new ResourceManager(path.join(testTmpBase, 'queue_test'));
    testQueueManager.isOnline = async () => true;
    testQueueManager.checkDiskSpace = async () => ({ hasSpace: true, availableBytes: 1e11 });
    testQueueManager.manifest.models = [
      { id: 'q1', sizeBytes: 1000, required: true, targetSubdir: 'q1' },
      { id: 'q2', sizeBytes: 1000, required: true, targetSubdir: 'q2' },
    ];
    testQueueManager.isModelInstalled = () => false;
    testQueueManager.downloadModel = async (model) => {
      if (model.id === 'q1') {
        testQueueManager.cancelDownload();
        const err = new Error('AbortError');
        err.name = 'AbortError';
        throw err;
      }
      if (model.id === 'q2') {
        model2Executed = true;
      }
    };
    await testQueueManager.startDownloads();
    await new Promise((r) => setTimeout(r, 100));
    assert.strictEqual(model2Executed, false, 'Model 2 in queue must NOT execute when queue is canceled');

    slowServer.close();
    passed++;
    console.log('✓ T7 PASS: AbortController download cancellation, queue halting, and cleanup verified.');

    // ----------------------------------------------------
    // T8: Server-Sent Events (SSE) progress streaming
    // ----------------------------------------------------
    console.log('[T8] Validating SSE progress endpoint (/api/resources/progress)...');
    const ssePromise = new Promise((resolve, reject) => {
      const req = http.get(
        `http://127.0.0.1:${serverPort}/api/resources/progress`,
        (res) => {
          assert.strictEqual(res.statusCode, 200);
          assert.ok(
            res.headers['content-type'].includes('text/event-stream'),
            'Content-Type must be text/event-stream'
          );

          let receivedData = '';
          res.on('data', (chunk) => {
            receivedData += chunk.toString();
            if (receivedData.includes('sse connected')) {
              req.destroy();
              resolve(true);
            }
          });
        }
      );
      req.on('error', (err) => {
        if (err.code === 'ECONNRESET') {
          // Expected when destroying socket
          resolve(true);
        } else {
          reject(err);
        }
      });
    });

    await ssePromise;
    passed++;
    console.log('✓ T8 PASS: Server-Sent Events headers and connected handshake verified.');

    // ----------------------------------------------------
    // T9: Startup warmup guard
    // ----------------------------------------------------
    console.log('[T9] Validating startup warmup guard...');
    const emptyManager = new ResourceManager(path.join(testTmpBase, 'empty_models'));
    assert.strictEqual(
      emptyManager.areAllInstalled(),
      false,
      'areAllInstalled must be false when model directory is empty'
    );

    // Populate all required models in testModelsDir
    const rerankerDir = path.join(testModelsDir, 'sentence_transformers', 'models--BAAI--bge-reranker-v2-m3');
    fs.mkdirSync(rerankerDir, { recursive: true });
    fs.writeFileSync(path.join(rerankerDir, 'model.safetensors'), 'weights');
    fs.writeFileSync(path.join(rerankerDir, 'config.json'), '{}');

    // paddleocr is already populated from T6
    // bge-m3 is already populated from T5
    // kokoro is already populated from T3
    assert.strictEqual(
      manager.areAllInstalled(),
      true,
      'areAllInstalled must be true when all markerFiles exist'
    );

    passed++;
    console.log('✓ T9 PASS: Startup warmup guard logic verified.');

    // ----------------------------------------------------
    // T10: Concurrent download prevention
    // ----------------------------------------------------
    console.log('[T10] Validating concurrent download prevention and queue locking...');
    const lockTestManager = new ResourceManager(path.join(testTmpBase, 'lock_test'));
    lockTestManager.isOnline = async () => true;
    lockTestManager.checkDiskSpace = async () => ({ hasSpace: true, availableBytes: 1e11 });
    lockTestManager.manifest.models = [
      { id: 'l1', sizeBytes: 1000, required: true, targetSubdir: 'l1' },
    ];
    lockTestManager.isModelInstalled = () => false;
    let concurrentCount = 0;
    let maxConcurrentCount = 0;
    lockTestManager.downloadModel = async () => {
      concurrentCount++;
      maxConcurrentCount = Math.max(maxConcurrentCount, concurrentCount);
      await new Promise((r) => setTimeout(r, 60));
      concurrentCount--;
    };
    const [d1, d2] = await Promise.all([
      lockTestManager.startDownloads(),
      lockTestManager.startDownloads(),
    ]);
    assert.strictEqual(d2.message, 'Downloads already in progress.');
    await new Promise((r) => setTimeout(r, 100));
    assert.strictEqual(maxConcurrentCount, 1, 'Never run duplicate concurrent download workers');
    passed++;
    console.log('✓ T10 PASS: Concurrent download prevention and queue locking verified.');

  } finally {
    if (server) {
      server.close();
    }
    try {
      fs.rmSync(testTmpBase, { recursive: true, force: true });
    } catch (_) {}
  }

  console.log(`\nALL ${passed}/10 S13 RESOURCE MANAGER TESTS PASS!`);
  process.exit(0);
}

runS13Tests().catch((err) => {
  console.error('\nFAILED S13 TEST:', err);
  process.exit(1);
});

