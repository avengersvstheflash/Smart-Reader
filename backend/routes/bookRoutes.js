const express = require('express');
const multer = require('multer');
const bookService = require('../services/bookService');

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

module.exports = router;
