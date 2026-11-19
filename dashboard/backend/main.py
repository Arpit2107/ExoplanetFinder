#!/usr/bin/env python3
"""
FastAPI backend for Exoplanet Finder dashboard.
Serves real metrics, predictions, and analysis from dashboard/data/ export.
Uses numpy only - no pandas, sklearn, or training code.
"""

from pathlib import Path
from typing import Optional, List, Dict, Any
import json

import numpy as np
from fastapi import FastAPI, HTTPException, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel, Field

# Project paths - load ONLY from dashboard/data/
ROOT = Path(__file__).resolve().parents[2]  # exoplanet-finder/
DATA_DIR = ROOT / "dashboard" / "data"
PLOTS_DIR = ROOT / "dashboard" / "backend" / "plots"

app = FastAPI(
    title="Exoplanet Finder Dashboard API",
    description="Real metrics and analysis from a two-view 1D CNN on Kepler DR24 TCEs",
    version="1.0.0",
)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# GZip compression for responses
app.add_middleware(GZipMiddleware, minimum_size=1000)


# ──────────────────────────────────────────────────────────────
# Pydantic Models
# ──────────────────────────────────────────────────────────────

class MetricResponse(BaseModel):
    run_name: str
    model_type: str  # "cnn" or "gb"
    split: str  # "train" | "val" | "test"
    auc: float
    avg_precision: Optional[float] = None
    precision: float
    recall: float
    f1: float
    n_samples: int
    n_positive: int
    threshold: Optional[float] = None
    timestamp: str


class CurvePoint(BaseModel):
    x: float
    y: float


class CurveResponse(BaseModel):
    model_type: str
    split: str
    pr_curve: List[CurvePoint]
    roc_curve: List[CurvePoint]
    auc: float
    avg_precision: float


class TCEPrediction(BaseModel):
    tce_id: str
    kepid: int
    label: int
    label_name: str  # "PC" or "AFP/NTP"
    cnn_prob: Optional[float] = None
    cnn_pred: Optional[int] = None
    gb_prob: Optional[float] = None
    gb_pred: Optional[int] = None
    split: str


class ErrorAnalysisItem(BaseModel):
    tce_id: str
    kepid: int
    label: int
    label_name: str
    cnn_prob: float
    error_type: str  # "FP" or "FN"
    is_confident: bool  # prob > 0.9 for FP, prob < 0.1 for FN


class Kepler90Planet(BaseModel):
    name: str
    period: float
    t0_bkjd: float
    duration_hr: float
    depth: float
    probability: float


class Kepler90Response(BaseModel):
    planets: List[Kepler90Planet]
    disclaimer: str


# ── New models for stars endpoint ──
class StarTCE(BaseModel):
    """TCE info for a star's TCE list."""
    tce_id: str
    period: float
    label: int
    label_name: str
    cnn_prob: Optional[float] = None
    gb_prob: Optional[float] = None
    split: str


class StarSummary(BaseModel):
    """Summary star info for list view."""
    kepid: int
    ra: Optional[float] = None
    dec: Optional[float] = None
    n_tces: int
    n_planets: int
    best_cnn_prob: Optional[float] = None
    best_gb_prob: Optional[float] = None
    split: str


class StarDetail(BaseModel):
    """Full star detail with all TCEs."""
    kepid: int
    ra: Optional[float] = None
    dec: Optional[float] = None
    tces: List[StarTCE]
    split: str


class SummaryStats(BaseModel):
    test_cnn: MetricResponse
    test_gb: MetricResponse
    val_cnn: Optional[MetricResponse] = None
    val_gb: Optional[MetricResponse] = None


# ── New models for extended endpoints ──

class TCESummary(BaseModel):
    """Summary TCE info for list view."""
    tce_id: str
    kepid: int
    ra: Optional[float] = None
    dec: Optional[float] = None
    period: float
    duration: float
    depth: float
    label: int
    label_name: str
    cnn_prob: Optional[float] = None
    gb_prob: Optional[float] = None
    split: str


class TCEDetail(BaseModel):
    """Full TCE detail for inspector."""
    tce_id: str
    kepid: int
    ra: Optional[float] = None
    dec: Optional[float] = None
    period: float
    t0_bkjd: float
    duration: float
    depth: float
    label: int
    label_name: str
    cnn_prob: Optional[float] = None
    gb_prob: Optional[float] = None
    split: str
    global_view: List[float]
    local_view: List[float]
    secondary_eclipse_depth: Optional[float] = None


class CounterResponse(BaseModel):
    total_tces: int
    planet_candidates: int
    astrophysical_false_positives: int
    non_transiting_phenomena: int


class SplitStats(BaseModel):
    split: str
    n_stars: int
    n_tces: int
    n_planets: int
    planet_fraction: float


class TopCandidate(BaseModel):
    rank: int
    tce_id: str
    kepid: int
    period: float
    probability: float
    probability_bar: float  # 0-1 for UI bar
    true_label: int
    true_label_name: str


class HistogramBin(BaseModel):
    bin_center: float
    planet_count: int
    not_planet_count: int


class HistogramResponse(BaseModel):
    bins: List[HistogramBin]


class ScatterPoint(BaseModel):
    probability: float
    secondary_eclipse_depth: float
    label: int
    label_name: str
    tce_id: str


class ScatterResponse(BaseModel):
    points: List[ScatterPoint]


class ThresholdUpdate(BaseModel):
    threshold: float = Field(..., ge=0.0, le=1.0)


