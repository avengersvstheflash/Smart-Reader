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

let pollTimer: ReturnType<typeof setTimeout> | null = null;

export const useImportQueueStore = create<ImportQueueState>((set, get) => {
  // Internal helper to calculate dynamic ETA
  const calculateEta = (activeTask: ImportTask | null): { etaSeconds: number | null; elapsedSeconds: number } => {
    if (!activeTask || !activeTask.startedAt) {
      return { etaSeconds: null, elapsedSeconds: 0 };
    }

    const startedMs = new Date(activeTask.startedAt).getTime();
    const now = Date.now();
    const elapsedSeconds = Math.max(1, Math.round((now - startedMs) / 1000));
    const progress = activeTask.progress;

    if (progress <= 5 || elapsedSeconds < 2) {
      return { etaSeconds: null, elapsedSeconds };
    }

    const rate = progress / elapsedSeconds; // percent per second
    if (rate <= 0) {
      return { etaSeconds: null, elapsedSeconds };
    }

    const remainingProgress = Math.max(0, 100 - progress);
    const rawEta = Math.round(remainingProgress / rate);
    const clampedEta = Math.max(3, Math.min(3600, rawEta));

    return { etaSeconds: clampedEta, elapsedSeconds };
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
