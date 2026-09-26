import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useBook } from '../hooks/useBook';

export default function ResearchViewerRoute() {
  const { bookId } = useParams<{ bookId: string }>();
  const { book, isLoading, isError } = useBook(bookId || '');

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 animate-pulse text-muted">
        Loading source material...
      </div>
    );
  }

  if (isError || !book) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link to="/research" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink mb-4">
          <ArrowLeft className="w-4 h-4" />
          Back to Research
        </Link>
        <p className="text-red-500 text-sm">Failed to load source item.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <Link to="/research" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to Research
      </Link>

      <header className="space-y-2 border-b border-line pb-4">
        <h1 className="text-2xl font-serif font-bold text-ink">{book.title}</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
          {book.author && <span>{book.author}</span>}
          {book.sourceSite && (
            <>
              <span>•</span>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-subtle border border-line">
                {book.sourceSite}
              </span>
            </>
          )}
        </div>
      </header>

      <div className="p-8 rounded-lg border border-line bg-card text-center text-muted">
        <p className="text-base font-medium">Original source viewer — Phase 5.3 Session 2b.</p>
      </div>
    </div>
  );
}
