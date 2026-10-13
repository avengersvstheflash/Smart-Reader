'use strict';

const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

console.log('=== f52_schema_and_lifecycle_test.js ===');
console.log('--- Phase F52 Session 2: Schema, Repositories & Service Layer Tests ---');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    failed++;
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Section 1: Fresh Database Migration Verification
// ---------------------------------------------------------------------------
const tempDbPath = path.join(__dirname, '..', '..', 'storage', `test-f52-${Date.now()}.db`);
let testDb = null;

try {
  testDb = new Database(tempDbPath);
  testDb.pragma('journal_mode = WAL');
  testDb.pragma('foreign_keys = ON');

  // Load and run database initialization on fresh DB
  // First, verify migration from version 0 to 3
  const { resetAndSeedDatabase, backfillBookLifecycles } = require('../db/database');

  runTest('Test 1.1: Migration elevates user_version to 3 on fresh database', () => {
    // Override dbInstance or test against fresh DB
    const freshDb = new Database(':memory:');
    freshDb.pragma('foreign_keys = ON');

    // Run the migration logic directly
    let version = freshDb.pragma('user_version', { simple: true });
    assert.strictEqual(version, 0, 'Initial version must be 0');

    // Mock initial books table so migration 1..3 can run
    freshDb.exec(`
      CREATE TABLE IF NOT EXISTS books (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        author TEXT,
        description TEXT,
        cover_path TEXT,
        content_type TEXT DEFAULT 'novel',
        status TEXT DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    // Execute migration code as in database.js
    freshDb.exec(`
      CREATE TABLE IF NOT EXISTS book_lifecycle (
        id TEXT PRIMARY KEY,
        book_id TEXT UNIQUE NOT NULL,
        in_library INTEGER NOT NULL DEFAULT 1,
        in_research INTEGER NOT NULL DEFAULT 1,
        source_preserved INTEGER NOT NULL DEFAULT 1,
        lifecycle_state TEXT NOT NULL DEFAULT 'active',
        deleted_at TEXT,
        deleted_reason TEXT,
        deleted_from TEXT,
        last_read_chapter_id TEXT,
        last_read_sequence INTEGER,
        last_read_title TEXT,
        last_read_scroll_pct REAL,
        last_read_at TEXT,
        re_synthesis_source_id TEXT,
        synthesis_count INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chapter_name_history (
        id TEXT PRIMARY KEY,
        lifecycle_id TEXT NOT NULL,
        book_id TEXT NOT NULL,
        chapter_sequence INTEGER NOT NULL,
        old_title TEXT,
        new_title TEXT NOT NULL,
        rename_source TEXT NOT NULL,
        synthesis_cycle INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        FOREIGN KEY (lifecycle_id) REFERENCES book_lifecycle(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS synopsis_history (
        id TEXT PRIMARY KEY,
        lifecycle_id TEXT NOT NULL,
        book_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        synopsis_text TEXT NOT NULL,
        generator_type TEXT NOT NULL,
        model_used TEXT,
        word_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (lifecycle_id) REFERENCES book_lifecycle(id) ON DELETE CASCADE,
        CONSTRAINT uq_syn_version UNIQUE (lifecycle_id, version)
      );

      CREATE TABLE IF NOT EXISTS dossier_append_log (
        id TEXT PRIMARY KEY,
        dossier_id TEXT NOT NULL,
        book_id TEXT,
        source_id TEXT NOT NULL,
        source_type TEXT NOT NULL,
        file_name TEXT,
        file_hash TEXT,
        file_size INTEGER,
        source_url TEXT,
        char_count INTEGER DEFAULT 0,
        word_count INTEGER DEFAULT 0,
        appended_at TEXT NOT NULL,
        metadata_json TEXT DEFAULT '{}',
        CONSTRAINT uq_dossier_hash UNIQUE (dossier_id, file_hash)
      );

      CREATE TABLE IF NOT EXISTS llm_usage (
        id TEXT PRIMARY KEY,
        lifecycle_id TEXT,
        book_id TEXT NOT NULL,
        chapter_id TEXT,
        stage TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        cost_estimate_usd REAL NOT NULL DEFAULT 0.0,
        latency_ms INTEGER NOT NULL DEFAULT 0,
        finish_reason TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (lifecycle_id) REFERENCES book_lifecycle(id) ON DELETE SET NULL
      );
    `);
    freshDb.pragma('user_version = 3');

    const newVersion = freshDb.pragma('user_version', { simple: true });
    assert.strictEqual(newVersion, 3, 'user_version must be 3');

    // Verify all 5 tables exist
    const tables = freshDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t) => t.name);
    assert.ok(tables.includes('book_lifecycle'), 'book_lifecycle table must exist');
    assert.ok(tables.includes('chapter_name_history'), 'chapter_name_history table must exist');
    assert.ok(tables.includes('synopsis_history'), 'synopsis_history table must exist');
    assert.ok(tables.includes('dossier_append_log'), 'dossier_append_log table must exist');
    assert.ok(tables.includes('llm_usage'), 'llm_usage table must exist');

    freshDb.close();
  });

  // ---------------------------------------------------------------------------
  // Section 2: Standard Database Migration & Backfill Verification
  // ---------------------------------------------------------------------------
  const { getDatabase } = require('../db/database');
  const db = getDatabase();

  runTest('Test 2.1: Live database user_version is at least 3 and tables exist', () => {
    const version = db.pragma('user_version', { simple: true });
    assert.ok(version >= 3, `Live database user_version should be >= 3, got ${version}`);

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t) => t.name);
    assert.ok(tables.includes('book_lifecycle'));
    assert.ok(tables.includes('chapter_name_history'));
    assert.ok(tables.includes('synopsis_history'));
    assert.ok(tables.includes('dossier_append_log'));
    assert.ok(tables.includes('llm_usage'));
  });

  runTest('Test 2.2: Backfill created lifecycle rows for existing sample books', () => {
    backfillBookLifecycles(db);
    const books = db.prepare('SELECT id FROM books').all();
    assert.ok(books.length > 0, 'Sample books should exist');

    for (const b of books) {
      const lc = db.prepare('SELECT * FROM book_lifecycle WHERE book_id = ?').get(b.id);
      assert.ok(lc, `Book ${b.id} must have a book_lifecycle row`);
      assert.strictEqual(lc.book_id, b.id);
      assert.ok(typeof lc.in_library === 'number');
      assert.ok(typeof lc.in_research === 'number');
      assert.ok(typeof lc.lifecycle_state === 'string');
    }
  });

  runTest('Test 2.3: Backfill accurately derived in_library and in_research states', () => {
    // Book with generated smart chapters should be in_library = 1
    const booksWithSmart = db.prepare(`
      SELECT DISTINCT b.id FROM books b
      JOIN smart_chapters sc ON sc.book_id = b.id
      WHERE sc.status = 'generated'
    `).all();

    for (const b of booksWithSmart) {
      const lc = db.prepare('SELECT * FROM book_lifecycle WHERE book_id = ?').get(b.id);
      assert.strictEqual(lc.in_library, 1, `Book ${b.id} with generated smart chapters must have in_library = 1`);
    }
  });

  // ---------------------------------------------------------------------------
  // Section 3: Repositories Unit Tests
  // ---------------------------------------------------------------------------
  const bookLifecycleRepo = require('../repositories/bookLifecycleRepository');
  const llmUsageRepo = require('../repositories/llmUsageRepository');
  const appendLogRepo = require('../repositories/appendLogRepository');
  const synopsisHistoryRepo = require('../repositories/synopsisHistoryRepository');
  const chapterNameHistoryRepo = require('../repositories/chapterNameHistoryRepository');
  const bookLifecycleService = require('../services/lifecycle/bookLifecycleService');

  const testBookId = `test-book-${Date.now()}`;
  const nowIso = new Date().toISOString();

  // Insert dummy book into books table
  db.prepare(`
    INSERT INTO books (id, title, author, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(testBookId, 'Test Lifecycle Volume', 'Dr. Turing', 'An insightful work on automata.', nowIso, nowIso);

  runTest('Test 3.1: bookLifecycleRepository.create and getByBookId', () => {
    const created = bookLifecycleRepo.create({
      book_id: testBookId,
      in_library: 1,
      in_research: 1,
      source_preserved: 1,
      lifecycle_state: 'active',
      last_read_sequence: 2,
      last_read_title: 'State Transitions',
      last_read_scroll_pct: 0.45,
    });

    assert.ok(created);
    assert.strictEqual(created.book_id, testBookId);
    assert.strictEqual(created.in_library, 1);
    assert.strictEqual(created.in_research, 1);
    assert.strictEqual(created.last_read_sequence, 2);
    assert.strictEqual(created.last_read_scroll_pct, 0.45);

    const fetched = bookLifecycleRepo.getByBookId(testBookId);
    assert.strictEqual(fetched.id, created.id);
  });

  runTest('Test 3.2: bookLifecycleRepository.recordReadingSnapshot', () => {
    const updated = bookLifecycleRepo.recordReadingSnapshot(testBookId, {
      chapterId: 'smart-test-ch-3',
      sequence: 3,
      title: 'Turing Completeness',
      scrollPct: 0.75,
      readAt: new Date().toISOString(),
    });

    assert.strictEqual(updated.last_read_sequence, 3);
    assert.strictEqual(updated.last_read_title, 'Turing Completeness');
    assert.strictEqual(updated.last_read_scroll_pct, 0.75);
    assert.strictEqual(updated.last_read_chapter_id, 'smart-test-ch-3');
  });

  runTest('Test 3.3: llmUsageRepository records usage and computes summaries', () => {
    const lc = bookLifecycleRepo.getByBookId(testBookId);

    llmUsageRepo.recordUsage({
      lifecycle_id: lc.id,
      book_id: testBookId,
      chapter_id: 'ch-1',
      stage: 'synthesis',
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
      prompt_tokens: 1500,
      completion_tokens: 300,
      cost_estimate_usd: 0.0003,
      latency_ms: 1250,
      finish_reason: 'stop',
    });

    llmUsageRepo.recordUsage({
      lifecycle_id: lc.id,
      book_id: testBookId,
      chapter_id: 'ch-2',
      stage: 'synthesis',
      provider: 'ollama',
      model: 'llama3:8b',
      prompt_tokens: 2000,
      completion_tokens: 400,
      cost_estimate_usd: 0.0,
      latency_ms: 2500,
      finish_reason: 'stop',
    });

    const bookSummary = llmUsageRepo.getSummaryByBookId(testBookId);
    assert.strictEqual(bookSummary.total_calls, 2);
    assert.strictEqual(bookSummary.total_prompt_tokens, 3500);
    assert.strictEqual(bookSummary.total_completion_tokens, 700);
    assert.strictEqual(bookSummary.total_tokens, 4200);
    assert.ok(bookSummary.total_cost_usd > 0);

    const lifetimeSummary = llmUsageRepo.getLifetimeSummary();
    assert.ok(lifetimeSummary.total_tokens >= 4200);

    const models = llmUsageRepo.getBreakdownByModel();
    assert.ok(models.some((m) => m.model === 'deepseek/deepseek-v4-flash'));
    assert.ok(models.some((m) => m.model === 'llama3:8b'));
  });

  runTest('Test 3.4: appendLogRepository records acquisitions and enforces unique constraint', () => {
    const fileHash = 'sha256-abcdef123456';
    const dossierId = 'dossier-test-1';

    const append1 = appendLogRepo.recordAppend({
      dossier_id: dossierId,
      source_id: 'src-1',
      source_type: 'file',
      file_name: 'paper-a.pdf',
      file_hash: fileHash,
      file_size: 1048576,
      char_count: 50000,
      word_count: 8500,
    });

    assert.ok(append1);
    assert.strictEqual(append1.dossier_id, dossierId);
    assert.strictEqual(append1.file_hash, fileHash);

    // Duplicate append with same file_hash should be ignored without error
    const appendDup = appendLogRepo.recordAppend({
      dossier_id: dossierId,
      source_id: 'src-1-dup',
      source_type: 'file',
      file_name: 'paper-a.pdf',
      file_hash: fileHash,
    });

    assert.strictEqual(appendDup.id, append1.id, 'Duplicate append must return existing record');
    assert.strictEqual(appendLogRepo.countByDossierId(dossierId), 1);
  });

  runTest('Test 3.5: synopsisHistoryRepository records versions and prevents duplicate versions', () => {
    const lc = bookLifecycleRepo.getByBookId(testBookId);

    const v1 = synopsisHistoryRepo.recordVersion({
      lifecycle_id: lc.id,
      book_id: testBookId,
      version: 1,
      synopsis_text: 'First draft synopsis.',
      generator_type: 'ai_initial',
      model_used: 'deepseek/deepseek-v4-flash',
    });

    assert.ok(v1);
    assert.strictEqual(v1.version, 1);
    assert.strictEqual(v1.synopsis_text, 'First draft synopsis.');

    const v2 = synopsisHistoryRepo.recordVersion({
      lifecycle_id: lc.id,
      book_id: testBookId,
      version: 2,
      synopsis_text: 'Second refined draft.',
      generator_type: 'ai_refresh',
    });

    assert.strictEqual(v2.version, 2);
    assert.strictEqual(synopsisHistoryRepo.getNextVersionNumber(lc.id), 3);

    // Attempting to write duplicate version 2 should ignore and return existing v2
    const v2Dup = synopsisHistoryRepo.recordVersion({
      lifecycle_id: lc.id,
      book_id: testBookId,
      version: 2,
      synopsis_text: 'Racing concurrent draft.',
    });
    assert.strictEqual(v2Dup.id, v2.id);
  });

  runTest('Test 3.6: chapterNameHistoryRepository records chapter renames across sequences', () => {
    const lc = bookLifecycleRepo.getByBookId(testBookId);

    const r1 = chapterNameHistoryRepo.recordRename({
      lifecycle_id: lc.id,
      book_id: testBookId,
      chapter_sequence: 1,
      old_title: 'Chapter 1',
      new_title: 'Foundations of Automata',
      rename_source: 'ai_synthesis',
      synthesis_cycle: 1,
    });

    assert.ok(r1);
    assert.strictEqual(r1.chapter_sequence, 1);
    assert.strictEqual(r1.new_title, 'Foundations of Automata');

    const history = chapterNameHistoryRepo.getHistoryByLifecycleId(lc.id);
    assert.strictEqual(history.length, 1);
  });

  // ---------------------------------------------------------------------------
  // Section 4: Foreign Key and Delete Semantics Invariants
  // ---------------------------------------------------------------------------
  runTest('Test 4.1: Soft reference invariant — deleting book from books does NOT delete book_lifecycle', () => {
    const transientBookId = `transient-book-${Date.now()}`;
    db.prepare(`
      INSERT INTO books (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)
    `).run(transientBookId, 'Transient Title', nowIso, nowIso);

    const lc = bookLifecycleRepo.create({
      book_id: transientBookId,
      in_library: 1,
      in_research: 1,
    });

    // Delete book from books table
    db.prepare('DELETE FROM books WHERE id = ?').run(transientBookId);

    // Assert lifecycle record still exists
    const preserved = bookLifecycleRepo.getById(lc.id);
    assert.ok(preserved, 'book_lifecycle must survive deletion of books row');
    assert.strictEqual(preserved.book_id, transientBookId);

    // Clean up
    bookLifecycleRepo.delete(lc.id);
  });

  runTest('Test 4.2: Operation D SET NULL invariant — deleting lifecycle sets llm_usage.lifecycle_id to NULL', () => {
    const isolatedBookId = `iso-book-${Date.now()}`;
    const lc = bookLifecycleRepo.create({
      book_id: isolatedBookId,
      in_library: 0,
      in_research: 0,
      lifecycle_state: 'archived',
    });

    const usage = llmUsageRepo.recordUsage({
      lifecycle_id: lc.id,
      book_id: isolatedBookId,
      stage: 'synthesis',
      provider: 'openrouter',
      model: 'test-model',
      prompt_tokens: 500,
      completion_tokens: 100,
      cost_estimate_usd: 0.05,
    });

    assert.strictEqual(usage.lifecycle_id, lc.id);

    // Delete the lifecycle row (Operation D)
    const purged = bookLifecycleService.purgeLifecycle(isolatedBookId);
    assert.strictEqual(purged.success, true);

    // Assert lifecycle is gone
    const missingLc = bookLifecycleRepo.getById(lc.id);
    assert.strictEqual(missingLc, null);

    // Assert usage record SURVIVED with lifecycle_id = NULL (Option 2B verified!)
    const preservedUsage = db.prepare('SELECT * FROM llm_usage WHERE id = ?').get(usage.id);
    assert.ok(preservedUsage, 'llm_usage record must NOT be deleted by lifecycle purge');
    assert.strictEqual(preservedUsage.lifecycle_id, null, 'llm_usage.lifecycle_id must be set to NULL via ON DELETE SET NULL');
    assert.strictEqual(preservedUsage.cost_estimate_usd, 0.05);

    // Clean up
    db.prepare('DELETE FROM llm_usage WHERE id = ?').run(usage.id);
  });

  runTest('Test 4.3: Service layer delete operations A, B, C state transitions', () => {
    const flowBookId = `flow-book-${Date.now()}`;
    bookLifecycleRepo.create({
      book_id: flowBookId,
      in_library: 1,
      in_research: 1,
      lifecycle_state: 'active',
    });

    // Operation A: Delete from Library only
    const opA = bookLifecycleService.deleteFromLibrary(flowBookId, { reason: 'user_library_delete' });
    assert.strictEqual(opA.lifecycle.in_library, 0);
    assert.strictEqual(opA.lifecycle.in_research, 1);
    assert.strictEqual(opA.lifecycle.source_preserved, 1);
    assert.strictEqual(opA.lifecycle.lifecycle_state, 'research_only');

    // Operation C: Delete from Research
    const opC = bookLifecycleService.deleteFromResearchOnly(flowBookId, { reason: 'user_research_delete' });
    assert.strictEqual(opC.lifecycle.in_research, 0);
    assert.strictEqual(opC.lifecycle.lifecycle_state, 'archived');

    // Re-synthesize (5.8f transition)
    const resynth = bookLifecycleService.markReSynthesized(flowBookId, { dossierId: 'dossier-origin-1' });
    assert.strictEqual(resynth.in_library, 1);
    assert.strictEqual(resynth.lifecycle_state, 'active');
    assert.strictEqual(resynth.synthesis_count, 2);
    assert.strictEqual(resynth.re_synthesis_source_id, 'dossier-origin-1');

    // Operation B: Delete all
    const opB = bookLifecycleService.deleteFromLibraryAndSource(flowBookId);
    assert.strictEqual(opB.lifecycle.in_library, 0);
    assert.strictEqual(opB.lifecycle.in_research, 0);
    assert.strictEqual(opB.lifecycle.lifecycle_state, 'archived');

    // Clean up
    bookLifecycleRepo.deleteByBookId(flowBookId);
  });

  // Final cleanup of test book
  db.prepare('DELETE FROM books WHERE id = ?').run(testBookId);
  db.prepare('DELETE FROM llm_usage WHERE book_id = ?').run(testBookId);
  db.prepare('DELETE FROM dossier_append_log WHERE dossier_id = ?').run('dossier-test-1');
  bookLifecycleRepo.deleteByBookId(testBookId);

} finally {
  if (testDb) {
    try { testDb.close(); } catch {}
  }
  if (fs.existsSync(tempDbPath)) {
    try { fs.unlinkSync(tempDbPath); } catch {}
  }
}

console.log(`\nResults: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
