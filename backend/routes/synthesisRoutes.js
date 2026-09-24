const express = require('express');
const router = express.Router();
const editorialService = require('../services/synthesis/editorialService');
const synthesisService = require('../services/synthesis/synthesisService');
const retrievalService = require('../services/semantic/retrievalService');

// POST /api/synthesis/outline - Generate editorial outline across sources
router.post('/outline', async (req, res, next) => {
  try {
    const { bookIds, topic, prompt, title, collectionId, fast } = req.body;
    if (!bookIds || !Array.isArray(bookIds) || bookIds.length === 0) {
      return res.status(400).json({ error: 'bookIds array is required' });
    }

    const outline = await editorialService.generateOutline({
      bookIds,
      topic: topic || prompt || '',
      title,
      collectionId,
      fast: fast === true,
    });

    res.json({ outline });
  } catch (err) {
    next(err);
  }
});

// GET /api/synthesis/outline/:outlineId - Get outline details
router.get('/outline/:outlineId', async (req, res, next) => {
  try {
    const outline = editorialService.getOutline(req.params.outlineId);
    if (!outline) {
      return res.status(404).json({ error: 'Outline not found' });
    }
    res.json({ outline });
  } catch (err) {
    next(err);
  }
});

// GET /api/synthesis/outlines - List outlines
router.get('/outlines', async (req, res, next) => {
  try {
    const collectionId = req.query.collectionId;
    const outlines = collectionId
      ? editorialService.getOutlines(collectionId)
      : editorialService.listOutlines();
    res.json({ outlines });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/synthesis/outline/:outlineId - Delete outline & representations
router.delete('/outline/:outlineId', async (req, res, next) => {
  try {
    const deleted = editorialService.deleteOutline(req.params.outlineId);
    res.json({ success: deleted });
  } catch (err) {
    next(err);
  }
});

// POST /api/synthesis/outline/:outlineId/regenerate - Regenerate outline (invalidates stale representations)
router.post('/outline/:outlineId/regenerate', async (req, res, next) => {
  try {
    const { bookIds, topic, title, fast } = req.body;
    const regenerated = await editorialService.regenerateOutline(req.params.outlineId, {
      bookIds,
      topic,
      title,
      fast: fast === true,
    });
    res.json({ outline: regenerated });
  } catch (err) {
    next(err);
  }
});

// POST /api/synthesis/synthesize - Synthesize editorial chapter
router.post('/synthesize', async (req, res, next) => {
  try {
    const { outlineId, chapterId, fast } = req.body;
    if (!outlineId || !chapterId) {
      return res.status(400).json({ error: 'outlineId and chapterId are required' });
    }

    const result = await synthesisService.synthesizeChapter(outlineId, chapterId, {
      fast: fast === true,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/synthesis/chapter/:outlineId/:chapterId - Get chapter synthesis
router.get('/chapter/:outlineId/:chapterId', async (req, res, next) => {
  try {
    const rep = synthesisService.getSynthesis(req.params.outlineId, req.params.chapterId);
    if (!rep) {
      return res.status(404).json({ error: 'Synthesis not found for chapter' });
    }
    res.json({ representation: rep });
  } catch (err) {
    next(err);
  }
});

// POST /api/synthesis/query - Compare sources Q&A
router.post('/query', async (req, res, next) => {
  try {
    const { bookIds, query, fast } = req.body;
    if (!bookIds || !Array.isArray(bookIds) || bookIds.length === 0) {
      return res.status(400).json({ error: 'bookIds array is required' });
    }
    if (!query || query.trim() === '') {
      return res.status(400).json({ error: 'query string is required' });
    }

    const result = await synthesisService.queryCrossSource({
      bookIds,
      query: query.trim(),
      options: { fast: fast === true },
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/synthesis/search - Cross-source retrieval
router.post('/search', async (req, res, next) => {
  try {
    const { bookIds, query, minScore, topK } = req.body;
    const results = await retrievalService.search(query, {
      bookIds,
      scope: 'collection',
      minScore: minScore !== undefined ? minScore : 0.65,
      topK: topK !== undefined ? topK : 10,
    });
    res.json({ results });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
