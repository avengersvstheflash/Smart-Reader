const express = require('express');
const multer = require('multer');
const config = require('../config');
const importQueueService = require('../services/ingestion/importQueueService');

const router = express.Router();

const upload = multer({
  limits: { fileSize: config.IMPORT_MAX_SIZE_MB * 1024 * 1024 },
  storage: multer.memoryStorage(),
});

// GET /api/import/queue - get queue status (active, queued, history)
router.get('/', (req, res, next) => {
  try {
    const queue = importQueueService.getQueueStatus();
    res.json({ success: true, ...queue });
  } catch (err) {
    next(err);
  }
});

// GET /api/import/queue/:id - get single task by id
router.get('/:id', (req, res, next) => {
  try {
    const task = importQueueService.getTaskById(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found.' });
    }
    res.json({ success: true, task });
  } catch (err) {
    next(err);
  }
});

// POST /api/import/queue/files - upload one or multiple files into queue
router.post('/files', upload.array('files', 20), async (req, res, next) => {
  try {
    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'No files provided for import.' });
    }

    const dossierId = req.body.dossierId || null;
    const contentType = req.body.contentType || 'novel';

    const tasks = [];
    for (const file of files) {
      const task = await importQueueService.enqueueFile({
        file,
        metadata: {
          dossierId,
          contentType,
        },
      });
      tasks.push(task);
    }

    res.status(201).json({
      success: true,
      count: tasks.length,
      tasks,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/import/queue/file - single file upload (alias)
router.post('/file', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided for import.' });
    }

    const task = await importQueueService.enqueueFile({
      file: req.file,
      metadata: {
        title: req.body.title,
        author: req.body.author,
        dossierId: req.body.dossierId,
        contentType: req.body.contentType,
      },
    });

    res.status(201).json({ success: true, task });
  } catch (err) {
    next(err);
  }
});

// POST /api/import/queue/paste - enqueue large pasted text with destination dossier
router.post('/paste', async (req, res, next) => {
  try {
    const { title, author, text, dossierId, dossierTitle, isNewDossier } = req.body || {};
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Text content is required.' });
    }

    const task = await importQueueService.enqueuePaste({
      title,
      author,
      text,
      dossierId,
      dossierTitle,
      isNewDossier: Boolean(isNewDossier),
    });

    res.status(201).json({ success: true, task });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to enqueue paste import.' });
  }
});

// POST /api/import/queue/web - enqueue single web source
router.post('/web', async (req, res, next) => {
  try {
    const { url, title, author, dossierId, description, contentType } = req.body || {};
    if (!url || !url.trim()) {
      return res.status(400).json({ error: 'URL is required.' });
    }

    const task = await importQueueService.enqueueWeb({
      url,
      title,
      author,
      dossierId,
      description,
      contentType,
    });

    res.status(201).json({ success: true, task });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to enqueue web import.' });
  }
});

// POST /api/import/queue/web-multi - enqueue multiple web sources
router.post('/web-multi', async (req, res, next) => {
  try {
    const { sources, title, dossierId, description, contentType } = req.body || {};
    if (!Array.isArray(sources) || sources.length === 0) {
      return res.status(400).json({ error: 'At least one source is required.' });
    }

    const task = await importQueueService.enqueueWebMulti({
      sources,
      title,
      dossierId,
      description,
      contentType,
    });

    res.status(201).json({ success: true, task });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to enqueue multi-web import.' });
  }
});

// POST /api/import/queue/:id/cancel - cancel an import task
router.post('/:id/cancel', (req, res, next) => {
  try {
    const cancelled = importQueueService.cancelTask(req.params.id);
    res.json({ success: cancelled });
  } catch (err) {
    next(err);
  }
});

// POST /api/import/queue/:id/retry - retry a failed or cancelled task
router.post('/:id/retry', (req, res, next) => {
  try {
    const task = importQueueService.retryTask(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found to retry.' });
    }
    res.json({ success: true, task });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to retry task.' });
  }
});

// POST /api/import/queue/reorder - reorder pending tasks
router.post('/reorder', (req, res, next) => {
  try {
    const { taskIds } = req.body || {};
    if (!Array.isArray(taskIds)) {
      return res.status(400).json({ error: 'taskIds array is required.' });
    }

    const updatedQueue = importQueueService.reorderTasks(taskIds);
    res.json({ success: true, ...updatedQueue });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/import/queue/:id - remove task from queue
router.delete('/:id', (req, res, next) => {
  try {
    const removed = importQueueService.removeTask(req.params.id);
    res.json({ success: removed });
  } catch (err) {
    next(err);
  }
});

// POST /api/import/queue/clear-completed - clear completed and cancelled tasks
router.post('/clear-completed', (req, res, next) => {
  try {
    const cleared = importQueueService.clearCompleted();
    res.json({ success: true, cleared });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

