process.env.DB_PATH = process.env.DB_PATH || 'storage/test-data.db';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { getDatabase, resetAndSeedDatabase } = require('../db/database');
const importQueueRepository = require('../repositories/importQueueRepository');
const importQueueService = require('../services/ingestion/importQueueService');
const bookService = require('../services/bookService');
const bookRepository = require('../repositories/bookRepository');

async function runTests() {
  console.log('=== RUNNING IMPORT QUEUE & DOSSIER PIPELINE TESTS ===');
  resetAndSeedDatabase();

  // Test 1: Queue Repository CRUD & Ordering
  console.log('Test 1: importQueueRepository create, getQueue, reorder, delete');
  const task1 = importQueueRepository.create({
    type: 'paste',
    source_title: 'Document Alpha',
    source_meta: { text: 'Some text 1' },
    status: 'queued',
  });
  assert(task1 && task1.id, 'Task 1 should be created');
  assert.strictEqual(task1.sourceTitle, 'Document Alpha');
  assert.strictEqual(task1.status, 'queued');

  const task2 = importQueueRepository.create({
    type: 'paste',
    source_title: 'Document Beta',
    source_meta: { text: 'Some text 2' },
    status: 'queued',
  });
  assert(task2 && task2.queueOrder > task1.queueOrder, 'Task 2 should have higher queue order');

  const queueInitial = importQueueRepository.getQueue();
  assert.strictEqual(queueInitial.queued.length, 2, 'Should have 2 queued items');

  // Test reordering
  importQueueRepository.reorder([task2.id, task1.id]);
  const queueReordered = importQueueRepository.getQueue();
  assert.strictEqual(queueReordered.queued[0].id, task2.id, 'Task 2 should now be first');
  assert.strictEqual(queueReordered.queued[1].id, task1.id, 'Task 1 should now be second');

  // Clean up test tasks
  importQueueRepository.delete(task1.id);
  importQueueRepository.delete(task2.id);
  console.log('✓ Test 1 passed: Repository CRUD & reorder verified');

  // Test 2: Dossier creation and appending content
  console.log('Test 2: BookService Dossier creation & content addition');
  const dossier = bookService.createDossier({
    title: 'Cognitive Computing Dossier',
    author: 'Research Lab',
    description: 'Test dossier for multi-document ingestion',
  });
  assert(dossier && dossier.id, 'Dossier should be created');
  assert(dossier.id.startsWith('book-dossier-'), 'Dossier ID should have book-dossier- prefix');

  const allDossiers = bookService.getAllDossiers();
  assert(allDossiers.some((d) => d.id === dossier.id), 'getAllDossiers should include created dossier');

  // Add first document to dossier
  const appendRes1 = await bookService.addContentToDossier(dossier.id, {
    title: 'Paper 1: Attractor Networks',
    author: 'Dr. Thorne',
    text: 'Continuous attractor networks encode smooth state spaces without drift under symmetric feedback.',
  });
  assert.strictEqual(appendRes1.chaptersAdded.length, 1, 'Should add 1 chapter');

  // Add second document to dossier
  const appendRes2 = await bookService.addContentToDossier(dossier.id, {
    title: 'Paper 2: Vector Clocks',
    author: 'Leslie L.',
    text: 'Vector clocks guarantee causal partial ordering across decentralized distributed nodes.',
  });
  assert.strictEqual(appendRes2.chaptersAdded.length, 1, 'Should add 2nd chapter');

  const updatedDossier = bookService.getBook(dossier.id);
  const meta = typeof updatedDossier.metadata_json === 'string' ? JSON.parse(updatedDossier.metadata_json || '{}') : updatedDossier.metadata_json;
  const chapters = bookService.getChapters(dossier.id);
  assert.strictEqual(chapters.length, 2, 'Dossier should have 2 chapters');
  assert(meta.sourcesCount >= 2, 'Dossier metadata should reflect 2 sources');
  console.log('✓ Test 2 passed: Dossier creation and appending verified');

  // Test 3: Sequential Queue Processing with Paste (New Dossier)
  console.log('Test 3: Enqueue Paste creating New Dossier');
  const pasteTaskNew = await importQueueService.enqueuePaste({
    title: 'Quantum Memory Review',
    author: 'Alice Q.',
    text: 'Superconducting qubits require microwave resonators for non-destructive dispersive readout.',
    isNewDossier: true,
    dossierTitle: 'Quantum Information Dossier',
  });
  assert(pasteTaskNew && pasteTaskNew.id, 'Paste task should be created');

  // Wait for queue worker to finish processing task
  let attempts = 0;
  let finishedTask = null;
  while (attempts < 50) {
    await new Promise((r) => setTimeout(r, 100));
    finishedTask = importQueueRepository.getById(pasteTaskNew.id);
    if (finishedTask.status === 'completed' || finishedTask.status === 'failed') break;
    attempts++;
  }
  assert.strictEqual(finishedTask.status, 'completed', `Task should complete, got: ${finishedTask.status} (${finishedTask.error})`);
  assert(finishedTask.book_id, 'Completed task should have linked book_id');
  const createdDossierBook = bookService.getBook(finishedTask.book_id);
  assert(createdDossierBook.title.includes('Quantum Information Dossier'), 'Dossier title should match');
  console.log('✓ Test 3 passed: Enqueue Paste with New Dossier processed to completion');

  // Test 4: Enqueue Paste targeting Existing Dossier
  console.log('Test 4: Enqueue Paste targeting Existing Dossier');
  const pasteTaskExisting = await importQueueService.enqueuePaste({
    title: 'Quantum Error Correction',
    author: 'Bob Q.',
    text: 'Surface code stabilizers detect bit-flip and phase-flip syndromes via syndrome measurement cycles.',
    isNewDossier: false,
    dossierId: createdDossierBook.id,
  });

  attempts = 0;
  while (attempts < 50) {
    await new Promise((r) => setTimeout(r, 100));
    finishedTask = importQueueRepository.getById(pasteTaskExisting.id);
    if (finishedTask.status === 'completed' || finishedTask.status === 'failed') break;
    attempts++;
  }
  assert.strictEqual(finishedTask.status, 'completed', `Task should complete, got: ${finishedTask.status}`);
  assert.strictEqual(finishedTask.book_id, createdDossierBook.id, 'Should link to the existing dossier');
  const finalChapters = bookService.getChapters(createdDossierBook.id);
  assert.strictEqual(finalChapters.length, 2, 'Dossier should now contain 2 chapters');
  console.log('✓ Test 4 passed: Enqueue Paste into Existing Dossier verified');

  // Test 5: Cancellation of Queued Task
  console.log('Test 5: Queue Cancellation');
  const dummyTask = importQueueRepository.create({
    type: 'paste',
    source_title: 'Doomed Import',
    source_meta: { text: 'To be cancelled' },
    status: 'queued',
  });
  const cancelOk = importQueueService.cancelTask(dummyTask.id);
  assert.strictEqual(cancelOk, true, 'cancelTask should return true');
  const cancelledRow = importQueueRepository.getById(dummyTask.id);
  assert.strictEqual(cancelledRow.status, 'cancelled', 'Status should be cancelled');

  // Test Retry
  const retried = importQueueService.retryTask(dummyTask.id);
  assert.strictEqual(retried.status, 'queued', 'Retried task should be queued again');
  importQueueService.removeTask(dummyTask.id);
  assert.strictEqual(importQueueRepository.getById(dummyTask.id), null, 'Removed task should be deleted');
  console.log('✓ Test 5 passed: Cancel, retry, and remove verified');

  // Test 6: In-Flight Active Task Cancellation
  console.log('Test 6: In-Flight Active Task Cancellation (Verifying cancellation is respected)');
  const slowAddOrig = bookService.addContentToDossier.bind(bookService);
  bookService.addContentToDossier = async (...args) => {
    await new Promise((r) => setTimeout(r, 200));
    return slowAddOrig(...args);
  };

  const inFlightTask = await importQueueService.enqueuePaste({
    title: 'In Flight Cancellation Test',
    author: 'Test Author',
    text: 'Substantive scientific text for in flight cancel testing attractor networks.',
    isNewDossier: true,
    dossierTitle: 'Cancel In Flight Dossier',
  });

  // Wait until task starts processing
  while (true) {
    const cur = importQueueRepository.getById(inFlightTask.id);
    if (cur.status === 'processing') break;
    await new Promise((r) => setTimeout(r, 10));
  }

  // Cancel while actively processing
  const inFlightCancelResult = importQueueService.cancelTask(inFlightTask.id);
  assert.strictEqual(inFlightCancelResult, true, 'cancelTask on active task should succeed');

  // Wait for tick loop to finalize
  while (true) {
    const cur = importQueueRepository.getById(inFlightTask.id);
    if (cur.status === 'cancelled' || cur.status === 'completed' || cur.status === 'failed') {
      assert.strictEqual(cur.status, 'cancelled', `Active cancelled task MUST remain cancelled, got: ${cur.status}`);
      break;
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  // Restore method
  bookService.addContentToDossier = slowAddOrig;
  console.log('✓ Test 6 passed: In-flight active task cancellation verified and not overwritten to completed');

  // Test 7: Duplicate Dossier Protection on Rapid Submission
  console.log('Test 7: Duplicate Dossier Protection on Rapid Submissions');
  const dTask1 = await importQueueService.enqueuePaste({
    title: 'Paper Section 1',
    author: 'Alice',
    text: 'First section of the neural dynamics survey discussing continuous attractors.',
    dossierTitle: 'Shared Neural Survey',
  });
  const dTask2 = await importQueueService.enqueuePaste({
    title: 'Paper Section 2',
    author: 'Bob',
    text: 'Second section of the neural dynamics survey discussing Lyapunov stability.',
    dossierTitle: 'Shared Neural Survey',
  });

  // Wait for both to complete
  while (true) {
    const r1 = importQueueRepository.getById(dTask1.id);
    const r2 = importQueueRepository.getById(dTask2.id);
    if (r1.status === 'completed' && r2.status === 'completed') {
      assert.strictEqual(r1.book_id, r2.book_id, 'Both tasks targeting the same new dossier should resolve to the same book_id');
      break;
    }
    await new Promise((r) => setTimeout(r, 50));
  }

  const allSurveys = bookService.getAllDossiers().filter((d) => d.title.includes('Shared Neural Survey'));
  assert.strictEqual(allSurveys.length, 1, 'Only one combined dossier should be created');
  const surveyChapters = bookService.getChapters(allSurveys[0].id);
  assert.strictEqual(surveyChapters.length, 2, 'Combined dossier should contain both chapters');
  console.log('✓ Test 7 passed: Rapid duplicate dossier submissions correctly merged into single dossier');

  // Test 8: Retry Queue Sequencing
  console.log('Test 8: Retry Queue Sequencing (Retried task receives fresh queue order)');
  const failedTask = importQueueRepository.create({
    type: 'paste',
    source_title: 'Previously Failed Task',
    status: 'failed',
    error: 'Simulated network hiccup',
    queue_order: 1,
  });
  const queuedA = importQueueRepository.create({
    type: 'paste',
    source_title: 'Queued Item A',
    status: 'queued',
  });
  const queuedB = importQueueRepository.create({
    type: 'paste',
    source_title: 'Queued Item B',
    status: 'queued',
  });

  const retriedTask = importQueueService.retryTask(failedTask.id);
  assert(retriedTask.queueOrder > queuedB.queueOrder, 'Retried task should have higher queue order than existing queued items');

  importQueueService.removeTask(failedTask.id);
  importQueueService.removeTask(queuedA.id);
  importQueueService.removeTask(queuedB.id);
  console.log('✓ Test 8 passed: Retried task properly placed at the back of the queue');

  // Test 9: Stages persistence & Book lifecycle timestamps (F69, F70)
  console.log('Test 9: Stages persistence & Book lifecycle timestamps');
  const dTask3 = await importQueueService.enqueuePaste({
    title: 'Lifecycle Verification Document',
    author: 'Test Researcher',
    text: 'A structured document discussing quantum memory coherency and decoherence rates.',
    isNewDossier: true,
    dossierTitle: 'Lifecycle Verification Dossier',
  });
  while (true) {
    const t = importQueueRepository.getById(dTask3.id);
    if (t.status === 'completed') {
      assert(Array.isArray(t.stages), 'Task should have parsed stages array');
      assert.strictEqual(t.stages.length, 7, 'Task should have 7 pipeline stages');
      const ingestStage = t.stages.find((s) => s.stage === 'ingest');
      const idxStage = t.stages.find((s) => s.stage === 'semantic_index');
      assert.strictEqual(ingestStage?.status, 'done', 'Ingest stage should be done');
      assert.strictEqual(idxStage?.status, 'done', 'Semantic index stage should be done');
      assert(t.completed_at, 'Task should have completed_at timestamp');
      assert(t.book_id, 'Task should have book_id');
      const book = bookRepository.getById(t.book_id);
      assert(book, 'Book should exist');
      assert(book.import_started_at, 'Book should have import_started_at timestamp');
      break;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  console.log('✓ Test 9 passed: Stages and book lifecycle timestamps verified');

  // Test 10: Parallel queue setting & concurrency (F68)
  console.log('Test 10: Parallel queue concurrency setting');
  const settingsService = require('../services/settings/settingsService');
  assert.strictEqual(settingsService.get().parallelBookSynthesis, false, 'Default parallelBookSynthesis must be false');
  console.log('✓ Test 10 passed: Concurrency defaults and settings verified');

  console.log('====================================================');
  console.log('🎉 ALL IMPORT QUEUE & DOSSIER PIPELINE TESTS PASSED!');
  console.log('====================================================');
}

runTests().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
