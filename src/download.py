#!/usr/bin/env python3
"""
Download Kepler long-cadence light curves for unique kepids from tce_labeled.parquet.

Saves raw stitched light curves to data/lightcurves/{kepid}.npz (time, flux, flux_err as float32).
Resumable: skips already-cached stars. Records failures to data/processed/download_failures.csv.
"""

import argparse
import os
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
from tqdm import tqdm

# Set lightkurve download directory BEFORE importing lightkurve
os.environ["LIGHTKURVE_CACHE_DIR"] = str(Path(__file__).resolve().parents[1] / "data" / "lightkurve_cache")

from lightkurve import search_lightcurve

# Project paths
ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
LIGHTCURVES_DIR = DATA_DIR / "lightcurves"
PROCESSED_DIR = DATA_DIR / "processed"

LIGHTCURVES_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

FAILURES_CSV = PROCESSED_DIR / "download_failures.csv"
LABELED_PARQUET = PROCESSED_DIR / "tce_labeled.parquet"


def load_kepids_stratified(limit: int | None = None) -> list[int]:
    """Load unique kepids from tce_labeled.parquet, stratified across splits."""
    if not LABELED_PARQUET.exists():
        raise FileNotFoundError(f"{LABELED_PARQUET} not found. Run prepare_labels.py first.")

    df = pd.read_parquet(LABELED_PARQUET)

    # Ensure we have a split column; if not, create one via GroupShuffleSplit
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

    # Get unique kepids per split
    kepids_by_split = {
        "train": df[df["split"] == "train"]["kepid"].unique(),
        "val": df[df["split"] == "val"]["kepid"].unique(),
        "test": df[df["split"] == "test"]["kepid"].unique(),
    }

    if limit is None:
        # Return all kepids
        all_kepids = np.concatenate(list(kepids_by_split.values()))
        return sorted(all_kepids.tolist())

    # Stratified sampling: proportional to split sizes
    total_unique = sum(len(v) for v in kepids_by_split.values())
    sampled = []
    for split_name, kepids in kepids_by_split.items():
        n_split = max(1, int(limit * len(kepids) / total_unique))
        n_split = min(n_split, len(kepids))
        sampled.extend(np.random.choice(kepids, size=n_split, replace=False))

    return sorted(sampled[:limit])


def download_star(kepid: int, max_retries: int = 3, retry_sleep: float = 5.0) -> tuple[np.ndarray, np.ndarray, np.ndarray] | None:
    """
    Download and stitch all quarters for a kepid.
    Returns (time, flux, flux_err) as float32 arrays, or None on failure.
    """
    for attempt in range(max_retries):
        try:
            # Search and download all quarters
            search = search_lightcurve(f"KIC {kepid}", mission="Kepler", cadence="long")
            if len(search) == 0:
                return None

            lc_collection = search.download_all(download_dir=os.environ["LIGHTKURVE_CACHE_DIR"])
            if lc_collection is None or len(lc_collection) == 0:
                return None

            # Stitch quarters: normalize each, then concatenate
            times, fluxes, flux_errs = [], [], []
            for lc in lc_collection:
                lc_clean = lc.remove_nans()
                if len(lc_clean.time) == 0:
                    continue
                # Normalize flux by median
                median_flux = np.median(lc_clean.flux)
                norm_flux = (lc_clean.flux / median_flux).astype(np.float32)
                norm_err = (lc_clean.flux_err / median_flux).astype(np.float32)
                times.append(lc_clean.time.value.astype(np.float32))
                fluxes.append(norm_flux)
                flux_errs.append(norm_err)

            if not times:
                return None

            time_arr = np.concatenate(times)
            flux_arr = np.concatenate(fluxes)
            err_arr = np.concatenate(flux_errs)

            # Sort by time (just in case)
            sort_idx = np.argsort(time_arr)
            return time_arr[sort_idx], flux_arr[sort_idx], err_arr[sort_idx]

        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(retry_sleep)
            else:
                raise e
    return None


def record_failure(kepid: int, error: str) -> None:
    """Append a failure record to the failures CSV."""
    row = pd.DataFrame([{
        "kepid": kepid,
        "error": error,
        "timestamp": pd.Timestamp.now().isoformat()
    }])
    if FAILURES_CSV.exists():
        row.to_csv(FAILURES_CSV, mode="a", header=False, index=False)
    else:
        row.to_csv(FAILURES_CSV, index=False)


def main():
    parser = argparse.ArgumentParser(description="Download Kepler light curves for TCE stars")
    parser.add_argument("--limit", type=int, default=None,
                        help="Limit to first N stars (stratified across splits)")
    parser.add_argument("--retries", type=int, default=3, help="Max retries per star")
    parser.add_argument("--retry-sleep", type=float, default=5.0, help="Sleep between retries (seconds)")
    args = parser.parse_args()

    # Load kepids
    kepids = load_kepids_stratified(args.limit)
    print(f"Processing {len(kepids)} unique kepids...")

    # Track stats
    succeeded = 0
    failed = 0
    skipped = 0
    total_bytes = 0

    # Progress bar
    for kepid in tqdm(kepids, desc="Downloading", unit="star"):
        out_path = LIGHTCURVES_DIR / f"{kepid}.npz"

        # Skip if already cached
        if out_path.exists():
            skipped += 1
            total_bytes += out_path.stat().st_size
            continue

        try:
            result = download_star(kepid, max_retries=args.retries, retry_sleep=args.retry_sleep)
            if result is None:
                record_failure(kepid, "No light curves found")
                failed += 1
                continue

            time_arr, flux_arr, err_arr = result

            # Save as compressed npz
            np.savez_compressed(out_path, time=time_arr, flux=flux_arr, flux_err=err_arr)
            total_bytes += out_path.stat().st_size
            succeeded += 1

        except Exception as e:
            record_failure(kepid, str(e))
            failed += 1

    # Summary
    print("\n" + "=" * 50)
    print(f"Stars succeeded: {succeeded}")
    print(f"Stars skipped (cached): {skipped}")
    print(f"Stars failed: {failed}")
    print(f"Total stars processed: {len(kepids)}")
    print(f"Disk used: {total_bytes / 1e9:.2f} GB")
    print(f"Failures logged to: {FAILURES_CSV}")


if __name__ == "__main__":
    main()