'use strict';

const { getDatabase } = require('../db/database');

class BookLifecycleRepository {
  create(data) {
    const db = getDatabase();
    const now = new Date().toISOString();
    const id = data.id || `lc-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    const row = {
      id,
      book_id: data.book_id || data.bookId,
      in_library: data.in_library !== undefined ? (data.in_library ? 1 : 0) : 1,
      in_research: data.in_research !== undefined ? (data.in_research ? 1 : 0) : 1,
      source_preserved: data.source_preserved !== undefined ? (data.source_preserved ? 1 : 0) : 1,
      lifecycle_state: data.lifecycle_state || 'active',
      deleted_at: data.deleted_at || null,
      deleted_reason: data.deleted_reason || null,
      deleted_from: data.deleted_from || null,
      last_read_chapter_id: data.last_read_chapter_id || data.lastReadChapterId || null,
      last_read_sequence: data.last_read_sequence !== undefined ? data.last_read_sequence : null,
      last_read_title: data.last_read_title || data.lastReadTitle || null,
      last_read_scroll_pct: data.last_read_scroll_pct !== undefined ? data.last_read_scroll_pct : null,
      last_read_at: data.last_read_at || data.lastReadAt || null,
      re_synthesis_source_id: data.re_synthesis_source_id || data.reSynthesisSourceId || null,
      synthesis_count: data.synthesis_count !== undefined ? data.synthesis_count : 1,
      created_at: data.created_at || now,
      updated_at: data.updated_at || now,
    };

    if (!row.book_id) {
      throw new Error('book_id is required to create a book_lifecycle record.');
    }

    db.prepare(`
      INSERT INTO book_lifecycle (
        id, book_id, in_library, in_research, source_preserved,
        lifecycle_state, deleted_at, deleted_reason, deleted_from,
        last_read_chapter_id, last_read_sequence, last_read_title,
        last_read_scroll_pct, last_read_at,
        re_synthesis_source_id, synthesis_count,
        created_at, updated_at
      ) VALUES (
        @id, @book_id, @in_library, @in_research, @source_preserved,
        @lifecycle_state, @deleted_at, @deleted_reason, @deleted_from,
        @last_read_chapter_id, @last_read_sequence, @last_read_title,
        @last_read_scroll_pct, @last_read_at,
        @re_synthesis_source_id, @synthesis_count,
        @created_at, @updated_at
      )
    `).run(row);

    return this.getById(id);
  }

  getById(id) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM book_lifecycle WHERE id = ?').get(id) || null;
  }

  getByBookId(bookId) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM book_lifecycle WHERE book_id = ?').get(bookId) || null;
  }

  getAll() {
    const db = getDatabase();
    return db.prepare('SELECT * FROM book_lifecycle ORDER BY updated_at DESC').all();
  }

  getAllActiveLibrary() {
    const db = getDatabase();
    return db.prepare('SELECT * FROM book_lifecycle WHERE in_library = 1 ORDER BY updated_at DESC').all();
  }

  getAllActiveResearch() {
    const db = getDatabase();
    return db.prepare('SELECT * FROM book_lifecycle WHERE in_research = 1 ORDER BY updated_at DESC').all();
  }

  update(bookId, updates) {
    const db = getDatabase();
    const current = this.getByBookId(bookId);
    if (!current) return null;

    const merged = {
      ...current,
      ...updates,
      in_library: updates.in_library !== undefined ? (updates.in_library ? 1 : 0) : current.in_library,
      in_research: updates.in_research !== undefined ? (updates.in_research ? 1 : 0) : current.in_research,
      source_preserved: updates.source_preserved !== undefined ? (updates.source_preserved ? 1 : 0) : current.source_preserved,
      updated_at: new Date().toISOString(),
    };

    db.prepare(`
      UPDATE book_lifecycle
      SET in_library = @in_library,
          in_research = @in_research,
          source_preserved = @source_preserved,
          lifecycle_state = @lifecycle_state,
          deleted_at = @deleted_at,
          deleted_reason = @deleted_reason,
          deleted_from = @deleted_from,
          last_read_chapter_id = @last_read_chapter_id,
          last_read_sequence = @last_read_sequence,
          last_read_title = @last_read_title,
          last_read_scroll_pct = @last_read_scroll_pct,
          last_read_at = @last_read_at,
          re_synthesis_source_id = @re_synthesis_source_id,
          synthesis_count = @synthesis_count,
          updated_at = @updated_at
      WHERE book_id = @book_id
    `).run(merged);

    return this.getByBookId(bookId);
  }

  recordReadingSnapshot(bookId, { chapterId, sequence, title, scrollPct, readAt }) {
    const db = getDatabase();
    const now = new Date().toISOString();
    const current = this.getByBookId(bookId);
    if (!current) return null;

    db.prepare(`
      UPDATE book_lifecycle
      SET last_read_chapter_id = COALESCE(?, last_read_chapter_id),
          last_read_sequence = COALESCE(?, last_read_sequence),
          last_read_title = COALESCE(?, last_read_title),
          last_read_scroll_pct = COALESCE(?, last_read_scroll_pct),
          last_read_at = COALESCE(?, last_read_at),
          updated_at = ?
      WHERE book_id = ?
    `).run(
      chapterId || null,
      sequence !== undefined ? sequence : null,
      title || null,
      scrollPct !== undefined ? scrollPct : null,
      readAt || now,
      now,
      bookId
    );

    return this.getByBookId(bookId);
  }

  markLibraryDeleted(bookId, { reason = 'user_library_delete', preserveSource = true } = {}) {
    const now = new Date().toISOString();
    return this.update(bookId, {
      in_library: 0,
      source_preserved: preserveSource ? 1 : 0,
      lifecycle_state: preserveSource ? 'research_only' : 'archived',
      deleted_at: now,
      deleted_from: 'library',
      deleted_reason: reason,
    });
  }

  markResearchDeleted(bookId, { reason = 'user_research_delete' } = {}) {
    const now = new Date().toISOString();
    const current = this.getByBookId(bookId);
    const inLib = current ? current.in_library : 0;
    return this.update(bookId, {
      in_research: 0,
      source_preserved: 0,
      lifecycle_state: inLib ? 'library_only' : 'archived',
      deleted_at: now,
      deleted_from: 'research',
      deleted_reason: reason,
    });
  }

  markArchived(bookId, { reason = 'user_delete_all' } = {}) {
    const now = new Date().toISOString();
    return this.update(bookId, {
      in_library: 0,
      in_research: 0,
      source_preserved: 0,
      lifecycle_state: 'archived',
      deleted_at: now,
      deleted_from: 'both',
      deleted_reason: reason,
    });
  }

  markReSynthesized(bookId, { dossierId } = {}) {
    const current = this.getByBookId(bookId);
    const count = (current ? current.synthesis_count : 0) + 1;
    return this.update(bookId, {
      in_library: 1,
      lifecycle_state: 'active',
      deleted_at: null,
      deleted_reason: null,
      deleted_from: null,
      synthesis_count: count,
      re_synthesis_source_id: dossierId || (current ? current.re_synthesis_source_id : null),
    });
  }

  delete(id) {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM book_lifecycle WHERE id = ?').run(id);
    return result.changes > 0;
  }

  deleteByBookId(bookId) {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM book_lifecycle WHERE book_id = ?').run(bookId);
    return result.changes > 0;
  }
}

module.exports = new BookLifecycleRepository();
