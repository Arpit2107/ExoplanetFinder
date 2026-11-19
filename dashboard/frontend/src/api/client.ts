/**
 * Axios/fetch wrapper with baseURL, error handling, and request/response interceptors.
 * Provides a typed API client for the Exoplanet Finder backend.
 */

import axios, { AxiosError } from "axios";
import type {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import type {
  TCEListParams,
  TopCandidatesParams,
  HistogramParams,
  ScatterEclipseParams,
  StarsListParams,
  StarDetailParams,
} from "./types";

// ──────────────────────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────────────────────

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";
const DEFAULT_TIMEOUT = 30000; // 30 seconds

// Store request timestamps for debugging (using URL as key since we can't extend Axios config)
const requestTimestamps = new Map<string, number>();

function getRequestKey(config: InternalAxiosRequestConfig): string {
  return `${config.method?.toUpperCase()}:${config.url}${config.params ? `?${JSON.stringify(config.params)}` : ""}`;
}

// ──────────────────────────────────────────────────────────────
// Custom Error Classes
// ──────────────────────────────────────────────────────────────

export class ApiError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly details?: unknown;

  constructor(
    message: string,
    status: number,
    code?: string,
    details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static fromAxiosError(error: AxiosError): ApiError {
    if (error.response) {
      // Server responded with error status
      const data = error.response.data as Record<string, unknown> | undefined;
      return new ApiError(
        (data?.detail as string) || error.message,
        error.response.status,
        (data?.code as string) || "SERVER_ERROR",
        data
      );
    } else if (error.request) {
      // Network error - no response received
      return new ApiError(
        "Network error: Unable to reach the server. Is the backend running?",
        0,
        "NETWORK_ERROR"
      );
    } else {
      // Request configuration error
      return new ApiError(
        `Request configuration error: ${error.message}`,
        0,
        "CONFIG_ERROR"
      );
    }
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string, id?: string) {
    super(
      `${resource}${id ? ` (${id})` : ""} not found`,
      404,
      "NOT_FOUND"
    );
    this.name = "NotFoundError";
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(message, 422, "VALIDATION_ERROR", details);
    this.name = "ValidationError";
  }
}

// ──────────────────────────────────────────────────────────────
// Create Axios Instance
// ──────────────────────────────────────────────────────────────

function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: BASE_URL,
    timeout: DEFAULT_TIMEOUT,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    // withCredentials: true, // Enable if using cookies/auth
  });

  // Request interceptor - add auth, logging, etc.
  client.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      // Store request timestamp for debugging
      const key = getRequestKey(config);
      requestTimestamps.set(key, Date.now());

      // Log request in development
      if (import.meta.env.DEV) {
        console.debug(`[API] ${config.method?.toUpperCase()} ${config.url}`, config.params || config.data);
      }

      return config;
    },
    (error: AxiosError) => {
      return Promise.reject(ApiError.fromAxiosError(error));
    }
  );

  // Response interceptor - handle errors, transform responses
  client.interceptors.response.use(
    (response: AxiosResponse) => {
      // Log response time in development
      if (import.meta.env.DEV) {
        const key = getRequestKey(response.config);
        const startTime = requestTimestamps.get(key) || 0;
        const duration = Date.now() - startTime;
        console.debug(`[API] ${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status} (${duration}ms)`);
        requestTimestamps.delete(key); // Clean up
      }
      return response;
    },
    (error: AxiosError) => {
      const apiError = ApiError.fromAxiosError(error);

      // Log error in development
      if (import.meta.env.DEV) {
        console.error(`[API ERROR]`, apiError);
      }

      // Transform specific error codes
      if (apiError.status === 404) {
        return Promise.reject(
          new NotFoundError(
            error.config?.url || "Resource",
            error.config?.params?.tce_id as string | undefined
          )
        );
      }

      if (apiError.status === 422) {
        return Promise.reject(
          new ValidationError(apiError.message, apiError.details)
        );
      }

      return Promise.reject(apiError);
    }
  );

  return client;
}

// ──────────────────────────────────────────────────────────────
// Singleton Instance
// ──────────────────────────────────────────────────────────────

export const apiClient = createApiClient();

// ──────────────────────────────────────────────────────────────
// Helper Functions
// ──────────────────────────────────────────────────────────────

/**
 * Build query string from params object, omitting undefined values
 */
function buildParams(params: Record<string, unknown>): URLSearchParams {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  });
  return searchParams;
}

/**
 * Convert param object to Record<string, unknown> for buildParams
 */
