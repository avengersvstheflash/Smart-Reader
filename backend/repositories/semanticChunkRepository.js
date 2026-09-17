const { getDatabase } = require('../db/database');

class SemanticChunkRepository {
  insertBatch(chunks) {
    if (!chunks || chunks.length === 0) return [];
    const db = getDatabase();

    const insert = db.prepare(`
      INSERT INTO semantic_chunks (
        id, book_id, chapter_id, sequence, section_heading,
        content_type, text_content, canonical_json, source_reference,
        source_page, structural_role,
        token_count, content_hash, embedding_json, embedding_model, created_at, updated_at
      ) VALUES (
        @id, @book_id, @chapter_id, @sequence, @section_heading,
        @content_type, @text_content, @canonical_json, @source_reference,
        @source_page, @structural_role,
        @token_count, @content_hash, @embedding_json, @embedding_model, @created_at, @updated_at
      )
    `);

    const checkChapter = db.prepare('SELECT id FROM chapters WHERE id = ?');
    const now = new Date().toISOString();
    const insertMany = db.transaction((items) => {
      for (const item of items) {
        const rawChId = item.chapter_id || item.chapterId || null;
        let validChId = null;
        if (rawChId) {
          const chExists = checkChapter.get(rawChId);
          if (chExists) validChId = rawChId;
        }

        insert.run({
          id: item.id || `chunk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          book_id: item.book_id || item.bookId,
          chapter_id: validChId,
          sequence: item.sequence || 0,
          section_heading: item.section_heading || item.sectionHeading || '',
          content_type: item.content_type || item.contentType || 'paragraph',
          text_content: item.text_content || item.textContent || '',
          canonical_json: typeof item.canonical_json === 'string'
            ? item.canonical_json
            : JSON.stringify(item.canonical_json || item.canonicalBlock || null),
          source_reference: item.source_reference || item.sourceReference || '',
          source_page: item.source_page !== undefined ? item.source_page : (item.sourcePage !== undefined ? item.sourcePage : null),
          structural_role: item.structural_role || item.structuralRole || 'chapter',
          token_count: item.token_count || item.tokenCount || 0,
          content_hash: item.content_hash || item.contentHash || '',
          embedding_json: typeof item.embedding_json === 'string'
            ? item.embedding_json
            : (item.embedding ? JSON.stringify(item.embedding) : null),
          embedding_model: item.embedding_model || item.embeddingModel || (item.embedding && item.embedding.length === 1024 ? 'bge-m3' : (item.embedding ? 'legacy-256d' : 'bge-m3')),
          created_at: item.created_at || now,
          updated_at: item.updated_at || now,
        });
      }
    });

    insertMany(chunks);
    return this.getByBookId(chunks[0].book_id || chunks[0].bookId);
  }

  create(item) {
    const res = this.insertBatch([item]);
    return res[res.length - 1] || null;
  }

  getByBookId(bookId) {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM semantic_chunks 
      WHERE book_id = ? 
      ORDER BY sequence ASC
    `).all(bookId);
    return rows.map((r) => this.formatChunk(r));
  }

  getById(id) {
    if (!id) return null;
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM semantic_chunks WHERE id = ?').get(id);
    return row ? this.formatChunk(row) : null;
  }

  getByChapterId(chapterId) {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM semantic_chunks 
      WHERE chapter_id = ? 
      ORDER BY sequence ASC
    `).all(chapterId);
    return rows.map((r) => this.formatChunk(r));
  }

  deleteByBookId(bookId) {
    const db = getDatabase();
    const res = db.prepare('DELETE FROM semantic_chunks WHERE book_id = ?').run(bookId);
    return res.changes;
  }

  deleteByChapterId(chapterId) {
    const db = getDatabase();
    const res = db.prepare('DELETE FROM semantic_chunks WHERE chapter_id = ?').run(chapterId);
    return res.changes;
  }

  countByBookId(bookId) {
    const db = getDatabase();
    const res = db.prepare('SELECT COUNT(*) as count FROM semantic_chunks WHERE book_id = ?').get(bookId);
    return res ? res.count : 0;
  }

  getAll() {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM semantic_chunks ORDER BY created_at ASC').all();
    return rows.map((r) => this.formatChunk(r));
  }

  findByHash(hash) {
    if (!hash) return null;
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM semantic_chunks WHERE content_hash = ? LIMIT 1').get(hash);
    return row ? this.formatChunk(row) : null;
  }

  formatChunk(row) {
    if (!row) return null;
    let canonical = null;
    if (row.canonical_json) {
      try {
        canonical = JSON.parse(row.canonical_json);
      } catch (e) {
        canonical = null;
      }
    }

    let embedding = null;
    if (row.embedding_json) {
      try {
        embedding = JSON.parse(row.embedding_json);
      } catch (e) {
        embedding = null;
      }
    }

    return {
      id: row.id,
      bookId: row.book_id,
      chapterId: row.chapter_id,
      sequence: row.sequence,
      sectionHeading: row.section_heading,
      contentType: row.content_type,
      textContent: row.text_content,
      canonicalBlock: canonical,
      sourceReference: row.source_reference,
      sourcePage: row.source_page || null,
      structuralRole: row.structural_role || 'chapter',
      tokenCount: row.token_count,
      contentHash: row.content_hash,
      embedding,
      embeddingModel: row.embedding_model || (embedding && embedding.length === 1024 ? 'bge-m3' : (embedding ? 'legacy-256d' : null)),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

module.exports = new SemanticChunkRepository();
