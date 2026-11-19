#!/usr/bin/env python3
"""
Evaluate CNN and baseline on test set. Produces metrics, plots, and error analysis.
"""

import argparse
import json
import joblib
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import torch
import torch.nn.functional as F
from pathlib import Path
from sklearn.metrics import (
    roc_auc_score, average_precision_score, precision_score, recall_score,
    f1_score, precision_recall_curve, roc_curve
)

from .config import PROCESSED_DIR, RESULTS_DIR, PLOTS_DIR
from .model import TwoViewCNN
from .utils import log_metrics, compute_metrics


def load_data():
    """Load views and TCE table, split by split column."""
    views = np.load(PROCESSED_DIR / "views.npz", allow_pickle=True)
    tce_df = pd.read_parquet(PROCESSED_DIR / "tce_labeled.parquet")

    # Ensure split column
    if "split" not in tce_df.columns:
        from sklearn.model_selection import GroupShuffleSplit
        gss1 = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=42)
        train_idx, temp_idx = next(gss1.split(tce_df, groups=tce_df["kepid"]))
        temp_df = tce_df.iloc[temp_idx]
        gss2 = GroupShuffleSplit(n_splits=1, test_size=0.5, random_state=42)
        val_idx, test_idx = next(gss2.split(temp_df, groups=temp_df["kepid"]))
        tce_df.loc[train_idx, "split"] = "train"
        tce_df.loc[temp_df.index[val_idx], "split"] = "val"
        tce_df.loc[temp_df.index[test_idx], "split"] = "test"

    # Merge depth
    depth_df = pd.DataFrame({"tce_id": views["tce_id"], "depth": views["depth"]})
    tce_df = tce_df.merge(depth_df, on="tce_id", how="left")

    # Test split
    test_df = tce_df[tce_df["split"] == "test"].reset_index(drop=True)

    # Align views with test_df
    test_tce_ids = test_df["tce_id"].values
    view_tce_ids = views["tce_id"]
    idx_map = {tid: i for i, tid in enumerate(view_tce_ids)}
    test_indices = [idx_map[tid] for tid in test_tce_ids]

    return {
        "global": views["global"][test_indices],
        "local": views["local"][test_indices],
        "depth": views["depth"][test_indices],
        "kepid": views["kepid"][test_indices],
        "tce_id": views["tce_id"][test_indices],
        "label": views["label"][test_indices],
    }, test_df


def get_best_threshold(y_true, y_prob):
    """Find threshold that maximizes F1 on validation."""
    precisions, recalls, thresholds = precision_recall_curve(y_true, y_prob)
    f1s = 2 * precisions * recalls / (precisions + recalls + 1e-10)
    best_idx = np.argmax(f1s)
    return thresholds[best_idx] if best_idx < len(thresholds) else 0.5


def evaluate_model(y_true, y_prob, threshold):
    """Compute all metrics at given threshold."""
    y_pred = (y_prob >= threshold).astype(int)
    metrics = compute_metrics(y_true, y_prob, y_pred)
    metrics["avg_precision"] = float(average_precision_score(y_true, y_prob))
    metrics["threshold"] = float(threshold)
    return metrics, y_pred


def plot_curves(cnn_prob, baseline_prob, y_true, out_path):
    """Plot PR and ROC curves for CNN and baseline overlaid."""
    fig, axes = plt.subplots(1, 2, figsize=(12, 5))

    # PR Curve
    for name, prob in [("CNN", cnn_prob), ("Baseline", baseline_prob)]:
        prec, rec, _ = precision_recall_curve(y_true, prob)
        ap = average_precision_score(y_true, prob)
        axes[0].plot(rec, prec, label=f"{name} (AP={ap:.3f})")
    axes[0].set_xlabel("Recall")
    axes[0].set_ylabel("Precision")
    axes[0].set_title("Precision-Recall Curve (Test)")
    axes[0].legend()
    axes[0].grid(True, alpha=0.3)

    # ROC Curve
    for name, prob in [("CNN", cnn_prob), ("Baseline", baseline_prob)]:
        fpr, tpr, _ = roc_curve(y_true, prob)
        auc = roc_auc_score(y_true, prob)
        axes[1].plot(fpr, tpr, label=f"{name} (AUC={auc:.3f})")
    axes[1].plot([0, 1], [0, 1], "k--", alpha=0.3)
    axes[1].set_xlabel("False Positive Rate")
    axes[1].set_ylabel("True Positive Rate")
    axes[1].set_title("ROC Curve (Test)")
    axes[1].legend()
    axes[1].grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig(out_path, dpi=150)
    plt.close()


