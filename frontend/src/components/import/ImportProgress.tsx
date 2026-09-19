import { FileText } from 'lucide-react';

export interface ImportProgressProps {
  filename: string;
  progressPct: number;
  stage: string;
}

export function ImportProgress({
  filename,
  progressPct,
  stage,
}: ImportProgressProps) {
  const clampedPct = Math.min(100, Math.max(0, Math.round(progressPct)));

  return (
    <div
      className="w-full max-w-xl mx-auto rounded-xl border border-line bg-panel p-6 shadow-sm flex flex-col gap-4"
      role="region"
      aria-label="Upload progress"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-lg bg-subtle border border-line flex items-center justify-center shrink-0 text-accent">
          <FileText className="w-5 h-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-ui font-medium text-ui text-ink truncate" title={filename}>
            {filename}
          </p>
          <p className="text-caption text-ink-muted mt-0.5">
            {stage}… {clampedPct}%
          </p>
        </div>
      </div>

      {/* 2px progress bar: bg-subtle track, bg-accent fill */}
      <div
        className="w-full h-[2px] bg-subtle rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={clampedPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${stage} progress`}
      >
        <div
          className="h-full bg-accent transition-all duration-150 ease-out"
          style={{ width: `${clampedPct}%` }}
        />
      </div>
    </div>
  );
}

export default ImportProgress;
