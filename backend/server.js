const express = require('express');
const cors = require('cors'); // To allow frontend to access backend
const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Test GET
app.get('/', (req, res) => {
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