function toRecord(params: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!params) return {};
  const result: Record<string, unknown> = {};
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      result[key] = value;
    }
  });
  return result;
}

/**
 * Generic GET request with typed response
 */
export async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const queryString = params ? `?${buildParams(params).toString()}` : "";
  const response = await apiClient.get<T>(`${url}${queryString}`);
  return response.data;
}

/**
 * Generic POST request with typed response
 */
export async function post<T>(url: string, data?: unknown): Promise<T> {
  const response = await apiClient.post<T>(url, data);
  return response.data;
}

/**
 * Generic PUT request with typed response
 */
export async function put<T>(url: string, data?: unknown): Promise<T> {
  const response = await apiClient.put<T>(url, data);
  return response.data;
}

/**
 * Generic DELETE request with typed response
 */
export async function del<T>(url: string): Promise<T> {
  const response = await apiClient.delete<T>(url);
  return response.data;
}

// ──────────────────────────────────────────────────────────────
// API Endpoint Functions
// ──────────────────────────────────────────────────────────────

// Health & Summary
export const api = {
  // Health check
  health: () => get<{ status: string; message: string }>("/health"),

  // Summary metrics
  getSummary: () => get<import("./types").SummaryStats>("/api/summary"),

  // All metrics
  getAllMetrics: () => get<import("./types").MetricResponse[]>("/api/metrics"),

  // Curves (PR/ROC)
  getCurves: (modelType: import("./types").ModelType, split: import("./types").Split) =>
    get<import("./types").CurveResponse>(`/api/curves/${modelType}/${split}`),

  // TCE List (paginated, filterable)
  getTces: (params?: TCEListParams) =>
    get<import("./types").TCESummary[]>("/api/tces", toRecord(params as Record<string, unknown>)),

  // TCE Detail
  getTceDetail: (tceId: string) =>
    get<import("./types").TCEDetail>(`/api/tces/${encodeURIComponent(tceId)}`),

  // Counters
  getCounters: () =>
    get<import("./types").CounterResponse>("/api/stats/counters"),

  // Splits stats
  getSplits: () =>
    get<import("./types").SplitStats[]>("/api/stats/splits"),

  // Top candidates
  getTopCandidates: (params?: TopCandidatesParams) =>
    get<import("./types").TopCandidate[]>("/api/stats/top-candidates", toRecord(params as Record<string, unknown>)),

  // Histogram
  getHistogram: (params?: HistogramParams) =>
    get<import("./types").HistogramResponse>("/api/stats/histogram", toRecord(params as Record<string, unknown>)),

  // Scatter: probability vs secondary eclipse depth
  getScatterEclipse: (params?: ScatterEclipseParams) =>
    get<import("./types").ScatterResponse>("/api/stats/scatter-eclipse", toRecord(params as Record<string, unknown>)),

  // Error analysis
  getErrors: () =>
    get<import("./types").ErrorAnalysisItem[]>("/api/errors"),

  // Threshold endpoints
  getOptimalThreshold: (modelType: import("./types").ModelType = "cnn") =>
    get<import("./types").OptimalThresholdResponse>("/api/threshold/optimal", { model: modelType }),

  updateThreshold: (threshold: number, split: import("./types").Split = "test") =>
    post<import("./types").ThresholdResponse>("/api/threshold", { threshold, split }),

  // Kepler-90
  getKepler90: () =>
    get<import("./types").Kepler90Response>("/api/kepler90"),

  // Stars (grouped by KIC ID)
  getStars: (params?: StarsListParams) =>
    get<import("./types").StarSummary[]>("/api/stars", toRecord(params as Record<string, unknown>)),

  getStarDetail: (kepid: number, params?: StarDetailParams) =>
    get<import("./types").StarDetail>(`/api/stars/${kepid}`, toRecord(params as Record<string, unknown>)),

  // Plots
  listPlots: () =>
    get<import("./types").PlotsResponse>("/api/plots"),

  // Predictions for a split
  getPredictions: (split: import("./types").Split, limit: number = 100) =>
    get<import("./types").TCEPrediction[]>("/api/predictions/" + split, { limit }),
};

// ──────────────────────────────────────────────────────────────
// Utility: Check if backend is available
// ──────────────────────────────────────────────────────────────

export async function checkBackendHealth(): Promise<boolean> {
  try {
    await api.health();
    return true;
  } catch {
    return false;
  }
}

// ──────────────────────────────────────────────────────────────
// Export types for consumers
// ──────────────────────────────────────────────────────────────

export type { AxiosInstance, AxiosError, AxiosRequestConfig, AxiosResponse };