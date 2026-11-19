"""Data loading, light curve fetching, and view generation."""

import warnings
warnings.filterwarnings("ignore", category=UserWarning, module="lightkurve")

from pathlib import Path
from typing import Tuple, List, Optional, Dict
import numpy as np
import pandas as pd
from astropy.timeseries import BoxLeastSquares
from lightkurve import search_lightcurve
from tqdm import tqdm

from .config import (
    RAW_DIR, TCE_COLUMNS, LABEL_MAP, VALID_TRAINING_SETS,
    LC_CADENCE, LC_QUARTERS, GLOBAL_VIEW_POINTS, GLOBAL_VIEW_MULTIPLIER,
    LOCAL_VIEW_POINTS, LOCAL_VIEW_MULTIPLIER, SEED,
)
from .utils import set_seed, get_cache_key, load_cache, save_cache

set_seed(SEED)


# ──────────────────────────────────────────────────────────────
# TCE Table Loading
# ──────────────────────────────────────────────────────────────

def load_tce_table(path: Optional[Path] = None) -> pd.DataFrame:
    """
    Load DR24 TCE table, filter to valid training sets, create labels.
    Expected: 3,600 PC / 9,596 AFP / 2,541 NTP
    """
    if path is None:
        path = RAW_DIR / "dr24_tce.csv"
    if not path.exists():
        raise FileNotFoundError(
            f"TCE table not found at {path}. Download from NASA Exoplanet Archive "
            "(Q1-Q17 DR24 TCE table, CSV format)."
        )

    df = pd.read_csv(path, usecols=TCE_COLUMNS, low_memory=False)

    # Filter to valid training sets
    df = df[df["av_training_set"].isin(VALID_TRAINING_SETS)].copy()

    # Create binary label: PC=1, AFP/NTP=0
    df["label"] = df["av_training_set"].map(LABEL_MAP)

    # Create unique TCE identifier
    df["tce_id"] = df["kepid"].astype(str) + "-" + df["tce_plnt_num"].astype(str)

    # Verify expected counts (approximate)
    counts = df["av_training_set"].value_counts()
    print(f"TCE counts: PC={counts.get('PC', 0)}, AFP={counts.get('AFP', 0)}, NTP={counts.get('NTP', 0)}")
    print(f"Labels: planet=1: {(df['label']==1).sum()}, not-planet=0: {(df['label']==0).sum()}")

    return df.reset_index(drop=True)


# ──────────────────────────────────────────────────────────────
# Light Curve Fetching & Caching (RAW, per star)
# ──────────────────────────────────────────────────────────────

def fetch_raw_lightcurve(kepid: int) -> Optional[np.ndarray]:
    """
    Fetch and stitch ALL quarters for a star. Returns raw flux (not flattened).
    Shape: (n_time,) - concatenated quarters with NaN gaps preserved.
    Cached per kepid.
    """
    key = get_cache_key("raw_lc", kepid)
    cached = load_cache(key)
    if cached is not None:
        return cached

    try:
        lcs = search_lightcurve(f"KIC {kepid}", cadence=LC_CADENCE, quarter=LC_QUARTERS).download_all()
        if lcs is None or len(lcs) == 0:
            return None

        # Stitch quarters: normalize each, then concatenate
        fluxes = []
        for lc in lcs:
            # Remove NaNs, normalize by median
            clean = lc.remove_nans()
            if len(clean.flux) == 0:
                continue
            norm_flux = clean.flux / np.median(clean.flux)
            fluxes.append(norm_flux)

        if not fluxes:
            return None

        stitched = np.concatenate(fluxes)
        save_cache(key, stitched)
        return stitched

    except Exception as e:
        print(f"Failed to fetch KIC {kepid}: {e}")
        return None


def get_raw_lightcurves_for_tces(tce_df: pd.DataFrame) -> Dict[int, np.ndarray]:
    """Fetch raw light curves for all unique kepids in TCE dataframe."""
    unique_kepids = tce_df["kepid"].unique()
    print(f"Fetching raw light curves for {len(unique_kepids)} stars...")
    lc_dict = {}
    for kepid in tqdm(unique_kepids, desc="Stars"):
        lc = fetch_raw_lightcurve(int(kepid))
        if lc is not None:
            lc_dict[int(kepid)] = lc
    print(f"Successfully loaded {len(lc_dict)}/{len(unique_kepids)} stars")
    return lc_dict


# ──────────────────────────────────────────────────────────────
# Transit Masking & Flattening (per TCE)
# ──────────────────────────────────────────────────────────────

