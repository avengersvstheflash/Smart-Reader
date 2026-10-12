const fs = require('fs');
const path = require('path');
const importQueueRepository = require('../../repositories/importQueueRepository');
const bookService = require('../bookService');
const webAcquisitionService = require('../web/webAcquisitionService');
const config = require('../../config');

function countWordsFast(str) {
  if (!str) return 0;
  let count = 0;
  let inWord = false;
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) <= 32) {
      inWord = false;
    } else if (!inWord) {
      inWord = true;
      count++;
    }
  }
  return count;
}

class ImportQueueService {
  constructor() {
    this.isProcessing = false;
    this.currentTaskId = null;
    this.cancellationTokens = new Map(); // taskId -> { cancelled: boolean }
  }

  /**
   * Returns current queue state: active task, queued tasks, history
   */
  getQueueStatus() {
    return importQueueRepository.getQueue();
  }

  /**
   * Enqueue one or more uploaded files
   */
  async enqueueFile({ file, metadata = {} }) {
    if (!file) throw new Error('File payload is required.');

    // Save uploaded file into staging directory
    const ext = path.extname(file.originalname || file.name || '') || '.bin';
    const stagingFilename = `stage-${Date.now()}-${Math.random().toString(36).substring(2, 7)}${ext}`;
    const stagingPath = path.join(config.STAGING_DIR, stagingFilename);

    if (file.buffer) {
      await fs.promises.writeFile(stagingPath, file.buffer);
    } else if (file.path && fs.existsSync(file.path)) {
      await fs.promises.copyFile(file.path, stagingPath);
    } else {
      throw new Error('File buffer or path is invalid.');
    }

    const title = metadata.title || path.basename(file.originalname, ext).replace(/[_-]/g, ' ');

    const task = importQueueRepository.create({
      type: 'file',
      source_title: title,
      source_meta: {
        stagingPath,
        originalFilename: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
        title,
        author: metadata.author || '',
        dossierId: metadata.dossierId || null,
        contentType: metadata.contentType || 'novel',
      },
      status: 'queued',
      stage: 'preparing',
      stage_label: 'Queued for sequential processing',
      progress: 0,
    });

    // Asynchronously kick worker loop
    setImmediate(() => this.tick());

    return task;
  }

  /**
   * Enqueue pasted text with required destination dossier
   */
  async enqueuePaste({
    title,
    author,
    text,
    dossierId,
    dossierTitle,
    isNewDossier = false,
  }) {
    if (!text || text.trim().length === 0) {
      throw new Error('Pasted text content is required.');
    }
    if (!isNewDossier && !dossierId) {
      throw new Error('A destination dossier must be selected or created.');
    }
    if (isNewDossier && (!dossierTitle || !dossierTitle.trim())) {
      throw new Error('A new dossier title is required.');
    }

    const trimmedText = text.trim();
    const docTitle = (title && title.trim()) || 'Pasted Research Document';

    const task = importQueueRepository.create({
      type: 'paste',
      source_title: docTitle,
      source_meta: {
        title: docTitle,
        author: (author && author.trim()) || 'Unknown Author',
        text: trimmedText,
        charCount: trimmedText.length,
        wordCount: countWordsFast(trimmedText),
        dossierId: dossierId || null,
        dossierTitle: dossierTitle ? dossierTitle.trim() : null,
        isNewDossier: Boolean(isNewDossier),
      },
      status: 'queued',
      stage: 'preparing',
      stage_label: 'Queued for sequential processing',
      progress: 0,
    });

    setImmediate(() => this.tick());

    return task;
  }

  /**
   * Enqueue single web source
   */
  async enqueueWeb({ url, title, author, dossierId, description, contentType }) {
    if (!url || !url.trim()) {
      throw new Error('A valid URL is required for web import.');
    }

    const cleanUrl = url.trim();
    const resolvedTitle = (title && title.trim()) || cleanUrl;

    const task = importQueueRepository.create({
      type: 'web',
      source_title: resolvedTitle,
      source_meta: {
        url: cleanUrl,
        title: resolvedTitle,
        author: author || '',
        dossierId: dossierId || null,
        description: description || '',
        contentType: contentType || 'web',
      },
      status: 'queued',
      stage: 'preparing',
      stage_label: 'Queued for sequential processing',
      progress: 0,
    });

    setImmediate(() => this.tick());

    return task;
  }

