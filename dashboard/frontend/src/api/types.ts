/**
 * TypeScript interfaces matching backend Pydantic models.
 * All types derived from dashboard/backend/main.py and dashboard/backend/models.py
 */

// ──────────────────────────────────────────────────────────────
// Core / Shared Types
// ──────────────────────────────────────────────────────────────

export type Split = "train" | "val" | "test";
export type ModelType = "cnn" | "gb";
export type ErrorType = "FP" | "FN";
export type LabelName = "PC" | "AFP" | "NTP" | "AFP/NTP";

export interface CurvePoint {
  x: number;
  y: number;
}

// ──────────────────────────────────────────────────────────────
// Metric Response Types
// ──────────────────────────────────────────────────────────────

export interface MetricResponse {
  run_name: string;
  model_type: ModelType;
  split: Split;
  auc: number;
  avg_precision: number | null;
  precision: number;
  recall: number;
  f1: number;
  n_samples: number;
  n_positive: number;
  threshold: number | null;
  timestamp: string;
}

export interface SummaryStats {
  test_cnn: MetricResponse;
  test_gb: MetricResponse;
  val_cnn: MetricResponse | null;
  val_gb: MetricResponse | null;
}

export interface CurveResponse {
  model_type: ModelType;
  split: Split;
  pr_curve: CurvePoint[];
  roc_curve: CurvePoint[];
  auc: number;
  avg_precision: number;
}

// ──────────────────────────────────────────────────────────────
// TCE Types
// ──────────────────────────────────────────────────────────────

export interface TCESummary {
  tce_id: string;
  kepid: number;
  ra: number | null;
  dec: number | null;
  period: number;
  duration: number;
  depth: number;
  label: number;
  label_name: LabelName;
  cnn_prob: number | null;
  gb_prob: number | null;
  split: Split;
}

export interface TCEDetail extends TCESummary {
  t0_bkjd: number;
  global_view: number[];
  local_view: number[];
  secondary_eclipse_depth: number | null;
}

// ──────────────────────────────────────────────────────────────
// Counter & Split Stats
// ──────────────────────────────────────────────────────────────

export interface CounterResponse {
  total_tces: number;
  planet_candidates: number;
  astrophysical_false_positives: number;
  non_transiting_phenomena: number;
}

export interface SplitStats {
  split: Split;
  n_stars: number;
  n_tces: number;
  n_planets: number;
  planet_fraction: number;
}

// ──────────────────────────────────────────────────────────────
// Top Candidates
// ──────────────────────────────────────────────────────────────

export interface TopCandidate {
  rank: number;
  tce_id: string;
  kepid: number;
  period: number;
  probability: number;
  probability_bar: number; // 0-1 for UI bar
  true_label: number;
  true_label_name: LabelName;
}

// ──────────────────────────────────────────────────────────────
// Histogram
// ──────────────────────────────────────────────────────────────

export interface HistogramBin {
  bin_center: number;
  planet_count: number;
  not_planet_count: number;
}

export interface HistogramResponse {
  bins: HistogramBin[];
}

// ──────────────────────────────────────────────────────────────
// Scatter (Secondary Eclipse)
// ──────────────────────────────────────────────────────────────

export interface ScatterPoint {
  probability: number;
  secondary_eclipse_depth: number;
  label: number;
  label_name: LabelName;
  tce_id: string;
}

export interface ScatterResponse {
  points: ScatterPoint[];
}

// ──────────────────────────────────────────────────────────────
// Error Analysis
// ──────────────────────────────────────────────────────────────

export interface ErrorAnalysisItem {
  tce_id: string;
  kepid: number;
  label: number;
  label_name: LabelName;
  cnn_prob: number;
  error_type: ErrorType;
  is_confident: boolean;
}

// ──────────────────────────────────────────────────────────────
// Threshold
// ──────────────────────────────────────────────────────────────

export interface ThresholdUpdate {
  threshold: number;
}

export interface ThresholdResponse {
  threshold: number;
  precision: number;
  recall: number;
  f1: number;
  confusion_matrix: {
    TP: number;
    FP: number;
    TN: number;
    FN: number;
  };
  n_samples: number;
}

export interface OptimalThresholdResponse {
  threshold: number;
  source: string;
  model_type: ModelType;
}

// ──────────────────────────────────────────────────────────────
// Kepler-90
// ──────────────────────────────────────────────────────────────

export interface Kepler90Planet {
  name: string;
  period: number;
  t0_bkjd: number;
  duration_hr: number;
  depth: number;
  probability: number;
}

export interface Kepler90Response {
  planets: Kepler90Planet[];
  disclaimer: string;
}

// ──────────────────────────────────────────────────────────────
// Stars (grouped by KIC ID)
// ──────────────────────────────────────────────────────────────

export interface StarTCE {
  tce_id: string;
  period: number;
  label: number;
  label_name: LabelName;
  cnn_prob: number | null;
  gb_prob: number | null;
  split: Split;
}

export interface StarSummary {
  kepid: number;
  ra: number | null;
  dec: number | null;
  n_tces: number;
  n_planets: number;
  best_cnn_prob: number | null;
  best_gb_prob: number | null;
  split: Split;
}

export interface StarDetail {
  kepid: number;
  ra: number | null;
  dec: number | null;
  tces: StarTCE[];
  split: Split;
}

// ──────────────────────────────────────────────────────────────
// TCE Predictions
// ──────────────────────────────────────────────────────────────

export interface TCEPrediction {
  tce_id: string;
  kepid: number;
  label: number;
  label_name: LabelName;
  cnn_prob: number | null;
  cnn_pred: number | null;
  gb_prob: number | null;
  gb_pred: number | null;
  split: Split;
}

// ──────────────────────────────────────────────────────────────
// Plot Listing
// ──────────────────────────────────────────────────────────────

export interface PlotInfo {
  filename: string;
  url: string;
}

export interface PlotsResponse {
  plots: PlotInfo[];
}

// ──────────────────────────────────────────────────────────────
// Query Parameters
// ──────────────────────────────────────────────────────────────

export interface TCEListParams {
  split?: Split;
  limit?: number;
  offset?: number;
  min_prob?: number;
  max_prob?: number;
  label?: number;
}

export interface TopCandidatesParams {
  split?: Split;
  limit?: number;
}

export interface HistogramParams {
  split?: Split;
  bins?: number;
  model?: ModelType;
}

export interface ScatterEclipseParams {
  split?: Split;
  model?: ModelType;
  limit?: number;
}

export interface ThresholdParams {
  split?: Split;
}

export interface StarsListParams {
  split?: Split;
  kepid?: number;
  limit?: number;
  offset?: number;
  min_prob?: number;
  max_prob?: number;
}

export interface StarDetailParams {
  split?: Split;
}