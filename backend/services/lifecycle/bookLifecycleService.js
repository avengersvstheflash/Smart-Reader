'use strict';

const bookLifecycleRepository = require('../../repositories/bookLifecycleRepository');
const llmUsageRepository = require('../../repositories/llmUsageRepository');
const appendLogRepository = require('../../repositories/appendLogRepository');
const synopsisHistoryRepository = require('../../repositories/synopsisHistoryRepository');
const chapterNameHistoryRepository = require('../../repositories/chapterNameHistoryRepository');
const { getDatabase } = require('../../db/database');

class BookLifecycleService {
  /**
   * Ensures a book_lifecycle row exists for the given bookId.
   * If not found, derives initial state from books, smart_chapters, and chapters.
   */
  ensureLifecycle(bookId, defaults = {}) {
    if (!bookId) throw new Error('bookId is required for ensureLifecycle');

    const existing = bookLifecycleRepository.getByBookId(bookId);
    if (existing) return existing;

    const db = getDatabase();
    const book = db.prepare('SELECT id, title, description, content_type, created_at, updated_at FROM books WHERE id = ?').get(bookId);

    const hasSmart = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='smart_chapters'").get();
    const hasChapters = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='chapters'").get();

    const smartCount = hasSmart
      ? db.prepare("SELECT COUNT(*) as count FROM smart_chapters WHERE book_id = ? AND status = 'generated'").get(bookId)?.count || 0
      : 0;
    const sourceCount = hasChapters
      ? db.prepare('SELECT COUNT(*) as count FROM chapters WHERE book_id = ?').get(bookId)?.count || 0
      : 0;

    const inLibrary = defaults.in_library !== undefined
      ? (defaults.in_library ? 1 : 0)
      : (smartCount > 0 ? 1 : 0);

    const inResearch = defaults.in_research !== undefined
      ? (defaults.in_research ? 1 : 0)
      : ((sourceCount > 0 || (book && book.content_type === 'research')) ? 1 : 0);

    const sourcePreserved = defaults.source_preserved !== undefined
      ? (defaults.source_preserved ? 1 : 0)
      : 1;

    let lifecycleState = defaults.lifecycle_state;
    if (!lifecycleState) {
      if (inLibrary && inResearch) lifecycleState = 'active';
      else if (inLibrary && !inResearch) lifecycleState = 'library_only';
      else if (!inLibrary && inResearch) lifecycleState = 'research_only';
      else lifecycleState = 'archived';
    }

    let readingSnapshot = null;
    if (hasSmart) {
      readingSnapshot = db.prepare(`
        SELECT id, sequence, title,
               COALESCE(read_at, opened_at) as last_touched,
               CASE WHEN read_at IS NOT NULL THEN 1.0 ELSE 0.0 END as scroll_pct
        FROM smart_chapters
        WHERE book_id = ? AND (read_at IS NOT NULL OR opened_at IS NOT NULL)
        ORDER BY last_touched DESC
        LIMIT 1
      `).get(bookId);
    }

    const now = new Date().toISOString();
    const created = bookLifecycleRepository.create({
      book_id: bookId,
      in_library: inLibrary,
      in_research: inResearch,
      source_preserved: sourcePreserved,
      lifecycle_state: lifecycleState,
      last_read_chapter_id: readingSnapshot ? readingSnapshot.id : null,
      last_read_sequence: readingSnapshot ? readingSnapshot.sequence : null,
      last_read_title: readingSnapshot ? readingSnapshot.title : null,
      last_read_scroll_pct: readingSnapshot ? readingSnapshot.scroll_pct : null,
      last_read_at: readingSnapshot ? readingSnapshot.last_touched : null,
      re_synthesis_source_id: defaults.re_synthesis_source_id || null,
      synthesis_count: inLibrary ? 1 : 0,
      created_at: (book && book.created_at) || now,
      updated_at: (book && book.updated_at) || now,
    });

    // Seed initial synopsis history if book description is present
    if (book && book.description && book.description.trim().length > 0) {
      try {
        synopsisHistoryRepository.recordVersion({
          lifecycle_id: created.id,
          book_id: bookId,
          version: 1,
          synopsis_text: book.description.trim(),
          generator_type: 'ai_initial',
        });
      } catch (err) {
        console.warn(`[BookLifecycleService] Initial synopsis seed notice: ${err.message}`);
      }
    }

    return created;
  }

