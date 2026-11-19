/**
 * useROCCurves - Hook for fetching ROC curve data for both CNN and GB models
 * Wraps the generic useCurves from queries to provide a convenient combined hook
 * for the ROC Curve component.
 */

import { useCurves as useCurvesQuery } from '../../api/queries';
import type { Split, ModelType } from '../../api/types';

export interface UseROCCurvesResult {
  cnn: ReturnType<typeof useCurvesQuery>;
  gb: ReturnType<typeof useCurvesQuery>;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

/**
 * Hook that fetches ROC curves for both CNN and GB models for a given split.
 * Defaults to 'test' split as specified in the requirements.
 *
 * @param split - Data split to fetch curves for (default: 'test')
 * @returns Object containing both curve queries and combined loading/error states
 */
export function useROCCurvesQuery(split: Split = 'test'): UseROCCurvesResult {
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
 * Hook specifically for ROC curve data (extracted from CurveResponse)
 * Provides easy access to ROC curve points and metrics.
 */
export interface ROCCData {
  points: Array<{ fpr: number; tpr: number }>;
  auc: number;
  modelType: ModelType;
  split: Split;
}

export function useROCCurves(split: Split = 'test') {
  const { cnn, gb, isLoading, isError, error } = useROCCurvesQuery(split);

  const cnnROC: ROCCData | null = cnn.data
    ? {
        points: cnn.data.roc_curve.map((p) => ({ fpr: p.x, tpr: p.y })),
        auc: cnn.data.auc,
        modelType: 'cnn',
        split: cnn.data.split,
      }
    : null;

  const gbROC: ROCCData | null = gb.data
    ? {
        points: gb.data.roc_curve.map((p) => ({ fpr: p.x, tpr: p.y })),
        auc: gb.data.auc,
        modelType: 'gb',
        split: gb.data.split,
      }
    : null;

  return {
    cnn: cnnROC,
    gb: gbROC,
    isLoading,
    isError,
    error,
  };
}