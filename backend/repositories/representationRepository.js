const { getDatabase } = require('../db/database');
const chapterRepository = require('./chapterRepository');

class RepresentationRepository {
  saveBookRepresentation({ id, bookId, type, content, canonicalBlocks, metadata }) {
    const db = getDatabase();
    const now = new Date().toISOString();
    const repId = id || `brep-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const canonicalJson = canonicalBlocks
      ? (typeof canonicalBlocks === 'string' ? canonicalBlocks : JSON.stringify(canonicalBlocks))
      : null;

    const existing = db.prepare('SELECT id FROM book_representations WHERE book_id = ? AND type = ?').get(bookId, type);

    if (existing) {
      db.prepare(`
        UPDATE book_representations
        SET content = ?, canonical_content = ?, metadata_json = ?, updated_at = ?
        WHERE id = ?
      `).run(content, canonicalJson, JSON.stringify(metadata || {}), now, existing.id);
      return this.getBookRepresentationById(existing.id);
    } else {
      db.prepare(`
        INSERT INTO book_representations (id, book_id, type, content, canonical_content, metadata_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(repId, bookId, type, content, canonicalJson, JSON.stringify(metadata || {}), now, now);
      return this.getBookRepresentationById(repId);
    }
  }

  getBookRepresentation(bookId, type) {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM book_representations WHERE book_id = ? AND type = ? ORDER BY updated_at DESC LIMIT 1').get(bookId, type);
    return this.formatBookRepresentation(row);
  }

  getBookRepresentationById(id) {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM book_representations WHERE id = ?').get(id);
    return this.formatBookRepresentation(row);
  }

  getAllBookRepresentations(bookId) {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM book_representations WHERE book_id = ? ORDER BY updated_at DESC').all(bookId);
    return rows.map((r) => this.formatBookRepresentation(r));
  }

  deleteBookRepresentation(id) {
    const db = getDatabase();
    const res = db.prepare('DELETE FROM book_representations WHERE id = ?').run(id);
    return res.changes > 0;
  }

  deleteBookRepresentationsByBook(bookId) {
    const db = getDatabase();
    const res = db.prepare('DELETE FROM book_representations WHERE book_id = ?').run(bookId);
    return res.changes > 0;
  }

  formatBookRepresentation(row) {
    if (!row) return null;
    let metadata = {};
    try {
      metadata = row.metadata_json ? JSON.parse(row.metadata_json) : {};
    } catch {
      metadata = {};
    }

    let canonicalBlocks = null;
    if (row.canonical_content) {
      try {
        canonicalBlocks = JSON.parse(row.canonical_content);
      } catch {
        canonicalBlocks = null;
      }
    }

    return {
      id: row.id,
      bookId: row.book_id,
      type: row.type,
      content: row.content,
      canonicalBlocks,
      metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  saveChapterRepresentation(args) {
    return chapterRepository.saveRepresentation(args);
  }

  getChapterRepresentation(chapterId, type) {
    return chapterRepository.getRepresentationByType(chapterId, type);
  }

  getChapterRepresentationById(id) {
    return chapterRepository.getRepresentationById(id);
  }

  deleteChapterRepresentation(id) {
    return chapterRepository.deleteRepresentation(id);
  }

  getChapterRepresentations(chapterId) {
    return chapterRepository.getRepresentations(chapterId);
  }
}

module.exports = new RepresentationRepository();
