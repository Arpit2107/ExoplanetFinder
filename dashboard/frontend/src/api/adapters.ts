/**
 * Defensive adapters for API responses.
 * Handles null/NaN values, nested and flat shapes.
 * Returns clean typed arrays or null.
 */

import type { CurveResponse, ErrorAnalysisItem, ThresholdResponse } from './types';

/** A clean curve point with x,y as numbers (never null/NaN) */
export interface CleanCurvePoint {
  x: number;
  y: number;
}

/** Clean curve data with guaranteed arrays */
export interface CleanCurveData {
  pr_curve: CleanCurvePoint[];
  roc_curve: CleanCurvePoint[];
  auc: number;
  avg_precision: number;
  model_type: 'cnn' | 'gb';
  split: 'train' | 'val' | 'test';
}

/** Clean error item with all fields present (defaults for missing) */
export interface CleanErrorItem {
  tce_id: string;
  kepid: number;
  label: number;
  label_name: string;
  cnn_prob: number;
  error_type: 'FP' | 'FN';
  is_confident: boolean;
  gb_prob: number | null;
  secondary_eclipse_depth: number | null;
  likely_label_error: boolean;
}

/** Clean threshold response */
export interface CleanThresholdData {
  threshold: number;
  precision: number;
  recall: number;
  f1: number;
  confusion_matrix: { TP: number; FP: number; TN: number; FN: number };
  n_samples: number;
}

/**
 * Sanitize a single number: returns null if NaN, null, undefined, or non-finite.
 */
function sanitizeNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * Sanitize curve points from various possible shapes:
 * - { x, y } (standard)
 * - [x, y] (array tuple)
 * - { recall, precision } or { fpr, tpr } (alternative keys)
 */
function sanitizeCurvePoint(point: unknown): CleanCurvePoint | null {
  if (!point || typeof point !== 'object') return null;

  const p = point as Record<string, unknown>;

  // Try standard {x, y}
  let x = sanitizeNumber(p.x);
  let y = sanitizeNumber(p.y);

  // Fallback to alternative keys
  if (x === null) x = sanitizeNumber(p.recall ?? p.fpr);
  if (y === null) y = sanitizeNumber(p.precision ?? p.tpr);

  // Fallback to array tuple [x, y]
  if (x === null && y === null && Array.isArray(point)) {
    const arr = point as unknown[];
    x = sanitizeNumber(arr[0]);
    y = sanitizeNumber(arr[1]);
  }

  if (x === null || y === null) return null;

  // Clamp to [0, 1] for curve coordinates
  return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
}

/**
 * Adapter for /api/curves/{model}/{split}
 * Returns CleanCurveData or null if response is invalid.
 */
export function adaptCurveResponse(data: unknown): CleanCurveData | null {
  if (!data || typeof data !== 'object') return null;

  const d = data as Record<string, unknown>;

  // Extract and sanitize PR curve
  const rawPrCurve = d.pr_curve;
  const pr_curve: CleanCurvePoint[] = Array.isArray(rawPrCurve)
    ? rawPrCurve.map(sanitizeCurvePoint).filter((p): p is CleanCurvePoint => p !== null)
    : [];

  // Extract and sanitize ROC curve
  const rawRocCurve = d.roc_curve;
  const roc_curve: CleanCurvePoint[] = Array.isArray(rawRocCurve)
    ? rawRocCurve.map(sanitizeCurvePoint).filter((p): p is CleanCurvePoint => p !== null)
    : [];

  // Sanitize metrics
  const auc = sanitizeNumber(d.auc) ?? 0;
  const avg_precision = sanitizeNumber(d.avg_precision) ?? 0;

  // Validate model_type and split
  const model_type = (d.model_type === 'cnn' || d.model_type === 'gb') ? d.model_type : 'cnn';
  const split = (d.split === 'train' || d.split === 'val' || d.split === 'test') ? d.split : 'test';

  // If both curves are empty, return null (no data)
  if (pr_curve.length === 0 && roc_curve.length === 0) return null;

  return {
    pr_curve,
    roc_curve,
    auc,
    avg_precision,
    model_type: model_type as 'cnn' | 'gb',
    split: split as 'train' | 'val' | 'test',
  };
}

/**
 * Adapter for /api/errors
 * Returns array of CleanErrorItem or null if response is invalid.
 */
export function adaptErrorsResponse(data: unknown): CleanErrorItem[] | null {
  if (!Array.isArray(data)) return null;

  return data
    .map((item): CleanErrorItem | null => {
      if (!item || typeof item !== 'object') return null;
      const d = item as Record<string, unknown>;

      const tce_id = String(d.tce_id ?? '');
      const kepid = sanitizeNumber(d.kepid) ?? 0;
      const label = sanitizeNumber(d.label) ?? 0;
      const label_name = String(d.label_name ?? (label === 1 ? 'PC' : 'AFP/NTP'));
      const cnn_prob = sanitizeNumber(d.cnn_prob) ?? 0;
      const gb_prob = sanitizeNumber(d.gb_prob);
      const error_type = (d.error_type === 'FP' || d.error_type === 'FN') ? d.error_type : 'FP';
      const is_confident = Boolean(d.is_confident);
      const secondary_eclipse_depth = sanitizeNumber(d.secondary_eclipse_depth);

      // likely_label_error is not in the API response - compute from is_confident and error_type
      // Confident FP (prob > 0.9) or confident FN (prob < 0.1) = likely label error
      const likely_label_error = is_confident && (
        (error_type === 'FP' && cnn_prob > 0.9) ||
        (error_type === 'FN' && cnn_prob < 0.1)
      );

      if (!tce_id) return null;

      return {
        tce_id,
        kepid,
        label,
        label_name,
        cnn_prob: Math.max(0, Math.min(1, cnn_prob)),
        gb_prob: gb_prob !== null ? Math.max(0, Math.min(1, gb_prob)) : null,
        error_type: error_type as 'FP' | 'FN',
        is_confident,
        secondary_eclipse_depth,
        likely_label_error,
      };
    })
    .filter((item): item is CleanErrorItem => item !== null);
}

/**
 * Adapter for /api/threshold response
 * Returns CleanThresholdData or null.
 */
export function adaptThresholdResponse(data: unknown): CleanThresholdData | null {
  if (!data || typeof data !== 'object') return null;

  const d = data as Record<string, unknown>;

  const threshold = sanitizeNumber(d.threshold) ?? 0;
  const precision = sanitizeNumber(d.precision) ?? 0;
  const recall = sanitizeNumber(d.recall) ?? 0;
  const f1 = sanitizeNumber(d.f1) ?? 0;
  const n_samples = sanitizeNumber(d.n_samples) ?? 0;

  // Parse confusion matrix
  let cm = { TP: 0, FP: 0, TN: 0, FN: 0 };
  if (d.confusion_matrix && typeof d.confusion_matrix === 'object') {
    const cmRaw = d.confusion_matrix as Record<string, unknown>;
    cm = {
      TP: sanitizeNumber(cmRaw.TP) ?? 0,
      FP: sanitizeNumber(cmRaw.FP) ?? 0,
      TN: sanitizeNumber(cmRaw.TN) ?? 0,
      FN: sanitizeNumber(cmRaw.FN) ?? 0,
    };
  }

  return {
    threshold: Math.max(0, Math.min(1, threshold)),
    precision: Math.max(0, Math.min(1, precision)),
    recall: Math.max(0, Math.min(1, recall)),
    f1: Math.max(0, Math.min(1, f1)),
    confusion_matrix: cm,
    n_samples: Math.max(0, n_samples),
  };
}
