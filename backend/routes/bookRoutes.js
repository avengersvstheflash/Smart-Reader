const express = require('express');
const multer = require('multer');
const bookService = require('../services/bookService');
const webAcquisitionService = require('../services/web/webAcquisitionService');

const router = express.Router();
const upload = multer({
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  storage: multer.memoryStorage(),
});

const { getDatabase } = require('../db/database');

// GET /api/books - list all books
router.get('/', (req, res, next) => {
  try {
    const books = bookService.getAllBooks();
    res.json({ books });
    const db = getDatabase();
    const smartRows = db.prepare(`
      SELECT DISTINCT eo.collectionId AS book_id
      FROM editorial_outlines eo
      JOIN chapter_representations cr
        ON (cr.book_id = eo.collectionId OR cr.book_id = eo.outlineId)
      WHERE cr.type = 'EDITORIAL_SYNTHESIS'
    `).all();
    const smartSet = new Set(smartRows.map((r) => r.book_id));

    const booksWithSmart = books.map((b) => ({
      ...b,
      has_smart_content: smartSet.has(b.id),
    }));

    res.json({ books: booksWithSmart });
  } catch (err) {
    next(err);
  }
});

// POST /api/books - create empty or metadata-only book
router.post('/', (req, res, next) => {
  try {
    const book = bookService.createBook(req.body);
    res.status(201).json({ book });
  } catch (err) {
    next(err);
  }
});

