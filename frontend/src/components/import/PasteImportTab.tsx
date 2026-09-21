import { useState } from 'react';
import { apiClient } from '../../api/client';
import { normalizeBook, RawBook, type Book } from '../../types/domain';

interface PasteImportTabProps {
  onSuccess: (book: Book) => void;
}

const MIN_CHARS = 200;

export function PasteImportTab({ onSuccess }: PasteImportTabProps) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedContent = content.trim();
  const charCount = trimmedContent.length;
  const isValid = title.trim().length > 0 && charCount >= MIN_CHARS;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const result = await apiClient<{ book?: RawBook }>('/api/books', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          author: author.trim() || undefined,
          text: trimmedContent,
          contentType: 'other',
        }),
      });

      const rawBook = result.book;
      if (!rawBook) {
        setError('Server did not return a book record.');
        return;
      }
      onSuccess(normalizeBook(rawBook));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add book. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {/* Title */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="paste-title" className="text-ui-sm font-medium text-ink">
            Title <span className="text-err" aria-hidden="true">*</span>
          </label>
          <input
            id="paste-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. My Research Notes"
            required
            autoComplete="off"
            className="w-full px-3 py-2 rounded-md border border-line bg-card text-ink text-ui-sm placeholder:text-ink-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-shadow"
          />
        </div>

        {/* Author */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="paste-author" className="text-ui-sm font-medium text-ink">
            Author <span className="text-caption text-ink-muted font-normal">(optional)</span>
          </label>
          <input
            id="paste-author"
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="e.g. Jane Doe"
            autoComplete="off"
            className="w-full px-3 py-2 rounded-md border border-line bg-card text-ink text-ui-sm placeholder:text-ink-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-shadow"
          />
        </div>

        {/* Content */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <label htmlFor="paste-content" className="text-ui-sm font-medium text-ink">
              Content <span className="text-err" aria-hidden="true">*</span>
            </label>
            <span
              className={`text-caption select-none ${
                charCount === 0
                  ? 'text-ink-muted'
                  : charCount < MIN_CHARS
                  ? 'text-err'
                  : 'text-ok'
              }`}
              aria-live="polite"
            >
              {charCount < MIN_CHARS
                ? `${MIN_CHARS - charCount} more characters needed`
                : `${charCount.toLocaleString()} characters`}
            </span>
          </div>
          <textarea
            id="paste-content"
            rows={12}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste your text here — articles, notes, research, or any written content (minimum 200 characters)…"
            required
            className="w-full px-3 py-2 rounded-md border border-line bg-card text-ink text-ui-sm placeholder:text-ink-muted resize-y focus:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-shadow font-sans leading-relaxed"
          />
        </div>

        {/* Error */}
        {error && (
          <p role="alert" className="text-ui-sm text-err">
            {error}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={!isValid || submitting}
          className="self-end inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-brand text-white font-medium text-ui-sm hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 disabled:cursor-not-allowed select-none"
        >
          {submitting ? 'Adding…' : 'Add to library'}
        </button>
      </form>
    </div>
  );
}