  /**
   * Enqueue multiple web sources
   */
  async enqueueWebMulti({ sources, title, dossierId, description, contentType }) {
    if (!Array.isArray(sources) || sources.length === 0) {
      throw new Error('At least one web source is required.');
    }

    const dossierName = (title && title.trim()) || `Web Research Dossier (${sources.length} Sources)`;

    const task = importQueueRepository.create({
      type: 'web_multi',
      source_title: dossierName,
      source_meta: {
        sources,
        title: dossierName,
        dossierId: dossierId || null,
        description: description || '',
        contentType: contentType || 'research',
      },
      status: 'queued',
      stage: 'preparing',
      stage_label: 'Queued for sequential processing',
      progress: 0,
    });

    setImmediate(() => this.tick());

    return task;
  }

  /**
   * Main sequential queue tick processor.
   * Ensures strictly sequential execution: one task at a time.
   */
  async tick() {
    if (this.isProcessing) return;

    const nextTask = importQueueRepository.getNextQueued();
    if (!nextTask) return;

    this.isProcessing = true;
    this.currentTaskId = nextTask.id;
    this.cancellationTokens.set(nextTask.id, { cancelled: false });

    console.log(`[ImportQueue] Starting task ${nextTask.id} (${nextTask.type}: "${nextTask.source_title}")`);

    let bookId = null;

    try {
      importQueueRepository.update(nextTask.id, {
        status: 'processing',
        stage: 'preparing',
        stage_label: 'Initializing ingestion task…',
        progress: 5,
        started_at: new Date().toISOString(),
      });

      if (this._isCancelled(nextTask.id)) {
        throw new Error('Task cancelled by user');
      }

      // ── TYPE: FILE ──────────────────────────────────────────────────────────
      if (nextTask.type === 'file') {
        const meta = nextTask.source_meta || {};
        const stagingPath = meta.stagingPath;

        if (!stagingPath || !fs.existsSync(stagingPath)) {
          throw new Error(`Staged upload file not found: ${stagingPath}`);
        }

        importQueueRepository.update(nextTask.id, {
          stage: 'acquiring',
          stage_label: `Reading ${meta.originalFilename}…`,
          progress: 15,
        });

        const fileBuffer = await fs.promises.readFile(stagingPath);

        if (this._isCancelled(nextTask.id)) {
          throw new Error('Task cancelled by user');
        }

        importQueueRepository.update(nextTask.id, {
          stage: 'extracting',
          stage_label: 'Parsing document blocks and metadata…',
          progress: 35,
        });

        // Run through full BookService pipeline
        const importResult = await bookService.importBook({
          title: meta.title,
          author: meta.author,
          contentType: meta.contentType || 'novel',
          fileBuffer,
          originalFilename: meta.originalFilename,
        });

        bookId = importResult.book?.id;

        if (this._isCancelled(nextTask.id)) {
          throw new Error('Task cancelled by user');
        }

        importQueueRepository.update(nextTask.id, {
          stage: 'structuring',
          stage_label: 'Structured chapters and sections saved.',
          progress: 65,
          book_id: bookId,
        });

        // Cleanup staging file
        try {
          await fs.promises.unlink(stagingPath);
        } catch (_) {}

        // If a dossier was specified, attach as chapter/source in dossier
        if (meta.dossierId && bookId) {
          try {
            const doc = bookService.getBook(bookId);
            await bookService.addContentToDossier(meta.dossierId, {
              title: doc.title,
              author: doc.author,
              text: importResult.chapters?.map((c) => c.content).join('\n\n') || '',
            });
          } catch (e) {
            console.warn(`[ImportQueue] Dossier link notice: ${e.message}`);
          }
        }
      }

      // ── TYPE: PASTE ─────────────────────────────────────────────────────────
      else if (nextTask.type === 'paste') {
        const meta = nextTask.source_meta || {};

        importQueueRepository.update(nextTask.id, {
          stage: 'extracting',
          stage_label: `Analyzing pasted text (${meta.charCount?.toLocaleString() || 0} chars)…`,
          progress: 25,
        });

        if (this._isCancelled(nextTask.id)) {
          throw new Error('Task cancelled by user');
        }

        let targetDossierId = meta.dossierId;

        // If user chose Option B (New Dossier) or no dossier ID provided:
        if (meta.isNewDossier || !targetDossierId) {
          const candidateTitle = (meta.dossierTitle || meta.title || 'Research Dossier').trim();

          // Check if a dossier with this title already exists or was created in recent batch
          const existingDossier = bookService.getAllDossiers().find(
            (d) => (d.title || '').trim().toLowerCase() === candidateTitle.toLowerCase()
          );

          if (existingDossier) {
            targetDossierId = existingDossier.id;
          } else {
            importQueueRepository.update(nextTask.id, {
              stage: 'structuring',
              stage_label: `Creating research dossier "${candidateTitle}"…`,
              progress: 40,
            });

            if (this._isCancelled(nextTask.id)) {
              throw new Error('Task cancelled by user');
            }

            const createdDossier = bookService.createDossier({
              title: candidateTitle,
              author: meta.author || 'Research Notes',
              description: `Dossier containing research on ${meta.title}.`,
            });
            targetDossierId = createdDossier.id;
          }
        }

        if (this._isCancelled(nextTask.id)) {
          throw new Error('Task cancelled by user');
        }

        // Add content into destination dossier
        importQueueRepository.update(nextTask.id, {
          stage: 'structuring',
          stage_label: 'Ingesting document into destination dossier…',
          progress: 60,
          book_id: targetDossierId,
        });

        await bookService.addContentToDossier(targetDossierId, {
          title: meta.title,
          author: meta.author,
          text: meta.text,
        });

        if (this._isCancelled(nextTask.id)) {
          throw new Error('Task cancelled by user');
        }

        bookId = targetDossierId;

        importQueueRepository.update(nextTask.id, {
          stage: 'indexing',
          stage_label: 'Semantic vectors and document memory updated.',
          progress: 85,
          book_id: bookId,
        });
      }

      // ── TYPE: WEB ───────────────────────────────────────────────────────────
      else if (nextTask.type === 'web') {
        const meta = nextTask.source_meta || {};

        importQueueRepository.update(nextTask.id, {
          stage: 'acquiring',
          stage_label: `Fetching web content from ${meta.url}…`,
          progress: 20,
        });

        if (this._isCancelled(nextTask.id)) {
          throw new Error('Task cancelled by user');
        }

        importQueueRepository.update(nextTask.id, {
          stage: 'extracting',
          stage_label: 'Extracting readable article body and metadata…',
          progress: 50,
        });

        const webResult = await webAcquisitionService.importSingle({
          url: meta.url,
          customTitle: meta.title,
          customAuthor: meta.author,
          contentType: meta.contentType,
          description: meta.description,
        });

        if (this._isCancelled(nextTask.id)) {
          throw new Error('Task cancelled by user');
        }

        bookId = webResult.book?.id;

        importQueueRepository.update(nextTask.id, {
          stage: 'indexing',
          stage_label: 'Building semantic representations…',
          progress: 80,
          book_id: bookId,
        });
      }

      // ── TYPE: WEB MULTI ─────────────────────────────────────────────────────
      else if (nextTask.type === 'web_multi') {
        const meta = nextTask.source_meta || {};

        importQueueRepository.update(nextTask.id, {
          stage: 'acquiring',
          stage_label: `Fetching ${meta.sources?.length || 1} web sources…`,
          progress: 20,
        });

        if (this._isCancelled(nextTask.id)) {
          throw new Error('Task cancelled by user');
        }

        const multiResult = await webAcquisitionService.importMulti({
          sources: meta.sources,
          title: meta.title,
          contentType: meta.contentType,
          description: meta.description,
        });

        if (this._isCancelled(nextTask.id)) {
          throw new Error('Task cancelled by user');
        }

        bookId = multiResult.book?.id;

        importQueueRepository.update(nextTask.id, {
          stage: 'indexing',
          stage_label: 'Indexing multi-source dossier…',
          progress: 80,
          book_id: bookId,
        });
      }

      // Final check for cancellation before marking completed
      if (this._isCancelled(nextTask.id)) {
        throw new Error('Task cancelled by user');
      }

      // Mark Complete
      importQueueRepository.update(nextTask.id, {
        status: 'completed',
        stage: 'ready',
        stage_label: 'Ready to read',
        progress: 100,
        book_id: bookId,
        completed_at: new Date().toISOString(),
      });

      console.log(`[ImportQueue] Completed task ${nextTask.id} successfully. Linked book: ${bookId}`);
    } catch (err) {
      const isCancelled = this._isCancelled(nextTask.id) || (err.message && err.message.includes('cancelled'));
      if (isCancelled) {
        // Clean up partial book if created for non-dossier single items to avoid orphans
        if (bookId && nextTask.type === 'file') {
          try {
            bookService.deleteBook(bookId);
          } catch (_) {}
        }
        if (nextTask.type === 'file' && nextTask.source_meta?.stagingPath) {
          try {
            if (fs.existsSync(nextTask.source_meta.stagingPath)) {
              fs.unlinkSync(nextTask.source_meta.stagingPath);
            }
          } catch (_) {}
        }

        importQueueRepository.update(nextTask.id, {
          status: 'cancelled',
          stage_label: 'Import cancelled by user',
          completed_at: new Date().toISOString(),
        });
        console.log(`[ImportQueue] Task ${nextTask.id} marked as cancelled.`);
      } else {
        importQueueRepository.update(nextTask.id, {
          status: 'failed',
          stage_label: 'Processing failed',
          error: err.message || 'Unknown processing error',
          completed_at: new Date().toISOString(),
        });
        console.error(`[ImportQueue] Task ${nextTask.id} failed:`, err.message);
      }
    } finally {
      this.cancellationTokens.delete(nextTask.id);
      this.currentTaskId = null;
      this.isProcessing = false;

      // Automatically advance to the next task in queue order!
      setImmediate(() => this.tick());
    }
  }

