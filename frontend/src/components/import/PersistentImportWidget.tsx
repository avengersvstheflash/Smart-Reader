import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronUp,
  ChevronDown,
  Clock,
  Layers,
  ArrowUpRight,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';
import { useImportQueueStore } from '../../store/useImportQueueStore';
import { QueueManager } from './QueueManager';
import { StageChecklist } from './StageChecklist';

export function PersistentImportWidget() {
  const location = useLocation();
  const navigate = useNavigate();
  const isImportRoute = location.pathname === '/import';
  const isReaderRoute = location.pathname.startsWith('/read/');

  const {
    activeTask,
    queuedTasks,
    historyTasks,
    pendingCount,
    etaSeconds,
    isMinimized,
    isDismissed,
    toggleMinimized,
    setMinimized,
    dismiss,
    fetchQueue,
  } = useImportQueueStore();

  // Initial load: fetch queue
  useEffect(() => {
    void fetchQueue();
  }, [fetchQueue]);

  // If on the /import page itself, don't show floating widget to prevent double display
  if (isImportRoute) return null;

  // If dismissed and no active or pending tasks, hide
  const hasWork = Boolean(activeTask || queuedTasks.length > 0);
  const recentFinished = historyTasks[0];
  if (isDismissed || (!hasWork && !recentFinished)) return null;

  const formatEta = (seconds: number | null): string => {
    if (seconds === null) return 'Estimating…';
    if (seconds < 60) return `~${seconds}s`;
    const mins = Math.floor(seconds / 60);
    return `~${mins}m`;
  };

  // Ultra-compact reader mode pill
  if (isReaderRoute && isMinimized) {
    if (!hasWork) return null;
    return (
      <div
        className="fixed bottom-16 right-4 z-40 bg-surface/90 backdrop-blur-md border border-line text-ink rounded-full px-3 py-1.5 shadow-lg flex items-center gap-2 text-micro cursor-pointer hover:border-brand transition-all select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        onClick={() => setMinimized(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setMinimized(false);
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="Active background import status"
      >
        <span className="w-2 h-2 rounded-full bg-brand animate-ping" />
        <span className="font-mono text-ink-muted">{activeTask?.progress || 0}%</span>
        {etaSeconds !== null && (
          <span className="font-mono text-accent-ink">{formatEta(etaSeconds)}</span>
        )}
      </div>
    );
  }

  return (
    <div
      className={`fixed ${isReaderRoute ? 'bottom-16 right-4' : 'bottom-4 right-4'} z-40 max-w-sm sm:max-w-md w-full shadow-2xl rounded-2xl border border-line bg-panel/95 backdrop-blur-md text-ink transition-all overflow-hidden`}
      role="region"
      aria-label="Persistent Import Pipeline"
    >
      {/* ── Top Bar / Collapsed View ── */}
      <div
        className="px-4 py-3 flex items-center justify-between gap-3 cursor-pointer select-none bg-surface/50 hover:bg-surface transition-colors"
        onClick={toggleMinimized}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {activeTask ? (
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand" />
            </span>
          ) : recentFinished?.status === 'completed' ? (
            <CheckCircle2 className="w-4 h-4 text-ok shrink-0" aria-hidden="true" />
          ) : recentFinished?.status === 'failed' ? (
            <AlertCircle className="w-4 h-4 text-err shrink-0" aria-hidden="true" />
          ) : (
            <Layers className="w-4 h-4 text-ink-muted shrink-0" aria-hidden="true" />
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className="text-ui-sm font-semibold text-ink truncate">
                {activeTask
                  ? activeTask.sourceTitle
                  : recentFinished?.status === 'completed'
                  ? 'Book ready'
                  : 'Import pipeline'}
              </h4>
              {queuedTasks.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-brand/15 text-brand font-mono font-medium">
                  +{queuedTasks.length} queued
                </span>
              )}
            </div>
            <p className="text-micro text-ink-muted truncate">
              {activeTask ? activeTask.stageLabel : recentFinished?.sourceTitle || 'Idle'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          {activeTask && (
            <div className="flex items-center gap-1 text-caption font-mono text-accent-ink mr-1">
              <Clock className="w-3 h-3" />
              <span>{formatEta(etaSeconds)}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => navigate('/import')}
            className="p-1 rounded text-ink-muted hover:text-ink hover:bg-subtle transition-colors"
            title="Open import workspace"
          >
            <ArrowUpRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={toggleMinimized}
            className="p-1 rounded text-ink-muted hover:text-ink hover:bg-subtle transition-colors"
            title={isMinimized ? 'Expand queue' : 'Minimize'}
          >
            {isMinimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {!hasWork && (
            <button
              type="button"
              onClick={dismiss}
              className="p-1 rounded text-ink-muted hover:text-ink hover:bg-subtle transition-colors"
              title="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Hairline Progress Bar */}
      {activeTask && (
        <div className="h-[2px] w-full bg-line overflow-hidden">
          <div
            className="h-full bg-brand transition-all duration-300"
            style={{ width: `${Math.max(5, activeTask.progress)}%` }}
          />
        </div>
      )}

      {/* Active Task Compact Stage Checklist */}
      {activeTask && isMinimized && (
        <div className="px-4 py-2.5 bg-surface/30 border-t border-line text-caption">
          <StageChecklist stages={activeTask.stages} isCompleted={activeTask.status === 'completed'} />
        </div>
      )}

      {/* ── Expanded Drawer ── */}
      {!isMinimized && (
        <div className="p-4 max-h-[380px] overflow-y-auto space-y-4 border-t border-line">
          <QueueManager />

          <div className="pt-2 border-t border-line flex justify-between items-center">
            <span className="text-caption text-ink-muted">
              {pendingCount} {pendingCount === 1 ? 'task' : 'tasks'} in queue
            </span>
            <button
              type="button"
              onClick={() => navigate('/import')}
              className="text-caption font-medium text-brand hover:underline inline-flex items-center gap-1"
            >
              <span>Full import workspace</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default PersistentImportWidget;
