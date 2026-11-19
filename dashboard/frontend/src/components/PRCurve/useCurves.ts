/**
 * useCurves - Hook for fetching PR/ROC curve data for both CNN and GB models
 * Wraps the generic useCurves from queries to provide a convenient combined hook
 * for the PR Curve component.
 */

import { useCurves as useCurvesQuery } from '../../api/queries';
import type { Split, ModelType } from '../../api/types';

export interface UseCurvesResult {
  cnn: ReturnType<typeof useCurvesQuery>;
  gb: ReturnType<typeof useCurvesQuery>;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

/**
 * Hook that fetches PR/ROC curves for both CNN and GB models for a given split.
 * Defaults to 'test' split as specified in the requirements.
 *
 * @param split - Data split to fetch curves for (default: 'test')
 * @returns Object containing both curve queries and combined loading/error states
 */
export function useCurves(split: Split = 'test'): UseCurvesResult {
  const cnn = useCurvesQuery('cnn', split);
  const gb = useCurvesQuery('gb', split);

  return {
    cnn,
    gb,
    isLoading: cnn.isLoading || gb.isLoading,
    isError: cnn.isError || gb.isError,
    error: cnn.error || gb.error,
  };
}

/**
 * Hook specifically for PR curve data (extracted from CurveResponse)
 * Provides easy access to PR curve points and metrics.
 */
export interface PRCData {
  points: Array<{ recall: number; precision: number }>;
  auc: number;
  avgPrecision: number;
  modelType: ModelType;
  split: Split;
}

export function usePRCurves(split: Split = 'test') {
  const { cnn, gb, isLoading, isError, error } = useCurves(split);

  const cnnPRC: PRCData | null = cnn.data
    ? {
        points: cnn.data.pr_curve.map((p) => ({ recall: p.x, precision: p.y })),
        auc: cnn.data.auc,
        avgPrecision: cnn.data.avg_precision ?? 0,
        modelType: 'cnn',
        split: cnn.data.split,
      }
    : null;

  const gbPRC: PRCData | null = gb.data
    ? {
        points: gb.data.pr_curve.map((p) => ({ recall: p.x, precision: p.y })),
        auc: gb.data.auc,
        avgPrecision: gb.data.avg_precision ?? 0,
        modelType: 'gb',
        split: gb.data.split,
      }
    : null;

  return {
    cnn: cnnPRC,
    gb: gbPRC,
    isLoading,
    isError,
    error,
  };
}