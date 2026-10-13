'use strict';

const { getDatabase } = require('../db/database');

class ChapterNameHistoryRepository {
  recordRename(data) {
    const db = getDatabase();
    const now = new Date().toISOString();
    const id = data.id || `cnh-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    const lifecycleId = data.lifecycle_id || data.lifecycleId;
    if (!lifecycleId) {
      throw new Error('lifecycle_id is required to record a chapter rename.');
    }
    const bookId = data.book_id || data.bookId;
    if (!bookId) {
      throw new Error('book_id is required to record a chapter rename.');
    }
    if (data.chapter_sequence === undefined && data.chapterSequence === undefined) {
      throw new Error('chapter_sequence is required to record a chapter rename.');
    }

    const row = {
      id,
      lifecycle_id: lifecycleId,
      book_id: bookId,
      chapter_sequence: Number(data.chapter_sequence !== undefined ? data.chapter_sequence : data.chapterSequence),
      old_title: data.old_title || data.oldTitle || null,
      new_title: data.new_title || data.newTitle,
      rename_source: data.rename_source || data.renameSource || 'ai_synthesis',
      synthesis_cycle: Number(data.synthesis_cycle !== undefined ? data.synthesis_cycle : (data.synthesisCycle || 1)),
      created_at: data.created_at || now,
    };

    if (!row.new_title) {
      throw new Error('new_title is required to record a chapter rename.');
    }

    db.prepare(`
      INSERT INTO chapter_name_history (
        id, lifecycle_id, book_id, chapter_sequence,
        old_title, new_title, rename_source,
        synthesis_cycle, created_at
      ) VALUES (
        @id, @lifecycle_id, @book_id, @chapter_sequence,
        @old_title, @new_title, @rename_source,
        @synthesis_cycle, @created_at
      )
    `).run(row);

    return db.prepare('SELECT * FROM chapter_name_history WHERE id = ?').get(id);
  }

  getHistoryByLifecycleId(lifecycleId) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM chapter_name_history WHERE lifecycle_id = ? ORDER BY chapter_sequence ASC, created_at ASC').all(lifecycleId);
  }

  getHistoryByBookId(bookId) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM chapter_name_history WHERE book_id = ? ORDER BY chapter_sequence ASC, created_at ASC').all(bookId);
  }

  getHistoryForChapter(lifecycleId, chapterSequence) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM chapter_name_history WHERE lifecycle_id = ? AND chapter_sequence = ? ORDER BY created_at ASC').all(lifecycleId, chapterSequence);
  }
}

module.exports = new ChapterNameHistoryRepository();
