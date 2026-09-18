import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import {
  Chapter,
  RawChapter,
  ChapterRepresentation,
  CanonicalBlock,
  normalizeChapter,
} from '../types/domain';

interface ChaptersResponse {
  chapters: RawChapter[];
}

interface ChapterResponse {
  chapter: RawChapter;
  representations: ChapterRepresentation[];
}

export function useChapters(bookId: string) {
  const { data, isLoading, isError, error, refetch } = useQuery<Chapter[], Error>({
    queryKey: ['chapters', bookId],
    queryFn: async () => {
      const res = await apiClient<ChaptersResponse>(`/api/books/${bookId}/chapters`);
      return (res.chapters || []).map(normalizeChapter);
    },
    enabled: Boolean(bookId),
  });

  return {
    chapters: data || [],
    isLoading,
    isError,
    error,
    refetch,
  };
}

export function useChapter(chapterId: string) {
  const { data, isLoading, isError, error, refetch } = useQuery<
    { chapter: Chapter | null; representations: ChapterRepresentation[] },
    Error
  >({
    queryKey: ['chapter', chapterId],
    queryFn: async () => {
      const res = await apiClient<ChapterResponse>(`/api/chapters/${chapterId}`);
      if (!res.chapter) {
        return { chapter: null, representations: [] };
      }

      let parsedCanonical: CanonicalBlock[] = [];
      if (typeof res.chapter.canonical_content === 'string') {
        try {
          const parsed = JSON.parse(res.chapter.canonical_content);
          if (Array.isArray(parsed)) {
            parsedCanonical = parsed as CanonicalBlock[];
          }
        } catch {
          parsedCanonical = [];
        }
      } else if (Array.isArray(res.chapter.canonical_content)) {
        parsedCanonical = res.chapter.canonical_content;
      } else if (Array.isArray(res.chapter.canonical_blocks)) {
        parsedCanonical = res.chapter.canonical_blocks;
      } else if (Array.isArray(res.chapter.canonicalBlocks)) {
        parsedCanonical = res.chapter.canonicalBlocks;
      }

      const chapter: Chapter = {
        ...normalizeChapter(res.chapter),
        canonical_content: parsedCanonical,
        canonicalBlocks: parsedCanonical,
        canonical_blocks: parsedCanonical,
      };

      return {
        chapter,
        representations: res.representations || [],
      };
    },
    enabled: Boolean(chapterId),
  });

  return {
    chapter: data?.chapter ?? null,
    representations: data?.representations ?? [],
    isLoading,
    isError,
    error,
    refetch,
  };
}

