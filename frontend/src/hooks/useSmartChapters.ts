import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

export function normalizeSmartChapter(raw: any): SmartChapter {
  if (!raw) return raw;
  return {
    id: raw.id,
    bookId: raw.bookId || raw.book_id || '',
    sequence: raw.sequence ?? 0,
    title: raw.title ?? null,
    status: raw.status || 'pending',
    plannedWordCount: raw.plannedWordCount ?? raw.planned_word_count ?? null,
    wordCount: raw.wordCount ?? raw.word_count ?? 0,
    content: raw.content ?? null,
    synthesisType: raw.synthesisType ?? raw.synthesis_type ?? null,
    metadata:
      raw.metadata ??
      (raw.metadata_json
        ? typeof raw.metadata_json === 'string'
          ? JSON.parse(raw.metadata_json)
          : raw.metadata_json
        : null),
    createdAt: raw.createdAt || raw.created_at || '',
    updatedAt: raw.updatedAt || raw.updated_at || '',
    openedAt: raw.openedAt || raw.opened_at || null,
    readAt: raw.readAt || raw.read_at || null,
    readSource: raw.readSource || raw.read_source || null,
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
    chapters: (data?.chapters ?? []).map(normalizeSmartChapter),
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
    smartChapter: data?.smartChapter
      ? {
          ...normalizeSmartChapter(data.smartChapter),
          attributions: data.smartChapter.attributions,
        }
      : null,
    isLoading,
    isError,
    error,
    refetch,
  };
}

export function useUpdateSmartChapterProgress(bookId?: string) {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean; id: string; status: string; read_at: string | null; opened_at: string | null },
    Error,
    { smartChapterId: string; status: 'opened' | 'read' | 'unread'; source?: 'scroll' | 'button' }
  >({
    mutationFn: async ({ smartChapterId, status, source }) => {
      return apiClient(`/api/smart-chapters/${smartChapterId}/progress`, {
        method: 'POST',
        body: JSON.stringify({ status, source }),
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['smart-chapters', variables.smartChapterId] });
      if (bookId) {
        queryClient.invalidateQueries({ queryKey: ['smart-chapters', 'book', bookId] });
        queryClient.invalidateQueries({ queryKey: ['resume-target', bookId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['smart-chapters'] });
        queryClient.invalidateQueries({ queryKey: ['resume-target'] });
      }
      queryClient.invalidateQueries({ queryKey: ['books'] });
      queryClient.invalidateQueries({ queryKey: ['book'] });
    },
  });
}

export interface ResumeTargetResponse {
  smartChapterId: string | null;
  sequence?: number;
  title?: string | null;
  timestamp?: string | null;
}

export function useResumeTarget(bookId: string | null | undefined) {
  const { data, isLoading, isError, error, refetch } = useQuery<ResumeTargetResponse | null, Error>({
    queryKey: ['resume-target', bookId],
    queryFn: async () => {
      if (!bookId) return null;
      try {
        return await apiClient<ResumeTargetResponse>(`/api/books/${bookId}/resume-target`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: Boolean(bookId),
    staleTime: 10 * 1000,
  });

  return {
    resumeTarget: data ?? null,
    smartChapterId: data?.smartChapterId ?? null,
    sequence: data?.sequence,
    title: data?.title,
    timestamp: data?.timestamp,
    isLoading,
    isError,
    error,
    refetch,
  };
}