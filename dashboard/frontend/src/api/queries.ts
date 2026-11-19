/**
 * React Query hooks for all API endpoints.
 * Provides typed hooks with proper caching, invalidation, and error handling.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseQueryOptions, UseMutationOptions } from "@tanstack/react-query";
import { api, type ApiError } from "./client";
import { queryKeys } from "./queryClient";
import type {
  // Core
  Split,
  ModelType,
  // Responses
  SummaryStats,
  MetricResponse,
  CurveResponse,
  TCESummary,
  TCEDetail,
  CounterResponse,
  SplitStats,
  TopCandidate,
  HistogramResponse,
  ScatterResponse,
  ErrorAnalysisItem,
  ThresholdResponse,
  OptimalThresholdResponse,
  Kepler90Response,
  TCEPrediction,
  PlotsResponse,
  StarSummary,
  StarDetail,
  // Params
  TCEListParams,
  TopCandidatesParams,
  HistogramParams,
  ScatterEclipseParams,
  ThresholdUpdate,
  StarsListParams,
  StarDetailParams,
} from "./types";

// ──────────────────────────────────────────────────────────────
// Type Helpers
// ──────────────────────────────────────────────────────────────

type QueryOptions<T> = Omit<UseQueryOptions<T, ApiError>, "queryKey" | "queryFn">;
type MutationOptions<T, TVariables> = Omit<UseMutationOptions<T, ApiError, TVariables>, "mutationFn">;

// ──────────────────────────────────────────────────────────────
// Health & Summary
// ──────────────────────────────────────────────────────────────

export function useHealth(options?: QueryOptions<{ status: string; message: string }>) {
  return useQuery({
    queryKey: queryKeys.health(),
    queryFn: api.health,
    staleTime: 30 * 1000, // 30 seconds
    retry: 2,
    ...options,
  });
}

export function useSummary(options?: QueryOptions<SummaryStats>) {
  return useQuery({
    queryKey: queryKeys.summary(),
    queryFn: api.getSummary,
    staleTime: 2 * 60 * 1000, // 2 minutes
    ...options,
  });
}

export function useAllMetrics(options?: QueryOptions<MetricResponse[]>) {
  return useQuery({
    queryKey: queryKeys.allMetrics(),
    queryFn: api.getAllMetrics,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

// ──────────────────────────────────────────────────────────────
// Curves (PR/ROC)
// ──────────────────────────────────────────────────────────────

export function useCurves(
  modelType: ModelType,
  split: Split,
  options?: QueryOptions<CurveResponse>
) {
  return useQuery({
    queryKey: queryKeys.curves(modelType, split),
    queryFn: () => api.getCurves(modelType, split),
    enabled: !!modelType && !!split,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

// ──────────────────────────────────────────────────────────────
// TCEs
// ──────────────────────────────────────────────────────────────

export function useTces(
  params?: TCEListParams,
  options?: QueryOptions<TCESummary[]>
) {
  return useQuery({
    queryKey: queryKeys.tces(params),
    queryFn: () => api.getTces(params),
    staleTime: 2 * 60 * 1000,
    placeholderData: (previous) => previous, // Keep previous data while fetching
    ...options,
  });
}

export function useTceDetail(
  tceId: string,
  options?: QueryOptions<TCEDetail>
) {
  return useQuery({
    queryKey: queryKeys.tceDetail(tceId),
    queryFn: () => api.getTceDetail(tceId),
    enabled: !!tceId,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

// ──────────────────────────────────────────────────────────────
// Counters & Splits
// ──────────────────────────────────────────────────────────────

export function useCounters(options?: QueryOptions<CounterResponse>) {
  return useQuery({
    queryKey: queryKeys.counters(),
    queryFn: api.getCounters,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

export function useSplits(options?: QueryOptions<SplitStats[]>) {
  return useQuery({
    queryKey: queryKeys.splits(),
    queryFn: api.getSplits,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

// ──────────────────────────────────────────────────────────────
// Top Candidates
// ──────────────────────────────────────────────────────────────

export function useTopCandidates(
  params?: TopCandidatesParams,
  options?: QueryOptions<TopCandidate[]>
) {
  return useQuery({
    queryKey: queryKeys.topCandidates(params),
    queryFn: () => api.getTopCandidates(params),
    staleTime: 2 * 60 * 1000,
    ...options,
  });
}

// ──────────────────────────────────────────────────────────────
// Histogram
// ──────────────────────────────────────────────────────────────

export function useHistogram(
  params?: HistogramParams,
  options?: QueryOptions<HistogramResponse>
) {
  return useQuery({
    queryKey: queryKeys.histogram(params),
    queryFn: () => api.getHistogram(params),
    staleTime: 2 * 60 * 1000,
    ...options,
  });
}

// ──────────────────────────────────────────────────────────────
// Scatter: Probability vs Secondary Eclipse Depth
// ──────────────────────────────────────────────────────────────

export function useScatterEclipse(
  params?: ScatterEclipseParams,
  options?: QueryOptions<ScatterResponse>
) {
  return useQuery({
    queryKey: queryKeys.scatterEclipse(params),
    queryFn: () => api.getScatterEclipse(params),
    staleTime: 2 * 60 * 1000,
    ...options,
  });
}

// ──────────────────────────────────────────────────────────────
// Error Analysis
// ──────────────────────────────────────────────────────────────

export function useErrors(options?: QueryOptions<ErrorAnalysisItem[]>) {
  return useQuery({
    queryKey: queryKeys.errors(),
    queryFn: api.getErrors,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

// ──────────────────────────────────────────────────────────────
// Threshold
// ──────────────────────────────────────────────────────────────

export function useOptimalThreshold(
  modelType: ModelType = "cnn",
  options?: QueryOptions<OptimalThresholdResponse>
) {
  return useQuery({
    queryKey: queryKeys.optimalThreshold(modelType),
    queryFn: () => api.getOptimalThreshold(modelType),
    staleTime: 10 * 60 * 1000, // 10 minutes - threshold doesn't change often
    ...options,
  });
}

export function useThreshold(
  threshold: number,
  split: Split = "test",
  options?: QueryOptions<ThresholdResponse>
) {
  return useQuery({
    queryKey: queryKeys.threshold(threshold, split),
    queryFn: () => api.updateThreshold(threshold, split),
    enabled: threshold >= 0 && threshold <= 1,
    staleTime: 30 * 1000, // 30 seconds - threshold updates frequently
    ...options,
  });
}

export function useUpdateThreshold(
  options?: MutationOptions<ThresholdResponse, ThresholdUpdate>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (update: ThresholdUpdate) => api.updateThreshold(update.threshold, "test"),
    onSuccess: (data) => {
      // Update the threshold query cache
      queryClient.setQueryData(queryKeys.threshold(data.threshold, "test"), data);
    },
    ...options,
  });
}

// ──────────────────────────────────────────────────────────────
// Kepler-90
// ──────────────────────────────────────────────────────────────

export function useKepler90(options?: QueryOptions<Kepler90Response>) {
  return useQuery({
    queryKey: queryKeys.kepler90(),
    queryFn: api.getKepler90,
    staleTime: 60 * 60 * 1000, // 1 hour - Kepler-90 data is static
    ...options,
  });
}

// ──────────────────────────────────────────────────────────────
// Stars (grouped by KIC ID)
// ──────────────────────────────────────────────────────────────

export function useStars(
  params?: StarsListParams,
  options?: QueryOptions<StarSummary[]>
) {
  return useQuery({
    queryKey: queryKeys.stars(params),
    queryFn: () => api.getStars(params),
    staleTime: 2 * 60 * 1000,
    placeholderData: (previous) => previous,
    ...options,
  });
}

export function useStarDetail(
  kepid: number,
  params?: StarDetailParams,
  options?: QueryOptions<StarDetail>
) {
  return useQuery({
    queryKey: queryKeys.starDetail(kepid, params),
    queryFn: () => api.getStarDetail(kepid, params),
    enabled: !!kepid,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

// ──────────────────────────────────────────────────────────────
// Plots
// ──────────────────────────────────────────────────────────────

export function usePlots(options?: QueryOptions<PlotsResponse>) {
  return useQuery({
    queryKey: queryKeys.plots(),
    queryFn: api.listPlots,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

// ──────────────────────────────────────────────────────────────
// Predictions
// ──────────────────────────────────────────────────────────────

export function usePredictions(
  split: Split,
  limit: number = 100,
  options?: QueryOptions<TCEPrediction[]>
) {
  return useQuery({
    queryKey: queryKeys.predictions(split, limit),
    queryFn: () => api.getPredictions(split, limit),
    enabled: !!split,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

// ──────────────────────────────────────────────────────────────
// Combined / Convenience Hooks
// ──────────────────────────────────────────────────────────────

/**
 * Hook that fetches all dashboard data needed for initial load.
 * Use this in the main dashboard component to preload everything.
 */
