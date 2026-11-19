/**
 * Configured QueryClient with default staleTime, retry, and other settings.
 * Provides a singleton instance for use with React Query.
 */

import { QueryClient } from "@tanstack/react-query";
import type { QueryClientConfig } from "@tanstack/react-query";

// ──────────────────────────────────────────────────────────────
// Default Configuration
// ──────────────────────────────────────────────────────────────

const defaultQueryConfig: QueryClientConfig = {
  defaultOptions: {
    queries: {
      // Cache data for 5 minutes by default
      staleTime: 5 * 60 * 1000, // 5 minutes

      // Keep unused data in cache for 10 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)

      // Retry failed queries 3 times with exponential backoff
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),

      // Don't refetch on window focus by default (can be overridden per query)
      refetchOnWindowFocus: false,

      // Don't refetch on reconnect by default
      refetchOnReconnect: false,

      // Don't refetch on mount if data is fresh
      refetchOnMount: "always", // Changed from false to "always" for better UX

      // Throw errors instead of storing them in query state
      throwOnError: false,

      // Structural sharing to prevent unnecessary re-renders
      structuralSharing: true,
    },
    mutations: {
      // Retry mutations once on failure
      retry: 1,
      retryDelay: 1000,

      // Don't throw errors, let them be handled in onError callbacks
      throwOnError: false,
    },
  },
};

// ──────────────────────────────────────────────────────────────
// Create QueryClient Instance
// ──────────────────────────────────────────────────────────────

export const queryClient = new QueryClient(defaultQueryConfig);

// ──────────────────────────────────────────────────────────────
// Query Key Factory
// ──────────────────────────────────────────────────────────────

/**
 * Centralized query key factory for consistent, type-safe query keys.
 * All query keys are arrays for easy invalidation and matching.
 */
export const queryKeys = {
  // Health
  health: () => ["health"] as const,

  // Summary metrics
  summary: () => ["summary"] as const,
  allMetrics: () => ["metrics", "all"] as const,

  // Curves
  curves: (modelType: "cnn" | "gb", split: "train" | "val" | "test") =>
    ["curves", modelType, split] as const,
  allCurves: () => ["curves"] as const,

  // TCEs
  tces: (params?: {
    split?: "train" | "val" | "test";
    limit?: number;
    offset?: number;
    min_prob?: number;
    max_prob?: number;
    label?: number;
  }) => ["tces", params ?? {}] as const,
  tceDetail: (tceId: string) => ["tces", "detail", tceId] as const,

  // Counters
  counters: () => ["stats", "counters"] as const,

  // Splits
  splits: () => ["stats", "splits"] as const,

  // Top candidates
  topCandidates: (params?: { split?: "train" | "val" | "test"; limit?: number }) =>
    ["stats", "top-candidates", params ?? {}] as const,

  // Histogram
  histogram: (params?: { split?: "train" | "val" | "test"; bins?: number; model?: "cnn" | "gb" }) =>
    ["stats", "histogram", params ?? {}] as const,

  // Scatter eclipse
  scatterEclipse: (params?: { split?: "train" | "val" | "test"; model?: "cnn" | "gb"; limit?: number }) =>
    ["stats", "scatter-eclipse", params ?? {}] as const,

  // Errors
  errors: () => ["errors"] as const,

  // Threshold
  optimalThreshold: (modelType: "cnn" | "gb") => ["threshold", "optimal", modelType] as const,
  threshold: (threshold: number, split: "train" | "val" | "test") => ["threshold", threshold, split] as const,

  // Kepler-90
  kepler90: () => ["kepler90"] as const,

  // Stars (grouped by KIC ID)
  stars: (params?: { split?: "train" | "val" | "test"; kepid?: number; limit?: number; offset?: number; min_prob?: number; max_prob?: number }) =>
    ["stars", params ?? {}] as const,
  starDetail: (kepid: number, params?: { split?: "train" | "val" | "test" }) =>
    ["stars", "detail", kepid, params ?? {}] as const,

  // Plots
  plots: () => ["plots"] as const,

  // Predictions
  predictions: (split: "train" | "val" | "test", limit: number) =>
    ["predictions", split, limit] as const,
} as const;

// ──────────────────────────────────────────────────────────────
// Helper Functions
// ──────────────────────────────────────────────────────────────

/**
 * Invalidate all queries matching a key prefix
 */
export function invalidateQueries(key: readonly unknown[]) {
  return queryClient.invalidateQueries({ queryKey: key });
}

/**
 * Prefetch a query
 */
export function prefetchQuery<T>(
  key: readonly unknown[],
  queryFn: () => Promise<T>,
  options?: { staleTime?: number }
) {
  return queryClient.prefetchQuery({
    queryKey: key,
    queryFn,
    staleTime: options?.staleTime ?? 5 * 60 * 1000,
  });
}

/**
 * Set query data directly (for optimistic updates)
 */
export function setQueryData<T>(key: readonly unknown[], data: T) {
  queryClient.setQueryData(key, data);
}

/**
 * Get query data from cache
 */
export function getQueryData<T>(key: readonly unknown[]): T | undefined {
  return queryClient.getQueryData<T>(key);
}

/**
 * Remove query data from cache
 */
export function removeQueryData(key: readonly unknown[]) {
  queryClient.removeQueries({ queryKey: key });
}

/**
 * Clear all queries from cache
 */
export function clearCache() {
  queryClient.clear();
}

// ──────────────────────────────────────────────────────────────
// Persist Query Client (optional - for localStorage persistence)
// ──────────────────────────────────────────────────────────────

/**
 * Creates a persisted query client that saves to localStorage.
 * Use this instead of the default queryClient if you want cache persistence.
 * Note: This increases bundle size and may not be needed for this app.
 */
/*
import { persistQueryClient } from "@tanstack/query-sync-storage-persister";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: "exoplanet-finder-query-cache",
  throttleTime: 1000,
});

export function createPersistedQueryClient(): QueryClient {
  const client = new QueryClient(defaultQueryConfig);
  persistQueryClient({
    queryClient: client,
    persister,
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
  });
  return client;
}
*/

// ──────────────────────────────────────────────────────────────
// Export
// ──────────────────────────────────────────────────────────────

export type { QueryClient, QueryClientConfig };