  cancelTask(id) {
    const task = importQueueRepository.getById(id);
    if (!task) return false;

    if (task.status === 'queued') {
      importQueueRepository.update(id, {
        status: 'cancelled',
        stage_label: 'Cancelled while queued',
        completed_at: new Date().toISOString(),
      });
      return true;
    }

    if (task.status === 'processing' || task.status === 'initializing') {
      const token = this.cancellationTokens.get(id);
      if (token) token.cancelled = true;
      importQueueRepository.update(id, {
        status: 'cancelled',
        stage_label: 'Cancelling active import…',
        completed_at: new Date().toISOString(),
      });
      return true;
    }

    return false;
  }

  retryTask(id) {
    const task = importQueueRepository.getById(id);
    if (!task) return null;

    if (task.type === 'file') {
      const stagingPath = task.source_meta?.stagingPath;
      if (!stagingPath || !fs.existsSync(stagingPath)) {
        throw new Error('Original uploaded file is no longer in staging cache. Please re-upload the file.');
      }
    }

    const nextOrder = importQueueRepository.getNextQueueOrder();

    const updated = importQueueRepository.update(id, {
      status: 'queued',
      stage: 'preparing',
      stage_label: 'Queued for retry',
      queue_order: nextOrder,
      progress: 0,
      error: null,
      completed_at: null,
    });

    setImmediate(() => this.tick());
    return updated;
  }