  getLifecycle(bookId) {
    return this.ensureLifecycle(bookId);
  }

  updateReadingProgress(bookId, { chapterId, sequence, title, scrollPct, readAt }) {
    this.ensureLifecycle(bookId);
    return bookLifecycleRepository.recordReadingSnapshot(bookId, {
      chapterId,
      sequence,
      title,
      scrollPct,
      readAt,
    });
  }

  recordLLMUsage(usageData) {
    if (!usageData.lifecycle_id && usageData.book_id) {
      try {
        const lifecycle = this.ensureLifecycle(usageData.book_id);
        usageData.lifecycle_id = lifecycle.id;
      } catch {}
    }
    return llmUsageRepository.recordUsage(usageData);
  }

  recordDossierAppend(appendData) {
    return appendLogRepository.recordAppend(appendData);
  }

  recordSynopsisVersion(bookId, { synopsisText, generatorType = 'ai_refresh', modelUsed = null }) {
    const lifecycle = this.ensureLifecycle(bookId);
    const nextVer = synopsisHistoryRepository.getNextVersionNumber(lifecycle.id);
    return synopsisHistoryRepository.recordVersion({
      lifecycle_id: lifecycle.id,
      book_id: bookId,
      version: nextVer,
      synopsis_text: synopsisText,
      generator_type: generatorType,
      model_used: modelUsed,
    });
  }

  recordChapterRename(bookId, { sequence, oldTitle, newTitle, renameSource = 'ai_synthesis' }) {
    const lifecycle = this.ensureLifecycle(bookId);
    return chapterNameHistoryRepository.recordRename({
      lifecycle_id: lifecycle.id,
      book_id: bookId,
      chapter_sequence: sequence,
      old_title: oldTitle,
      new_title: newTitle,
      rename_source: renameSource,
      synthesis_cycle: lifecycle.synthesis_count || 1,
    });
  }

  /**
   * Operation A: Delete from Library only. Source preserved in Research.
   */
  deleteFromLibrary(bookId, { reason = 'user_library_delete' } = {}) {
    const lifecycle = this.ensureLifecycle(bookId);
    const updated = bookLifecycleRepository.markLibraryDeleted(bookId, {
      reason,
      preserveSource: true,
    });
    return {
      success: true,
      operation: 'A',
      bookId,
      lifecycle: updated,
    };
  }

  executeOperationA(bookId, options = {}) {
    const db = getDatabase();
    this.ensureLifecycle(bookId);

    // Snapshot reading progress from smart_chapters if present
    const hasSmart = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='smart_chapters'").get();
    if (hasSmart) {
      const activeProgress = db.prepare(`
        SELECT id, sequence, title,
               COALESCE(read_at, opened_at) as last_touched,
               CASE WHEN read_at IS NOT NULL THEN 1.0 ELSE 0.0 END as scroll_pct
        FROM smart_chapters
        WHERE book_id = ? AND (read_at IS NOT NULL OR opened_at IS NOT NULL)
        ORDER BY last_touched DESC
        LIMIT 1
      `).get(bookId);

      if (activeProgress) {
        this.updateReadingProgress(bookId, {
          chapterId: activeProgress.id,
          sequence: activeProgress.sequence,
          title: activeProgress.title,
          scrollPct: activeProgress.scroll_pct,
          readAt: activeProgress.last_touched,
        });
      }

      // Snapshot chapter titles into chapter_name_history
      const chapters = db.prepare('SELECT sequence, title FROM smart_chapters WHERE book_id = ? ORDER BY sequence ASC').all(bookId);
      for (const ch of chapters) {
        if (ch.title) {
          try {
            this.recordChapterRename(bookId, {
              sequence: ch.sequence,
              oldTitle: null,
              newTitle: ch.title,
              renameSource: 'library_delete_snapshot',
            });
          } catch {}
        }
      }

      // Invalidate active outline and derived entities
      const hasAttr = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='paragraph_attributions'").get();
      if (hasAttr) {
        db.prepare('DELETE FROM paragraph_attributions WHERE smart_chapter_id IN (SELECT id FROM smart_chapters WHERE book_id = ?)').run(bookId);
      }
      db.prepare('DELETE FROM smart_chapters WHERE book_id = ?').run(bookId);
      const hasReps = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='chapter_representations'").get();
      if (hasReps) {
        db.prepare("DELETE FROM chapter_representations WHERE book_id = ? AND synthesisType != 'source'").run(bookId);
      }
      const hasOutlines = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='editorial_outlines'").get();
      if (hasOutlines) {
        db.prepare('DELETE FROM editorial_outlines WHERE outlineId = ? OR collectionId = ?').run(bookId, bookId);
      }
    }

    return this.deleteFromLibrary(bookId, options);
  }

