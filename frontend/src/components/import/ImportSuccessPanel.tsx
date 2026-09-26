import { useNavigate } from 'react-router-dom';
import { AlertCircle, AlertTriangle, CheckCircle2, ArrowRight, PlusCircle, BookOpen } from 'lucide-react';
import { PipelineStepper } from './PipelineStepper';
import type { Book, Job } from '../../types/domain';

interface ImportSuccessPanelProps {
  book: Book;
  jobs: Job[];
  activeJob: Job | null;
  pipelineComplete: boolean;
  onAddAnother: () => void;
  /** Called when the user explicitly requests a retry (e.g. INGEST interrupted) */
  onRetry?: () => void;
}

export function ImportSuccessPanel({
  book,
  jobs,
  activeJob,
  pipelineComplete,
  onAddAnother,
  onRetry,
}: ImportSuccessPanelProps) {
  const navigate = useNavigate();

  const failedJob = jobs.find((j) => j.status.toLowerCase() === 'failed');
  const interruptedJob = jobs.find((j) => j.status.toUpperCase() === 'INTERRUPTED');

  return (
    <div
      className="w-full max-w-xl mx-auto rounded-xl border border-line bg-panel p-6 shadow-sm flex flex-col gap-5"
      role="status"
      aria-label="Import status"
    >
      {/* Book header */}
      <div className="flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-full bg-ok/15 text-ok flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-6 h-6" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-micro font-bold tracking-wider uppercase text-ok select-none">
            Added to library
          </span>
          <h2 className="font-display font-semibold text-lg text-ink truncate mt-0.5" title={book.title}>
            {book.title}
          </h2>
          {book.author && (
            <p className="text-ui-sm text-ink-muted truncate">by {book.author}</p>
          )}
          <div className="flex items-center gap-3 text-caption text-ink-muted mt-2">
            <span className="inline-flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
              {book.chapterCount} {book.chapterCount === 1 ? 'chapter' : 'chapters'}
            </span>
            {book.sourceFormat && (
              <span className="uppercase font-mono text-[11px] px-1.5 py-0.5 rounded bg-subtle text-ink-light">
                {book.sourceFormat}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Pipeline Stepper */}
      <div className="pt-3 pb-1 border-t border-line">
        <PipelineStepper jobs={jobs} activeJob={activeJob} />
      </div>

      {/* Background job error */}
      {failedJob && (
        <div
          role="alert"
          className="rounded-lg border border-err/30 bg-err/10 p-3 text-ink text-ui-sm flex items-start gap-2.5"
        >
          <AlertCircle className="w-4 h-4 text-err shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-medium text-err">Processing error</p>
            <p className="text-ink-muted mt-0.5">
              {failedJob.error || 'A background processing job encountered an error.'}
            </p>
          </div>
        </div>
      )}

      {/* Background job interrupted */}
      {interruptedJob && (
        <div
          role="status"
          className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-ink text-ui-sm flex items-start gap-2.5"
        >
          <AlertTriangle className="w-4 h-4 text-warn shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-ink">
              Import was interrupted.{' '}
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="font-medium text-ink underline hover:text-accent-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                >
                  Retry import
                </button>
              )}
              {onRetry ? ' to resume.' : ''}
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-line">
        <div className="text-caption text-ink-muted select-none">
          {failedJob
            ? 'Processing encountered an error'
            : interruptedJob
            ? 'Import was interrupted'
            : pipelineComplete && !interruptedJob
            ? 'Import complete'
            : activeJob
            ? 'Background processing…'
            : 'Ready'}
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={onAddAnother}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md border border-line bg-card hover:bg-subtle text-ink font-medium text-ui-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent select-none"
          >
            <PlusCircle className="w-4 h-4 text-ink-muted" aria-hidden="true" />
            <span>Add another</span>
          </button>

          <button
            type="button"
            onClick={() => navigate(`/research/${book.id}`)}
            className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md font-medium text-ui-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent select-none ${
              pipelineComplete && !interruptedJob
                ? 'bg-brand text-white hover:opacity-90 shadow-sm animate-button-glow'
                : interruptedJob
                ? 'border border-line bg-card text-ink hover:bg-subtle shadow-sm'
                : 'border border-line bg-subtle/50 text-ink-muted hover:bg-subtle hover:text-ink'
            }`}
          >
            <span>View source</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
