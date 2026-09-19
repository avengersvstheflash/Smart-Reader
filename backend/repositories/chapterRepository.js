const { getDatabase } = require('../db/database');

class ChapterRepository {
  getByBookId(bookId) {
    const db = getDatabase();
    return db.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM chapter_representations cr WHERE cr.chapter_id = c.id AND cr.type = 'SUMMARY') as has_summary
      FROM chapters c
      WHERE c.book_id = ?
      ORDER BY c.number ASC
    `).all(bookId);
  }

  getById(id) {
    const db = getDatabase();
    const chapter = db.prepare('SELECT * FROM chapters WHERE id = ?').get(id);
    if (!chapter) return null;

    if (chapter.canonical_content) {
      try {
        chapter.canonical_blocks = JSON.parse(chapter.canonical_content);
      } catch {
        chapter.canonical_blocks = null;
      }
    } else {
      chapter.canonical_blocks = null;
    }

    return chapter;
  }

  create(chapter) {
    const db = getDatabase();
    let canonicalContentJson = null;
    if (typeof chapter.canonical_content === 'string') {
      canonicalContentJson = chapter.canonical_content;
    } else if (chapter.canonical_content && typeof chapter.canonical_content === 'object') {
      canonicalContentJson = JSON.stringify(chapter.canonical_content);
    } else if (chapter.canonicalBlocks) {
      canonicalContentJson = JSON.stringify(chapter.canonicalBlocks);
    }

    const stmt = db.prepare(`
      INSERT INTO chapters (id, book_id, number, title, content, canonical_content, word_count, status, structural_role, section_count, metadata_json, created_at, updated_at)
      VALUES (@id, @book_id, @number, @title, @content, @canonical_content, @word_count, @status, @structural_role, @section_count, @metadata_json, @created_at, @updated_at)
    `);
    stmt.run({
      id: chapter.id,
      book_id: chapter.book_id,
      number: chapter.number,
      title: chapter.title,
      content: chapter.content,
      canonical_content: canonicalContentJson,
      word_count: chapter.word_count || (chapter.content ? chapter.content.split(/\s+/).length : 0),
      status: chapter.status || 'unread',
      structural_role: chapter.structural_role || 'chapter',
      section_count: chapter.section_count || 0,
      metadata_json: typeof chapter.metadata_json === 'object' ? JSON.stringify(chapter.metadata_json) : (chapter.metadata_json || '{}'),
      created_at: chapter.created_at || new Date().toISOString(),
      updated_at: chapter.updated_at || new Date().toISOString(),
    });
    return this.getById(chapter.id);
  }

  createBatch(chapters) {
    const db = getDatabase();
    const insert = db.prepare(`
      INSERT INTO chapters (id, book_id, number, title, content, canonical_content, word_count, status, structural_role, section_count, metadata_json, created_at, updated_at)
      VALUES (@id, @book_id, @number, @title, @content, @canonical_content, @word_count, @status, @structural_role, @section_count, @metadata_json, @created_at, @updated_at)
    `);

    const insertMany = db.transaction((items) => {
      for (const item of items) {
        let canonicalContentJson = null;
        if (typeof item.canonical_content === 'string') {
          canonicalContentJson = item.canonical_content;
        } else if (item.canonical_content && typeof item.canonical_content === 'object') {
          canonicalContentJson = JSON.stringify(item.canonical_content);
        } else if (item.canonicalBlocks) {
          canonicalContentJson = JSON.stringify(item.canonicalBlocks);
        }

        insert.run({
          id: item.id,
          book_id: item.book_id,
          number: item.number,
          title: item.title,
          content: item.content,
          canonical_content: canonicalContentJson,
          word_count: item.word_count || (item.content ? item.content.split(/\s+/).length : 0),
          status: item.status || 'unread',
          structural_role: item.structural_role || 'chapter',
          section_count: item.section_count || 0,
          metadata_json: typeof item.metadata_json === 'object' ? JSON.stringify(item.metadata_json) : (item.metadata_json || '{}'),
          created_at: item.created_at || new Date().toISOString(),
          updated_at: item.updated_at || new Date().toISOString(),
        });
      }
    });

    insertMany(chapters);
  }

  update(id, updates) {
    const db = getDatabase();
    const current = this.getById(id);
    if (!current) return null;

    const canonicalContentJson = updates.canonical_content !== undefined
      ? updates.canonical_content
      : updates.canonicalBlocks !== undefined
        ? JSON.stringify(updates.canonicalBlocks)
        : current.canonical_content;

    const updated = {
      ...current,
      ...updates,
      canonical_content: canonicalContentJson,
      updated_at: new Date().toISOString(),
    };

    db.prepare(`
      UPDATE chapters 
      SET number = @number, title = @title, content = @content,
          canonical_content = @canonical_content,
          word_count = @word_count, status = @status, updated_at = @updated_at
      WHERE id = @id
    `).run(updated);

    return this.getById(id);
  }

  delete(id) {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM chapters WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // Chapter Representations (Separating original content from AI generation)
  saveRepresentation({ id, chapterId, bookId, type, content, metadata, provenance, synthesisType }) {
    const db = getDatabase();
    const now = new Date().toISOString();
    const repId = id || `rep-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    let provenanceJson = null;
    if (provenance) {
      provenanceJson = typeof provenance === 'string' ? provenance : JSON.stringify(provenance);
    }
    const resolvedSynthesisType = synthesisType || 'single_source';

