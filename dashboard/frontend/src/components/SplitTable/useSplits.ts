/**
 * Hook to fetch split statistics from /api/stats/splits
 * Returns train/val/test split data: stars, TCEs, planet fraction
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../api/queryClient';
import { api } from '../../api/client';
import type { SplitStats } from '../../api/types';

/**
 * Hook to fetch split statistics
 * @returns React Query result with splits data
 */
export function useSplits() {
  return useQuery<SplitStats[]>({
    queryKey: queryKeys.splits(),
    queryFn: api.getSplits,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}