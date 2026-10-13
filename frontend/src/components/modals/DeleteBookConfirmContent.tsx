import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { apiClient } from '../../api/client';
import { useLifecycle } from '../../hooks/useLifecycle';

export interface DeleteBookConfirmContentProps {
  close: (reason?: 'action') => void;
  bookId: string;
  bookTitle: string;
  chapterCount: number;
}

type DeleteOp = 'A' | 'B' | 'C' | 'D';

interface OperationOption {
  id: DeleteOp;
  label: string;
  description: string;
  warning?: string;
  buttonLabel: string;
  danger?: boolean;
}

export function DeleteBookConfirmContent({
  close,
  bookId,
  bookTitle,
  chapterCount,
}: DeleteBookConfirmContentProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: lifecycleDetails } = useLifecycle(bookId);

  const lifecycleState = lifecycleDetails?.lifecycle?.lifecycle_state;
  const isArchived = lifecycleState === 'archived';

  const [selectedOp, setSelectedOp] = useState<DeleteOp>(isArchived ? 'D' : 'B');
  const [typedTitle, setTypedTitle] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options: OperationOption[] = [
    {
      id: 'A',
      label: 'Remove from Library (Keep Source in Research)',
      description:
        'The book disappears from your Library but the raw source stays in Research. You can re-synthesize it later.',
      buttonLabel: 'Remove from Library',
    },
    {
      id: 'B',
      label: 'Remove from Library AND Delete Source',
      description:
        'The book and its raw source are removed. Reading progress and LLM usage stats are preserved for your records.',
      buttonLabel: 'Delete Everything',
      danger: true,
    },
    {
      id: 'C',
      label: 'Delete Source Only (Keep Library Reading)',
      description:
        'Removes raw source chapters while preserving your compressed reading copy.',
      warning:
        'Source detached: you keep reading the compressed version but provenance links are disabled and you cannot re-synthesize.',
      buttonLabel: 'Delete Source Only',
      danger: true,
    },
    ...(isArchived
      ? [
          {
            id: 'D' as DeleteOp,
            label: 'Full Purge (Archived Books Only)',
            description:
              'Permanent deletion of all traces including history. Only available for archived books.',
            warning:
              'Permanent deletion of all traces including history. Only available for archived books.',
            buttonLabel: 'Purge All Records',
            danger: true,
          },
        ]
      : []),
  ];

  const currentOption = options.find((o) => o.id === selectedOp) || options[0];
  const needsConfirmation = chapterCount > 0 && selectedOp !== 'A';
  const isConfirmed = !needsConfirmation || typedTitle === bookTitle;

  const handleDelete = async () => {
    if (!isConfirmed || isDeleting) return;

    setIsDeleting(true);
    setError(null);

    try {
      await apiClient<{ success: boolean; operation?: string }>(`/api/books/${bookId}`, {
        method: 'DELETE',
        body: JSON.stringify({ operation: selectedOp }),
      });

      // Invalidate relevant caches
      await queryClient.invalidateQueries({ queryKey: ['books'] });
      await queryClient.invalidateQueries({ queryKey: ['sources'] });
      await queryClient.invalidateQueries({ queryKey: ['book', bookId] });
      await queryClient.invalidateQueries({ queryKey: ['book-lifecycle', bookId] });
      await queryClient.invalidateQueries({ queryKey: ['llm-usage-summary'] });

      close('action');
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete book');
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 4-Option Operation Selector */}
      <div className="space-y-2">
        <label className="text-ui-sm font-medium text-ink block">
          Choose Deletion Operation:
        </label>
        <div className="space-y-2">
          {options.map((opt) => {
            const isSelected = selectedOp === opt.id;
            return (
              <label
                key={opt.id}
                className={`block p-3 rounded-md border text-ui-sm cursor-pointer transition-colors ${
                  isSelected
                    ? 'border-brand bg-brand/5 ring-1 ring-brand'
                    : 'border-line bg-surface hover:bg-subtle/50'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <input
                    type="radio"
                    name="delete-operation"
                    value={opt.id}
                    checked={isSelected}
                    onChange={() => setSelectedOp(opt.id)}
                    className="mt-1 text-brand focus:ring-brand"
                  />
                  <div className="space-y-1 flex-1">
                    <p className="font-medium text-ink leading-snug">{opt.label}</p>
                    <p className="text-caption text-ink-muted leading-relaxed">
                      {opt.description}
                    </p>
                    {opt.warning && (
                      <div className="flex items-start gap-1.5 p-2 mt-1.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-caption">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                        <span>⚠️ {opt.warning}</span>
                      </div>
                    )}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {needsConfirmation ? (
        <div className="space-y-2 pt-1 border-t border-line">
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
        <p className="text-ui-sm text-ink-muted pt-1">
          Are you sure you want to execute <strong className="text-ink">{currentOption.label}</strong> for{' '}
          <strong className="text-ink">{bookTitle}</strong>?
        </p>
      )}

      {error && (
        <p className="text-caption text-err font-medium animate-fade-in">
          {error}
        </p>
      )}

      {/* Action buttons */}
      <div className="pt-2 flex justify-end gap-2 border-t border-line">
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
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-ui-sm font-medium rounded-md text-white transition-all focus:outline-none focus-visible:ring-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${
            currentOption.danger
              ? 'bg-err hover:opacity-90 focus-visible:ring-err'
              : 'bg-brand hover:bg-brand/90 focus-visible:ring-brand'
          }`}
        >
          {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
          <span>{isDeleting ? 'Processing…' : currentOption.buttonLabel}</span>
        </button>
      </div>
    </div>
  );
}
