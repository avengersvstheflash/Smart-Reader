import { useMemo } from 'react';
import { X, Check, AlertCircle, AlertTriangle, BookOpen, Tag } from 'lucide-react';
import { Job } from '../../types/domain';
import { isActiveStatus } from '../../hooks/useJobs';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export interface ImportCinematicProps {
  jobs: Job[];
  activeJob: Job | null;
  onDismiss: () => void;
}

interface StageConfig {
  key: string;
  label: string;
  jobType: string;
  humanLabel: string;
}

const STAGES: StageConfig[] = [
  { key: 'ingest', label: 'Intake & parse', jobType: 'INGEST', humanLabel: 'Reading the file…' },
  { key: 'index', label: 'Semantic index', jobType: 'SEMANTIC_INDEX', humanLabel: 'Building semantic memory…' },
  { key: 'classification', label: 'Classification', jobType: 'CLASSIFICATION', humanLabel: 'Classifying content…' },
  { key: 'synopsis', label: 'Synopsis', jobType: 'SYNOPSIS', humanLabel: 'Drawing out the thesis…' },
  { key: 'synthesis', label: 'Smart chapters', jobType: 'SYNTHESIS', humanLabel: 'Writing Smart Chapters…' },
];

const CLASSIFICATION_TAGS = [
  { text: 'Non-Fiction', threshold: 0.2 },
  { text: 'Technical Reference', threshold: 0.4 },
  { text: 'High Complexity', threshold: 0.6 },
  { text: 'Deep Index', threshold: 0.8 },
];

export function resolveStages(jobs: Job[], activeJob: Job | null) {
  const findJobForStage = (jobType: string): Job | undefined => {
    if (jobType === 'INGEST') {
      return jobs.find((j) => j.type === 'INGEST' || j.type === 'WEB_IMPORT');
    }
    return jobs.find((j) => j.type === jobType);
  };

  const hasInterrupted = jobs.some((j) => j.status.toUpperCase() === 'INTERRUPTED');
  const interruptedJob = jobs.find((j) => j.status.toUpperCase() === 'INTERRUPTED') || null;
  const hasFailed = jobs.some((j) => j.status.toLowerCase() === 'failed');
  const failedJob = jobs.find((j) => j.status.toLowerCase() === 'failed') || null;
  const hasCompletedAny = jobs.some((j) => j.status === 'COMPLETED');
  const pipelineComplete = !activeJob && hasCompletedAny && !hasInterrupted && !hasFailed;

  let currentStageIndex = -1;
  if (activeJob) {
    currentStageIndex = STAGES.findIndex((s) => {
      if (s.jobType === 'INGEST') {
        return activeJob.type === 'INGEST' || activeJob.type === 'WEB_IMPORT';
      }
      return activeJob.type === s.jobType;
    });
  }

  if (currentStageIndex === -1 && failedJob) {
    currentStageIndex = STAGES.findIndex((s) => s.jobType === failedJob.type);
  }

  if (currentStageIndex === -1 && interruptedJob) {
    currentStageIndex = STAGES.findIndex((s) => s.jobType === interruptedJob.type);
  }

  if (currentStageIndex === -1) {
    // Find first active or incomplete stage
    const activeIdx = STAGES.findIndex((s) => {
      const j = findJobForStage(s.jobType);
      return j && isActiveStatus(j.status);
    });
    if (activeIdx !== -1) {
      currentStageIndex = activeIdx;
    } else {
      const firstIncomplete = STAGES.findIndex((s) => {
        const j = findJobForStage(s.jobType);
        return !j || j.status !== 'COMPLETED';
      });
      currentStageIndex = firstIncomplete !== -1 ? firstIncomplete : STAGES.length - 1;
    }
  }

  const currentStage = STAGES[currentStageIndex] || STAGES[0];
  const activeStageJob = activeJob || findJobForStage(currentStage.jobType) || null;
  const stageProgress = typeof activeStageJob?.progress === 'number'
    ? Math.max(0, Math.min(100, activeStageJob.progress))
    : 0;

  const completedStagesCount = STAGES.filter((s) => {
    const j = findJobForStage(s.jobType);
    return j && j.status === 'COMPLETED';
  }).length;

  const totalStages = STAGES.length;
  const overallFill = pipelineComplete
    ? 1
    : Math.min(1, Math.max(0, (completedStagesCount + stageProgress / 100) / totalStages));

  return {
    currentStageIndex,
    currentStage,
    activeStageJob,
    stageProgress,
    completedStagesCount,
    totalStages,
    overallFill,
    pipelineComplete,
    hasFailed,
    failedJob,
    hasInterrupted,
    interruptedJob,
  };
}

