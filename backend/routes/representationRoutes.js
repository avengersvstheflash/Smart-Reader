const express = require('express');
const router = express.Router();
const representationRepository = require('../repositories/representationRepository');

// GET /api/representations/:id/provenance - RETIRED (migrated to /api/smart-chapters/:id/provenance)
router.get('/:id/provenance', (req, res) => {
  return res.redirect(308, `/api/smart-chapters/${req.params.id}/provenance`);
});

// GET /api/representations/:id - Get representation (for SUMMARY / BOOK_SUMMARY)
router.get('/:id', (req, res, next) => {
  try {
    const rep = representationRepository.getBookRepresentationById(req.params.id) ||
      representationRepository.getChapterRepresentationById(req.params.id);
    if (!rep) {
      return res.status(404).json({ error: `Representation not found: ${req.params.id}` });
    }
    return res.json({ success: true, representation: rep });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
