import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Search, AlertCircle, RotateCw, CheckSquare, Plus } from 'lucide-react';
import { useBooks } from '../hooks/useBooks';
import { BookGrid } from '../components/library/BookGrid';
import { FilterChips, FilterOption } from '../components/library/FilterChips';
import { SearchField } from '../components/shared/SearchField';
import { EmptyState } from '../components/shared/EmptyState';
import { useLibraryStore } from '../store/useLibraryStore';

export const LibraryRoute: React.FC = () => {
  const navigate = useNavigate();
  const { books, isLoading, isError, error, refetch } = useBooks();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const {
    searchQuery,
    setSearchQuery,
    filterType,
    setFilterType,
    selectionMode,
    setSelectionMode,
    selectedBookIds,
    toggleBookSelection,
    clearSelection,
  } = useLibraryStore();

  // Filter options with dynamic counts
  const filterOptions: FilterOption[] = useMemo(() => {
    const total = books.length;
    const novels = books.filter((b) => b.contentType === 'novel').length;
    const web = books.filter((b) => b.sourceFormat === 'web' || b.sourceSite).length;
    const docs = books.filter((b) => b.contentType === 'document' || b.contentType === 'textbook').length;

    return [
      { value: 'all', label: 'All Books', count: total },
      { value: 'novel', label: 'Novels', count: novels },
      { value: 'web', label: 'Web & Articles', count: web },
      { value: 'document', label: 'Documents', count: docs },
    ];
  }, [books]);

  // Top 8 tags across the collection sorted by frequency
  const topTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of books) {
      if (b.classification && Array.isArray(b.classification.tags)) {
        for (const tag of b.classification.tags) {
          if (tag) {
            counts.set(tag, (counts.get(tag) || 0) + 1);
          }
        }
      }
    }
    if (counts.size === 0) return [];
    return Array.from(counts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
      .slice(0, 8);
  }, [books]);

  // Filtered books based on search, content type, and tags (AND combination)
  const filteredBooks = useMemo(() => {
    let list = books;

    // Filter by type
    if (filterType !== 'all') {
      if (filterType === 'web') {
        list = list.filter((b) => b.sourceFormat === 'web' || b.sourceSite);
      } else if (filterType === 'document') {
        list = list.filter((b) => b.contentType === 'document' || b.contentType === 'textbook');
      } else {
        list = list.filter((b) => b.contentType === filterType);
      }
    }

    // Filter by tags (AND combination)
    if (selectedTags.length > 0) {
      list = list.filter((b) => {
        const bookTags = b.classification?.tags || [];
        return selectedTags.every((st) => bookTags.includes(st));
      });
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          (b.author && b.author.toLowerCase().includes(q)) ||
          (b.description && b.description.toLowerCase().includes(q))
      );
    }

    return list;
  }, [books, filterType, selectedTags, searchQuery]);

  const handleClearFilters = () => {
    setSearchQuery('');
    setFilterType('all');
    setSelectedTags([]);
  };

  return (
    <div className="space-y-6">
      {/* Page Header: Title + Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-h1 font-bold text-ink tracking-tight">
            Library
          </h1>
          <p className="text-caption text-ink-muted mt-1">
            {isLoading
              ? 'Loading collection…'
              : `${filteredBooks.length} ${filteredBooks.length === 1 ? 'item' : 'items'} in your collection`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {books.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectionMode(!selectionMode)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-ui-sm font-medium rounded-md border transition-colors select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                selectionMode
                  ? 'bg-accent text-white border-accent'
                  : 'bg-card text-ink-muted border-line hover:bg-subtle hover:text-ink'
              }`}
            >
              <CheckSquare className="w-4 h-4" aria-hidden="true" />
              <span>{selectionMode ? 'Done' : 'Select'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => navigate('/import')}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-ui-sm font-medium rounded-md bg-brand text-white hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-accent select-none shadow-sm"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Add Book</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      {books.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <SearchField
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search title, author, description…"
            />

            <FilterChips
              options={filterOptions}
              value={filterType}
              onChange={(val) => setFilterType(val as string)}
            />
          </div>

          {/* Tags Filter Row (only rendered when tags exist in collection) */}
          {topTags.length > 0 && (
            <div
              role="toolbar"
              aria-label="Filter by tags"
              className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none min-h-[32px]"
            >
              <span className="text-caption text-ink-muted font-medium mr-1 shrink-0 select-none">
                Tags:
              </span>
              {topTags.map(({ tag, count }) => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() =>
                      setSelectedTags((prev) =>
                        prev.includes(tag)
                          ? prev.filter((t) => t !== tag)
                          : [...prev, tag]
                      )
                    }
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-caption font-medium transition-all whitespace-nowrap select-none border focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      isSelected
                        ? 'bg-accent-wash text-accent-ink border-accent/40 shadow-xs'
                        : 'bg-subtle text-ink-muted border-transparent hover:bg-card hover:text-ink hover:border-line'
                    }`}
                  >
                    <span>{tag}</span>
                    <span className="text-[10px] opacity-70">({count})</span>
                  </button>
                );
              })}
              {selectedTags.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedTags([])}
                  className="text-caption text-ink-muted hover:text-ink underline ml-1.5 shrink-0 select-none"
                >
                  Clear tags
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Selection Action Bar (when selectionMode is active) */}
      {selectionMode && selectedBookIds.length > 0 && (
        <div
          role="region"
          aria-label="Selection toolbar"
          className="flex items-center justify-between p-3 rounded-md bg-accent-wash border border-accent text-ink-muted text-ui-sm animate-fade-in"
        >
          <span className="font-medium text-ink">
            {selectedBookIds.length} {selectedBookIds.length === 1 ? 'book' : 'books'} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={clearSelection}
              className="px-2.5 py-1 text-xs font-medium rounded text-ink-muted hover:text-ink hover:bg-subtle"
            >
              Deselect all
            </button>
          </div>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="rounded-md border border-err/30 bg-err/10 p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-err shrink-0" aria-hidden="true" />
            <div>
              <p className="text-ui-sm font-semibold text-ink">Failed to load library</p>
              <p className="text-caption text-ink-muted">
                {error?.message || 'A network error occurred while connecting to the server.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-brand text-white hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-accent shrink-0"
          >
            <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Book Grid / States */}
      <BookGrid
        books={filteredBooks}
        loading={isLoading}
        error={isError ? error : null}
        onRetry={() => refetch()}
        selectionMode={selectionMode}
        selectedIds={selectedBookIds}
        onSelect={toggleBookSelection}
        emptyState={
          books.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="Your library is empty"
              body="Import your books, papers, or articles to begin reading and researching."
              action={{
                label: 'Import a book',
                onClick: () => navigate('/import'),
              }}
            />
          ) : (
            <EmptyState
              icon={Search}
              title="No matching books found"
              body={`No books match your current filters and search for "${searchQuery}".`}
              action={{
                label: 'Clear search and filters',
                onClick: handleClearFilters,
              }}
            />
          )
        }
      />
    </div>
  );
};