export function ImportCinematic({ jobs, activeJob, onDismiss }: ImportCinematicProps) {
  const reducedMotion = useReducedMotion();

  const {
    currentStageIndex,
    currentStage,
    stageProgress,
    totalStages,
    overallFill,
    pipelineComplete,
    hasFailed,
    failedJob,
    hasInterrupted,
    interruptedJob,
  } = useMemo(() => resolveStages(jobs, activeJob), [jobs, activeJob]);

  // Dots for SEMANTIC_INDEX radial visualizer
  const radialDots = useMemo(() => {
    const dots: { x: number; y: number; index: number }[] = [];
    const radius = 48; // px
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

  // Calculate visible chunk count (1-12) based on progress
  const visibleChunkCount = Math.max(1, Math.min(12, Math.round((stageProgress / 100) * 12)));

  // Title / Human Stage Label
  let stageHeadline = currentStage.humanLabel;
  if (pipelineComplete) {
    stageHeadline = 'Import complete';
  } else if (hasFailed) {
    stageHeadline = 'Processing error';
  } else if (hasInterrupted) {
    stageHeadline = 'Import interrupted';
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Import progress"
      className="w-full max-w-2xl mx-auto rounded-xl border border-line bg-panel p-6 shadow-sm flex flex-col gap-6"
    >
      {/* Top row: Stage headline + Dismiss button */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              pipelineComplete
                ? 'bg-ok'
                : hasFailed
                ? 'bg-err'
                : hasInterrupted
                ? 'bg-warn'
                : 'bg-brand animate-pulse-dot-glow'
            }`}
            aria-hidden="true"
          />
          <h2 className="font-display font-semibold text-lg text-ink truncate">
            {stageHeadline}
          </h2>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Minimize cinematic view"
          className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-subtle transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent select-none shrink-0"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Center visualizer or Reduced-motion static view */}
      <div className="min-h-[160px] flex items-center justify-center p-4 bg-surface/50 rounded-lg border border-line/60 overflow-hidden relative">
        {/* Error / Interrupted view */}
        {hasFailed ? (
          <div className="flex items-center gap-3 text-err">
            <AlertCircle className="w-6 h-6 shrink-0" aria-hidden="true" />
            <div className="text-ui-sm">
              <p className="font-semibold">Pipeline encountered an error</p>
              <p className="text-ink-muted text-caption mt-0.5">
                {failedJob?.error || 'A background processing job failed.'}
              </p>
            </div>
          </div>
        ) : hasInterrupted ? (
          <div className="flex items-center gap-3 text-warn">
            <AlertTriangle className="w-6 h-6 shrink-0" aria-hidden="true" />
            <div className="text-ui-sm">
              <p className="font-semibold">Import was interrupted</p>
              <p className="text-ink-muted text-caption mt-0.5">
                {interruptedJob?.error || 'Processing stopped unexpectedly. Retry is safe.'}
              </p>
            </div>
          </div>
        ) : pipelineComplete ? (
          <div className="flex flex-col items-center justify-center gap-4 text-center py-2">
            <div className="flex gap-2">
              {STAGES.map((s, i) => (
                <div
                  key={s.key}
                  className={`w-8 h-8 rounded-full bg-ok/15 text-ok flex items-center justify-center ${reducedMotion ? '' : 'animate-check-cascade'}`}
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <Check className="w-5 h-5" aria-hidden="true" />
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-1">
              <p className="font-display font-medium text-ink">Everything is ready</p>
              <p className="text-caption text-ink-muted">All synthesis chapters and semantic indices generated.</p>
            </div>
          </div>
        ) : reducedMotion ? (
          /* Reduced-motion fallback: static text showing exact stage and percentage */
          <div className="text-center py-6">
            <p className="text-ui-md font-medium text-ink">
              {currentStage.humanLabel}
            </p>
            <p className="text-caption font-mono text-accent-ink mt-1">
              {Math.round(stageProgress)}%
            </p>
          </div>
        ) : (
          /* Stage-specific visualizer */
          <>
            {/* Stage 1: INGEST */}
            {currentStage.key === 'ingest' && (
              <div className="flex flex-col items-center justify-center gap-4">
                <div className="relative w-28 h-20 bg-card rounded-md border border-line shadow-sm flex items-center justify-center overflow-hidden">
                  <BookOpen className="w-8 h-8 text-ink-muted/50" aria-hidden="true" />
                  {/* Flipping page */}
                  <div
                    className="absolute inset-y-1 right-1 w-1/2 bg-surface border-l border-line rounded-r animate-page-turn origin-left shadow-sm flex items-center justify-center"
                    style={{
                      opacity: Math.min(1, Math.max(0.15, stageProgress / 30)),
                    }}
                  >
                    <div className="w-6 h-1 bg-line-strong/40 rounded-full" />
                  </div>
                </div>

                {/* Chapter cards materializing at >= 60% */}
                <div className="flex items-center gap-2 h-7">
                  {stageProgress >= 60 ? (
                    <>
                      <div className="px-2 py-1 bg-card border border-line rounded text-micro text-ink font-mono animate-chapter-card-in shadow-xs">
                        Ch. 1
                      </div>
                      <div
                        className="px-2 py-1 bg-card border border-line rounded text-micro text-ink font-mono animate-chapter-card-in shadow-xs"
                        style={{ animationDelay: '100ms' }}
                      >
                        Ch. 2
                      </div>
                      <div
                        className="px-2 py-1 bg-card border border-line rounded text-micro text-ink font-mono animate-chapter-card-in shadow-xs"
                        style={{ animationDelay: '200ms' }}
                      >
                        Ch. 3
                      </div>
                    </>
                  ) : (
                    <span className="text-caption text-ink-muted">Parsing document sections…</span>
                  )}
                </div>
              </div>
            )}

            {/* Stage 2: SEMANTIC_INDEX */}
            {currentStage.key === 'index' && (
              <div className="relative w-36 h-36 flex items-center justify-center">
                {/* Center anchor dot */}
                <div className="w-5 h-5 rounded-full bg-brand/20 border border-brand text-brand flex items-center justify-center animate-pulse-dot-glow z-10">
                  <div className="w-2 h-2 rounded-full bg-brand" />
                </div>

                {/* Radial chunk dots gathering */}
                {radialDots.map((dot) => {
                  const isVisible = dot.index < visibleChunkCount;
                  if (!isVisible) return null;

                  return (
                    <div
                      key={dot.index}
                      className="absolute w-2.5 h-2.5 rounded-full bg-accent animate-chunk-gather transition-transform"
                      style={{
                        transform: `translate(${dot.x}px, ${dot.y}px)`,
                        animationDelay: `${dot.index * 40}ms`,
                      }}
                      title={`Chunk ${dot.index + 1}`}
                    />
                  );
                })}
              </div>
            )}

            {/* Stage 3: CLASSIFICATION */}
            {currentStage.key === 'classification' && (
              <div className="flex flex-col items-center justify-center gap-3">
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-ink-muted" aria-hidden="true" />
                  <span className="text-caption text-ink-muted font-medium">Extracting taxonomy</span>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 max-w-sm">
                  {CLASSIFICATION_TAGS.map((tag, idx) => {
                    const progressRatio = stageProgress / 100;
                    // Tag visible if progress passes threshold, or at least first tag if any progress
                    const isVisible = progressRatio >= tag.threshold || (idx === 0 && stageProgress > 5);
                    if (!isVisible) return null;

                    return (
                      <span
                        key={tag.text}
                        className="px-2.5 py-1 rounded-full text-caption bg-card border border-brand/30 text-ink shadow-xs animate-tag-fade-in font-medium"
                        style={{ animationDelay: `${idx * 80}ms` }}
                      >
                        {tag.text}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Stage 4: SYNOPSIS */}
            {currentStage.key === 'synopsis' && (
              <div className="flex flex-col items-center justify-center gap-2 text-center">
                <div className="w-8 h-8 rounded-full bg-accent-wash flex items-center justify-center text-accent-ink animate-pulse">
                  <BookOpen className="w-4 h-4" />
                </div>
                <p className="text-caption text-ink-muted">
                  {stageProgress < 20 ? 'Scanning preface…' :
                   stageProgress < 60 ? 'Extracting thesis…' :
                   stageProgress < 95 ? 'Structuring outline…' :
                   'Abstract ready.'}
                </p>
              </div>
            )}

            {/* Stage 5: SYNTHESIS */}
            {currentStage.key === 'synthesis' && (
              <div className="flex flex-col gap-2 w-full max-w-sm mx-auto overflow-hidden">
                {Array.from({ length: 5 }).map((_, idx) => {
                  const isCompleted = Math.floor((stageProgress / 100) * 5) > idx;
                  const isStreaming = Math.floor((stageProgress / 100) * 5) === idx && stageProgress < 100 && !pipelineComplete;
                  
                  return (
                    <div
                      key={idx}
                      className={`flex gap-3 p-3 rounded-lg border border-line bg-card ${isCompleted || isStreaming ? 'opacity-100' : 'opacity-40'}`}
                    >
                      <div className="w-0.5 min-h-[1.5rem] bg-brand rounded-full shrink-0" />
                      <div className="flex-1 flex flex-col gap-2">
                        {isCompleted ? (
                          <div className="h-4 w-3/4 bg-brand/10 rounded text-[10px] font-medium text-brand flex items-center px-2">
                            Chapter {idx + 1} Synthesized
                          </div>
                        ) : (
                          <div className="h-4 w-3/4 bg-line-strong rounded" />
                        )}
                        <div className="flex flex-col gap-1.5">
                          <div className={`h-1.5 bg-line rounded ${isStreaming && !reducedMotion ? 'animate-line-stream' : ''}`} style={{ width: isCompleted || reducedMotion ? '90%' : '0%', animationDelay: isStreaming ? '100ms' : '0ms' }} />
                          <div className={`h-1.5 bg-line rounded ${isStreaming && !reducedMotion ? 'animate-line-stream' : ''}`} style={{ width: isCompleted || reducedMotion ? '75%' : '0%', animationDelay: isStreaming ? '200ms' : '0ms' }} />
                          <div className={`h-1.5 bg-line rounded ${isStreaming && !reducedMotion ? 'animate-line-stream' : ''}`} style={{ width: isCompleted || reducedMotion ? '60%' : '0%', animationDelay: isStreaming ? '300ms' : '0ms' }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom: horizontal hairline progress bar */}
      <div className="flex flex-col gap-1.5">
        <div className="h-[2px] w-full bg-line overflow-hidden rounded-full">
          <div
            className={`h-full bg-brand ${
              reducedMotion ? 'transition-none' : 'transition-all duration-300'
            }`}
            style={{ width: `${Math.round(overallFill * 100)}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-caption text-ink-muted select-none">
          <span className="truncate pr-2">
            <span className="hidden sm:inline">
              {pipelineComplete
                ? 'Stage 5 of 5 · '
                : `Stage ${currentStageIndex + 1} of ${totalStages} · `}
            </span>
            {pipelineComplete ? 'Complete' : currentStage.label}
          </span>
          <span className="font-mono text-micro text-ink-light shrink-0">
            {pipelineComplete ? '100%' : `${Math.round(overallFill * 100)}%`}
          </span>
        </div>
      </div>
    </div>
  );
}

export default ImportCinematic;
