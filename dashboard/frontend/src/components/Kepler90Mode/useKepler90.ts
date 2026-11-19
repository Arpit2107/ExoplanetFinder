/**
 * Hook for Kepler-90 mode - fetches all Kepler-90 planets with their views.
 * Re-exports the existing useKepler90Mode hook from queries with additional
 * transformations for the Kepler90View component.
 */

import { useKepler90Mode } from '../../api/queries';
import type { Kepler90Planet } from '../../api/types';

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

export interface Kepler90ViewPlanet extends Kepler90Planet {
  /** Local view light curve data (from TCE detail) */
  localView?: number[];
  /** Global view light curve data (from TCE detail) */
  globalView?: number[];
  /** TCE ID for fetching detail views */
  tceId?: string;
}

/**
 * Extended Kepler-90 response with local/global view data
 */
export interface Kepler90ViewResponse {
  planets: Kepler90ViewPlanet[];
  disclaimer: string;
}

// ──────────────────────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────────────────────

/**
 * Hook to fetch Kepler-90 data with optional detail views.
 * The base API returns planets with orbital params and probability.
 * Use this hook to also fetch local/global view light curves for thumbnails.
 */
export function useKepler90(_options?: {
  /** Whether to fetch local view light curves for thumbnails (reserved for future use) */
  fetchViews?: boolean;
}) {
  const query = useKepler90Mode({
    staleTime: 60 * 60 * 1000, // 1 hour - Kepler-90 data is static
  });

  return {
    ...query,
    data: query.data as Kepler90ViewResponse | undefined,
  };
}

// ──────────────────────────────────────────────────────────────
// Helper Functions
// ──────────────────────────────────────────────────────────────

/**
 * Format period for display
 */
export function formatPeriod(period: number): string {
  if (period >= 100) return period.toFixed(1);
  if (period >= 10) return period.toFixed(2);
  return period.toFixed(3);
}

/**
 * Format depth for display (ppm)
 */
export function formatDepth(depth: number): string {
  const ppm = depth * 1e6;
  if (ppm >= 1000) return `${(ppm / 1000).toFixed(1)} ppt`;
  return `${ppm.toFixed(0)} ppm`;
}

/**
 * Format probability as percentage
 */
export function formatProbability(prob: number): string {
  return (prob * 100).toFixed(1);
}

/**
 * Get probability color based on value
 * Grey to amber gradient
 */
export function getProbabilityColor(prob: number): string {
  if (prob < 0.2) return 'var(--text-dim)';
  if (prob < 0.4) return 'var(--semantic-amber-dim)';
  if (prob < 0.6) return 'var(--semantic-amber)';
  if (prob < 0.8) return 'var(--semantic-amber)';
  return 'var(--semantic-amber)';
}

/**
 * Transform light curve array into simplified chart data for thumbnail
 */
export interface ThumbnailChartData {
  points: Array<{ x: number; y: number }>;
  transitCenter: number;
  transitDuration: number;
}

export function transformToThumbnail(
  fluxArray: number[],
  period: number,
  duration: number,
  width: number,
  height: number,
  isLocal: boolean = true
): ThumbnailChartData | null {
  if (!fluxArray.length) return null;

  const n = fluxArray.length;
  let phaseMin: number, phaseMax: number;

  if (isLocal) {
    const durationInPhase = duration / 24 / period;
    phaseMin = -durationInPhase * 2;
    phaseMax = durationInPhase * 2;
  } else {
    phaseMin = -1.0;
    phaseMax = 1.0;
  }

  const margin = { top: 8, right: 8, bottom: 12, left: 8 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const points = fluxArray.map((flux, i) => {
    const phase = phaseMin + (i / (n - 1)) * (phaseMax - phaseMin);
    return { phase, flux };
  });

  const [fluxMin, fluxMax] = [Math.min(...fluxArray), Math.max(...fluxArray)];
  const fluxRange = fluxMax - fluxMin;
  const padding = fluxRange * 0.1 || 0.001;
  const yMin = fluxMin - padding;
  const yMax = fluxMax + padding;

  const xScale = (phase: number) => margin.left + ((phase - phaseMin) / (phaseMax - phaseMin)) * plotWidth;
  const yScale = (flux: number) => margin.top + (1 - (flux - yMin) / (yMax - yMin)) * plotHeight;

  const pointsWithCoords = points.map(p => ({
    x: xScale(p.phase),
    y: yScale(p.flux),
  }));

  const transitCenter = xScale(0);
  const transitDuration = isLocal
    ? xScale(duration / 24 / period) - margin.left
    : 0;

  return {
    points: pointsWithCoords,
    transitCenter,
    transitDuration,
  };
}