'use strict';

const { getDatabase } = require('../db/database');

class LLMUsageRepository {
  recordUsage(event) {
    const db = getDatabase();
    const now = new Date().toISOString();
    const id = event.id || `use-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    const promptTokens = Number(event.prompt_tokens || event.promptTokens || 0);
    const completionTokens = Number(event.completion_tokens || event.completionTokens || 0);
    const totalTokens = Number(event.total_tokens || event.totalTokens || (promptTokens + completionTokens));
    const costEstimate = Number(event.cost_estimate_usd || event.costEstimateUsd || 0.0);
    const latencyMs = Number(event.latency_ms || event.latencyMs || 0);

    const row = {
      id,
      lifecycle_id: event.lifecycle_id || event.lifecycleId || null,
      book_id: event.book_id || event.bookId,
      chapter_id: event.chapter_id || event.chapterId || null,
      stage: event.stage || 'synthesis',
      provider: event.provider || 'unknown',
      model: event.model || 'unknown',
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      cost_estimate_usd: costEstimate,
      latency_ms: latencyMs,
      finish_reason: event.finish_reason || event.finishReason || null,
      created_at: event.created_at || now,
    };

    if (!row.book_id) {
      throw new Error('book_id is required to record LLM usage.');
    }

    db.prepare(`
      INSERT INTO llm_usage (
        id, lifecycle_id, book_id, chapter_id, stage,
        provider, model, prompt_tokens, completion_tokens,
        total_tokens, cost_estimate_usd, latency_ms,
        finish_reason, created_at
      ) VALUES (
        @id, @lifecycle_id, @book_id, @chapter_id, @stage,
        @provider, @model, @prompt_tokens, @completion_tokens,
        @total_tokens, @cost_estimate_usd, @latency_ms,
        @finish_reason, @created_at
      )
    `).run(row);

    return db.prepare('SELECT * FROM llm_usage WHERE id = ?').get(id);
  }

  getUsageByBookId(bookId) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM llm_usage WHERE book_id = ? ORDER BY created_at ASC').all(bookId);
  }

  getUsageByChapterId(chapterId) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM llm_usage WHERE chapter_id = ? ORDER BY created_at ASC').all(chapterId);
  }

  getUsageByLifecycleId(lifecycleId) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM llm_usage WHERE lifecycle_id = ? ORDER BY created_at ASC').all(lifecycleId);
  }

  getSummaryByBookId(bookId) {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT COALESCE(SUM(prompt_tokens), 0) as total_prompt_tokens,
             COALESCE(SUM(completion_tokens), 0) as total_completion_tokens,
             COALESCE(SUM(total_tokens), 0) as total_tokens,
             COALESCE(SUM(cost_estimate_usd), 0.0) as total_cost_usd,
             COUNT(*) as total_calls,
             COALESCE(AVG(latency_ms), 0) as avg_latency_ms
      FROM llm_usage
      WHERE book_id = ?
    `).get(bookId);

    return {
      total_prompt_tokens: Number(row.total_prompt_tokens || 0),
      total_completion_tokens: Number(row.total_completion_tokens || 0),
      total_tokens: Number(row.total_tokens || 0),
      total_cost_usd: Number(row.total_cost_usd || 0),
      total_calls: Number(row.total_calls || 0),
      avg_latency_ms: Math.round(Number(row.avg_latency_ms || 0)),
    };
  }

  getSummaryByChapterId(chapterId) {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT COALESCE(SUM(prompt_tokens), 0) as total_prompt_tokens,
             COALESCE(SUM(completion_tokens), 0) as total_completion_tokens,
             COALESCE(SUM(total_tokens), 0) as total_tokens,
             COALESCE(SUM(cost_estimate_usd), 0.0) as total_cost_usd,
             COUNT(*) as total_calls,
             COALESCE(AVG(latency_ms), 0) as avg_latency_ms
      FROM llm_usage
      WHERE chapter_id = ?
    `).get(chapterId);

    return {
      total_prompt_tokens: Number(row.total_prompt_tokens || 0),
      total_completion_tokens: Number(row.total_completion_tokens || 0),
      total_tokens: Number(row.total_tokens || 0),
      total_cost_usd: Number(row.total_cost_usd || 0),
      total_calls: Number(row.total_calls || 0),
      avg_latency_ms: Math.round(Number(row.avg_latency_ms || 0)),
    };
  }

  getLifetimeSummary() {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT COALESCE(SUM(prompt_tokens), 0) as total_prompt_tokens,
             COALESCE(SUM(completion_tokens), 0) as total_completion_tokens,
             COALESCE(SUM(total_tokens), 0) as total_tokens,
             COALESCE(SUM(cost_estimate_usd), 0.0) as total_cost_usd,
             COUNT(*) as total_calls,
             COALESCE(AVG(latency_ms), 0) as avg_latency_ms
      FROM llm_usage
    `).get();

    return {
      total_prompt_tokens: Number(row.total_prompt_tokens || 0),
      total_completion_tokens: Number(row.total_completion_tokens || 0),
      total_tokens: Number(row.total_tokens || 0),
      total_cost_usd: Number(row.total_cost_usd || 0),
      total_calls: Number(row.total_calls || 0),
      avg_latency_ms: Math.round(Number(row.avg_latency_ms || 0)),
    };
  }

  getBreakdownByModel() {
    const db = getDatabase();
    return db.prepare(`
      SELECT model, provider,
             COUNT(*) as calls,
             COALESCE(SUM(total_tokens), 0) as tokens,
             COALESCE(SUM(cost_estimate_usd), 0.0) as cost_usd
      FROM llm_usage
      GROUP BY model, provider
      ORDER BY tokens DESC
    `).all();
  }

  getBreakdownByStage() {
    const db = getDatabase();
    return db.prepare(`
      SELECT stage,
             COUNT(*) as calls,
             COALESCE(SUM(total_tokens), 0) as tokens,
             COALESCE(SUM(cost_estimate_usd), 0.0) as cost_usd
      FROM llm_usage
      GROUP BY stage
      ORDER BY cost_usd DESC
    `).all();
  }

  deleteByBookId(bookId) {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM llm_usage WHERE book_id = ?').run(bookId);
    return result.changes > 0;
  }
}

module.exports = new LLMUsageRepository();
