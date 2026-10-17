import { create } from 'zustand';
import { ModelResource, ResourceStatusResponse, ProgressEventPayload } from '../types/resources';
import { apiClient, apiUrl } from '../api/client';

interface ResourceState {
  status: ResourceStatusResponse | null;
  isLoading: boolean;
  isDownloading: boolean;
  error: string | null;
  diskSpaceError: { requiredBytes: number; availableBytes: number } | null;
  eventSource: EventSource | null;

  fetchStatus: () => Promise<void>;
  startDownload: (modelIds?: string[]) => Promise<void>;
  cancelDownload: (modelId?: string) => Promise<void>;
  connectSSE: () => void;
  disconnectSSE: () => void;
  clearError: () => void;
}

let fetchStatusPromise: Promise<void> | null = null;

export const useResourceStore = create<ResourceState>((set, get) => ({
  status: null,
  isLoading: true,
  isDownloading: false,
  error: null,
  diskSpaceError: null,
  eventSource: null,

  clearError: () => {
    set({
      error: null,
      diskSpaceError: null,
      isDownloading: false,
    });
  },

  fetchStatus: async () => {
    if (fetchStatusPromise) {
      return fetchStatusPromise;
    }

    if (!get().status) {
      set({ isLoading: true });
    }

    fetchStatusPromise = (async () => {
      try {
        const data = await apiClient<ResourceStatusResponse>('/api/resources/status');
        console.log('[useResourceStore] Fetched /api/resources/status:', data);
        set({ status: data, isLoading: false, error: null });
        if (data.allInstalled) {
          get().disconnectSSE();
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to query resource status';
        set({ error: msg, isLoading: false });
      } finally {
        fetchStatusPromise = null;
      }
    })();

    return fetchStatusPromise;
  },

  connectSSE: () => {
    if (get().eventSource) return;

    const url = apiUrl('/api/resources/progress');
    const es = new EventSource(url);

    es.addEventListener('status', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as ResourceStatusResponse;
        set({ status: data });
      } catch (_) {}
    });

    es.addEventListener('progress', (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data) as ProgressEventPayload;
        const current = get().status;
        if (!current) return;

        const updatedModels = current.models.map((m: ModelResource) => {
          if (m.id === payload.modelId) {
            return {
              ...m,
              status: payload.status,
              bytesDownloaded: payload.bytesDownloaded,
              progress: payload.progress,
              speedBps: payload.speedBps,
              etaSeconds: payload.etaSeconds,
            };
          }
          return m;
        });

        const overallProgress = payload.overallProgress !== undefined
          ? payload.overallProgress
          : current.overallProgress;

        set({
          isDownloading: true,
          status: {
            ...current,
            overallProgress,
            totalDownloadedBytes: payload.overallBytesDownloaded || current.totalDownloadedBytes,
            models: updatedModels,
          },
        });
      } catch (_) {}
    });

    es.addEventListener('verifying', (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data) as { modelId: string };
        const current = get().status;
        if (!current) return;

        const updatedModels = current.models.map((m: ModelResource) => {
          if (m.id === payload.modelId) {
            return { ...m, status: 'verifying' as const };
          }
          return m;
        });

        set({ status: { ...current, models: updatedModels } });
      } catch (_) {}
    });

    es.addEventListener('model_complete', (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data) as { modelId: string };
        const current = get().status;
        if (!current) return;

        const updatedModels = current.models.map((m: ModelResource) => {
          if (m.id === payload.modelId) {
            return { ...m, status: 'installed' as const, progress: 100 };
          }
          return m;
        });

        set({ status: { ...current, models: updatedModels } });
      } catch (_) {}
    });

    es.addEventListener('all_complete', () => {
      set({ isDownloading: false });
      get().fetchStatus();
    });

    es.addEventListener('error', (e: MessageEvent) => {
      try {
        if (e.data) {
          const payload = JSON.parse(e.data) as { modelId?: string; code?: string; error?: string };
          const errorMessage = payload.error || 'Download failed';
          const current = get().status;

          let updatedModels = current?.models;
          if (current) {
            updatedModels = current.models.map((m: ModelResource) => {
              if (payload.modelId ? m.id === payload.modelId : (m.status === 'downloading' || m.status === 'verifying')) {
                return {
                  ...m,
                  status: 'error' as const,
                  speedBps: 0,
                  etaSeconds: 0,
                  error: errorMessage,
                };
              }
              return m;
            });
          }

          set({
            error: errorMessage,
            isDownloading: false,
            status: current ? { ...current, models: updatedModels || current.models } : null,
          });
        }
      } catch (_) {}
    });

    es.onerror = () => {
      // If EventSource is closed or failed while download was active, don't leave UI hanging at 100%
      if (es.readyState === 2 && get().isDownloading) {
        const current = get().status;
        let updatedModels = current?.models;
        if (current) {
          updatedModels = current.models.map((m: ModelResource) => {
            if (m.status === 'downloading' || m.status === 'verifying') {
              return {
                ...m,
                status: 'error' as const,
                speedBps: 0,
                etaSeconds: 0,
                error: 'Connection to download service lost',
              };
            }
            return m;
          });
        }
        set({
          error: 'Connection to download service was lost. Please retry.',
          isDownloading: false,
          status: current ? { ...current, models: updatedModels || current.models } : null,
        });
      }
    };

    set({ eventSource: es });
  },

  disconnectSSE: () => {
    const es = get().eventSource;
    if (es) {
      es.close();
      set({ eventSource: null });
    }
  },

  startDownload: async (modelIds?: string[]) => {
    const current = get().status;
    let updatedModels = current?.models;
    if (current) {
      updatedModels = current.models.map((m: ModelResource) => {
        if (m.status === 'error') {
          return { ...m, status: 'missing' as const, error: null };
        }
        return m;
      });
    }

    set({
      error: null,
      diskSpaceError: null,
      isDownloading: true,
      status: current ? { ...current, models: updatedModels || current.models } : null,
    });
    get().connectSSE();

    try {
      await apiClient('/api/resources/download', {
        method: 'POST',
        body: JSON.stringify({ modelIds }),
      });
    } catch (err: unknown) {
      set({ isDownloading: false });
      const apiErr = err as { status?: number; data?: { code?: string; requiredBytes?: number; availableBytes?: number; error?: string } };
      if (apiErr.data?.code === 'INSUFFICIENT_DISK_SPACE') {
        set({
          diskSpaceError: {
            requiredBytes: apiErr.data.requiredBytes || 4500000000,
            availableBytes: apiErr.data.availableBytes || 0,
          },
          error: apiErr.data.error || 'Insufficient disk space',
        });
        return;
      }
      if (apiErr.data?.code === 'OFFLINE') {
        set({ error: 'Cannot download models without an active internet connection.' });
        return;
      }
      const msg = err instanceof Error ? err.message : 'Download initiation failed';
      set({ error: msg });
    }
  },

  cancelDownload: async (modelId?: string) => {
    try {
      await apiClient('/api/resources/cancel', {
        method: 'POST',
        body: JSON.stringify({ modelId }),
      });
    } catch (_) {}
    set({ isDownloading: false });
    get().fetchStatus();
  },
}));

