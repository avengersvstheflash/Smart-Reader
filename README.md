# Smart Reader 📖

Smart Reader is an intelligent personal digital library for novels, manga, textbooks, research papers, documents, and notes.

Rather than an ephemeral AI summarizer, Smart Reader functions as a structured digital archive that preserves original source material while layering intelligent representations (chapter synopses, key thematic breakdowns, reading progress, and canonical block structuring).

---

## 🏛️ Architecture & Principles

### 1. Inviolability of Original Content
AI models never overwrite, mutate, or substitute the user's uploaded text. All AI outputs are saved in a dedicated `representations` schema linked to chapters, preserving the user's authentic content in its original form.

### 2. Canonical Document Pipeline (Build 1.5)
During ingestion, raw texts, Markdown notes, or uploaded manuscripts flow through a modular ingestion pipeline (`backend/services/ingestion/`):
- **Content Normalizer:** Cleans invisible control characters, normalizes Unicode typography (smart quotes, dashes, non-breaking spaces), and standardizes line breaks.
- **Chapter Detector:** Segments text using regex heuristics for roman numerals, titled chapters, Markdown `#` / `##` headings, and volume divisions.
- **Structured Block Parsers:** Parses raw text into `CanonicalDocument` blocks (`heading`, `paragraph`, `quote`, `list`, `separator`, `code`).
- **Storage:** Persisted as JSON in SQLite and rendered natively with typographic hierarchy in the reading canvas.

### 3. Decoupled AI Provider Abstraction
The AI intelligence engine (`backend/services/ai/`) abstracts model providers behind a common interface:
- **Default Local AI (Ollama):** Local, private, zero-cost execution with `llama3`.
- **Gemini Ready:** Provider contracts support cloud-based Gemini reasoning.
- **Offline Guarantee:** The application is 100% functional without AI running. Library organization, chapter navigation, reading settings, search, and progress tracking never require an active AI daemon.

### 4. Zero-Config Local Persistence
Built on `better-sqlite3` with automated schema migrations, foreign keys, and indexes stored in `storage/smart_reader.db`.

---

## 🚀 Quick Start

### Installation & Run

```bash
# Install dependencies
npm install

# Start the application dev server (runs on port 3000)
npm run dev

# Reset and seed sample library (Novels, Textbooks, Markdown research)
npm run db:reset
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🎨 Editorial Design System (Build 1.5)

- **Library Hero & Continue Reading:** Instant visual access to your active reading session with progress bars and chapter tracking.
- **CSS-Generated Editorial Book Covers:** Authentic book spine lighting, 3:4 aspect ratios, archetype-specific layouts (`novel`, `textbook`, `research`, `manga`), and distinctive color palettes.
- **Typography:** Display headings in Cinzel / Lora paired with Plus Jakarta Sans and JetBrains Mono for code blocks.
- **Theme Modes:** Light Paper (`theme-light`), Warm Sepia (`theme-warm`), and Night Slate (`theme-dark`).

---

## 📡 API Reference

### Books
- `GET /api/books`: Retrieve all books with chapter and progress counts.
- `GET /api/books/:id`: Get book details and metadata.
- `POST /api/books`: Create a new book record.
- `POST /api/books/import`: Ingest a book from uploaded text or file via the Ingestion Pipeline.
- `DELETE /api/books/:id`: Delete book and cascade delete chapters and representations.

### Chapters
- `GET /api/books/:id/chapters`: List chapters for a book.
- `GET /api/chapters/:id`: Get chapter content, canonical blocks, and representations.
- `POST /api/books/:id/chapters`: Add a chapter manually.
- `PUT /api/chapters/:id`: Update chapter reading status or title.
- `POST /api/chapters/:id/summarize`: Trigger AI chapter summary.

### Intelligence & System
- `GET /api/ai/status`: Health check for local Ollama and cloud AI providers.
- `GET /api/jobs`: List asynchronous ingestion and summarization jobs.
- `POST /api/dev/reset`: Reset and seed database with curated sample books and representations.

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env` to configure your environment:

```env
PORT=3000
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3
```
