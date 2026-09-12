const { getDatabase } = require('../db/database');

class BookRepository {
  getAll() {
    const db = getDatabase();
    const books = db.prepare(`
      SELECT b.*, 
        (SELECT COUNT(*) FROM chapters c WHERE c.book_id = b.id) as chapter_count,
        (SELECT COUNT(*) FROM chapters c WHERE c.book_id = b.id AND c.status = 'read') as read_chapter_count
      FROM books b
      ORDER BY b.updated_at DESC
    `).all();
    return books;
  }

  getById(id) {
    const db = getDatabase();
    const book = db.prepare(`
      SELECT b.*, 
        (SELECT COUNT(*) FROM chapters c WHERE c.book_id = b.id) as chapter_count,
        (SELECT COUNT(*) FROM chapters c WHERE c.book_id = b.id AND c.status = 'read') as read_chapter_count
      FROM books b
      WHERE b.id = ?
    `).get(id);
    return book;
  }

  create(book) {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO books (id, title, author, description, cover_path, content_type, status, source_format, original_filename, page_count, metadata_json, source_url, source_site, created_at, updated_at)
      VALUES (@id, @title, @author, @description, @cover_path, @content_type, @status, @source_format, @original_filename, @page_count, @metadata_json, @source_url, @source_site, @created_at, @updated_at)
    `);
    stmt.run({
      id: book.id,
      title: book.title,
      author: book.author || 'Unknown Author',
      description: book.description || '',
      cover_path: book.cover_path || '',
      content_type: book.content_type || 'novel',
      status: book.status || 'active',
      source_format: book.source_format || 'text',
      original_filename: book.original_filename || '',
      page_count: book.page_count || 1,
      metadata_json: typeof book.metadata_json === 'object' ? JSON.stringify(book.metadata_json) : (book.metadata_json || '{}'),
      source_url: book.source_url || '',
      source_site: book.source_site || '',
      created_at: book.created_at || new Date().toISOString(),
      updated_at: book.updated_at || new Date().toISOString(),
    });
    return this.getById(book.id);
  }

  update(id, updates) {
    const db = getDatabase();
    const current = this.getById(id);
    if (!current) return null;

    const updated = {
      ...current,
      ...updates,
      metadata_json: typeof updates.metadata_json === 'object' ? JSON.stringify(updates.metadata_json) : (updates.metadata_json || current.metadata_json || '{}'),
      source_url: updates.source_url !== undefined ? updates.source_url : current.source_url,
      source_site: updates.source_site !== undefined ? updates.source_site : current.source_site,
      updated_at: new Date().toISOString(),
    };

    db.prepare(`
      UPDATE books 
      SET title = @title, author = @author, description = @description,
          cover_path = @cover_path, content_type = @content_type,
          status = @status, source_format = @source_format,
          original_filename = @original_filename, page_count = @page_count,
          metadata_json = @metadata_json, source_url = @source_url,
          source_site = @source_site, updated_at = @updated_at
      WHERE id = @id
    `).run(updated);

    return this.getById(id);
  }

  delete(id) {
    const db = getDatabase();
    const deleteTransaction = db.transaction((bookId) => {
      // 1. Delete associated semantic memory chunks
      db.prepare('DELETE FROM semantic_chunks WHERE book_id = ?').run(bookId);

      // 2. Delete associated book-level representations
      db.prepare('DELETE FROM book_representations WHERE book_id = ?').run(bookId);

      // 3. Delete associated supporting materials
      db.prepare('DELETE FROM book_supporting_materials WHERE book_id = ?').run(bookId);

      // 4. Delete associated chapter representations
      db.prepare(`
        DELETE FROM chapter_representations 
        WHERE book_id = ? OR chapter_id IN (SELECT id FROM chapters WHERE book_id = ?)
      `).run(bookId, bookId);

      // 5. Delete associated processing jobs
      db.prepare('DELETE FROM processing_jobs WHERE book_id = ?').run(bookId);

      // 6. Delete associated chapters
      db.prepare('DELETE FROM chapters WHERE book_id = ?').run(bookId);

      // 7. Delete the book record
      const result = db.prepare('DELETE FROM books WHERE id = ?').run(bookId);
      return result.changes > 0;
    });

    return deleteTransaction(id);
  }
}

module.exports = new BookRepository();