  /**
   * Operation B: Delete from Library + delete source. Stays archived for history.
   */
  deleteFromLibraryAndSource(bookId, { reason = 'user_delete_all' } = {}) {
    this.ensureLifecycle(bookId);
    const updated = bookLifecycleRepository.markArchived(bookId, { reason });
    return {
      success: true,
      operation: 'B',
      bookId,
      lifecycle: updated,
    };
  }

  executeOperationB(bookId, options = {}) {
    const db = getDatabase();
    this.ensureLifecycle(bookId);

    // Snapshot reading progress before purge
    const hasSmart = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='smart_chapters'").get();
    if (hasSmart) {
      const activeProgress = db.prepare(`
        SELECT id, sequence, title,
               COALESCE(read_at, opened_at) as last_touched,
               CASE WHEN read_at IS NOT NULL THEN 1.0 ELSE 0.0 END as scroll_pct
        FROM smart_chapters
        WHERE book_id = ? AND (read_at IS NOT NULL OR opened_at IS NOT NULL)
        ORDER BY last_touched DESC
        LIMIT 1
      `).get(bookId);
      if (activeProgress) {
        this.updateReadingProgress(bookId, {
          chapterId: activeProgress.id,
          sequence: activeProgress.sequence,
          title: activeProgress.title,
          scrollPct: activeProgress.scroll_pct,
          readAt: activeProgress.last_touched,
        });
      }
      const hasAttr = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='paragraph_attributions'").get();
      if (hasAttr) {
        db.prepare('DELETE FROM paragraph_attributions WHERE smart_chapter_id IN (SELECT id FROM smart_chapters WHERE book_id = ?)').run(bookId);
      }
      db.prepare('DELETE FROM smart_chapters WHERE book_id = ?').run(bookId);
    }

    const hasChapters = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='chapters'").get();
    if (hasChapters) {
      db.prepare('DELETE FROM chapters WHERE book_id = ?').run(bookId);
    }
    const hasReps = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='chapter_representations'").get();
    if (hasReps) {
      db.prepare('DELETE FROM chapter_representations WHERE book_id = ?').run(bookId);
    }
    const hasChunks = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='semantic_chunks'").get();
    if (hasChunks) {
      db.prepare('DELETE FROM semantic_chunks WHERE book_id = ?').run(bookId);
    }

    // Clean up cover files if any
    try {
      const config = require('../../config');
      const fs = require('fs');
      const path = require('path');
      const book = db.prepare('SELECT cover_path FROM books WHERE id = ?').get(bookId);
      if (book && book.cover_path && !book.cover_path.includes('default-') && !book.cover_path.startsWith('data:')) {
        const fullCoverPath = path.isAbsolute(book.cover_path) ? book.cover_path : path.join(config.STORAGE_DIR, book.cover_path);
        if (fs.existsSync(fullCoverPath)) fs.unlinkSync(fullCoverPath);
      }
    } catch (_) {}

    // If book is already archived, unanchor llm_usage records
    const currentLc = bookLifecycleRepository.getByBookId(bookId);
    if (currentLc && currentLc.lifecycle_state === 'archived') {
      const hasUsage = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='llm_usage'").get();
      if (hasUsage) {
        db.prepare('UPDATE llm_usage SET lifecycle_id = NULL WHERE book_id = ?').run(bookId);
      }
    }

    return this.deleteFromLibraryAndSource(bookId, options);
  }

