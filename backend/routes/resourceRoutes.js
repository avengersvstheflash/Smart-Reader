const express = require('express');
const router = express.Router();
const resourceManager = require('../services/resourceManager');

// GET /api/resources/status
router.get('/status', async (req, res, next) => {
  try {
    const status = await resourceManager.getStatus();
    res.json(status);
  } catch (err) {
    next(err);
  }
});

// POST /api/resources/download
router.post('/download', async (req, res) => {
  try {
    const { modelIds } = req.body || {};
    const result = await resourceManager.startDownloads(modelIds);
    res.status(202).json(result);
  } catch (err) {
    if (err.code === 'INSUFFICIENT_DISK_SPACE') {
      return res.status(400).json({
        success: false,
        code: 'INSUFFICIENT_DISK_SPACE',
        error: err.message,
        requiredBytes: err.requiredBytes,
        availableBytes: err.availableBytes,
      });
    }
    if (err.code === 'OFFLINE') {
      return res.status(503).json({
        success: false,
        code: 'OFFLINE',
        error: err.message,
      });
    }
    return res.status(500).json({
      success: false,
      code: err.code || 'DOWNLOAD_ERROR',
      error: err.message,
    });
  }
});

// GET /api/resources/progress (Server-Sent Events)
router.get('/progress', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write(': sse connected\n\n');

  try {
    const currentStatus = await resourceManager.getStatus();
    res.write(`event: status\ndata: ${JSON.stringify(currentStatus)}\n\n`);
  } catch (_) {}

  resourceManager.addSSEClient(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (_) {
      clearInterval(heartbeat);
    }
  }, 15000);

  const cleanup = () => {
    clearInterval(heartbeat);
    resourceManager.removeSSEClient(res);
  };

  req.on('close', cleanup);
  req.on('error', cleanup);
  res.on('close', cleanup);
  res.on('error', cleanup);
});

// POST /api/resources/cancel
router.post('/cancel', (req, res) => {
  try {
    const { modelId } = req.body || {};
    resourceManager.cancelDownload(modelId);
    res.json({
      success: true,
      message: 'Downloads canceled. Temporary files cleaned up.',
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;

