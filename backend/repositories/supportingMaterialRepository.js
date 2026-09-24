const { getDatabase } = require('../db/database');

class SupportingMaterialRepository {
  getByBookId(bookId) {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM book_supporting_materials
      WHERE book_id = ?
      ORDER BY created_at DESC
    `).all(bookId);

    return rows.map(r => this.formatRow(r));
  }

  getById(id) {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT * FROM book_supporting_materials
      WHERE id = ?
    `).get(id);

    return row ? this.formatRow(row) : null;
  }

  create(material) {
    const db = getDatabase();
    const id = material.id || `sup-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO book_supporting_materials (
        id, book_id, title, url, source_site, author, content_type,
        snippet, content, canonical_content, metadata_json, created_at
      ) VALUES (
        @id, @book_id, @title, @url, @source_site, @author, @content_type,
        @snippet, @content, @canonical_content, @metadata_json, @created_at
      )
    `);

    stmt.run({
      id,
      book_id: material.book_id,
      title: material.title,
      url: material.url || '',
      source_site: material.source_site || '',
      author: material.author || '',
      content_type: material.content_type || 'web',
      snippet: material.snippet || '',
      content: material.content || '',
      canonical_content: material.canonical_content || 
        (material.canonicalBlocks ? JSON.stringify(material.canonicalBlocks) : null),
      metadata_json: typeof material.metadata_json === 'object' 
        ? JSON.stringify(material.metadata_json) 
        : (material.metadata_json || '{}'),
      created_at: material.created_at || now,
    });

    return this.getById(id);
  }

  delete(id) {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM book_supporting_materials WHERE id = ?').run(id);
    return result.changes > 0;
  }

  deleteByBookId(bookId) {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM book_supporting_materials WHERE book_id = ?').run(bookId);
    return result.changes;
  }

  formatRow(row) {
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
      ...row,
      metadata,
      canonicalBlocks,
    };
  }
}

module.exports = new SupportingMaterialRepository();
