const express = require('express');
const config = require('../config');

const router = express.Router();

// GET /api/config/client
// Public client configuration (no secrets)
router.get('/client', (req, res) => {
  res.json({
    maxImportSizeMB: config.IMPORT_MAX_SIZE_MB,
  });
});

module.exports = router;

