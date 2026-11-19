/**
 * useTceDetail - Hook to fetch detailed TCE data including light curves
 * Wraps the existing useInspectorTce from queries for the inspector panel
 */

import { useInspectorTce } from '../../api/queries';
import type { TCEDetail } from '../../api/types';

/**
 * Hook to fetch TCE detail for the inspector panel
 * Uses the inspector-specific query key that enables/disables based on tceId
 */
export function useTceDetail(tceId: string | null) {
  return useInspectorTce(tceId);
}

export type { TCEDetail };