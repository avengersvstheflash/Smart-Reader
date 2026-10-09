'use strict';

const path = require('node:path');
process.env.DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'storage', 'test-data.db');

const assert = require('node:assert');
const express = require('express');
const { getDatabase } = require('../db/database');
const smartChapterRepository = require('../repositories/smartChapterRepository');
const smartChapterRoutes = require('../routes/smartChapterRoutes');
const synthesisService = require('../services/synthesis/synthesisService');

async function run() {
  console.log('=== f38_manual_resynthesize_test.js ===');
  console.log('--- F38.1 Manual Resynthesize Claim & Route Contracts ---');

  const db = getDatabase();
  const testBookId = 'test-f38-book-' + Date.now();
  const now = new Date().toISOString();

  // Guard against any live LLM calls
  let llmCalls = 0;
  const origResynthesize = synthesisService.resynthesizeChapter;
  synthesisService.resynthesizeChapter = async () => {
    llmCalls++;
    throw new Error('FORBIDDEN: live synthesisService.resynthesizeChapter call in unit test');
  };

  // Start express test server
  const app = express();
  app.use(express.json());
  app.use('/api/smart-chapters', smartChapterRoutes);

  let server;
  let baseUrl;

  try {
    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    // Insert isolated test book
    db.prepare(`
      INSERT INTO books (id, title, author, description, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?)
    `).run(testBookId, 'Test Book F38', 'Test Author', 'Isolated test fixture', now, now);

    // Helper to insert a smart chapter
    function insertSmartChapter(id, sequence, status) {
      db.prepare(`
        INSERT INTO smart_chapters (id, book_id, sequence, title, status, planned_source_section_ids, planned_word_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, '[]', 300, ?, ?)
      `).run(id, testBookId, sequence, `Chapter ${sequence}`, status, now, now);
    }

    // T1: forceClaimForSynthesis claims a 'failed' chapter
    console.log('T1: forceClaimForSynthesis claims a \'failed\' chapter');
    const chFailedId = `test-sc-failed-${Date.now()}-1`;
    insertSmartChapter(chFailedId, 1, 'failed');
    const claimedT1 = smartChapterRepository.forceClaimForSynthesis(chFailedId);
    assert.strictEqual(claimedT1, true, 'forceClaimForSynthesis should return true for failed chapter');
    const chAfterT1 = smartChapterRepository.getById(chFailedId);
    assert.strictEqual(chAfterT1.status, 'generating', 'Status should transition from failed to generating');
    console.log('  PASS: forceClaimForSynthesis successfully claimed failed chapter');

    // T2: forceClaimForSynthesis does NOT claim a 'generating' chapter
    console.log('T2: forceClaimForSynthesis does NOT claim a \'generating\' chapter');
    const chGenId = `test-sc-gen-${Date.now()}-2`;
    insertSmartChapter(chGenId, 2, 'generating');
    const claimedT2 = smartChapterRepository.forceClaimForSynthesis(chGenId);
    assert.strictEqual(claimedT2, false, 'forceClaimForSynthesis without force should return false for generating chapter');
    const claimedT2Force = smartChapterRepository.forceClaimForSynthesis(chGenId, { force: true });
    assert.strictEqual(claimedT2Force, false, 'forceClaimForSynthesis with force=true should also reject generating chapter');
    const chAfterT2 = smartChapterRepository.getById(chGenId);
    assert.strictEqual(chAfterT2.status, 'generating', 'Status should remain generating');
    console.log('  PASS: forceClaimForSynthesis correctly rejected generating chapter');

    // T3: forceClaimForSynthesis with force=true claims a 'generated' chapter
    console.log('T3: forceClaimForSynthesis with force=true claims a \'generated\' chapter');
    const chGenSuccessId = `test-sc-generated-${Date.now()}-3`;
    insertSmartChapter(chGenSuccessId, 3, 'generated');
    const claimedT3 = smartChapterRepository.forceClaimForSynthesis(chGenSuccessId, { force: true });
    assert.strictEqual(claimedT3, true, 'forceClaimForSynthesis with force=true should claim generated chapter');
    const chAfterT3 = smartChapterRepository.getById(chGenSuccessId);
    assert.strictEqual(chAfterT3.status, 'generating', 'Status should transition from generated to generating with force=true');
    console.log('  PASS: forceClaimForSynthesis with force=true claimed generated chapter');

    // T4: forceClaimForSynthesis without force does NOT claim 'generated'
    console.log('T4: forceClaimForSynthesis without force does NOT claim \'generated\'');
    const chGenNoForceId = `test-sc-generated-${Date.now()}-4`;
    insertSmartChapter(chGenNoForceId, 4, 'generated');
    const claimedT4 = smartChapterRepository.forceClaimForSynthesis(chGenNoForceId);
    assert.strictEqual(claimedT4, false, 'forceClaimForSynthesis without force should return false for generated chapter');
    const claimedT4Explicit = smartChapterRepository.forceClaimForSynthesis(chGenNoForceId, { force: false });
    assert.strictEqual(claimedT4Explicit, false, 'forceClaimForSynthesis with force=false should return false for generated chapter');
    const chAfterT4 = smartChapterRepository.getById(chGenNoForceId);
    assert.strictEqual(chAfterT4.status, 'generated', 'Status should remain generated');
    console.log('  PASS: forceClaimForSynthesis without force rejected generated chapter');

    // T5: POST /api/smart-chapters/:id/resynthesize returns 404 for unknown id
    console.log('T5: POST /api/smart-chapters/:id/resynthesize returns 404 for unknown id');
    const unknownId = 'non-existent-smart-chapter-id-999';
    const resT5 = await fetch(`${baseUrl}/api/smart-chapters/${unknownId}/resynthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.strictEqual(resT5.status, 404, 'Expected HTTP 404 for unknown smart chapter id');
    const bodyT5 = await resT5.json();
    assert.ok(bodyT5.error && bodyT5.error.includes('not found'), 'Expected 404 body to contain "not found" error');
    console.log('  PASS: Endpoint returned 404 for unknown chapter');

    // T6: POST .../resynthesize returns 409 for 'generating' chapter
    console.log('T6: POST .../resynthesize returns 409 for \'generating\' chapter');
    const chRouteGenId = `test-sc-route-gen-${Date.now()}-6`;
    insertSmartChapter(chRouteGenId, 6, 'generating');
    const resT6 = await fetch(`${baseUrl}/api/smart-chapters/${chRouteGenId}/resynthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.strictEqual(resT6.status, 409, 'Expected HTTP 409 for generating chapter');
    const bodyT6 = await resT6.json();
    assert.ok(bodyT6.error && bodyT6.error.includes('currently generating'), 'Expected 409 body to contain "currently generating" error');
    console.log('  PASS: Endpoint returned 409 for generating chapter');

    // T7: POST .../resynthesize returns 409 for 'generated' without force
    console.log('T7: POST .../resynthesize returns 409 for \'generated\' without force');
    const chRouteGenNoForceId = `test-sc-route-gen-${Date.now()}-7`;
    insertSmartChapter(chRouteGenNoForceId, 7, 'generated');
    const resT7 = await fetch(`${baseUrl}/api/smart-chapters/${chRouteGenNoForceId}/resynthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: false }),
    });
    assert.strictEqual(resT7.status, 409, 'Expected HTTP 409 for generated chapter without force');
    const bodyT7 = await resT7.json();
    assert.ok(bodyT7.error && bodyT7.error.includes('already generated'), 'Expected 409 body to contain "already generated" error');
    console.log('  PASS: Endpoint returned 409 for generated chapter without force');

    // Verify 0 live LLM calls were made across the suite
    assert.strictEqual(llmCalls, 0, 'Zero live LLM calls expected');
    console.log('\n--- ALL T1-T7 PASSED (0 live LLM calls) ---');
  } finally {
    // Teardown: close server
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    // Clean up test fixtures from DB
    try {
      db.prepare('DELETE FROM smart_chapters WHERE book_id = ?').run(testBookId);
      db.prepare('DELETE FROM books WHERE id = ?').run(testBookId);
    } catch { /* ignore cleanup error */ }

    // Restore stubbed service
    synthesisService.resynthesizeChapter = origResynthesize;
  }
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('FAILED: f38_manual_resynthesize_test.js', err);
    process.exit(1);
  });

