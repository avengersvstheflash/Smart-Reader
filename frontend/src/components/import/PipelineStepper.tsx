import { Check, Loader2, Circle, AlertCircle, AlertTriangle } from 'lucide-react';
import { Job } from '../../types/domain';
import { isActiveStatus } from '../../hooks/useJobs';

export interface PipelineStepperProps {
  jobs: Job[];
  activeJob: Job | null;
}

interface StepConfig {
  key: string;
  label: string;
  jobType: string;
}

const STEPS: StepConfig[] = [
  { key: 'ingest', label: 'Intake & parse', jobType: 'INGEST' },
  { key: 'index', label: 'Semantic index', jobType: 'SEMANTIC_INDEX' },
  { key: 'synopsis', label: 'Synopsis', jobType: 'SYNOPSIS' },
  { key: 'summary', label: 'Book summary', jobType: 'BOOK_SUMMARY' },
];

export function PipelineStepper({ jobs, activeJob }: PipelineStepperProps) {
  const hasInterrupted = jobs.some((j) => j.status.toUpperCase() === 'INTERRUPTED');
  const hasFailed = jobs.some((j) => j.status.toLowerCase() === 'failed');
  const hasCompletedAny = jobs.some((j) => j.status === 'COMPLETED');
  const pipelineComplete = !activeJob && hasCompletedAny && !hasInterrupted && !hasFailed;

  const findJobForStep = (stepJobType: string): Job | undefined => {
    if (stepJobType === 'INGEST') {
      return jobs.find((j) => j.type === 'INGEST' || j.type === 'WEB_IMPORT');
    }
    return jobs.find((j) => j.type === stepJobType);
  };

  // Find index of highest active or completed step to mark preceding steps as completed
  const activeStepIndex = STEPS.findIndex((s) => {
    const j = findJobForStep(s.jobType);
    return j && isActiveStatus(j.status);
  });

  return (
    <div className="w-full flex flex-col" role="region" aria-label="Pipeline progress">
      <ul className="divide-y divide-line/40">
        {STEPS.map((step, idx) => {
          const job = findJobForStep(step.jobType);

          // Determine step state
          let status: 'completed' | 'active' | 'pending' | 'failed' | 'interrupted' = 'pending';

          if (pipelineComplete) {
            status = 'completed';
          } else if (job) {
            if (job.status === 'COMPLETED') {
              status = 'completed';
            } else if (isActiveStatus(job.status)) {
              status = 'active';
            } else if (job.status.toLowerCase() === 'failed') {
              status = 'failed';
            } else if (job.status.toUpperCase() === 'INTERRUPTED') {
              status = 'interrupted';
            }
          } else if (activeStepIndex > idx) {
            // Prior step whose job completed or was implied
            status = 'completed';
          }

          return (
            <li
              key={step.key}
              className="flex items-center gap-3 py-2 text-ui-sm select-none"
            >
              {/* Left icon column */}
              <div className="w-6 flex items-center justify-center shrink-0">
                {status === 'completed' && (
                  <Check className="w-4 h-4 text-ink shrink-0" aria-hidden="true" />
                )}
                {status === 'active' && (
                  <Loader2 className="w-4 h-4 animate-spin text-accent-ink shrink-0" aria-hidden="true" />
                )}
                {status === 'pending' && (
                  <Circle className="w-3.5 h-3.5 text-ink-light/40 shrink-0" aria-hidden="true" />
                )}
                {status === 'failed' && (
                  <AlertCircle className="w-4 h-4 text-err shrink-0" aria-hidden="true" />
                )}
                {status === 'interrupted' && (
                  <AlertTriangle className="w-4 h-4 text-warn shrink-0" aria-hidden="true" />
                )}
              </div>

              {/* Right text column */}
              <div className="flex-1 flex items-center justify-between min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={
                      status === 'completed'
                        ? 'text-ink font-medium'
                        : status === 'active'
                        ? 'text-accent-ink font-semibold'
                        : status === 'failed'
                        ? 'text-err font-medium'
                        : status === 'interrupted'
                        ? 'text-warn font-medium'
                        : 'text-ink-muted/60'
                    }
                  >
                    {step.label}
                    {status === 'interrupted' && ' (interrupted)'}
                  </span>

                  {status === 'interrupted' && (
                    <span className="text-caption text-ink-muted select-none">
                      Retry is safe
                    </span>
                  )}
                </div>

                {status === 'active' && job && typeof job.progress === 'number' && job.progress > 0 && (
                  <span className="text-micro font-mono text-accent-ink px-1.5 py-0.5 rounded bg-accent-wash/30">
                    {Math.round(job.progress)}%
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {pipelineComplete && (
        <div className="mt-3 pt-2 text-caption text-ink font-medium flex items-center gap-1.5 select-none">
          <Check className="w-3.5 h-3.5 text-ok" aria-hidden="true" />
          <span>Import complete</span>
        </div>
      )}
    </div>
  );
}

export default PipelineStepper;
