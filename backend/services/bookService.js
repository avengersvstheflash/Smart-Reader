const fs = require('fs');
const path = require('path');
const bookRepository = require('../repositories/bookRepository');
const chapterRepository = require('../repositories/chapterRepository');
const jobRepository = require('../repositories/jobRepository');
const ingestionService = require('./ingestion/ingestionService');
const { resetAndSeedDatabase } = require('../db/database');
const config = require('../config');

class BookService {
  getAllBooks() {
    return bookRepository.getAll();
  }

  getBook(id) {
    const book = bookRepository.getById(id);
    if (!book) {
      throw new Error(`Book with ID '${id}' was not found.`);
    }
    return book;
  }

  createBook(data) {
    if (!data.title || data.title.trim() === '') {
      throw new Error('Book title is required.');
    }

    const id = data.id || `book-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    return bookRepository.create({
      id,
      title: data.title.trim(),
      author: data.author ? data.author.trim() : 'Unknown Author',
      description: data.description ? data.description.trim() : '',
      cover_path: data.cover_path || '',
      content_type: data.content_type || 'novel',
      status: data.status || 'active',
    });
  }

  deleteBook(id) {
    const book = this.getBook(id);

    // Clean up local uploaded cover file if custom (not default shared asset)
    if (book.cover_path && !book.cover_path.includes('default-') && !book.cover_path.startsWith('data:')) {
      try {
        const fullCoverPath = path.isAbsolute(book.cover_path)
          ? book.cover_path
          : path.join(config.STORAGE_DIR, book.cover_path);
        if (fs.existsSync(fullCoverPath)) {
          fs.unlinkSync(fullCoverPath);
        }
      } catch (err) {
        console.warn(`[BookService] Could not remove cover file for book ${id}:`, err.message);
      }
    }

    const deleted = bookRepository.delete(book.id);
    if (!deleted) {
      throw new Error(`Failed to delete book '${id}' from database.`);
    }

    return {
      success: true,
      id: book.id,
      title: book.title,
      message: `Book "${book.title}", its chapters, generated representations, and processing jobs were permanently removed.`,
    };
  }

  getChapters(bookId) {
    this.getBook(bookId); // Validates book existence
    return chapterRepository.getByBookId(bookId);
  }

  getChapter(id) {
    const chapter = chapterRepository.getById(id);
    if (!chapter) {
      throw new Error(`Chapter with ID '${id}' was not found.`);
    }
    return chapter;
  }

  addChapter(bookId, data) {
    this.getBook(bookId);
    if (!data.title || data.title.trim() === '') {
      throw new Error('Chapter title is required.');
    }
    if (!data.content || data.content.trim() === '') {
      throw new Error('Chapter content is required.');
    }

    const existingChapters = chapterRepository.getByBookId(bookId);
    const nextNumber = existingChapters.length > 0 
      ? Math.max(...existingChapters.map(c => c.number)) + 1 
      : 1;

    const chapterId = data.id || `ch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // Parse into canonical blocks via Ingestion Service
    let canonicalBlocks = [];
    let wordCount = 0;
    try {
      const parsed = ingestionService.ingest({
        title: data.title,
        rawText: data.content,
        contentType: 'novel',
      });
      if (parsed.chapters && parsed.chapters.length > 0) {
        canonicalBlocks = parsed.chapters[0].canonicalBlocks;
        wordCount = parsed.chapters[0].wordCount;
      }
    } catch {
      canonicalBlocks = null;
      wordCount = data.content.trim().split(/\s+/).length;
    }

    const createdChapter = chapterRepository.create({
      id: chapterId,
      book_id: bookId,
      number: data.number || nextNumber,
      title: data.title.trim(),
      content: data.content.trim(),
      canonical_content: canonicalBlocks ? JSON.stringify(canonicalBlocks) : null,
      word_count: wordCount || data.content.trim().split(/\s+/).length,
      status: data.status || 'unread',
    });

    try {
      const semanticLifecycle = require('./semantic/semanticLifecycle');
      semanticLifecycle.indexChapter(chapterId).catch((e) => console.warn('Chapter indexing warning:', e.message));
    } catch (e) {}

    return createdChapter;
  }