def mask_transits(time: np.ndarray, flux: np.ndarray,
                  period: float, t0: float, duration: float,
                  multiplier: float = 1.5) -> np.ndarray:
    """
    Create boolean mask: True = in-transit (to be masked out).
    period, t0 in DAYS; duration in HOURS.
    """
    dur_days = duration / 24.0
    half_window = multiplier * dur_days

    # Phase fold
    phase = ((time - t0 + 0.5 * period) % period) - 0.5 * period
    in_transit = np.abs(phase) < half_window
    return in_transit


def flatten_lightcurve(time: np.ndarray, flux: np.ndarray,
                       period: float, t0: float, duration: float,
                       window_length: float = 1.5) -> np.ndarray:
    """
    Flatten light curve using a median filter, masking transits first.
    window_length in DAYS.
    """
    # Mask transits
    transit_mask = mask_transits(time, flux, period, t0, duration, multiplier=1.5)
    out_of_transit = ~transit_mask

    if out_of_transit.sum() < 10:
        # Not enough out-of-transit points, return normalized flux
        return flux / np.median(flux)

    # Median filter on out-of-transit points
    from scipy.signal import medfilt

    # Create a copy for filtering
    flux_copy = flux.copy()
    # Only use out-of-transit for median estimation
    oot_flux = flux[out_of_transit]
    oot_time = time[out_of_transit]

    # Estimate continuum via sliding median
    # Use a simple approach: median filter on the full flux, but computed on OOT
    # For speed, we'll use a running median with scipy
    kernel_size = int(window_length * 48)  # ~48 cadences/day for long cadence
    kernel_size = max(3, kernel_size | 1)  # odd

    # Interpolate OOT median onto full time grid
    from scipy.interpolate import interp1d
    oot_median = medfilt(oot_flux, kernel_size=min(kernel_size, len(oot_flux) | 1))
    f = interp1d(oot_time, oot_median, bounds_error=False, fill_value="extrapolate")
    continuum = f(time)

    # Normalize
    flattened = flux / continuum
    return flattened


# ──────────────────────────────────────────────────────────────
# View Extraction (Global + Local)
# ──────────────────────────────────────────────────────────────

def extract_view(time: np.ndarray, flux: np.ndarray,
                 t0: float, period: float, duration: float,
                 n_points: int, view_multiplier: float) -> np.ndarray:
    """
    Extract a fixed-size view centered on transit.
    time: BKJD days, flux: normalized
    Returns: (n_points,) array
    """
    # Window half-width
    if n_points == GLOBAL_VIEW_POINTS:
        half_width = GLOBAL_VIEW_MULTIPLIER * period
    else:
        half_width = LOCAL_VIEW_MULTIPLIER * (duration / 24.0)

    t_min, t_max = t0 - half_width, t0 + half_width

    # Find indices in window
    mask = (time >= t_min) & (time <= t_max)
    window_time = time[mask]
    window_flux = flux[mask]

    if len(window_time) == 0:
        return np.zeros(n_points)

    # Interpolate to fixed grid
    target_time = np.linspace(t_min, t_max, n_points)
    from scipy.interpolate import interp1d
    f = interp1d(window_time, window_flux, bounds_error=False, fill_value=1.0)
    view = f(target_time)

    # Normalize: median=1, then subtract 1 to center at 0
    view = view / np.median(view) - 1.0
    return view.astype(np.float32)


