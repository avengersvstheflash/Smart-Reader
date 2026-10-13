'use strict';

const express = require('express');
const router = express.Router();
const { getDatabase } = require('../db/database');
const bookLifecycleRepository = require('../repositories/bookLifecycleRepository');
const importQueueService = require('../services/ingestion/importQueueService');

// POST /api/resynthesis/:dossierId
router.post('/:dossierId', async (req, res, next) => {
  try {
    const { dossierId } = req.params;
    const db = getDatabase();

    // 1. Verify dossier exists and in_research = 1
    const dossierBook = db.prepare('SELECT id, title, author, description, content_type FROM books WHERE id = ?').get(dossierId);
    const dossierLifecycle = bookLifecycleRepository.getByBookId(dossierId);

    if (!dossierBook) {
      return res.status(404).json({ error: `Dossier ${dossierId} not found.` });
    }

    if (dossierLifecycle && dossierLifecycle.in_research !== 1) {
      return res.status(400).json({
        error: `Source for dossier ${dossierId} is detached (in_research = 0). Cannot re-synthesize.`,
      });
    }

    const now = new Date().toISOString();
    const candidateTitle = req.body?.title || `${dossierBook.title} (Omni Reading)`;
    const candidateContentType = req.body?.contentType || 'omni';

    // 2. Create a new book row (book-omni-...) OR reuse an archived one for this dossier
    const newBookId = `book-omni-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    db.prepare(`
      INSERT INTO books (id, title, author, description, content_type, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newBookId,
      candidateTitle,
      dossierBook.author || 'Omni Reader',
      dossierBook.description || '',
      candidateContentType,
      'ready',
      now,
      now
    );

    // Copy source chapters from dossier to new book so synthesis / outline engine has source material
    const sourceChapters = db.prepare('SELECT * FROM chapters WHERE book_id = ? ORDER BY number ASC').all(dossierId);
    if (sourceChapters && sourceChapters.length > 0) {
      for (const ch of sourceChapters) {
        const newChId = `ch-omni-${newBookId}-${ch.number}`;
        db.prepare(`
          INSERT INTO chapters (id, book_id, title, number, content, word_count, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          newChId,
          newBookId,
          ch.title,
          ch.number,
          ch.content || '',
          ch.word_count || 0,
          now,
          now
        );

        // Seed initial smart_chapter
        const newSmartId = `smart-${newBookId}-ch-${ch.number}`;
        db.prepare(`
          INSERT INTO smart_chapters (id, book_id, sequence, title, status, planned_word_count, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          newSmartId,
          newBookId,
          ch.number,
          ch.title,
          'generated',
          ch.word_count || 1000,
          now,
          now
        );
      }
    }

    // 3. Create book_lifecycle row with re_synthesis_source_id = dossierId
    // Carry forward reading progress snapshot from dossier if available
    const initialProgress = dossierLifecycle ? {
      last_read_chapter_id: null,
      last_read_sequence: dossierLifecycle.last_read_sequence,
      last_read_title: dossierLifecycle.last_read_title,
      last_read_scroll_pct: dossierLifecycle.last_read_scroll_pct,
      last_read_at: dossierLifecycle.last_read_at,
    } : {};

    const createdLifecycle = bookLifecycleRepository.create({
      book_id: newBookId,
      in_library: 1,
      in_research: 0,
      source_preserved: 1,
      lifecycle_state: 'active',
      re_synthesis_source_id: dossierId,
      synthesis_count: (dossierLifecycle?.synthesis_count || 0) + 1,
      ...initialProgress,
      created_at: now,
      updated_at: now,
    });

    // Reconcile reading progress for the newly created smart chapters
    const editorialService = require('../services/synthesis/editorialService');
    try {
      editorialService.reconcileReadingProgress(newBookId);
    } catch (err) {
      console.warn(`[Resynthesis] Reading progress reconciliation notice: ${err.message}`);
    }

    // 4. Enqueue via importQueueService (F58) — synthesis-only task
    const task = await importQueueService.enqueueResynthesis({
      dossierId,
      bookId: newBookId,
      title: candidateTitle,
      contentType: candidateContentType,
    });

    // 5. Return immediately with taskId
    res.status(202).json({
      taskId: task.id,
      bookId: newBookId,
      queued: true,
      lifecycle: createdLifecycle,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