  updateChapter(id, updates) {
    this.getChapter(id);
    return chapterRepository.update(id, updates);
  }

  /**
   * Imports a book from raw text or uploaded file buffer, running through the
   * canonical Ingestion Pipeline (Normalizer -> Structure Detector -> Parser -> Canonical Document)
   */
  async importBook({ title, author, description, contentType = 'novel', text, fileBuffer, originalFilename }) {
    let provisionalTitle = title;
    if (!provisionalTitle && originalFilename) {
      provisionalTitle = path.basename(originalFilename, path.extname(originalFilename)).replace(/[_-]/g, ' ');
    }
    if (!provisionalTitle || provisionalTitle.trim() === '') {
      provisionalTitle = 'Imported Reading Material';
    }

    if ((!text || text.trim() === '') && (!fileBuffer || fileBuffer.length === 0)) {
      throw new Error('No readable text or file buffer provided for import.');
    }

    // 1. Process through Ingestion Service Pipeline first to extract accurate title, format, tables, and chapters
    const ingestionResult = await ingestionService.ingest({
      title: provisionalTitle,
      author: author || '',
      description: description || '',
      rawText: text || '',
      fileBuffer,
      originalFilename,
      contentType,
    });

    if (ingestionResult.webAcquired && ingestionResult.book) {
      return {
        format: 'web',
        book: ingestionResult.book,
        chapterCount: (ingestionResult.chapters && ingestionResult.chapters.length) || 1,
        totalWordCount: ingestionResult.totalWordCount || 0,
        tablesCount: ingestionResult.tablesCount || 0,
        pageCount: ingestionResult.pageCount || 1,
        message: `Successfully acquired web content into library.`,
      };
    }

    const finalTitle = title || ingestionResult.title || provisionalTitle;
    const finalAuthor = author || ingestionResult.author || 'Unknown Author';

    // 2. Create Book with rich metadata
    const book = this.createBook({
      title: finalTitle.trim(),
      author: finalAuthor.trim(),
      description: description || `Imported from ${originalFilename || ingestionResult.format}.`,
      content_type: contentType,
      source_format: ingestionResult.format,
      original_filename: originalFilename || '',
      page_count: ingestionResult.pageCount || 1,
      metadata_json: {
        tablesCount: ingestionResult.tablesCount || 0,
        sourceFormat: ingestionResult.format,
        importedAt: new Date().toISOString(),
      },
    });

    // 3. Create Ingestion Job
    const job = jobRepository.create({
      book_id: book.id,
      type: 'INGEST',
      status: 'PROCESSING',
      progress: 50,
    });

    try {
      jobRepository.update(job.id, { progress: 80 });

      // 4. Transform into Chapter Entities (preserving original immutable text alongside canonical content)
      const chapterEntities = ingestionResult.chapters.map((ch, idx) => ({
        id: `ch-${book.id}-${idx + 1}-${Math.random().toString(36).substring(2, 6)}`,
        book_id: book.id,
        number: idx + 1,
        title: ch.title,
        content: ch.content,
        canonical_content: JSON.stringify(ch.canonicalBlocks),
        word_count: ch.wordCount,
        status: 'unread',
      }));

      // 5. Batch Insert Chapters
      chapterRepository.createBatch(chapterEntities);

      // 6. Complete Job
      jobRepository.complete(job.id);

      // 7. Auto-index imported book into Semantic Memory
      try {
        const semanticLifecycle = require('./semantic/semanticLifecycle');
        semanticLifecycle.indexBook(book.id, { skipJob: true }).catch((e) => console.warn('Book indexing warning:', e.message));
      } catch (e) {}

      return {
        book,
        format: ingestionResult.format,
        chapterCount: chapterEntities.length,
        pageCount: ingestionResult.pageCount || 1,
        tablesCount: ingestionResult.tablesCount || 0,
        totalWordCount: ingestionResult.totalWordCount,
        chapters: chapterRepository.getByBookId(book.id),
        job: jobRepository.getById(job.id),
      };
    } catch (err) {
      jobRepository.fail(job.id, err);
      throw err;
    }
  }

  /**
   * Resets database to clean initial state with sample books
   */
  resetDevelopmentData() {
    return resetAndSeedDatabase();
  }
}

module.exports = new BookService();
