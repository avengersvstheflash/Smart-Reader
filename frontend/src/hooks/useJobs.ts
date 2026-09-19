import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { RawJob, normalizeJob } from '../types/domain';

export const isActiveStatus = (status: string): boolean =>
  status === 'PROCESSING' || status === 'in_progress' || status === 'PENDING';

export function useJobs(bookId: string | null) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['jobs', bookId ?? 'none'],
    queryFn: async () => {
      if (!bookId) return [];
      const res = await apiClient<{ jobs: RawJob[] }>(`/api/jobs/book/${bookId}`);
      return (res.jobs || []).map(normalizeJob);
    },
    enabled: Boolean(bookId),
    refetchInterval: (query) => {
      const jobs = query.state.data;
      if (!jobs) return false;
      // keep polling while ANY job is active
      const active = jobs.some((j) => isActiveStatus(j.status));
      return active ? 1500 : false;
    },
  });

  const jobs = data ?? [];
  const activeJob = jobs.find((j) => isActiveStatus(j.status)) ?? null;
  const hasCompletedAny = jobs.some((j) => j.status === 'COMPLETED');
  const pipelineComplete = !activeJob && hasCompletedAny;

  return { jobs, activeJob, pipelineComplete, isLoading, isError, error };
}
