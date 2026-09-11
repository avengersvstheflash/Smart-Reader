/**
 * SMART READER — FRONTEND APPLICATION ENGINE
 * Build 1: Modular Foundation, Personal Digital Library & AI Reading Companion
 */

// Application State
const state = {
  books: [],
  activeBook: null,
  chapters: [],
  activeChapter: null,
  activeRepresentation: null,
  activeRepresentationMode: 'original', // 'original' | 'summary'
  isGeneratingSummary: false,
  summaryGenerationError: null,
  pendingDeleteBookId: null,
  currentView: 'library', // 'library' | 'book-details' | 'reader'
  filterType: 'all',
  searchQuery: '',
  readerFontSize: 18,
  readerFontFamily: 'serif',
  readerViewMode: 'canonical', // 'canonical' | 'source'
  processingMode: 'cloud', // 'cloud' | 'local'
  selectedAIProvider: 'gemini', // 'gemini' | 'ollama'
  importedBookResult: null,
  jobs: [],
  aiStatus: { available: false, provider: 'gemini', model: 'gemini-3.8-flash', message: 'Checking...' },
  addBookTab: 'file',
  selectedFile: null,
};

// ==========================================================================
// API CLIENT LAYER
// ==========================================================================
const api = {
  async getBooks() {
    const res = await fetch('/api/books');
    if (!res.ok) throw new Error('Failed to fetch books');
    const data = await res.json();
    return data.books || [];
  },

  async getBook(id) {
    const res = await fetch(`/api/books/${id}`);
    if (!res.ok) throw new Error('Failed to fetch book details');
    const data = await res.json();
    return data.book;
  },

  async createBook(bookData) {
    const res = await fetch('/api/books', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bookData),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create book');
    }
    const data = await res.json();
    return data.book;
  },

  async importBook(formData) {
    const res = await fetch('/api/books/import', {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to import book');
    }
    return await res.json();
  },

  async deleteBook(id) {
    const res = await fetch(`/api/books/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete book');
    return await res.json();
  },

  async getChapters(bookId) {
    const res = await fetch(`/api/books/${bookId}/chapters`);
    if (!res.ok) throw new Error('Failed to fetch chapters');
    const data = await res.json();
    return data.chapters || [];
  },

  async getChapter(id) {
    const res = await fetch(`/api/chapters/${id}`);
    if (!res.ok) throw new Error('Failed to fetch chapter');
    return await res.json();
  },

  async addChapter(bookId, chapterData) {
    const res = await fetch(`/api/books/${bookId}/chapters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chapterData),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to add chapter');
    }
    const data = await res.json();
    return data.chapter;
  },

  async updateChapter(id, updates) {
    const res = await fetch(`/api/chapters/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update chapter');
    const data = await res.json();
    return data.chapter;
  },

  async summarizeChapter(id, options = {}) {
    const mode = typeof options === 'string' ? (options === 'ollama' ? 'local' : 'cloud') : (options.mode || state.processingMode || 'cloud');
    const provider = typeof options === 'string' ? options : (options.provider || (mode === 'local' ? 'ollama' : 'gemini'));
    const res = await fetch(`/api/chapters/${id}/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, provider }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const errorObj = new Error(err.error || 'Failed to generate chapter summary');
      errorObj.details = err.details || '';
      errorObj.provider = err.provider || provider;
      errorObj.mode = err.mode || mode;
      throw errorObj;
    }
    return await res.json();
  },

  async setAIProvider(provider) {
    const res = await fetch('/api/ai/provider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to set active AI provider');
    }
    return await res.json();
  },

  async getJobs() {
    const res = await fetch('/api/jobs');
    if (!res.ok) throw new Error('Failed to fetch jobs');
    const data = await res.json();
    return data.jobs || [];
  },

  async getAIStatus() {
    const res = await fetch('/api/ai/status');
    if (!res.ok) throw new Error('Failed to check AI status');
    return await res.json();
  },

  async resetDevData() {
    const res = await fetch('/api/dev/reset', { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to reset database');
    }
    return await res.json();
  },
};

// ==========================================================================
// INITIALIZATION
// ==========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  setupScrollProgress();
  setupDragAndDrop();
  loadPreferences();

  await checkAIStatus(false);
  await loadBooks();
  await fetchJobs();
  await refreshContinueReading();
});