export function useDashboardData(
  split: Split = "test"
) {
  const counters = useCounters();
  const splits = useSplits();
  const topCandidates = useTopCandidates({ split, limit: 20 });
  const histogram = useHistogram({ split, model: "cnn", bins: 20 });
  const scatterEclipse = useScatterEclipse({ split, model: "cnn", limit: 2000 });
  const errors = useErrors();
  const curvesCnn = useCurves("cnn", split);
  const curvesGb = useCurves("gb", split);
  const optimalThreshold = useOptimalThreshold("cnn");
  const kepler90 = useKepler90();

  return {
    counters,
    splits,
    topCandidates,
    histogram,
    scatterEclipse,
    errors,
    curves: {
      cnn: curvesCnn,
      gb: curvesGb,
    },
    optimalThreshold,
    kepler90,
    // Loading state - true if any critical query is loading
    isLoading:
      counters.isLoading ||
      splits.isLoading ||
      topCandidates.isLoading ||
      histogram.isLoading ||
      scatterEclipse.isLoading ||
      curvesCnn.isLoading ||
      curvesGb.isLoading,
    // Error state - first error encountered
    error:
      counters.error ||
      splits.error ||
      topCandidates.error ||
      histogram.error ||
      scatterEclipse.error ||
      curvesCnn.error ||
      curvesGb.error,
  };
}

