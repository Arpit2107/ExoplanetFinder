/**
 * Hook to fetch top candidates from /api/stats/top-candidates
 * Returns leaderboard data: rank, kepid, period, probability, true label
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../api/queryClient';
import { api } from '../../api/client';
import type { TopCandidate, Split } from '../../api/types';

export interface UseTopCandidatesParams {
  split?: Split;
  limit?: number;
}

/**
 * Hook to fetch top candidates leaderboard
 * @param params - Split (default: 'test') and limit (default: 20)
 * @returns React Query result with top candidates data
 */
export function useTopCandidates(params: UseTopCandidatesParams = {}) {
  const { split = 'test', limit = 20 } = params;

  return useQuery<TopCandidate[]>({
    queryKey: queryKeys.topCandidates({ split, limit }),
    queryFn: () => api.getTopCandidates({ split, limit }),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}