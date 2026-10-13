/**
 * backend/tests/f52_delete_resynthesis_recovery_test.js
 *
 * Automated test suite for F52 Delete Semantics (Operations A-D),
 * 5.8f Omni Re-synthesis Endpoint, and 3-Tier Reading Progress Recovery.
 *
 * Tests:
 * - T1: Create a book with 5 chapters, mark ch 3 at 60% read
 * - T2: Execute Operation A (delete library, keep source)
 *       - Verify in_library = 0, in_research = 1
 *       - Verify lifecycle.last_read_sequence = 3
 *       - Verify chapter_name_history captured
 * - T3: Execute re-synthesis via endpoint
 *       - Verify new book row created
 *       - Verify lifecycle.re_synthesis_source_id points to dossier
 * - T4: Verify progress recovery
 *       - New smart_chapters exist
 *       - Last-read chapter has opened_at set (Tier 1 match)
 * - T5: Execute Operation C (delete source only) on a fresh test book
 *       - Verify provenance flag "Source detached" applied
 * - T6: Execute Operation B on archived book
 *       - Verify llm_usage rows survive with lifecycle_id = NULL
 * - T7: Execute Operation D (full purge)
 *       - Verify book_lifecycle row gone
 *       - Verify llm_usage rows still exist with lifecycle_id = NULL
 * - T8: Verify route filtering after each operation
 *       - GET /api/books excludes in_library=0
 *       - GET /api/sources excludes in_research=0
 */

'use strict';

const assert = require('assert');
const http = require('http');
const { getDatabase } = require('../db/database');
const bookLifecycleRepository = require('../repositories/bookLifecycleRepository');
const bookLifecycleService = require('../services/lifecycle/bookLifecycleService');
const llmUsageRepository = require('../repositories/llmUsageRepository');
const app = require('../server');