// POST /api/books/import - import a book with chapters from text or uploaded file
router.post('/import', upload.single('file'), async (req, res, next) => {
  try {
    let text = req.body.text || '';
    let originalFilename = '';
    let fileBuffer = null;

    if (req.file) {
      originalFilename = req.file.originalname;
      fileBuffer = req.file.buffer;
    }

    const result = await bookService.importBook({
      title: req.body.title,
      author: req.body.author,
      description: req.body.description,
      contentType: req.body.contentType || 'novel',
      text,
      fileBuffer,
      originalFilename,
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/books/:id - get book by ID
router.get('/:id', (req, res, next) => {
  try {
    const book = bookService.getBook(req.params.id);
    res.json({ book });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/books/:id - delete book
router.delete('/:id', (req, res, next) => {
  try {
    const success = bookService.deleteBook(req.params.id);
    res.json({ success });
  } catch (err) {
    next(err);
  }
});

// GET /api/books/:id/chapters - get all chapters for a book
router.get('/:id/chapters', (req, res, next) => {
  try {
    const chapters = bookService.getChapters(req.params.id);
    res.json({ chapters });
  } catch (err) {
    next(err);
  }
});

// POST /api/books/:id/chapters - add a chapter
router.post('/:id/chapters', (req, res, next) => {
  try {
    const chapter = bookService.addChapter(req.params.id, req.body);
    res.status(201).json({ chapter });
  } catch (err) {
    next(err);
  }
});

// GET /api/books/:id/supporting - get supporting materials
router.get('/:id/supporting', (req, res, next) => {
  try {
    const materials = webAcquisitionService.getSupportingMaterials(req.params.id);
    res.json({ success: true, materials });
  } catch (err) {
    next(err);
  }
});

// POST /api/books/:id/supporting - attach supporting material
router.post('/:id/supporting', async (req, res, next) => {
  try {
    const material = await webAcquisitionService.enrichBookWithSupportingMaterial(req.params.id, req.body);
    res.status(201).json({ success: true, material });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to attach supporting material.' });
  }
});

const intelligentSummarizer = require('../services/ai/intelligentSummarizer');
const bookClassifier = require('../services/ai/bookClassifier');
const representationRepository = require('../repositories/representationRepository');

// POST /api/books/:id/classify - trigger classification for a book
router.post('/:id/classify', async (req, res, next) => {
  try {
    const classification = await bookClassifier.classifyBook(req.params.id, req.body || {});
    const book = bookService.getBook(req.params.id);
    res.json({
      success: true,
      classification,
      book,
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to classify book.' });
  }
});

// POST /api/books/:id/synopsis - generate grounded editorial synopsis
router.post('/:id/synopsis', async (req, res, next) => {
  try {
    const result = await intelligentSummarizer.generateSynopsis(req.params.id, req.body);
    const book = bookService.getBook(req.params.id);
    res.json({
      success: true,
      synopsis: result.representation.content,
      canonicalBlocks: result.canonicalBlocks,
      representation: result.representation,
      book,
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to generate synopsis.' });
  }
});

// GET /api/books/:id/synopsis - get stored synopsis representation
router.get('/:id/synopsis', (req, res, next) => {
  try {
    const representation = representationRepository.getBookRepresentation(req.params.id, 'SYNOPSIS');
    res.json({ success: true, representation });
  } catch (err) {
    next(err);
  }
});

// POST /api/books/:id/summarize - generate deep, structured Book Summary
router.post('/:id/summarize', async (req, res, next) => {
  try {
    const result = await intelligentSummarizer.generateBookSummary(req.params.id, req.body);
    res.json({
      success: true,
      summary: result.representation.content,
      canonicalBlocks: result.canonicalBlocks,
      representation: result.representation,
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to generate book summary.' });
  }
});

// GET /api/books/:id/summary - get stored book summary representation
router.get('/:id/summary', (req, res, next) => {
  try {
    const representation = representationRepository.getBookRepresentation(req.params.id, 'BOOK_SUMMARY');
    res.json({ success: true, representation });
  } catch (err) {
    next(err);
  }
});

// GET /api/books/:id/representations - get all representations for a book
router.get('/:id/representations', (req, res, next) => {
  try {
    const representations = representationRepository.getAllBookRepresentations(req.params.id);
    res.json({ success: true, representations });
  } catch (err) {
    next(err);
  }
});

// POST /api/books/:id/ask - ask contextual query about book
router.post('/:id/ask', async (req, res, next) => {
  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query is required.' });
    }
    const result = await intelligentSummarizer.askContextualQuery({
      bookId: req.params.id,
      query,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to answer query.' });
  }
});

// Single-Book Smart Reading / Editorial Endpoints
const editorialService = require('../services/synthesis/editorialService');
const synthesisService = require('../services/synthesis/synthesisService');

// POST /api/books/:id/editorial/generate - Generate single-book editorial outline
router.post('/:id/editorial/generate', async (req, res, next) => {
  try {
    const book = bookService.getBook(req.params.id);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    const { topic, fast, title } = req.body || {};
    const outline = await editorialService.generateSingleBookOutline(req.params.id, {
      topic,
      fast: fast === true,
      title,
    });

    res.json({
      success: true,
      status: 'ready',
      outline,
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to generate editorial outline.' });
  }
});

// GET /api/books/:id/editorial - Get single-book editorial outline and chapters status
router.get('/:id/editorial', async (req, res, next) => {
  try {
    const outline = editorialService.getSingleBookOutline(req.params.id);
    if (!outline) {
      return res.json({ status: 'not_generated' });
    }

    // Attach synthesis status to chapters
    const chaptersWithStatus = (outline.chapters || []).map((ch) => {
      const rep = synthesisService.getSynthesis(outline.outlineId, ch.chapterId);
      return {
        ...ch,
        isSynthesized: !!rep,
        synthesizedContent: rep ? rep.content : null,
      };
    });

    res.json({
      status: 'ready',
      outline: {
        ...outline,
        chapters: chaptersWithStatus,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/books/:id/editorial/synthesize - Synthesize a single chapter in single-book outline
router.post('/:id/editorial/synthesize', async (req, res, next) => {
  try {
    const { chapterId, fast } = req.body;
    if (!chapterId) {
      return res.status(400).json({ error: 'chapterId is required' });
    }

    const outline = editorialService.getSingleBookOutline(req.params.id);
    if (!outline) {
      return res.status(404).json({ error: 'Editorial outline not generated for this book.' });
    }

    const result = await synthesisService.synthesizeChapter(outline.outlineId, chapterId, {
      fast: fast === true,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to synthesize chapter.' });
  }
});

// POST /api/books/:id/editorial/synthesize-next - Synthesize next N chapters sequentially
router.post('/:id/editorial/synthesize-next', async (req, res, next) => {
  try {
    const { count, fast } = req.body || {};
    const validCounts = [1, 3, 5, 10];
    if (typeof count !== 'number' || !validCounts.includes(count)) {
      return res.status(400).json({ error: 'Invalid count: must be 1, 3, 5, or 10' });
    }

    const outline = editorialService.getSingleBookOutline(req.params.id);
    if (!outline) {
      return res.status(404).json({ error: `No outline for book ${req.params.id}` });
    }

    const result = await editorialService.synthesizeNextChapters(req.params.id, count, {
      fast: fast === true,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    if (err.message && err.message.includes('Invalid count')) {
      return res.status(400).json({ error: err.message });
    }
    if (err.message && err.message.includes('No outline')) {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || 'Failed to synthesize next chapters.' });
  }
});

// GET /api/books/:id/editorial/progress - Get progressive synthesis status
router.get('/:id/editorial/progress', async (req, res, next) => {
  try {
    const outline = editorialService.getSingleBookOutline(req.params.id);
    if (!outline) {
      return res.status(404).json({ error: `No outline for book ${req.params.id}` });
    }

    const chapters = outline.chapters || [];
    const total = chapters.length;

    let synthesized = 0;
    for (const ch of chapters) {
      const rep = synthesisService.getSynthesis(outline.outlineId, ch.chapterId);
      if (rep) synthesized++;
    }
    const remaining = total - synthesized;

    const inMemoryProgress = editorialService.getSynthesisProgress(req.params.id);

    let status = 'idle';
    let currentChapterId = null;
    let startedAt = null;

    if (inMemoryProgress && inMemoryProgress.status === 'generating') {
      status = 'generating';
      currentChapterId = inMemoryProgress.currentChapterId || null;
      startedAt = inMemoryProgress.startedAt || null;
    } else if (total > 0 && total === synthesized) {
      status = 'complete';
    }

    res.json({
      success: true,
      total,
      synthesized,
      remaining,
      status,
      currentChapterId,
      startedAt,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/books/:id/editorial - Delete/reset single-book editorial outline & representations
router.delete('/:id/editorial', async (req, res, next) => {
  try {
    const outline = editorialService.getSingleBookOutline(req.params.id);
    if (!outline) {
      return res.json({ success: true, message: 'No outline existed to delete.' });
    }

    editorialService.deleteOutline(outline.outlineId);
    res.json({ success: true, message: 'Editorial outline and representations deleted.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