class ThresholdResponse(BaseModel):
    threshold: float
    precision: float
    recall: float
    f1: float
    confusion_matrix: Dict[str, int]  # TP, FP, TN, FN
    n_samples: int


class OptimalThresholdResponse(BaseModel):
    threshold: float
    source: str  # "validation_f1" or "validation_youden" etc.
    model_type: str


# ──────────────────────────────────────────────────────────────
# Helpers - Load data from dashboard/data/ using numpy only
# ──────────────────────────────────────────────────────────────

# Global cache for loaded data
_data_cache: Dict[str, Any] = {}


def _load_npz(filename: str) -> Dict[str, np.ndarray]:
    """Load .npz file and return dict of arrays."""
    path = DATA_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"{filename} not found in dashboard/data/")
    data = np.load(path, allow_pickle=True)
    return {key: data[key] for key in data.files}


def load_metrics() -> Dict[str, np.ndarray]:
    """Load metrics.npz."""
    if 'metrics' not in _data_cache:
        _data_cache['metrics'] = _load_npz('metrics.npz')
    return _data_cache['metrics']


def load_tce_table() -> Dict[str, np.ndarray]:
    """Load tce_table.npz."""
    if 'tce_table' not in _data_cache:
        _data_cache['tce_table'] = _load_npz('tce_table.npz')
    return _data_cache['tce_table']


def load_views() -> Dict[str, np.ndarray]:
    """Load views.npz."""
    if 'views' not in _data_cache:
        _data_cache['views'] = _load_npz('views.npz')
    return _data_cache['views']


def load_predictions(model_type: str, split: str) -> Dict[str, np.ndarray]:
    """Load predictions for a model type and split."""
    filename = f'{model_type}_{split}_preds.npz'
    if filename not in _data_cache:
        _data_cache[filename] = _load_npz(filename)
    return _data_cache[filename]


def load_errors(filename: str) -> Dict[str, np.ndarray]:
    """Load error analysis files."""
    if filename not in _data_cache:
        _data_cache[filename] = _load_npz(filename)
    return _data_cache[filename]


def load_kepler90() -> Dict[str, np.ndarray]:
    """Load kepler90_demo.npz."""
    if 'kepler90' not in _data_cache:
        _data_cache['kepler90'] = _load_npz('kepler90_demo.npz')
    return _data_cache['kepler90']


def compute_curves(y_true: np.ndarray, y_prob: np.ndarray, max_points: int = 200) -> tuple[list, list, float, float]:
    """Compute PR and ROC curve points from predictions using numpy only."""
    # Sort by probability descending
    sort_idx = np.argsort(y_prob)[::-1]
    y_true_sorted = y_true[sort_idx]
    y_prob_sorted = y_prob[sort_idx]

    # PR curve - compute precision and recall at each threshold
    n_pos = np.sum(y_true_sorted == 1)
    n_neg = np.sum(y_true_sorted == 0)

    tp = np.cumsum(y_true_sorted == 1)
    fp = np.cumsum(y_true_sorted == 0)

    precision = tp / (tp + fp + 1e-10)
    recall = tp / (n_pos + 1e-10)

    # Add starting point (recall=0, precision=1)
    precision = np.concatenate([[1.0], precision])
    recall = np.concatenate([[0.0], recall])

    # ROC curve - compute FPR and TPR
    tpr = tp / (n_pos + 1e-10)
    fpr = fp / (n_neg + 1e-10)

    # Add starting point (0,0)
    tpr = np.concatenate([[0.0], tpr])
    fpr = np.concatenate([[0.0], fpr])

    # Subsample to max_points (keep first and last, evenly space the rest)
    n = len(recall)
    if n > max_points:
        # Select indices: first, last, and evenly spaced in between
        indices = np.linspace(0, n - 1, max_points, dtype=int)
        # Ensure unique indices
        indices = np.unique(indices)
        recall = recall[indices]
        precision = precision[indices]
        fpr = fpr[indices]
        tpr = tpr[indices]

    pr_points = [CurvePoint(x=float(r), y=float(p)) for r, p in zip(recall, precision)]
    roc_points = [CurvePoint(x=float(f), y=float(t)) for f, t in zip(fpr, tpr)]

    # AUC using trapezoidal rule (compute on full curve before subsampling for accuracy)
    roc_auc = float(np.trapz(tpr, fpr)) if n <= max_points else float(np.trapz(
        np.concatenate([[0.0], np.cumsum(y_true_sorted == 1) / (n_pos + 1e-10)]),
        np.concatenate([[0.0], np.cumsum(y_true_sorted == 0) / (n_neg + 1e-10)])
    ))

    # Average precision (approximation using PR curve, on full curve for accuracy)
    ap = float(np.trapz(precision, recall)) if n <= max_points else float(np.trapz(
        np.concatenate([[1.0], np.cumsum(y_true_sorted == 1) / (np.cumsum(y_true_sorted == 1) + np.cumsum(y_true_sorted == 0) + 1e-10)]),
        np.concatenate([[0.0], np.cumsum(y_true_sorted == 1) / (n_pos + 1e-10)])
    ))

    return pr_points, roc_points, roc_auc, ap


