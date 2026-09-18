import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { apiClient } from '../../api/client';

export interface DeleteBookConfirmContentProps {
  close: (reason?: 'action') => void;
  bookId: string;
  bookTitle: string;
  chapterCount: number;
}

export function DeleteBookConfirmContent({
  close,
  bookId,
  bookTitle,
  chapterCount,
}: DeleteBookConfirmContentProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [typedTitle, setTypedTitle] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsConfirmation = chapterCount > 0;
  const isConfirmed = !needsConfirmation || typedTitle === bookTitle;

  const handleDelete = async () => {
    if (!isConfirmed || isDeleting) return;

    setIsDeleting(true);
    setError(null);

    try {
      await apiClient<{ success: boolean }>(`/api/books/${bookId}`, {
        method: 'DELETE',
      });

      // Invalidate relevant caches
      await queryClient.invalidateQueries({ queryKey: ['books'] });
      await queryClient.invalidateQueries({ queryKey: ['book', bookId] });

      close('action');
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete book');
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 p-3 rounded-md bg-err/10 border border-err/20 text-err text-ui-sm">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="font-medium">This action cannot be undone.</p>
          <p className="text-caption opacity-90 mt-0.5">
            Deleting this book permanently deletes its chapters, representations, and semantic index chunks.
          </p>
        </div>
      </div>

      {needsConfirmation ? (
        <div className="space-y-2">
          <p className="text-ui-sm text-ink">
            Please type <span className="font-mono font-semibold select-all text-err">{bookTitle}</span> to confirm.
          </p>
          <input
            type="text"
            value={typedTitle}
            onChange={(e) => setTypedTitle(e.target.value)}
            placeholder="Type the exact book title"
            className="w-full px-3 py-2 text-ui-sm rounded-md border border-line bg-subtle/50 text-ink placeholder:text-ink-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-err focus:border-err"
            autoFocus
          />
        </div>
      ) : (
        <p className="text-ui-sm text-ink-muted">
          Are you sure you want to delete <strong className="text-ink">{bookTitle}</strong>?
        </p>
      )}

      {error && (
        <p className="text-caption text-err font-medium animate-fade-in">
          {error}
        </p>
      )}

      {/* Action buttons */}
      <div className="pt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => close('action')}
          disabled={isDeleting}
          className="px-3.5 py-1.5 text-ui-sm font-medium rounded-md border border-line bg-surface text-ink hover:bg-subtle disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={!isConfirmed || isDeleting}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-ui-sm font-medium rounded-md bg-err text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-err shadow-sm"
        >
          {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
          <span>{isDeleting ? 'Deleting…' : 'Delete book'}</span>
        </button>
      </div>
    </div>
  );
}
