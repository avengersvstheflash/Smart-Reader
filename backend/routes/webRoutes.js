const express = require('express');
const router = express.Router();
const webAcquisitionService = require('../services/web/webAcquisitionService');

/**
 * GET /api/web/search
 * Query params: q (query), category (all|books|research|manga|tech|reference), limit
 */
router.get('/search', async (req, res, next) => {
  try {
    const query = req.query.q || '';
    const category = req.query.category || 'all';
    const limit = parseInt(req.query.limit, 10) || 12;

    if (!query.trim()) {
      return res.json({ success: true, count: 0, results: [] });
    }

    const results = await webAcquisitionService.search(query, { category, limit });
    res.json({
      success: true,
      query,
      category,
      count: results.length,
      results,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/web/preview
 * Body: { url }
 */
router.post('/preview', async (req, res, next) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required for preview.' });
    }

    const preview = await webAcquisitionService.preview(url);
    res.json({
      success: true,
      preview,
    });
  } catch (err) {
    res.status(err.statusCode || 400).json({
      error: err.message || 'Failed to preview web source.',
    });
  }
});

/**
 * POST /api/web/import
 * Body: { url, customTitle, customAuthor, contentType, description }
 */
router.post('/import', async (req, res, next) => {
  try {
    const { url, customTitle, customAuthor, contentType, description } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required for import.' });
    }

    const result = await webAcquisitionService.importSingle({
      url,
      customTitle,
      customAuthor,
      contentType,
      description,
    });

    res.status(201).json({
      success: true,
      book: result.book,
      chapters: result.chapters,
      job: result.job,
    });
  } catch (err) {
    res.status(err.statusCode || 400).json({
      error: err.message || 'Failed to acquire web source.',
    });
  }
});

/**
 * POST /api/web/import-multi
 * Body: { sources: [{ url, title }], title, contentType, description }
 */
router.post('/import-multi', async (req, res, next) => {
  try {
    const { sources, title, contentType, description } = req.body;
    if (!Array.isArray(sources) || sources.length === 0) {
      return res.status(400).json({ error: 'At least one source is required for multi-import.' });
    }

    const result = await webAcquisitionService.importMulti({
      sources,
      title,
      contentType,
      description,
    });

    res.status(201).json({
      success: true,
      book: result.book,
      chapters: result.chapters,
      sourcesCount: result.sourcesCount,
    });
  } catch (err) {
    res.status(err.statusCode || 400).json({
      error: err.message || 'Failed to import multiple web sources.',
    });
  }
});

/**
 * GET /api/web/books/:id/supporting
 */
router.get('/books/:id/supporting', (req, res, next) => {
  try {
    const materials = webAcquisitionService.getSupportingMaterials(req.params.id);
    res.json({
      success: true,
      materials,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/web/books/:id/supporting
 * Body: { url, title, snippet, contentType }
 */
router.post('/books/:id/supporting', async (req, res, next) => {
  try {
    const material = await webAcquisitionService.enrichBookWithSupportingMaterial(req.params.id, req.body);
    res.status(201).json({
      success: true,
      material,
    });
  } catch (err) {
    res.status(err.statusCode || 400).json({
      error: err.message || 'Failed to attach supporting material.',
    });
  }
});

/**
 * DELETE /api/web/supporting/:id
 */
router.delete('/supporting/:id', (req, res, next) => {
  try {
    const deleted = webAcquisitionService.deleteSupportingMaterial(req.params.id);
    res.json({
      success: !!deleted,
      deleted,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/web/books/:id/synopsis
 */
router.post('/books/:id/synopsis', async (req, res, next) => {
  try {
    const result = await webAcquisitionService.generateSynopsis(req.params.id);
    res.json({
      success: true,
      synopsis: result.synopsis,
      book: result.book,
    });
  } catch (err) {
    res.status(400).json({
      error: err.message || 'Failed to generate synopsis.',
    });
  }
});

module.exports = router;
