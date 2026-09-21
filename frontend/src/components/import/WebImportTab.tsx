import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Globe, BookOpen, FileText, X, CheckSquare, Square, ExternalLink } from 'lucide-react';
import { Modal } from '../shared/Modal';
import { apiClient } from '../../api/client';
import { normalizeBook, RawBook, type Book, type RawJob } from '../../types/domain';

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

interface WebImportResponse {
  success: boolean;
  book: RawBook;
  job?: RawJob;
}

interface WebImportTabProps {
  onSuccess: (book: Book) => void;
}

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'books', label: 'Books' },
  { key: 'research', label: 'Research' },
  { key: 'reference', label: 'Reference' },
  { key: 'tech', label: 'Tech' },
  { key: 'manga', label: 'Manga' },
] as const;

type Category = (typeof CATEGORIES)[number]['key'];

function SourceTypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'book':
      return <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />;
    case 'research':
    case 'academic':
      return <FileText className="w-3.5 h-3.5" aria-hidden="true" />;
    default:
      return <Globe className="w-3.5 h-3.5" aria-hidden="true" />;
  }
}

function SkeletonCard() {
  return (
    <div className="rounded-lg border border-line bg-card p-4 flex flex-col gap-2 animate-pulse">
      <div className="h-4 bg-subtle rounded w-3/4" />
      <div className="h-3 bg-subtle rounded w-1/3" />
      <div className="h-3 bg-subtle rounded w-full" />
      <div className="h-3 bg-subtle rounded w-5/6" />
    </div>
  );
}

export function WebImportTab({ onSuccess }: WebImportTabProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewItem, setPreviewItem] = useState<SearchResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const doSearch = useCallback(async (q: string, cat: Category) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setResults([]);
      setSearched(false);
      return;
    }

    // Cancel any in-flight request
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setSearched(true);
    setSelected(new Set());

    try {
      const params = new URLSearchParams({ q: trimmed, limit: '12' });
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

  // Debounce query input (300 ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void doSearch(query, category);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  // Category change triggers immediately
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

  const handleImport = async () => {
    if (selected.size === 0 || importing) return;

    const sources = results
      .filter((r) => selected.has(r.id))
      .map((r) => ({ url: r.url, title: r.title }));

    setImporting(true);
    setImportError(null);

    try {
      const data = await apiClient<WebImportResponse>('/api/web/import-multi', {
        method: 'POST',
        body: JSON.stringify({ sources }),
      });

      if (!data.book) {
        setImportError('Server did not return a book record.');
        return;
      }

      const book = normalizeBook(data.book);
      onSuccess(book);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  const selectedCount = selected.size;

  return (
    <div className="flex flex-col gap-4 pb-24">
      {/* Search bar */}
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search books, papers, Wikipedia articles…"
          aria-label="Search the web"
          className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-line bg-card text-ink text-ui-sm placeholder:text-ink-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-shadow"
        />
      </div>

      {/* Category chips */}
      <div
        className="flex items-center gap-2 flex-wrap"
        role="group"
        aria-label="Filter by category"
      >
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            type="button"
            onClick={() => handleCategoryChange(cat.key)}
            aria-pressed={category === cat.key}
            className={`px-3 py-1 rounded-full text-caption font-medium transition-colors select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              category === cat.key
                ? 'bg-brand text-white'
                : 'bg-subtle text-ink-muted hover:bg-subtle/80 hover:text-ink border border-line'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Results area */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" aria-label="Loading results">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : searched && results.length === 0 ? (
        <p className="text-ui-sm text-ink-muted text-center py-8">
          No results found. Try a different search term.
        </p>
      ) : results.length > 0 ? (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 gap-3"
          role="list"
          aria-label="Search results"
        >
          {results.map((item) => {
            const isSelected = selected.has(item.id);
            return (
              <div
                key={item.id}
                role="listitem"
                className={`relative rounded-lg border p-4 flex flex-col gap-2 cursor-pointer transition-all focus-within:ring-2 focus-within:ring-accent ${
                  isSelected
                    ? 'border-brand bg-brand/5 shadow-sm'
                    : 'border-line bg-card hover:border-line-strong hover:bg-subtle/40'
                }`}
                onClick={() => toggleSelect(item.id)}
              >
                {/* Checkbox indicator */}
                <div className="absolute top-3 right-3 text-brand">
                  {isSelected ? (
                    <CheckSquare className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <Square className="w-4 h-4 text-ink-muted" aria-hidden="true" />
                  )}
                </div>

                {/* Source badge */}
                <div className="flex items-center gap-1.5 text-caption text-ink-muted pr-6">
                  <SourceTypeIcon type={item.sourceType} />
                  <span className="truncate">{item.sourceSite}</span>
                  {item.author && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="truncate">{item.author}</span>
                    </>
                  )}
                </div>

                {/* Title */}
                <p className="text-ui-sm font-medium text-ink line-clamp-2 pr-6">{item.title}</p>

                {/* Snippet */}
                {item.snippet && (
                  <p className="text-caption text-ink-muted line-clamp-2">{item.snippet}</p>
                )}

                {/* Footer: preview link */}
                <div className="flex items-center justify-between pt-1">
                  {item.publishedDate && (
                    <span className="text-caption text-ink-muted">
                      {new Date(item.publishedDate).getFullYear()}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewItem(item);
                    }}
                    className="ml-auto text-caption text-accent-ink hover:underline inline-flex items-center gap-1 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                    aria-label={`Preview ${item.title}`}
                  >
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    Preview
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Import error */}
      {importError && (
        <p role="alert" className="text-ui-sm text-err text-center">
          {importError}
        </p>
      )}

      {/* Sticky bottom bar (shown when items are selected) */}
      {selectedCount > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-30 border-t border-line bg-panel/95 backdrop-blur-sm px-6 py-4 flex items-center justify-between gap-4"
          role="region"
          aria-label="Selection bar"
        >
          <span className="text-ui-sm text-ink-muted select-none">
            <strong className="text-ink">{selectedCount}</strong>{' '}
            {selectedCount === 1 ? 'source' : 'sources'} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={clearSelection}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-ui-sm border border-line bg-card hover:bg-subtle text-ink-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent select-none"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
              Clear
            </button>
            <button
              type="button"
              onClick={() => void handleImport()}
              disabled={importing}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-md bg-brand text-white font-medium text-ui-sm hover:opacity-90 transition-opacity disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent select-none"
            >
              {importing ? 'Importing…' : `Import ${selectedCount}`}
            </button>
          </div>
        </div>
      )}

      {/* Preview modal */}
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
                  if (previewItem) toggleSelect(previewItem.id);
                  setPreviewItem(null);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-brand text-white font-medium text-ui-sm hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-accent select-none"
              >
                {previewItem && selected.has(previewItem.id) ? 'Deselect' : 'Select for import'}
              </button>
              <a
                href={previewItem.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-line bg-card text-ink text-ui-sm hover:bg-subtle transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent select-none"
              >
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                Open source
              </a>
            </div>
          )
        }
      >
        {previewItem && (
          <div className="flex flex-col gap-3 text-ui-sm text-ink">
            <div className="flex items-center gap-2 text-caption text-ink-muted">
              <SourceTypeIcon type={previewItem.sourceType} />
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
                  <span>{new Date(previewItem.publishedDate).getFullYear()}</span>
                </>
              )}
            </div>
            <p className="text-ink leading-relaxed">{previewItem.snippet || 'No preview available for this source.'}</p>
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