// ==========================================================================
// NAVIGATION & VIEW CONTROLLER
// ==========================================================================
function navigateTo(viewName) {
  state.currentView = viewName;

  document.querySelectorAll('.view-section').forEach((sec) => {
    sec.style.display = 'none';
    sec.classList.remove('active');
  });

  document.querySelectorAll('.nav-btn').forEach((btn) => btn.classList.remove('active'));

  const navReaderBtn = document.getElementById('nav-reader-btn');
  if (state.activeBook && state.activeChapter) {
    navReaderBtn.style.display = 'inline-flex';
  } else {
    navReaderBtn.style.display = 'none';
  }

  if (viewName === 'library') {
    document.getElementById('view-library').style.display = 'block';
    document.getElementById('view-library').classList.add('active');
    document.getElementById('nav-library-btn').classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (viewName === 'book-details') {
    document.getElementById('view-book-details').style.display = 'block';
    document.getElementById('view-book-details').classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (viewName === 'reader') {
    document.getElementById('view-reader').style.display = 'block';
    document.getElementById('view-reader').classList.add('active');
    navReaderBtn.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// ==========================================================================
// LIBRARY CONTROLLER
// ==========================================================================
async function loadBooks() {
  try {
    state.books = await api.getBooks();
    renderLibrary();
    await refreshContinueReading();
  } catch (err) {
    showToast(`Error loading library: ${err.message}`, 'error');
  }
}

// Editorial Book Cover Generator
function getCoverPalette(book, index) {
  const palettes = ['terracotta', 'indigo', 'moss', 'amber', 'plum', 'slate', 'teal'];
  let hash = 0;
  const str = (book.title || '') + (book.id || '') + index;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const paletteIndex = Math.abs(hash) % palettes.length;
  return palettes[paletteIndex];
}

function getContentTypeIcon(type) {
  const icons = {
    novel: '📖',
    manga: '🎨',
    comic: '💥',
    textbook: '📐',
    document: '📄',
    research: '🔬',
    notes: '📝',
  };
  return icons[type] || '📖';
}

function renderEditorialCover(book, index = 0, isHero = false) {
  const palette = getCoverPalette(book, index);
  const type = book.content_type || 'novel';
  const archetypeClass = `archetype-${type}`;
  const icon = getContentTypeIcon(type);
  const title = escapeHtml(book.title || 'Untitled');
  const author = escapeHtml(book.author || 'Personal Library');
  const customStyle = isHero ? 'height: 220px; width: 160px; margin-bottom: 0;' : '';

  return `
    <div class="editorial-cover cover-palette-${palette} ${archetypeClass}" style="${customStyle}">
      <div class="editorial-cover-top">
        <span class="editorial-cover-icon">${icon}</span>
        <span class="editorial-cover-badge">${escapeHtml(type)}</span>
      </div>
      <div class="editorial-cover-center">
        <h4 class="editorial-cover-title">${title}</h4>
      </div>
      <div class="editorial-cover-bottom">
        <span class="editorial-cover-author">${author}</span>
        <span class="editorial-cover-motif">✦</span>
      </div>
    </div>
  `;
}

function renderLibrary() {
  const booksGrid = document.getElementById('books-grid');
  const emptyState = document.getElementById('library-empty-state');
  const searchEmptyState = document.getElementById('library-search-empty-state');
  const totalCountEl = document.getElementById('books-total-count');
  const clearSearchBtn = document.getElementById('btn-clear-search');

  if (clearSearchBtn) {
    clearSearchBtn.style.display = state.searchQuery ? 'inline-block' : 'none';
  }

  let filtered = state.books || [];

  // Filter by content type
  if (state.filterType !== 'all') {
    filtered = filtered.filter((b) => b.content_type === state.filterType);
  }

  // Filter by search query
  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase();
    filtered = filtered.filter(
      (b) =>
        (b.title && b.title.toLowerCase().includes(q)) ||
        (b.author && b.author.toLowerCase().includes(q)) ||
        (b.description && b.description.toLowerCase().includes(q))
    );
  }

  totalCountEl.textContent = `${filtered.length} ${filtered.length === 1 ? 'item' : 'items'}`;

  // If library has no books at all
  if (state.books.length === 0) {
    booksGrid.innerHTML = '';
    emptyState.style.display = 'block';
    if (searchEmptyState) searchEmptyState.style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';

  // If search or filter returned 0 results
  if (filtered.length === 0) {
    booksGrid.innerHTML = '';
    if (searchEmptyState) searchEmptyState.style.display = 'block';
    return;
  }

  if (searchEmptyState) searchEmptyState.style.display = 'none';

  booksGrid.innerHTML = filtered
    .map((book, index) => {
      const readChapters = book.read_chapter_count || 0;
      const totalChapters = book.chapter_count || 0;
      const progressPct = totalChapters > 0 ? Math.round((readChapters / totalChapters) * 100) : 0;
      const coverHtml = renderEditorialCover(book, index);

      return `
        <div class="book-card" id="book-card-${book.id}" onclick="openBookDetails('${book.id}')">
          ${coverHtml}
          <h3 class="book-card-title">${escapeHtml(book.title)}</h3>
          <p class="book-card-author">By ${escapeHtml(book.author || 'Unknown Author')}</p>
          <p class="book-card-desc">${escapeHtml(book.description || 'No synopsis provided.')}</p>
          <div class="book-card-footer">
            <span class="book-chapter-stat">${totalChapters} chapter${totalChapters === 1 ? '' : 's'}</span>
            <span class="book-chapter-stat">${progressPct}% read</span>
          </div>
        </div>
      `;
    })
    .join('');
}

function handleSearch(val) {
  state.searchQuery = val;
  renderLibrary();
}

function clearSearch() {
  state.searchQuery = '';
  const input = document.getElementById('library-search-input');
  if (input) input.value = '';
  renderLibrary();
}

function clearSearchAndFilters() {
  state.searchQuery = '';
  state.filterType = 'all';
  const input = document.getElementById('library-search-input');
  if (input) input.value = '';
  document.querySelectorAll('.filter-chip').forEach((chip) => {
    if (chip.getAttribute('data-type') === 'all') {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });
  renderLibrary();
}

function filterByContentType(type) {
  state.filterType = type;
  document.querySelectorAll('.filter-chip').forEach((chip) => {
    if (chip.getAttribute('data-type') === type) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });
  renderLibrary();
}

async function refreshContinueReading() {
  const container = document.getElementById('continue-reading-container');
  const card = document.getElementById('continue-reading-card');
  if (!container || !card) return;

  if (!state.books || state.books.length === 0) {
    container.style.display = 'none';
    return;
  }

  const lastBookId = localStorage.getItem('sr_last_book');
  const lastChapterId = localStorage.getItem('sr_last_chapter');

  let book = null;
  if (lastBookId) {
    book = state.books.find((b) => b.id === lastBookId);
  }

  if (!book) {
    book = state.books.find((b) => (b.read_chapter_count || 0) > 0) || state.books[0];
  }

  if (!book) {
    container.style.display = 'none';
    return;
  }

  try {
    const chapters = await api.getChapters(book.id);
    if (!chapters || chapters.length === 0) {
      container.style.display = 'none';
      return;
    }

    let activeChapter = null;
    if (lastChapterId) {
      activeChapter = chapters.find((c) => c.id === lastChapterId);
    }
    if (!activeChapter) {
      activeChapter = chapters.find((c) => c.status === 'reading') || chapters.find((c) => c.status !== 'read') || chapters[0];
    }

    const readCount = chapters.filter((c) => c.status === 'read').length;
    const progressPct = Math.round((readCount / chapters.length) * 100);

    container.style.display = 'block';
    card.innerHTML = `
      <div class="continue-left">
        <div class="continue-cover-mini cover-palette-${getCoverPalette(book, 0)}">
          ${getContentTypeIcon(book.content_type)}
        </div>
        <div>
          <div class="continue-title">${escapeHtml(book.title)}</div>
          <div class="continue-sub">Chapter ${activeChapter.number}: ${escapeHtml(activeChapter.title)}</div>
          <div class="continue-progress-bar">
            <div class="continue-progress-fill" style="width: ${progressPct}%;"></div>
          </div>
        </div>
      </div>
      <div class="continue-right" style="display: flex; align-items: center; gap: 14px;">
        <span class="item-count" style="font-weight: 600;">${progressPct}% complete</span>
        <button class="btn btn-primary btn-sm" onclick="openChapter('${activeChapter.id}', '${book.id}')">
          Resume Reading →
        </button>
      </div>
    `;
  } catch (err) {
    console.error('Failed to load continue reading state:', err);
    container.style.display = 'none';
  }
}

function renderContinueReading(bookId, chapterId) {
  refreshContinueReading();
}

// ==========================================================================
// BOOK DETAILS CONTROLLER
// ==========================================================================
async function openBookDetails(bookId) {
  try {
    const book = await api.getBook(bookId);
    state.activeBook = book;
    state.chapters = await api.getChapters(bookId);

    renderBookDetailsHero();
    renderChaptersList();
    navigateTo('book-details');
  } catch (err) {
    showToast(`Error opening book: ${err.message}`, 'error');
  }
}

function renderBookDetailsHero() {
  const hero = document.getElementById('book-details-hero');
  const book = state.activeBook;
  if (!book) return;

  const hasChapters = state.chapters && state.chapters.length > 0;
  const firstChapterId = hasChapters ? state.chapters[0].id : null;
  const coverHtml = renderEditorialCover(book, 0, true);

  hero.innerHTML = `
    ${coverHtml}
    <div class="hero-info">
      <div class="hero-badges">
        <span class="badge-tag">${escapeHtml(book.content_type || 'novel')}</span>
        <span class="badge-tag">${state.chapters.length} chapters</span>
      </div>
      <h1 class="hero-title">${escapeHtml(book.title)}</h1>
      <p class="hero-author">By ${escapeHtml(book.author || 'Unknown Author')}</p>
      <p class="hero-desc">${escapeHtml(book.description || 'No description provided.')}</p>
      <div class="hero-actions">
        ${
          hasChapters
            ? `<button id="btn-hero-read" class="btn btn-primary" onclick="openChapter('${firstChapterId}', '${book.id}')">Start Reading Chapter 1 →</button>`
            : `<button class="btn btn-primary" onclick="openAddChapterModal()">+ Add First Chapter</button>`
        }
        <button id="btn-hero-delete" class="btn btn-secondary" onclick="openDeleteBookModal('${book.id}')">
          <svg class="ui-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18"/>
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
          </svg>
          <span>Delete Book</span>
        </button>
      </div>
    </div>
  `;
}

function renderChaptersList() {
  const listEl = document.getElementById('chapters-list');
  if (!state.chapters || state.chapters.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state" style="margin: 16px 0; padding: 32px;">
        <p>No chapters found for this book yet.</p>
        <button class="btn btn-secondary btn-sm" onclick="openAddChapterModal()" style="margin-top: 10px;">
          + Add Chapter
        </button>
      </div>
    `;
    return;
  }

  listEl.innerHTML = state.chapters
    .map((ch) => {
      const isRead = ch.status === 'read';
      const hasSummary = ch.has_summary > 0;
      return `
        <div class="chapter-row" id="chapter-row-${ch.id}" onclick="openChapter('${ch.id}', '${ch.book_id}')">
          <div class="chapter-row-left">
            <span class="chapter-num-badge">${ch.number}</span>
            <div>
              <div class="chapter-row-title">${escapeHtml(ch.title)}</div>
              <div class="chapter-row-meta">${ch.word_count || 0} words • Status: ${ch.status || 'unread'}</div>
            </div>
          </div>
          <div class="chapter-row-right">
            ${hasSummary ? `<span class="badge-summary-ready">✦ Summary Ready</span>` : ''}
            <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); openChapter('${ch.id}', '${ch.book_id}')">
              Read →
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

// Delete Book Modal Handlers
function openDeleteBookModal(bookId) {
  state.pendingDeleteBookId = bookId;
  const book = (state.books && state.books.find((b) => b.id === bookId)) || state.activeBook;
  const titleDisplay = document.getElementById('delete-book-title-display');
  const errorBanner = document.getElementById('delete-book-error');
  const confirmBtn = document.getElementById('btn-confirm-delete-book');

  if (titleDisplay) {
    titleDisplay.textContent = book ? `"${book.title}"` : 'this book';
  }
  if (errorBanner) {
    errorBanner.style.display = 'none';
    errorBanner.textContent = '';
  }
  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Delete Book';
  }

  const modal = document.getElementById('deleteBookModal');
  if (modal) modal.classList.remove('hidden');
}

function closeDeleteBookModal() {
  state.pendingDeleteBookId = null;
  const modal = document.getElementById('deleteBookModal');
  if (modal) modal.classList.add('hidden');
}

async function executeDeleteBook() {
  const bookId = state.pendingDeleteBookId;
  if (!bookId) return;

  const confirmBtn = document.getElementById('btn-confirm-delete-book');
  const errorBanner = document.getElementById('delete-book-error');

  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Deleting...';
  }

  try {
    await api.deleteBook(bookId);

    // If activeBook was the one deleted, reset active state
    if (state.activeBook && state.activeBook.id === bookId) {
      state.activeBook = null;
      state.activeChapter = null;
      state.activeRepresentation = null;
      localStorage.removeItem('sr_last_book');
      localStorage.removeItem('sr_last_chapter');
    }

    closeDeleteBookModal();
    showToast('Book and all associated representations deleted');
    await loadBooks();
    navigateTo('library');
  } catch (err) {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Delete Book';
    }
    if (errorBanner) {
      errorBanner.style.display = 'block';
      errorBanner.textContent = `Couldn't delete this book: ${err.message}. Nothing was removed from the library.`;
    }
  }
}

// Backwards compatibility alias
function confirmDeleteBook(bookId) {
  openDeleteBookModal(bookId);
}

// ==========================================================================
// READER CONTROLLER
// ==========================================================================
async function openChapter(chapterId, bookId) {
  try {
    if (!state.activeBook || state.activeBook.id !== bookId) {
      state.activeBook = await api.getBook(bookId);
      state.chapters = await api.getChapters(bookId);
    }

    const { chapter, representations } = await api.getChapter(chapterId);
    state.activeChapter = chapter;

    // Separate Generated Representation from original content
    const existingSummary = representations && representations.find((r) => r.type === 'SUMMARY');
    state.activeRepresentation = existingSummary || null;

    // Default to original content view on chapter entry
    state.activeRepresentationMode = 'original';
    state.isGeneratingSummary = false;
    state.summaryGenerationError = null;

    // Save session to localStorage
    localStorage.setItem('sr_last_book', bookId);
    localStorage.setItem('sr_last_chapter', chapterId);

    renderReaderView();
    navigateTo('reader');
  } catch (err) {
    showToast(`Error opening chapter: ${err.message}`, 'error');
  }
}

function setReadingRepresentation(mode) {
  state.activeRepresentationMode = mode;
  const btnOrig = document.getElementById('btn-rep-original');
  const btnSumm = document.getElementById('btn-rep-summary');

  if (btnOrig && btnSumm) {
    if (mode === 'summary') {
      btnSumm.classList.add('active');
      btnOrig.classList.remove('active');
    } else {
      btnOrig.classList.add('active');
      btnSumm.classList.remove('active');
    }
  }

  renderActiveRepresentationCanvas();
}

function renderReaderView() {
  const ch = state.activeChapter;
  const book = state.activeBook;
  if (!ch || !book) return;

  // Breadcrumbs & Top Bar
  const bookTitleEl = document.getElementById('reader-book-title');
  const crumbChapterEl = document.getElementById('reader-crumb-chapter');
  if (bookTitleEl) bookTitleEl.textContent = book.title;
  if (crumbChapterEl) crumbChapterEl.textContent = ch.title;

  // Chapter Select Dropdown
  const selectEl = document.getElementById('reader-chapter-select');
  if (selectEl) {
    selectEl.innerHTML = state.chapters
      .map(
        (c) => `<option value="${c.id}" ${c.id === ch.id ? 'selected' : ''}>Ch. ${c.number}: ${escapeHtml(c.title)}</option>`
      )
      .join('');
  }

  // Chapter Header & Meta
  const numEl = document.getElementById('reader-chapter-number');
  const headEl = document.getElementById('reader-chapter-heading');
  const wordEl = document.getElementById('reader-word-count');
  const timeEl = document.getElementById('reader-est-time');
  const statusBadge = document.getElementById('reader-status-badge');

  if (numEl) numEl.textContent = `Chapter ${ch.number}`;
  if (headEl) headEl.textContent = ch.title;
  if (wordEl) wordEl.textContent = `${ch.word_count || 0} words`;
  const estMins = Math.max(1, Math.round((ch.word_count || 250) / 220));
  if (timeEl) timeEl.textContent = `~${estMins} min read`;
  if (statusBadge) statusBadge.textContent = ch.status || 'unread';

  // Update Summary indicator dot in top representation switcher
  const repSummaryDot = document.getElementById('rep-summary-dot');
  if (repSummaryDot) {
    repSummaryDot.style.display = (state.activeRepresentation && state.activeRepresentation.content) ? 'inline-block' : 'none';
  }

  // Sync Switcher button active states
  const btnOrig = document.getElementById('btn-rep-original');
  const btnSumm = document.getElementById('btn-rep-summary');
  if (btnOrig && btnSumm) {
    if (state.activeRepresentationMode === 'summary') {
      btnSumm.classList.add('active');
      btnOrig.classList.remove('active');
    } else {
      btnOrig.classList.add('active');
      btnSumm.classList.remove('active');
    }
  }

  // Update View Mode Pills in UI (Source vs Canonical for original view)
  const btnCanonical = document.getElementById('btn-view-canonical');
  const btnSource = document.getElementById('btn-view-source');
  const indicator = document.getElementById('reader-format-indicator');
  if (btnCanonical && btnSource) {
    if (state.readerViewMode === 'source') {
      btnSource.classList.add('active');
      btnCanonical.classList.remove('active');
      if (indicator) indicator.textContent = 'Source Text';
    } else {
      btnCanonical.classList.add('active');
      btnSource.classList.remove('active');
      if (indicator) indicator.textContent = 'Canonical';
    }
  }

  // Apply typography preferences
  applyTypography();

  // Render the unified canvas
  renderActiveRepresentationCanvas();

  // Reset scroll position & progress bar
  window.scrollTo({ top: 0, behavior: 'instant' });
  updateScrollProgress();
}

function renderActiveRepresentationCanvas() {
  const bodyEl = document.getElementById('reader-content-body');
  const ch = state.activeChapter;
  if (!bodyEl || !ch) return;

  const originalMeta = document.getElementById('reader-original-meta');
  const summaryMeta = document.getElementById('reader-summary-meta');
  const viewModeBar = document.getElementById('reader-view-mode-bar');
  const headerActions = document.getElementById('reader-header-actions');
  const btnHeaderSummary = document.getElementById('btn-header-create-summary');

  if (state.activeRepresentationMode === 'original') {
    // Show original chapter source meta & controls
    if (originalMeta) originalMeta.style.display = 'flex';
    if (summaryMeta) summaryMeta.style.display = 'none';
    if (viewModeBar) viewModeBar.style.display = 'flex';
    if (headerActions) headerActions.style.display = 'flex';

    if (btnHeaderSummary) {
      if (state.activeRepresentation && state.activeRepresentation.content) {
        btnHeaderSummary.innerHTML = `
          <svg class="ui-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          <span>✦ View Summary</span>
        `;
      } else {
        btnHeaderSummary.innerHTML = `
          <svg class="ui-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          <span>✦ Create Summary</span>
        `;
      }
    }

    if (state.readerViewMode === 'source') {
      bodyEl.innerHTML = `<pre class="raw-source-view">${escapeHtml(ch.content || '')}</pre>`;
    } else {
      bodyEl.innerHTML = renderCanonicalBlocks(ch);
    }
  } else {
    // SUMMARY REPRESENTATION VIEW (Occupies the main reading canvas)
    if (originalMeta) originalMeta.style.display = 'none';
    if (viewModeBar) viewModeBar.style.display = 'none';
    if (headerActions) headerActions.style.display = 'none';

    if (state.isGeneratingSummary) {
      if (summaryMeta) summaryMeta.style.display = 'none';
      const isLocal = state.processingMode === 'local';
      bodyEl.innerHTML = `
        <div class="summary-canvas-processing">
          <div class="summary-proc-icon-wrap">
            <svg class="ui-icon spin" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
            </svg>
          </div>
          <h3 class="summary-state-title">Generating Reading Summary...</h3>
          <p class="summary-state-desc">
            ${isLocal ? 'Distilling chapter narrative via local Ollama daemon...' : 'Synthesizing chapter intelligence with Cloud AI...'}
          </p>
          <div class="proc-stepper">
            <div class="proc-step done">
              <span class="proc-step-dot">✓</span>
              <span>1. Read source chapter text</span>
            </div>
            <div class="proc-step active">
              <span class="proc-step-dot">●</span>
              <span>2. Extract key themes & narrative developments</span>
            </div>
            <div class="proc-step">
              <span class="proc-step-dot">○</span>
              <span>3. Store persistent representation</span>
            </div>
          </div>
        </div>
      `;
    } else if (state.summaryGenerationError) {
      if (summaryMeta) summaryMeta.style.display = 'none';
      bodyEl.innerHTML = `
        <div class="summary-canvas-error">
          <div class="summary-error-icon-wrap">
            <svg class="ui-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h3 class="summary-state-title">Summary Generation Failed</h3>
          <p class="summary-state-desc">${escapeHtml(state.summaryGenerationError)}</p>
          <div class="summary-state-actions">
            <button class="btn btn-primary btn-sm" onclick="triggerChapterSummary()">
              <svg class="ui-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
              </svg>
              <span>Retry Generation</span>
            </button>
            <button class="btn btn-secondary btn-sm" onclick="openSettings()">
              <svg class="ui-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              <span>Change Mode in Settings</span>
            </button>
          </div>
        </div>
      `;
    } else if (state.activeRepresentation && state.activeRepresentation.content) {
      if (summaryMeta) {
        summaryMeta.style.display = 'flex';
        const meta = state.activeRepresentation.metadata || {};
        const metaMode = meta.mode || (meta.provider === 'ollama' ? 'local' : 'cloud');
        const modeLabel = metaMode === 'local' ? 'Local AI' : 'Cloud AI';
        const dateStr = state.activeRepresentation.created_at
          ? new Date(state.activeRepresentation.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })
          : 'Saved';
        const wordCount = meta.summaryWordCount || state.activeRepresentation.content.split(/\s+/).filter(Boolean).length;
        const statsEl = document.getElementById('summary-meta-stats');
        if (statsEl) {
          statsEl.textContent = `${modeLabel} • ${wordCount} words • ${dateStr}`;
        }
      }

      // Render the AI summary representation into the main reading canvas
      bodyEl.innerHTML = renderCanonicalBlocks(state.activeRepresentation);
    } else {
      // Empty state on the canvas
      if (summaryMeta) summaryMeta.style.display = 'none';
      bodyEl.innerHTML = `
        <div class="summary-canvas-empty">
          <div class="summary-empty-icon-wrap">
            <svg class="ui-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </div>
          <h3 class="summary-state-title">No Summary Generated Yet</h3>
          <p class="summary-state-desc">
            Chapter summaries are generated on-demand and stored as persistent representations alongside your book.
          </p>
          <div class="summary-state-actions">
            <button class="btn btn-primary btn-sm" onclick="triggerChapterSummary()">
              <svg class="ui-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
              <span>Generate Chapter Summary</span>
            </button>
          </div>
        </div>
      `;
    }
  }
}

function handleCreateSummaryClick() {
  if (state.activeRepresentation && state.activeRepresentation.content) {
    setReadingRepresentation('summary');
  } else {
    triggerChapterSummary();
  }
}

function handleRegenerateSummary() {
  triggerChapterSummary();
}

function setReaderViewMode(mode) {
  state.readerViewMode = mode;
  const btnCanonical = document.getElementById('btn-view-canonical');
  const btnSource = document.getElementById('btn-view-source');
  const indicator = document.getElementById('reader-format-indicator');

  if (btnCanonical && btnSource) {
    if (mode === 'canonical') {
      btnCanonical.classList.add('active');
      btnSource.classList.remove('active');
      if (indicator) indicator.textContent = 'Canonical';
    } else {
      btnSource.classList.add('active');
      btnCanonical.classList.remove('active');
      if (indicator) indicator.textContent = 'Source Text';
    }
  }

  const bodyEl = document.getElementById('reader-content-body');
  if (bodyEl && state.activeChapter && state.activeRepresentationMode === 'original') {
    if (mode === 'source') {
      bodyEl.innerHTML = `<pre class="raw-source-view">${escapeHtml(state.activeChapter.content || '')}</pre>`;
    } else {
      bodyEl.innerHTML = renderCanonicalBlocks(state.activeChapter);
    }
  }
}

function getCalloutIcon(variant) {
  switch (variant) {
    case 'abstract': return '📑';
    case 'warning': return '⚠️';
    case 'tip': return '💡';
    case 'note': default: return '📌';
  }
}

function capitalizeStr(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Inline Markdown Parser: ensures raw markdown (bold, italic, code) is not leaked into reader
function formatInlineMarkdownHtml(str) {
  if (!str) return '';
  let s = escapeHtml(str);
  s = s.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  s = s.replace(/(?:^|\s)_([^_]+)_(?:$|\s)/g, ' <em>$1</em> ');
  s = s.replace(/`([^`]+)`/g, '<code class="canonical-inline-code">$1</code>');
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  return s.trim();
}

// Parse markdown string into canonical blocks
function parseMarkdownToCanonicalBlocks(rawText) {
  if (!rawText || typeof rawText !== 'string' || rawText.trim() === '') {
    return [{ type: 'paragraph', text: 'No content available.' }];
  }

  const lines = rawText.split(/\r?\n/);
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Code blocks
    if (trimmed.startsWith('```')) {
      const lang = trimmed.replace(/^```\s*/, '').trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length && lines[i].trim().startsWith('```')) i++;
      blocks.push({ type: 'code', language: lang || 'text', text: codeLines.join('\n') });
      continue;
    }

    // Horizontal Rule / Separator
    if (/^(?:[-*_]\s*){3,}$/.test(trimmed)) {
      blocks.push({ type: 'separator' });
      i++;
      continue;
    }

    // Headings (ATX: # Title)
    const atxMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (atxMatch) {
      const level = Math.min(4, Math.max(1, atxMatch[1].length));
      let headingText = atxMatch[2].trim().replace(/^#+\s*/, '');
      headingText = headingText.replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1').trim();
      blocks.push({ type: 'heading', level, text: headingText });
      i++;
      continue;
    }

    // Bold title line as heading: **Section Title:**
    const boldHeaderMatch = trimmed.match(/^\*{2,3}(.+?)\*{2,3}:?\s*$/);
    if (boldHeaderMatch && boldHeaderMatch[1].length > 1 && boldHeaderMatch[1].length < 100) {
      blocks.push({ type: 'heading', level: 3, text: boldHeaderMatch[1].replace(/:$/, '').trim() });
      i++;
      continue;
    }

    // Blockquote or Callout
    if (trimmed.startsWith('>')) {
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      const fullQuote = quoteLines.join(' ').trim();
      const calloutMatch = fullQuote.match(
        /^(?:\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\]|\*\*(Abstract|Note|Tip|Warning|Summary|Key Insight|Takeaway|Key Takeaway):?\*\*)\s*(.+)$/is
      );
      if (calloutMatch) {
        const rawTone = (calloutMatch[1] || calloutMatch[2] || 'Note').toLowerCase();
        let variant = 'note';
        if (rawTone.includes('warn') || rawTone.includes('caution')) variant = 'warning';
        else if (rawTone.includes('tip')) variant = 'tip';
        else if (rawTone.includes('abstract') || rawTone.includes('summary')) variant = 'abstract';
        blocks.push({
          type: 'callout',
          variant,
          title: (calloutMatch[1] || calloutMatch[2] || 'Key Insight').replace(/:$/, ''),
          text: calloutMatch[3].trim(),
        });
      } else {
        blocks.push({ type: 'quote', text: fullQuote });
      }
      continue;
    }

    // Table parsing
    if (trimmed.includes('|') && i + 1 < lines.length) {
      const nextTrimmed = lines[i + 1].trim();
      if (/^\|?\s*:?-+:?\s*(\|?\s*:?-+:?\s*)+\|?$/.test(nextTrimmed)) {
        const headers = parseTableRow(trimmed);
        const alignments = parseTableAlign(nextTrimmed, headers.length);
        const rows = [];
        i += 2;
        while (i < lines.length && lines[i].trim().includes('|') && lines[i].trim() !== '') {
          const cells = parseTableRow(lines[i].trim());
          if (cells.length > 0) {
            while (cells.length < headers.length) cells.push('');
            rows.push(cells.slice(0, headers.length));
          }
          i++;
        }
        blocks.push({ type: 'table', headers, rows, alignments });
        continue;
      }
    }

    // Unordered list
    if (/^[-*+]\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*+]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'list', ordered: false, items });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      blocks.push({ type: 'list', ordered: true, items });
      continue;
    }

    // Standard paragraph
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('>') &&
      !lines[i].trim().startsWith('```') &&
      !/^\*{2,3}.+?\*{2,3}:?\s*$/.test(lines[i].trim()) &&
      !/^[-*+]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !/^(?:[-*_]\s*){3,}$/.test(lines[i].trim()) &&
      !(lines[i].trim().includes('|') && i + 1 < lines.length && /^\|?\s*:?-+:?\s*(\|?\s*:?-+:?\s*)+\|?$/.test(lines[i + 1].trim()))
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }

    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', text: paraLines.join(' ') });
    }
  }

  return blocks;
}

