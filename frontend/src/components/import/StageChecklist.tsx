import React, { useState, useEffect } from 'react';
import { ImportTaskStage } from '../../types/domain';

interface StageDefinition {
  stage: string;
  doneLabel: string;
  activeLabel: string;
  pendingLabel: string;
}

const STAGE_DEFINITIONS: StageDefinition[] = [
  { stage: 'ingest', doneLabel: 'Imported', activeLabel: 'Importing…', pendingLabel: 'Import' },
  { stage: 'semantic_index', doneLabel: 'Indexed', activeLabel: 'Indexing…', pendingLabel: 'Index' },
  { stage: 'classify', doneLabel: 'Classified', activeLabel: 'Classifying…', pendingLabel: 'Classify' },
  { stage: 'outline', doneLabel: 'Outline built', activeLabel: 'Building outline…', pendingLabel: 'Outline' },
  { stage: 'synopsis', doneLabel: 'Synopsis written', activeLabel: 'Writing synopsis…', pendingLabel: 'Writing synopsis…' },
  { stage: 'synthesis', doneLabel: 'Chapters compressed', activeLabel: 'Compressing chapters…', pendingLabel: 'Compressing chapters' },
  { stage: 'attribution', doneLabel: 'Sources traced', activeLabel: 'Tracing sources…', pendingLabel: 'Tracing sources' },
];

export interface StageChecklistProps {
  stages?: ImportTaskStage[];
  isCompleted?: boolean;
  className?: string;
}

export const StageChecklist: React.FC<StageChecklistProps> = ({
  stages = [],
  isCompleted = false,
  className = '',
}) => {
  const stageMap = new Map<string, ImportTaskStage>();
  for (const s of stages) {
    stageMap.set(s.stage, s);
  }

  const items = STAGE_DEFINITIONS.map((def) => {
    const recorded = stageMap.get(def.stage);
    let status: 'pending' | 'running' | 'done' | 'failed' | 'skipped' = recorded?.status || 'pending';
    if (isCompleted && status !== 'skipped' && status !== 'failed') {
      status = 'done';
    }

    let label = def.pendingLabel;
    if (status === 'done') {
      label = def.doneLabel;
    } else if (status === 'running') {
      label = def.activeLabel;
    } else if (status === 'skipped') {
      label = `${def.doneLabel} (skipped)`;
    } else if (status === 'failed') {
      label = `${def.doneLabel} (failed)`;
    }

    return {
      stage: def.stage,
      status,
      label,
    };
  });

  const allFinished = isCompleted || items.every((i) => i.status === 'done' || i.status === 'skipped');
  const [isExpanded, setIsExpanded] = useState(!allFinished);

  useEffect(() => {
    if (!allFinished) {
      setIsExpanded(true);
    }
  }, [allFinished]);

  if (allFinished && !isExpanded) {
    return (
      <div className={`py-1 ${className}`}>
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="flex items-center justify-between w-full text-caption text-ink-muted hover:text-ink font-mono transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <span className="text-ok font-bold">✓</span> All pipeline stages completed
          </span>
          <span className="text-micro text-ink-faint">Show details ▾</span>
        </button>
      </div>
    );
  }

  return (
    <div className={`space-y-1.5 py-1 ${className}`}>
      {allFinished && (
        <div className="flex items-center justify-between pb-1 text-micro font-mono text-ink-faint">
          <span>Stages (7/7 complete)</span>
          <button
            type="button"
            onClick={() => setIsExpanded(false)}
            className="hover:text-ink transition-colors"
          >
            Collapse ▴
          </button>
        </div>
      )}
      <div className="space-y-1.5 font-mono text-ui-sm">
        {items.map((item) => (
          <div key={item.stage} className="flex items-center gap-2">
            {item.status === 'done' ? (
              <span className="text-ok font-bold select-none w-3.5 text-center">✓</span>
            ) : item.status === 'running' ? (
              <span className="text-brand font-bold animate-pulse select-none w-3.5 text-center">◐</span>
            ) : item.status === 'failed' ? (
              <span className="text-err font-bold select-none w-3.5 text-center">✗</span>
            ) : item.status === 'skipped' ? (
              <span className="text-ink-faint select-none w-3.5 text-center">—</span>
            ) : (
              <span className="text-ink-faint select-none w-3.5 text-center">○</span>
            )}
            <span
              className={
                item.status === 'done'
                  ? 'text-ink-muted'
                  : item.status === 'running'
                  ? 'text-ink font-semibold'
                  : 'text-ink-faint'
              }
            >
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StageChecklist;

