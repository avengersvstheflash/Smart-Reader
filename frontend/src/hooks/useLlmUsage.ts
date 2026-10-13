import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import type { LlmUsageSummary } from '../types/domain';

/**
 * React Query hook to fetch user lifetime LLM usage metrics.
 * Cached for 60 seconds to avoid unnecessary polling/hammering.
 */
export function useLlmUsageSummary() {
  return useQuery<LlmUsageSummary, Error>({
    queryKey: ['llm-usage-summary'],
    queryFn: async () => {
      return apiClient<LlmUsageSummary>('/api/lifecycle/usage/summary');
    },
    staleTime: 60_000,
    gcTime: 60_000,
  });
}
