const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const { getDatabase, closeDatabase } = require('./db/database');

const bookRoutes = require('./routes/bookRoutes');
const chapterRoutes = require('./routes/chapterRoutes');
const jobRoutes = require('./routes/jobRoutes');
const aiRoutes = require('./routes/aiRoutes');
const webRoutes = require('./routes/webRoutes');
const semanticRoutes = require('./routes/semanticRoutes');
const synthesisRoutes = require('./routes/synthesisRoutes');
const representationRoutes = require('./routes/representationRoutes');
const chunkRoutes = require('./routes/chunkRoutes');
const smartChapterRoutes = require('./routes/smartChapterRoutes');
const configRoutes = require('./routes/configRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const importQueueRoutes = require('./routes/importQueueRoutes');
const aiService = require('./services/ai/aiService');
const bookService = require('./services/bookService');
const embeddingService = require('./services/semantic/embeddingService');
const jobRepository = require('./repositories/jobRepository');
const importQueueService = require('./services/ingestion/importQueueService');

const app = express();

// Warm up BGE-M3 model in background
const t0 = Date.now();
embeddingService.warmup()
  .then(() => console.log(`[Boot] BGE-M3 ready in ${Date.now() - t0}ms`))
  .catch((err) => console.error('[Boot] BGE-M3 warmup failed:', err.message));

// Initialize DB schema
getDatabase();

// Middleware
app.use(cors());

// Security: disable request body logging for sensitive settings routes
app.use('/api/settings', (req, res, next) => {
  req._skipBodyLogging = true;
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));


// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    name: 'Smart Reader API',
    version: '1.0.0',
    aiProvider: config.AI_PROVIDER,
  });
});

// Modular API Routes
app.use('/api/books', bookRoutes);
app.use('/api/chapters', chapterRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/import/queue', importQueueRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/web', webRoutes);
app.use('/api/semantic', semanticRoutes);
app.use('/api/synthesis', synthesisRoutes);
app.use('/api/representations', representationRoutes);
app.use('/api/chunks', chunkRoutes);
app.use('/api/smart-chapters', smartChapterRoutes);
app.use('/api/config', configRoutes);
app.use('/api/settings', settingsRoutes);

// Development Reset & Sample Seed Endpoint
app.post('/api/dev/reset', (req, res, next) => {
  try {
    const result = bookService.resetDevelopmentData();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Legacy backward-compatible endpoint refactored through AI service abstraction
app.post('/generate-summary', async (req, res) => {
  const { text, title } = req.body;
  if (!text || text.trim() === '') {
    return res.status(400).json({ error: 'No text provided!' });
  }

  try {
    const result = await aiService.summarizeText(text, title);
    res.json({ summary: result.summary, provider: result.provider, model: result.model });
  } catch (err) {
    res.status(502).json({
      error: err.message,
      provider: 'ollama',
      summary: null,
    });
  }
});

// Catch unhandled /api requests and guarantee JSON response (never HTML)
app.use('/api', (req, res) => {
  res.status(404).json({
    error: `API route not found: ${req.method} ${req.originalUrl || req.url}`,
  });
});


// Centralized error handling (MUST be the last middleware in the chain)
app.use((err, req, res, next) => {
  if (req.originalUrl && req.originalUrl.startsWith('/api/settings')) {
    const { scrubSecret } = require('./services/settings/settingsService');
    const safeMsg = scrubSecret(err.message || 'Internal Server Error', req.body?.openrouter?.apiKey || req.body?.apiKey);
    console.error(`[API Error] ${req.method} ${req.originalUrl}:`, safeMsg);
    const status = err.status || (err.name === 'MulterError' ? 400 : 500);
    return res.status(status).json({
      error: safeMsg,
      code: err.code || undefined,
    });
  } else {
    console.error('[API Error]:', err);
  }
  const status = err.status || (err.name === 'MulterError' ? 400 : 500);
  res.status(status).json({
    error: err.message || 'Internal Server Error',
    code: err.code || undefined,
  });
});

// Boot-time zombie job reconciliation (synchronous sweep before listening)
try {
  const staleCount = jobRepository.markStaleJobsInterrupted();
  console.log(`[Boot] Marked ${staleCount} stale jobs as INTERRUPTED.`);
  importQueueService.recoverOnBoot();
} catch (err) {
  console.error('[Boot] Stale job reconciliation failed:', err.message);
}

// Clean shutdown handler (courtesy for SIGINT / SIGTERM; kill -9 / OOM bypasses it,
// so the boot-time sweep above serves as the primary resilience safety net).
function gracefulShutdown(reason) {
  console.log(`[Shutdown] Received ${reason}. Performing clean shutdown...`);
  try {
    const count = jobRepository.markStaleJobsInterrupted();
    if (count > 0) {
      console.log(`[Shutdown] Marked ${count} in-flight jobs as INTERRUPTED.`);
    }
  } catch (err) {
    console.error('[Shutdown] Failed to mark jobs interrupted:', err.message);
  }
  try {
    closeDatabase();
  } catch (err) {
    console.error('[Shutdown] Failed to close database:', err.message);
  }
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

app.listen(config.PORT, '0.0.0.0', () => {
  console.log(`Smart Reader backend running on http://0.0.0.0:${config.PORT}`);
});

module.exports = app;

