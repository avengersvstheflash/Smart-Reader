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
  addBookTab: 'web',
  selectedFile: null,
  webSearchResults: [],
  selectedWebSources: new Set(),
  activeWebSearchCategory: 'all',
  activeWebPreview: null,
  supportingMaterials: [],
  activeSupportingMaterial: null,
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

  // Web Intelligence API (Build 3A)
  async searchWeb(query, category = 'all', limit = 10) {
    const params = new URLSearchParams({ q: query, category, limit });
    const res = await fetch(`/api/web/search?${params}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Web search failed');
    }
    return await res.json();
  },

  async previewWeb(url) {
    const res = await fetch('/api/web/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Preview failed');
    return data;
  },

  async importWeb(payload) {
    const res = await fetch('/api/web/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Web import failed');
    return data;
  },

  async importWebMulti(payload) {
    const res = await fetch('/api/web/import-multi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Multi-source acquisition failed');
    return data;
  },

  async getSupportingMaterials(bookId) {
    const res = await fetch(`/api/books/${bookId}/supporting`);
    if (!res.ok) throw new Error('Failed to load supporting material');
    const data = await res.json();
    return data.materials || [];
  },

  async attachSupportingMaterial(bookId, payload) {
    const res = await fetch(`/api/books/${bookId}/supporting`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to attach supporting material');
    return data.material;
  },

  async deleteSupportingMaterial(materialId) {
    const res = await fetch(`/api/web/supporting/${materialId}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete supporting material');
    return data;
  },

  async getSynopsis(bookId) {
    const res = await fetch(`/api/books/${bookId}/synopsis`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.representation;
  },

  async generateSynopsis(bookId) {
    const res = await fetch(`/api/books/${bookId}/synopsis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to generate synopsis');
    return data;
  },

  async getBookSummary(bookId) {
    const res = await fetch(`/api/books/${bookId}/summary`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.representation;
  },

  async generateBookSummary(bookId) {
    const res = await fetch(`/api/books/${bookId}/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to generate book summary');
    return data;
  },

  async getSemanticStatus(bookId) {
    const res = await fetch(`/api/semantic/status/${bookId}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.data;
  },

  async askBook(bookId, query) {
    const res = await fetch(`/api/books/${bookId}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to answer query');
    return data;
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
    if (state.filterType === 'web') {
      filtered = filtered.filter((b) => b.source_format === 'web' || b.source_site || (b.source_url && b.source_url.startsWith('http')));
    } else {
      filtered = filtered.filter((b) => b.content_type === state.filterType);
    }
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

      const isWeb = book.source_format === 'web' || book.source_site || (book.source_url && book.source_url.startsWith('http'));
      const webBadge = isWeb ? `<span class="badge-pill-xs badge-web">🌐 ${escapeHtml(book.source_site || 'Web Source')}</span>` : '';
      const integrityBadge = book.integrity_status === 'empty_content'
        ? `<span class="badge-pill-xs badge-warning" style="background:#fef3c7; color:#92400e; border:1px solid #fde68a;">⚠️ Empty Content</span>`
        : '';
      const metaBadges = (webBadge || integrityBadge)
        ? `<div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">${webBadge}${integrityBadge}</div>`
        : '';

      return `
        <div class="book-card" id="book-card-${book.id}" onclick="openBookDetails('${book.id}')">
          ${coverHtml}
          ${metaBadges}
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
    state.supportingMaterials = await api.getSupportingMaterials(bookId).catch(() => []);

    renderBookDetailsHero();
    renderChaptersList();
    renderSupportingMaterialsList();
    renderSemanticIntelligence(bookId);
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

  const isWebAcquired = book.source_format === 'web' || book.source_site || (book.source_url && book.source_url.startsWith('http'));
  
  let provenanceHtml = '';
  if (isWebAcquired) {
    const dateStr = book.retrieved_at ? new Date(book.retrieved_at).toLocaleString() : '';
    let extraSources = '';
    if (book.metadata_json) {
      try {
        const meta = typeof book.metadata_json === 'string' ? JSON.parse(book.metadata_json) : book.metadata_json;
        if (meta.sources && Array.isArray(meta.sources) && meta.sources.length > 1) {
          extraSources = `
            <div style="margin-top:8px; font-size:0.8rem; color:var(--text-muted);">
              <strong>Multi-Source Research Dossier (${meta.sources.length} sources):</strong>
              <ul style="margin:4px 0 0 16px; padding:0;">
                ${meta.sources.map(s => `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--brand-primary); text-decoration:none;">${escapeHtml(s.title || s.url)} ↗</a> <span style="font-size:0.75rem; color:var(--text-light);">(${escapeHtml(s.site || 'Web')})</span></li>`).join('')}
              </ul>
            </div>
          `;
        }
      } catch (e) {}
    }

    provenanceHtml = `
      <div class="source-provenance-box">
        <div class="provenance-top-row">
          <span class="provenance-tag-pill">🌐 Web-Acquired Source</span>
          <span class="provenance-site-name">${escapeHtml(book.source_site || 'Web Knowledge')}</span>
        </div>
        ${book.source_url ? `<div><a href="${escapeHtml(book.source_url)}" target="_blank" rel="noopener noreferrer" class="provenance-url-link">🔗 ${escapeHtml(book.source_url)} ↗</a></div>` : ''}
        ${dateStr ? `<span class="provenance-date-label">Retrieved & Structured: ${dateStr}</span>` : ''}
        ${extraSources}
      </div>
    `;
  }

  hero.innerHTML = `
    ${coverHtml}
    <div class="hero-info">
      <div class="hero-badges">
        <span class="badge-tag">${escapeHtml(book.content_type || 'novel')}</span>
        <span class="badge-tag">${state.chapters.length} chapters</span>
        ${book.integrity_status === 'empty_content' ? `<span class="badge-tag" style="background:#fef3c7; color:#92400e; border:1px solid #fde68a;">⚠️ Empty Content</span>` : ''}
        ${isWebAcquired ? `<span class="badge-tag badge-web">🌐 ${escapeHtml(book.source_site || 'Web')}</span>` : ''}
      </div>
      <h1 class="hero-title">${escapeHtml(book.title)}</h1>
      <p class="hero-author">By ${escapeHtml(book.author || 'Unknown Author')}</p>
      
      ${book.integrity_status === 'empty_content' ? `
        <div class="integrity-alert-box" style="margin: 10px 0; padding: 12px 16px; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; color: #92400e;">
          <div style="font-weight: 600; font-size: 0.9rem; display: flex; align-items: center; gap: 6px;">
            <span>⚠️ Content Integrity Notice</span>
          </div>
          <p style="margin: 4px 0 0; font-size: 0.85rem; line-height: 1.4;">
            ${escapeHtml(book.integrity_warning || 'This document contains no readable text or could not be cleanly extracted. Semantic memory indexing has been skipped.')}
          </p>
        </div>
      ` : ''}

      ${provenanceHtml}

      <div class="hero-desc-wrap" style="margin: 10px 0;">
        <p class="hero-desc" id="hero-book-description">${escapeHtml(book.description || 'No description provided.')}</p>
        <div style="margin-top: 6px;">
          <button id="btn-hero-synopsis" class="btn btn-secondary btn-xs" onclick="handleGenerateSynopsis('${book.id}')" title="Synthesize structured synopsis with Smart Reader AI">
            <svg class="ui-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3 1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>
            </svg>
            <span>✦ Synthesize Editorial Synopsis</span>
          </button>
        </div>
      </div>

      <div class="hero-actions" style="display: flex; flex-wrap: wrap; gap: 8px;">
        ${
          hasChapters
            ? `<button id="btn-hero-read" class="btn btn-primary" onclick="openChapter('${firstChapterId}', '${book.id}')">Start Reading Chapter 1 →</button>`
            : `<button class="btn btn-primary" onclick="openAddChapterModal()">+ Add First Chapter</button>`
        }
        <button id="btn-hero-supporting" class="btn btn-secondary" onclick="openSupportingMaterialModal('${book.id}')">
          <svg class="ui-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <span>Find Supporting Material</span>
        </button>
        <button type="button" class="btn btn-secondary coming-soon-btn" onclick="showComingSoonModal('Visual Story')" title="Cinematic illustrated scene narrative mode">
          <span>🎨 Visual Story</span>
        </button>
        <button type="button" class="btn btn-secondary coming-soon-btn" onclick="showComingSoonModal('Interactive Video')" title="Synchronized multimedia walkthrough mode">
          <span>🎬 Interactive Video</span>
        </button>
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
      const roleBadge = ch.structural_role && ch.structural_role !== 'chapter'
        ? `<span class="badge-pill-xs" style="text-transform: capitalize; background: var(--bg-card); border: 1px solid var(--border-color); padding: 1px 6px; border-radius: 4px; font-size: 0.72rem; color: var(--text-muted); margin-right: 6px;">${escapeHtml(ch.structural_role.replace(/_/g, ' '))}</span>`
        : '';
      const sectionBadge = ch.section_count > 0
        ? `<span style="font-size: 0.75rem; color: var(--text-muted);">${ch.section_count} section${ch.section_count === 1 ? '' : 's'} • </span>`
        : '';

      return `
        <div class="chapter-row" id="chapter-row-${ch.id}" onclick="openChapter('${ch.id}', '${ch.book_id}')">
          <div class="chapter-row-left">
            <span class="chapter-num-badge">${ch.number}</span>
            <div>
              <div class="chapter-row-title">${escapeHtml(ch.title)}</div>
              <div class="chapter-row-meta">${roleBadge}${sectionBadge}${ch.word_count || 0} words • Status: ${ch.status || 'unread'}</div>
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

// Supporting Materials Rendering (Build 3A)
function renderSupportingMaterialsList() {
  const listEl = document.getElementById('supporting-materials-list');
  if (!listEl) return;

  const materials = state.supportingMaterials || [];
  if (materials.length === 0) {
    listEl.innerHTML = `
      <div class="supporting-empty-card">
        <p>No supporting materials or research attached to this book yet.</p>
        <button class="btn btn-secondary btn-sm" onclick="openSupportingMaterialModal('${state.activeBook ? state.activeBook.id : ''}')" style="margin-top: 10px;">
          + Find Supporting Material
        </button>
      </div>
    `;
    return;
  }

  listEl.innerHTML = materials
    .map((mat) => {
      const dateStr = mat.created_at ? new Date(mat.created_at).toLocaleDateString() : '';
      return `
        <div class="supporting-card" id="supporting-card-${mat.id}">
          <div>
            <div class="supporting-card-header">
              <span class="badge-tag">${escapeHtml(mat.source_site || 'Web Source')}</span>
              <span style="font-size:0.75rem; color:var(--text-light);">${dateStr}</span>
            </div>
            <h4 class="supporting-card-title">${escapeHtml(mat.title)}</h4>
            ${mat.author ? `<p style="font-size:0.78rem; color:var(--text-muted); margin:0 0 6px 0;">By ${escapeHtml(mat.author)}</p>` : ''}
            <p class="supporting-card-snippet">${escapeHtml(mat.snippet || 'Structured supporting research reference.')}</p>
          </div>
          <div class="supporting-card-actions">
            <button class="btn btn-secondary btn-xs" onclick="handleViewSupportingMaterial('${mat.id}')">
              View Reference
            </button>
            <button class="btn btn-secondary btn-xs" onclick="handleDeleteSupportingMaterial('${mat.id}')" style="color:var(--status-error);" title="Remove supporting material">
              Remove
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

// Inline Markdown Parser: ensures raw markdown (bold, italic, code) and raw HTML tags do not leak into reader
function formatInlineMarkdownHtml(str) {
  if (!str) return '';

  // 1. Convert raw HTML formatting tags to standard markdown tokens first
  let s = String(str)
    .replace(/<\/?(?:strong|b)>/gi, '**')
    .replace(/<\/?(?:em|i)>/gi, '*')
    .replace(/<\/?code>/gi, '`')
    .replace(/<\/?del>/gi, '~~')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '');

  // 2. Strip lone or stray hash markers
  s = s.replace(/^#+\s*/, '').replace(/\s+#+\s*/g, ' ');

  // 3. HTML escape to safely neutralize any special characters
  s = escapeHtml(s);

  // 4. Safely convert markdown formatting to clean semantic HTML
  s = s.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  s = s.replace(/(?:^|\s)_([^_]+)_(?:$|\s)/g, ' <em>$1</em> ');
  s = s.replace(/`([^`]+)`/g, '<code class="canonical-inline-code">$1</code>');
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // 5. Clean up any leftover unclosed/dangling asterisks
  s = s.replace(/(?<![*\w])\*{1,3}(?![*\w])/g, '');

  return s.trim();
}

// Parse markdown string into canonical blocks
function parseMarkdownToCanonicalBlocks(rawText) {
  if (!rawText || typeof rawText !== 'string' || rawText.trim() === '') {
    return [{ type: 'paragraph', text: 'No content available.' }];
  }

  // Pre-clean raw text of stray HTML tags
  const sanitized = String(rawText)
    .replace(/<\/?(?:strong|b)>/gi, '**')
    .replace(/<\/?(?:em|i)>/gi, '*')
    .replace(/<\/?code>/gi, '`')
    .replace(/<\/?del>/gi, '~~')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?:p|div|span)>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  const lines = sanitized.split(/\r?\n/);
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed || /^#{1,6}\s*$/.test(trimmed)) {
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
    if (/^(?:[-*_]\s*){3,}$/.test(trimmed) || /^(?:✦\s*){3,}$/.test(trimmed)) {
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
      if (headingText) {
        blocks.push({ type: 'heading', level, text: headingText });
      }
      i++;
      continue;
    }

    // Bold title line as heading: **Section Title:**
    const boldHeaderMatch = trimmed.match(/^\*{2,3}(.+?)\*{2,3}:?\s*$/);
    if (boldHeaderMatch && boldHeaderMatch[1].length > 1 && boldHeaderMatch[1].length < 120) {
      const hText = boldHeaderMatch[1].replace(/:$/, '').trim();
      if (hText) {
        blocks.push({ type: 'heading', level: 3, text: hText });
      }
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

  // Handle empty content or documents with no readable text
  if (!Array.isArray(blocks) || blocks.length === 0 || blocks.every((b) => !b.text && (!b.items || b.items.length === 0) && (!b.rows || b.rows.length === 0))) {
    const warningMsg = (state.activeBook && state.activeBook.integrity_warning)
      ? state.activeBook.integrity_warning
      : 'No readable text content was detected in this chapter or document.';
    return `
      <div class="empty-chapter-state" style="margin: 40px auto; max-width: 580px; padding: 32px 24px; text-align: center; background: var(--bg-card, #f8fafc); border: 1px dashed var(--border-color, #cbd5e1); border-radius: 12px;">
        <div style="font-size: 2.2rem; margin-bottom: 12px;">📄</div>
        <h3 style="font-size: 1.15rem; font-weight: 600; margin-bottom: 8px; color: var(--text-primary, #0f172a);">No Content Available</h3>
        <p style="color: var(--text-muted, #64748b); font-size: 0.9rem; line-height: 1.5; margin-bottom: 20px;">
          ${escapeHtml(warningMsg)}
        </p>
        <button class="btn btn-secondary btn-sm" onclick="openAddChapterModal()">+ Add New Chapter</button>
      </div>
    `;
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
function openAddBookModal(defaultTab = 'web') {
  document.getElementById('addBookModal').classList.remove('hidden');
  switchAddBookTab(defaultTab);
}

function closeAddBookModal() {
  document.getElementById('addBookModal').classList.add('hidden');
  resetAddBookForm();
}

function switchAddBookTab(tab) {
  state.addBookTab = tab;
  const tabWeb = document.getElementById('tab-web-search');
  const tabFile = document.getElementById('tab-import-file');
  const tabPaste = document.getElementById('tab-paste-text');
  const paneWeb = document.getElementById('tab-pane-web');
  const paneFile = document.getElementById('tab-pane-file');
  const panePaste = document.getElementById('tab-pane-paste');
  const submitText = document.getElementById('btn-submit-book-text');
  const modalFooter = document.querySelector('#form-add-book .modal-footer');
  const formRows = document.querySelectorAll('#form-add-book .form-row, #form-add-book .form-group');

  if (tabWeb) tabWeb.classList.toggle('active', tab === 'web');
  if (tabFile) tabFile.classList.toggle('active', tab === 'file');
  if (tabPaste) tabPaste.classList.toggle('active', tab === 'paste');

  if (paneWeb) paneWeb.style.display = tab === 'web' ? 'block' : 'none';
  if (paneFile) paneFile.style.display = tab === 'file' ? 'block' : 'none';
  if (panePaste) panePaste.style.display = tab === 'paste' ? 'block' : 'none';

  if (tab === 'web') {
    if (modalFooter) modalFooter.style.display = 'none';
    formRows.forEach((row) => {
      if (!paneWeb.contains(row)) {
        row.style.display = 'none';
      }
    });
  } else {
    if (modalFooter) modalFooter.style.display = 'flex';
    formRows.forEach((row) => {
      if (!paneWeb.contains(row)) {
        row.style.display = '';
      }
    });
    if (submitText) {
      submitText.textContent = tab === 'file' ? 'Import Book' : 'Save Book';
    }
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
    const descEl = stepEl.querySelector('.step-sub') || stepEl.querySelector('.step-desc');
    if (descEl) descEl.textContent = desc;
  }
}

async function handleAddBookSubmit(e) {
  e.preventDefault();
  const formEl = document.getElementById('form-add-book');
  const progressEl = document.getElementById('ingestion-progress-panel');
  const resultEl = document.getElementById('ingestion-result-panel');
  const errPanel = document.getElementById('ingestion-error-panel');

  const title = document.getElementById('book-input-title').value.trim();
  const author = document.getElementById('book-input-author').value.trim();
  const description = document.getElementById('book-input-desc').value.trim();
  const contentType = document.getElementById('book-input-content-type').value;

  let t1, t2, t3;

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
    if (errPanel) errPanel.style.display = 'none';

    // Step 1: Format Detection
    setIngestionStep('step-inspect', 'active', 'Analyzing magic bytes & format specification...');
    setIngestionStep('step-extract', 'pending', 'Awaiting stream parser...');
    setIngestionStep('step-structure', 'pending', 'Awaiting structural scanner...');
    setIngestionStep('step-canonical', 'pending', 'Awaiting block compilation...');

    // Progress animation timers for user feedback
    t1 = setTimeout(() => {
      setIngestionStep('step-inspect', 'completed', 'Container signature confirmed');
      setIngestionStep('step-extract', 'active', 'Extracting chapters and parsing document markup...');
    }, 450);

    t2 = setTimeout(() => {
      setIngestionStep('step-extract', 'completed', 'Content stream extracted');
      setIngestionStep('step-structure', 'active', 'Detecting chapters, academic sections, tables & quotes...');
    }, 950);

    t3 = setTimeout(() => {
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
    setIngestionStep('step-structure', 'completed', `${result.chapterCount || 1} chapter(s), ${result.sectionCount || 0} section(s)`);
    const isWarning = result.integrityStatus === 'empty_content' || result.totalWordCount === 0;
    setIngestionStep('step-canonical', 'completed', isWarning ? 'Stored with content notice' : 'Canonical document verified and stored');

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
        const integrityBanner = document.getElementById('result-integrity-banner');
        const integrityText = document.getElementById('result-integrity-text');

        const book = result.book || {};
        if (fmtBadge) fmtBadge.textContent = result.format || book.source_format || 'DOCUMENT';
        if (titleEl) titleEl.textContent = book.title || title || 'Untitled Book';
        if (authorEl) authorEl.textContent = `by ${book.author || author || 'Unknown Author'}`;
        if (statChapters) statChapters.textContent = result.chapterCount || 1;
        if (statPages) statPages.textContent = result.pageCount || book.page_count || 1;
        if (statTables) statTables.textContent = result.tablesCount || 0;
        if (statWords) statWords.textContent = (result.totalWordCount || book.total_words || 0).toLocaleString();

        if (integrityBanner) {
          if (isWarning) {
            integrityBanner.style.display = 'block';
            if (integrityText) {
              integrityText.textContent = ' ' + (result.integrityWarning || 'Content extraction incomplete: no readable text found or structure is empty.');
            }
          } else {
            integrityBanner.style.display = 'none';
          }
        }

        const firstCh = result.chapters && result.chapters[0];
        if (previewEl) {
          const sample = firstCh && firstCh.content
            ? firstCh.content.slice(0, 240) + (firstCh.content.length > 240 ? '...' : '')
            : (isWarning ? 'No extractable text found in source.' : 'Document chapters processed into structured canonical blocks.');
          previewEl.textContent = `"${sample}"`;
        }
      }

      showToast(`Ingestion complete! "${result.book?.title || title}" is ready.`);
      loadBooks();
      fetchJobs();
    }, 600);

  } catch (err) {
    clearTimeout(t1);
    clearTimeout(t2);
    clearTimeout(t3);

    if (formEl) formEl.style.display = 'none';
    if (progressEl) progressEl.style.display = 'none';
    if (resultEl) resultEl.style.display = 'none';

    if (errPanel) {
      errPanel.style.display = 'block';
      const errText = document.getElementById('ingestion-error-text');
      if (errText) {
        errText.textContent = err.message || 'The selected file could not be parsed as a supported format.';
      }
    } else {
      if (formEl) formEl.style.display = 'block';
    }

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
  const errPanel = document.getElementById('ingestion-error-panel');
  const integrityBanner = document.getElementById('result-integrity-banner');

  if (formEl) {
    formEl.reset();
    formEl.style.display = 'block';
  }
  if (progressEl) progressEl.style.display = 'none';
  if (resultEl) resultEl.style.display = 'none';
  if (errPanel) errPanel.style.display = 'none';
  if (integrityBanner) integrityBanner.style.display = 'none';

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
// BUILD 3A: WEB ACQUISITION & SEARCH CONTROLLER
// ==========================================================================

function setWebSearchCategory(cat) {
  state.activeWebSearchCategory = cat;
  const chips = document.querySelectorAll('#web-category-chips .chip');
  chips.forEach((chip) => chip.classList.toggle('active', chip.getAttribute('data-cat') === cat));

  const query = document.getElementById('web-search-input')?.value.trim();
  if (query) {
    handleRunWebSearch();
  }
}

function handleWebSearchKey(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleRunWebSearch();
  }
}

function quickSearchWeb(term) {
  const input = document.getElementById('web-search-input');
  if (input) {
    input.value = term;
    handleRunWebSearch();
  }
}

async function handleRunWebSearch() {
  const input = document.getElementById('web-search-input');
  const query = input ? input.value.trim() : '';
  const loading = document.getElementById('web-search-loading');
  const errorBanner = document.getElementById('web-search-error');
  const resultsEl = document.getElementById('web-search-results');

  if (!query) {
    showToast('Please enter a search query or URL', 'info');
    return;
  }

  // If user pasted a direct URL into the search box, redirect to direct URL preview
  if (/^https?:\/\//i.test(query)) {
    const directInput = document.getElementById('web-direct-url-input');
    if (directInput) directInput.value = query;
    handlePreviewDirectUrl();
    return;
  }

  if (loading) loading.style.display = 'flex';
  if (errorBanner) {
    errorBanner.style.display = 'none';
    errorBanner.textContent = '';
  }

  try {
    const data = await api.searchWeb(query, state.activeWebSearchCategory);
    state.webSearchResults = data.results || [];
    renderWebSearchResults(state.webSearchResults);
  } catch (err) {
    if (errorBanner) {
      errorBanner.style.display = 'block';
      errorBanner.textContent = `Search failed: ${err.message}`;
    }
  } finally {
    if (loading) loading.style.display = 'none';
  }
}

function renderWebSearchResults(results) {
  const container = document.getElementById('web-search-results');
  if (!container) return;

  if (!results || results.length === 0) {
    container.innerHTML = `
      <div class="web-search-welcome-state">
        <div class="welcome-icon">🔍</div>
        <h4>No accessible sources found</h4>
        <p>No results matched your search across the selected repositories. Try broader search terms or paste a direct webpage URL.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = results
    .map((res) => {
      const isChecked = state.selectedWebSources.has(res.id);
      let siteClass = 'wiki';
      if (res.sourceSite === 'Open Library') siteClass = 'openlib';
      if (res.sourceSite === 'Crossref') siteClass = 'crossref';

      return `
        <div class="web-result-item" id="web-res-${res.id}">
          <div class="web-result-checkbox-wrap">
            <input type="checkbox" class="web-result-checkbox" ${isChecked ? 'checked' : ''} onchange="handleToggleWebSource('${res.id}', this.checked)" title="Select to combine into research dossier">
          </div>
          <div class="web-result-body">
            <div class="web-result-header-row">
              <div class="web-result-badges">
                <span class="badge-site ${siteClass}">${escapeHtml(res.sourceSite || 'Web')}</span>
                <span class="badge-tag">${escapeHtml(res.sourceType || 'document')}</span>
              </div>
              ${res.author ? `<span style="font-size:0.76rem; color:var(--text-light);">${escapeHtml(res.author)}</span>` : ''}
            </div>
            <h4 class="web-result-title">${escapeHtml(res.title)}</h4>
            <p class="web-result-snippet">${escapeHtml(res.snippet || 'No description available.')}</p>
            <div class="web-result-actions">
              <a href="${escapeHtml(res.url)}" target="_blank" rel="noopener noreferrer" class="web-result-ext-link">
                🔗 ${escapeHtml(res.url)} ↗
              </a>
              <div class="web-result-btn-group">
                <button type="button" class="btn btn-secondary btn-xs" onclick="handlePreviewWebSource('${escapeHtml(res.url)}')">
                  Preview
                </button>
                <button type="button" class="btn btn-primary btn-xs" onclick="handleImportSingleWebSource('${escapeHtml(res.url)}')">
                  Acquire →
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  updateWebSelectionBar();
}

function handleToggleWebSource(id, isChecked) {
  if (isChecked) {
    state.selectedWebSources.add(id);
  } else {
    state.selectedWebSources.delete(id);
  }
  updateWebSelectionBar();
}

function clearWebSelection() {
  state.selectedWebSources.clear();
  const checkboxes = document.querySelectorAll('.web-result-checkbox');
  checkboxes.forEach((cb) => (cb.checked = false));
  updateWebSelectionBar();
}

function updateWebSelectionBar() {
  const bar = document.getElementById('web-multi-select-bar');
  const countBadge = document.getElementById('multi-select-count');
  const count = state.selectedWebSources.size;

  if (bar) {
    if (count > 0) {
      bar.style.display = 'flex';
      if (countBadge) countBadge.textContent = `${count} source${count === 1 ? '' : 's'} selected`;
    } else {
      bar.style.display = 'none';
    }
  }
}

async function handleImportSelectedMulti() {
  const selected = Array.from(state.selectedWebSources);
  if (selected.length === 0) return;

  const sources = state.webSearchResults
    .filter((r) => selected.includes(r.id))
    .map((r) => ({ url: r.url, title: r.title, site: r.sourceSite, author: r.author }));

  if (sources.length === 0) return;

  closeWebPreview();

  await runWebIngestionPipeline(async () => {
    return await api.importWebMulti({
      sources,
      title: `Research Dossier: ${sources[0].title} (+${sources.length - 1} sources)`,
      contentType: 'research',
    });
  });
}

async function handlePreviewWebSource(url) {
  const previewCard = document.getElementById('web-preview-card');
  const errorBanner = document.getElementById('web-search-error');
  if (errorBanner) errorBanner.style.display = 'none';

  try {
    showToast('Fetching and analyzing web document structure...', 'info');
    const previewData = await api.previewWeb(url);
    state.activeWebPreview = previewData;

    if (previewCard) {
      document.getElementById('preview-site-tag').textContent = previewData.metadata?.siteName || 'Web Source';
      document.getElementById('preview-type-tag').textContent = previewData.metadata?.sourceType || 'document';
      document.getElementById('preview-title').textContent = previewData.title || 'Untitled Document';
      document.getElementById('preview-author').textContent = `By ${previewData.author || 'Unknown'}`;

      const linkEl = document.getElementById('preview-link');
      if (linkEl) {
        linkEl.href = previewData.url;
        linkEl.textContent = `🔗 ${previewData.url} ↗`;
      }

      document.getElementById('pmetric-sections').textContent = previewData.stats?.sectionCount || 1;
      document.getElementById('pmetric-words').textContent = (previewData.stats?.wordCount || 0).toLocaleString();
      document.getElementById('pmetric-blocks').textContent = previewData.stats?.canonicalBlocksCount || 0;

      const secList = document.getElementById('preview-sections-list');
      if (secList && previewData.chapterHeadings) {
        secList.innerHTML = previewData.chapterHeadings
          .map((h) => `<span class="section-pill">${escapeHtml(h)}</span>`)
          .join('');
      }

      const snippetEl = document.getElementById('preview-snippet-text');
      if (snippetEl) {
        snippetEl.textContent =
          previewData.firstParagraphSnippet || previewData.metadata?.description || 'No introductory snippet extracted.';
      }

      previewCard.style.display = 'block';
      previewCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  } catch (err) {
    if (errorBanner) {
      errorBanner.style.display = 'block';
      errorBanner.textContent = `Failed to preview source: ${err.message}`;
    }
    showToast(`Preview failed: ${err.message}`, 'error');
  }
}

function closeWebPreview() {
  state.activeWebPreview = null;
  const previewCard = document.getElementById('web-preview-card');
  if (previewCard) previewCard.style.display = 'none';
}

function handleConfirmPreviewImport() {
  if (!state.activeWebPreview || !state.activeWebPreview.url) return;
  handleImportSingleWebSource(state.activeWebPreview.url);
}

async function handleImportSingleWebSource(url) {
  closeWebPreview();
  await runWebIngestionPipeline(async () => {
    return await api.importWeb({ url });
  });
}

function handleDirectUrlKey(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleImportDirectUrl();
  }
}

function handlePreviewDirectUrl() {
  const input = document.getElementById('web-direct-url-input');
  const url = input ? input.value.trim() : '';
  if (!url) {
    showToast('Please enter a valid webpage URL', 'info');
    return;
  }
  handlePreviewWebSource(url);
}

function handleImportDirectUrl() {
  const input = document.getElementById('web-direct-url-input');
  const url = input ? input.value.trim() : '';
  if (!url) {
    showToast('Please enter a valid webpage URL', 'info');
    return;
  }
  handleImportSingleWebSource(url);
}

// Stateful Ingestion Pipeline Runner for Web Content
async function runWebIngestionPipeline(importFn) {
  const formEl = document.getElementById('form-add-book');
  const progressEl = document.getElementById('ingestion-progress-panel');
  const resultEl = document.getElementById('ingestion-result-panel');

  if (formEl) formEl.style.display = 'none';
  if (progressEl) progressEl.style.display = 'block';
  if (resultEl) resultEl.style.display = 'none';

  setIngestionStep('step-inspect', 'active', 'Connecting to web source & verifying protocol...');
  setIngestionStep('step-extract', 'pending', 'Awaiting HTML extractor...');
  setIngestionStep('step-structure', 'pending', 'Awaiting section parser...');
  setIngestionStep('step-canonical', 'pending', 'Awaiting canonical block compilation...');

  const t1 = setTimeout(() => {
    setIngestionStep('step-inspect', 'completed', 'Web connection verified');
    setIngestionStep('step-extract', 'active', 'Extracting article body, removing ads & navigation chrome...');
  }, 400);

  const t2 = setTimeout(() => {
    setIngestionStep('step-extract', 'completed', 'Clean article body extracted');
    setIngestionStep('step-structure', 'active', 'Detecting headings, sections, tables & quotes...');
  }, 850);

  const t3 = setTimeout(() => {
    setIngestionStep('step-structure', 'completed', 'Document hierarchy structured into chapters');
    setIngestionStep('step-canonical', 'active', 'Synthesizing canonical blocks & recording source provenance...');
  }, 1300);

  try {
    const result = await importFn();

    clearTimeout(t1);
    clearTimeout(t2);
    clearTimeout(t3);

    setIngestionStep('step-inspect', 'completed', 'Web source verified');
    setIngestionStep('step-extract', 'completed', 'Clean content extracted');
    setIngestionStep('step-structure', 'completed', `${result.chapterCount || 1} chapter(s) structured`);
    setIngestionStep('step-canonical', 'completed', 'Canonical blocks stored with full source provenance');

    state.importedBookResult = result;

    setTimeout(async () => {
      if (progressEl) progressEl.style.display = 'none';
      if (resultEl) {
        resultEl.style.display = 'block';

        const fmtBadge = document.getElementById('result-format-badge');
        const titleEl = document.getElementById('result-book-title');
        const authorEl = document.getElementById('result-book-author');
        const statChapters = document.getElementById('stat-chapters-count');
        const statPages = document.getElementById('stat-pages-count');
        const statTables = document.getElementById('stat-tables-count');
        const statWords = document.getElementById('stat-words-count');
        const previewEl = document.getElementById('result-chapter-preview');

        const book = result.book || {};
        if (fmtBadge) fmtBadge.textContent = 'WEB';
        if (titleEl) titleEl.textContent = book.title || 'Acquired Web Document';
        if (authorEl) authorEl.textContent = `by ${book.author || 'Unknown'}`;
        if (statChapters) statChapters.textContent = result.chapterCount || 1;
        if (statPages) statPages.textContent = result.pageCount || book.page_count || 1;
        if (statTables) statTables.textContent = result.tablesCount || 0;
        if (statWords) statWords.textContent = (result.totalWordCount || 0).toLocaleString();

        if (previewEl && result.chapters && result.chapters.length > 0) {
          previewEl.innerHTML = result.chapters
            .slice(0, 5)
            .map((c) => `<li>Chapter ${c.number}: ${escapeHtml(c.title || 'Untitled')} (${c.wordCount || 0} words)</li>`)
            .join('');
        }
      }

      await loadBooks();
      showToast(`Successfully acquired "${result.book?.title || 'Web Document'}" to library!`, 'success');
    }, 400);
  } catch (err) {
    clearTimeout(t1);
    clearTimeout(t2);
    clearTimeout(t3);

    if (progressEl) progressEl.style.display = 'none';
    if (formEl) formEl.style.display = 'block';

    const errorBanner = document.getElementById('web-search-error');
    if (errorBanner) {
      errorBanner.style.display = 'block';
      errorBanner.textContent = `Web acquisition error: ${err.message}`;
    }
    showToast(`Acquisition failed: ${err.message}`, 'error');
  }
}

// ==========================================================================
// SUPPORTING MATERIAL CONTROLLER (Build 3A)
// ==========================================================================

function openSupportingMaterialModal(bookId) {
  const modal = document.getElementById('supportingMaterialModal');
  const book = state.activeBook;
  const bookTitleEl = document.getElementById('supporting-modal-book-title');
  const input = document.getElementById('supporting-search-input');

  if (bookTitleEl) {
    bookTitleEl.textContent = book ? `"${book.title}"` : 'Active Book';
  }

  if (input && book) {
    input.value = book.title;
  }

  if (modal) modal.classList.remove('hidden');
  if (book) handleRunSupportingSearch();
}

function closeSupportingMaterialModal() {
  const modal = document.getElementById('supportingMaterialModal');
  if (modal) modal.classList.add('hidden');
}

function handleSupportingSearchKey(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleRunSupportingSearch();
  }
}

async function handleRunSupportingSearch() {
  const input = document.getElementById('supporting-search-input');
  const query = input ? input.value.trim() : '';
  const loading = document.getElementById('supporting-search-loading');
  const errorBanner = document.getElementById('supporting-search-error');
  const resultsContainer = document.getElementById('supporting-search-results');

  if (!query) return;

  if (loading) loading.style.display = 'flex';
  if (errorBanner) {
    errorBanner.style.display = 'none';
    errorBanner.textContent = '';
  }

  try {
    const data = await api.searchWeb(query, 'all', 6);
    renderSupportingSearchResults(data.results || []);
  } catch (err) {
    if (errorBanner) {
      errorBanner.style.display = 'block';
      errorBanner.textContent = `Search error: ${err.message}`;
    }
  } finally {
    if (loading) loading.style.display = 'none';
  }
}

function renderSupportingSearchResults(results) {
  const container = document.getElementById('supporting-search-results');
  if (!container) return;

  if (!results || results.length === 0) {
    container.innerHTML = `
      <div class="web-search-welcome-state" style="padding:20px;">
        <p>No supporting resources found for this search. Try different keywords or paste a direct URL above.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = results
    .map(
      (res) => `
    <div class="web-result-item">
      <div class="web-result-body">
        <div class="web-result-header-row">
          <span class="badge-site wiki">${escapeHtml(res.sourceSite || 'Web')}</span>
          ${res.author ? `<span style="font-size:0.76rem; color:var(--text-light);">${escapeHtml(res.author)}</span>` : ''}
        </div>
        <h4 class="web-result-title">${escapeHtml(res.title)}</h4>
        <p class="web-result-snippet">${escapeHtml(res.snippet || 'Structured supporting reference.')}</p>
        <div class="web-result-actions">
          <a href="${escapeHtml(res.url)}" target="_blank" rel="noopener noreferrer" class="web-result-ext-link">
            🔗 ${escapeHtml(res.url)} ↗
          </a>
          <button type="button" class="btn btn-primary btn-xs" onclick="handleAttachSupportingSource('${escapeHtml(res.url)}', '${escapeHtml(res.title.replace(/'/g, "\\'"))}', '${escapeHtml((res.snippet || '').replace(/'/g, "\\'"))}')">
            + Attach to Book
          </button>
        </div>
      </div>
    </div>
  `
    )
    .join('');
}

async function handleAttachSupportingSource(url, title, snippet) {
  if (!state.activeBook) return;
  try {
    showToast('Attaching supporting material...', 'info');
    await api.attachSupportingMaterial(state.activeBook.id, {
      url,
      title,
      snippet,
      sourceSite: 'Web Source',
    });

    showToast('Supporting material attached to book! Original content remains untouched.', 'success');
    closeSupportingMaterialModal();

    state.supportingMaterials = await api.getSupportingMaterials(state.activeBook.id);
    renderSupportingMaterialsList();
  } catch (err) {
    showToast(`Failed to attach supporting material: ${err.message}`, 'error');
  }
}

function handleSupportingDirectUrlKey(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleAttachDirectSupportingUrl();
  }
}

async function handleAttachDirectSupportingUrl() {
  const input = document.getElementById('supporting-direct-url');
  const url = input ? input.value.trim() : '';
  if (!url) {
    showToast('Please enter a valid webpage URL', 'info');
    return;
  }
  await handleAttachSupportingSource(url, 'Web Supporting Reference', `Extracted reference from ${url}`);
}

function handleViewSupportingMaterial(materialId) {
  const mat = (state.supportingMaterials || []).find((m) => m.id === materialId);
  if (!mat) return;

  const modal = document.getElementById('viewSupportingMaterialModal');
  document.getElementById('view-sup-title').textContent = mat.title || 'Supporting Material';
  document.getElementById('view-sup-site').textContent = mat.source_site || 'Web Source';
  document.getElementById('view-sup-author').textContent = mat.author ? `By ${mat.author}` : '';

  const linkEl = document.getElementById('view-sup-url');
  if (linkEl) {
    linkEl.href = mat.source_url || '#';
    linkEl.textContent = `🔗 ${mat.source_url || 'Original Web Source'} ↗`;
  }

  const contentEl = document.getElementById('view-sup-content');
  if (contentEl) {
    let html = '';
    if (mat.canonical_content) {
      try {
        const blocks =
          typeof mat.canonical_content === 'string' ? JSON.parse(mat.canonical_content) : mat.canonical_content;
        if (Array.isArray(blocks) && blocks.length > 0) {
          html = renderCanonicalBlocks(blocks);
        }
      } catch (e) {}
    }
    if (!html && mat.content) {
      html = `<p>${escapeHtml(mat.content).replace(/\n\n+/g, '</p><p>')}</p>`;
    }
    if (!html) {
      html = `<p class="text-muted">${escapeHtml(mat.snippet || 'No full text available for this reference.')}</p>`;
    }
    contentEl.innerHTML = html;
  }

  if (modal) modal.classList.remove('hidden');
}

function closeViewSupportingModal() {
  const modal = document.getElementById('viewSupportingMaterialModal');
  if (modal) modal.classList.add('hidden');
}

async function handleDeleteSupportingMaterial(materialId) {
  if (!confirm('Remove this supporting research reference? (The book original chapters are unaffected)')) return;
  try {
    await api.deleteSupportingMaterial(materialId);
    showToast('Supporting material removed.', 'info');
    if (state.activeBook) {
      state.supportingMaterials = await api.getSupportingMaterials(state.activeBook.id);
      renderSupportingMaterialsList();
    }
  } catch (err) {
    showToast(`Failed to delete supporting material: ${err.message}`, 'error');
  }
}

// Synopsis Synthesis
async function handleGenerateSynopsis(bookId) {
  const btn = document.getElementById('btn-hero-synopsis');
  const descEl = document.getElementById('hero-book-description');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner-xs"></div> <span>Synthesizing...</span>`;
  }

  try {
    showToast('Synthesizing editorial synopsis from book content...', 'info');
    const data = await api.generateSynopsis(bookId);
    if (descEl) descEl.textContent = data.synopsis;
    if (state.activeBook) state.activeBook.description = data.synopsis;
    showToast('Editorial synopsis synthesized successfully!', 'success');
  } catch (err) {
    showToast(`Synopsis generation failed: ${err.message}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `
        <svg class="ui-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3 1.3L21 12l-5.8-1.9a2 2 0 0 1 1.3 1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>
        </svg>
        <span>✦ Synthesize Editorial Synopsis</span>
      `;
    }
  }
}

// ==========================================================================
// SEMANTIC INTELLIGENCE & READING ASSISTANT (BUILD 3B)
// ==========================================================================
async function renderSemanticIntelligence(bookId) {
  const synopsisCard = document.getElementById('synopsis-card-content');
  const summaryCard = document.getElementById('book-summary-card-content');
  const copySynBtn = document.getElementById('btn-copy-synopsis');
  const copySumBtn = document.getElementById('btn-copy-book-summary');
  const statusPill = document.getElementById('semantic-index-status-text');
  const statsBadge = document.getElementById('semantic-chunk-stats');

  // Load semantic status
  try {
    const statusData = await api.getSemanticStatus(bookId);
    if (statusData && statsBadge) {
      statsBadge.textContent = `${statusData.totalChunks || 0} chunks indexed (${statusData.dimensions || 256}d)`;
      if (statusPill) {
        statusPill.textContent = statusData.totalChunks > 0 ? 'Vector Memory Ready' : 'Semantic Index Active';
      }
    }
  } catch (e) {
    if (statsBadge) statsBadge.textContent = 'Vector Memory Active';
  }

  // Load existing synopsis representation
  try {
    const synopsisRep = await api.getSynopsis(bookId);
    if (synopsisRep && synopsisRep.content) {
      if (synopsisCard) {
        synopsisCard.innerHTML = renderCanonicalBlocks(synopsisRep);
      }
      if (copySynBtn) copySynBtn.style.display = 'inline-block';
      state.activeSynopsis = synopsisRep.content;
    } else {
      if (synopsisCard) {
        synopsisCard.innerHTML = `<p class="text-muted italic">No editorial synopsis generated yet. Click "Synthesize Synopsis" to produce a grounded editorial overview.</p>`;
      }
      if (copySynBtn) copySynBtn.style.display = 'none';
      state.activeSynopsis = null;
    }
  } catch (e) {
    console.warn('Failed to load synopsis:', e);
  }

  // Load existing book summary representation
  try {
    const summaryRep = await api.getBookSummary(bookId);
    if (summaryRep && summaryRep.content) {
      if (summaryCard) {
        summaryCard.innerHTML = renderCanonicalBlocks(summaryRep);
      }
      if (copySumBtn) copySumBtn.style.display = 'inline-block';
      state.activeBookSummary = summaryRep.content;
    } else {
      if (summaryCard) {
        summaryCard.innerHTML = `<p class="text-muted italic">No comprehensive book summary generated yet. Click "Synthesize Book Summary" to aggregate chapter knowledge into an executive summary.</p>`;
      }
      if (copySumBtn) copySumBtn.style.display = 'none';
      state.activeBookSummary = null;
    }
  } catch (e) {
    console.warn('Failed to load book summary:', e);
  }
}

async function handleGenerateSynopsisClick() {
  if (!state.activeBook) return;
  const btn = document.getElementById('btn-generate-synopsis-card');
  const contentEl = document.getElementById('synopsis-card-content');
  const copyBtn = document.getElementById('btn-copy-synopsis');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner-xs"></div> <span>Synthesizing...</span>`;
  }

  try {
    showToast('Synthesizing editorial synopsis...', 'info');
    const data = await api.generateSynopsis(state.activeBook.id);
    const synopsis = data.synopsis || (data.representation && data.representation.content);
    if (contentEl && synopsis) {
      contentEl.innerHTML = renderCanonicalBlocks(data.representation || { content: synopsis, canonical_blocks: data.canonicalBlocks });
    }
    state.activeSynopsis = synopsis;
    if (copyBtn) copyBtn.style.display = 'inline-block';

    const descEl = document.getElementById('hero-book-description');
    if (descEl && synopsis) {
      const cleanSnippet = synopsis
        .replace(/^#+\s*.+$/gm, '')
        .replace(/^>.*$/gm, '')
        .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
        .replace(/<[^>]+>/g, '')
        .trim();
      descEl.textContent = cleanSnippet.split(/\n\n+/)[0] || cleanSnippet;
    }

    showToast('Editorial synopsis synthesized successfully!', 'success');
  } catch (err) {
    showToast(`Synopsis synthesis failed: ${err.message}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span>✦ Synthesize Synopsis</span>`;
    }
  }
}

async function handleGenerateBookSummaryClick() {
  if (!state.activeBook) return;
  const btn = document.getElementById('btn-generate-book-summary');
  const contentEl = document.getElementById('book-summary-card-content');
  const copyBtn = document.getElementById('btn-copy-book-summary');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner-xs"></div> <span>Synthesizing...</span>`;
  }

  try {
    showToast('Synthesizing comprehensive multi-chapter summary...', 'info');
    const data = await api.generateBookSummary(state.activeBook.id);
    const summary = data.summary || (data.representation && data.representation.content);
    if (contentEl && summary) {
      contentEl.innerHTML = renderCanonicalBlocks(data.representation || { content: summary, canonical_blocks: data.canonicalBlocks });
    }
    state.activeBookSummary = summary;
    if (copyBtn) copyBtn.style.display = 'inline-block';

    showToast('Comprehensive book summary synthesized and stored!', 'success');
  } catch (err) {
    showToast(`Summary synthesis failed: ${err.message}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span>✦ Synthesize Book Summary</span>`;
    }
  }
}

function copySynopsisText() {
  if (!state.activeSynopsis) return;
  navigator.clipboard.writeText(state.activeSynopsis).then(() => {
    showToast('Editorial synopsis copied to clipboard!');
  });
}

function copyBookSummaryText() {
  if (!state.activeBookSummary) return;
  navigator.clipboard.writeText(state.activeBookSummary).then(() => {
    showToast('Book summary copied to clipboard!');
  });
}

function setQuickQuery(text) {
  const input = document.getElementById('semantic-question-input');
  if (input) {
    input.value = text;
    input.focus();
  }
}

function handleSemanticQuestionKey(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleAskBookQuestion();
  }
}

async function handleAskBookQuestion() {
  if (!state.activeBook) return;
  const input = document.getElementById('semantic-question-input');
  const query = input ? input.value.trim() : '';
  if (!query) {
    showToast('Please type a question to ask this book.', 'info');
    return;
  }

  const btn = document.getElementById('btn-submit-semantic-question');
  const container = document.getElementById('semantic-answer-container');
  const textEl = document.getElementById('semantic-answer-text');
  const statsEl = document.getElementById('semantic-answer-stats');
  const sourcesEl = document.getElementById('semantic-sources-list');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner-xs"></div> <span>Thinking...</span>`;
  }

  try {
    if (container) container.style.display = 'block';
    if (textEl) textEl.innerHTML = '<span class="text-muted italic">Consulting grounded semantic chunks...</span>';

    const result = await api.askBook(state.activeBook.id, query);
    const answer = result.answer || result.result || 'No response generated.';
    if (textEl) textEl.textContent = answer;

    if (statsEl && result.metadata) {
      statsEl.textContent = `Provider: ${result.metadata.provider || 'AI'} • Duration: ${result.metadata.durationMs || 0}ms`;
    }

    if (sourcesEl) {
      const sources = result.sources || [];
      if (sources.length === 0) {
        sourcesEl.innerHTML = '<p class="text-muted text-xs">Grounded in canonical book representation.</p>';
      } else {
        sourcesEl.innerHTML = sources
          .map(
            (s, idx) => `
          <div class="semantic-source-item">
            <div class="source-item-meta">
              <span>Excerpt #${idx + 1} ${s.heading ? `• ${escapeHtml(s.heading)}` : ''}</span>
              <span class="source-item-score">Relevance: ${Math.round((s.similarity || s.score || 0.85) * 100)}%</span>
            </div>
            <div class="source-item-text">"${escapeHtml(s.content || s.text || '')}"</div>
          </div>
        `
          )
          .join('');
      }
    }
  } catch (err) {
    if (textEl) textEl.textContent = `Query error: ${err.message}`;
    showToast(`Assistant error: ${err.message}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span>Ask Assistant</span>`;
    }
  }
}

// Coming Soon Modal Handlers
function showComingSoonModal(featureName) {
  const modal = document.getElementById('comingSoonModal');
  const title = document.getElementById('coming-soon-title');
  const icon = document.getElementById('coming-soon-icon');
  const desc = document.getElementById('coming-soon-description');
  const feat1 = document.getElementById('coming-soon-feat-1');
  const feat2 = document.getElementById('coming-soon-feat-2');
  const feat3 = document.getElementById('coming-soon-feat-3');

  if (title) title.textContent = `${featureName} Experience`;

  if (featureName === 'Visual Story') {
    if (icon) icon.textContent = '🎨';
    if (desc)
      desc.textContent =
        'Visual Story mode transforms structured canonical chapters into cinematic, scene-by-scene illustrated narrative flows powered by semantic chunking and visual context generation.';
    if (feat1) feat1.textContent = 'Semantic narrative segmentation into visual beats';
    if (feat2) feat2.textContent = 'Contextual character and scenery illustration prompts';
    if (feat3) feat3.textContent = 'Side-by-side synchronized narrative text and visual art';
  } else {
    if (icon) icon.textContent = '🎬';
    if (desc)
      desc.textContent =
        'Interactive Video mode provides synchronized multimedia walkthroughs, highlighting key narrative inflection points with dynamic visual and auditory pace guidance.';
    if (feat1) feat1.textContent = 'Timeline synchronization with canonical chapter paragraphs';
    if (feat2) feat2.textContent = 'Dynamic audio-visual pacing and auto-scrolling narrator mode';
    if (feat3) feat3.textContent = 'Key concept callouts and interactive checkpoint bookmarks';
  }

  if (modal) modal.classList.remove('hidden');
}

function closeComingSoonModal() {
  const modal = document.getElementById('comingSoonModal');
  if (modal) modal.classList.add('hidden');
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
