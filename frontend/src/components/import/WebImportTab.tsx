import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  CheckSquare,
  Square,
  ExternalLink,
  Sparkles,
  Link2,
  Plus,
  Compass,
  BookmarkPlus,
} from 'lucide-react';
import { Modal } from '../shared/Modal';
import { apiClient } from '../../api/client';
import { useImportQueueStore } from '../../store/useImportQueueStore';
import { Book } from '../../types/domain';

interface SearchResult {
  id: string;
  title: string;
  url: string;
  sourceSite: string;
  sourceType: string;
  snippet: string;
  author: string | null;
  publishedDate: string | null;
  isAccessible: boolean;
}

interface WebSearchResponse {
  success: boolean;
  results: SearchResult[];
  count: number;
}

interface WebPreviewResponse {
  success: boolean;
  preview: {
    url: string;
    finalUrl: string;
    metadata: {
      title?: string;
      siteName?: string;
      author?: string;
      description?: string;
      wordCount?: number;
    };
    chaptersCount: number;
    detectedChapters: { number: number; title: string; wordCount: number }[];
    snippet: string;
    wordCount: number;
  };
}

interface WebImportTabProps {
  onSuccess: (book: Book) => void;
}

const CATEGORIES = [
  { key: 'all', label: 'All Sources' },
  { key: 'research', label: 'Research & arXiv' },
  { key: 'books', label: 'Books & Classics' },
  { key: 'tech', label: 'Tech & RFCs' },
  { key: 'reference', label: 'Reference & Wiki' },
] as const;

type Category = (typeof CATEGORIES)[number]['key'];

const POPULAR_TOPICS = [
  'Continuous Attractors',
  'Distributed Consensus',
  'Neural Dynamics',
  'Quantum Computing',
  'Compiler Architecture',
  'Frankenstein',
  'Relativity',
];

