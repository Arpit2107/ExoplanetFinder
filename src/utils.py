"""Utilities: logging metrics to CSV."""

import csv
from datetime import datetime
from pathlib import Path
from .config import RESULTS_DIR

METRICS_CSV = RESULTS_DIR / "metrics.csv"


def log_metrics(run_name: str, metrics_dict: dict) -> None:
    """
    Append a row (timestamp, run_name, metrics...) to results/metrics.csv.

    Args:
        run_name: identifier for this run (e.g., "cnn_baseline", "gb_baseline")
        metrics_dict: dictionary of metric names to values
    """
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    row = {
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "run_name": run_name,
        **metrics_dict,
    }

    # Get all possible fieldnames (existing + new)
    fieldnames = ["timestamp", "run_name"]
    if METRICS_CSV.exists():
        with open(METRICS_CSV, "r", newline="") as f:
            reader = csv.DictReader(f)
            existing_fields = reader.fieldnames or []
            fieldnames = list(dict.fromkeys(fieldnames + existing_fields))

    # Add any new fields from metrics_dict
    for k in metrics_dict:
        if k not in fieldnames:
            fieldnames.append(k)

    # Write row
    write_header = not METRICS_CSV.exists()
    with open(METRICS_CSV, "a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if write_header:
            writer.writeheader()
        writer.writerow(row)


def compute_metrics(y_true, y_prob, y_pred=None, threshold=0.5):
    """Compute AUC, precision, recall, F1 for planet class (label=1)."""
    from sklearn.metrics import roc_auc_score, precision_score, recall_score, f1_score

    if y_pred is None:
        y_pred = (y_prob >= threshold).astype(int)

    return {
        "auc": float(roc_auc_score(y_true, y_prob)),
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "f1": float(f1_score(y_true, y_pred, zero_division=0)),
        "n_samples": int(len(y_true)),
        "n_positive": int(y_true.sum()),
    }


def print_metrics(metrics: dict, prefix: str = "") -> None:
    """Pretty print metrics."""
    print(f"{prefix}AUC:      {metrics['auc']:.4f}")
    print(f"{prefix}Precision: {metrics['precision']:.4f}")
    print(f"{prefix}Recall:    {metrics['recall']:.4f}")
    print(f"{prefix}F1:        {metrics['f1']:.4f}")
    print(f"{prefix}N:         {metrics['n_samples']} (pos={metrics['n_positive']})")