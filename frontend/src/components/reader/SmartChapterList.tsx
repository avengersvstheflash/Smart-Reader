import { Link } from 'react-router-dom';
import { AlertCircle, RotateCw } from 'lucide-react';
import { SmartChapter } from '../../types/domain';
import { formatRelativeTime } from '../../lib/relativeTime';

export interface SmartChapterListProps {
  smartChapters: SmartChapter[];
  resynthesizingId?: string | null;
  onResynthesize: (smartChapterId: string) => Promise<void> | void;
  resynthesizeToast?: string | null;
  onDismissToast?: () => void;
  bookId?: string;
}

export function SmartChapterList({
  smartChapters,
  resynthesizingId,
  onResynthesize,
  resynthesizeToast,
  onDismissToast,
  bookId,
}: SmartChapterListProps) {
  if (smartChapters.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-caption text-ink-muted">No Omni chapters yet.</p>
        <p className="text-micro text-ink-faint mt-1">They will appear here once synthesis begins.</p>
      </div>
    );
  }

  return (
    <>
      {resynthesizeToast && (
        <div
          role="alert"
          className="mb-4 p-3 rounded-md border border-err/30 bg-err/10 text-err text-xs flex items-center justify-between"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="truncate">{resynthesizeToast}</span>
          </div>
          {onDismissToast && (
            <button
              type="button"
              onClick={onDismissToast}
              className="text-err hover:opacity-75 font-semibold ml-3 shrink-0"
              aria-label="Dismiss alert"
            >
              ✕
            </button>
          )}
        </div>
      )}
      <ol role="list" className="divide-y divide-line/40">
        {smartChapters.map((sc, index) => {
          const isGenerated = sc.status === 'generated';
          const isGenerating = sc.status === 'generating';
          const isPending = sc.status === 'pending';
          const isFailed = sc.status === 'failed';
          const isChapterResynthesizing = resynthesizingId === sc.id;

          const queuedStyles = [
            'bg-[rgb(var(--accent-4)/0.15)] text-[rgb(var(--accent-4))]',
            'bg-[rgb(var(--accent-2)/0.15)] text-[rgb(var(--accent-2))]',
            'bg-[rgb(var(--neon-red,var(--err))/0.15)] text-[rgb(var(--neon-red,var(--err))]',
          ];
          const queuedStyle = queuedStyles[index % 3];

          const badge = (isGenerating || isChapterResynthesizing) ? (
            <span className="inline-flex items-center gap-1.5 text-micro font-semibold px-2 py-0.5 rounded-full bg-accent/10 text-accent-ink animate-pulse">
              <RotateCw className="w-3 h-3 animate-spin" />
              Generating…
            </span>
          ) : isPending ? (
            <span className={`text-micro font-medium px-2 py-0.5 rounded-full ${queuedStyle}`}>
              Queued
            </span>
          ) : isFailed ? (
            <div className="flex items-center gap-2">
              <span className="text-micro font-semibold px-2 py-0.5 rounded-full bg-err/10 text-err">
                Failed
              </span>
              <button
                type="button"
                disabled={isChapterResynthesizing}
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  await onResynthesize(sc.id);
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-err/30 bg-err/10 text-err hover:bg-err/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                title="Synthesize failed chapter"
              >
                <RotateCw className="w-3.5 h-3.5" />
                Synthesize Chapter
              </button>
            </div>
          ) : null;

          const readStyle = index % 2 === 0
            ? 'bg-[rgb(var(--accent-3)/0.15)] text-[rgb(var(--accent-3))]'
            : 'bg-[rgb(var(--accent)/0.15)] text-[rgb(var(--accent))]';

          const readIndicator = sc.readAt ? (
            <span className={`text-micro font-medium px-2 py-0.5 rounded-full shrink-0 ${readStyle}`}>
              Read {formatRelativeTime(sc.readAt)}
            </span>
          ) : sc.openedAt ? (
            <span className="text-micro text-ink-faint shrink-0">
              Opened {formatRelativeTime(sc.openedAt)}
            </span>
          ) : null;

          const rowContent = (
            <>
              <div className="flex items-center gap-3 min-w-0 flex-1 pr-4">
                <span className="font-mono text-caption text-faint w-7 text-right shrink-0">
                  {sc.sequence}.
                </span>
                <span
                  className={`text-ui-sm truncate font-medium flex-1 min-w-0 ${
                    isGenerated
                      ? 'text-ink group-hover:text-accent-ink transition-colors'
                      : 'text-ink-muted'
                  }`}
                >
                  {sc.title ?? `Chapter ${sc.sequence}`}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {readIndicator}
                {badge}
              </div>
            </>
          );

          const targetBookId = bookId || sc.bookId;

          return (
            <li key={sc.id}>
              {isGenerated ? (
                <Link
                  to={`/read/${targetBookId}/${sc.id}`}
                  className="group flex items-center justify-between py-2.5 px-3 rounded hover:bg-subtle transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {rowContent}
                </Link>
              ) : (
                <div
                  className={`flex items-center justify-between py-2.5 px-3 rounded ${
                    isFailed ? '' : 'opacity-60 cursor-not-allowed'
                  }`}
                  title={
                    isPending
                      ? 'Not yet generated'
                      : isGenerating
                      ? 'Generating…'
                      : undefined
                  }
                >
                  {rowContent}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}

export default SmartChapterList;
