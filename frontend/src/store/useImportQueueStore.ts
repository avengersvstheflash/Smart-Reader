import { create } from 'zustand';
import { apiClient } from '../api/client';
import { ImportTask, RawImportTask, normalizeImportTask } from '../types/domain';

interface QueueApiResponse {
  success: boolean;
  active: RawImportTask | null;
  queued: RawImportTask[];
  history: RawImportTask[];
  totalCount: number;
  pendingCount: number;
}

interface ImportQueueState {
  activeTask: ImportTask | null;
  queuedTasks: ImportTask[];
  historyTasks: ImportTask[];
  allTasks: ImportTask[];
  totalCount: number;
  pendingCount: number;
  isLoading: boolean;
  isPolling: boolean;
  isMinimized: boolean;
  isDismissed: boolean;
  etaSeconds: number | null;
  elapsedSeconds: number;

  // Actions
  fetchQueue: () => Promise<void>;
  enqueueFiles: (files: File[], dossierId?: string) => Promise<ImportTask[]>;
  enqueuePaste: (data: {
    title: string;
    author?: string;
    text: string;
    dossierId?: string;
    dossierTitle?: string;
    isNewDossier: boolean;
  }) => Promise<ImportTask>;
  enqueueWeb: (data: {
    url: string;
    title?: string;
    author?: string;
    dossierId?: string;
    description?: string;
    contentType?: string;
  }) => Promise<ImportTask>;
  enqueueWebMulti: (data: {
    sources: { url: string; title: string }[];
    title?: string;
    dossierId?: string;
    description?: string;
    contentType?: string;
  }) => Promise<ImportTask>;
  cancelTask: (id: string) => Promise<boolean>;
  retryTask: (id: string) => Promise<ImportTask | null>;
  reorderTasks: (taskIds: string[]) => Promise<void>;
  removeTask: (id: string) => Promise<boolean>;
  clearCompleted: () => Promise<void>;
  toggleMinimized: () => void;
  setMinimized: (val: boolean) => void;
  dismiss: () => void;
  show: () => void;
}

interface ProgressTick {
  timestamp: number;
  progress: number;
}

// Predictive, monotonic ETA state tracker (F77)
const etaTracker = {
  taskId: null as string | null,
  stage: null as string | null,
  ticks: [] as ProgressTick[],
  lastMonotonicEta: null as number | null,
};

let pollTimer: ReturnType<typeof setTimeout> | null = null;