  reorderTasks(taskIds) {
    importQueueRepository.reorder(taskIds);
    return importQueueRepository.getQueue();
  }

  removeTask(id) {
    const task = importQueueRepository.getById(id);
    if (!task) return false;

    if (task.status === 'processing' || task.status === 'initializing') {
      this.cancelTask(id);
    }

    // If file staging path exists, clean it up
    try {
      const stagingPath = task.source_meta?.stagingPath;
      if (stagingPath && fs.existsSync(stagingPath)) {
        fs.unlinkSync(stagingPath);
      }
    } catch (_) {}

    return importQueueRepository.delete(id);
  }

  clearCompleted() {
    return importQueueRepository.clearCompleted();
  }

  recoverOnBoot() {
    const staleCount = importQueueRepository.markStaleTasksInterrupted();
    if (staleCount > 0) {
      console.log(`[Boot] Marked ${staleCount} interrupted queue tasks.`);
    }

    // If there are pending queued tasks, kick processing
    const nextQueued = importQueueRepository.getNextQueued();
    if (nextQueued) {
      console.log(`[Boot] Resuming pending import queue (${nextQueued.id})...`);
      setImmediate(() => this.tick());
    }
  }

  _isCancelled(taskId) {
    const token = this.cancellationTokens.get(taskId);
    return token?.cancelled === true;
  }
}

module.exports = new ImportQueueService();

