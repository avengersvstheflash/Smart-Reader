import { Feather } from 'lucide-react';
import { GenerateMoreButtons } from './GenerateMoreButtons';

export function SmartEmptyState({
  hasOutline,
  remaining,
  busy,
  progress,
  onGenerate,
  onBeginSmartReading,
}: {
  hasOutline: boolean;
  remaining: number;
  busy: boolean;
  progress: { synthesized: number; total: number } | null;
  onGenerate: (n: number) => void;
  onBeginSmartReading: () => void;
}) {
  if (!hasOutline) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 px-6">
        <Feather className="w-8 h-8 text-faint mb-4" aria-hidden="true" />
        <h2 className="text-h3 font-semibold text-ink mb-2">
          Smart Reading
        </h2>
        <p className="text-body text-ink-muted max-w-md mb-6">
          Chapters written from the source, every line traceable back to it.
          The original is never modified.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={onBeginSmartReading}
          className="inline-flex items-center px-4 py-2 text-ui font-medium rounded-md bg-brand text-white hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed mb-3"
        >
          {busy ? 'Generating…' : 'Begin Smart Reading'}
        </button>
        <p className="text-caption text-ink-light max-w-sm m-0">
          Uses the configured AI provider. Deterministic fallback if unavailable.
        </p>
      </div>
    );
  }

  const pct = progress && progress.total > 0
    ? Math.min(100, Math.round((progress.synthesized / progress.total) * 100))
    : 0;

  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <Feather className="w-8 h-8 text-faint mb-4" aria-hidden="true" />
      <h2 className="text-h3 font-semibold text-ink mb-2">
        No Smart chapter here yet
      </h2>
      <p className="text-body text-ink-muted max-w-md mb-6">
        This chapter hasn't been generated. Generate the next chapters to
        read the derived lens.
      </p>

      <div className="mb-4">
        <GenerateMoreButtons
          remaining={remaining}
          busy={busy}
          onGenerate={onGenerate}
        />
      </div>

      {busy && progress && (
        <div className="w-full max-w-xs space-y-2 mt-2">
          <div
            role="progressbar"
            aria-valuenow={progress.synthesized}
            aria-valuemin={0}
            aria-valuemax={progress.total}
            className="w-full h-0.5 bg-subtle rounded-full overflow-hidden"
          >
            <div
              className="h-full bg-accent transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-caption text-ink-muted m-0">
            Generating {progress.synthesized} of {progress.total}
          </p>
        </div>
      )}
    </div>
  );
}