export function WebImportTab({ onSuccess }: WebImportTabProps) {
  const { enqueueWeb, enqueueWebMulti } = useImportQueueStore();

  const [mode, setMode] = useState<'search' | 'url'>('search');

  // Search state
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewItem, setPreviewItem] = useState<SearchResult | null>(null);
  const [enqueuingId, setEnqueuingId] = useState<string | null>(null);

  // Direct URL state
  const [directUrl, setDirectUrl] = useState('');
  const [inspectingUrl, setInspectingUrl] = useState(false);
  const [urlPreview, setUrlPreview] = useState<WebPreviewResponse['preview'] | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [customTitle, setCustomTitle] = useState('');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const doSearch = useCallback(async (q: string, cat: Category) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setResults([]);
      setSearched(false);
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setSearched(true);
    setSelected(new Set());

    try {
      const params = new URLSearchParams({ q: trimmed, limit: '14' });
      if (cat !== 'all') params.set('category', cat);
      const data = await apiClient<WebSearchResponse>(`/api/web/search?${params.toString()}`);
      setResults(data.results ?? []);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void doSearch(query, category);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, category, doSearch]);

  const handleCategoryChange = (cat: Category) => {
    setCategory(cat);
    void doSearch(query, cat);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  // Enqueue single search item
  const handleEnqueueSingle = async (item: SearchResult) => {
    setEnqueuingId(item.id);
    try {
      const task = await enqueueWeb({
        url: item.url,
        title: item.title,
        author: item.author || undefined,
        description: item.snippet,
        contentType: item.sourceType === 'research' ? 'research' : 'web',
      });
      onSuccess({
        id: task.bookId || `pending-${task.id}`,
        title: item.title,
        author: item.author || 'Web Author',
        description: item.snippet,
        contentType: item.sourceType === 'research' ? 'research' : 'web',
        chapterCount: 1,
        readChapterCount: 0,
        wordCount: 0,
        hasSmartContent: false,
        sourceFormat: 'web',
      });
    } catch (err) {
      console.error('Enqueue error:', err);
    } finally {
      setEnqueuingId(null);
    }
  };

  // Enqueue multi selection as a dossier
  const handleEnqueueSelectedBatch = async () => {
    if (selected.size === 0) return;
    const selectedItems = results.filter((r) => selected.has(r.id));
    const sources = selectedItems.map((r) => ({ url: r.url, title: r.title }));

    try {
      const dossierTitle = `${query.trim() || 'Web'} Research Dossier (${sources.length} Sources)`;
      const task = await enqueueWebMulti({
        sources,
        title: dossierTitle,
        description: `Curated multi-source dossier containing ${sources.length} online articles and papers.`,
      });

      onSuccess({
        id: task.bookId || `pending-${task.id}`,
        title: dossierTitle,
        author: 'Multiple Web Contributors',
        description: `Research dossier containing ${sources.length} sources`,
        contentType: 'research',
        chapterCount: sources.length,
        readChapterCount: 0,
        wordCount: 0,
        hasSmartContent: false,
        sourceFormat: 'web',
      });
    } catch (err) {
      console.error('Batch enqueue error:', err);
    }
  };

  // Direct URL Inspection
  const handleInspectUrl = async () => {
    if (!directUrl.trim()) return;
    setInspectingUrl(true);
    setUrlError(null);
    setUrlPreview(null);

    try {
      const res = await apiClient<WebPreviewResponse>('/api/web/preview', {
        method: 'POST',
        body: JSON.stringify({ url: directUrl.trim() }),
      });
      setUrlPreview(res.preview);
      setCustomTitle(res.preview.metadata?.title || '');
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : 'Failed to inspect web URL.');
    } finally {
      setInspectingUrl(false);
    }
  };

  const handleEnqueueDirectUrl = async () => {
    if (!directUrl.trim()) return;
    try {
      const titleToUse = customTitle.trim() || urlPreview?.metadata?.title || directUrl.trim();
      const task = await enqueueWeb({
        url: directUrl.trim(),
        title: titleToUse,
        author: urlPreview?.metadata?.author,
        description: urlPreview?.snippet,
      });

      onSuccess({
        id: task.bookId || `pending-${task.id}`,
        title: titleToUse,
        author: urlPreview?.metadata?.author || 'Web Author',
        description: urlPreview?.snippet || '',
        contentType: 'web',
        chapterCount: urlPreview?.chaptersCount || 1,
        readChapterCount: 0,
        wordCount: urlPreview?.wordCount || 0,
        hasSmartContent: false,
        sourceFormat: 'web',
      });
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : 'Failed to enqueue web import.');
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-24">
      {/* ── Mode Switcher ── */}
      <div className="flex items-center gap-2 border-b border-line pb-3">
        <button
          type="button"
          onClick={() => setMode('search')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-ui-sm font-medium transition-colors ${
            mode === 'search'
              ? 'bg-brand/10 text-brand'
              : 'text-ink-muted hover:text-ink hover:bg-subtle'
          }`}
        >
          <Compass className="w-4 h-4" />
          <span>Search & Discover</span>
        </button>

        <button
          type="button"
          onClick={() => setMode('url')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-ui-sm font-medium transition-colors ${
            mode === 'url'
              ? 'bg-brand/10 text-brand'
              : 'text-ink-muted hover:text-ink hover:bg-subtle'
          }`}
        >
          <Link2 className="w-4 h-4" />
          <span>Direct Webpage URL</span>
        </button>
      </div>

      {/* ── MODE: SEARCH & DISCOVER ── */}
      {mode === 'search' && (
        <div className="space-y-4">
          {/* Search bar */}
          <div className="relative">
            <Search
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search research papers on arXiv, books on Project Gutenberg & OpenLibrary, Wikipedia topics, RFCs…"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-line bg-panel text-ink text-ui-sm placeholder:text-ink-muted focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand shadow-xs transition-all"
            />
          </div>

          {/* Popular Topic Pills */}
          {!searched && (
            <div className="space-y-2">
              <span className="text-caption text-ink-muted font-medium flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-brand" />
                <span>Suggested topics:</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {POPULAR_TOPICS.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => {
                      setQuery(topic);
                      void doSearch(topic, category);
                    }}
                    className="px-2.5 py-1 rounded-full text-caption border border-line bg-card hover:bg-subtle text-ink-muted hover:text-ink transition-colors"
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Category Chips */}
          <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Filter by source category">
            {CATEGORIES.map((cat) => {
              const isCurrent = category === cat.key;
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => handleCategoryChange(cat.key)}
                  className={`px-3 py-1 rounded-full text-caption font-medium transition-all select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                    isCurrent
                      ? 'border border-brand text-brand bg-brand/10 shadow-xs'
                      : 'border border-line text-ink-muted hover:text-ink hover:bg-subtle'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Results Area */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-line bg-card p-4 flex flex-col gap-2 animate-pulse">
                  <div className="h-4 bg-subtle rounded w-3/4" />
                  <div className="h-3 bg-subtle rounded w-1/3" />
                  <div className="h-3 bg-subtle rounded w-full" />
                  <div className="h-3 bg-subtle rounded w-5/6" />
                </div>
              ))}
            </div>
          ) : searched && results.length === 0 ? (
            <div className="text-center py-12 text-ink-muted space-y-2">
              <p className="text-ui-sm">No results found for "{query}".</p>
              <p className="text-caption">Try adjusting your query or check the Direct URL import tab.</p>
            </div>
          ) : results.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="list">
              {results.map((item) => {
                const isSelected = selected.has(item.id);
                const isEnqueuing = enqueuingId === item.id;

                return (
                  <div
                    key={item.id}
                    role="listitem"
                    className={`relative rounded-xl border p-4 flex flex-col justify-between gap-3 transition-all ${
                      isSelected
                        ? 'border-brand bg-brand/5 shadow-xs ring-1 ring-brand'
                        : 'border-line bg-card hover:border-brand/40 hover:bg-subtle/30 shadow-xs'
                    }`}
                  >
                    <div className="space-y-2">
                      {/* Top row: Checkbox + Source Attribution */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-caption text-ink-muted font-medium truncate">
                          <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-mono bg-subtle text-ink truncate">
                            {item.sourceSite}
                          </span>
                          {item.author && (
                            <span className="truncate text-ink-muted">· {item.author}</span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleSelect(item.id)}
                          className="text-ink-muted hover:text-brand transition-colors p-0.5"
                          title={isSelected ? 'Deselect' : 'Select for multi-import'}
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-brand" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </div>

                      {/* Title */}
                      <h4 className="text-ui-sm font-semibold text-ink line-clamp-2" title={item.title}>
                        {item.title}
                      </h4>

                      {/* Snippet */}
                      {item.snippet && (
                        <p className="text-caption text-ink-muted line-clamp-2 leading-relaxed">
                          {item.snippet}
                        </p>
                      )}
                    </div>

                    {/* Footer Actions */}
                    <div className="flex items-center justify-between pt-2 border-t border-line/60">
                      <button
                        type="button"
                        onClick={() => setPreviewItem(item)}
                        className="text-caption text-accent-ink hover:underline inline-flex items-center gap-1 font-medium"
                      >
                        Preview
                      </button>

                      <button
                        type="button"
                        disabled={isEnqueuing}
                        onClick={() => void handleEnqueueSingle(item)}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-brand text-white text-caption font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{isEnqueuing ? 'Enqueued…' : 'Add to Queue'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* Sticky selection bar when items are selected */}
          {selected.size > 0 && (
            <div
              className="fixed bottom-0 left-0 right-0 z-30 border-t border-line bg-panel/95 backdrop-blur-md px-6 py-4 flex items-center justify-between gap-4 shadow-lg"
              role="region"
              aria-label="Selection bar"
            >
              <span className="text-ui-sm text-ink-muted">
                <strong className="text-ink">{selected.size}</strong>{' '}
                {selected.size === 1 ? 'source' : 'sources'} selected
              </span>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={clearSelection}
                  className="px-3 py-1.5 rounded-lg border border-line bg-card hover:bg-subtle text-ink-muted text-ui-sm transition-colors"
                >
                  Clear
                </button>

                <button
                  type="button"
                  onClick={() => void handleEnqueueSelectedBatch()}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-brand text-white font-medium text-ui-sm hover:opacity-90 shadow-md shadow-brand/20 transition-all select-none"
                >
                  <BookmarkPlus className="w-4 h-4" />
                  <span>Enqueue Selected ({selected.size}) into Dossier</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MODE: DIRECT URL IMPORT ── */}
      {mode === 'url' && (
        <div className="max-w-xl mx-auto space-y-4">
          <div className="space-y-1">
            <h3 className="font-display font-medium text-lg text-ink">Import from Web Address</h3>
            <p className="text-ui-sm text-ink-muted">
              Enter any accessible web URL (article, documentation, Wikipedia, or research post).
            </p>
          </div>

          <div className="flex gap-2">
            <input
              type="url"
              value={directUrl}
              onChange={(e) => setDirectUrl(e.target.value)}
              placeholder="https://example.com/research-article"
              required
              className="flex-1 px-3.5 py-2.5 rounded-lg border border-line bg-panel text-ink text-ui-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
            <button
              type="button"
              disabled={!directUrl.trim() || inspectingUrl}
              onClick={() => void handleInspectUrl()}
              className="px-4 py-2.5 rounded-lg bg-card border border-line hover:bg-subtle text-ink font-medium text-ui-sm transition-colors disabled:opacity-40"
            >
              {inspectingUrl ? 'Inspecting…' : 'Inspect'}
            </button>
          </div>

          {urlError && <p className="text-ui-sm text-err">{urlError}</p>}

          {/* Inspected Preview Card */}
          {urlPreview && (
            <div className="rounded-xl border border-line bg-panel p-5 space-y-4 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[11px] font-mono uppercase bg-subtle text-ink">
                  {urlPreview.metadata.siteName || 'Web Article'}
                </span>
                <span className="text-caption text-ink-muted">· {urlPreview.wordCount.toLocaleString()} words</span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-caption font-medium text-ink-muted">Title:</label>
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-line bg-card text-ink text-ui-sm"
                />
              </div>

              {urlPreview.snippet && (
                <p className="text-caption text-ink-muted leading-relaxed italic border-l-2 border-brand pl-3">
                  "{urlPreview.snippet}"
                </p>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => void handleEnqueueDirectUrl()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand text-white font-medium hover:opacity-90 shadow-sm transition-opacity"
                >
                  <Plus className="w-4 h-4" />
                  <span>Enqueue Webpage</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Preview Modal ── */}
      <Modal
        open={previewItem !== null}
        onClose={() => setPreviewItem(null)}
        title={previewItem?.title ?? ''}
        description={previewItem?.sourceSite}
        size="lg"
        footer={
          previewItem && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (previewItem) {
                    void handleEnqueueSingle(previewItem);
                    setPreviewItem(null);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-brand text-white font-medium text-ui-sm hover:opacity-90 transition-opacity"
              >
                <Plus className="w-4 h-4" />
                <span>Add to Queue</span>
              </button>

              <a
                href={previewItem.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-line bg-card text-ink text-ui-sm hover:bg-subtle transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open original</span>
              </a>
            </div>
          )
        }
      >
        {previewItem && (
          <div className="flex flex-col gap-3 text-ui-sm text-ink">
            <div className="flex items-center gap-2 text-caption text-ink-muted">
              <span>{previewItem.sourceSite}</span>
              {previewItem.author && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{previewItem.author}</span>
                </>
              )}
              {previewItem.publishedDate && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{previewItem.publishedDate}</span>
                </>
              )}
            </div>
            <p className="leading-relaxed text-ink/90">{previewItem.snippet || 'No preview available.'}</p>
            <a
              href={previewItem.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-caption text-accent-ink underline break-all hover:opacity-80"
            >
              {previewItem.url}
            </a>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default WebImportTab;
