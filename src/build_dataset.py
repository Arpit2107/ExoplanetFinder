#!/usr/bin/env python3
"""
Build dataset: loop over every TCE whose star is cached, build views,
save data/processed/views.npz with arrays global, local, depth, kepid, tce_id, label, split.
"""

import argparse
from pathlib import Path
import numpy as np
import pandas as pd
from tqdm import tqdm
from multiprocessing import Pool, cpu_count
import traceback

from .config import PROCESSED_DIR, LIGHTCURVES_DIR
from .views import make_views


def process_tce(args):
    """Process a single TCE row - for multiprocessing."""
    idx, row = args
    kepid = int(row["kepid"])
    tce_id = row.get("tce_id", f"{kepid}-{row['tce_plnt_num']}")
    lc_path = LIGHTCURVES_DIR / f"{kepid}.npz"

    if not lc_path.exists():
        return None, f"Light curve not found: {lc_path}"

    try:
        lc_data = np.load(lc_path)
        time = lc_data["time"]
        flux = lc_data["flux"]

        views = make_views(
            time=time,
            flux=flux,
            period=float(row["tce_period"]),
            t0=float(row["tce_time0bk"]),
            duration_hr=float(row["tce_duration"]),
        )

        return {
            "idx": idx,
            "global_view": views["global_view"],
            "local_view": views["local_view"],
            "depth": views["depth"],
            "kepid": kepid,
            "tce_id": tce_id,
            "label": int(row["label"]),
            "split": row.get("split", "train"),
        }, None

    except Exception as e:
        return None, f"{tce_id}: {e}"


def main():
    parser = argparse.ArgumentParser(description="Build views dataset from TCEs and cached light curves")
    parser.add_argument("--workers", type=int, default=cpu_count(),
                        help="Number of worker processes (default: all CPUs)")
    parser.add_argument("--limit", type=int, default=None,
                        help="Limit to first N TCEs (for testing)")
    args = parser.parse_args()

    # Load labeled TCEs
    labeled_path = PROCESSED_DIR / "tce_labeled.parquet"
    if not labeled_path.exists():
        raise FileNotFoundError(f"{labeled_path} not found. Run prepare_labels.py first.")

    df = pd.read_parquet(labeled_path)

    # Ensure split column exists
    if "split" not in df.columns:
        from sklearn.model_selection import GroupShuffleSplit
        gss1 = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=42)
        train_idx, temp_idx = next(gss1.split(df, groups=df["kepid"]))
        temp_df = df.iloc[temp_idx]
        gss2 = GroupShuffleSplit(n_splits=1, test_size=0.5, random_state=42)
        val_idx, test_idx = next(gss2.split(temp_df, groups=temp_df["kepid"]))
        df.loc[train_idx, "split"] = "train"
        df.loc[temp_df.index[val_idx], "split"] = "val"
        df.loc[temp_df.index[test_idx], "split"] = "test"

    if args.limit:
        df = df.head(args.limit)

    print(f"Processing {len(df)} TCEs with {args.workers} workers...")

    # Process in parallel
    results = []
    failures = []

    with Pool(args.workers) as pool:
        for result, error in tqdm(pool.imap_unordered(process_tce, df.iterrows()),
                                   total=len(df), desc="Building views"):
            if error:
                failures.append(error)
            else:
                results.append(result)

    # Sort results by original index to maintain order
    results.sort(key=lambda x: x["idx"])

    # Stack arrays
    N = len(results)
    global_views = np.stack([r["global_view"] for r in results])
    local_views = np.stack([r["local_view"] for r in results])
    depths = np.array([r["depth"] for r in results], dtype=np.float32)
    kepids = np.array([r["kepid"] for r in results], dtype=np.int32)
    tce_ids = np.array([r["tce_id"] for r in results], dtype=object)
    labels = np.array([r["label"] for r in results], dtype=np.int8)
    splits = np.array([r["split"] for r in results], dtype=object)

    # Save
    out_path = PROCESSED_DIR / "views.npz"
    np.savez_compressed(out_path,
                        **{"global": global_views, "local": local_views,
                           "depth": depths, "kepid": kepids,
                           "tce_id": tce_ids, "label": labels, "split": splits})

    print(f"\nSaved {N} TCEs to {out_path}")
    print(f"  global: {global_views.shape}")
    print(f"  local:  {local_views.shape}")
    print(f"  depth:  {depths.shape}")
    print(f"  kepid:  {kepids.shape}")
    print(f"  label:  {labels.shape} (planet={labels.sum()}, not-planet={(labels==0).sum()})")

    if failures:
        fail_path = PROCESSED_DIR / "view_failures.csv"
        pd.DataFrame({"error": failures}).to_csv(fail_path, index=False)
        print(f"Failures ({len(failures)}): logged to {fail_path}")


if __name__ == "__main__":
    main()