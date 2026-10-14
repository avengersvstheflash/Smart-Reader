import { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Zap,
  ChevronRight,
  ChevronLeft,
  ArrowUpRight,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';
import { useImportQueueStore } from '../../store/useImportQueueStore';
import { StageChecklist } from './StageChecklist';
import { ImportTask } from '../../types/domain';

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
    isDockExpanded,
    hasActiveWork,
    isDismissed,
    toggleDock,
    setDockExpanded,
    cancelTask,
    retryTask,
    dismiss,
    fetchQueue,
  } = useImportQueueStore();

  // Mobile media query check (<768px)
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 767px)').matches;
  });
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    const onChange = (e: MediaQueryListEvent | MediaQueryList) => {
      const matches = 'matches' in e ? e.matches : (e as MediaQueryList).matches;
      setIsMobile(matches);
      if (!matches) {
        setIsMobileSheetOpen(false);
      }
    };
    if (mql.addEventListener) {
      mql.addEventListener('change', onChange);
    } else {
      (mql as any).addListener(onChange);
    }
    return () => {
      if (mql.removeEventListener) {
        mql.removeEventListener('change', onChange);
      } else {
        (mql as any).removeListener(onChange);
      }
    };
  }, []);

  // Completion state tracking (green check for 5s then fades)
  const [recentlyCompleted, setRecentlyCompleted] = useState(false);
  const prevActiveRef = useRef<ImportTask | null>(null);

  useEffect(() => {
    if (prevActiveRef.current && !activeTask) {
      const prevId = prevActiveRef.current.id;
      const finished = historyTasks.find((t) => t.id === prevId);
      if (finished?.status === 'completed') {
        setRecentlyCompleted(true);
      }
    }
    prevActiveRef.current = activeTask;
  }, [activeTask, historyTasks]);

  useEffect(() => {
    if (!recentlyCompleted) return;
    const timer = setTimeout(() => {
      setRecentlyCompleted(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, [recentlyCompleted]);

  // Initial load: fetch queue
  useEffect(() => {
    void fetchQueue();
  }, [fetchQueue]);

  // If on the /import page itself, don't show floating widget
  if (isImportRoute) return null;

  // Auto-hides entirely when no active/queued/failed tasks (and not recently completed)
  const now = Date.now();
  const recentFailed = historyTasks.find((t) => {
    const time = t.completedAt || t.startedAt || t.createdAt;
    return t.status === 'failed' && time && now - new Date(time).getTime() < 30000;
  });
  const showFailed = Boolean(recentFailed && !isDismissed);
  const shouldRender = Boolean(hasActiveWork || activeTask || queuedTasks.length > 0 || recentlyCompleted || showFailed);

  if (!shouldRender) return null;

  const formatEta = (seconds: number | null): string => {
    if (seconds === null) return 'Estimating…';
    if (seconds < 60) return `~${seconds}s`;
    const mins = Math.floor(seconds / 60);
    return `~${mins}m`;
  };

  const topOffset = isReaderRoute ? 'top-12' : 'top-14';

  // Content shared between desktop expanded dock and mobile bottom sheet
  const renderExpandedContent = (isSheet = false) => (
    <div className="flex flex-col h-full bg-card text-ink select-none">
      {/* Header */}
      <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-brand shrink-0" />
            <h3 className="text-ui-sm font-semibold text-ink tracking-wider uppercase font-mono">
              Import Pipeline
            </h3>
          </div>
          <p className="text-micro text-ink-muted truncate">
            {pendingCount > 0
              ? `${pendingCount} ${pendingCount === 1 ? 'task' : 'tasks'} queued${
                  etaSeconds !== null ? ` · ${formatEta(etaSeconds)} remaining` : ''
                }`
              : recentlyCompleted
              ? 'Completed · Ready in library'
              : showFailed
              ? 'Attention needed'
              : 'Idle'}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {isSheet ? (
            <button
              type="button"
              onClick={() => setIsMobileSheetOpen(false)}
              className="p-1.5 rounded text-ink-muted hover:text-ink hover:bg-subtle transition-colors"
              title="Close"
              aria-label="Close import sheet"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={toggleDock}
              className="p-1.5 rounded text-ink-muted hover:text-ink hover:bg-subtle transition-colors"
              title="Collapse to rail"
              aria-label="Collapse import dock to rail"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Body: Active Task + Stage Checklist + Queued list */}
      <div className="flex-1 overflow-y-auto divide-y divide-line">
        {/* ACTIVE TASK */}
        {activeTask ? (
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between text-micro font-mono uppercase text-ink-muted tracking-wide">
              <span>Active Task</span>
              {etaSeconds !== null && (
                <span className="text-accent-ink">{formatEta(etaSeconds)}</span>
              )}
            </div>
            <div className="text-ui-sm font-medium text-ink truncate" title={activeTask.sourceTitle}>
              {activeTask.sourceTitle}
            </div>

            {/* Progress bar */}
            <div className="space-y-1">
              <div className="h-2 w-full bg-subtle rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand transition-all duration-300 rounded-full"
                  style={{ width: `${Math.max(5, activeTask.progress)}%` }}
                />
              </div>
              <div className="flex justify-between text-micro text-ink-muted font-mono">
                <span>{activeTask.progress}%</span>
                <span>{formatEta(etaSeconds)}</span>
              </div>
            </div>

            {/* Stage checklist (existing F69) */}
            <div className="pt-1 text-caption">
              <StageChecklist stages={activeTask.stages} isCompleted={activeTask.status === 'completed'} />
            </div>

            {/* Cancel Task */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => cancelTask(activeTask.id)}
                className="w-full py-1.5 px-3 rounded text-caption font-medium border border-line text-err hover:bg-err/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-err"
              >
                Cancel Task
              </button>
            </div>
          </div>
        ) : recentlyCompleted ? (
          <div className="p-4 space-y-2 bg-ok/5">
            <div className="flex items-center gap-2 text-ok text-ui-sm font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Import Complete</span>
            </div>
            <p className="text-caption text-ink-muted">
              Latest book successfully synthesized and ready in library.
            </p>
          </div>
        ) : showFailed && recentFailed ? (
          <div className="p-4 space-y-2 bg-err/5">
            <div className="flex items-center gap-2 text-err text-ui-sm font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Import Failed</span>
            </div>
            <p className="text-caption text-ink font-medium truncate">
              {recentFailed.sourceTitle}
            </p>
            {recentFailed.error && (
              <p className="text-micro text-err/90 line-clamp-2">
                {recentFailed.error}
              </p>
            )}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => retryTask(recentFailed.id)}
                className="py-1 px-3 rounded text-caption font-medium bg-brand text-white hover:bg-brand/90 transition-colors"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="py-1 px-3 rounded text-caption font-medium border border-line text-ink-muted hover:text-ink transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        {/* QUEUED (N) */}
        {queuedTasks.length > 0 && (
          <div className="p-4 space-y-2">
            <div className="text-micro font-mono uppercase text-ink-muted tracking-wide">
              Queued ({queuedTasks.length})
            </div>
            <ol className="space-y-2 text-caption">
              {queuedTasks.map((t, idx) => (
                <li key={t.id} className="flex items-start gap-2 text-ink-muted min-w-0">
                  <span className="font-mono text-micro text-ink-muted shrink-0 pt-0.5">
                    {idx + 1}.
                  </span>
                  <span className="truncate text-ink">{t.sourceTitle}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {/* Footer link to Full Import Workspace */}
      <div className="p-3 border-t border-line shrink-0 bg-card">
        <button
          type="button"
          onClick={() => {
            if (isSheet) setIsMobileSheetOpen(false);
            navigate('/import');
          }}
          className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-ui-sm font-medium text-brand hover:bg-brand/10 transition-colors"
        >
          <span>Full Import Workspace</span>
          <ArrowUpRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  // Narrow viewports (<768px): fixed bottom-center pill + bottom-sheet modal
  if (isMobile) {
    const pillText = activeTask
      ? `⚡ Importing ${activeTask.progress}% · ${formatEta(etaSeconds)}`
      : recentlyCompleted
      ? '✓ Import Complete'
      : showFailed
      ? '! Import Failed'
      : `⚡ ${pendingCount} ${pendingCount === 1 ? 'task' : 'tasks'}`;

    return (
      <>
        {/* Fixed bottom-center pill */}
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-card border border-line text-ink rounded-full px-4 py-2 shadow-xl flex items-center gap-2 text-caption font-medium cursor-pointer hover:border-brand transition-all select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          onClick={() => setIsMobileSheetOpen(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsMobileSheetOpen(true);
            }
          }}
          aria-label="Open import pipeline drawer"
        >
          {activeTask ? (
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand" />
            </span>
          ) : recentlyCompleted ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-ok shrink-0" />
          ) : showFailed ? (
            <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          ) : (
            <Zap className="w-3.5 h-3.5 text-brand shrink-0" />
          )}
          <span>{pillText}</span>
        </div>

        {/* Bottom sheet modal */}
        {isMobileSheetOpen && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end">
            <div
              className="fixed inset-0 bg-black/50"
              onClick={() => setIsMobileSheetOpen(false)}
              aria-hidden="true"
            />
            <div className="relative z-10 w-full max-h-[85vh] bg-card border-t border-line rounded-t-2xl shadow-2xl flex flex-col overflow-hidden">
              {renderExpandedContent(true)}
            </div>
          </div>
        )}
      </>
    );
  }

  // Desktop view: Right-side dock adhering to the right edge
  // Surface treatment: Opaque bg-card, border-l border-line, no backdrop-blur
  if (isDockExpanded) {
    return (
      <aside
        className={`fixed right-0 ${topOffset} bottom-0 z-40 w-80 bg-card border-l border-line text-ink flex flex-col shadow-2xl transition-all`}
        aria-label="Import pipeline dock"
      >
        {renderExpandedContent(false)}
      </aside>
    );
  }

  // Collapsed state (48px icon rail)
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - ((activeTask?.progress || 0) / 100) * circumference;

  return (
    <aside
      className={`fixed right-0 ${topOffset} bottom-0 z-40 w-12 bg-card border-l border-line text-ink flex flex-col items-center py-3 select-none cursor-pointer transition-all hover:border-brand/50`}
      onClick={() => setDockExpanded(true)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setDockExpanded(true);
        }
      }}
      aria-label="Expand import pipeline dock"
      title="Click to expand import dock"
    >
      {/* [<] Expand button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setDockExpanded(true);
        }}
        className="p-1.5 rounded text-ink-muted hover:text-ink hover:bg-subtle transition-colors"
        title="Expand import dock"
        aria-label="Expand import dock"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {/* Progress ring or status icon */}
      {activeTask ? (
        <div
          className="relative flex items-center justify-center my-3 animate-pulse"
          title={`Active: ${activeTask.sourceTitle} (${activeTask.progress}%)`}
        >
          <svg className="w-9 h-9 -rotate-90" viewBox="0 0 36 36">
            <circle
              cx="18"
              cy="18"
              r={radius}
              className="text-subtle stroke-current"
              strokeWidth="3"
              fill="transparent"
            />
            <circle
              cx="18"
              cy="18"
              r={radius}
              className="text-brand stroke-current transition-all duration-300"
              strokeWidth="3"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
            />
          </svg>
          <span className="absolute text-[9px] font-mono font-bold text-ink">
            {activeTask.progress}%
          </span>
        </div>
      ) : recentlyCompleted ? (
        <div className="my-3 text-ok" title="Import complete">
          <CheckCircle2 className="w-6 h-6 text-ok animate-pulse" />
        </div>
      ) : showFailed ? (
        <div className="my-3 text-amber-500" title={`Import failed: ${recentFailed?.sourceTitle || ''}`}>
          <AlertCircle className="w-6 h-6 text-amber-500" />
        </div>
      ) : null}

      {/* Queued count badge (placed above ETA pill per design spec) */}
      {queuedTasks.length > 0 && (
        <div className="flex flex-col items-center my-2" title={`${queuedTasks.length} queued`}>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-brand/15 text-brand">
            {queuedTasks.length}
          </span>
        </div>
      )}

      {/* Monotonic ETA pill */}
      {activeTask && etaSeconds !== null && (
        <div
          className="text-[10px] font-mono text-accent-ink bg-subtle px-1 py-0.5 rounded text-center my-1 max-w-[40px] truncate"
          title={`ETA: ${formatEta(etaSeconds)}`}
        >
          {formatEta(etaSeconds)}
        </div>
      )}

      {/* Bottom workspace shortcut icon */}
      <div className="mt-auto">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            navigate('/import');
          }}
          className="p-1.5 rounded text-ink-muted hover:text-ink hover:bg-subtle transition-colors"
          title="Full import workspace"
          aria-label="Full import workspace"
        >
          <ArrowUpRight className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
}

export default PersistentImportWidget;
