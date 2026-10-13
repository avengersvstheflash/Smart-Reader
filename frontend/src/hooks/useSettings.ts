import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';

export interface OpenRouterSettings {
  apiKey: string;
  model: string;
  timeoutMs?: number;
}

export interface LocalSettings {
  preset: string; // 'ollama' | 'lmstudio' | 'custom'
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs?: number;
}

export interface Settings {
  version: number;
  updatedAt: string;
  aiProvider: 'openrouter' | 'local' | 'ollama';
  openrouter: OpenRouterSettings;
  local: LocalSettings;
  importMaxSizeMB: number;
  parallelBookSynthesis?: boolean;
}

export interface UpdateSettingsPayload {
  aiProvider?: string;
  openrouter?: Partial<OpenRouterSettings>;
  local?: Partial<LocalSettings>;
  importMaxSizeMB?: number;
  parallelBookSynthesis?: boolean;
}

export interface TestConnectionPayload {
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

export interface TestConnectionResult {
  success: boolean;
  latencyMs: number;
  message: string;
  modelFound?: boolean;
  modelsCount?: number;
}

export function useSettings() {
  const queryClient = useQueryClient();

  const query = useQuery<Settings, Error>({
    queryKey: ['settings'],
    queryFn: async () => {
      return apiClient<Settings>('/api/settings');
    },
  });

  const updateMutation = useMutation<Settings, Error, UpdateSettingsPayload>({
    mutationFn: async (payload: UpdateSettingsPayload) => {
      const res = await apiClient<{ success: boolean; settings: Settings }>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      return res.settings || (res as unknown as Settings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['clientConfig'] });
    },
  });

  const resetMutation = useMutation<Settings, Error, void>({
    mutationFn: async () => {
      const res = await apiClient<{ success: boolean; settings: Settings }>('/api/settings/reset', {
        method: 'POST',
      });
      return res.settings || (res as unknown as Settings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['clientConfig'] });
    },
  });

  const testConnectionMutation = useMutation<TestConnectionResult, Error, TestConnectionPayload>({
    mutationFn: async (payload: TestConnectionPayload) => {
      return apiClient<TestConnectionResult>('/api/settings/test-connection', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
  });

  return {
    settings: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    updateSettings: updateMutation,
    resetSettings: resetMutation,
    testConnection: testConnectionMutation,
  };
}

