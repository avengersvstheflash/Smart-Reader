/**
 * backend/tests/f79b_append_source_test.js
 *
 * Test suite for F79b: Append source to research dossier.
 *
 * Tests:
 * - T1: POST /append-source with sourceType='paste' returns 200 with taskId
 * - T2: Invalid dossierId (not research type) returns 404
 * - T3: Invalid sourceType returns 400
 * - T4: After paste completes, dossier_append_log has one row for dossierId
 * - T5: Dossier's chapters count increased (source attached to existing)
 */

'use strict';

const assert = require('assert');
const http = require('http');
const { getDatabase } = require('../db/database');
const bookService = require('../services/bookService');
const importQueueRepository = require('../repositories/importQueueRepository');
const appendLogRepository = require('../repositories/appendLogRepository');
const chapterRepository = require('../repositories/chapterRepository');
const app = require('../server');

async function postJson(url, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const urlObj = new URL(url);

    const req = http.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            resolve({ status: res.statusCode, body: parsed });
          } catch {
            resolve({ status: res.statusCode, raw: body });
          }
        });
      }
    );

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function waitForTask(taskId, maxWaitMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const task = importQueueRepository.getById(taskId);
    if (!task) {
      await new Promise((r) => setTimeout(r, 100));
      continue;
    }
    if (task.status === 'completed' || task.status === 'failed') {
      return task;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Task ${taskId} timed out after ${maxWaitMs}ms`);
}

async function runF79bTests() {
  console.log('=== f79b_append_source_test.js ===');
  console.log('--- Phase F79b: Append Source to Dossier Tests ---');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const db = getDatabase();
  const runId = `f79b-${Date.now()}`;
  const now = new Date().toISOString();

  let t1TaskId = null;
  let testDossierId = null;
  let novelId = null;

  try {
    const booksCountStart = db.prepare('SELECT COUNT(*) as c FROM books').get().c;

    // Setup target dossier
    const dossier = bookService.createDossier({
      title: `F79b Research Dossier ${runId}`,
      author: 'Lead Researcher',
      description: 'Dossier created for F79b append source automated testing.',
    });
    testDossierId = dossier.id;

    // Check initial chapter count
    const initialChapters = chapterRepository.getByBookId(testDossierId);
    assert.strictEqual(initialChapters.length, 0, 'New dossier must start with 0 chapters');

    // -------------------------------------------------------------------------
    // T1: POST /append-source with sourceType='paste' returns 200 with taskId
    // -------------------------------------------------------------------------
    console.log("Test 1: POST /append-source with sourceType='paste' returns 200 with taskId");
    const pastePayload = {
      sourceType: 'paste',
      payload: {
        title: 'Initial Quantum Research Notes',
        author: 'Dr. Test',
        text: 'Quantum decoherence is the loss of quantum coherence. In quantum mechanics, particles such as electrons are described by a wave function, a mathematical representation of the state of a system. This document outlines various observations and findings regarding quantum error correction and topological qubits.',
      },
    };

    const res1 = await postJson(`${baseUrl}/api/books/${testDossierId}/append-source`, pastePayload);
    assert.strictEqual(res1.status, 200, `POST /append-source should return 200, got ${res1.status}`);
    assert.ok(res1.body.taskId, 'Response must include taskId');
    assert.strictEqual(res1.body.dossierId, testDossierId, 'Response must return the target dossierId');
    t1TaskId = res1.body.taskId;
    console.log(`  ✓ T1 passed: taskId=${t1TaskId}, dossierId=${res1.body.dossierId}`);

    // -------------------------------------------------------------------------
    // T2: Invalid dossierId (not research type) returns 404
    // -------------------------------------------------------------------------
    console.log('Test 2: Invalid dossierId (non-existent or not research type) returns 404');
    // 2a: non-existent ID
    const res2a = await postJson(`${baseUrl}/api/books/non-existent-${runId}/append-source`, pastePayload);
    assert.strictEqual(res2a.status, 404, 'Non-existent dossierId must return 404');

    // 2b: book exists but content_type is 'novel'
    const novel = bookService.createBook({
      id: `novel-${runId}`,
      title: 'Standard Novel',
      author: 'Novelist',
      content_type: 'novel',
      status: 'active',
    });
    novelId = novel.id;
    const res2b = await postJson(`${baseUrl}/api/books/${novel.id}/append-source`, pastePayload);
    assert.strictEqual(res2b.status, 404, 'Non-research book must return 404');
    console.log('  ✓ T2 passed: non-existent ID and novel book return 404');

    // -------------------------------------------------------------------------
    // T3: Invalid sourceType returns 400
    // -------------------------------------------------------------------------
    console.log('Test 3: Invalid sourceType returns 400');
    const invalidTypeRes = await postJson(`${baseUrl}/api/books/${testDossierId}/append-source`, {
      sourceType: 'unsupported_source_type',
      payload: { text: 'Some text' },
    });
    assert.strictEqual(invalidTypeRes.status, 400, 'Invalid sourceType must return 400');
    console.log('  ✓ T3 passed: invalid sourceType returns 400');

    // -------------------------------------------------------------------------
    // T4: After paste completes, dossier_append_log has one row for dossierId
    // -------------------------------------------------------------------------
    console.log('Test 4: After paste completes, dossier_append_log has one row for dossierId');
    const taskResult = await waitForTask(t1TaskId);
    assert.strictEqual(taskResult.status, 'completed', `Task should complete successfully: ${taskResult.error_message || ''}`);

    const appendLogs = appendLogRepository.getByDossierId(testDossierId);
    assert.strictEqual(appendLogs.length, 1, 'dossier_append_log must contain exactly 1 entry for this dossier');
    assert.strictEqual(appendLogs[0].dossier_id, testDossierId, 'Append log dossier_id must match');
    assert.strictEqual(appendLogs[0].source_type, 'paste', "Append log source_type must be 'paste'");
    assert.strictEqual(appendLogs[0].file_name, 'Initial Quantum Research Notes', 'Append log file_name must match document title');
    assert.ok(appendLogs[0].file_hash, 'Append log file_hash must be generated');
    assert.ok(appendLogs[0].word_count > 0, `Append log word_count must be > 0 (got ${appendLogs[0].word_count})`);
    console.log(`  ✓ T4 passed: 1 append log entry found with word_count=${appendLogs[0].word_count}, hash=${appendLogs[0].file_hash.substring(0, 8)}...`);

    // -------------------------------------------------------------------------
    // T5: Dossier's chapters count increased (source attached to existing)
    // -------------------------------------------------------------------------
    console.log("Test 5: Dossier's chapters count increased (source attached to existing)");
    const updatedChapters = chapterRepository.getByBookId(testDossierId);
    assert.ok(updatedChapters.length > initialChapters.length, `Chapter count must increase from ${initialChapters.length} to >= 1 (got ${updatedChapters.length})`);
    assert.strictEqual(updatedChapters[0].book_id, testDossierId, 'Appended chapter must belong to target dossier');
    console.log(`  ✓ T5 passed: dossier chapter count increased from 0 to ${updatedChapters.length}`);

    // -------------------------------------------------------------------------
    // T6: POST /append-source with sourceType='file' (base64 text document)
    // -------------------------------------------------------------------------
    console.log("Test 6: POST /append-source with sourceType='file' appends chapters and records file log");
    const fileContent = '# Chapter from File\n\nThis is an attached file source containing important research notes about quantum algorithms and entanglement circuits in superconducting systems.';
    const fileBufferBase64 = Buffer.from(fileContent, 'utf8').toString('base64');
    const fileRes = await postJson(`${baseUrl}/api/books/${testDossierId}/append-source`, {
      sourceType: 'file',
      payload: {
        fileBuffer: fileBufferBase64,
        originalFilename: 'quantum_algorithms.md',
        title: 'Quantum Algorithms File',
      },
    });
    assert.strictEqual(fileRes.status, 200, `File append should return 200, got ${fileRes.status}`);
    assert.ok(fileRes.body.taskId, 'File append response must have taskId');
    const fileTask = await waitForTask(fileRes.body.taskId);
    assert.strictEqual(fileTask.status, 'completed', `File task should complete: ${fileTask.error_message || ''}`);

    const fileAppendLogs = appendLogRepository.getByDossierId(testDossierId);
    assert.strictEqual(fileAppendLogs.length, 2, 'dossier_append_log must now contain 2 entries (paste + file)');
    const fileLog = fileAppendLogs.find((l) => l.source_type === 'file');
    assert.ok(fileLog, 'Must find append log entry with source_type=file');
    assert.strictEqual(fileLog.file_name, 'quantum_algorithms.md');
    assert.ok(fileLog.word_count > 0, 'File log word count must be > 0');

    const postFileChapters = chapterRepository.getByBookId(testDossierId);
    assert.ok(postFileChapters.length > updatedChapters.length, 'Chapter count must increase after file append');
    console.log(`  ✓ T6 passed: file attached, chapter count grew to ${postFileChapters.length}, file log recorded`);

    // -------------------------------------------------------------------------
    // T7: Corrupt/empty file append fails the queue task without creating empty chapters
    // -------------------------------------------------------------------------
    console.log('Test 7: Corrupt/empty file fails task cleanly and does not append corrupt chapter');
    const corruptBufferBase64 = Buffer.from('', 'utf8').toString('base64'); // empty buffer
    // Sending empty base64 will fail route validation with 400
    const emptyFileRes = await postJson(`${baseUrl}/api/books/${testDossierId}/append-source`, {
      sourceType: 'file',
      payload: {
        fileBuffer: corruptBufferBase64,
        originalFilename: 'corrupt.pdf',
      },
    });
    assert.strictEqual(emptyFileRes.status, 400, 'Empty file buffer must return 400 at route validation');

    // Test task-level failure when file parsing fails (e.g. invalid PDF header)
    const badPdfBuffer = Buffer.from('NOT_A_REAL_PDF_HEADER_DATA', 'utf8').toString('base64');
    const badPdfRes = await postJson(`${baseUrl}/api/books/${testDossierId}/append-source`, {
      sourceType: 'file',
      payload: {
        fileBuffer: badPdfBuffer,
        originalFilename: 'invalid.pdf',
      },
    });
    assert.strictEqual(badPdfRes.status, 200, 'Bad PDF accepts upload and queues task');
    const badPdfTask = await waitForTask(badPdfRes.body.taskId);
    assert.strictEqual(badPdfTask.status, 'failed', 'Bad PDF ingestion task must end with status failed');

    // Verify dossier was NOT polluted with empty chapters from failed task
    const postFailChapters = chapterRepository.getByBookId(testDossierId);
    assert.strictEqual(postFailChapters.length, postFileChapters.length, 'Chapters count must not increase after failed task');
    const postFailLogs = appendLogRepository.getByDossierId(testDossierId);
    assert.strictEqual(postFailLogs.length, 2, 'Append log count must not increase after failed task');
    console.log('  ✓ T7 passed: bad PDF failed task cleanly without polluting dossier');

    // -------------------------------------------------------------------------
    // T8: Invariant check: appending sources never creates a new book in books table
    // -------------------------------------------------------------------------
    console.log('Test 8: Invariant check: appending source does NOT create a new book');
    const booksCountNow = db.prepare('SELECT COUNT(*) as c FROM books').get().c;
    assert.strictEqual(
      booksCountNow,
      booksCountStart + 2,
      `Expected exactly 2 books (test dossier + test novel) added to library, found delta ${booksCountNow - booksCountStart}`
    );
    console.log('  ✓ T8 passed: zero unwanted books created in library');

    console.log('\nAll F79b Append Source to Dossier tests passed successfully!');
  } finally {
    server.close();
    // Clean up test data
    if (testDossierId) {
      db.prepare('DELETE FROM dossier_append_log WHERE dossier_id = ?').run(testDossierId);
      db.prepare('DELETE FROM chapters WHERE book_id = ?').run(testDossierId);
      db.prepare('DELETE FROM books WHERE id = ?').run(testDossierId);
    }
    if (novelId) {
      db.prepare('DELETE FROM books WHERE id = ?').run(novelId);
    }
    db.prepare('DELETE FROM dossier_append_log WHERE dossier_id LIKE ?').run(`%${runId}%`);
    db.prepare('DELETE FROM chapters WHERE book_id LIKE ?').run(`%${runId}%`);
    db.prepare('DELETE FROM books WHERE id LIKE ?').run(`%${runId}%`);
    db.prepare('DELETE FROM import_queue WHERE source_title LIKE ? OR id = ?').run(`%${runId}%`, t1TaskId);
  }
}

if (require.main === module) {
  runF79bTests().catch((err) => {
    console.error('F79b tests failed:', err);
    process.exit(1);
  });
}

module.exports = { runF79bTests };

