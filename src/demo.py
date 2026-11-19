#!/usr/bin/env python3
"""
Demo script with two features:
1) compare_plot(): confident planet vs confident eclipsing binary (test set)
2) kepler90_demo(): download Kepler-90, run model on known planets
"""

import joblib
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import torch
import torch.nn.functional as F
from pathlib import Path

from .config import PROCESSED_DIR, RESULTS_DIR, PLOTS_DIR, LIGHTCURVES_DIR
from .model import TwoViewCNN
from .views import make_views


# ──────────────────────────────────────────────────────────────
# 1) compare_plot: confident planet vs confident EB
# ──────────────────────────────────────────────────────────────

def compare_plot(cnn_path: Path = None):
    """Plot confident true planet vs confident eclipsing binary from test set."""
    device = torch.device("cuda" if torch.cuda.is_available() else
                          "mps" if torch.backends.mps.is_available() else "cpu")

    # Load test data
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

    test_df = tce_df[tce_df["split"] == "test"].reset_index(drop=True)

    # Align views
    test_tce_ids = test_df["tce_id"].values
    view_tce_ids = views["tce_id"]
    idx_map = {tid: i for i, tid in enumerate(view_tce_ids)}
    test_indices = [idx_map[tid] for tid in test_tce_ids]

    test_labels = views["label"][test_indices]
    test_global = views["global"][test_indices]
    test_local = views["local"][test_indices]

    # Load CNN
    cnn_path = cnn_path or (RESULTS_DIR / "cnn_best.pt")
    cnn = TwoViewCNN().to(device)
    cnn.load_state_dict(torch.load(cnn_path, map_location=device))
    cnn.eval()

    # Get predictions for all test TCEs
    with torch.no_grad():
        gv = torch.from_numpy(test_global).float().to(device).unsqueeze(1)
        lv = torch.from_numpy(test_local).float().to(device).unsqueeze(1)
        logits = cnn(gv, lv)
        probs = torch.sigmoid(logits).cpu().numpy().flatten()

    # Confident true planet: label=1, prob > 0.9
    planet_mask = (test_labels == 1) & (probs > 0.9)
    planet_indices = np.where(planet_mask)[0]
    if len(planet_indices) == 0:
        planet_indices = np.where(test_labels == 1)[0]
    planet_idx = planet_indices[np.argmax(probs[planet_indices])]

    # Confident eclipsing binary: label=0, prob > 0.9 (false positive)
    eb_mask = (test_labels == 0) & (probs > 0.9)
    eb_indices = np.where(eb_mask)[0]
    if len(eb_indices) == 0:
        # Fallback: highest prob among label=0
        eb_indices = np.where(test_labels == 0)[0]
    eb_idx = eb_indices[np.argmax(probs[eb_indices])]

    print(f"Selected planet: idx={planet_idx}, prob={probs[planet_idx]:.4f}, tce_id={test_tce_ids[planet_idx]}")
    print(f"Selected EB:     idx={eb_idx}, prob={probs[eb_idx]:.4f}, tce_id={test_tce_ids[eb_idx]}")

    # Plot 2x2
    fig, axes = plt.subplots(2, 2, figsize=(12, 10))

    # Planet global
    axes[0, 0].plot(test_global[planet_idx], 'k-', linewidth=0.5)
    axes[0, 0].axvline(len(test_global[planet_idx]) // 2, color='r', linestyle='--', alpha=0.5)
    axes[0, 0].set_title(f"Planet (PC) | Global View\nkepid={test_df.iloc[planet_idx]['kepid']} | prob={probs[planet_idx]:.3f}")
    axes[0, 0].set_ylabel("Normalized Flux")
    axes[0, 0].set_ylim(-1.5, 0.5)
    axes[0, 0].grid(True, alpha=0.3)

    # Planet local
    axes[0, 1].plot(test_local[planet_idx], 'b-', linewidth=0.8)
    axes[0, 1].axvline(len(test_local[planet_idx]) // 2, color='r', linestyle='--', alpha=0.5)
    axes[0, 1].set_title(f"Planet (PC) | Local View\n{test_tce_ids[planet_idx]} | prob={probs[planet_idx]:.3f}")
    axes[0, 1].set_ylabel("Normalized Flux")
    axes[0, 1].set_ylim(-1.5, 0.5)
    axes[0, 1].grid(True, alpha=0.3)

    # EB global
    axes[1, 0].plot(test_global[eb_idx], 'k-', linewidth=0.5)
    axes[1, 0].axvline(len(test_global[eb_idx]) // 2, color='r', linestyle='--', alpha=0.5)
    axes[1, 0].set_title(f"Eclipsing Binary (AFP/NTP) | Global View\nkepid={test_df.iloc[eb_idx]['kepid']} | prob={probs[eb_idx]:.3f}")
    axes[1, 0].set_xlabel("Phase Bin")
    axes[1, 0].set_ylabel("Normalized Flux")
    axes[1, 0].set_ylim(-1.5, 0.5)
    axes[1, 0].grid(True, alpha=0.3)

    # EB local
    axes[1, 1].plot(test_local[eb_idx], 'r-', linewidth=0.8)
    axes[1, 1].axvline(len(test_local[eb_idx]) // 2, color='r', linestyle='--', alpha=0.5)
    axes[1, 1].set_title(f"Eclipsing Binary (AFP/NTP) | Local View\n{test_tce_ids[eb_idx]} | prob={probs[eb_idx]:.3f}")
    axes[1, 1].set_xlabel("Phase Bin")
    axes[1, 1].set_ylabel("Normalized Flux")
    axes[1, 1].set_ylim(-1.5, 0.5)
    axes[1, 1].grid(True, alpha=0.3)

    plt.tight_layout()
    out_path = PLOTS_DIR / "planet_vs_eb.png"
    plt.savefig(out_path, dpi=150)
    plt.close()
    print(f"Saved comparison plot to {out_path}")


# ──────────────────────────────────────────────────────────────
# 2) kepler90_demo: download Kepler-90, run on known planets
# ──────────────────────────────────────────────────────────────

# Kepler-90 known planets (from NASA Exoplanet Archive / DR24)
# Period in days, t0 in BKJD, duration in hours
KEPLER90_PLANETS = [
    {"name": "Kepler-90b", "period": 7.008151, "t0_bkjd": 132.7196, "duration_hr": 2.78},
    {"name": "Kepler-90c", "period": 8.719375, "t0_bkjd": 135.8528, "duration_hr": 3.02},
    {"name": "Kepler-90d", "period": 59.73667, "t0_bkjd": 153.7295, "duration_hr": 5.38},
    {"name": "Kepler-90e", "period": 91.93913, "t0_bkjd": 155.8773, "duration_hr": 6.54},
    {"name": "Kepler-90f", "period": 124.9144, "t0_bkjd": 154.8426, "duration_hr": 7.72},
    {"name": "Kepler-90g", "period": 210.60697, "t0_bkjd": 186.2038, "duration_hr": 9.88},
    {"name": "Kepler-90h", "period": 331.60059, "t0_bkjd": 207.5582, "duration_hr": 10.94},
    {"name": "Kepler-90i", "period": 14.44912, "t0_bkjd": 139.7787, "duration_hr": 3.45},
]

KEPLER90_KEPID = 11442793


def download_kepler90_lc():
    """Download and stitch Kepler-90 light curve."""
    import os
    os.environ["LIGHTKURVE_CACHE_DIR"] = str(Path(__file__).resolve().parents[1] / "data" / "lightkurve_cache")
    from lightkurve import search_lightcurve

    search = search_lightcurve(f"KIC {KEPLER90_KEPID}", mission="Kepler", cadence="long")
    lc_collection = search.download_all(download_dir=os.environ["LIGHTKURVE_CACHE_DIR"])

    times, fluxes = [], []
    for lc in lc_collection:
        lc_clean = lc.remove_nans()
        if len(lc_clean.time) == 0:
            continue
        median_flux = np.median(lc_clean.flux)
        norm_flux = (lc_clean.flux / median_flux).astype(np.float32)
        times.append(lc_clean.time.value.astype(np.float32))
        fluxes.append(norm_flux)

    time = np.concatenate(times)
    flux = np.concatenate(fluxes)
    sort_idx = np.argsort(time)
    return time[sort_idx], flux[sort_idx]


def kepler90_demo(cnn_path: Path = None):
    """Download Kepler-90, build views for known planets, run CNN."""
    device = torch.device("cuda" if torch.cuda.is_available() else
                          "mps" if torch.backends.mps.is_available() else "cpu")

    # Download light curve
    print(f"Downloading Kepler-90 (KIC {KEPLER90_KEPID})...")
    time, flux = download_kepler90_lc()
    print(f"Light curve: {len(time)} points")

    # Load CNN
    cnn_path = cnn_path or (RESULTS_DIR / "cnn_best.pt")
    cnn = TwoViewCNN().to(device)
    cnn.load_state_dict(torch.load(cnn_path, map_location=device))
    cnn.eval()

    # Build views for each planet and predict
    results = []
    all_global_views = []
    all_local_views = []

    for planet in KEPLER90_PLANETS:
        views = make_views(time, flux, planet["period"], planet["t0_bkjd"], planet["duration_hr"])
        all_global_views.append(views["global_view"])
        all_local_views.append(views["local_view"])

        # Predict
        with torch.no_grad():
            gv = torch.from_numpy(views["global_view"]).float().to(device).unsqueeze(0).unsqueeze(0)
            lv = torch.from_numpy(views["local_view"]).float().to(device).unsqueeze(0).unsqueeze(0)
            logits = cnn(gv, lv)
            prob = torch.sigmoid(logits).item()

        results.append({
            "name": planet["name"],
            "period": planet["period"],
            "t0_bkjd": planet["t0_bkjd"],
            "duration_hr": planet["duration_hr"],
            "depth": views["depth"],
            "probability": prob,
        })

    # Print table
    df = pd.DataFrame(results)
    print("\n" + "=" * 80)
    print("KEPLER-90 PLANET PROBABILITIES (CNN)")
    print("=" * 80)
    print(df[["name", "period", "duration_hr", "depth", "probability"]].to_string(index=False, float_format="%.4f"))
    print("\n⚠️  NOTE: These probabilities are an illustration on a single star.")
    print("     They are NOT evidence of model accuracy. Kepler-90 was excluded from training.")
    print("=" * 80)

    # Plot all views in a grid
    n = len(results)
    fig, axes = plt.subplots(n, 2, figsize=(12, 2.5 * n), squeeze=False)
    for i, (planet, gv, lv) in enumerate(zip(results, all_global_views, all_local_views)):
        axes[i, 0].plot(gv, 'k-', linewidth=0.5)
        axes[i, 0].axvline(len(gv) // 2, color='r', linestyle='--', alpha=0.5)
        axes[i, 0].set_title(f"{planet['name']} | Global | P={planet['probability']:.3f}")
        axes[i, 0].set_ylim(-1.5, 0.5)
        axes[i, 0].grid(True, alpha=0.3)

        axes[i, 1].plot(lv, 'b-', linewidth=0.8)
        axes[i, 1].axvline(len(lv) // 2, color='r', linestyle='--', alpha=0.5)
        axes[i, 1].set_title(f"{planet['name']} | Local | depth={planet['depth']:.4f}")
        axes[i, 1].set_ylim(-1.5, 0.5)
        axes[i, 1].grid(True, alpha=0.3)

    plt.tight_layout()
    out_path = PLOTS_DIR / "kepler90_demo.png"
    plt.savefig(out_path, dpi=150)
    plt.close()
    print(f"\nSaved Kepler-90 demo plot to {out_path}")

    return df


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Demo: compare_plot or kepler90_demo")
    parser.add_argument("mode", choices=["compare", "kepler90", "both"],
                        help="Which demo to run")
    parser.add_argument("--checkpoint", type=str, default=None,
                        help="Path to CNN checkpoint")
    args = parser.parse_args()

    cnn_path = Path(args.checkpoint) if args.checkpoint else None

    if args.mode in ("compare", "both"):
        print("\n=== Running compare_plot ===")
        compare_plot(cnn_path)

    if args.mode in ("kepler90", "both"):
        print("\n=== Running kepler90_demo ===")
        kepler90_demo(cnn_path)


if __name__ == "__main__":
    main()