import { useQuery } from '@tanstack/react-query';
import { apiClient, ApiError } from '../api/client';
import {
  Book,
  RawBook,
  normalizeBook,
  BookSummary,
  BookSynopsis,
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

interface SynopsisResponse {
  success?: boolean;
  representation?: {
    content?: string;
    metadata?: Record<string, unknown>;
    metadata_json?: string;
    [key: string]: unknown;
  } | null;
  synopsis?: string | {
    content?: string;
    [key: string]: unknown;
  } | null;
}

export function useBookSynopsis(bookId: string) {
  const { data, isLoading, isError, error, refetch } = useQuery<BookSynopsis | null, Error>({
    queryKey: ['book-synopsis', bookId],
    queryFn: async () => {
      try {
        const res = await apiClient<SynopsisResponse>(`/api/books/${bookId}/synopsis`);
        if (!res) return null;

        let content = '';
        let fellBack: boolean | undefined = undefined;
        let fallbackReason: string | undefined = undefined;

        const rep = res.representation;
        if (rep && typeof rep.content === 'string') {
          content = rep.content;
        } else if (typeof res.synopsis === 'string') {
          content = res.synopsis;
        } else if (res.synopsis && typeof res.synopsis.content === 'string') {
          content = res.synopsis.content;
        }

        // Extract metadata from representation if present
        let rawMeta = rep?.metadata;
        if (!rawMeta && typeof rep?.metadata_json === 'string') {
          try {
            rawMeta = JSON.parse(rep.metadata_json);
          } catch {
            rawMeta = undefined;
          }
        }

        if (rawMeta && typeof rawMeta === 'object') {
          const metaObj = rawMeta as Record<string, unknown>;
          if (
            metaObj.fell_back === true ||
            metaObj.provider === 'local-semantic-fallback' ||
            metaObj.model === 'deterministic-semantic-v1'
          ) {
            fellBack = true;
          } else if (metaObj.fell_back === false) {
            fellBack = false;
          }

          if (typeof metaObj.fallback_reason === 'string') {
            fallbackReason = metaObj.fallback_reason;
          }
        }

        if (!content) return null;
        return { content, fellBack, fallbackReason };
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
    synopsis: data ?? null,
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
