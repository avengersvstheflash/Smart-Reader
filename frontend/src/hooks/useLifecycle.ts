import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import type { BookLifecycleDetails, BookLifecycle } from '../types/domain';

export interface RecordReadProgressPayload {
  chapterId?: string | null;
  sequence?: number | null;
  title?: string | null;
  scrollPct: number;
}

export interface RecordReadProgressResponse {
  ok: boolean;
  lifecycle: BookLifecycle;
}

/**
 * React Query hook to fetch complete lifecycle coordination data for a book.
 */
export function useLifecycle(bookId?: string | null) {
  return useQuery<BookLifecycleDetails, Error>({
    queryKey: ['book-lifecycle', bookId],
    queryFn: async () => {
      if (!bookId) throw new Error('Book ID is required');
      return apiClient<BookLifecycleDetails>(`/api/books/${bookId}/lifecycle`);
    },
    enabled: Boolean(bookId),
    staleTime: 30_000,
  });
}

/**
 * React Query mutation hook to record reading progress snapshots in the lifecycle coordination row.
 */
export function useRecordReadProgress(bookId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation<RecordReadProgressResponse, Error, RecordReadProgressPayload>({
    mutationFn: async (payload: RecordReadProgressPayload) => {
      if (!bookId) throw new Error('Book ID is required');
      return apiClient<RecordReadProgressResponse>(`/api/books/${bookId}/lifecycle/read-progress`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      if (bookId) {
        queryClient.invalidateQueries({ queryKey: ['book-lifecycle', bookId] });
      }
    },
  });
}
