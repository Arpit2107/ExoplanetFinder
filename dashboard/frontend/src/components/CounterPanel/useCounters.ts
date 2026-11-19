/**
 * Hook to fetch counter statistics from /api/stats/counters
 * Returns total TCEs, planet candidates, astrophysical false positives, and non-transiting phenomena
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../api/queryClient';
import { api } from '../../api/client';
import type { CounterResponse } from '../../api/types';

/**
 * Hook to fetch counter statistics
 * @returns React Query result with counters data
 */
export function useCounters() {
  return useQuery<CounterResponse>({
    queryKey: queryKeys.counters(),
    queryFn: api.getCounters,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}