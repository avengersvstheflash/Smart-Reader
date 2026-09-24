const express = require('express');
const router = express.Router();
const semanticLifecycle = require('../services/semantic/semanticLifecycle');
const semanticIndex = require('../services/semantic/semanticIndex');
const retrievalService = require('../services/semantic/retrievalService');
const intelligentSummarizer = require('../services/ai/intelligentSummarizer');

// Trigger semantic indexing for a book
router.post('/index/:bookId', async (req, res) => {
  try {
    const { bookId } = req.params;
    const result = await semanticLifecycle.indexBook(bookId, req.body || {});
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get indexing status and chunk count for a book
router.get('/status/:bookId', (req, res) => {
  try {
    const { bookId } = req.params;
    const stats = semanticIndex.getStats(bookId);
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Semantic similarity search
router.post('/search', async (req, res) => {
  try {
    const { query, scope, bookId, chapterId, bookIds, topK, threshold, contentTypes } = req.body;
    if (!query) {
      return res.status(400).json({ success: false, error: 'Query is required' });
    }

    const results = await semanticIndex.search(query, {
      scope: scope || 'book',
      bookId,
      chapterId,
      bookIds,
      topK: topK || 5,
      threshold: threshold !== undefined ? threshold : 0.05,
      contentTypes,
    });

    res.json({ success: true, data: results, count: results.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Retrieve contextual material
router.post('/retrieve', async (req, res) => {
  try {
    const { query, scope = 'book', bookId, chapterId } = req.body;
    let result;

    if (scope === 'chapter' && chapterId) {
      result = await retrievalService.retrieveForChapter(chapterId, query);
    } else if (bookId) {
      result = await retrievalService.retrieveForBook(bookId, query, { diverse: true });
    } else {
      result = await retrievalService.retrieveForLibrary(query);
    }

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Contextual AI query (Ask about chapter / book / library)
router.post('/ask', async (req, res) => {
  try {
    const { bookId, chapterId, query } = req.body;
    if (!query) {
      return res.status(400).json({ success: false, error: 'Query is required' });
    }

    const answer = await intelligentSummarizer.askContextualQuery({
      bookId,
      chapterId,
      query,
    });

    res.json({ success: true, data: answer });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
