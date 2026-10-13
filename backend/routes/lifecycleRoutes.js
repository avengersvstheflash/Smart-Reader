/**
 * backend/routes/lifecycleRoutes.js
 *
 * F52: REST endpoints for book lifecycle state coordination and LLM token/cost usage.
 *
 * Endpoints:
 * - GET  /api/books/:id/lifecycle           -> Complete lifecycle record & 6 sections
 * - POST /api/books/:id/lifecycle/read-progress -> Updates reading position snapshot
 * - GET  /api/lifecycle/usage/summary       -> Aggregated lifetime LLM usage metrics
 */

'use strict';

const express = require('express');
const router = express.Router();
const bookLifecycleService = require('../services/lifecycle/bookLifecycleService');
const bookLifecycleRepository = require('../repositories/bookLifecycleRepository');
const llmUsageRepository = require('../repositories/llmUsageRepository');
const synopsisHistoryRepository = require('../repositories/synopsisHistoryRepository');
const chapterNameHistoryRepository = require('../repositories/chapterNameHistoryRepository');
const appendLogRepository = require('../repositories/appendLogRepository');
const { getDatabase } = require('../db/database');

/**
 * Shared handler: Get full lifecycle bundle for a book.
 */
function getLifecycleHandler(req, res, next) {
  try {
    const bookId = req.params.id;
    if (!bookId) {
      return res.status(400).json({ error: 'Book ID is required' });
    }

    const db = getDatabase();
    const book = db.prepare('SELECT id FROM books WHERE id = ?').get(bookId);
    let lifecycle = bookLifecycleRepository.getByBookId(bookId);

    if (!book && !lifecycle) {
      return res.status(404).json({ error: 'Book not found' });
    }

    if (!lifecycle) {
      lifecycle = bookLifecycleService.ensureLifecycle(bookId);
    }

    const reading = {
      last_read_sequence: lifecycle.last_read_sequence ?? null,
      last_read_title: lifecycle.last_read_title ?? null,
      last_read_scroll_pct: lifecycle.last_read_scroll_pct ?? null,
      last_read_at: lifecycle.last_read_at ?? null,
    };

    const chapter_history = chapterNameHistoryRepository.getHistoryByLifecycleId(lifecycle.id);

    const rawSynopsis = synopsisHistoryRepository.getHistoryByLifecycleId(lifecycle.id);
    const synopsis_versions = rawSynopsis.map((s) => ({
      version: s.version,
      word_count: s.word_count,
      created_at: s.created_at,
      generator_type: s.generator_type,
    }));

    const dossierId = lifecycle.re_synthesis_source_id || bookId;
    const append_log = db.prepare(`
      SELECT * FROM dossier_append_log
      WHERE dossier_id = ? OR book_id = ?
      ORDER BY appended_at ASC
    `).all(dossierId, bookId);

    const bookUsage = llmUsageRepository.getSummaryByBookId(bookId);

    const stageRows = db.prepare(`
      SELECT stage,
             COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
             COALESCE(SUM(completion_tokens), 0) as completion_tokens,
             COALESCE(SUM(total_tokens), 0) as tokens,
             COALESCE(SUM(cost_estimate_usd), 0.0) as cost_usd,
             COUNT(*) as calls
      FROM llm_usage
      WHERE book_id = ?
      GROUP BY stage
    `).all(bookId);

    const by_stage = {
      classify: null,
      outline: null,
      synopsis: null,
      synthesis: null,
    };

    for (const row of stageRows) {
      by_stage[row.stage] = {
        prompt_tokens: Number(row.prompt_tokens),
        completion_tokens: Number(row.completion_tokens),
        total_tokens: Number(row.tokens),
        cost_usd: Number(row.cost_usd),
        calls: Number(row.calls),
      };
    }

    const usage_summary = {
      total_prompt_tokens: bookUsage.total_prompt_tokens,
      total_completion_tokens: bookUsage.total_completion_tokens,
      total_tokens: bookUsage.total_tokens,
      total_cost_usd: bookUsage.total_cost_usd,
      by_stage,
    };

    return res.json({
      lifecycle,
      reading,
      chapter_history,
      synopsis_versions,
      append_log,
      usage_summary,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Shared handler: Record reading progress snapshot.
 */
function readProgressHandler(req, res, next) {
  try {
    const bookId = req.params.id;
    const { chapterId, sequence, title, scrollPct } = req.body || {};

    if (scrollPct === undefined || scrollPct === null || typeof scrollPct !== 'number' || isNaN(scrollPct) || scrollPct < 0 || scrollPct > 1) {
      return res.status(400).json({ error: 'scrollPct must be a valid number between 0 and 1' });
    }

    const existing = bookLifecycleRepository.getByBookId(bookId);
    if (!existing) {
      return res.status(404).json({ error: `Lifecycle row not found for book ${bookId}` });
    }

    const updated = bookLifecycleService.updateReadingProgress(bookId, {
      chapterId: chapterId || null,
      sequence: sequence !== undefined ? Number(sequence) : null,
      title: title || null,
      scrollPct,
      readAt: new Date().toISOString(),
    });

    return res.json({
      ok: true,
      lifecycle: updated,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Shared handler: Aggregated lifetime LLM usage metrics.
 */
function usageSummaryHandler(req, res, next) {
  try {
    const db = getDatabase();
    const lifetime = llmUsageRepository.getLifetimeSummary();

    const providerRows = db.prepare(`
      SELECT provider,
             COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
             COALESCE(SUM(completion_tokens), 0) as completion_tokens,
             COALESCE(SUM(total_tokens), 0) as total_tokens,
             COALESCE(SUM(cost_estimate_usd), 0.0) as cost_usd,
             COUNT(*) as calls
      FROM llm_usage
      GROUP BY provider
    `).all();

    const by_provider = {};
    for (const r of providerRows) {
      by_provider[r.provider] = {
        prompt_tokens: Number(r.prompt_tokens),
        completion_tokens: Number(r.completion_tokens),
        total_tokens: Number(r.total_tokens),
        tokens: Number(r.total_tokens),
        cost_usd: Number(r.cost_usd),
        calls: Number(r.calls),
      };
    }

    const stageRows = db.prepare(`
      SELECT stage,
             COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
             COALESCE(SUM(completion_tokens), 0) as completion_tokens,
             COALESCE(SUM(total_tokens), 0) as total_tokens,
             COALESCE(SUM(cost_estimate_usd), 0.0) as cost_usd,
             COUNT(*) as calls
      FROM llm_usage
      GROUP BY stage
    `).all();

    const by_stage = {};
    for (const r of stageRows) {
      by_stage[r.stage] = {
        prompt_tokens: Number(r.prompt_tokens),
        completion_tokens: Number(r.completion_tokens),
        total_tokens: Number(r.total_tokens),
        tokens: Number(r.total_tokens),
        cost_usd: Number(r.cost_usd),
        calls: Number(r.calls),
      };
    }

    const bookRows = db.prepare(`
      SELECT u.book_id,
             COALESCE(b.title, 'Unknown Book') as title,
             COALESCE(SUM(u.cost_estimate_usd), 0.0) as total_cost_usd,
             COALESCE(SUM(u.total_tokens), 0) as total_tokens
      FROM llm_usage u
      LEFT JOIN books b ON b.id = u.book_id
      GROUP BY u.book_id
      ORDER BY total_cost_usd DESC, total_tokens DESC
    `).all();

    const by_book = bookRows.map((r) => ({
      book_id: r.book_id,
      title: r.title,
      total_cost_usd: Number(r.total_cost_usd),
      total_tokens: Number(r.total_tokens),
    }));

    return res.json({
      total_cost_usd: lifetime.total_cost_usd,
      total_tokens: lifetime.total_tokens,
      total_prompt_tokens: lifetime.total_prompt_tokens,
      total_completion_tokens: lifetime.total_completion_tokens,
      by_provider,
      by_stage,
      by_book,
    });
  } catch (err) {
    next(err);
  }
}

// Routes mounted directly on /api/lifecycle
router.get('/usage/summary', usageSummaryHandler);

module.exports = router;
module.exports.getLifecycleHandler = getLifecycleHandler;
module.exports.readProgressHandler = readProgressHandler;
module.exports.usageSummaryHandler = usageSummaryHandler;
