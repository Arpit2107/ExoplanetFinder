/**
 * Main API entry point.
 * Exports all public API modules, types, and hooks.
 */

// Client & Configuration
export { apiClient, api, checkBackendHealth, ApiError, NotFoundError, ValidationError } from "./client";
export type { AxiosInstance, AxiosError, AxiosRequestConfig, AxiosResponse } from "./client";

// Query Client & Keys
export { queryClient, queryKeys, invalidateQueries, prefetchQuery, setQueryData, getQueryData, removeQueryData, clearCache } from "./queryClient";
export type { QueryClient, QueryClientConfig } from "./queryClient";

// Types
export * from "./types";

// React Query Hooks
export * from "./queries";