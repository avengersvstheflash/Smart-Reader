import { useQuery } from '@tanstack/react-query';
import { apiClient, ApiError } from '../api/client';
import {
  Book,
  RawBook,
  normalizeBook,
  BookSummary,
  SemanticStatus,
} from '../types/domain';

interface BookResponse {
  book: RawBook;
}

interface SummaryResponse {
  success?: boolean;
  representation?: {
    content?: string;
    [key: string]: unknown;
  } | null;
  summary?: string | {
    content?: string;
    [key: string]: unknown;
  } | null;
}

interface SemanticStatusResponse {
  success?: boolean;
  data?: {
    chunkCount?: number;
    chunk_count?: number;
    totalChunks?: number;
    dimensions?: number;
    status?: string;
    [key: string]: unknown;
  };
  chunkCount?: number;
  chunk_count?: number;
  totalChunks?: number;
  dimensions?: number;
  status?: string;
}

export function useBook(bookId: string) {
  const { data, isLoading, isError, error, refetch } = useQuery<Book | null, Error>({
    queryKey: ['book', bookId],
    queryFn: async () => {
      try {
        const res = await apiClient<BookResponse>(`/api/books/${bookId}`);
        if (!res || !res.book) return null;
        return normalizeBook(res.book);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          return null;
        }
        throw err;
      }
    },
    enabled: Boolean(bookId),
  });

  return {
    book: data ?? null,
    isLoading,
    isError,
    error,
    refetch,
  };
}

export function useBookSummary(bookId: string) {
  const { data, isLoading, isError, error, refetch } = useQuery<BookSummary | null, Error>({
    queryKey: ['book-summary', bookId],
    queryFn: async () => {
      try {
        const res = await apiClient<SummaryResponse>(`/api/books/${bookId}/summary`);
        if (!res) return null;

        // Backend can return { representation: { content } } or { summary: string | { content } }
        let content = '';
        if (res.representation && typeof res.representation.content === 'string') {
          content = res.representation.content;
        } else if (typeof res.summary === 'string') {
          content = res.summary;
        } else if (res.summary && typeof res.summary.content === 'string') {
          content = res.summary.content;
        }

        if (!content) return null;
        return { content };
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          return null;
        }
        throw err;
      }
    },
    enabled: Boolean(bookId),
  });

  return {
    summary: data ?? null,
    isLoading,
    isError,
    error,
    refetch,
  };
}

export function useSemanticStatus(bookId: string) {
  const { data, isLoading, isError, error, refetch } = useQuery<SemanticStatus | null, Error>({
    queryKey: ['semantic-status', bookId],
    queryFn: async () => {
      // Primary route is /api/books/${bookId}/semantic/status, fallback to /api/semantic/status/${bookId}
      try {
        let res: SemanticStatusResponse | null = null;
        try {
          res = await apiClient<SemanticStatusResponse>(`/api/books/${bookId}/semantic/status`);
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) {
            res = await apiClient<SemanticStatusResponse>(`/api/semantic/status/${bookId}`);
          } else {
            throw err;
          }
        }

        if (!res) return null;
        const source = res.data || res;
        const chunkCount = source.chunkCount ?? source.chunk_count ?? source.totalChunks ?? 0;
        const dimensions = source.dimensions;
        const status = source.status;

        return {
          chunkCount,
          dimensions,
          status,
        };
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          return null;
        }
        throw err;
      }
    },
    enabled: Boolean(bookId),
  });

  return {
    status: data ?? null,
    isLoading,
    isError,
    error,
    refetch,
  };
}
