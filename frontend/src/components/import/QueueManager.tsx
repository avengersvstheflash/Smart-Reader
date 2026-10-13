import { useNavigate } from 'react-router-dom';
import {
  Clock,
  ArrowUp,
  ArrowDown,
  Trash2,
  RotateCw,
  XCircle,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  FileText,
  Globe,
  Layers,
  Sparkles,
} from 'lucide-react';
import { useImportQueueStore } from '../../store/useImportQueueStore';

export function QueueManager() {
  const navigate = useNavigate();
  const {
    activeTask,
    queuedTasks,
    historyTasks,
    etaSeconds,
    elapsedSeconds,
    cancelTask,
    retryTask,
    reorderTasks,
    removeTask,
    clearCompleted,
  } = useImportQueueStore();

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const newOrder = [...queuedTasks];
    const [moved] = newOrder.splice(index, 1);
    newOrder.splice(index - 1, 0, moved);
    void reorderTasks(newOrder.map((t) => t.id));
  };

  const handleMoveDown = (index: number) => {
    if (index >= queuedTasks.length - 1) return;
    const newOrder = [...queuedTasks];
    const [moved] = newOrder.splice(index, 1);
    newOrder.splice(index + 1, 0, moved);
    void reorderTasks(newOrder.map((t) => t.id));
  };

  const getSourceIcon = (type: string) => {
    switch (type) {
      case 'file':
        return <FileText className="w-3.5 h-3.5 text-accent-ink" aria-hidden="true" />;
      case 'paste':
        return <Layers className="w-3.5 h-3.5 text-brand" aria-hidden="true" />;
      case 'web':
      case 'web_multi':
        return <Globe className="w-3.5 h-3.5 text-neon-cyan" aria-hidden="true" />;
      default:
        return <BookOpen className="w-3.5 h-3.5 text-ink-muted" aria-hidden="true" />;
    }
  };

  const formatEta = (seconds: number | null): string => {
    if (seconds === null) return 'Calculating estimate…';
    if (seconds < 60) return `~${seconds}s remaining`;
    const mins = Math.floor(seconds / 60);
    const remSec = seconds % 60;
    return remSec > 0 ? `~${mins}m ${remSec}s remaining` : `~${mins}m remaining`;
  };

  return (
    <div className="w-full space-y-6">
      {/* ── Active Task Processing Card ── */}
      {activeTask && (
        <div className="rounded-xl border border-brand/40 bg-panel p-5 shadow-sm space-y-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-subtle">
            <div
              className="h-full bg-brand transition-all duration-300"
              style={{ width: `${Math.max(5, activeTask.progress)}%` }}
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-brand" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-subtle text-ink-muted uppercase tracking-wider">
                    {getSourceIcon(activeTask.type)}
                    {activeTask.type}
                  </span>
                  <h3 className="font-display font-medium text-ui-sm text-ink truncate" title={activeTask.sourceTitle}>
                    {activeTask.sourceTitle}
                  </h3>
                </div>
                <p className="text-caption text-ink-muted mt-0.5">{activeTask.stageLabel}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <div className="flex items-center gap-1.5 text-caption font-mono text-accent-ink justify-end">
                  <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{formatEta(etaSeconds)}</span>
                </div>
                <span className="text-[11px] text-ink-muted font-mono">{elapsedSeconds}s elapsed</span>
              </div>

              <button
                type="button"
                onClick={() => void cancelTask(activeTask.id)}
                className="px-2.5 py-1 rounded text-caption border border-err/30 text-err hover:bg-err/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-err select-none"
                title="Cancel active import"
              >
                Cancel
              </button>
            </div>
          </div>

          {/* Progress Bar + Stages Info */}
          <div className="space-y-1.5">
            <div className="h-2 w-full bg-surface rounded-full overflow-hidden border border-line">
              <div
                className="h-full bg-brand transition-all duration-300"
                style={{ width: `${Math.max(5, activeTask.progress)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-caption text-ink-muted">
              <span className="capitalize">Stage: {activeTask.stage}</span>
              <span className="font-mono text-ink-muted">{activeTask.progress}%</span>
            </div>
          </div>

          {/* Contextual reassurance notice */}
          <div className="rounded-lg bg-surface/60 border border-line p-3 flex items-start gap-2.5 text-caption text-ink-muted">
            <Sparkles className="w-4 h-4 text-brand shrink-0 mt-0.5" aria-hidden="true" />
            <p>
              Omnitome processes imports sequentially in the background. You can navigate to your library, reader, or
              research workspace while this completes.
            </p>
          </div>
        </div>
      )}

      {/* ── Pending Queue Section ── */}
      {queuedTasks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-ui-sm font-semibold text-ink flex items-center gap-2">
              <span>Next in Queue</span>
              <span className="px-2 py-0.5 text-micro rounded-full bg-brand/10 text-brand font-mono font-medium">
                {queuedTasks.length}
              </span>
            </h4>
            <span className="text-caption text-ink-muted">Processed sequentially</span>
          </div>

          <div className="divide-y divide-line rounded-xl border border-line bg-panel overflow-hidden shadow-xs">
            {queuedTasks.map((task, idx) => (
              <div key={task.id} className="p-3.5 flex items-center justify-between gap-3 hover:bg-subtle/40 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-6 h-6 rounded-full bg-subtle border border-line text-ink-muted text-micro font-mono flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted">
                        {getSourceIcon(task.type)}
                      </span>
                      <p className="text-ui-sm font-medium text-ink truncate" title={task.sourceTitle}>
                        {task.sourceTitle}
                      </p>
                    </div>
                    <p className="text-caption text-ink-muted truncate">
                      {task.sourceMeta?.dossierTitle ? `Destination: ${task.sourceMeta.dossierTitle} · ` : ''}
                      Waiting in queue
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => handleMoveUp(idx)}
                    className="p-1 rounded text-ink-muted hover:text-ink hover:bg-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="Move up in queue"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === queuedTasks.length - 1}
                    onClick={() => handleMoveDown(idx)}
                    className="p-1 rounded text-ink-muted hover:text-ink hover:bg-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="Move down in queue"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeTask(task.id)}
                    className="p-1 rounded text-ink-muted hover:text-err hover:bg-err/10 transition-colors ml-1"
                    title="Remove from queue"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Recent History Section ── */}
      {historyTasks.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h4 className="text-ui-sm font-semibold text-ink flex items-center gap-2">
              <span>Recent Activity</span>
              <span className="text-caption text-ink-muted font-normal">({historyTasks.length})</span>
            </h4>
            <button
              type="button"
              onClick={() => void clearCompleted()}
              className="text-caption text-ink-muted hover:text-ink transition-colors"
            >
              Clear finished
            </button>
          </div>

          <div className="divide-y divide-line rounded-xl border border-line bg-panel overflow-hidden shadow-xs">
            {historyTasks.slice(0, 10).map((task) => {
              const isCompleted = task.status === 'completed';
              const isFailed = task.status === 'failed';
              const isCancelled = task.status === 'cancelled';

              return (
                <div key={task.id} className="p-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0">
                      {isCompleted ? (
                        <CheckCircle2 className="w-4 h-4 text-ok" aria-hidden="true" />
                      ) : isFailed ? (
                        <AlertCircle className="w-4 h-4 text-err" aria-hidden="true" />
                      ) : (
                        <XCircle className="w-4 h-4 text-ink-muted" aria-hidden="true" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-ui-sm font-medium text-ink truncate" title={task.sourceTitle}>
                        {task.sourceTitle}
                      </p>
                      <p className="text-caption text-ink-muted truncate">
                        {isCompleted
                          ? 'Book ready'
                          : isFailed
                          ? task.error || 'Failed'
                          : 'Cancelled'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isCompleted && task.bookId && (
                      <button
                        type="button"
                        onClick={() => navigate(`/book/${task.bookId}`)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-caption border border-line bg-card hover:bg-subtle text-ink font-medium transition-colors"
                      >
                        <BookOpen className="w-3.5 h-3.5 text-brand" />
                        <span>Open book</span>
                      </button>
                    )}

                    {(isFailed || isCancelled) && (
                      <button
                        type="button"
                        onClick={() => void retryTask(task.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-caption border border-brand/30 bg-card hover:bg-brand/10 text-brand font-medium transition-colors"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                        <span>Retry</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => void removeTask(task.id)}
                      className="p-1 rounded text-ink-muted hover:text-err hover:bg-err/10 transition-colors"
                      title="Delete record"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default QueueManager;
