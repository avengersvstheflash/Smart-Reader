const express = require('express');
const router = express.Router();
const semanticChunkRepository = require('../repositories/semanticChunkRepository');

// GET /api/chunks/:id - Get a single chunk by ID with camelCase mapping
router.get('/:id', (req, res) => {
  try {
    const chunk = semanticChunkRepository.getById(req.params.id);
    if (!chunk) {
      return res.status(404).json({ error: 'chunk_not_found' });
    }
    return res.json({
      id: chunk.id,
      bookId: chunk.bookId,
      chapterId: chunk.chapterId,
      sequence: chunk.sequence,
      textContent: chunk.textContent,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
