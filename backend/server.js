const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const { getDatabase } = require('./db/database');

const bookRoutes = require('./routes/bookRoutes');
const chapterRoutes = require('./routes/chapterRoutes');
const jobRoutes = require('./routes/jobRoutes');
const aiRoutes = require('./routes/aiRoutes');
const webRoutes = require('./routes/webRoutes');
const semanticRoutes = require('./routes/semanticRoutes');
const aiService = require('./services/ai/aiService');
const bookService = require('./services/bookService');

const app = express();

// Initialize DB schema
getDatabase();

// Middleware
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Static frontend assets
app.use(express.static(path.join(__dirname, '../src')));

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
app.use('/api/ai', aiRoutes);
app.use('/api/web', webRoutes);
app.use('/api/semantic', semanticRoutes);

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

// Centralized error handling
app.use((err, req, res, next) => {
  console.error('[API Error]:', err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Internal Server Error',
  });
});

// Fallback to index.html for client-side navigation
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, '../src/index.html'));
  } else {
    next();
  }
});

app.listen(config.PORT, '0.0.0.0', () => {
  console.log(`Smart Reader backend running on http://0.0.0.0:${config.PORT}`);
});

module.exports = app;
