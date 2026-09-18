import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { apiClient } from '../../api/client';

export interface AddChapterContentProps {
  close: (reason?: 'action') => void;
  bookId: string;
  nextNumber: number;
}

export function AddChapterContent({
  close,
  bookId,
  nextNumber,
}: AddChapterContentProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState({ title: false, content: false });

  const isTitleValid = title.trim().length >= 1;
  const isContentValid = content.trim().length >= 1;
  const isValid = isTitleValid && isContentValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ title: true, content: true });

    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await apiClient(`/api/books/${bookId}/chapters`, {
        method: 'POST',
        body: JSON.stringify({
          number: nextNumber,
          title: title.trim(),
          content: content.trim(),
        }),
      });

      // Invalidate chapters and book queries
      await queryClient.invalidateQueries({ queryKey: ['chapters', bookId] });
      await queryClient.invalidateQueries({ queryKey: ['book', bookId] });

      close('action');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add chapter');
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Chapter number indicator */}
      <div className="text-caption text-ink-faint font-mono">
        Chapter {nextNumber}
      </div>

      {/* Title Field */}
      <div className="space-y-1">
        <label htmlFor="chapter-title-input" className="block text-ui-sm font-medium text-ink">
          Title <span className="text-err">*</span>
        </label>
        <input
          id="chapter-title-input"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => setTouched((prev) => ({ ...prev, title: true }))}
          placeholder="e.g. Chapter 1: Loomings"
          className="w-full px-3 py-2 text-ui-sm rounded-md border border-line bg-subtle/50 text-ink placeholder:text-ink-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus:border-accent"
          autoFocus
        />
        {touched.title && !isTitleValid && (
          <p className="text-caption text-err font-medium">Title is required.</p>
        )}
      </div>

      {/* Content Field */}
      <div className="space-y-1">
        <label htmlFor="chapter-content-input" className="block text-ui-sm font-medium text-ink">
          Content <span className="text-err">*</span>
        </label>
        <textarea
          id="chapter-content-input"
          rows={8}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onBlur={() => setTouched((prev) => ({ ...prev, content: true }))}
          placeholder="Paste or write chapter source text…"
          className="w-full px-3 py-2 text-ui-sm font-mono rounded-md border border-line bg-subtle/50 text-ink placeholder:text-ink-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus:border-accent resize-y"
        />
        {touched.content && !isContentValid && (
          <p className="text-caption text-err font-medium">Chapter content is required.</p>
        )}
      </div>

      {error && (
        <p className="text-caption text-err font-medium animate-fade-in">
          {error}
        </p>
      )}

      {/* Footer / Buttons */}
      <div className="pt-2 flex justify-end gap-2 border-t border-line/50">
        <button
          type="button"
          onClick={() => close('action')}
          disabled={isSubmitting}
          className="px-3.5 py-1.5 text-ui-sm font-medium rounded-md border border-line bg-surface text-ink hover:bg-subtle disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!isValid || isSubmitting}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 text-ui-sm font-medium rounded-md bg-brand text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent shadow-sm"
        >
          {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
          <span>{isSubmitting ? 'Adding…' : 'Add chapter'}</span>
        </button>
      </div>
    </form>
  );
}

