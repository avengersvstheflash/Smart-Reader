import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { Book, RawBook, normalizeBook } from '../types/domain';

interface BooksApiResponse {
  books: RawBook[];
}

export function useBooks() {
  const { data, isLoading, isError, error, refetch } = useQuery<Book[], Error>({
    queryKey: ['books'],
    queryFn: async () => {
      const res = await apiClient<BooksApiResponse>('/api/books');
      return (res.books || []).map(normalizeBook);
    },
  });

  return {
    books: data || [],
    isLoading,
    isError,
    error,
    refetch,
  };
}

