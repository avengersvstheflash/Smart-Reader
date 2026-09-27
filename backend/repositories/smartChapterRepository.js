const { getDatabase } = require('../db/database');

class SmartChapterRepository {
  create(chapter) {
    const db = getDatabase();
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO smart_chapters (
        id, book_id, sequence, title, status,
        planned_source_section_ids, planned_word_count,
        content, synthesis_type, metadata_json,
        opened_at, read_at, read_source,
        created_at, updated_at
      ) VALUES (
        @id, @book_id, @sequence, @title, @status,
        @planned_source_section_ids, @planned_word_count,
        @content, @synthesis_type, @metadata_json,
        @opened_at, @read_at, @read_source,
        @created_at, @updated_at
      )
    `);

    stmt.run({
      id: chapter.id,
      book_id: chapter.book_id || chapter.bookId,
      sequence: chapter.sequence,
      title: chapter.title || null,
      status: chapter.status || 'pending',
      planned_source_section_ids: typeof (chapter.planned_source_section_ids || chapter.plannedSourceSectionIds) === 'string'
        ? (chapter.planned_source_section_ids || chapter.plannedSourceSectionIds)
        : JSON.stringify(chapter.planned_source_section_ids || chapter.plannedSourceSectionIds || []),
      planned_word_count: chapter.planned_word_count || chapter.plannedWordCount || null,
      content: chapter.content || null,
      synthesis_type: chapter.synthesis_type || chapter.synthesisType || 'single_book',
      metadata_json: typeof (chapter.metadata_json || chapter.metadata) === 'string'
        ? (chapter.metadata_json || chapter.metadata)
        : JSON.stringify(chapter.metadata_json || chapter.metadata || {}),
      opened_at: chapter.opened_at || null,
      read_at: chapter.read_at || null,
      read_source: chapter.read_source || null,
      created_at: chapter.created_at || now,
      updated_at: chapter.updated_at || now,
    });

    return this.getById(chapter.id);
  }

  createBatch(chapters) {
    if (!Array.isArray(chapters) || chapters.length === 0) return [];
    const db = getDatabase();
    const now = new Date().toISOString();
    const insert = db.prepare(`
      INSERT INTO smart_chapters (
        id, book_id, sequence, title, status,
        planned_source_section_ids, planned_word_count,
        content, synthesis_type, metadata_json,
        opened_at, read_at, read_source,
        created_at, updated_at
      ) VALUES (
        @id, @book_id, @sequence, @title, @status,
        @planned_source_section_ids, @planned_word_count,
        @content, @synthesis_type, @metadata_json,
        @opened_at, @read_at, @read_source,
        @created_at, @updated_at
      )
    `);

    const insertMany = db.transaction((items) => {
      for (const ch of items) {
        insert.run({
          id: ch.id,
          book_id: ch.book_id || ch.bookId,
          sequence: ch.sequence,
          title: ch.title || null,
          status: ch.status || 'pending',
          planned_source_section_ids: typeof (ch.planned_source_section_ids || ch.plannedSourceSectionIds) === 'string'
            ? (ch.planned_source_section_ids || ch.plannedSourceSectionIds)
            : JSON.stringify(ch.planned_source_section_ids || ch.plannedSourceSectionIds || []),
          planned_word_count: ch.planned_word_count || ch.plannedWordCount || null,
          content: ch.content || null,
          synthesis_type: ch.synthesis_type || ch.synthesisType || 'single_book',
          metadata_json: typeof (ch.metadata_json || ch.metadata) === 'string'
            ? (ch.metadata_json || ch.metadata)
            : JSON.stringify(ch.metadata_json || ch.metadata || {}),
          opened_at: ch.opened_at || null,
          read_at: ch.read_at || null,
          read_source: ch.read_source || null,
          created_at: ch.created_at || now,
          updated_at: ch.updated_at || now,
        });
      }
    });

    insertMany(chapters);
    return this.getByBookId(chapters[0].book_id || chapters[0].bookId);
  }

  getById(id) {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM smart_chapters WHERE id = ?').get(id);
    return this.formatRow(row);
  }

  getByBookId(bookId) {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM smart_chapters WHERE book_id = ? ORDER BY sequence ASC').all(bookId);
    return rows.map((r) => this.formatRow(r));
  }

  getGeneratedByBookId(bookId) {
    const db = getDatabase();
    const rows = db.prepare("SELECT * FROM smart_chapters WHERE book_id = ? AND status = 'generated' ORDER BY sequence ASC").all(bookId);
    return rows.map((r) => this.formatRow(r));
  }

  update(id, updates) {
    const db = getDatabase();
    const current = this.getById(id);
    if (!current) return null;

    const updated = {
      ...current,
      ...updates,
      planned_source_section_ids: updates.planned_source_section_ids !== undefined
        ? (typeof updates.planned_source_section_ids === 'string'
            ? updates.planned_source_section_ids
            : JSON.stringify(updates.planned_source_section_ids || []))
        : (typeof current.planned_source_section_ids === 'string'
            ? current.planned_source_section_ids
            : JSON.stringify(current.planned_source_section_ids || [])),
      metadata_json: updates.metadata_json !== undefined
        ? (typeof updates.metadata_json === 'string'
            ? updates.metadata_json
            : JSON.stringify(updates.metadata_json || {}))
        : (typeof current.metadata_json === 'string'
            ? current.metadata_json
            : JSON.stringify(current.metadata || current.metadata_json || {})),
      updated_at: new Date().toISOString(),
    };

    db.prepare(`
      UPDATE smart_chapters
      SET title = @title,
          status = @status,
          planned_source_section_ids = @planned_source_section_ids,
          planned_word_count = @planned_word_count,
          content = @content,
          synthesis_type = @synthesis_type,
          metadata_json = @metadata_json,
          opened_at = @opened_at,
          read_at = @read_at,
          read_source = @read_source,
          updated_at = @updated_at
      WHERE id = @id
    `).run(updated);

    return this.getById(id);
  }

  delete(id) {
    const db = getDatabase();
    const res = db.prepare('DELETE FROM smart_chapters WHERE id = ?').run(id);
    return res.changes > 0;
  }

  deleteByBookId(bookId) {
    const db = getDatabase();
    const res = db.prepare('DELETE FROM smart_chapters WHERE book_id = ?').run(bookId);
    return res.changes;
  }

  formatRow(row) {
    if (!row) return null;
    let planned_source_section_ids = [];
    try {
      planned_source_section_ids = typeof row.planned_source_section_ids === 'string'
        ? JSON.parse(row.planned_source_section_ids)
        : (row.planned_source_section_ids || []);
    } catch {
      planned_source_section_ids = [];
    }

    let metadata = {};
    try {
      metadata = typeof row.metadata_json === 'string'
        ? JSON.parse(row.metadata_json)
        : (row.metadata_json || {});
    } catch {
      metadata = {};
    }

    return {
      ...row,
      planned_source_section_ids,
      metadata,
      metadata_json: metadata,
      sourceSectionIds: planned_source_section_ids,
      plannedWordCount: row.planned_word_count,
      synthesisType: row.synthesis_type,
    };
  }
}

module.exports = new SmartChapterRepository();