function parseTableRow(line) {
  let raw = line.trim();
  if (raw.startsWith('|')) raw = raw.slice(1);
  if (raw.endsWith('|')) raw = raw.slice(0, -1);
  return raw.split('|').map((c) => c.trim());
}

function parseTableAlign(sepLine, count) {
  let raw = sepLine.trim();
  if (raw.startsWith('|')) raw = raw.slice(1);
  if (raw.endsWith('|')) raw = raw.slice(0, -1);
  return raw.split('|').map((p) => {
    const s = p.trim();
    if (s.startsWith(':') && s.endsWith(':')) return 'center';
    if (s.endsWith(':')) return 'right';
    return 'left';
  });
}

function renderCanonicalBlocks(item) {
  if (!item) return '';

  let blocks = item.canonical_blocks;
  if (!blocks && item.canonical_content) {
    try {
      blocks = typeof item.canonical_content === 'string'
        ? JSON.parse(item.canonical_content)
        : item.canonical_content;
    } catch (e) {
      blocks = null;
    }
  }

  if (!blocks && item.metadata && item.metadata.canonicalBlocks) {
    blocks = item.metadata.canonicalBlocks;
  }

  // If no structured blocks are present, normalize via parseMarkdownToCanonicalBlocks
  if (!Array.isArray(blocks) || blocks.length === 0) {
    blocks = parseMarkdownToCanonicalBlocks(item.content || '');
  }

  return blocks
    .map((block) => {
      switch (block.type) {
        case 'heading': {
          const lvl = Math.min(4, Math.max(1, block.level || 2));
          return `<h${lvl} class="canonical-heading h${lvl}">${formatInlineMarkdownHtml(block.text || '')}</h${lvl}>`;
        }
        case 'quote': {
          return `<blockquote class="canonical-quote"><p>${formatInlineMarkdownHtml(block.text || '')}</p></blockquote>`;
        }
        case 'list': {
          const tag = block.ordered ? 'ol' : 'ul';
          const itemsHtml = (block.items || [])
            .map((itemText) => `<li>${formatInlineMarkdownHtml(itemText)}</li>`)
            .join('');
          return `<${tag} class="canonical-list">${itemsHtml}</${tag}>`;
        }
        case 'separator': {
          return `<div class="canonical-separator" role="separator"><span class="separator-ornament">✦ ✦ ✦</span></div>`;
        }
        case 'code': {
          const lang = escapeHtml(block.language || 'text');
          const codeText = escapeHtml(block.text || '');
          return `
            <div class="canonical-code-wrap">
              <div class="code-header">
                <span>${lang}</span>
                <button class="btn-copy-code" onclick="copyCodeBlock(this)">Copy</button>
              </div>
              <pre class="canonical-code"><code>${codeText}</code></pre>
            </div>
          `;
        }
        case 'table': {
          const caption = block.caption ? `<caption>${formatInlineMarkdownHtml(block.caption)}</caption>` : '';
          const headers = (block.headers || [])
            .map((h, i) => {
              const align = block.alignments && block.alignments[i] ? ` align-${block.alignments[i]}` : '';
              return `<th class="${align}">${formatInlineMarkdownHtml(h)}</th>`;
            })
            .join('');
          const thead = headers ? `<thead><tr>${headers}</tr></thead>` : '';
          const rows = (block.rows || [])
            .map((row) => {
              const cells = row
                .map((cell, i) => {
                  const align = block.alignments && block.alignments[i] ? ` align-${block.alignments[i]}` : '';
                  return `<td class="${align}">${formatInlineMarkdownHtml(cell)}</td>`;
                })
                .join('');
              return `<tr>${cells}</tr>`;
            })
            .join('');
          return `
            <div class="canonical-table-wrap">
              <table class="canonical-table">
                ${caption}
                ${thead}
                <tbody>${rows}</tbody>
              </table>
            </div>
          `;
        }
        case 'callout': {
          const variant = (block.variant || 'note').toLowerCase();
          const icon = getCalloutIcon(variant);
          const title = block.title || capitalizeStr(variant);
          return `
            <div class="canonical-callout callout-${escapeHtml(variant)}">
              <div class="canonical-callout-header">
                <span class="canonical-callout-icon">${icon}</span>
                <span class="canonical-callout-title">${escapeHtml(title)}</span>
              </div>
              <div class="canonical-callout-body">
                <p>${formatInlineMarkdownHtml(block.text || '')}</p>
              </div>
            </div>
          `;
        }
        case 'paragraph':
        default: {
          return `<p class="canonical-paragraph">${formatInlineMarkdownHtml(block.text || '')}</p>`;
        }
      }
    })
    .join('');
}

