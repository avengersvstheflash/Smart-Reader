import React, { ReactNode } from 'react';
import { BookCard } from './BookCard';
import { Book } from '../../types/domain';
import { AlertCircle, RotateCw } from 'lucide-react';

export interface BookGridProps {
  books: Book[];
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  selectionMode?: boolean;
  selectedIds?: string[];
  onSelect?: (id: string) => void;
  emptyState?: ReactNode;
}

export function BookCardSkeleton() {
  return (
    <div
      className="flex flex-col rounded-md border border-line bg-card p-3 animate-pulse"
      aria-hidden="true"
    >
      <div className="aspect-[3/4] w-full rounded bg-subtle mb-3" />
      <div className="h-4 bg-subtle rounded w-3/4 mb-2" />
      <div className="h-3 bg-subtle rounded w-1/2 mb-4" />
      <div className="mt-auto pt-2 border-t border-line flex justify-between">
        <div className="h-3 bg-subtle rounded w-1/3" />
        <div className="h-3 bg-subtle rounded w-1/4" />
      </div>
    </div>
  );
}

export const BookGrid: React.FC<BookGridProps> = ({
  books,
  loading = false,
  error = null,
  onRetry,
  selectionMode = false,
  selectedIds = [],
  onSelect,
  emptyState,
}) => {
  // First load state (no books yet + loading)
  if (loading && books.length === 0) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4" aria-busy="true">
        {Array.from({ length: 8 }).map((_, i) => (
          <BookCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  // Error state
  if (error && books.length === 0) {
    return (
      <div className="rounded-md border border-err/30 bg-err/10 p-6 text-center max-w-lg mx-auto my-8">
        <AlertCircle className="w-8 h-8 text-err mx-auto mb-2" aria-hidden="true" />
        <h3 className="text-ui font-semibold text-ink mb-1">Failed to load books</h3>
        <p className="text-caption text-ink-muted mb-4">{error.message || 'An unexpected error occurred.'}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md bg-brand text-white hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Retry</span>
          </button>
        )}
      </div>
    );
  }

  // Empty state
  if (!loading && books.length === 0) {
    return <>{emptyState}</>;
  }

  return (
    <div className="relative">
      {/* Background refetch hairline indicator */}
      {loading && (
        <div className="absolute -top-3 left-0 right-0 h-0.5 bg-accent/80 animate-pulse rounded-full overflow-hidden">
          <div className="h-full bg-accent w-1/3 animate-indeterminate" />
        </div>
      )}

      {/* Responsive Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {books.map((book) => (
          <BookCard
            key={book.id}
            book={book}
            selectionMode={selectionMode}
            selected={selectedIds.includes(book.id)}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
};