def get_secondary_eclipse_depth(global_view: np.ndarray) -> float:
    """Depth at phase +/-0.5 (secondary eclipse position for circular orbits)."""
    n = len(global_view)
    center = n // 2
    half = n // 2
    sec_idx1 = (center + half // 2) % n
    sec_idx2 = (center - half // 2) % n
    window = 10
    sec_depth1 = 1 - np.median(global_view[max(0, sec_idx1-window):min(n, sec_idx1+window)])
    sec_depth2 = 1 - np.median(global_view[max(0, sec_idx2-window):min(n, sec_idx2+window)])
    return float(max(sec_depth1, sec_depth2))


def get_label_name(label: int, av_training_set: Optional[str] = None) -> str:
    """Convert label to human-readable name."""
    if label == 1:
        return "PC"
    elif av_training_set == "AFP":
        return "AFP"
    elif av_training_set == "NTP":
        return "NTP"
    return "AFP/NTP"


# ──────────────────────────────────────────────────────────────
# API Endpoints
# ──────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "message": "Exoplanet Finder Dashboard API"}


@app.get("/api/summary", response_model=SummaryStats)
def get_summary():
    """Get headline metrics for test and validation splits."""
    metrics = load_metrics()

    def get_latest(model_type: str, split: str) -> Optional[MetricResponse]:
        mask = (metrics['model_type'] == model_type) & (metrics['split'] == split)
        if not np.any(mask):
            return None
        # Get latest by timestamp
        idx = np.where(mask)[0]
        # Sort by timestamp
        timestamps = metrics['timestamp'][idx]
        latest_idx = idx[np.argmax(timestamps)]

        return MetricResponse(
            run_name=str(metrics['run_name'][latest_idx]),
            model_type=str(metrics['model_type'][latest_idx]),
            split=str(metrics['split'][latest_idx]),
            auc=float(metrics['auc'][latest_idx]),
            avg_precision=float(metrics['avg_precision'][latest_idx]),
            precision=float(metrics['precision'][latest_idx]),
            recall=float(metrics['recall'][latest_idx]),
            f1=float(metrics['f1'][latest_idx]),
            n_samples=int(metrics['n_samples'][latest_idx]),
            n_positive=int(metrics['n_positive'][latest_idx]),
            threshold=float(metrics['threshold'][latest_idx]) if metrics['threshold'][latest_idx] is not None else None,
            timestamp=str(metrics['timestamp'][latest_idx]),
        )

    return SummaryStats(
        test_cnn=get_latest("cnn", "test"),
        test_gb=get_latest("gb", "test"),
        val_cnn=get_latest("cnn", "val"),
        val_gb=get_latest("gb", "val"),
    )


@app.get("/api/metrics", response_model=List[MetricResponse])
def get_all_metrics():
    """Get all logged metrics."""
    metrics = load_metrics()
    results = []
    for i in range(len(metrics['run_name'])):
        results.append(MetricResponse(
            run_name=str(metrics['run_name'][i]),
            model_type=str(metrics['model_type'][i]),
            split=str(metrics['split'][i]),
            auc=float(metrics['auc'][i]),
            avg_precision=float(metrics['avg_precision'][i]),
            precision=float(metrics['precision'][i]),
            recall=float(metrics['recall'][i]),
            f1=float(metrics['f1'][i]),
            n_samples=int(metrics['n_samples'][i]),
            n_positive=int(metrics['n_positive'][i]),
            threshold=float(metrics['threshold'][i]) if metrics['threshold'][i] is not None else None,
            timestamp=str(metrics['timestamp'][i]),
        ))
    return results


@app.get("/api/curves/{model_type}/{split}", response_model=CurveResponse)
def get_curves(model_type: str, split: str):
    """Get PR and ROC curve data for a model on a split."""
    if model_type not in ("cnn", "gb"):
        raise HTTPException(status_code=404, detail="model_type must be 'cnn' or 'gb'")
    if split not in ("train", "val", "test"):
        raise HTTPException(status_code=404, detail="split must be 'train', 'val', or 'test'")

    views = load_views()
    tce_table = load_tce_table()

    split_mask = tce_table['split'] == split
    split_tce_ids = tce_table['tce_id'][split_mask]
    view_tce_ids = views['tce_id']
    idx_map = {tid: i for i, tid in enumerate(view_tce_ids)}
    split_indices = [idx_map[tid] for tid in split_tce_ids]
    y_true = views['label'][split_indices]

    # Load predictions
    pred_data = load_predictions(model_type, split)
    pred_map = dict(zip(pred_data['tce_id'], pred_data['y_prob']))
    y_prob = np.array([pred_map.get(tid, 0.5) for tid in split_tce_ids])

    pr_curve, roc_curve, auc_val, ap_val = compute_curves(y_true, y_prob)

    return CurveResponse(
        model_type=model_type,
        split=split,
        pr_curve=pr_curve,
        roc_curve=roc_curve,
        auc=auc_val,
        avg_precision=ap_val,
    )


@app.get("/api/predictions/{split}", response_model=List[TCEPrediction])
def get_predictions(split: str, limit: int = 100):
    """Get per-TCE predictions for a split."""
    if split not in ("train", "val", "test"):
        raise HTTPException(status_code=400, detail="split must be 'train', 'val', or 'test'")

    tce_table = load_tce_table()
    split_mask = tce_table['split'] == split
    split_df_indices = np.where(split_mask)[0][:limit]

    # Load CNN preds
    cnn_pred_data = load_predictions("cnn", split)
    cnn_probs = dict(zip(cnn_pred_data['tce_id'], cnn_pred_data['y_prob']))
    cnn_preds = dict(zip(cnn_pred_data['tce_id'], cnn_pred_data['y_pred']))

    # Load GB preds
    gb_pred_data = load_predictions("gb", split)
    gb_probs = dict(zip(gb_pred_data['tce_id'], gb_pred_data['y_prob']))
    gb_preds = dict(zip(gb_pred_data['tce_id'], gb_pred_data['y_pred']))

    results = []
    for idx in split_df_indices:
        tid = tce_table['tce_id'][idx]
        results.append(TCEPrediction(
            tce_id=str(tid),
            kepid=int(tce_table['kepid'][idx]),
            label=int(tce_table['label'][idx]),
            label_name=get_label_name(int(tce_table['label'][idx]), str(tce_table['av_training_set'][idx])),
            cnn_prob=cnn_probs.get(str(tid)),
            cnn_pred=cnn_preds.get(str(tid)),
            gb_prob=gb_probs.get(str(tid)),
            gb_pred=gb_preds.get(str(tid)),
            split=split,
        ))

    return results


@app.get("/api/errors", response_model=List[ErrorAnalysisItem])
def get_errors():
    """Get error analysis: false positives and false negatives from test set."""
    fp_data = load_errors('test_false_positives.npz')
    fn_data = load_errors('test_false_negatives.npz')
    flagged_data = load_errors('test_flagged_label_errors.npz')

    results = []

    for i in range(len(fp_data['tce_id'])):
        prob = float(fp_data['prob'][i])
        results.append(ErrorAnalysisItem(
            tce_id=str(fp_data['tce_id'][i]),
            kepid=int(fp_data['kepid'][i]),
            label=int(fp_data['label'][i]),
            label_name="AFP/NTP",
            cnn_prob=prob,
            error_type="FP",
            is_confident=prob > 0.9,
        ))

    for i in range(len(fn_data['tce_id'])):
        prob = float(fn_data['prob'][i])
        results.append(ErrorAnalysisItem(
            tce_id=str(fn_data['tce_id'][i]),
            kepid=int(fn_data['kepid'][i]),
            label=int(fn_data['label'][i]),
            label_name="PC",
            cnn_prob=prob,
            error_type="FN",
            is_confident=prob < 0.1,
        ))

    results.sort(key=lambda x: -x.cnn_prob if x.error_type == "FP" else x.cnn_prob)
    return results


@app.get("/api/kepler90", response_model=Kepler90Response)
def get_kepler90():
    """Get Kepler-90 demo results."""
    kepler90 = load_kepler90()

    planets = []
    for i in range(len(kepler90['name'])):
        planets.append(Kepler90Planet(
            name=str(kepler90['name'][i]),
            period=float(kepler90['period'][i]),
            t0_bkjd=float(kepler90['t0_bkjd'][i]),
            duration_hr=float(kepler90['duration_hr'][i]),
            depth=float(kepler90['depth'][i]),
            probability=float(kepler90['probability'][i]),
        ))

    return Kepler90Response(
        planets=planets,
        disclaimer="This is a one-star illustration, not evidence of model accuracy. Kepler-90 was excluded from training.",
    )


@app.get("/api/stars", response_model=List[StarSummary])
def get_stars(
    split: str = Query("test", description="Split: train, val, or test"),
    kepid: Optional[int] = Query(None, description="Filter by specific KIC ID"),
    limit: int = Query(500, ge=1, le=5000, description="Max stars to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    min_prob: Optional[float] = Query(None, ge=0.0, le=1.0, description="Minimum best CNN probability"),
    max_prob: Optional[float] = Query(None, ge=0.0, le=1.0, description="Maximum best CNN probability"),
):
    """
    Get stars (grouped by KIC ID) with their TCE summaries.
    Supports filtering by kepid, split, and probability range.
    """
    if split not in ("train", "val", "test"):
        raise HTTPException(status_code=400, detail="split must be 'train', 'val', or 'test'")

    tce_table = load_tce_table()
    views = load_views()

    # Load CNN probabilities for this split
    cnn_pred_data = load_predictions("cnn", split)
    cnn_probs = dict(zip(cnn_pred_data['tce_id'], cnn_pred_data['y_prob']))

    # Load GB probabilities
    gb_pred_data = load_predictions("gb", split)
    gb_probs = dict(zip(gb_pred_data['tce_id'], gb_pred_data['y_prob']))

    # Filter to split
    split_mask = tce_table['split'] == split
    split_indices = np.where(split_mask)[0]

    # Apply kepid filter if provided
    if kepid is not None:
        kepid_mask = tce_table['kepid'][split_indices] == kepid
        split_indices = split_indices[kepid_mask]

    # Group by kepid
    kepids = tce_table['kepid'][split_indices]
    unique_kepids = np.unique(kepids)

    # For each kepid, compute summary stats
    star_summaries = []
    for kpid in unique_kepids:
        kpid_mask = tce_table['kepid'][split_indices] == kpid
        kpid_indices = split_indices[kpid_mask]
        n_tces = len(kpid_indices)
        n_planets = int(np.sum(tce_table['label'][kpid_indices] == 1))

        # Get best CNN prob for this star
        best_cnn = None
        best_gb = None
        for idx in kpid_indices:
            tid = str(tce_table['tce_id'][idx])
            cnn_p = cnn_probs.get(tid)
            gb_p = gb_probs.get(tid)
            if cnn_p is not None:
                if best_cnn is None or cnn_p > best_cnn:
                    best_cnn = float(cnn_p)
            if gb_p is not None:
                if best_gb is None or gb_p > best_gb:
                    best_gb = float(gb_p)

        # Apply probability filters
        if min_prob is not None and best_cnn is not None and best_cnn < min_prob:
            continue
        if max_prob is not None and best_cnn is not None and best_cnn > max_prob:
            continue

        # Get ra/dec
        ra = float(tce_table['ra'][kpid_indices[0]]) if 'ra' in tce_table and not np.isnan(tce_table['ra'][kpid_indices[0]]) else None
        dec = float(tce_table['dec'][kpid_indices[0]]) if 'dec' in tce_table and not np.isnan(tce_table['dec'][kpid_indices[0]]) else None

        star_summaries.append(StarSummary(
            kepid=int(kpid),
            ra=ra,
            dec=dec,
            n_tces=n_tces,
            n_planets=n_planets,
            best_cnn_prob=best_cnn,
            best_gb_prob=best_gb,
            split=split,
        ))

    # Sort by best CNN prob descending
    star_summaries.sort(key=lambda s: s.best_cnn_prob if s.best_cnn_prob is not None else -1, reverse=True)

    # Paginate
    total = len(star_summaries)
    star_summaries = star_summaries[offset:offset + limit]

    return star_summaries


@app.get("/api/stars/{kepid}", response_model=StarDetail)
def get_star_detail(
    kepid: int,
    split: str = Query("test", description="Split: train, val, or test"),
):
    """
    Get full detail for a specific star including all its TCEs.
    """
    if split not in ("train", "val", "test"):
        raise HTTPException(status_code=400, detail="split must be 'train', 'val', or 'test'")

    tce_table = load_tce_table()
    views = load_views()

    # Load CNN probabilities for this split
    cnn_pred_data = load_predictions("cnn", split)
    cnn_probs = dict(zip(cnn_pred_data['tce_id'], cnn_pred_data['y_prob']))

    # Load GB probabilities
    gb_pred_data = load_predictions("gb", split)
    gb_probs = dict(zip(gb_pred_data['tce_id'], gb_pred_data['y_prob']))

    # Filter to split and kepid
    split_mask = tce_table['split'] == split
    kepid_mask = tce_table['kepid'] == kepid
    combined_mask = split_mask & kepid_mask
    if not np.any(combined_mask):
        raise HTTPException(status_code=404, detail=f"Star KIC {kepid} not found in split {split}")

    indices = np.where(combined_mask)[0]

    # Get ra/dec
    ra = float(tce_table['ra'][indices[0]]) if 'ra' in tce_table and not np.isnan(tce_table['ra'][indices[0]]) else None
    dec = float(tce_table['dec'][indices[0]]) if 'dec' in tce_table and not np.isnan(tce_table['dec'][indices[0]]) else None

    tces = []
    for idx in indices:
        tid = str(tce_table['tce_id'][idx])
        tces.append(StarTCE(
            tce_id=tid,
            period=float(tce_table['tce_period'][idx]),
            label=int(tce_table['label'][idx]),
            label_name=get_label_name(int(tce_table['label'][idx]), str(tce_table['av_training_set'][idx])),
            cnn_prob=cnn_probs.get(tid),
            gb_prob=gb_probs.get(tid),
            split=split,
        ))

    # Sort TCEs by CNN prob descending
    tces.sort(key=lambda t: t.cnn_prob if t.cnn_prob is not None else -1, reverse=True)

    return StarDetail(
        kepid=kepid,
        ra=ra,
        dec=dec,
        tces=tces,
        split=split,
    )


@app.get("/api/plots")
def list_plots():
    """List available plot files."""
    plots = []
    if PLOTS_DIR.exists():
        for f in PLOTS_DIR.glob("*.png"):
            plots.append({"filename": f.name, "url": f"/plots/{f.name}"})
    return {"plots": plots}


@app.get("/plots/{filename}")
def serve_plot(filename: str):
    """Serve plot images."""
    from fastapi.responses import FileResponse
    path = PLOTS_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Plot not found")
    return FileResponse(path)


# ──────────────────────────────────────────────────────────────
# NEW ENDPOINTS - Extended API
# ──────────────────────────────────────────────────────────────

@app.get("/api/tces", response_model=List[TCESummary])
def get_tces(
    split: str = Query("test", description="Split: train, val, or test"),
    limit: int = Query(500, ge=1, le=5000, description="Max results"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    min_prob: Optional[float] = Query(None, ge=0.0, le=1.0, description="Minimum CNN probability"),
    max_prob: Optional[float] = Query(None, ge=0.0, le=1.0, description="Maximum CNN probability"),
    label: Optional[int] = Query(None, ge=0, le=1, description="Filter by true label (0 or 1)"),
):
    """
    Paginated TCE list with ra/dec, period, duration, depth, probability.
    Handles missing ra/dec gracefully (returns null).
    """
    if split not in ("train", "val", "test"):
        raise HTTPException(status_code=400, detail="split must be 'train', 'val', or 'test'")

    tce_table = load_tce_table()
    views = load_views()

    # Load CNN probabilities for this split
    cnn_pred_data = load_predictions("cnn", split)
    cnn_probs = dict(zip(cnn_pred_data['tce_id'], cnn_pred_data['y_prob']))

    # Load GB probabilities
    gb_pred_data = load_predictions("gb", split)
    gb_probs = dict(zip(gb_pred_data['tce_id'], gb_pred_data['y_prob']))

    # Filter to split
    split_mask = tce_table['split'] == split
    split_indices = np.where(split_mask)[0]

    # Apply filters
    if label is not None:
        label_mask = tce_table['label'][split_indices] == label
        split_indices = split_indices[label_mask]

    if min_prob is not None:
        probs = np.array([cnn_probs.get(str(tce_table['tce_id'][i]), np.nan) for i in split_indices])
        prob_mask = probs >= min_prob
        split_indices = split_indices[prob_mask]

    if max_prob is not None:
        probs = np.array([cnn_probs.get(str(tce_table['tce_id'][i]), np.nan) for i in split_indices])
        prob_mask = probs <= max_prob
        split_indices = split_indices[prob_mask]

    # Paginate
    total = len(split_indices)
    split_indices = split_indices[offset:offset + limit]

    results = []
    for idx in split_indices:
        tid = str(tce_table['tce_id'][idx])
        ra = float(tce_table['ra'][idx]) if 'ra' in tce_table and not np.isnan(tce_table['ra'][idx]) else None
        dec = float(tce_table['dec'][idx]) if 'dec' in tce_table and not np.isnan(tce_table['dec'][idx]) else None

        results.append(TCESummary(
            tce_id=tid,
            kepid=int(tce_table['kepid'][idx]),
            ra=ra,
            dec=dec,
            period=float(tce_table['tce_period'][idx]),
            duration=float(tce_table['tce_duration'][idx]),
            depth=float(tce_table['depth'][idx]) if not np.isnan(tce_table['depth'][idx]) else 0.0,
            label=int(tce_table['label'][idx]),
            label_name=get_label_name(int(tce_table['label'][idx]), str(tce_table['av_training_set'][idx])),
            cnn_prob=cnn_probs.get(tid),
            gb_prob=gb_probs.get(tid),
            split=split,
        ))

    return results


@app.get("/api/tces/{tce_id}", response_model=TCEDetail)
def get_tce_detail(tce_id: str):
    """
    Full TCE detail with global/local view light curves.
    Handles missing ra/dec gracefully (returns null).
    """
    tce_table = load_tce_table()
    views = load_views()

    # Find TCE in table
    tce_mask = tce_table['tce_id'] == tce_id
    if not np.any(tce_mask):
        raise HTTPException(status_code=404, detail=f"TCE {tce_id} not found")

    idx = np.where(tce_mask)[0][0]

    # Find index in views
    view_tce_ids = views['tce_id']
    idx_map = {tid: i for i, tid in enumerate(view_tce_ids)}
    if tce_id not in idx_map:
        raise HTTPException(status_code=404, detail=f"Views for TCE {tce_id} not found")

    view_idx = idx_map[tce_id]

    # Load probabilities
    cnn_prob = None
    gb_prob = None
    for split in ("test", "val", "train"):
        pred_data = load_predictions("cnn", split)
        pred_map = dict(zip(pred_data['tce_id'], pred_data['y_prob']))
        if tce_id in pred_map:
            cnn_prob = float(pred_map[tce_id])
            break

        pred_data = load_predictions("gb", split)
        pred_map = dict(zip(pred_data['tce_id'], pred_data['y_prob']))
        if tce_id in pred_map:
            gb_prob = float(pred_map[tce_id])
            break

    # Get views
    global_view = views['global'][view_idx].tolist()
    local_view = views['local'][view_idx].tolist()

    # Calculate secondary eclipse depth
    sec_depth = get_secondary_eclipse_depth(views['global'][view_idx])

    # Handle ra/dec
    ra = float(tce_table['ra'][idx]) if 'ra' in tce_table and not np.isnan(tce_table['ra'][idx]) else None
    dec = float(tce_table['dec'][idx]) if 'dec' in tce_table and not np.isnan(tce_table['dec'][idx]) else None

    return TCEDetail(
        tce_id=tce_id,
        kepid=int(tce_table['kepid'][idx]),
        ra=ra,
        dec=dec,
        period=float(tce_table['tce_period'][idx]),
        t0_bkjd=float(tce_table['tce_time0bk'][idx]),
        duration=float(tce_table['tce_duration'][idx]),
        depth=float(tce_table['depth'][idx]) if not np.isnan(tce_table['depth'][idx]) else 0.0,
        label=int(tce_table['label'][idx]),
        label_name=get_label_name(int(tce_table['label'][idx]), str(tce_table['av_training_set'][idx])),
        cnn_prob=cnn_prob,
        gb_prob=gb_prob,
        split=str(tce_table['split'][idx]),
        global_view=global_view,
        local_view=local_view,
        secondary_eclipse_depth=sec_depth,
    )


@app.get("/api/stats/counters", response_model=CounterResponse)
def get_counters():
    """
    Total TCEs, planet candidates, astrophysical false positives,
    non-transiting phenomena (instrument-readout style counts).
    """
    tce_table = load_tce_table()

    total = len(tce_table['tce_id'])
    planets = int(np.sum(tce_table['label'] == 1))
    afp = int(np.sum((tce_table['label'] == 0) & (tce_table['av_training_set'] == 'AFP'))) if 'av_training_set' in tce_table else 0
    ntp = int(np.sum((tce_table['label'] == 0) & (tce_table['av_training_set'] == 'NTP'))) if 'av_training_set' in tce_table else 0

    return CounterResponse(
        total_tces=total,
        planet_candidates=planets,
        astrophysical_false_positives=afp,
        non_transiting_phenomena=ntp,
    )


@app.get("/api/stats/splits", response_model=List[SplitStats])
def get_splits():
    """
    Train/val/test stars & TCEs, planet fraction per split.
    """
    tce_table = load_tce_table()

    results = []
    for split_name in ("train", "val", "test"):
        split_mask = tce_table['split'] == split_name
        split_indices = np.where(split_mask)[0]
        n_tces = len(split_indices)
        n_stars = int(len(np.unique(tce_table['kepid'][split_indices]))) if n_tces > 0 else 0
        n_planets = int(np.sum(tce_table['label'][split_indices] == 1))
        planet_fraction = n_planets / n_tces if n_tces > 0 else 0.0

        results.append(SplitStats(
            split=split_name,
            n_stars=n_stars,
            n_tces=n_tces,
            n_planets=n_planets,
            planet_fraction=planet_fraction,
        ))

    return results


@app.get("/api/stats/top-candidates", response_model=List[TopCandidate])
def get_top_candidates(
    split: str = Query("test", description="Split: train, val, or test"),
    limit: int = Query(20, ge=1, le=100, description="Number of top candidates"),
):
    """
    Top candidates ranking table like a leaderboard:
    rank, kepid, period, probability bar, true label.
    Filter by split, default test.
    """
    if split not in ("train", "val", "test"):
        raise HTTPException(status_code=400, detail="split must be 'train', 'val', or 'test'")

    tce_table = load_tce_table()
    split_mask = tce_table['split'] == split
    split_indices = np.where(split_mask)[0]

    # Load CNN probabilities for this split
    cnn_pred_data = load_predictions("cnn", split)
    cnn_probs = dict(zip(cnn_pred_data['tce_id'], cnn_pred_data['y_prob']))

    # Get probabilities for each TCE in split
    probs = np.array([cnn_probs.get(str(tce_table['tce_id'][i]), 0.0) for i in split_indices])

    # Sort by probability descending
    sort_idx = np.argsort(probs)[::-1][:limit]

    results = []
    for rank, idx in enumerate(sort_idx, 1):
        orig_idx = split_indices[idx]
        prob = probs[idx]
        results.append(TopCandidate(
            rank=rank,
            tce_id=str(tce_table['tce_id'][orig_idx]),
            kepid=int(tce_table['kepid'][orig_idx]),
            period=float(tce_table['tce_period'][orig_idx]),
            probability=float(prob),
            probability_bar=float(prob),
            true_label=int(tce_table['label'][orig_idx]),
            true_label_name=get_label_name(int(tce_table['label'][orig_idx]), str(tce_table['av_training_set'][orig_idx])),
        ))

    return results


@app.get("/api/stats/histogram", response_model=HistogramResponse)
def get_histogram(
    split: str = Query("test", description="Split: train, val, or test"),
    bins: int = Query(20, ge=5, le=50, description="Number of histogram bins"),
    model: str = Query("cnn", description="Model: cnn or gb"),
):
    """
    Probability histogram split by true label.
    """
    if split not in ("train", "val", "test"):
        raise HTTPException(status_code=400, detail="split must be 'train', 'val', or 'test'")
    if model not in ("cnn", "gb"):
        raise HTTPException(status_code=400, detail="model must be 'cnn' or 'gb'")

    tce_table = load_tce_table()
    views = load_views()

    split_mask = tce_table['split'] == split
    split_indices = np.where(split_mask)[0]
    split_tce_ids = tce_table['tce_id'][split_indices]
    view_tce_ids = views['tce_id']
    idx_map = {tid: i for i, tid in enumerate(view_tce_ids)}
    view_indices = [idx_map[tid] for tid in split_tce_ids]
    y_true = views['label'][view_indices]

    # Load predictions
    pred_data = load_predictions(model, split)
    pred_map = dict(zip(pred_data['tce_id'], pred_data['y_prob']))
    y_prob = np.array([pred_map.get(tid, 0.5) for tid in split_tce_ids])

    # Create histogram bins
    bin_edges = np.linspace(0, 1, bins + 1)
    bin_centers = (bin_edges[:-1] + bin_edges[1:]) / 2

    histogram_bins = []
    for i, center in enumerate(bin_centers):
        lo, hi = bin_edges[i], bin_edges[i+1]
        if i == bins - 1:
            mask = (y_prob >= lo) & (y_prob <= hi)
        else:
            mask = (y_prob >= lo) & (y_prob < hi)

        planet_count = int(np.sum((y_true == 1) & mask))
        not_planet_count = int(np.sum((y_true == 0) & mask))

        histogram_bins.append(HistogramBin(
            bin_center=float(center),
            planet_count=planet_count,
            not_planet_count=not_planet_count,
        ))

    return HistogramResponse(bins=histogram_bins)


@app.get("/api/stats/scatter-eclipse", response_model=ScatterResponse)
def get_scatter_eclipse(
    split: str = Query("test", description="Split: train, val, or test"),
    model: str = Query("cnn", description="Model: cnn or gb"),
    limit: int = Query(5000, ge=1, le=10000, description="Max points to return"),
):
    """
    Scatter of model probability vs secondary-eclipse depth showing
    how binaries with a second dip fool the model.
    """
    if split not in ("train", "val", "test"):
        raise HTTPException(status_code=400, detail="split must be 'train', 'val', or 'test'")
    if model not in ("cnn", "gb"):
        raise HTTPException(status_code=400, detail="model must be 'cnn' or 'gb'")

    views = load_views()
    tce_table = load_tce_table()

    split_mask = tce_table['split'] == split
    split_indices = np.where(split_mask)[0]
    split_tce_ids = tce_table['tce_id'][split_indices]
    view_tce_ids = views['tce_id']
    idx_map = {tid: i for i, tid in enumerate(view_tce_ids)}
    view_indices = [idx_map[tid] for tid in split_tce_ids]
    y_true = views['label'][view_indices]

    # Load predictions
    pred_data = load_predictions(model, split)
    pred_map = dict(zip(pred_data['tce_id'], pred_data['y_prob']))
    y_prob = np.array([pred_map.get(tid, 0.5) for tid in split_tce_ids])

    # Calculate secondary eclipse depths
    sec_depths = []
    for idx in view_indices:
        sec_depths.append(get_secondary_eclipse_depth(views['global'][idx]))
    sec_depths = np.array(sec_depths)

    # Limit points for performance
    n_points = min(limit, len(view_indices))
    if len(view_indices) > n_points:
        # Stratified sampling: equal from each label
        pos_indices = np.where(y_true == 1)[0]
        neg_indices = np.where(y_true == 0)[0]
        n_pos = min(len(pos_indices), n_points // 2)
        n_neg = n_points - n_pos
        selected = np.concatenate([
            np.random.choice(pos_indices, n_pos, replace=False) if n_pos > 0 else [],
            np.random.choice(neg_indices, n_neg, replace=False) if n_neg > 0 else [],
        ])
    else:
        selected = np.arange(len(view_indices))

    points = []
    for i in selected:
        tid = str(split_tce_ids[i])
        points.append(ScatterPoint(
            probability=float(y_prob[i]),
            secondary_eclipse_depth=float(sec_depths[i]),
            label=int(y_true[i]),
            label_name="PC" if y_true[i] == 1 else "AFP/NTP",
            tce_id=tid,
        ))

    return ScatterResponse(points=points)


@app.get("/api/threshold/optimal", response_model=OptimalThresholdResponse)
def get_optimal_threshold(model: str = Query("cnn", description="Model: cnn or gb")):
    """
    Get validation-chosen threshold (maximizing F1 on validation set).
    """
    if model not in ("cnn", "gb"):
        raise HTTPException(status_code=400, detail="model must be 'cnn' or 'gb'")

    views = load_views()
    tce_table = load_tce_table()

    # Get validation split
    val_mask = tce_table['split'] == 'val'
    val_indices = np.where(val_mask)[0]
    val_tce_ids = tce_table['tce_id'][val_indices]
    view_tce_ids = views['tce_id']
    idx_map = {tid: i for i, tid in enumerate(view_tce_ids)}
    val_view_indices = [idx_map[tid] for tid in val_tce_ids]
    y_val = views['label'][val_view_indices]

    # Load validation predictions
    pred_data = load_predictions(model, "val")
    pred_map = dict(zip(pred_data['tce_id'], pred_data['y_prob']))
    y_prob = np.array([pred_map.get(tid, 0.5) for tid in val_tce_ids])

    # Find threshold maximizing F1 using numpy
    thresholds = np.linspace(0, 1, 101)
    best_f1 = -1
    best_threshold = 0.5

    for threshold in thresholds:
        y_pred = (y_prob >= threshold).astype(int)
        tp = int(np.sum((y_val == 1) & (y_pred == 1)))
        fp = int(np.sum((y_val == 0) & (y_pred == 1)))
        fn = int(np.sum((y_val == 1) & (y_pred == 0)))

        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

        if f1 > best_f1:
            best_f1 = f1
            best_threshold = float(threshold)

    return OptimalThresholdResponse(
        threshold=best_threshold,
        source="validation_f1",
        model_type=model,
    )


@app.post("/api/threshold", response_model=ThresholdResponse)
def update_threshold(update: ThresholdUpdate, split: str = Query("test", description="Split to evaluate on")):
    """
    Update threshold, return precision, recall, and confusion matrix live.
    Recolors the sphere (above threshold = amber).
    """
    if split not in ("train", "val", "test"):
        raise HTTPException(status_code=400, detail="split must be 'train', 'val', or 'test'")

    views = load_views()
    tce_table = load_tce_table()

    split_mask = tce_table['split'] == split
    split_indices = np.where(split_mask)[0]
    split_tce_ids = tce_table['tce_id'][split_indices]
    view_tce_ids = views['tce_id']
    idx_map = {tid: i for i, tid in enumerate(view_tce_ids)}
    view_indices = [idx_map[tid] for tid in split_tce_ids]
    y_true = views['label'][view_indices]

    # Load CNN predictions (primary model for threshold)
    pred_data = load_predictions("cnn", split)
    pred_map = dict(zip(pred_data['tce_id'], pred_data['y_prob']))
    y_prob = np.array([pred_map.get(tid, 0.5) for tid in split_tce_ids])

    threshold = update.threshold
    y_pred = (y_prob >= threshold).astype(int)

    # Compute confusion matrix
    tp = int(np.sum((y_true == 1) & (y_pred == 1)))
    fp = int(np.sum((y_true == 0) & (y_pred == 1)))
    tn = int(np.sum((y_true == 0) & (y_pred == 0)))
    fn = int(np.sum((y_true == 1) & (y_pred == 0)))

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

    return ThresholdResponse(
        threshold=threshold,
        precision=precision,
        recall=recall,
        f1=f1,
        confusion_matrix={"TP": tp, "FP": fp, "TN": tn, "FN": fn},
        n_samples=len(y_true),
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)