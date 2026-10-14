import { useMemo, useState, useEffect } from 'react';
import {
  X,
  Check,
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Clock,
  Sparkles,
  RotateCw,
  Cpu,
} from 'lucide-react';
import { Job, ImportTask } from '../../types/domain';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useImportQueueStore } from '../../store/useImportQueueStore';

export interface ImportCinematicProps {
  task?: ImportTask | null;
  jobs?: Job[];
  activeJob?: Job | null;
  onDismiss?: () => void;
  onCancel?: () => void;
  onRetry?: () => void;
}

interface StageDefinition {
  key: string;
  label: string;
  description: string;
  computational?: boolean;
}

const STAGES: StageDefinition[] = [
  { key: 'preparing', label: 'Preparing', description: 'Validating format and source payload' },
  { key: 'acquiring', label: 'Acquiring', description: 'Reading source streams and document headers' },
  { key: 'extracting', label: 'Extracting', description: 'Recovering text, headings, and clean blocks' },
  { key: 'structuring', label: 'Structuring', description: 'Detecting chapters, hierarchy, and sections' },
  { key: 'indexing', label: 'Semantic Memory', description: 'Generating BGE-M3 vector embeddings', computational: true },
  { key: 'synthesizing', label: 'Compression', description: 'Writing editorial thesis and omni chapters', computational: true },
  { key: 'ready', label: 'Ready', description: 'Persisted to library and ready to read' },
];

