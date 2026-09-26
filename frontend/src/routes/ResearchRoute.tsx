import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Compass,
  Search,
  AlertCircle,
  RotateCw,
  Plus,
  FileText,
  Globe,
  Layers,
} from 'lucide-react';
import { apiClient } from '../api/client';
import { Book, RawBook, normalizeBook } from '../types/domain';
import { FilterChips, FilterOption } from '../components/library/FilterChips';
import { SearchField } from '../components/shared/SearchField';
import { EmptyState } from '../components/shared/EmptyState';

interface BooksApiResponse {
  books: RawBook[];
}

export function ResearchRoute() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [formatFilter, setFormatFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  // Fetch all source items from Research endpoint
  const {
    data: sources = [],
    isLoading: isSourcesLoading,
    isError: isSourcesError,
    error: sourcesError,
    refetch: refetchSources,
  } = useQuery<Book[], Error>({
    queryKey: ['sources'],
    queryFn: async () => {
      const res = await apiClient<BooksApiResponse>('/api/books/sources');
      return (res.books || []).map(normalizeBook);
    },
  });

  // Fetch Library books to identify synthesized books vs unsynthesized sources
  const {
    data: libraryIds = new Set<string>(),
    isLoading: isLibraryLoading,
    refetch: refetchLibrary,
  } = useQuery<Set<string>, Error>({
    queryKey: ['books'],
    queryFn: async () => {
      const res = await apiClient<BooksApiResponse>('/api/books');
      return new Set((res.books || []).map((b) => b.id));
    },
  });

  const isLoading = isSourcesLoading || isLibraryLoading;

  // Format filter options
  const formatOptions: FilterOption[] = useMemo(() => {
    const total = sources.length;
    const pdfs = sources.filter((s) => s.sourceFormat === 'pdf').length;
    const epubs = sources.filter((s) => s.sourceFormat === 'epub').length;
    const web = sources.filter((s) => s.sourceFormat === 'web' || s.sourceSite).length;
    const text = sources.filter((s) => s.sourceFormat === 'paste' || s.sourceFormat === 'text').length;

    return [
      { value: 'all', label: 'All Formats', count: total },
      { value: 'pdf', label: 'PDF', count: pdfs },
      { value: 'epub', label: 'EPUB', count: epubs },
      { value: 'web', label: 'Web', count: web },
      { value: 'paste', label: 'Pasted / Text', count: text },
    ];
  }, [sources]);

  // Source type filter options
  const typeOptions: FilterOption[] = useMemo(() => {
    const dossiers = sources.filter(
      (s) => s.sourceSite === 'Multi-Source Dossier' || s.id.startsWith('book-dossier-')
    ).length;
    const single = sources.length - dossiers;

    return [
      { value: 'all', label: 'All Types', count: sources.length },
      { value: 'dossier', label: 'Dossiers', count: dossiers },
      { value: 'single', label: 'Single Items', count: single },
    ];
  }, [sources]);

  // Filtered source list
  const filteredSources = useMemo(() => {
    let list = sources;

    // Filter by format
    if (formatFilter !== 'all') {
      if (formatFilter === 'web') {
        list = list.filter((s) => s.sourceFormat === 'web' || s.sourceSite);
      } else if (formatFilter === 'paste') {
        list = list.filter((s) => s.sourceFormat === 'paste' || s.sourceFormat === 'text');
      } else {
        list = list.filter((s) => s.sourceFormat === formatFilter);
      }
    }

    // Filter by type
    if (typeFilter !== 'all') {
      if (typeFilter === 'dossier') {
        list = list.filter(
          (s) => s.sourceSite === 'Multi-Source Dossier' || s.id.startsWith('book-dossier-')
        );
      } else {
        list = list.filter(
          (s) => s.sourceSite !== 'Multi-Source Dossier' && !s.id.startsWith('book-dossier-')
        );
      }
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          (s.author && s.author.toLowerCase().includes(q)) ||
          (s.sourceSite && s.sourceSite.toLowerCase().includes(q))
      );
    }

    return list;
  }, [sources, formatFilter, typeFilter, searchQuery]);

  // Group into dossiers vs single items
  const { dossiers, singleSources } = useMemo(() => {
    const d: Book[] = [];
    const s: Book[] = [];
    for (const item of filteredSources) {
      if (item.sourceSite === 'Multi-Source Dossier' || item.id.startsWith('book-dossier-')) {
        d.push(item);
      } else {
        s.push(item);
      }
    }
    return { dossiers: d, singleSources: s };
  }, [filteredSources]);

  const handleClearFilters = () => {
    setSearchQuery('');
    setFormatFilter('all');
    setTypeFilter('all');
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-h1 font-bold text-ink tracking-tight flex items-center gap-2.5">
            <Compass className="w-7 h-7 text-accent" aria-hidden="true" />
            <span>Research</span>
          </h1>
          <p className="text-caption text-ink-muted mt-1">
            {isLoading
              ? 'Loading source collection…'
              : `${filteredSources.length} original source ${
                  filteredSources.length === 1 ? 'item' : 'items'
                } in repository`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate('/import')}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-ui-sm font-medium rounded-md bg-brand text-white hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-accent select-none shadow-sm"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>Import Source</span>
        </button>
      </div>

      {/* Search and Filters Toolbar */}
      {sources.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <SearchField
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search sources by title, author, or domain…"
            />

            <div className="flex flex-wrap items-center gap-2">
              <FilterChips
                options={formatOptions}
                value={formatFilter}
                onChange={(val) => setFormatFilter(val as string)}
              />
              <FilterChips
                options={typeOptions}
                value={typeFilter}
                onChange={(val) => setTypeFilter(val as string)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {isSourcesError && (
        <div className="rounded-md border border-err/30 bg-err/10 p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-err shrink-0" aria-hidden="true" />
            <div>
              <p className="text-ui-sm font-semibold text-ink">Failed to load research sources</p>
              <p className="text-caption text-ink-muted">
                {sourcesError?.message || 'A network error occurred while connecting to the server.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              refetchSources();
              refetchLibrary();
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md bg-brand text-white hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-accent shrink-0"
          >
            <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && sources.length === 0 && (
        <EmptyState
          icon={Compass}
          title="No research sources"
          body="Import original PDFs, articles, or multi-source dossiers to populate your research archives."
          action={{
            label: 'Import a source',
            onClick: () => navigate('/import'),
          }}
        />
      )}

      {/* No Search Matches */}
      {!isLoading && sources.length > 0 && filteredSources.length === 0 && (
        <EmptyState
          icon={Search}
          title="No matching sources found"
          body={`No source items match your current filter and search for "${searchQuery}".`}
          action={{
            label: 'Clear search and filters',
            onClick: handleClearFilters,
          }}
        />
      )}

      {/* Sources Grid / List */}
      {!isLoading && filteredSources.length > 0 && (
        <div className="space-y-8">
          {/* Dossiers Section */}
          {dossiers.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-ui font-semibold text-ink flex items-center gap-2">
                <Layers className="w-4 h-4 text-accent" />
                <span>Multi-Source Dossiers ({dossiers.length})</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {dossiers.map((item) => (
                  <SourceCard
                    key={item.id}
                    book={item}
                    isSynthesized={libraryIds.has(item.id)}
                    onClick={() => navigate(`/research/${item.id}`)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Standalone Sources Section */}
          {singleSources.length > 0 && (
            <div className="space-y-3">
              {dossiers.length > 0 && (
                <h2 className="text-ui font-semibold text-ink flex items-center gap-2">
                  <FileText className="w-4 h-4 text-ink-muted" />
                  <span>Individual Source Items ({singleSources.length})</span>
                </h2>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {singleSources.map((item) => (
                  <SourceCard
                    key={item.id}
                    book={item}
                    isSynthesized={libraryIds.has(item.id)}
                    onClick={() => navigate(`/research/${item.id}`)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface SourceCardProps {
  book: Book;
  isSynthesized: boolean;
  onClick: () => void;
}

function SourceCard({ book, isSynthesized, onClick }: SourceCardProps) {
  const isDossier =
    book.sourceSite === 'Multi-Source Dossier' || book.id.startsWith('book-dossier-');

  return (
    <article
      onClick={onClick}
      className="group relative flex flex-col justify-between p-4 rounded-lg border border-line bg-card hover:bg-subtle hover:border-line-strong transition-all cursor-pointer shadow-xs"
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Dossier Badge */}
          {isDossier && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded bg-accent/15 text-accent-ink border border-accent/30">
              <Layers className="w-3 h-3" />
              <span>Dossier</span>
            </span>
          )}

          {/* Format Badge */}
          {book.sourceFormat && (
            <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-subtle text-ink-muted border border-line">
              {book.sourceFormat}
            </span>
          )}

          {/* Site Badge */}
          {book.sourceSite && !isDossier && (
            <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted truncate max-w-[150px]">
              <Globe className="w-3 h-3 shrink-0" />
              <span className="truncate">{book.sourceSite}</span>
            </span>
          )}

          {/* Synthesis Status Badge */}
          {!isSynthesized && (
            <span className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30">
              Imported, not yet synthesized
            </span>
          )}
        </div>

        <h3 className="font-ui font-semibold text-ui text-ink line-clamp-2 group-hover:text-accent-ink transition-colors mt-1">
          {book.title}
        </h3>

        {book.author && (
          <p className="text-caption text-ink-muted line-clamp-1">by {book.author}</p>
        )}

        {book.description && (
          <p className="text-caption text-ink-faint line-clamp-2 mt-1">{book.description}</p>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-line/60 flex items-center justify-between text-caption text-ink-light">
        <span>
          {book.chapterCount} {isDossier ? 'sources' : book.chapterCount === 1 ? 'chapter' : 'chapters'}
        </span>
        {book.wordCount && book.wordCount > 0 ? (
          <span>{book.wordCount.toLocaleString()} words</span>
        ) : null}
      </div>
    </article>
  );
}

export default ResearchRoute;
