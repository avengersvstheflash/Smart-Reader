const { getDatabase } = require('../db/database');

class JobRepository {
  create({ id, book_id, bookId, chapter_id, chapterId, type, status = 'PENDING', progress = 0 }) {
    const db = getDatabase();
    const jobId = id || `job-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const resolvedBookId = book_id || bookId || null;
    const resolvedChapterId = chapter_id || chapterId || null;

    db.prepare(`
      INSERT INTO processing_jobs (id, book_id, chapter_id, type, status, progress, error, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(jobId, resolvedBookId, resolvedChapterId, type, status, progress, null, now, null);

    return this.getById(jobId);
  }

  getById(id) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM processing_jobs WHERE id = ?').get(id);
  }

  getByBookId(bookId) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM processing_jobs WHERE book_id = ? ORDER BY started_at DESC').all(bookId);
  }

  getAll(limit = 20) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM processing_jobs ORDER BY started_at DESC LIMIT ?').all(limit);
  }

  update(id, updates) {
    const db = getDatabase();
    const current = this.getById(id);
    if (!current) return null;

    const updated = {
      ...current,
      ...updates,
    };

    db.prepare(`
      UPDATE processing_jobs
      SET status = @status, progress = @progress, error = @error, completed_at = @completed_at
      WHERE id = @id
    `).run(updated);

    return this.getById(id);
  }

  complete(id) {
    return this.update(id, {
      status: 'COMPLETED',
      progress: 100,
      completed_at: new Date().toISOString(),
    });
  }

  fail(id, error) {
    return this.update(id, {
      status: 'FAILED',
      error: typeof error === 'string' ? error : error.message || 'Unknown processing error',
      completed_at: new Date().toISOString(),
    });
  }

  markStaleJobsInterrupted() {
    const db = getDatabase();
    const now = new Date().toISOString();

    const info = db.prepare(`
      UPDATE processing_jobs
      SET status = 'INTERRUPTED',
          interrupted_at = ?,
          error = COALESCE(error, 'Interrupted by server restart')
      WHERE status IN ('PENDING', 'PROCESSING', 'RUNNING', 'in_progress')
    `).run(now);

    return info.changes;
  }
}

module.exports = new JobRepository();
