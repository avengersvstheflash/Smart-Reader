'use strict';

const { getDatabase } = require('../db/database');

class AppendLogRepository {
  recordAppend(event) {
    const db = getDatabase();
    const now = new Date().toISOString();
    const id = event.id || `app-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    const row = {
      id,
      dossier_id: event.dossier_id || event.dossierId,
      book_id: event.book_id || event.bookId || null,
      source_id: event.source_id || event.sourceId,
      source_type: event.source_type || event.sourceType || 'file',
      file_name: event.file_name || event.fileName || null,
      file_hash: event.file_hash || event.fileHash || null,
      file_size: event.file_size !== undefined ? event.file_size : (event.fileSize || null),
      source_url: event.source_url || event.sourceUrl || null,
      char_count: event.char_count !== undefined ? event.char_count : (event.charCount || 0),
      word_count: event.word_count !== undefined ? event.word_count : (event.wordCount || 0),
      appended_at: event.appended_at || event.appendedAt || now,
      metadata_json: typeof event.metadata_json === 'object'
        ? JSON.stringify(event.metadata_json)
        : (event.metadata_json || event.metadataJson || '{}'),
    };

    if (!row.dossier_id) {
      throw new Error('dossier_id is required to record dossier append.');
    }
    if (!row.source_id) {
      throw new Error('source_id is required to record dossier append.');
    }

    // Insert or ignore if duplicate file_hash in this dossier
    const result = db.prepare(`
      INSERT OR IGNORE INTO dossier_append_log (
        id, dossier_id, book_id, source_id, source_type,
        file_name, file_hash, file_size, source_url,
        char_count, word_count, appended_at, metadata_json
      ) VALUES (
        @id, @dossier_id, @book_id, @source_id, @source_type,
        @file_name, @file_hash, @file_size, @source_url,
        @char_count, @word_count, @appended_at, @metadata_json
      )
    `).run(row);

    if (result.changes === 0 && row.file_hash) {
      return this.getByFileHash(row.dossier_id, row.file_hash);
    }

    return db.prepare('SELECT * FROM dossier_append_log WHERE id = ?').get(id);
  }

  getByDossierId(dossierId) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM dossier_append_log WHERE dossier_id = ? ORDER BY appended_at ASC').all(dossierId);
  }

  getByFileHash(dossierId, fileHash) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM dossier_append_log WHERE dossier_id = ? AND file_hash = ?').get(dossierId, fileHash) || null;
  }

  hasFileHash(dossierId, fileHash) {
    return Boolean(this.getByFileHash(dossierId, fileHash));
  }

  countByDossierId(dossierId) {
    const db = getDatabase();
    const row = db.prepare('SELECT COUNT(*) as count FROM dossier_append_log WHERE dossier_id = ?').get(dossierId);
    return row ? Number(row.count) : 0;
  }

  deleteByDossierId(dossierId) {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM dossier_append_log WHERE dossier_id = ?').run(dossierId);
    return result.changes > 0;
  }
}

module.exports = new AppendLogRepository();
