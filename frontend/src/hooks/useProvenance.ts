import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { ProvenanceData } from '../types/domain';

export function useProvenance(representationId: string | null | undefined, expand = 'chunks') {
  const { data, isLoading, isError, error, refetch } = useQuery<ProvenanceData | null, Error>({
    queryKey: ['provenance', representationId, expand],
    queryFn: async () => {
      if (!representationId) return null;
      const url = `/api/representations/${representationId}/provenance${expand ? `?expand=${expand}` : ''}`;
      return apiClient<ProvenanceData>(url);
    },
    enabled: Boolean(representationId),
    staleTime: 5 * 60 * 1000,
  });

  return {
    provenance: data || null,
    isLoading,
    isError,
    error,
    refetch,
  };
}
