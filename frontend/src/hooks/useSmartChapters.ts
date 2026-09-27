import { useQuery } from '@tanstack/react-query';
import { apiClient, ApiError } from '../api/client';
import { SmartChapter } from '../types/domain';

export interface AttributionRow {
  id: string;
  smart_chapter_id: string;
  paragraph_index: number;
  segments_json: unknown;
  source_chunk_ids: string[];
  weights_json: unknown;
  method: string;
  confidence: string;
  grounded: boolean;
  verified_at: string;
  fell_back?: boolean;
  fallback_reason?: string | null;
}

export interface SmartChaptersResponse {
  book_id: string;
  total: number;
  generated: number;
  pending: number;
  generating: number;
  failed: number;
  chapters: SmartChapter[];
}

export interface SmartChapterResponse {
  success: boolean;
  smartChapter: SmartChapter & {
    attributions?: AttributionRow[];
  };
}

export function useSmartChapters(bookId: string | null | undefined) {
  const { data, isLoading, isError, error, refetch } = useQuery<SmartChaptersResponse | null, Error>({
    queryKey: ['smart-chapters', 'book', bookId],
    queryFn: async () => {
      if (!bookId) return null;
      try {
        return await apiClient<SmartChaptersResponse>(`/api/smart-chapters/book/${bookId}`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: Boolean(bookId),
    staleTime: 30 * 1000,
  });

  return {
    chapters: data?.chapters ?? [],
    total: data?.total ?? 0,
    generated: data?.generated ?? 0,
    pending: data?.pending ?? 0,
    generating: data?.generating ?? 0,
    failed: data?.failed ?? 0,
    isLoading,
    isError,
    error,
    refetch,
  };
}

export function useSmartChapter(smartChapterId: string | null | undefined) {
  const { data, isLoading, isError, error, refetch } = useQuery<SmartChapterResponse | null, Error>({
    queryKey: ['smart-chapters', smartChapterId],
    queryFn: async () => {
      if (!smartChapterId) return null;
      try {
        return await apiClient<SmartChapterResponse>(`/api/smart-chapters/${smartChapterId}`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: Boolean(smartChapterId),
    staleTime: 60 * 1000,
  });

  return {
    smartChapter: data?.smartChapter ?? null,
    isLoading,
    isError,
    error,
    refetch,
  };
}
