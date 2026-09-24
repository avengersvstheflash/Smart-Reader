const express = require('express');
const router = express.Router();
const provenanceResolver = require('../services/semantic/provenanceResolver');

// GET /api/representations/:id/provenance - Get verified paragraph-level provenance
router.get('/:id/provenance', (req, res, next) => {
  try {
    const result = provenanceResolver.getProvenance(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/representations/:id/verify-provenance - Re-run provenance verification manually (invalidates existing rows)
router.post('/:id/verify-provenance', async (req, res, next) => {
  try {
    const options = {
      force: true,
      fast: req.body?.fast === true,
    };
    await provenanceResolver.verifyRepresentation(req.params.id, options);
    const result = provenanceResolver.getProvenance(req.params.id);
    res.json(result);
  } catch (err) {
    if (err.message && err.message.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    next(err);
  }
});

module.exports = router;