function copyCodeBlock(btn) {
  const codeEl = btn.closest('.canonical-code-wrap')?.querySelector('code');
  if (!codeEl) return;
  navigator.clipboard.writeText(codeEl.textContent).then(() => {
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  });
}

function copyCommand(cmd) {
  navigator.clipboard.writeText(cmd).then(() => {
    showToast(`Copied to clipboard: ${cmd}`);
  });
}

function handleChapterSelect(chapterId) {
  if (chapterId && state.activeBook) {
    openChapter(chapterId, state.activeBook.id);
  }
}

function navigateChapter(direction) {
  if (!state.chapters || !state.activeChapter) return;
  const currentIndex = state.chapters.findIndex((c) => c.id === state.activeChapter.id);
  if (currentIndex === -1) return;

  if (direction === 'prev' && currentIndex > 0) {
    openChapter(state.chapters[currentIndex - 1].id, state.activeBook.id);
  } else if (direction === 'next' && currentIndex < state.chapters.length - 1) {
    openChapter(state.chapters[currentIndex + 1].id, state.activeBook.id);
  } else {
    showToast(direction === 'prev' ? 'You are at the first chapter' : 'You are at the latest chapter');
  }
}

async function toggleChapterReadStatus() {
  if (!state.activeChapter) return;
  const newStatus = state.activeChapter.status === 'read' ? 'reading' : 'read';

  try {
    const updated = await api.updateChapter(state.activeChapter.id, { status: newStatus });
    state.activeChapter.status = updated.status;
    document.getElementById('reader-status-badge').textContent = updated.status;
    showToast(updated.status === 'read' ? 'Marked chapter as completed ✓' : 'Marked as reading');
  } catch (err) {
    showToast('Failed to update status', 'error');
  }
}

