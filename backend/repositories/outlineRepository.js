const { getDatabase } = require('../db/database');

class OutlineRepository {
  saveOutline({ outlineId, id, collectionId, title, chapters, type, createdAt }) {
    const db = getDatabase();
    const oid = outlineId || id || `outline-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const colId = collectionId || 'default';
    const outlineType = type || 'multi_source';
    const now = createdAt || new Date().toISOString();
    const chaptersJson = typeof chapters === 'string' ? chapters : JSON.stringify(chapters || []);

    const existing = db.prepare('SELECT outlineId FROM editorial_outlines WHERE outlineId = ?').get(oid);
    if (existing) {
      db.prepare(`
        UPDATE editorial_outlines
        SET collectionId = ?, title = ?, chapters = ?, type = ?, createdAt = ?
        WHERE outlineId = ?
      `).run(colId, title, chaptersJson, outlineType, now, oid);
    } else {
      db.prepare(`
        INSERT INTO editorial_outlines (outlineId, collectionId, title, chapters, type, createdAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(oid, colId, title, chaptersJson, outlineType, now);
    }

    return this.getById(oid);
  }

  getById(outlineId) {
    if (!outlineId) return null;
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM editorial_outlines WHERE outlineId = ?').get(outlineId);
    return this.formatOutline(row);
  }

  getByCollectionId(collectionId) {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM editorial_outlines WHERE collectionId = ? ORDER BY createdAt DESC').all(collectionId);
    return rows.map((r) => this.formatOutline(r));
  }

  getByBookId(bookId) {
    if (!bookId) return null;
    const db = getDatabase();
    // For single-book outlines, outlineId is book-editorial-${bookId} or collectionId is bookId
    const row = db.prepare(`
      SELECT * FROM editorial_outlines 
      WHERE outlineId = ? OR collectionId = ? 
      ORDER BY createdAt DESC LIMIT 1
    `).get(`book-editorial-${bookId}`, bookId);
    return this.formatOutline(row);
  }

  getAll() {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM editorial_outlines ORDER BY createdAt DESC').all();
    return rows.map((r) => this.formatOutline(r));
  }

  delete(outlineId) {
    if (!outlineId) return false;
    const db = getDatabase();
    const res = db.prepare('DELETE FROM editorial_outlines WHERE outlineId = ?').run(outlineId);
    return res.changes > 0;
  }

  formatOutline(row) {
    if (!row) return null;
    let chapters = [];
    try {
      chapters = typeof row.chapters === 'string' ? JSON.parse(row.chapters) : (row.chapters || []);
    } catch {
      chapters = [];
    }

    return {
      outlineId: row.outlineId,
      id: row.outlineId,
      collectionId: row.collectionId,
      title: row.title,
      type: row.type || 'multi_source',
      chapters,
      createdAt: row.createdAt,
    };
  }
}

module.exports = new OutlineRepository();
