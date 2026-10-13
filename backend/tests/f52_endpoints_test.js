/**
 * backend/tests/f52_endpoints_test.js
 *
 * Automated test suite for F52 REST Endpoints, Catalog Filtering, and Usage Aggregations.
 *
 * Tests:
 * - T1: GET /api/books/:id/lifecycle returns 200 with all six sections
 * - T2: GET /api/books/:id/lifecycle returns 404 for unknown book_id
 * - T3: POST read-progress updates lifecycle snapshot
 * - T4: POST read-progress rejects scrollPct > 1 (400)
 * - T5: GET /api/lifecycle/usage/summary returns correct totals
 * - T6: GET /api/lifecycle/usage/summary by_stage breakdown is correct
 * - T7: Library catalog excludes books with in_library = 0
 * - T8: Research catalog excludes books with in_research = 0
 */

'use strict';

const assert = require('assert');
const http = require('http');
const path = require('path');
const { getDatabase } = require('../db/database');
const bookLifecycleRepository = require('../repositories/bookLifecycleRepository');
const bookLifecycleService = require('../services/lifecycle/bookLifecycleService');
const llmUsageRepository = require('../repositories/llmUsageRepository');
const app = require('../server');

async function runF52EndpointTests() {
  console.log('=== f52_endpoints_test.js ===');
  console.log('--- Phase F52 Session 3: REST Endpoints & Catalog Filtering Tests ---');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const db = getDatabase();
  const testRunId = `f52-test-${Date.now()}`;
  let passedCount = 0;

  try {
    // Setup test book
    const testBookId = `book-${testRunId}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO books (id, title, author, description, content_type, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(testBookId, 'F52 Endpoint Test Book', 'Tester', 'Description for testing F52 endpoints.', 'novel', 'ready', now, now);

    // Seed smart chapters for library presence
    const smartChapterId = `sc-${testRunId}-1`;
    db.prepare(`
      INSERT INTO smart_chapters (id, book_id, sequence, title, status, planned_word_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(smartChapterId, testBookId, 1, 'Chapter 1: Genesis', 'generated', 1200, now, now);

    // Ensure lifecycle
    const lifecycle = bookLifecycleService.ensureLifecycle(testBookId);

    // -------------------------------------------------------------------------
    // T1: GET /api/books/:id/lifecycle returns 200 with all six sections
    // -------------------------------------------------------------------------
    {
      const res = await fetch(`${baseUrl}/api/books/${testBookId}/lifecycle`);
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
      const body = await res.json();

      assert.ok(body.lifecycle, 'Must contain lifecycle section');
      assert.strictEqual(body.lifecycle.book_id, testBookId);
      assert.ok(body.reading, 'Must contain reading section');
      assert.ok(Array.isArray(body.chapter_history), 'Must contain chapter_history array');
      assert.ok(Array.isArray(body.synopsis_versions), 'Must contain synopsis_versions array');
      assert.ok(Array.isArray(body.append_log), 'Must contain append_log array');
      assert.ok(body.usage_summary, 'Must contain usage_summary section');
      assert.ok('by_stage' in body.usage_summary, 'usage_summary must contain by_stage');

      console.log('  ✓ T1: GET /api/books/:id/lifecycle returns 200 with all six sections');
      passedCount++;
    }

    // -------------------------------------------------------------------------
    // T2: GET /api/books/:id/lifecycle returns 404 for unknown book_id
    // -------------------------------------------------------------------------
    {
      const res = await fetch(`${baseUrl}/api/books/unknown-book-id-999999/lifecycle`);
      assert.strictEqual(res.status, 404, `Expected 404, got ${res.status}`);
      const body = await res.json();
      assert.ok(body.error, 'Must return error message for unknown book');

      console.log('  ✓ T2: GET /api/books/:id/lifecycle returns 404 for unknown book_id');
      passedCount++;
    }

    // -------------------------------------------------------------------------
    // T3: POST read-progress updates lifecycle snapshot
    // -------------------------------------------------------------------------
    {
      const payload = {
        chapterId: smartChapterId,
        sequence: 1,
        title: 'Chapter 1: Genesis',
        scrollPct: 0.65,
      };

      const postRes = await fetch(`${baseUrl}/api/books/${testBookId}/lifecycle/read-progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      assert.strictEqual(postRes.status, 200, `Expected 200, got ${postRes.status}`);
      const postBody = await postRes.json();
      assert.strictEqual(postBody.ok, true);
      assert.strictEqual(postBody.lifecycle.last_read_sequence, 1);
      assert.strictEqual(postBody.lifecycle.last_read_scroll_pct, 0.65);

      // Verify persistence via GET
      const getRes = await fetch(`${baseUrl}/api/books/${testBookId}/lifecycle`);
      const getBody = await getRes.json();
      assert.strictEqual(getBody.reading.last_read_sequence, 1);
      assert.strictEqual(getBody.reading.last_read_scroll_pct, 0.65);
      assert.strictEqual(getBody.reading.last_read_title, 'Chapter 1: Genesis');

      console.log('  ✓ T3: POST read-progress updates lifecycle snapshot');
      passedCount++;
    }

    // -------------------------------------------------------------------------
    // T4: POST read-progress rejects scrollPct > 1 (400)
    // -------------------------------------------------------------------------
    {
      const resOver = await fetch(`${baseUrl}/api/books/${testBookId}/lifecycle/read-progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scrollPct: 1.25 }),
      });
      assert.strictEqual(resOver.status, 400, `Expected 400 for scrollPct > 1, got ${resOver.status}`);

      const resUnder = await fetch(`${baseUrl}/api/books/${testBookId}/lifecycle/read-progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scrollPct: -0.1 }),
      });
      assert.strictEqual(resUnder.status, 400, `Expected 400 for scrollPct < 0, got ${resUnder.status}`);

      console.log('  ✓ T4: POST read-progress rejects scrollPct > 1 (400)');
      passedCount++;
    }

    // -------------------------------------------------------------------------
    // T5: GET /api/lifecycle/usage/summary returns correct totals
    // -------------------------------------------------------------------------
    {
      // Clean slate mock usage rows for predictable assertion
      const useId1 = `use-${testRunId}-1`;
      const useId2 = `use-${testRunId}-2`;

      llmUsageRepository.recordUsage({
        id: useId1,
        book_id: testBookId,
        stage: 'synthesis',
        provider: 'openrouter',
        model: 'anthropic/claude-3.5-sonnet',
        prompt_tokens: 1000,
        completion_tokens: 500,
        total_tokens: 1500,
        cost_estimate_usd: 0.045,
        latency_ms: 1200,
      });

      llmUsageRepository.recordUsage({
        id: useId2,
        book_id: testBookId,
        stage: 'outline',
        provider: 'ollama',
        model: 'llama3:8b',
        prompt_tokens: 800,
        completion_tokens: 200,
        total_tokens: 1000,
        cost_estimate_usd: 0.0,
        latency_ms: 800,
      });

      const res = await fetch(`${baseUrl}/api/lifecycle/usage/summary`);
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
      const body = await res.json();

      assert.ok(body.total_tokens >= 2500, `Expected total_tokens >= 2500, got ${body.total_tokens}`);
      assert.ok(body.total_prompt_tokens >= 1800);
      assert.ok(body.total_completion_tokens >= 700);
      assert.ok(body.total_cost_usd >= 0.045);
      assert.ok(body.by_provider.openrouter, 'Must contain openrouter breakdown');
      assert.ok(body.by_provider.ollama, 'Must contain ollama breakdown');

      console.log('  ✓ T5: GET /api/lifecycle/usage/summary returns correct totals');
      passedCount++;
    }

    // -------------------------------------------------------------------------
    // T6: GET /api/lifecycle/usage/summary by_stage breakdown is correct
    // -------------------------------------------------------------------------
    {
      const res = await fetch(`${baseUrl}/api/lifecycle/usage/summary`);
      const body = await res.json();

      assert.ok(body.by_stage.synthesis, 'Must contain synthesis stage breakdown');
      assert.ok(body.by_stage.outline, 'Must contain outline stage breakdown');
      assert.ok(body.by_stage.synthesis.tokens >= 1500);
      assert.ok(body.by_stage.outline.tokens >= 1000);

      console.log('  ✓ T6: GET /api/lifecycle/usage/summary by_stage breakdown is correct');
      passedCount++;
    }

    // -------------------------------------------------------------------------
    // T7: Library catalog excludes books with in_library = 0
    // -------------------------------------------------------------------------
    {
      const hiddenLibBookId = `book-lib-hidden-${testRunId}`;
      db.prepare(`
        INSERT INTO books (id, title, author, description, content_type, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(hiddenLibBookId, 'Hidden From Library', 'Ghost', 'Should be hidden from library', 'novel', 'ready', now, now);

      db.prepare(`
        INSERT INTO smart_chapters (id, book_id, sequence, title, status, planned_word_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(`sc-hidden-${testRunId}`, hiddenLibBookId, 1, 'Ch 1', 'generated', 500, now, now);

      bookLifecycleRepository.create({
        book_id: hiddenLibBookId,
        in_library: 0,
        in_research: 1,
        lifecycle_state: 'research_only',
      });

      const res = await fetch(`${baseUrl}/api/books`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      const found = data.books.find((b) => b.id === hiddenLibBookId);
      assert.strictEqual(found, undefined, `Book with in_library = 0 must NOT appear in GET /api/books`);

      console.log('  ✓ T7: Library catalog excludes books with in_library = 0');
      passedCount++;
    }

    // -------------------------------------------------------------------------
    // T8: Research catalog excludes books with in_research = 0
    // -------------------------------------------------------------------------
    {
      const hiddenResBookId = `book-res-hidden-${testRunId}`;
      db.prepare(`
        INSERT INTO books (id, title, author, description, content_type, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(hiddenResBookId, 'Hidden From Research', 'Ghost', 'Should be hidden from research', 'novel', 'ready', now, now);

      db.prepare(`
        INSERT INTO chapters (id, book_id, number, title, content, word_count, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(`ch-hidden-${testRunId}`, hiddenResBookId, 1, 'Source Ch 1', 'Source text content', 500, 'ready', now, now);

      bookLifecycleRepository.create({
        book_id: hiddenResBookId,
        in_library: 1,
        in_research: 0,
        lifecycle_state: 'library_only',
      });

      const res = await fetch(`${baseUrl}/api/books/sources`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      const found = data.books.find((b) => b.id === hiddenResBookId);
      assert.strictEqual(found, undefined, `Book with in_research = 0 must NOT appear in GET /api/books/sources`);

      console.log('  ✓ T8: Research catalog excludes books with in_research = 0');
      passedCount++;
    }

    console.log(`\nResults: ${passedCount} passed, 0 failed.\n`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

if (require.main === module) {
  runF52EndpointTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Test failed with error:', err);
      process.exit(1);
    });
}

module.exports = { runF52EndpointTests };