// Typography Controls
function adjustFontSize(delta) {
  state.readerFontSize = Math.min(28, Math.max(14, state.readerFontSize + delta * 2));
  document.getElementById('font-size-display').textContent = `${state.readerFontSize}px`;
  applyTypography();
}

function toggleReaderFont() {
  state.readerFontFamily = state.readerFontFamily === 'serif' ? 'sans' : 'serif';
  document.getElementById('btn-font-family').textContent = state.readerFontFamily === 'serif' ? 'Serif' : 'Sans';
  applyTypography();
}

function applyTypography() {
  const bodyEl = document.getElementById('reader-content-body');
  if (!bodyEl) return;
  bodyEl.style.setProperty('--reader-font-size', `${state.readerFontSize}px`);
  if (state.readerFontFamily === 'serif') {
    bodyEl.classList.remove('font-sans');
    bodyEl.classList.add('font-serif');
  } else {
    bodyEl.classList.remove('font-serif');
    bodyEl.classList.add('font-sans');
  }
}

// Reading Scroll Progress
function setupScrollProgress() {
  window.addEventListener('scroll', updateScrollProgress, { passive: true });
}

function updateScrollProgress() {
  if (state.currentView !== 'reader') return;
  const canvas = document.getElementById('reader-canvas');
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const windowHeight = window.innerHeight;
  const total = canvas.scrollHeight - windowHeight;
  const current = -rect.top;

  let progress = 0;
  if (total > 0) {
    progress = Math.min(100, Math.max(0, Math.round((current / total) * 100)));
  }

  const fill = document.getElementById('reading-progress-fill');
  if (fill) {
    fill.style.width = `${progress}%`;
  }
}

