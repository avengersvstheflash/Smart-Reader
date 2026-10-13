import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import type { BookLifecycle } from '../types/domain';

export interface ResynthesisResponse {
  taskId: string;
  bookId: string;
  queued: boolean;
  lifecycle?: BookLifecycle;
}

export interface ResynthesisPayload {
  title?: string;
  contentType?: string;
}

/**
 * React Query mutation hook to trigger Omni Reading re-synthesis from a Research dossier (5.8f / F52).
 */
export function useResynthesizeDossier(dossierId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation<ResynthesisResponse, Error, ResynthesisPayload | void>({
    mutationFn: async (payload) => {
      if (!dossierId) throw new Error('Dossier ID is required for re-synthesis');
      return apiClient<ResynthesisResponse>(`/api/resynthesis/${dossierId}`, {
        method: 'POST',
        body: JSON.stringify(payload || {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['books'] });
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      queryClient.invalidateQueries({ queryKey: ['book-lifecycle', dossierId] });
      queryClient.invalidateQueries({ queryKey: ['import-queue'] });
    },
  });
}
