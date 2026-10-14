/**
 * backend/tests/f58_1_dossier_dedup_test.js
 *
 * Test suite for F58.1: Dossier dedup by ID instead of title.
 *
 * Tests:
 * - T1: paste with dossierId attaches to that dossier
 * - T2: paste with isNewDossier=true creates new even if title matches
 * - T3: paste with neither logs warning and uses title fallback
 * - T4: two pastes with same title but different isNewDossier do not merge
 */

'use strict';

const assert = require('assert');
const path = require('path');
const importQueueRepository = require('../repositories/importQueueRepository');
const importQueueService = require('../services/ingestion/importQueueService');
const bookService = require('../services/bookService');

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

async function runF58_1Tests() {
  console.log('=== f58_1_dossier_dedup_test.js ===');
  console.log('--- Phase F58.1: Dossier Dedup by ID Tests ---');

  const runId = Date.now();
  let passedCount = 0;

  // ---------------------------------------------------------------------------
  // T1: paste with dossierId attaches to that dossier
  // ---------------------------------------------------------------------------
  {
    console.log('T1: paste with dossierId attaches to that dossier');
    const targetDossier = bookService.createDossier({
      title: `T1 Dossier ${runId}`,
      author: 'Author T1',
      description: 'Dossier for T1 direct attachment test',
    });
    assert(targetDossier && targetDossier.id, 'Target dossier must be created');

    const task = await importQueueService.enqueuePaste({
      title: 'T1 Document Direct',
      author: 'T1 Author',
      text: 'Content specifically intended for T1 dossier attachment.',
      dossierId: targetDossier.id,
      isNewDossier: false,
    });

    const finished = await waitForTask(task.id);
    assert.strictEqual(finished.status, 'completed', `Task should complete, got: ${finished.status} (${finished.error})`);
    assert.strictEqual(finished.book_id, targetDossier.id, 'Task must attach directly to specified dossierId');

    const chapters = bookService.getChapters(targetDossier.id);
    assert(chapters.some((c) => c.title === 'T1 Document Direct'), 'Dossier must contain the attached document chapter');

    passedCount++;
    console.log('  ✓ T1 passed');
  }

  // ---------------------------------------------------------------------------
  // T2: paste with isNewDossier=true creates new even if title matches
  // ---------------------------------------------------------------------------
  {
    console.log('T2: paste with isNewDossier=true creates new even if title matches');
    const existingTitle = `Duplicate Title Dossier ${runId}`;
    const initialDossier = bookService.createDossier({
      title: existingTitle,
      author: 'Initial Author',
      description: 'Existing dossier before duplicate title test',
    });
    assert(initialDossier && initialDossier.id, 'Initial dossier must be created');

    const task = await importQueueService.enqueuePaste({
      title: 'Document In Brand New Dossier',
      author: 'Author T2',
      text: 'Content intended for an isolated new dossier despite duplicate title.',
      dossierTitle: existingTitle,
      isNewDossier: true,
    });

    const finished = await waitForTask(task.id);
    assert.strictEqual(finished.status, 'completed', `Task should complete, got: ${finished.status} (${finished.error})`);
    assert(finished.book_id, 'Finished task must have a book_id');
    assert.notStrictEqual(finished.book_id, initialDossier.id, 'Task must create a NEW dossier and NOT merge into existing one');

    const newDossier = bookService.getBook(finished.book_id);
    assert.strictEqual(newDossier.title, existingTitle, 'New dossier must have the requested title');

    passedCount++;
    console.log('  ✓ T2 passed');
  }

  // ---------------------------------------------------------------------------
  // T3: paste with neither logs warning and uses title fallback
  // ---------------------------------------------------------------------------
  {
    console.log('T3: paste with neither logs warning and uses title fallback');
    const fallbackTitle = `Fallback Target Dossier ${runId}`;
    const initialDossier = bookService.createDossier({
      title: fallbackTitle,
      author: 'Fallback Author',
      description: 'Dossier to test title-matching fallback',
    });

    const capturedWarnings = [];
    const origWarn = console.warn;
    console.warn = (...args) => {
      capturedWarnings.push(args.join(' '));
      origWarn(...args);
    };

    let finished;
    try {
      const task = await importQueueService.enqueuePaste({
        title: 'Document with Neither Id Nor isNewDossier',
        author: 'Author T3',
        text: 'Content without explicit dossierId or isNewDossier flag.',
        dossierTitle: fallbackTitle,
      });

      finished = await waitForTask(task.id);
    } finally {
      console.warn = origWarn;
    }

    assert.strictEqual(finished.status, 'completed', `Task should complete, got: ${finished.status} (${finished.error})`);
    assert.strictEqual(finished.book_id, initialDossier.id, 'Task must merge into the existing dossier matching title');

    const hasAmbiguityWarning = capturedWarnings.some(
      (w) => w.includes('[ImportQueue]') && w.includes('Ambiguous dossier destination')
    );
    assert(hasAmbiguityWarning, 'Console must log warning about ambiguous dossier destination');

    passedCount++;
    console.log('  ✓ T3 passed');
  }

  // ---------------------------------------------------------------------------
  // T4: two pastes with same title but different isNewDossier do not merge
  // ---------------------------------------------------------------------------
  {
    console.log('T4: two pastes with same title but different isNewDossier do not merge');
    const sharedTitle = `Shared Notes Dossier ${runId}`;
    const baseDossier = bookService.createDossier({
      title: sharedTitle,
      author: 'Base Author',
      description: 'Base dossier for testing different isNewDossier behavior',
    });

    // Paste A: targets existing dossier (isNewDossier: false / specifies dossierId)
    const taskA = await importQueueService.enqueuePaste({
      title: 'Doc A attached to base',
      author: 'Author A',
      text: 'Content for base dossier.',
      dossierId: baseDossier.id,
      dossierTitle: sharedTitle,
      isNewDossier: false,
    });

    // Paste B: has same dossierTitle, but isNewDossier: true (different isNewDossier)
    const taskB = await importQueueService.enqueuePaste({
      title: 'Doc B in brand new dossier',
      author: 'Author B',
      text: 'Content for new isolated dossier with same name.',
      dossierTitle: sharedTitle,
      isNewDossier: true,
    });

    const finishedA = await waitForTask(taskA.id);
    const finishedB = await waitForTask(taskB.id);

    assert.strictEqual(finishedA.status, 'completed', `Task A should complete, got: ${finishedA.status}`);
    assert.strictEqual(finishedB.status, 'completed', `Task B should complete, got: ${finishedB.status}`);

    assert.strictEqual(finishedA.book_id, baseDossier.id, 'Task A must attach to base dossier');
    assert.notStrictEqual(finishedB.book_id, baseDossier.id, 'Task B must NOT merge into base dossier');
    assert.notStrictEqual(finishedA.book_id, finishedB.book_id, 'Tasks with different isNewDossier must not merge into the same dossier');

    passedCount++;
    console.log('  ✓ T4 passed');
  }

  console.log(`\nAll ${passedCount} tests in f58_1_dossier_dedup_test.js passed!`);
}

if (require.main === module) {
  runF58_1Tests().catch((err) => {
    console.error('f58_1_dossier_dedup_test.js FAILED:', err);
    process.exit(1);
  });
}

module.exports = { runF58_1Tests };

