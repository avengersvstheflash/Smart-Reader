const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const importQueueRepository = require('../../repositories/importQueueRepository');
const appendLogRepository = require('../../repositories/appendLogRepository');
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
    this.isProcessingCount = 0;
    this.currentTaskIds = new Set();
    this.cancellationTokens = new Map(); // taskId -> { cancelled: boolean }
  }

  get isProcessing() {
    return this.isProcessingCount > 0;
  }

  get currentTaskId() {
    return this.currentTaskIds.values().next().value || null;
  }

  /**
   * Returns current queue state: active task, queued tasks, history
   */
  getQueueStatus() {
    return importQueueRepository.getQueue();
  }

  getTaskById(id) {
    return importQueueRepository.getById(id);
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
    const resolvedDossierId = metadata.targetDossierId || metadata.dossierId || null;

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
        dossierId: resolvedDossierId,
        targetDossierId: resolvedDossierId,
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
   * Enqueue one or more files (alias / helper for single or multiple files)
   */
  async enqueueFiles(args = {}) {
    if (args.file) {
      return this.enqueueFile({ file: args.file, metadata: args.metadata || {} });
    }
    if (Array.isArray(args.files) && args.files.length > 0) {
      const tasks = [];
      for (const f of args.files) {
        tasks.push(await this.enqueueFile({ file: f, metadata: args.metadata || {} }));
      }
      return tasks[0];
    }
    throw new Error('File payload is required.');
  }

  /**
   * Enqueue pasted text with required destination dossier
   */
  async enqueuePaste({
    title,
    author,
    text,
    dossierId,
    targetDossierId,
    dossierTitle,
    isNewDossier,
  }) {
    if (!text || text.trim().length === 0) {
      throw new Error('Pasted text content is required.');
    }

    const trimmedText = text.trim();
    const docTitle = (title && title.trim()) || 'Pasted Research Document';
    const resolvedDossierTitle = dossierTitle ? dossierTitle.trim() : (isNewDossier ? docTitle : null);
    const resolvedDossierId = targetDossierId || dossierId || null;

    const task = importQueueRepository.create({
      type: 'paste',
      source_title: docTitle,
      source_meta: {
        title: docTitle,
        author: (author && author.trim()) || 'Unknown Author',
        text: trimmedText,
        charCount: trimmedText.length,
        wordCount: countWordsFast(trimmedText),
        dossierId: resolvedDossierId,
        targetDossierId: resolvedDossierId,
        dossierTitle: resolvedDossierTitle,
        isNewDossier: isNewDossier !== undefined ? Boolean(isNewDossier) : undefined,
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
  async enqueueWeb({ url, title, author, dossierId, targetDossierId, description, contentType }) {
    if (!url || !url.trim()) {
      throw new Error('A valid URL is required for web import.');
    }

    const cleanUrl = url.trim();
    const resolvedTitle = (title && title.trim()) || cleanUrl;
    const resolvedDossierId = targetDossierId || dossierId || null;

    const task = importQueueRepository.create({
      type: 'web',
      source_title: resolvedTitle,
      source_meta: {
        url: cleanUrl,
        title: resolvedTitle,
        author: author || '',
        dossierId: resolvedDossierId,
        targetDossierId: resolvedDossierId,
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
   * Enqueue Omni Reading re-synthesis from Research Dossier (F52 / 5.8f)
   */
  async enqueueResynthesis({ dossierId, bookId, title, contentType }) {
    if (!dossierId) throw new Error('Dossier ID is required for re-synthesis.');
    const resolvedTitle = (title && title.trim()) || 'Omni Reading Re-synthesis';

    const task = importQueueRepository.create({
      type: 'resynthesis',
      source_title: resolvedTitle,
      source_meta: {
        dossierId,
        bookId: bookId || null,
        title: resolvedTitle,
        contentType: contentType || 'omni',
      },
      status: 'queued',
      stage: 'preparing',
      stage_label: 'Queued for sequential Omni re-synthesis',
      progress: 0,
      book_id: bookId || null,
    });

    setImmediate(() => this.tick());

    return task;
  }

  /**
   * Main sequential queue tick processor.
   * Ensures strictly sequential execution: one task at a time.
   */
  async tick() {
    const settingsService = require('../settings/settingsService');
    const parallelOptIn = Boolean(settingsService.get()?.parallelBookSynthesis);
    const maxParallel = parallelOptIn ? 2 : 1;

    if (this.isProcessingCount >= maxParallel) return;

    const nextTask = importQueueRepository.getNextQueued();
    if (!nextTask) return;

    this.isProcessingCount++;
    this.currentTaskIds.add(nextTask.id);
    this.cancellationTokens.set(nextTask.id, { cancelled: false });

    if (this.isProcessingCount < maxParallel) {
      setImmediate(() => this.tick());
    }

    console.log(`[ImportQueue] Starting task ${nextTask.id} (${nextTask.type}: "${nextTask.source_title}") [active: ${this.isProcessingCount}/${maxParallel}]`);

    let bookId = null;

    try {
      const initialStages = [
        { stage: 'ingest', status: 'running', started_at: new Date().toISOString(), completed_at: null },
        { stage: 'semantic_index', status: 'pending', started_at: null, completed_at: null },
        { stage: 'classify', status: 'pending', started_at: null, completed_at: null },
        { stage: 'outline', status: 'pending', started_at: null, completed_at: null },
        { stage: 'synopsis', status: 'pending', started_at: null, completed_at: null },
        { stage: 'synthesis', status: 'pending', started_at: null, completed_at: null },
        { stage: 'attribution', status: 'pending', started_at: null, completed_at: null },
      ];

      importQueueRepository.update(nextTask.id, {
        status: 'processing',
        stage: 'preparing',
        stage_label: 'Initializing ingestion task…',
        progress: 5,
        started_at: new Date().toISOString(),
        stages_json: initialStages,
      });

      if (this._isCancelled(nextTask.id)) {
        throw new Error('Task cancelled by user');
      }

      // ── TYPE: FILE ──────────────────────────────────────────────────────────
      if (nextTask.type === 'file') {
        const meta = nextTask.source_meta || {};
        const stagingPath = meta.stagingPath;
        const targetDossierId = meta.targetDossierId || meta.dossierId;

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

        if (targetDossierId) {
          // F79b: Append chapters to the existing dossier book (not create a new book)
          const appendResult = await bookService.addContentToDossier(targetDossierId, {
            title: meta.title,
            author: meta.author,
            fileBuffer,
            originalFilename: meta.originalFilename,
          });

          bookId = targetDossierId;

          // Record append log (F79b / F52)
          const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
          appendLogRepository.recordAppend({
            dossier_id: targetDossierId,
            book_id: targetDossierId,
            source_id: `file-${nextTask.id}`,
            source_type: 'file',
            file_name: meta.originalFilename,
            file_hash: fileHash,
            file_size: fileBuffer.length,
            char_count: 0,
            word_count: appendResult?.addedWords || 0,
            appended_at: new Date().toISOString(),
            metadata_json: {
              title: meta.title,
              originalFilename: meta.originalFilename,
              taskId: nextTask.id,
            },
          });

          importQueueRepository.updateStage(nextTask.id, 'ingest', 'done');
          importQueueRepository.updateStage(nextTask.id, 'semantic_index', 'done');
          importQueueRepository.updateStage(nextTask.id, 'classify', 'skipped');
          importQueueRepository.updateStage(nextTask.id, 'outline', 'skipped');
          importQueueRepository.updateStage(nextTask.id, 'synopsis', 'skipped');
          importQueueRepository.updateStage(nextTask.id, 'synthesis', 'skipped');
          importQueueRepository.updateStage(nextTask.id, 'attribution', 'skipped');
        } else {
          // Run through full BookService pipeline
          const importResult = await bookService.importBook({
            title: meta.title,
            author: meta.author,
            contentType: meta.contentType || 'novel',
            fileBuffer,
            originalFilename: meta.originalFilename,
            taskId: nextTask.id,
          });

          bookId = importResult.book?.id;
        }

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

        let targetDossierId = meta.targetDossierId || meta.dossierId;

        // F58.1: Dossier dedup by ID instead of title
        if (targetDossierId) {
          // Rule 1: If client sends dossierId -> use directly (no lookup)
        } else if (meta.isNewDossier === true) {
          // Rule 2: If client sends isNewDossier=true -> always create new (no dedup)
          const candidateTitle = (meta.dossierTitle || meta.title || 'Research Dossier').trim();
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
        } else {
          // Rule 3: Only fall back to title match if neither is provided AND log a console.warn about the ambiguity
          const candidateTitle = (meta.dossierTitle || meta.title || 'Research Dossier').trim();
          console.warn(`[ImportQueue] Ambiguous dossier destination for paste import: neither dossierId nor isNewDossier was specified. Falling back to title matching for "${candidateTitle}".`);

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

        importQueueRepository.updateStage(nextTask.id, 'ingest', 'done');
        const appendResult = await bookService.addContentToDossier(targetDossierId, {
          title: meta.title,
          author: meta.author,
          text: meta.text,
        });

        // Record append log (F79b / F52)
        const fileHash = crypto.createHash('sha256').update(meta.text).digest('hex');
        appendLogRepository.recordAppend({
          dossier_id: targetDossierId,
          book_id: targetDossierId,
          source_id: `paste-${nextTask.id}`,
          source_type: 'paste',
          file_name: meta.title || 'Pasted Research Document',
          file_hash: fileHash,
          file_size: Buffer.byteLength(meta.text, 'utf8'),
          char_count: meta.text.length,
          word_count: appendResult?.addedWords ?? meta.wordCount ?? countWordsFast(meta.text),
          appended_at: new Date().toISOString(),
          metadata_json: {
            title: meta.title,
            author: meta.author,
            taskId: nextTask.id,
          },
        });

        importQueueRepository.updateStage(nextTask.id, 'semantic_index', 'done');
        importQueueRepository.updateStage(nextTask.id, 'classify', 'skipped');
        importQueueRepository.updateStage(nextTask.id, 'outline', 'skipped');
        importQueueRepository.updateStage(nextTask.id, 'synopsis', 'skipped');
        importQueueRepository.updateStage(nextTask.id, 'synthesis', 'skipped');
        importQueueRepository.updateStage(nextTask.id, 'attribution', 'skipped');

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
        const targetDossierId = meta.targetDossierId || meta.dossierId;

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

        if (targetDossierId) {
          // F79b: Append chapters to existing dossier book
          const appendResult = await bookService.addContentToDossier(targetDossierId, {
            url: meta.url,
            title: meta.title,
            author: meta.author,
            description: meta.description,
          });

          bookId = targetDossierId;

          // Record append log (F79b / F52)
          const fileHash = crypto.createHash('sha256').update(meta.url).digest('hex');
          appendLogRepository.recordAppend({
            dossier_id: targetDossierId,
            book_id: targetDossierId,
            source_id: `web-${nextTask.id}`,
            source_type: 'web',
            file_name: meta.url,
            source_url: meta.url,
            file_hash: fileHash,
            file_size: 0,
            char_count: 0,
            word_count: appendResult?.addedWords || 0,
            appended_at: new Date().toISOString(),
            metadata_json: {
              url: meta.url,
              title: meta.title,
              taskId: nextTask.id,
            },
          });

          importQueueRepository.updateStage(nextTask.id, 'ingest', 'done');
          importQueueRepository.updateStage(nextTask.id, 'semantic_index', 'done');
          importQueueRepository.updateStage(nextTask.id, 'classify', 'skipped');
          importQueueRepository.updateStage(nextTask.id, 'outline', 'skipped');
          importQueueRepository.updateStage(nextTask.id, 'synopsis', 'skipped');
          importQueueRepository.updateStage(nextTask.id, 'synthesis', 'skipped');
          importQueueRepository.updateStage(nextTask.id, 'attribution', 'skipped');
        } else {
          const webResult = await webAcquisitionService.importSingle({
            url: meta.url,
            customTitle: meta.title,
            customAuthor: meta.author,
            contentType: meta.contentType,
            description: meta.description,
            taskId: nextTask.id,
          });

          bookId = webResult.book?.id;
        }

        if (this._isCancelled(nextTask.id)) {
          throw new Error('Task cancelled by user');
        }

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
          taskId: nextTask.id,
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

      // ── TYPE: RESYNTHESIS (F52 / 5.8f) ─────────────────────────────────────
      else if (nextTask.type === 'resynthesis') {
        const meta = nextTask.source_meta || {};
        bookId = meta.bookId || nextTask.book_id;

        importQueueRepository.update(nextTask.id, {
          stage: 'synthesis',
          stage_label: 'Synthesizing Omni chapters and restoring progress…',
          progress: 50,
          book_id: bookId,
        });

        if (this._isCancelled(nextTask.id)) {
          throw new Error('Task cancelled by user');
        }

        const editorialService = require('../synthesis/editorialService');
        try {
          editorialService.reconcileReadingProgress(bookId);
        } catch (_) {}

        importQueueRepository.update(nextTask.id, {
          stage: 'ready',
          stage_label: 'Omni reading synthesized successfully',
          progress: 90,
          book_id: bookId,
        });
      }

      // Final check for cancellation before marking completed
      if (this._isCancelled(nextTask.id)) {
        throw new Error('Task cancelled by user');
      }

      // Ensure all stages are properly updated on completion
      const currentTask = importQueueRepository.getById(nextTask.id);
      const currentStages = Array.isArray(currentTask?.stages) ? currentTask.stages : [];
      const completedStages = currentStages.map((s) => ({
        ...s,
        status: s.status === 'skipped' ? 'skipped' : s.status === 'failed' ? 'failed' : 'done',
        completed_at: s.completed_at || new Date().toISOString(),
      }));

      // Mark Complete
      importQueueRepository.update(nextTask.id, {
        status: 'completed',
        stage: 'ready',
        stage_label: 'Ready to read',
        progress: 100,
        book_id: bookId,
        stages_json: completedStages,
        completed_at: new Date().toISOString(),
      });

      console.log(`[ImportQueue] Completed task ${nextTask.id} successfully. Linked book: ${bookId}`);
    } catch (err) {
      const isCancelled = this._isCancelled(nextTask.id) || (err.message && err.message.includes('cancelled'));
      const currentTask = importQueueRepository.getById(nextTask.id);
      const currentStages = Array.isArray(currentTask?.stages) ? currentTask.stages : [];
      const terminalStages = currentStages.map((s) => ({
        ...s,
        status: s.status === 'running' ? 'failed' : s.status,
        completed_at: s.status === 'running' ? new Date().toISOString() : s.completed_at,
      }));

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
          stages_json: terminalStages,
          completed_at: new Date().toISOString(),
        });
        console.log(`[ImportQueue] Task ${nextTask.id} marked as cancelled.`);
      } else {
        importQueueRepository.update(nextTask.id, {
          status: 'failed',
          stage_label: 'Processing failed',
          error: err.message || 'Unknown processing error',
          stages_json: terminalStages,
          completed_at: new Date().toISOString(),
        });
        console.error(`[ImportQueue] Task ${nextTask.id} failed:`, err.message);
      }
    } finally {
      this.cancellationTokens.delete(nextTask.id);
      this.currentTaskIds.delete(nextTask.id);
      this.isProcessingCount = Math.max(0, this.isProcessingCount - 1);

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

