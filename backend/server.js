const express = require('express');
const cors = require('cors'); // To allow frontend to access backend
const path = require('path');
const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files from src
app.use(express.static(path.join(__dirname, '../src')));

// Test GET
app.get('/api/health', (req, res) => {
  res.send('Smart Reader backend is up! 📡✨');
});

// Mock summary generator
app.post('/generate-summary', (req, res) => {
  const { text } = req.body;

  if (!text || text.trim() === '') {
    return res.status(400).json({ error: 'No text provided!' });
  }

  // FAKE summary logic for now
  const summary = `✨ Summary: In this chapter, amazing stuff happens and the plot thickens! Stay tuned~ ✨`;

  res.json({ summary });
});

// Fallback to index.html for GET requests
app.use((req, res, next) => {
  if (req.method === 'GET') {
    res.sendFile(path.join(__dirname, '../src/index.html'));
  } else {
    next();
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