    // Upsert or insert representation
    const existing = db.prepare('SELECT id FROM chapter_representations WHERE chapter_id = ? AND type = ?').get(chapterId, type);
    if (existing) {
      db.prepare(`
        UPDATE chapter_representations
        SET book_id = ?, content = ?, metadata_json = ?, provenance = ?, synthesisType = ?, created_at = ?
        WHERE id = ?
      `).run(bookId, content, JSON.stringify(metadata || {}), provenanceJson, resolvedSynthesisType, now, existing.id);
      return this.getRepresentationById(existing.id);
    } else {
      db.prepare(`
        INSERT INTO chapter_representations (id, chapter_id, book_id, type, content, metadata_json, provenance, synthesisType, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(repId, chapterId, bookId, type, content, JSON.stringify(metadata || {}), provenanceJson, resolvedSynthesisType, now);
      return this.getRepresentationById(repId);
    }
  }

  getRepresentationById(id) {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM chapter_representations WHERE id = ?').get(id);
    if (!row) return null;
    return this.formatRepresentation(row);
  }

  getRepresentations(chapterId) {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM chapter_representations WHERE chapter_id = ? ORDER BY created_at DESC').all(chapterId);
    return rows.map((r) => this.formatRepresentation(r));
  }

  getRepresentationByType(chapterId, type) {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM chapter_representations WHERE chapter_id = ? AND type = ? ORDER BY created_at DESC LIMIT 1').get(chapterId, type);
    if (!row) return null;
    return this.formatRepresentation(row);
  }

  getRepresentationsByBook(bookId) {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM chapter_representations WHERE book_id = ? ORDER BY created_at DESC').all(bookId);
    return rows.map((r) => this.formatRepresentation(r));
  }

  getEditorialRepresentationsForSourceChapter(sourceChapterId) {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT DISTINCT
        eo.outlineId,
        je.value AS editorialChapterJson,
        cr.id AS representationId,
        cr.content,
        cr.metadata_json,
        cr.synthesisType,
        cr.created_at,
        cr.*
      FROM editorial_outlines eo
      JOIN json_each(eo.chapters) je
      JOIN json_each(json_extract(je.value, '$.sourceSectionIds')) ssid
      JOIN semantic_chunks sc ON sc.id = ssid.value
      JOIN chapter_representations cr
        ON cr.chapter_id = json_extract(je.value, '$.chapterId')
      WHERE sc.chapter_id = ?
      ORDER BY cr.created_at DESC
    `);
    const rows = stmt.all(sourceChapterId);
    return rows.map(r => this.formatRepresentation(r));
  }

  deleteRepresentation(id) {
    const db = getDatabase();
    const res = db.prepare('DELETE FROM chapter_representations WHERE id = ?').run(id);
    return res.changes > 0;
  }

  deleteRepresentationsByBook(bookId) {
    const db = getDatabase();
    const res = db.prepare('DELETE FROM chapter_representations WHERE book_id = ?').run(bookId);
    return res.changes > 0;
  }

  formatRepresentation(row) {
    if (!row) return null;
    let metadata = {};
    try {
      metadata = row.metadata_json ? JSON.parse(row.metadata_json) : {};
    } catch {
      metadata = {};
    }

    let provenance = [];
    if (row.provenance) {
      try {
        provenance = typeof row.provenance === 'string' ? JSON.parse(row.provenance) : row.provenance;
      } catch {
        provenance = [];
      }
    }

    const synthesisType = row.synthesisType || 'single_source';

    return {
      ...row,
      metadata,
      canonical_blocks: metadata.canonicalBlocks || null,
      canonicalBlocks: metadata.canonicalBlocks || null,
      provenance,
      synthesisType,
      synthesis_type: synthesisType,
    };
  }
}

module.exports = new ChapterRepository();
