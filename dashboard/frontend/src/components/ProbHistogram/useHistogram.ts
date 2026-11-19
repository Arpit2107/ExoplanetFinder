/**
 * useHistogram - Hook for fetching and transforming histogram data
 * Fetches probability histogram split by true label (PC, AFP, NTP)
 * from the backend API using react-query.
 */

import { useHistogram as useHistogramQuery } from '../../api/queries';
import type { Split, ModelType, HistogramResponse } from '../../api/types';

/** Histogram data transformed for chart rendering */
export interface HistogramData {
  /** Probability bins (center points) */
  bins: number[];
  /** Planet candidate counts per bin */
  pcCounts: number[];
  /** False positive counts per bin (AFP + NTP combined) */
  afpCounts: number[];
  /** NTP counts per bin (separate for stacking) */
  ntpCounts: number[];
  /** Total count per bin */
  totalCounts: number[];
  /** Maximum count across all bins (for Y-axis scaling) */
  maxCount: number;
  /** Total samples */
  totalSamples: number;
  /** Split name */
  split: Split;
  /** Model type */
  modelType: ModelType;
}

/** Return type for the useHistogram hook */
export interface UseHistogramResult {
  /** Transformed histogram data ready for chart */
  data: HistogramData | null;
  /** Whether the query is currently loading */
  isLoading: boolean;
  /** Whether the query has an error */
  isError: boolean;
  /** Error object if any */
  error: Error | null;
  /** Refetch function */
  refetch: () => void;
}

/**
 * Hook for fetching histogram data and transforming it for the chart component.
 *
 * @param split - Data split to fetch (default: 'test')
 * @param model - Model type to use (default: 'cnn')
 * @param bins - Number of bins (default: 20)
 * @returns Object containing transformed data and query state
 */
export function useHistogram(
  split: Split = 'test',
  model: ModelType = 'cnn',
  bins: number = 20
): UseHistogramResult {
  const query = useHistogramQuery({ split, model, bins });

  // Transform the raw API response into chart-ready data
  const transformedData = query.data ? transformHistogramData(query.data, split, model) : null;

  return {
    data: transformedData,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Transform raw histogram API response into chart-ready format.
 * Stacks: PC (amber) on bottom, AFP (red) middle, NTP (darker red) top
 */
function transformHistogramData(
  response: HistogramResponse,
  split: Split,
  modelType: ModelType
): HistogramData {
  const bins: number[] = [];
  const pcCounts: number[] = [];
  const afpCounts: number[] = [];
  const ntpCounts: number[] = [];
  const totalCounts: number[] = [];

  let maxCount = 0;
  let totalSamples = 0;

  for (const bin of response.bins) {
    bins.push(bin.bin_center);
    pcCounts.push(bin.planet_count);
    // Backend combines AFP and NTP into not_planet_count
    // We'll split them proportionally if needed, but for now use as single "not planet" stack
    // For true stacking, we'd need separate counts from backend
    const notPlanetCount = bin.not_planet_count;
    afpCounts.push(notPlanetCount);
    ntpCounts.push(0); // Placeholder - backend doesn't separate AFP/NTP in histogram
    const total = bin.planet_count + notPlanetCount;
    totalCounts.push(total);
    maxCount = Math.max(maxCount, total);
    totalSamples += total;
  }

  return {
    bins,
    pcCounts,
    afpCounts,
    ntpCounts,
    totalCounts,
    maxCount,
    totalSamples,
    split,
    modelType,
  };
}

export default useHistogram;