/**
 * Hook for the sphere/sky view - fetches TCEs with ra/dec for the selected split.
 * Falls back to polar scatter if ra/dec unavailable (handled by backend).
 */
export function useSkyViewTces(
  split: Split = "test",
  options?: QueryOptions<TCESummary[]>
) {
  return useTces(
    { split, limit: 5000, min_prob: 0, max_prob: 1 },
    {
      staleTime: 2 * 60 * 1000,
      ...options,
    }
  );
}

/**
 * Hook for the inspector panel - fetches detailed TCE data including light curves.
 */
export function useInspectorTce(
  tceId: string | null,
  options?: QueryOptions<TCEDetail>
) {
  return useQuery({
    queryKey: tceId ? queryKeys.tceDetail(tceId) : ["tces", "detail", "null"],
    queryFn: () => (tceId ? api.getTceDetail(tceId) : Promise.reject(new Error("No TCE selected"))),
    enabled: !!tceId,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

/**
 * Hook for error mode - fetches all error cases (FPs and FNs) with their views.
 */
export function useErrorCases(options?: QueryOptions<ErrorAnalysisItem[]>) {
  return useErrors({
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

/**
 * Hook for compare mode - fetches two TCEs for side-by-side comparison.
 * Returns individual query results for each TCE.
 */
export function useCompareTces(
  tceIdA: string | null,
  tceIdB: string | null
) {
  const queryA = useTceDetail(tceIdA || "", {
    enabled: !!tceIdA,
  });
  const queryB = useTceDetail(tceIdB || "", {
    enabled: !!tceIdB,
  });

  return {
    tceA: queryA.data,
    tceB: queryB.data,
    isLoading: queryA.isLoading || queryB.isLoading,
    isError: queryA.isError || queryB.isError,
    error: queryA.error || queryB.error,
    refetch: () => {
      queryA.refetch();
      queryB.refetch();
    },
  };
}

/**
 * Hook for Kepler-90 mode - fetches all Kepler-90 planets with their views.
 */
export function useKepler90Mode(options?: QueryOptions<Kepler90Response>) {
  return useKepler90({
    staleTime: 60 * 60 * 1000,
    ...options,
  });
}

// ──────────────────────────────────────────────────────────────
// Mutation Helpers
// ──────────────────────────────────────────────────────────────

/**
 * Invalidate all dashboard-related queries.
 * Use after threshold changes, mode switches, etc.
 */
export function useInvalidateDashboard() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: ["stats"] });
    queryClient.invalidateQueries({ queryKey: ["threshold"] });
    queryClient.invalidateQueries({ queryKey: ["curves"] });
  };
}

/**
 * Prefetch TCE detail for hover/preload.
 */
export function usePrefetchTceDetail() {
  const queryClient = useQueryClient();

  return (tceId: string) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.tceDetail(tceId),
      queryFn: () => api.getTceDetail(tceId),
      staleTime: 5 * 60 * 1000,
    });
  };
}

// ──────────────────────────────────────────────────────────────
// Export all hooks
// ──────────────────────────────────────────────────────────────

export {
  queryKeys,
  type QueryOptions,
  type MutationOptions,
};