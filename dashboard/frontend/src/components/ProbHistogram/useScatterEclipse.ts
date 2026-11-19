/**
 * useScatterEclipse - Hook for fetching and transforming secondary eclipse scatter data
 * Fetches model probability vs secondary eclipse depth for binary detection
 * from the backend API using react-query.
 */

import { useScatterEclipse as useScatterEclipseQuery } from '../../api/queries';
import type { Split, ModelType, ScatterResponse, ScatterPoint } from '../../api/types';

/** Scatter point transformed for chart rendering */
export interface ScatterEclipsePoint {
  /** Model probability (0-1) */
  probability: number;
  /** Secondary eclipse depth */
  secondaryEclipseDepth: number;
  /** True label (0=not planet, 1=planet) */
  label: number;
  /** Label name string */
  labelName: string;
  /** TCE identifier */
  tceId: string;
  /** Whether this point has a significant secondary eclipse (binary suspect) */
  isBinarySuspect: boolean;
  /** SVG X coordinate */
  x: number;
  /** SVG Y coordinate */
  y: number;
}

/** Scatter data transformed for chart rendering */
export interface ScatterEclipseData {
  /** Array of transformed points */
  points: ScatterEclipsePoint[];
  /** X axis domain [min, max] */
  xDomain: [number, number];
  /** Y axis domain [min, max] */
  yDomain: [number, number];
  /** Split name */
  split: Split;
  /** Model type */
  modelType: ModelType;
  /** Total points */
  totalPoints: number;
  /** Binary suspect count */
  binarySuspectCount: number;
  /** Planet count */
  planetCount: number;
  /** Not planet count */
  notPlanetCount: number;
}

/** Return type for the useScatterEclipse hook */
export interface UseScatterEclipseResult {
  /** Transformed scatter data ready for chart */
  data: ScatterEclipseData | null;
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
 * Threshold for flagging a point as a binary suspect based on secondary eclipse depth.
 * Points with secondary_eclipse_depth > this threshold are flagged.
 */
export const BINARY_ECLIPSE_THRESHOLD = 0.001; // 0.1% depth threshold

/**
 * Hook for fetching secondary eclipse scatter data and transforming it for the chart component.
 *
 * @param split - Data split to fetch (default: 'test')
 * @param model - Model type to use (default: 'cnn')
 * @param limit - Maximum number of points to fetch (default: 2000)
 * @returns Object containing transformed data and query state
 */
export function useScatterEclipse(
  split: Split = 'test',
  model: ModelType = 'cnn',
  limit: number = 2000
): UseScatterEclipseResult {
  const query = useScatterEclipseQuery({ split, model, limit });

  // Transform the raw API response into chart-ready data
  const transformedData = query.data ? transformScatterData(query.data, split, model) : null;

  return {
    data: transformedData,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Transform raw scatter API response into chart-ready format.
 * Flags points with secondary eclipse depth > threshold as binary suspects.
 */
function transformScatterData(
  response: ScatterResponse,
  split: Split,
  modelType: ModelType
): ScatterEclipseData {
  // First pass: collect all points and compute domains
  const rawPoints = response.points.map((p: ScatterPoint) => ({
    probability: p.probability,
    secondaryEclipseDepth: p.secondary_eclipse_depth ?? 0,
    label: p.label,
    labelName: p.label_name,
    tceId: p.tce_id,
    isBinarySuspect: (p.secondary_eclipse_depth ?? 0) > BINARY_ECLIPSE_THRESHOLD,
  }));

  // Compute domains
  const depths = rawPoints.map(p => p.secondaryEclipseDepth);

  const xDomain: [number, number] = [0, 1]; // Probability is always 0-1
  const yDomain: [number, number] = [
    0,
    Math.max(...depths, BINARY_ECLIPSE_THRESHOLD * 2), // At least show threshold
  ];

  // Count statistics
  const planetCount = rawPoints.filter(p => p.label === 1).length;
  const notPlanetCount = rawPoints.filter(p => p.label === 0).length;
  const binarySuspectCount = rawPoints.filter(p => p.isBinarySuspect).length;

  // Second pass: add SVG coordinates (will be set by chart component based on dimensions)
  // We'll just store the raw values and let the chart compute coordinates
  const points: ScatterEclipsePoint[] = rawPoints.map(p => ({
    ...p,
    x: 0, // Will be computed by chart
    y: 0, // Will be computed by chart
  }));

  return {
    points,
    xDomain,
    yDomain,
    split,
    modelType,
    totalPoints: points.length,
    binarySuspectCount,
    planetCount,
    notPlanetCount,
  };
}

export default useScatterEclipse;