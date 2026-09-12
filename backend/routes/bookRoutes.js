const express = require('express');
const multer = require('multer');
const bookService = require('../services/bookService');
const webAcquisitionService = require('../services/web/webAcquisitionService');

const router = express.Router();
const upload = multer({
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
  storage: multer.memoryStorage(),
});

// GET /api/books - list all books
router.get('/', (req, res, next) => {
  try {
    const books = bookService.getAllBooks();
    res.json({ books });
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
const representationRepository = require('../repositories/representationRepository');

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

module.exports = router;