def plot_error_views(global_views, local_views, errors_df, out_path, max_plots=20):
    """Plot grid of local+global views for error cases."""
    n = min(len(errors_df), max_plots)
    if n == 0:
        return

    fig, axes = plt.subplots(n, 2, figsize=(10, 2.5 * n), squeeze=False)
    for i, (_, row) in enumerate(errors_df.iterrows()):
        gv = global_views[row["view_idx"]]
        lv = local_views[row["view_idx"]]

        # Global view
        axes[i, 0].plot(gv, 'k-', linewidth=0.5)
        axes[i, 0].axvline(len(gv) // 2, color='r', linestyle='--', alpha=0.5)
        axes[i, 0].set_title(f"Global | kepid={row['kepid']} | label={row['label']} | prob={row['prob']:.3f}")
        axes[i, 0].set_ylim(-1.5, 0.5)

        # Local view
        axes[i, 1].plot(lv, 'b-', linewidth=0.8)
        axes[i, 1].axvline(len(lv) // 2, color='r', linestyle='--', alpha=0.5)
        axes[i, 1].set_title(f"Local | {row['tce_id']} | {row['error_type']}")
        axes[i, 1].set_ylim(-1.5, 0.5)

    plt.tight_layout()
    plt.savefig(out_path, dpi=150)
    plt.close()


def secondary_eclipse_depth(global_view):
    """Depth at phase +/-0.5 (secondary eclipse position for circular orbits)."""
    n = len(global_view)
    center = n // 2
    half = n // 2
    # Phase 0.5 is halfway around the orbit = index center + half/2
    sec_idx1 = (center + half // 2) % n
    sec_idx2 = (center - half // 2) % n
    window = 10
    sec_depth1 = 1 - np.median(global_view[max(0, sec_idx1-window):min(n, sec_idx1+window)])
    sec_depth2 = 1 - np.median(global_view[max(0, sec_idx2-window):min(n, sec_idx2+window)])
    return max(sec_depth1, sec_depth2)


def main():
    parser = argparse.ArgumentParser(description="Evaluate CNN and baseline on test set")
    parser.add_argument("--cnn-checkpoint", type=str, default=None,
                        help="Path to CNN checkpoint (default: results/cnn_best.pt)")
    parser.add_argument("--baseline-model", type=str, default=None,
                        help="Path to baseline model (default: results/gb_baseline.joblib)")
    parser.add_argument("--run-name", type=str, default="cnn_test_eval")
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else
                          "mps" if torch.backends.mps.is_available() else "cpu")
    print(f"Using device: {device}")

    # Load data
    test_data, test_df = load_data()
    y_true = test_data["label"]

    # Load CNN
    cnn_path = args.cnn_checkpoint or (RESULTS_DIR / "cnn_best.pt")
    cnn = TwoViewCNN().to(device)
    cnn.load_state_dict(torch.load(cnn_path, map_location=device))
    cnn.eval()

    # CNN predictions
    with torch.no_grad():
        gv = torch.from_numpy(test_data["global"]).float().to(device).unsqueeze(1)
        lv = torch.from_numpy(test_data["local"]).float().to(device).unsqueeze(1)
        logits = cnn(gv, lv)
        cnn_prob = torch.sigmoid(logits).cpu().numpy().flatten()

    # Load baseline
    gb_path = args.baseline_model or (RESULTS_DIR / "gb_baseline.joblib")
    gb = joblib.load(gb_path)

    # Baseline predictions (needs TCE features)
    X_test = test_df[["tce_period", "tce_duration", "depth"]].values
    gb_prob = gb.predict_proba(X_test)[:, 1]

    # Find best threshold on VALIDATION for each model
    # Load validation data to compute threshold
    val_views = np.load(PROCESSED_DIR / "views.npz", allow_pickle=True)
    val_df = pd.read_parquet(PROCESSED_DIR / "tce_labeled.parquet")
    if "split" not in val_df.columns:
        from sklearn.model_selection import GroupShuffleSplit
        gss1 = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=42)
        train_idx, temp_idx = next(gss1.split(val_df, groups=val_df["kepid"]))
        temp_df = val_df.iloc[temp_idx]
        gss2 = GroupShuffleSplit(n_splits=1, test_size=0.5, random_state=42)
        val_idx, test_idx = next(gss2.split(temp_df, groups=temp_df["kepid"]))
        val_df.loc[train_idx, "split"] = "train"
        val_df.loc[temp_df.index[val_idx], "split"] = "val"
        val_df.loc[temp_df.index[test_idx], "split"] = "test"

    val_df = val_df[val_df["split"] == "val"]
    depth_df = pd.DataFrame({"tce_id": val_views["tce_id"], "depth": val_views["depth"]})
    val_df = val_df.merge(depth_df, on="tce_id", how="left")

    # CNN val prob
    val_idx_map = {tid: i for i, tid in enumerate(val_views["tce_id"])}
    val_indices = [val_idx_map[tid] for tid in val_df["tce_id"]]
    with torch.no_grad():
        gv_val = torch.from_numpy(val_views["global"][val_indices]).float().to(device).unsqueeze(1)
        lv_val = torch.from_numpy(val_views["local"][val_indices]).float().to(device).unsqueeze(1)
        val_logits = cnn(gv_val, lv_val)
        cnn_val_prob = torch.sigmoid(val_logits).cpu().numpy().flatten()

    # Baseline val prob
    X_val = val_df[["tce_period", "tce_duration", "depth"]].values
    gb_val_prob = gb.predict_proba(X_val)[:, 1]
    y_val = val_df["label"].values

    # Best thresholds from validation
    cnn_thresh = get_best_threshold(y_val, cnn_val_prob)
    gb_thresh = get_best_threshold(y_val, gb_val_prob)

    print(f"CNN best threshold (val F1): {cnn_thresh:.3f}")
    print(f"GB best threshold (val F1): {gb_thresh:.3f}")

    # Evaluate on test
    cnn_metrics, cnn_pred = evaluate_model(y_true, cnn_prob, cnn_thresh)
    gb_metrics, gb_pred = evaluate_model(y_true, gb_prob, gb_thresh)

    print("\n=== CNN Test Metrics ===")
    for k, v in cnn_metrics.items():
        print(f"  {k}: {v:.4f}" if isinstance(v, float) else f"  {k}: {v}")

    print("\n=== Baseline Test Metrics ===")
    for k, v in gb_metrics.items():
        print(f"  {k}: {v:.4f}" if isinstance(v, float) else f"  {k}: {v}")

    # Plot curves
    plot_curves(cnn_prob, gb_prob, y_true, PLOTS_DIR / "test_pr_roc.png")

    # Error analysis
    # False positives: label=0, predicted=1 with high prob
    fp_mask = (y_true == 0) & (cnn_pred == 1)
    fp_indices = np.where(fp_mask)[0]
    fp_probs = cnn_prob[fp_indices]
    top_fp_idx = fp_indices[np.argsort(-fp_probs)[:20]]

    # False negatives: label=1, predicted=0
    fn_mask = (y_true == 1) & (cnn_pred == 0)
    fn_indices = np.where(fn_mask)[0]
    fn_probs = cnn_prob[fn_indices]
    top_fn_idx = fn_indices[np.argsort(fn_probs)[:20]]  # lowest prob first

    # Build error tables
    fp_rows = []
    for idx in top_fp_idx:
        fp_rows.append({
            "kepid": test_data["kepid"][idx],
            "tce_id": test_data["tce_id"][idx],
            "label": int(test_data["label"][idx]),
            "prob": float(cnn_prob[idx]),
            "error_type": "FP",
            "view_idx": idx,
        })
    fn_rows = []
    for idx in top_fn_idx:
        fn_rows.append({
            "kepid": test_data["kepid"][idx],
            "tce_id": test_data["tce_id"][idx],
            "label": int(test_data["label"][idx]),
            "prob": float(cnn_prob[idx]),
            "error_type": "FN",
            "view_idx": idx,
        })

    fp_df = pd.DataFrame(fp_rows)
    fn_df = pd.DataFrame(fn_rows)

    # Save error tables
    fp_df.to_csv(RESULTS_DIR / "test_false_positives.csv", index=False)
    fn_df.to_csv(RESULTS_DIR / "test_false_negatives.csv", index=False)

    # Plot error views
    plot_error_views(test_data["global"], test_data["local"],
                     pd.concat([fp_df, fn_df]), PLOTS_DIR / "test_error_views.png")

    # Secondary eclipse analysis
    sec_depths = np.array([secondary_eclipse_depth(test_data["global"][i])
                           for i in range(len(test_data["global"]))])

    fig, axes = plt.subplots(1, 2, figsize=(10, 4))
    for label_val, label_name in [(0, "Not-Planet"), (1, "Planet")]:
        mask = y_true == label_val
        axes[0].scatter(sec_depths[mask], cnn_prob[mask], alpha=0.5, s=10, label=label_name)
    axes[0].set_xlabel("Secondary Eclipse Depth (phase ±0.5)")
    axes[0].set_ylabel("CNN Probability")
    axes[0].set_title("Model Probability vs Secondary Eclipse Depth")
    axes[0].legend()
    axes[0].grid(True, alpha=0.3)

    # Zoomed in on FPs
    axes[1].scatter(sec_depths[y_true==0], cnn_prob[y_true==0], alpha=0.3, s=10, label="True Neg")
    axes[1].scatter(sec_depths[fp_mask], cnn_prob[fp_mask], alpha=0.8, s=30, c='red', label="False Pos")
    axes[1].set_xlabel("Secondary Eclipse Depth")
    axes[1].set_ylabel("CNN Probability")
    axes[1].set_title("False Positives Highlighted")
    axes[1].legend()
    axes[1].grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig(PLOTS_DIR / "test_secondary_eclipse.png", dpi=150)
    plt.close()

    # Flag confident-wrong cases (likely label errors)
    # FP with prob > 0.9, FN with prob < 0.1
    confident_fp = fp_df[fp_df["prob"] > 0.9]
    confident_fn = fn_df[fn_df["prob"] < 0.1]

    print(f"\nConfident false positives (prob > 0.9): {len(confident_fp)}")
    print(f"Confident false negatives (prob < 0.1): {len(confident_fn)}")

    # Save flagged cases
    flagged = pd.concat([
        confident_fp.assign(flag="confident_fp"),
        confident_fn.assign(flag="confident_fn")
    ])
    flagged.to_csv(RESULTS_DIR / "test_flagged_label_errors.csv", index=False)

    # Log metrics
    log_metrics(args.run_name, {
        "model_type": "cnn",
        "split": "test",
        **cnn_metrics,
    })
    log_metrics(args.run_name + "_baseline", {
        "model_type": "gb",
        "split": "test",
        **gb_metrics,
    })

    # Write test summary markdown
    summary = f"""# Test Set Evaluation Summary

## CNN Metrics (threshold={cnn_thresh:.3f} from val F1)
- AUC: {cnn_metrics['auc']:.4f}
- Average Precision: {cnn_metrics['avg_precision']:.4f}
- Precision: {cnn_metrics['precision']:.4f}
- Recall: {cnn_metrics['recall']:.4f}
- F1: {cnn_metrics['f1']:.4f}
- N samples: {cnn_metrics['n_samples']}
- N positive: {cnn_metrics['n_positive']}

## Baseline Metrics (threshold={gb_thresh:.3f} from val F1)
- AUC: {gb_metrics['auc']:.4f}
- Average Precision: {gb_metrics['avg_precision']:.4f}
- Precision: {gb_metrics['precision']:.4f}
- Recall: {gb_metrics['recall']:.4f}
- F1: {gb_metrics['f1']:.4f}

## Error Analysis
- False Positives: {len(fp_indices)} total, top 20 saved
- False Negatives: {len(fn_indices)} total, top 20 saved
- Confident FPs (prob>0.9, likely label errors): {len(confident_fp)}
- Confident FNs (prob<0.1, likely label errors): {len(confident_fn)}

## Plots Generated
- `results/plots/test_pr_roc.png` - PR and ROC curves (CNN + baseline)
- `results/plots/test_error_views.png` - Local/global views of top errors
- `results/plots/test_secondary_eclipse.png` - Probability vs secondary eclipse depth
"""
    (RESULTS_DIR / "test_summary.md").write_text(summary)
    print(f"\nSummary written to {RESULTS_DIR / 'test_summary.md'}")


if __name__ == "__main__":
    main()