// ==========================================================================
// PERSISTENT SUMMARY & AI PROCESSING CONTROLLERS
// ==========================================================================
async function triggerChapterSummary() {
  if (!state.activeChapter) {
    showToast('No active chapter selected', 'error');
    return;
  }

  // Check first-time processing choice
  const savedMode = localStorage.getItem('sr_ai_mode');
  if (!savedMode) {
    // Open choice modal to guide user
    openAISelectionModal();
    return;
  }

  // Switch representation view to summary immediately so user sees processing state
  setReadingRepresentation('summary');

  state.isGeneratingSummary = true;
  state.summaryGenerationError = null;
  renderActiveRepresentationCanvas();

  const mode = state.processingMode || 'cloud';
  const provider = mode === 'local' ? 'ollama' : 'gemini';

  try {
    const response = await api.summarizeChapter(state.activeChapter.id, { mode, provider });
    state.activeRepresentation = response.representation;
    state.isGeneratingSummary = false;
    state.summaryGenerationError = null;

    showToast('Chapter summary generated and stored! ✦');

    // Update top bar summary indicator dot
    const repSummaryDot = document.getElementById('rep-summary-dot');
    if (repSummaryDot) repSummaryDot.style.display = 'inline-block';

    renderActiveRepresentationCanvas();
    fetchJobs();
  } catch (err) {
    state.isGeneratingSummary = false;
    let errMessage = err.message || 'Summarization failed';
    if (mode === 'local' && (errMessage.includes('ECONNREFUSED') || errMessage.includes('offline') || errMessage.includes('connect'))) {
      errMessage = 'Local Ollama service is not reachable on http://127.0.0.1:11434. Make sure Ollama is running (`ollama serve`), or switch to Cloud AI in Settings.';
    }
    state.summaryGenerationError = errMessage;
    renderActiveRepresentationCanvas();
    showToast(`Summarization failed: ${err.message}`, 'error');
  }
}

function copySummaryText() {
  if (!state.activeRepresentation || !state.activeRepresentation.content) return;
  navigator.clipboard.writeText(state.activeRepresentation.content).then(() => {
    showToast('Summary copied to clipboard!');
  });
}

// First-time AI Selection Modal Handlers
let pendingInitialAIMode = 'cloud';

function openAISelectionModal() {
  const currentMode = state.processingMode || 'cloud';
  selectInitialAIMode(currentMode);
  const modal = document.getElementById('aiSelectionModal');
  if (modal) modal.classList.remove('hidden');
}

function closeAISelectionModal() {
  const modal = document.getElementById('aiSelectionModal');
  if (modal) modal.classList.add('hidden');
}

function selectInitialAIMode(mode) {
  pendingInitialAIMode = mode;
  const cardLocal = document.getElementById('choice-card-local');
  const cardCloud = document.getElementById('choice-card-cloud');
  const confirmBtn = document.getElementById('btn-confirm-ai-choice');

  if (cardLocal && cardCloud) {
    if (mode === 'local') {
      cardLocal.classList.add('selected');
      cardCloud.classList.remove('selected');
      if (confirmBtn) confirmBtn.textContent = 'Continue with Local AI';
    } else {
      cardCloud.classList.add('selected');
      cardLocal.classList.remove('selected');
      if (confirmBtn) confirmBtn.textContent = 'Continue with Cloud AI';
    }
  }
}

async function confirmInitialAIChoice() {
  const chosenMode = pendingInitialAIMode || 'cloud';
  localStorage.setItem('sr_ai_mode', chosenMode);
  state.processingMode = chosenMode;
  state.selectedAIProvider = chosenMode === 'local' ? 'ollama' : 'gemini';

  handleSelectProcessingMode(chosenMode, false);
  closeAISelectionModal();
  showToast(`Processing Mode set to ${chosenMode === 'local' ? 'Local AI' : 'Cloud AI'}`);

  // Trigger summary generation with selected mode
  triggerChapterSummary();
}

// Processing Mode & Settings Controller
function handleSelectProcessingMode(mode, showNotice = true) {
  state.processingMode = mode;
  state.selectedAIProvider = mode === 'local' ? 'ollama' : 'gemini';
  localStorage.setItem('sr_ai_mode', mode);

  const btnLocal = document.getElementById('btn-mode-local');
  const btnCloud = document.getElementById('btn-mode-cloud');
  const modeBadge = document.getElementById('settings-ai-mode-badge');
  const diagMode = document.getElementById('diag-active-mode');
  const diagProv = document.getElementById('diag-backend-prov');
  const diagModel = document.getElementById('diag-model-name');

  if (btnLocal && btnCloud) {
    if (mode === 'local') {
      btnLocal.classList.add('active');
      btnCloud.classList.remove('active');
      if (modeBadge) modeBadge.textContent = 'Local AI (Private)';
    } else {
      btnCloud.classList.add('active');
      btnLocal.classList.remove('active');
      if (modeBadge) modeBadge.textContent = 'Cloud AI (Fast)';
    }
  }

  if (diagMode) diagMode.textContent = mode;
  if (diagProv) diagProv.textContent = state.selectedAIProvider;
  if (diagModel) diagModel.textContent = mode === 'local' ? 'llama3' : 'gemini-3.8-flash';

  api.setAIProvider(state.selectedAIProvider).catch(() => {});
  checkAIStatus(false);

  if (showNotice) {
    showToast(`AI Processing Mode: ${mode === 'local' ? 'Local AI (Private)' : 'Cloud AI (Fast)'}`);
  }
}

function selectAIProvider(provider) {
  const mode = provider === 'ollama' ? 'local' : 'cloud';
  handleSelectProcessingMode(mode);
}

function handleSelectDefaultProvider(provider) {
  selectAIProvider(provider);
}