export const useImportQueueStore = create<ImportQueueState>((set, get) => {
  // Internal helper to calculate dynamic ETA (F77)
  const calculateEta = (activeTask: ImportTask | null): { etaSeconds: number | null; elapsedSeconds: number } => {
    if (!activeTask || !activeTask.startedAt || activeTask.status !== 'processing') {
      etaTracker.taskId = null;
      etaTracker.stage = null;
      etaTracker.ticks = [];
      etaTracker.lastMonotonicEta = null;
      return { etaSeconds: null, elapsedSeconds: 0 };
    }

    const now = Date.now();
    const startedMs = new Date(activeTask.startedAt).getTime();
    const elapsedSeconds = Math.max(1, Math.round((now - startedMs) / 1000));
    const progress = activeTask.progress;

    // Reset tracking if task changed
    if (etaTracker.taskId !== activeTask.id) {
      etaTracker.taskId = activeTask.id;
      etaTracker.stage = activeTask.stage;
      etaTracker.ticks = [];
      etaTracker.lastMonotonicEta = null;
    } else if (etaTracker.stage !== activeTask.stage) {
      // Rule 3: Reset rolling window when a new stage begins (preserving monotonic clamp across the task)
      etaTracker.stage = activeTask.stage;
      etaTracker.ticks = [];
    }

    // Record progress tick (rate-limited to at most one tick per 300ms)
    const lastTick = etaTracker.ticks[etaTracker.ticks.length - 1];
    if (!lastTick || now - lastTick.timestamp >= 300) {
      etaTracker.ticks.push({ timestamp: now, progress });
      if (etaTracker.ticks.length > 10) {
        etaTracker.ticks.shift();
      }
    }

    if (progress >= 100) {
      etaTracker.lastMonotonicEta = 0;
      return { etaSeconds: 0, elapsedSeconds };
    }

    // Require at least 5 ticks to compute reliable rolling rate
    if (etaTracker.ticks.length < 5) {
      return { etaSeconds: etaTracker.lastMonotonicEta, elapsedSeconds };
    }

    // Rule 1: Calculate rolling average progress rate over the last 5+ ticks
    const firstTick = etaTracker.ticks[0];
    const latestTick = etaTracker.ticks[etaTracker.ticks.length - 1];
    const windowSeconds = (latestTick.timestamp - firstTick.timestamp) / 1000;
    const windowProgressDelta = latestTick.progress - firstTick.progress;

    const remainingProgress = Math.max(0, 100 - progress);

    let observedRate: number | null = null;
    if (windowSeconds > 0 && windowProgressDelta > 0) {
      observedRate = windowProgressDelta / windowSeconds;
    } else if (elapsedSeconds > 0 && progress > 0) {
      // Fallback to cumulative average rate if progress hasn't moved within the rolling window
      observedRate = progress / elapsedSeconds;
    }

    let finalEta: number | null = etaTracker.lastMonotonicEta;
    if (observedRate && observedRate > 0) {
      const rawEta = Math.max(1, Math.min(3600, Math.round(remainingProgress / observedRate)));
      // Rule 2: Clamp to be monotonically non-increasing while a task is running (allow small jitter down, never up)
      if (etaTracker.lastMonotonicEta !== null) {
        finalEta = Math.min(etaTracker.lastMonotonicEta, rawEta);
      } else {
        finalEta = rawEta;
      }
    }

    etaTracker.lastMonotonicEta = finalEta;
    return { etaSeconds: finalEta, elapsedSeconds };
  };

  const scheduleNextPoll = (hasPendingWork: boolean) => {
    if (pollTimer) clearTimeout(pollTimer);
    const interval = hasPendingWork ? 1000 : 5000;
    pollTimer = setTimeout(() => {
      void get().fetchQueue();
    }, interval);
  };

  return {
    activeTask: null,
    queuedTasks: [],
    historyTasks: [],
    allTasks: [],
    totalCount: 0,
    pendingCount: 0,
    isLoading: false,
    isPolling: false,
    isMinimized: true,
    isDismissed: false,
    etaSeconds: null,
    elapsedSeconds: 0,

    fetchQueue: async () => {
      try {
        const res = await apiClient<QueueApiResponse>('/api/import/queue');
        const active = res.active ? normalizeImportTask(res.active) : null;
        const queued = (res.queued || []).map(normalizeImportTask);
        const history = (res.history || []).map(normalizeImportTask);

        const allTasks = [...(active ? [active] : []), ...queued, ...history];
        const pendingCount = queued.length + (active ? 1 : 0);
        const { etaSeconds, elapsedSeconds } = calculateEta(active);

        // Auto undis-miss if new items appear in queue
        const shouldUnDismiss = pendingCount > 0 && get().isDismissed;

        set({
          activeTask: active,
          queuedTasks: queued,
          historyTasks: history,
          allTasks,
          totalCount: res.totalCount || allTasks.length,
          pendingCount,
          etaSeconds,
          elapsedSeconds,
          isDismissed: shouldUnDismiss ? false : get().isDismissed,
        });

        scheduleNextPoll(pendingCount > 0);
      } catch (err) {
        console.warn('[useImportQueueStore] fetchQueue error:', err);
        scheduleNextPoll(false);
      }
    },

    enqueueFiles: async (files: File[], dossierId?: string) => {
      const formData = new FormData();
      for (const file of files) {
        formData.append('files', file);
      }
      if (dossierId) formData.append('dossierId', dossierId);

      set({ isDismissed: false });

      const res = await fetch('/api/import/queue/files', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Upload failed with status ${res.status}`);
      }

      const json = (await res.json()) as { success: boolean; tasks: RawImportTask[] };
      const tasks = (json.tasks || []).map(normalizeImportTask);
      void get().fetchQueue();
      return tasks;
    },

    enqueuePaste: async (data) => {
      set({ isDismissed: false });
      const res = await apiClient<{ success: boolean; task: RawImportTask }>('/api/import/queue/paste', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      const task = normalizeImportTask(res.task);
      void get().fetchQueue();
      return task;
    },

    enqueueWeb: async (data) => {
      set({ isDismissed: false });
      const res = await apiClient<{ success: boolean; task: RawImportTask }>('/api/import/queue/web', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      const task = normalizeImportTask(res.task);
      void get().fetchQueue();
      return task;
    },

    enqueueWebMulti: async (data) => {
      set({ isDismissed: false });
      const res = await apiClient<{ success: boolean; task: RawImportTask }>('/api/import/queue/web-multi', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      const task = normalizeImportTask(res.task);
      void get().fetchQueue();
      return task;
    },

    cancelTask: async (id: string) => {
      try {
        const res = await apiClient<{ success: boolean }>(`/api/import/queue/${id}/cancel`, {
          method: 'POST',
        });
        void get().fetchQueue();
        return res.success;
      } catch (err) {
        console.warn('cancelTask error:', err);
        return false;
      }
    },

    retryTask: async (id: string) => {
      try {
        set({ isDismissed: false });
        const res = await apiClient<{ success: boolean; task: RawImportTask }>(`/api/import/queue/${id}/retry`, {
          method: 'POST',
        });
        const task = normalizeImportTask(res.task);
        void get().fetchQueue();
        return task;
      } catch (err) {
        console.warn('retryTask error:', err);
        return null;
      }
    },

    reorderTasks: async (taskIds: string[]) => {
      try {
        await apiClient('/api/import/queue/reorder', {
          method: 'POST',
          body: JSON.stringify({ taskIds }),
        });
        void get().fetchQueue();
      } catch (err) {
        console.warn('reorderTasks error:', err);
      }
    },

    removeTask: async (id: string) => {
      try {
        const res = await apiClient<{ success: boolean }>(`/api/import/queue/${id}`, {
          method: 'DELETE',
        });
        void get().fetchQueue();
        return res.success;
      } catch (err) {
        console.warn('removeTask error:', err);
        return false;
      }
    },

    clearCompleted: async () => {
      try {
        await apiClient('/api/import/queue/clear-completed', {
          method: 'POST',
        });
        void get().fetchQueue();
      } catch (err) {
        console.warn('clearCompleted error:', err);
      }
    },

    toggleMinimized: () => set((state) => ({ isMinimized: !state.isMinimized })),
    setMinimized: (val: boolean) => set({ isMinimized: val }),
    dismiss: () => set({ isDismissed: true }),
    show: () => set({ isDismissed: false, isMinimized: false }),
  };
});