  /**
   * Operation C: Delete from Research only. Derived reading orphaned.
   */
  deleteFromResearchOnly(bookId, { reason = 'user_research_delete' } = {}) {
    this.ensureLifecycle(bookId);
    const updated = bookLifecycleRepository.markResearchDeleted(bookId, { reason });
    return {
      success: true,
      operation: 'C',
      bookId,
      lifecycle: updated,
    };
  }

  executeOperationC(bookId, options = {}) {
    const db = getDatabase();
    this.ensureLifecycle(bookId);

    // Delete raw source chapters and representations
    const hasChapters = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='chapters'").get();
    if (hasChapters) {
      db.prepare('DELETE FROM chapters WHERE book_id = ?').run(bookId);
    }
    const hasReps = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='chapter_representations'").get();
    if (hasReps) {
      db.prepare("DELETE FROM chapter_representations WHERE book_id = ? AND synthesisType = 'source'").run(bookId);
    }
    const hasChunks = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='semantic_chunks'").get();
    if (hasChunks) {
      db.prepare('DELETE FROM semantic_chunks WHERE book_id = ?').run(bookId);
    }

    // Set provenance fallback on paragraph_attributions
    const hasAttr = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='paragraph_attributions'").get();
    if (hasAttr) {
      db.prepare(`
        UPDATE paragraph_attributions
        SET fell_back = 1, fallback_reason = 'Source detached'
        WHERE smart_chapter_id IN (SELECT id FROM smart_chapters WHERE book_id = ?)
      `).run(bookId);
    }

    return this.deleteFromResearchOnly(bookId, options);
  }

  /**
   * Operation D: Full terminal purge.
   * Only allowed when in 'archived' state (in_library = 0 AND in_research = 0).
   */
  purgeLifecycle(bookId) {
    const lifecycle = bookLifecycleRepository.getByBookId(bookId);
    if (!lifecycle) {
      throw new Error(`No lifecycle record found for book ${bookId}`);
    }

    if (lifecycle.in_library !== 0 || lifecycle.in_research !== 0) {
      throw new Error(`Cannot purge book ${bookId}: must be archived (in_library = 0 and in_research = 0) before full purge.`);
    }

    const deleted = bookLifecycleRepository.deleteByBookId(bookId);
    return {
      success: deleted,
      operation: 'D',
      bookId,
      lifecycle: null,
      message: 'Lifecycle record purged. LLM usage retained with NULL lifecycle_id.',
    };
  }

  executeOperationD(bookId, options = {}) {
    return this.purgeLifecycle(bookId);
  }

  getReadingSnapshot(bookId) {
    const lifecycle = bookLifecycleRepository.getByBookId(bookId);
    if (!lifecycle) return null;
    return {
      chapterId: lifecycle.last_read_chapter_id,
      sequence: lifecycle.last_read_sequence,
      title: lifecycle.last_read_title,
      scrollPct: lifecycle.last_read_scroll_pct,
      readAt: lifecycle.last_read_at,
    };
  }

  markReSynthesized(bookId, { dossierId } = {}) {
    this.ensureLifecycle(bookId);
    return bookLifecycleRepository.markReSynthesized(bookId, { dossierId });
  }

  getUsageSummary(bookId) {
    return {
      book: llmUsageRepository.getSummaryByBookId(bookId),
      lifetime: llmUsageRepository.getLifetimeSummary(),
    };
  }
}

module.exports = new BookLifecycleService();
