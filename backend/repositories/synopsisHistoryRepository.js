'use strict';

const { getDatabase } = require('../db/database');
const { countWords } = require('../utils/wordCount');

class SynopsisHistoryRepository {
  recordVersion(data) {
    const db = getDatabase();
    const now = new Date().toISOString();
    const id = data.id || `syn-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    const lifecycleId = data.lifecycle_id || data.lifecycleId;
    if (!lifecycleId) {
      throw new Error('lifecycle_id is required to record a synopsis version.');
    }
    const bookId = data.book_id || data.bookId;
    if (!bookId) {
      throw new Error('book_id is required to record a synopsis version.');
    }

    const version = data.version !== undefined ? data.version : this.getNextVersionNumber(lifecycleId);
    const text = data.synopsis_text || data.synopsisText || '';

    let wordCount = data.word_count !== undefined ? data.word_count : (data.wordCount || 0);
    if (!wordCount && text) {
      try {
        wordCount = countWords(text);
      } catch {
        wordCount = text.split(/\s+/).length;
      }
    }

    const row = {
      id,
      lifecycle_id: lifecycleId,
      book_id: bookId,
      version,
      synopsis_text: text,
      generator_type: data.generator_type || data.generatorType || 'ai_initial',
      model_used: data.model_used || data.modelUsed || null,
      word_count: wordCount,
      created_at: data.created_at || now,
    };

    const result = db.prepare(`
      INSERT OR IGNORE INTO synopsis_history (
        id, lifecycle_id, book_id, version,
        synopsis_text, generator_type, model_used,
        word_count, created_at
      ) VALUES (
        @id, @lifecycle_id, @book_id, @version,
        @synopsis_text, @generator_type, @model_used,
        @word_count, @created_at
      )
    `).run(row);

    if (result.changes === 0) {
      return db.prepare('SELECT * FROM synopsis_history WHERE lifecycle_id = ? AND version = ?').get(lifecycleId, version);
    }

    return db.prepare('SELECT * FROM synopsis_history WHERE id = ?').get(id);
  }

  getHistoryByLifecycleId(lifecycleId) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM synopsis_history WHERE lifecycle_id = ? ORDER BY version ASC').all(lifecycleId);
  }

  getHistoryByBookId(bookId) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM synopsis_history WHERE book_id = ? ORDER BY version ASC').all(bookId);
  }

  getLatestByLifecycleId(lifecycleId) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM synopsis_history WHERE lifecycle_id = ? ORDER BY version DESC LIMIT 1').get(lifecycleId) || null;
  }

  getNextVersionNumber(lifecycleId) {
    const db = getDatabase();
    const row = db.prepare('SELECT COALESCE(MAX(version), 0) + 1 as next_version FROM synopsis_history WHERE lifecycle_id = ?').get(lifecycleId);
    return row ? Number(row.next_version) : 1;
  }
}

module.exports = new SynopsisHistoryRepository();