async function runF52DeleteAndResynthesisTests() {
  console.log('=== f52_delete_resynthesis_recovery_test.js ===');
  console.log('--- Phase F52 Session 4: Delete Semantics, Re-synthesis & Recovery Tests ---');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const db = getDatabase();
  const runId = `f52-s4-${Date.now()}`;
  let passedCount = 0;

  try {
    const cycleBookId = `book-cycle-${runId}`;
    const now = new Date().toISOString();
    let newOmniBookId = null;

    // -------------------------------------------------------------------------
    // T1: Create a book with 5 chapters, mark ch 3 at 60% read
    // -------------------------------------------------------------------------
    {
      db.prepare(`
        INSERT INTO books (id, title, author, description, content_type, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        cycleBookId,
        'Cycle Research Book',
        'Author S4',
        'Initial description for cycle testing.',
        'research',
        'ready',
        now,
        now
      );

      // Create 5 raw chapters
      for (let i = 1; i <= 5; i++) {
        db.prepare(`
          INSERT INTO chapters (id, book_id, number, title, content, word_count, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `ch-raw-${runId}-${i}`,
          cycleBookId,
          i,
          `Source Chapter ${i}`,
          `Content for source chapter ${i}.`,
          250,
          now,
          now
        );
      }

      // Create 5 smart chapters
      for (let i = 1; i <= 5; i++) {
        db.prepare(`
          INSERT INTO smart_chapters (id, book_id, sequence, title, status, planned_word_count, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `sc-${runId}-${i}`,
          cycleBookId,
          i,
          `Smart Chapter ${i}: Theme ${i}`,
          'generated',
          800,
          now,
          now
        );
      }

      // Ensure lifecycle
      bookLifecycleService.ensureLifecycle(cycleBookId, {
        in_library: 1,
        in_research: 1,
        lifecycle_state: 'active',
      });

      // Mark ch 3 at 60% read via endpoint
      const readRes = await fetch(`${baseUrl}/api/books/${cycleBookId}/lifecycle/read-progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterId: `sc-${runId}-3`,
          sequence: 3,
          title: 'Smart Chapter 3: Theme 3',
          scrollPct: 0.6,
        }),
      });

      assert.strictEqual(readRes.status, 200, `Expected 200, got ${readRes.status}`);
      const readBody = await readRes.json();
      assert.strictEqual(readBody.lifecycle.last_read_sequence, 3);
      assert.strictEqual(readBody.lifecycle.last_read_scroll_pct, 0.6);

      console.log('  ✓ T1: Create a book with 5 chapters, mark ch 3 at 60% read');
      passedCount++;
    }

    // -------------------------------------------------------------------------
    // T2: Execute Operation A (delete library, keep source)
    // -------------------------------------------------------------------------
    {
      const delRes = await fetch(`${baseUrl}/api/books/${cycleBookId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'A' }),
      });

      assert.strictEqual(delRes.status, 200, `Expected 200, got ${delRes.status}`);
      const delBody = await delRes.json();
      assert.strictEqual(delBody.operation, 'A');

      const lc = bookLifecycleRepository.getByBookId(cycleBookId);
      assert.strictEqual(lc.in_library, 0, 'in_library must be 0 after Operation A');
      assert.strictEqual(lc.in_research, 1, 'in_research must be 1 after Operation A');
      assert.strictEqual(lc.source_preserved, 1, 'source_preserved must be 1 after Operation A');
      assert.strictEqual(lc.last_read_sequence, 3, 'last_read_sequence must be preserved as 3');

      // Verify chapter_name_history captured
      const nameHistoryCount = db.prepare('SELECT COUNT(*) as count FROM chapter_name_history WHERE lifecycle_id = ?').get(lc.id)?.count || 0;
      assert.ok(nameHistoryCount > 0, 'chapter_name_history must have captured titles');

      console.log('  ✓ T2: Execute Operation A (delete library, keep source)');
      passedCount++;
    }

    // -------------------------------------------------------------------------
    // T3: Execute re-synthesis via endpoint
    // -------------------------------------------------------------------------
    {
      const resynthRes = await fetch(`${baseUrl}/api/resynthesis/${cycleBookId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Re-synthesized Omni Reading',
          contentType: 'omni',
        }),
      });

      assert.strictEqual(resynthRes.status, 202, `Expected 202, got ${resynthRes.status}`);
      const resynthBody = await resynthRes.json();
      assert.ok(resynthBody.taskId, 'Response must return taskId');
      assert.ok(resynthBody.bookId, 'Response must return bookId');
      assert.strictEqual(resynthBody.queued, true);

      newOmniBookId = resynthBody.bookId;

      // Verify new book row created in books table
      const newBook = db.prepare('SELECT * FROM books WHERE id = ?').get(newOmniBookId);
      assert.ok(newBook, 'New book row must exist in books table');
      assert.strictEqual(newBook.id, newOmniBookId);

      // Verify lifecycle.re_synthesis_source_id points to dossier
      const newLc = bookLifecycleRepository.getByBookId(newOmniBookId);
      assert.ok(newLc, 'Lifecycle row must exist for new book');
      assert.strictEqual(newLc.re_synthesis_source_id, cycleBookId, 're_synthesis_source_id must point to source dossier');

      console.log('  ✓ T3: Execute re-synthesis via endpoint');
      passedCount++;
    }

    // -------------------------------------------------------------------------
    // T4: Verify progress recovery
    // -------------------------------------------------------------------------
    {
      // Smart chapters exist on the new book
      const smartChapters = db.prepare('SELECT * FROM smart_chapters WHERE book_id = ? ORDER BY sequence ASC').all(newOmniBookId);
      assert.ok(smartChapters.length > 0, 'New smart_chapters must exist on re-synthesized book');

      // Last-read chapter (sequence 3) has opened_at set (Tier 1 match)
      const ch3 = smartChapters.find((c) => c.sequence === 3);
      assert.ok(ch3, 'Chapter sequence 3 must exist in new smart_chapters');
      assert.ok(ch3.opened_at !== null && ch3.opened_at !== undefined, 'Tier 1 match: opened_at must be populated on sequence 3');

      const updatedLc = bookLifecycleRepository.getByBookId(newOmniBookId);
      assert.strictEqual(updatedLc.last_read_chapter_id, ch3.id, 'last_read_chapter_id must point to the recovered chapter');

      console.log('  ✓ T4: Verify progress recovery (Tier 1 exact sequence match)');
      passedCount++;
    }

    // -------------------------------------------------------------------------
    // T5: Execute Operation C (delete source only) on a fresh test book
    // -------------------------------------------------------------------------
    {
      const freshBookId = `book-fresh-c-${runId}`;
      db.prepare(`
        INSERT INTO books (id, title, author, description, content_type, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(freshBookId, 'Fresh Book for Op C', 'Author C', 'Op C testing', 'novel', 'ready', now, now);

      const scId = `sc-fresh-${runId}-1`;
      db.prepare(`
        INSERT INTO smart_chapters (id, book_id, sequence, title, status, planned_word_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(scId, freshBookId, 1, 'Fresh Chapter 1', 'generated', 500, now, now);

      db.prepare(`
        INSERT INTO chapters (id, book_id, number, title, content, word_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(`ch-fresh-${runId}-1`, freshBookId, 1, 'Source Fresh 1', 'Content', 100, now, now);

      db.prepare(`
        INSERT INTO paragraph_attributions (id, smart_chapter_id, paragraph_index, segments_json, source_chunk_ids, weights_json, method, confidence, grounded, verified_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(`attr-${runId}-1`, scId, 0, '[]', '[]', '{}', 'heuristic', 'HIGH', 1, now);

      bookLifecycleService.ensureLifecycle(freshBookId, {
        in_library: 1,
        in_research: 1,
        lifecycle_state: 'active',
      });

      const opCRes = await fetch(`${baseUrl}/api/books/${freshBookId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'C' }),
      });

      assert.strictEqual(opCRes.status, 200, `Expected 200, got ${opCRes.status}`);
      const opCBody = await opCRes.json();
      assert.strictEqual(opCBody.operation, 'C');

      const lc = bookLifecycleRepository.getByBookId(freshBookId);
      assert.strictEqual(lc.in_research, 0, 'in_research must be 0 after Operation C');
      assert.strictEqual(lc.in_library, 1, 'in_library must remain 1 after Operation C');
      assert.strictEqual(lc.lifecycle_state, 'library_only');

      // Verify provenance flag "Source detached" applied
      const attr = db.prepare('SELECT * FROM paragraph_attributions WHERE id = ?').get(`attr-${runId}-1`);
      assert.ok(attr, 'Paragraph attribution must survive');
      assert.strictEqual(attr.fell_back, 1, 'fell_back must be set to 1');
      assert.strictEqual(attr.fallback_reason, 'Source detached', 'fallback_reason must be "Source detached"');

      console.log('  ✓ T5: Execute Operation C (delete source only) and verify "Source detached" provenance flag');
      passedCount++;
    }

    // -------------------------------------------------------------------------
    // T6: Execute Operation B on archived book
    // -------------------------------------------------------------------------
    {
      const archBookId = `book-arch-${runId}`;
      db.prepare(`
        INSERT INTO books (id, title, author, description, content_type, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(archBookId, 'Archived Book Test', 'Author B', 'Op B testing', 'novel', 'ready', now, now);

      const archLc = bookLifecycleService.ensureLifecycle(archBookId, {
        in_library: 0,
        in_research: 0,
        lifecycle_state: 'archived',
      });

      // Record llm_usage row
      const usageRow = llmUsageRepository.recordUsage({
        lifecycle_id: archLc.id,
        book_id: archBookId,
        stage: 'synthesis',
        provider: 'openrouter',
        model: 'test-model',
        prompt_tokens: 300,
        completion_tokens: 80,
        cost_estimate_usd: 0.02,
      });

      assert.strictEqual(usageRow.lifecycle_id, archLc.id);

      // Execute Operation B on archived book
      const opBRes = await fetch(`${baseUrl}/api/books/${archBookId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'B' }),
      });

      assert.strictEqual(opBRes.status, 200, `Expected 200, got ${opBRes.status}`);

      // Verify llm_usage rows survive with lifecycle_id = NULL
      const preservedUsage = db.prepare('SELECT * FROM llm_usage WHERE id = ?').get(usageRow.id);
      assert.ok(preservedUsage, 'llm_usage row must survive Operation B');
      assert.strictEqual(preservedUsage.lifecycle_id, null, 'llm_usage.lifecycle_id must be NULL');

      console.log('  ✓ T6: Execute Operation B on archived book — llm_usage survives with lifecycle_id = NULL');
      passedCount++;
    }

    // -------------------------------------------------------------------------
    // T7: Execute Operation D (full purge)
    // -------------------------------------------------------------------------
    {
      const purgeBookId = `book-purge-${runId}`;
      db.prepare(`
        INSERT INTO books (id, title, author, description, content_type, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(purgeBookId, 'Purge Book Test', 'Author D', 'Op D testing', 'novel', 'ready', now, now);

      const purgeLc = bookLifecycleService.ensureLifecycle(purgeBookId, {
        in_library: 0,
        in_research: 0,
        lifecycle_state: 'archived',
      });

      // Record llm_usage row
      const usageRowD = llmUsageRepository.recordUsage({
        lifecycle_id: purgeLc.id,
        book_id: purgeBookId,
        stage: 'classify',
        provider: 'ollama',
        model: 'llama3:8b',
        prompt_tokens: 450,
        completion_tokens: 90,
        cost_estimate_usd: 0.0,
      });

      assert.strictEqual(usageRowD.lifecycle_id, purgeLc.id);

      // Execute Operation D
      const opDRes = await fetch(`${baseUrl}/api/books/${purgeBookId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'D' }),
      });

      assert.strictEqual(opDRes.status, 200, `Expected 200, got ${opDRes.status}`);
      const opDBody = await opDRes.json();
      assert.strictEqual(opDBody.operation, 'D');

      // Verify book_lifecycle row gone
      const deletedLc = bookLifecycleRepository.getByBookId(purgeBookId);
      assert.strictEqual(deletedLc, null, 'book_lifecycle row must be purged from database');

      // Verify llm_usage rows still exist with lifecycle_id = NULL (Option 2B Accountant model)
      const survivingUsageD = db.prepare('SELECT * FROM llm_usage WHERE id = ?').get(usageRowD.id);
      assert.ok(survivingUsageD, 'llm_usage row must still exist after lifecycle purge');
      assert.strictEqual(survivingUsageD.lifecycle_id, null, 'llm_usage.lifecycle_id must be NULL via foreign key SET NULL');

      console.log('  ✓ T7: Execute Operation D (full purge) — lifecycle gone, llm_usage preserved with lifecycle_id = NULL');
      passedCount++;
    }

    // -------------------------------------------------------------------------
    // T8: Verify route filtering after each operation
    // -------------------------------------------------------------------------
    {
      // GET /api/books excludes in_library=0 (e.g. cycleBookId has in_library=0)
      const booksRes = await fetch(`${baseUrl}/api/books`);
      assert.strictEqual(booksRes.status, 200);
      const booksBody = await booksRes.json();
      const libraryBooks = booksBody.books || [];

      const cycleInLibrary = libraryBooks.find((b) => b.id === cycleBookId);
      assert.strictEqual(cycleInLibrary, undefined, 'GET /api/books must exclude book with in_library=0');

      // GET /api/sources excludes in_research=0
      // Create a test book with in_research=0
      const noResearchBookId = `book-noresearch-${runId}`;
      db.prepare(`
        INSERT INTO books (id, title, author, description, content_type, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(noResearchBookId, 'No Research Book', 'Author R', '', 'research', 'ready', now, now);

      bookLifecycleService.ensureLifecycle(noResearchBookId, {
        in_library: 1,
        in_research: 0,
        lifecycle_state: 'library_only',
      });

      const sourcesRes = await fetch(`${baseUrl}/api/books/sources`);
      assert.strictEqual(sourcesRes.status, 200);
      const sourcesBody = await sourcesRes.json();
      const sourcesList = sourcesBody.sources || [];

      const foundNoResearch = sourcesList.find((s) => s.id === noResearchBookId);
      assert.strictEqual(foundNoResearch, undefined, 'GET /api/sources must exclude book with in_research=0');

      console.log('  ✓ T8: Verify route filtering excludes in_library=0 from Library and in_research=0 from Research');
      passedCount++;
    }

    console.log(`\nAll ${passedCount}/8 tests passed successfully in f52_delete_resynthesis_recovery_test.js.`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

if (require.main === module) {
  runF52DeleteAndResynthesisTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Test failure:', err);
      process.exit(1);
    });
}

module.exports = { runF52DeleteAndResynthesisTests };
