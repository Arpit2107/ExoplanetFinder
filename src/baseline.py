#!/usr/bin/env python3
"""
Gradient Boosting Baseline: HistGradientBoostingClassifier on (tce_period, tce_duration, depth).
Trains on train split, tunes on validation split, logs metrics.
"""

import argparse
import joblib
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score, average_precision_score, precision_score, recall_score

from .config import PROCESSED_DIR, RESULTS_DIR
from .utils import log_metrics, compute_metrics


def load_data():
    """Load views.npz and merge depth into TCE table."""
    # Load views
    views_path = PROCESSED_DIR / "views.npz"
    if not views_path.exists():
        raise FileNotFoundError(f"{views_path} not found. Run build_dataset.py first.")
    views = np.load(views_path, allow_pickle=True)

    # Load TCE table
    tce_path = PROCESSED_DIR / "tce_labeled.parquet"
    if not tce_path.exists():
        raise FileNotFoundError(f"{tce_path} not found. Run prepare_labels.py first.")
    tce_df = pd.read_parquet(tce_path)

    # Ensure split column exists
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

    # Merge depth from views into TCE table
    # views has tce_id array that matches tce_df's tce_id
    depth_df = pd.DataFrame({
        "tce_id": views["tce_id"],
        "depth": views["depth"],
    })
    tce_df = tce_df.merge(depth_df, on="tce_id", how="left")

    # Split into train/val/test
    train = tce_df[tce_df["split"] == "train"].reset_index(drop=True)
    val = tce_df[tce_df["split"] == "val"].reset_index(drop=True)
    test = tce_df[tce_df["split"] == "test"].reset_index(drop=True)

    # Features: period, duration, depth
    features = ["tce_period", "tce_duration", "depth"]

    # Check for NaN in features
    for split_name, split_df in [("train", train), ("val", val), ("test", test)]:
        nan_count = split_df[features].isna().sum().sum()
        if nan_count > 0:
            print(f"Warning: {split_name} has {nan_count} NaN values in features, dropping...")
            split_df = split_df.dropna(subset=features)

    X_train = train[features].values
    y_train = train["label"].values
    X_val = val[features].values
    y_val = val["label"].values
    X_test = test[features].values
    y_test = test["label"].values

    return X_train, y_train, X_val, y_val, X_test, y_test, train, val, test


def tune_hyperparams(X_train, y_train, X_val, y_val):
    """Tune learning_rate and max_depth on validation set."""
    best_auc = 0
    best_params = {"learning_rate": 0.1, "max_depth": 5}

    learning_rates = [0.05, 0.1, 0.2]
    max_depths = [3, 5, 7]

    for lr in learning_rates:
        for md in max_depths:
            clf = HistGradientBoostingClassifier(
                learning_rate=lr,
                max_depth=md,
                max_iter=300,
                early_stopping=True,
                validation_fraction=0.1,
                n_iter_no_change=10,
                random_state=42,
            )
            clf.fit(X_train, y_train)
            y_prob = clf.predict_proba(X_val)[:, 1]
            auc = roc_auc_score(y_val, y_prob)
            print(f"  lr={lr}, max_depth={md}: val AUC={auc:.4f}")
            if auc > best_auc:
                best_auc = auc
                best_params = {"learning_rate": lr, "max_depth": md}

    print(f"Best params: {best_params} (AUC={best_auc:.4f})")
    return best_params


def main():
    parser = argparse.ArgumentParser(description="Train GB baseline on period, duration, depth")
    parser.add_argument("--run-name", type=str, default="gb_baseline",
                        help="Run name for logging")
    args = parser.parse_args()

    # Load data
    X_train, y_train, X_val, y_val, X_test, y_test, train_df, val_df, test_df = load_data()
    print(f"Train: {len(X_train)}, Val: {len(X_val)}, Test: {len(X_test)}")

    # Tune hyperparameters on validation
    print("\nTuning hyperparameters...")
    best_params = tune_hyperparams(X_train, y_train, X_val, y_val)

    # Train final model on train with best params
    print("\nTraining final model...")
    clf = HistGradientBoostingClassifier(
        learning_rate=best_params["learning_rate"],
        max_depth=best_params["max_depth"],
        max_iter=500,
        early_stopping=True,
        validation_fraction=0.1,
        n_iter_no_change=15,
        random_state=42,
    )
    clf.fit(X_train, y_train)

    # Predict on validation
    y_val_prob = clf.predict_proba(X_val)[:, 1]
    y_val_pred = (y_val_prob >= 0.5).astype(int)

    # Metrics on validation
    val_metrics = compute_metrics(y_val, y_val_prob, y_val_pred)
    val_metrics["avg_precision"] = float(average_precision_score(y_val, y_val_prob))

    print("\nValidation Metrics:")
    for k, v in val_metrics.items():
        print(f"  {k}: {v:.4f}" if isinstance(v, float) else f"  {k}: {v}")

    # Save model
    model_path = RESULTS_DIR / f"{args.run_name}.joblib"
    joblib.dump(clf, model_path)
    print(f"\nModel saved to {model_path}")

    # Save validation predictions
    val_preds = pd.DataFrame({
        "tce_id": val_df["tce_id"].values,
        "y_true": y_val,
        "y_prob": y_val_prob,
        "y_pred": y_val_pred,
    })
    preds_path = RESULTS_DIR / f"{args.run_name}_val_preds.csv"
    val_preds.to_csv(preds_path, index=False)
    print(f"Validation predictions saved to {preds_path}")

    # Log metrics
    log_metrics(args.run_name, {
        **val_metrics,
        "split": "val",
        "model_type": "gb",
        "best_learning_rate": best_params["learning_rate"],
        "best_max_depth": best_params["max_depth"],
    })
    print(f"Metrics logged to results/metrics.csv")

    # Note: NOT evaluating on test set


if __name__ == "__main__":
    main()