// Check AI Status (Gemini & Ollama)
async function checkAIStatus(showNotice = false) {
  const pill = document.getElementById('ai-status-indicator');
  const label = document.getElementById('ai-status-label');
  const detail = document.getElementById('settings-ai-status-detail');
  const heroStatus = document.getElementById('ai-modal-hero-status');
  const statusBadgeDot = document.getElementById('ai-provider-status-badge');
  const provNameEl = document.getElementById('ai-active-provider-name');
  const modNameEl = document.getElementById('ai-active-model-name');

  if (pill) pill.className = 'status-pill checking';
  if (label) label.textContent = 'Checking AI...';

  try {
    const statusData = await api.getAIStatus();
    const providers = statusData.providers || {};
    const gemini = providers.gemini;
    const ollama = providers.ollama;

    const currentProv = state.selectedAIProvider;
    const currentStatus = currentProv === 'gemini' ? gemini : ollama;
    const isOnline = currentStatus && currentStatus.available;

    if (pill) {
      pill.className = `status-pill ${isOnline ? 'online' : 'offline'}`;
    }
    if (label) {
      if (currentProv === 'gemini') {
        label.textContent = isOnline ? 'Gemini: 3.8 Flash' : 'Gemini Offline';
      } else {
        label.textContent = isOnline ? `Ollama: ${ollama?.model || 'llama3'}` : 'Ollama Offline';
      }
    }

    if (statusBadgeDot) {
      statusBadgeDot.className = `badge-status-dot ${isOnline ? 'online' : 'offline'}`;
      statusBadgeDot.textContent = isOnline ? 'Online' : 'Offline';
    }

    if (provNameEl) {
      provNameEl.textContent = `Active: ${currentProv === 'gemini' ? 'Gemini' : 'Ollama'}`;
    }
    if (modNameEl) {
      modNameEl.textContent = `Model: ${currentProv === 'gemini' ? 'gemini-3.8-flash' : (ollama?.model || 'llama3')}`;
    }

    if (detail) {
      detail.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <div><strong>✨ Gemini 3.8 Flash:</strong> <span class="badge-status-dot ${gemini?.available ? 'online' : 'offline'}">${gemini?.available ? 'Online' : 'Offline'}</span> ${escapeHtml(gemini?.message || '')}</div>
          <div><strong>🖥️ Ollama (Local):</strong> <span class="badge-status-dot ${ollama?.available ? 'online' : 'offline'}">${ollama?.available ? 'Online' : 'Offline'}</span> ${escapeHtml(ollama?.message || '')}</div>
        </div>
      `;
    }

    if (heroStatus) {
      heroStatus.className = `ai-status-hero-card ${isOnline ? 'online' : 'offline'}`;
      heroStatus.innerHTML = `
        <span class="ai-hero-icon">${isOnline ? '🟢' : '🟡'}</span>
        <div style="flex: 1;">
          <div class="ai-hero-title">${isOnline ? `${currentProv === 'gemini' ? 'Gemini AI' : 'Ollama AI'} is Connected & Ready` : `${currentProv === 'gemini' ? 'Gemini' : 'Ollama'} Not Available`}</div>
          <div class="ai-hero-desc">
            Active provider: <strong>${currentProv === 'gemini' ? 'Gemini 3.8 Flash (Cloud)' : `Ollama (${ollama?.model || 'llama3'})`}</strong>.
            ${isOnline ? 'AI summaries are ready for instant distillation.' : (currentStatus?.message || '')}
          </div>
        </div>
      `;
    }

    if (showNotice) {
      showToast(isOnline ? `${currentProv === 'gemini' ? 'Gemini' : 'Ollama'} is connected and ready!` : `Selected provider (${currentProv}) is currently offline.`);
    }
  } catch (err) {
    if (pill) pill.className = 'status-pill offline';
    if (label) label.textContent = 'AI Offline';
    if (detail) detail.textContent = err.message;
  }
}

// ==========================================================================
// IMPORT & ADD BOOK MODALS
// ==========================================================================
function openAddBookModal() {
  document.getElementById('addBookModal').classList.remove('hidden');
}

function closeAddBookModal() {
  document.getElementById('addBookModal').classList.add('hidden');
  resetAddBookForm();
}

function switchAddBookTab(tab) {
  state.addBookTab = tab;
  const tabFile = document.getElementById('tab-import-file');
  const tabPaste = document.getElementById('tab-paste-text');
  const paneFile = document.getElementById('tab-pane-file');
  const panePaste = document.getElementById('tab-pane-paste');
  const submitText = document.getElementById('btn-submit-book-text');

  if (tab === 'file') {
    tabFile.classList.add('active');
    tabPaste.classList.remove('active');
    paneFile.style.display = 'block';
    panePaste.style.display = 'none';
    submitText.textContent = 'Import Book';
  } else {
    tabPaste.classList.add('active');
    tabFile.classList.remove('active');
    panePaste.style.display = 'block';
    paneFile.style.display = 'none';
    submitText.textContent = 'Save Book';
  }
}

function setupDragAndDrop() {
  const dropZone = document.getElementById('file-drop-zone');
  if (!dropZone) return;

  ['dragenter', 'dragover'].forEach((eventName) => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelected(files);
    }
  });
}

function handleFileSelected(files) {
  if (!files || files.length === 0) return;
  const file = files[0];
  state.selectedFile = file;

  const infoPill = document.getElementById('selected-file-info');
  infoPill.style.display = 'inline-block';
  infoPill.textContent = `Selected: ${file.name} (${Math.round(file.size / 1024)} KB)`;

  // Autofill title if empty
  const titleInput = document.getElementById('book-input-title');
  if (!titleInput.value.trim()) {
    const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
    titleInput.value = cleanName;
  }
}

function setIngestionStep(stepId, status, desc) {
  const stepEl = document.getElementById(stepId);
  if (!stepEl) return;
  stepEl.className = `ingestion-step ${status}`;
  if (desc) {
    const descEl = stepEl.querySelector('.step-desc');
    if (descEl) descEl.textContent = desc;
  }
}

async function handleAddBookSubmit(e) {
  e.preventDefault();
  const formEl = document.getElementById('form-add-book');
  const progressEl = document.getElementById('ingestion-progress-panel');
  const resultEl = document.getElementById('ingestion-result-panel');

  const title = document.getElementById('book-input-title').value.trim();
  const author = document.getElementById('book-input-author').value.trim();
  const description = document.getElementById('book-input-desc').value.trim();
  const contentType = document.getElementById('book-input-content-type').value;

  try {
    const formData = new FormData();
    formData.append('title', title);
    formData.append('author', author);
    formData.append('description', description);
    formData.append('contentType', contentType);

    if (state.addBookTab === 'file' && state.selectedFile) {
      formData.append('file', state.selectedFile);
    } else {
      const pasteText = document.getElementById('book-paste-content').value.trim();
      if (!pasteText) {
        throw new Error('Please paste your book content or select a file to import.');
      }
      formData.append('text', pasteText);
    }

    // Switch to Stateful Ingestion Progress View
    if (formEl) formEl.style.display = 'none';
    if (progressEl) progressEl.style.display = 'block';
    if (resultEl) resultEl.style.display = 'none';

    // Step 1: Format Detection
    setIngestionStep('step-inspect', 'active', 'Analyzing magic bytes & format specification...');
    setIngestionStep('step-extract', 'pending', 'Awaiting stream parser...');
    setIngestionStep('step-structure', 'pending', 'Awaiting structural scanner...');
    setIngestionStep('step-canonical', 'pending', 'Awaiting block compilation...');

    // Progress animation timers for user feedback
    const t1 = setTimeout(() => {
      setIngestionStep('step-inspect', 'completed', 'Container signature confirmed');
      setIngestionStep('step-extract', 'active', 'Extracting chapters and parsing document markup...');
    }, 450);

    const t2 = setTimeout(() => {
      setIngestionStep('step-extract', 'completed', 'Content stream extracted');
      setIngestionStep('step-structure', 'active', 'Detecting chapters, academic sections, tables & quotes...');
    }, 950);

    const t3 = setTimeout(() => {
      setIngestionStep('step-structure', 'completed', 'Document hierarchy analyzed');
      setIngestionStep('step-canonical', 'active', 'Synthesizing immutable canonical block document...');
    }, 1450);

    const result = await api.importBook(formData);

    clearTimeout(t1);
    clearTimeout(t2);
    clearTimeout(t3);

    // Complete all steps
    setIngestionStep('step-inspect', 'completed', 'Format confirmed: ' + (result.format || 'DOCUMENT'));
    setIngestionStep('step-extract', 'completed', 'Content extracted successfully');
    setIngestionStep('step-structure', 'completed', `${result.chapterCount || 1} chapter(s), ${result.tablesCount || 0} table(s)`);
    setIngestionStep('step-canonical', 'completed', 'Canonical document verified and stored');

    state.importedBookResult = result;

    // Transition smoothly to Result Card
    setTimeout(() => {
      if (progressEl) progressEl.style.display = 'none';
      if (resultEl) {
        resultEl.style.display = 'block';

        // Populate Result Card
        const fmtBadge = document.getElementById('result-format-badge');
        const titleEl = document.getElementById('result-book-title');
        const authorEl = document.getElementById('result-book-author');
        const statChapters = document.getElementById('stat-chapters-count');
        const statPages = document.getElementById('stat-pages-count');
        const statTables = document.getElementById('stat-tables-count');
        const statWords = document.getElementById('stat-words-count');
        const previewEl = document.getElementById('result-chapter-preview');

        const book = result.book || {};
        if (fmtBadge) fmtBadge.textContent = result.format || book.source_format || 'DOCUMENT';
        if (titleEl) titleEl.textContent = book.title || title || 'Untitled Book';
        if (authorEl) authorEl.textContent = `by ${book.author || author || 'Unknown Author'}`;
        if (statChapters) statChapters.textContent = result.chapterCount || 1;
        if (statPages) statPages.textContent = result.pageCount || book.page_count || 1;
        if (statTables) statTables.textContent = result.tablesCount || 0;
        if (statWords) statWords.textContent = (result.totalWordCount || book.total_words || 0).toLocaleString();

        const firstCh = result.chapters && result.chapters[0];
        if (previewEl) {
          const sample = firstCh && firstCh.content
            ? firstCh.content.slice(0, 240) + (firstCh.content.length > 240 ? '...' : '')
            : 'Document chapters processed into structured canonical blocks.';
          previewEl.textContent = `"${sample}"`;
        }
      }

      showToast(`Ingestion complete! "${result.book?.title || title}" is ready for reading.`);
      loadBooks();
      fetchJobs();
    }, 600);

  } catch (err) {
    if (formEl) formEl.style.display = 'block';
    if (progressEl) progressEl.style.display = 'none';
    if (resultEl) resultEl.style.display = 'none';
    showToast(`Import failed: ${err.message}`, 'error');
  }
}

function handleOpenImportedBook() {
  const result = state.importedBookResult;
  closeAddBookModal();
  if (result && result.book) {
    if (result.chapters && result.chapters.length > 0) {
      openChapter(result.chapters[0].id, result.book.id);
    } else {
      openBookDetails(result.book.id);
    }
  }
}

function resetAddBookForm() {
  const formEl = document.getElementById('form-add-book');
  const progressEl = document.getElementById('ingestion-progress-panel');
  const resultEl = document.getElementById('ingestion-result-panel');

  if (formEl) {
    formEl.reset();
    formEl.style.display = 'block';
  }
  if (progressEl) progressEl.style.display = 'none';
  if (resultEl) resultEl.style.display = 'none';

  state.selectedFile = null;
  state.importedBookResult = null;
  const infoPill = document.getElementById('selected-file-info');
  if (infoPill) infoPill.style.display = 'none';

  ['step-inspect', 'step-extract', 'step-structure', 'step-canonical'].forEach((s) => {
    const el = document.getElementById(s);
    if (el) el.className = 'ingestion-step pending';
  });
}

// ==========================================================================
// ADD CHAPTER MODAL
// ==========================================================================
function openAddChapterModal() {
  if (!state.activeBook) return;
  document.getElementById('addChapterModal').classList.remove('hidden');
}

function closeAddChapterModal() {
  document.getElementById('addChapterModal').classList.add('hidden');
  document.getElementById('form-add-chapter').reset();
}

async function handleAddChapterSubmit(e) {
  e.preventDefault();
  if (!state.activeBook) return;

  const num = parseInt(document.getElementById('chapter-input-number').value, 10);
  const title = document.getElementById('chapter-input-title').value.trim();
  const content = document.getElementById('chapter-input-content').value.trim();

  try {
    const newChapter = await api.addChapter(state.activeBook.id, {
      number: isNaN(num) ? undefined : num,
      title,
      content,
    });

    showToast(`Chapter "${title}" added!`);
    closeAddChapterModal();

    state.chapters = await api.getChapters(state.activeBook.id);
    renderChaptersList();
    renderBookDetailsHero();
  } catch (err) {
    showToast(`Failed to add chapter: ${err.message}`, 'error');
  }
}

// ==========================================================================
// PROCESSING JOBS MODAL
// ==========================================================================
async function fetchJobs() {
  try {
    state.jobs = await api.getJobs();
    const badge = document.getElementById('jobs-count-badge');
    if (badge) badge.textContent = state.jobs.length;
    renderJobsList();
  } catch (err) {
    console.error('Error fetching jobs:', err);
  }
}

function openJobsModal() {
  fetchJobs();
  document.getElementById('jobsModal').classList.remove('hidden');
}

function closeJobsModal() {
  document.getElementById('jobsModal').classList.add('hidden');
}

function renderJobsList() {
  const container = document.getElementById('jobs-list-container');
  if (!container) return;

  if (state.jobs.length === 0) {
    container.innerHTML = '<p class="section-desc" style="text-align: center; padding: 20px;">No processing jobs yet.</p>';
    return;
  }

  container.innerHTML = state.jobs
    .map((j) => {
      const time = new Date(j.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return `
        <div class="job-item">
          <div class="job-left">
            <span class="job-type-badge">${j.type}</span>
            <span class="job-time">${time} • Progress: ${j.progress}%</span>
            ${j.error ? `<span style="font-size: 11px; color: var(--status-error);">${escapeHtml(j.error)}</span>` : ''}
          </div>
          <span class="job-status-pill ${j.status}">${j.status}</span>
        </div>
      `;
    })
    .join('');
}

// ==========================================================================
// SETTINGS & ABOUT MODALS
// ==========================================================================
function openSettings() {
  checkAIStatus(false);
  document.getElementById('settingsModal').classList.remove('hidden');
}

function closeSettings() {
  document.getElementById('settingsModal').classList.add('hidden');
}

function showAbout() {
  document.getElementById('aboutModal').classList.remove('hidden');
}

function closeAbout() {
  document.getElementById('aboutModal').classList.add('hidden');
}

function setTheme(themeName) {
  document.body.className = `theme-${themeName}`;
  localStorage.setItem('sr_theme', themeName);
  ['light', 'warm', 'dark', 'glass'].forEach((t) => {
    const btn = document.getElementById(`theme-btn-${t}`);
    if (btn) {
      if (t === themeName) btn.classList.add('active');
      else btn.classList.remove('active');
    }
  });
  showToast(`Theme updated to ${themeName}`);
}

function loadPreferences() {
  const savedTheme = localStorage.getItem('sr_theme') || 'light';
  document.body.className = `theme-${savedTheme}`;
  ['light', 'warm', 'dark', 'glass'].forEach((t) => {
    const btn = document.getElementById(`theme-btn-${t}`);
    if (btn) {
      if (t === savedTheme) btn.classList.add('active');
      else btn.classList.remove('active');
    }
  });

  const savedMode = localStorage.getItem('sr_ai_mode');
  if (savedMode) {
    state.processingMode = savedMode;
    state.selectedAIProvider = savedMode === 'local' ? 'ollama' : 'gemini';
    handleSelectProcessingMode(savedMode, false);
  }
}

// ==========================================================================
// TOAST NOTIFICATIONS & UTILITIES
// ==========================================================================
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;

  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// AI Status Modal
function openAIStatusModal() {
  checkAIStatus(false);
  const modal = document.getElementById('aiStatusModal');
  if (modal) modal.classList.remove('hidden');
}

function closeAIStatusModal() {
  const modal = document.getElementById('aiStatusModal');
  if (modal) modal.classList.add('hidden');
}

// Development & Seed Data Handlers
async function handleDevReset() {
  if (!confirm('Reset Smart Reader to the curated sample library? This restores sample novels, textbooks, and research documents.')) {
    return;
  }

  try {
    showToast('Resetting database to sample library...');
    await api.resetDevData();
    localStorage.removeItem('sr_last_book');
    localStorage.removeItem('sr_last_chapter');
    await loadBooks();
    await fetchJobs();
    closeSettings();
    showToast('Sample library restored successfully!');
    navigateTo('library');
  } catch (err) {
    showToast(`Reset failed: ${err.message}`, 'error');
  }
}

async function seedSampleLibrary() {
  try {
    showToast('Loading sample collection...');
    await api.resetDevData();
    await loadBooks();
    await fetchJobs();
    showToast('Sample books loaded into your library!');
  } catch (err) {
    showToast(`Failed to load sample library: ${err.message}`, 'error');
  }
}

// Legacy function preserved for backwards compatibility
function startReading() {
  if (state.books.length > 0) {
    openBookDetails(state.books[0].id);
  } else {
    openAddBookModal();
  }
}

async function generateSummary() {
  triggerChapterSummary();
}