def generate_views_for_tce(row: pd.Series, raw_flux: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """
    Generate global and local views for a single TCE.
    Returns: (global_view, local_view) each shape (n_points,)
    """
    kepid = int(row["kepid"])
    period = float(row["tce_period"])      # days
    t0 = float(row["tce_time0bk"])         # BKJD days
    duration = float(row["tce_duration"])  # hours

    # Create time array for raw flux (assuming uniform cadence ~29.4 min)
    # Long cadence = 29.4244 min = 0.020433 days
    cadence_days = 29.4244 / (60 * 24)
    n_raw = len(raw_flux)
    time = np.arange(n_raw) * cadence_days  # relative time, but t0 is absolute BKJD

    # We need to align time with t0. Since we don't have absolute time for stitched LC,
    # we approximate: find the quarter containing t0, or just use relative phasing.
    # Simpler approach: phase-fold the entire light curve and extract views from phased data.

    # Phase fold
    phase = ((time - t0 + 0.5 * period) % period) - 0.5 * period
    sort_idx = np.argsort(phase)
    phase_sorted = phase[sort_idx]
    flux_sorted = raw_flux[sort_idx]

    # For global view: ~2.5 periods on each side = 5 periods total
    # But we only have 1 period of phased data. So we tile it.
    # Global view: tile phased LC to cover 5 periods, centered on transit
    n_periods_global = int(GLOBAL_VIEW_MULTIPLIER * 2) + 1  # 5 or 6
    phase_tiled = np.tile(phase_sorted, n_periods_global)
    flux_tiled = np.tile(flux_sorted, n_periods_global)

    # Shift so transit is at center
    # Find index closest to phase=0 in tiled array
    center_idx = np.argmin(np.abs(phase_tiled))
    half_pts = GLOBAL_VIEW_POINTS // 2
    start = max(0, center_idx - half_pts)
    end = min(len(flux_tiled), start + GLOBAL_VIEW_POINTS)
    global_view = flux_tiled[start:end]
    if len(global_view) < GLOBAL_VIEW_POINTS:
        pad = GLOBAL_VIEW_POINTS - len(global_view)
        global_view = np.pad(global_view, (0, pad), mode="constant", constant_values=1.0)

    global_view = global_view / np.median(global_view) - 1.0

    # Local view: zoom in on transit
    # Use the original phased data (higher resolution near transit)
    dur_days = duration / 24.0
    local_half_width = LOCAL_VIEW_MULTIPLIER * dur_days
    mask_local = np.abs(phase_sorted) < local_half_width
    if mask_local.sum() > 10:
        local_phase = phase_sorted[mask_local]
        local_flux = flux_sorted[mask_local]
        target_phase = np.linspace(-local_half_width, local_half_width, LOCAL_VIEW_POINTS)
        from scipy.interpolate import interp1d
        f = interp1d(local_phase, local_flux, bounds_error=False, fill_value=1.0)
        local_view = f(target_phase)
    else:
        local_view = np.ones(LOCAL_VIEW_POINTS)

    local_view = local_view / np.median(local_view) - 1.0

    return global_view.astype(np.float32), local_view.astype(np.float32)


# ──────────────────────────────────────────────────────────────
# Full Dataset Preparation
# ──────────────────────────────────────────────────────────────

def prepare_dataset(tce_df: pd.DataFrame, lc_dict: Dict[int, np.ndarray],
                    max_samples: Optional[int] = None) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Generate (global_views, local_views, labels, tce_ids) arrays.
    Returns: (N, 2048), (N, 256), (N,), (N,) arrays
    """
    global_views = []
    local_views = []
    labels = []
    tce_ids = []

    rows = tce_df.sample(n=min(max_samples, len(tce_df)), random_state=SEED) if max_samples else tce_df

    for _, row in tqdm(rows.iterrows(), total=len(rows), desc="Generating views"):
        kepid = int(row["kepid"])
        if kepid not in lc_dict:
            continue

        raw_flux = lc_dict[kepid]
        gv, lv = generate_views_for_tce(row, raw_flux)

        global_views.append(gv)
        local_views.append(lv)
        labels.append(int(row["label"]))
        tce_ids.append(row["tce_id"])

    return (
        np.stack(global_views),
        np.stack(local_views),
        np.array(labels),
        np.array(tce_ids)
    )


def split_by_kepid(tce_df: pd.DataFrame) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """GroupShuffleSplit by kepid: 80/10/10 train/val/test."""
    from sklearn.model_selection import GroupShuffleSplit

    kepids = tce_df["kepid"].values

    # First split: 80% train, 20% temp
    gss1 = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=SEED)
    train_idx, temp_idx = next(gss1.split(tce_df, groups=kepids))

    # Second split: 50/50 of temp -> 10% val, 10% test
    temp_df = tce_df.iloc[temp_idx]
    temp_kepids = temp_df["kepid"].values
    gss2 = GroupShuffleSplit(n_splits=1, test_size=0.5, random_state=SEED)
    val_idx, test_idx = next(gss2.split(temp_df, groups=temp_kepids))

    train_df = tce_df.iloc[train_idx].reset_index(drop=True)
    val_df = temp_df.iloc[val_idx].reset_index(drop=True)
    test_df = temp_df.iloc[test_idx].reset_index(drop=True)

    print(f"Split sizes: train={len(train_df)}, val={len(val_df)}, test={len(test_df)}")
    print(f"Unique kepids: train={train_df['kepid'].nunique()}, val={val_df['kepid'].nunique()}, test={test_df['kepid'].nunique()}")
    print(f"Planet ratio: train={(train_df['label']==1).mean():.3f}, val={(val_df['label']==1).mean():.3f}, test={(test_df['label']==1).mean():.3f}")

    return train_df, val_df, test_df