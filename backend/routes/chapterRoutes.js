const express = require('express');
const bookService = require('../services/bookService');
const aiService = require('../services/ai/aiService');
const chapterRepository = require('../repositories/chapterRepository');

const router = express.Router();

// GET /api/chapters/:id - get single chapter
router.get('/:id', (req, res, next) => {
  try {
    const chapter = bookService.getChapter(req.params.id);
    const representations = chapterRepository.getRepresentations(chapter.id);
    if (representations.length === 0) {
      const editorial = chapterRepository.getEditorialRepresentationsForSourceChapter(chapter.id);
      return res.json({ chapter, representations: editorial });
    }
    res.json({ chapter, representations });
  } catch (err) {
    next(err);
  }
});

// PUT /api/chapters/:id - update chapter (e.g., status: 'reading' | 'read')
router.put('/:id', (req, res, next) => {
  try {
    const updated = bookService.updateChapter(req.params.id, req.body);
    res.json({ chapter: updated });
  } catch (err) {
    next(err);
  }
});

// GET /api/chapters/:id/representations - get all generated representations (summaries, etc.)
router.get('/:id/representations', (req, res, next) => {
  try {
    const representations = chapterRepository.getRepresentations(req.params.id);
    res.json({ representations });
  } catch (err) {
    next(err);
  }
});

// POST /api/chapters/:id/summarize - summarize chapter via AI Provider abstraction
router.post('/:id/summarize', async (req, res, next) => {
  try {
    const options = req.body || {};
    const result = await aiService.summarizeChapter(req.params.id, options);
    res.json(result);
  } catch (err) {
    const requestedMode = err.mode || req.body?.mode || (req.body?.provider === 'gemini' ? 'cloud' : 'local');
    const requestedProvider = err.provider || req.body?.provider || aiService.activeProviderName;
    res.status(502).json({
      error: err.message,
      provider: requestedProvider,
      mode: requestedMode,
      details: err.message,
    });
  }
});

module.exports = router;
