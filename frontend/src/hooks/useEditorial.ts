import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError } from '../api/client';

export interface EditorialChapter {
  chapterId: string;
  title: string;
  sourceSectionIds?: string[];
  isSynthesized?: boolean;
  synthesizedContent?: string | null;
  [key: string]: unknown;
}

export interface EditorialOutline {
  outlineId: string;
  bookId?: string;
  collectionId?: string;
  title: string;
  type?: string;
  chapters: EditorialChapter[];
  [key: string]: unknown;
}

export interface EditorialResponse {
  status: 'not_generated' | 'ready' | string;
  outline?: EditorialOutline;
}

export interface EditorialProgressResponse {
  success: boolean;
  total: number;
  synthesized: number;
  remaining: number;
  status: 'idle' | 'generating' | 'complete' | string;
  currentChapterId?: string | null;
  startedAt?: string | null;
}

export function useEditorial(bookId: string) {
  const { data, isLoading, isError, error, refetch } = useQuery<
    {
      outline: EditorialOutline | null;
      status: string;
      chapterCount: number;
      synthesizedCount: number;
    },
    Error
  >({
    queryKey: ['editorial', bookId],
    queryFn: async () => {
      try {
        const res = await apiClient<EditorialResponse>(`/api/books/${bookId}/editorial`);
        if (res.status === 'not_generated' || !res.outline) {
          return {
            outline: null,
            status: res.status || 'not_generated',
            chapterCount: 0,
            synthesizedCount: 0,
          };
        }
        const chapters = res.outline.chapters || [];
        const chapterCount = chapters.length;
        const synthesizedCount = chapters.filter((c) => c.isSynthesized).length;
        return {
          outline: res.outline,
          status: res.status,
          chapterCount,
          synthesizedCount,
        };
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          return {
            outline: null,
            status: 'not_generated',
            chapterCount: 0,
            synthesizedCount: 0,
          };
        }
        throw err;
      }
    },
    enabled: Boolean(bookId),
  });

  return {
    outline: data?.outline ?? null,
    status: data?.status ?? 'not_generated',
    chapterCount: data?.chapterCount ?? 0,
    synthesizedCount: data?.synthesizedCount ?? 0,
    isLoading,
    isError,
    error,
    refetch,
  };
}

export function useEditorialProgress(bookId: string, enabled: boolean) {
  const { data, isLoading, isError, error, refetch } = useQuery<
    EditorialProgressResponse,
    Error
  >({
    queryKey: ['editorial-progress', bookId],
    queryFn: async () => {
      return apiClient<EditorialProgressResponse>(`/api/books/${bookId}/editorial/progress`);
    },
    enabled: Boolean(bookId) && enabled,
    refetchInterval: enabled ? 1500 : false,
  });

  return {
    total: data?.total ?? 0,
    synthesized: data?.synthesized ?? 0,
    remaining: data?.remaining ?? 0,
    status: data?.status ?? 'idle',
    isError,
    isLoading,
    error,
    refetch,
  };
}

export function useGenerateOutline(bookId: string) {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean; outline: EditorialOutline }, Error, void>({
    mutationFn: async () => {
      return apiClient<{ success: boolean; outline: EditorialOutline }>(
        `/api/books/${bookId}/editorial/generate`,
        {
          method: 'POST',
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['editorial', bookId] });
    },
  });
}

export function useSynthesizeNext(bookId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean; synthesizedCount?: number; [key: string]: unknown },
    Error,
    { count: number }
  >({
    mutationFn: async ({ count }) => {
      return apiClient<{ success: boolean; synthesizedCount?: number }>(
        `/api/books/${bookId}/editorial/synthesize-next`,
        {
          method: 'POST',
          body: JSON.stringify({ count }),
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['editorial', bookId] });
      queryClient.invalidateQueries({ queryKey: ['chapter'] });
      queryClient.invalidateQueries({ queryKey: ['editorial-progress', bookId] });
    },
  });
}