export function ImportCinematic({
  task,
  jobs = [],
  activeJob,
  onDismiss,
  onCancel,
  onRetry,
}: ImportCinematicProps) {
  const reducedMotion = useReducedMotion();
  const [ticker, setTicker] = useState(0);
  const storeEtaSeconds = useImportQueueStore((s) => s.etaSeconds);

  // Live timer tick for elapsed seconds
  useEffect(() => {
    const timer = setInterval(() => setTicker((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Determine stage and progress from task or jobs
  const {
    currentStageIndex,
    currentStage,
    progress,
    isComplete,
    isFailed,
    isCancelled,
    errorMessage,
    elapsedSeconds,
    etaSeconds,
  } = useMemo(() => {
    // 1. If we have a unified ImportTask:
    if (task) {
      const isComplete = task.status === 'completed';
      const isFailed = task.status === 'failed' || task.status === 'interrupted';
      const isCancelled = task.status === 'cancelled';
      const progress = isComplete ? 100 : Math.max(0, Math.min(100, task.progress));

      let stageIdx = STAGES.findIndex((s) => s.key === task.stage);
      if (stageIdx === -1) {
        if (progress < 15) stageIdx = 0;
        else if (progress < 30) stageIdx = 1;
        else if (progress < 50) stageIdx = 2;
        else if (progress < 70) stageIdx = 3;
        else if (progress < 85) stageIdx = 4;
        else if (progress < 100) stageIdx = 5;
        else stageIdx = 6;
      }
      if (isComplete) stageIdx = STAGES.length - 1;

      // Elapsed & ETA (consumed from store F77)
      let elapsedSeconds = 0;
      if (task.startedAt) {
        const startMs = new Date(task.startedAt).getTime();
        elapsedSeconds = Math.max(1, Math.round((Date.now() - startMs) / 1000));
      }

      return {
        currentStageIndex: stageIdx,
        currentStage: STAGES[stageIdx] || STAGES[0],
        progress,
        isComplete,
        isFailed,
        isCancelled,
        errorMessage: task.error || null,
        elapsedSeconds,
        etaSeconds: storeEtaSeconds,
      };
    }

    // 2. Fallback to existing jobs list:
    const hasFailed = jobs.some((j) => j.status.toLowerCase() === 'failed');
    const failedJob = jobs.find((j) => j.status.toLowerCase() === 'failed');
    const hasCompletedAny = jobs.some((j) => j.status === 'COMPLETED');
    const isComplete = !activeJob && hasCompletedAny && !hasFailed;

    let stageIdx = 0;
    let progress = activeJob ? activeJob.progress : isComplete ? 100 : 10;
    if (activeJob) {
      if (activeJob.type === 'INGEST' || activeJob.type === 'WEB_IMPORT') {
        stageIdx = progress < 40 ? 1 : progress < 70 ? 2 : 3;
      } else if (activeJob.type === 'SEMANTIC_INDEX') {
        stageIdx = 4;
      } else if (activeJob.type === 'SYNOPSIS' || activeJob.type === 'SYNTHESIS') {
        stageIdx = 5;
      }
    } else if (isComplete) {
      stageIdx = 6;
    }

    return {
      currentStageIndex: stageIdx,
      currentStage: STAGES[stageIdx] || STAGES[0],
      progress,
      isComplete,
      isFailed: hasFailed,
      isCancelled: false,
      errorMessage: failedJob?.error || null,
      elapsedSeconds: 0,
      etaSeconds: null,
    };
  }, [task, jobs, activeJob, ticker, storeEtaSeconds]);

  // Radial dots for semantic indexing visualizer
  const radialDots = useMemo(() => {
    const dots: { x: number; y: number; index: number }[] = [];
    const radius = 48;
    for (let i = 0; i < 12; i++) {
      const angle = (i * 2 * Math.PI) / 12;
      dots.push({
        index: i,
        x: Math.round(Math.cos(angle) * radius),
        y: Math.round(Math.sin(angle) * radius),
      });
    }
    return dots;
  }, []);

  const visibleDotsCount = Math.max(1, Math.min(12, Math.round((progress / 100) * 12)));

  const formatEta = (seconds: number | null): string => {
    if (seconds === null) return 'Estimating…';
    if (seconds < 60) return `~${seconds}s remaining`;
    const mins = Math.floor(seconds / 60);
    const rem = seconds % 60;
    return rem > 0 ? `~${mins}m ${rem}s remaining` : `~${mins}m remaining`;
  };

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Import Progress Pipeline"
      className="w-full max-w-2xl mx-auto rounded-2xl border border-line bg-panel p-6 shadow-sm flex flex-col gap-6 relative overflow-hidden"
    >
      {/* ── Top Header Row ── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`w-3 h-3 rounded-full shrink-0 ${
              isComplete
                ? 'bg-ok'
                : isFailed
                ? 'bg-err'
                : isCancelled
                ? 'bg-ink-muted'
                : 'bg-brand animate-pulse-dot-glow'
            }`}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h2 className="font-display font-semibold text-lg text-ink truncate">
              {isComplete
                ? 'Import Complete & Indexed'
                : isFailed
                ? 'Ingestion Interrupted'
                : isCancelled
                ? 'Import Cancelled'
                : task?.sourceTitle || currentStage.label}
            </h2>
            <p className="text-caption text-ink-muted truncate">
              {isComplete
                ? 'Document is structured, vectorized, and ready in your library.'
                : isFailed
                ? errorMessage || 'A processing step encountered an error.'
                : isCancelled
                ? 'Cancelled by user.'
                : currentStage.description}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onCancel && !isComplete && !isFailed && !isCancelled && (
            <button
              type="button"
              onClick={onCancel}
              className="px-2.5 py-1 text-xs border border-line rounded-md text-ink-muted hover:text-err hover:bg-err/10 transition-colors"
            >
              Cancel
            </button>
          )}

          {onRetry && (isFailed || isCancelled) && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium bg-brand text-white rounded-md hover:opacity-90 shadow-sm transition-opacity"
            >
              <RotateCw className="w-3 h-3" />
              <span>Retry</span>
            </button>
          )}

          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Minimize view"
              className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-subtle transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Center Stage Visualizer ── */}
      <div className="min-h-[170px] flex items-center justify-center p-5 bg-surface/50 rounded-xl border border-line/70 overflow-hidden relative">
        {/* Error State */}
        {isFailed ? (
          <div className="flex items-center gap-3.5 text-err max-w-md">
            <AlertCircle className="w-7 h-7 shrink-0" aria-hidden="true" />
            <div className="text-ui-sm">
              <p className="font-semibold text-err">Processing stopped</p>
              <p className="text-caption text-ink-muted mt-1 leading-relaxed">
                {errorMessage || 'Background ingestion encountered an issue. Omnitome supports retry without data loss.'}
              </p>
            </div>
          </div>
        ) : isCancelled ? (
          <div className="flex items-center gap-3 text-ink-muted">
            <AlertTriangle className="w-6 h-6 shrink-0" />
            <p className="text-ui-sm">This import task was cancelled. Retry is available anytime.</p>
          </div>
        ) : isComplete ? (
          <div className="flex flex-col items-center justify-center gap-3 text-center py-2">
            <div className="w-12 h-12 rounded-full bg-ok/15 text-ok flex items-center justify-center shadow-sm">
              <Check className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <p className="font-display font-medium text-ink">Ready to explore</p>
              <p className="text-caption text-ink-muted">All semantic vectors and representations are compiled.</p>
            </div>
          </div>
        ) : reducedMotion ? (
          /* Reduced motion static text */
          <div className="text-center py-6 space-y-1">
            <p className="text-ui-md font-medium text-ink">{currentStage.label}</p>
            <p className="text-caption text-ink-muted">{currentStage.description}</p>
            <p className="font-mono text-accent-ink text-sm mt-1">{progress}%</p>
          </div>
        ) : (
          /* Active Animated Stages */
          <>
            {/* Stage: preparing & acquiring */}
            {(currentStage.key === 'preparing' || currentStage.key === 'acquiring') && (
              <div className="flex flex-col items-center justify-center gap-3">
                <div className="relative w-28 h-20 bg-card rounded-lg border border-line shadow-xs flex items-center justify-center overflow-hidden">
                  <BookOpen className="w-8 h-8 text-ink-muted/40" />
                  <div className="absolute inset-y-1 right-1 w-1/2 bg-surface border-l border-line rounded-r animate-page-turn origin-left shadow-xs flex items-center justify-center">
                    <div className="w-6 h-1 bg-brand/40 rounded-full" />
                  </div>
                </div>
                <span className="text-caption text-ink-muted font-medium">Acquiring source material…</span>
              </div>
            )}

            {/* Stage: extracting & structuring */}
            {(currentStage.key === 'extracting' || currentStage.key === 'structuring') && (
              <div className="flex flex-col items-center justify-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="px-2.5 py-1 bg-card border border-line rounded-md text-caption text-ink font-mono animate-chapter-card-in shadow-xs">
                    § Parsing Blocks
                  </div>
                  <div className="px-2.5 py-1 bg-card border border-brand/40 rounded-md text-caption text-brand font-mono animate-chapter-card-in shadow-xs" style={{ animationDelay: '120ms' }}>
                    § Structuring Outline
                  </div>
                </div>
                <span className="text-caption text-ink-muted">Segmenting prose into canonical chapters…</span>
              </div>
            )}

            {/* Stage: indexing (BGE-M3 Embeddings) */}
            {currentStage.key === 'indexing' && (
              <div className="relative w-36 h-36 flex items-center justify-center">
                <div className="w-6 h-6 rounded-full bg-brand/20 border border-brand text-brand flex items-center justify-center animate-pulse-dot-glow z-10 shadow-xs">
                  <Cpu className="w-3.5 h-3.5 text-brand" />
                </div>
                {radialDots.map((dot) => {
                  if (dot.index >= visibleDotsCount) return null;
                  return (
                    <div
                      key={dot.index}
                      className="absolute w-2.5 h-2.5 rounded-full bg-brand transition-all animate-chunk-gather"
                      style={{
                        transform: `translate(${dot.x}px, ${dot.y}px)`,
                        animationDelay: `${dot.index * 40}ms`,
                      }}
                    />
                  );
                })}
              </div>
            )}

            {/* Stage: synthesizing */}
            {currentStage.key === 'synthesizing' && (
              <div className="flex flex-col items-center justify-center gap-2.5 text-center">
                <div className="w-10 h-10 rounded-full bg-brand/10 text-brand flex items-center justify-center animate-pulse">
                  <Sparkles className="w-5 h-5" />
                </div>
                <p className="text-caption text-ink font-medium">Generating editorial thesis & omni compression…</p>
                <span className="text-micro text-ink-muted font-mono">BGE-M3 Grounded Context</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Computational Stage Reassurance Notice ── */}
      {!isComplete && !isFailed && currentStage.computational && (
        <div className="rounded-xl bg-surface/70 border border-line p-3 flex items-start gap-2.5 text-caption text-ink-muted">
          <Sparkles className="w-4 h-4 text-brand shrink-0 mt-0.5" aria-hidden="true" />
          <p className="leading-relaxed">
            <strong className="text-ink">Omnitome is actively running computational processing.</strong> Vector
            indexing and compression may pause momentarily while models run. You can explore your library or research
            workspace while this runs in the background.
          </p>
        </div>
      )}

      {/* ── Bottom Progress hairline & ETA info ── */}
      <div className="flex flex-col gap-2">
        <div className="h-1.5 w-full bg-line overflow-hidden rounded-full">
          <div
            className={`h-full bg-brand ${reducedMotion ? 'transition-none' : 'transition-all duration-300'}`}
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-caption text-ink-muted select-none">
          <span className="truncate pr-2">
            <span>Stage {currentStageIndex + 1} of {STAGES.length} · </span>
            <strong className="text-ink font-medium">{currentStage.label}</strong>
          </span>

          <div className="flex items-center gap-3 shrink-0 font-mono text-micro">
            {!isComplete && !isFailed && etaSeconds !== null && (
              <span className="text-accent-ink flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>{formatEta(etaSeconds)}</span>
              </span>
            )}
            {elapsedSeconds > 0 && !isComplete && (
              <span className="text-ink-muted">{elapsedSeconds}s elapsed</span>
            )}
            <span className="text-ink font-semibold">{progress}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ImportCinematic;
