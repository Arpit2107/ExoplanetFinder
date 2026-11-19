#!/usr/bin/env python3
"""
View generation: phase-folding, flattening, binning, and global/local view extraction.
"""

import numpy as np
import lightkurve as lk
from .config import GLOBAL_BINS, LOCAL_BINS, LOCAL_WIDTH_DURATIONS, FLATTEN_WINDOW


def binned_median(phase: np.ndarray, flux: np.ndarray,
                  lo: float, hi: float, n_bins: int) -> np.ndarray:
    """
    Fast binned median with no Python loop over bins.
    Uses searchsorted + add.reduceat for vectorized binning.

    Args:
        phase: 1D array of phases
        flux: 1D array of fluxes (same length as phase)
        lo: lower phase bound
        hi: upper phase bound
        n_bins: number of output bins

    Returns:
        1D array of length n_bins with median flux per bin.
        Empty bins filled by linear interpolation.
    """
    # Sort by phase
    sort_idx = np.argsort(phase)
    phase = phase[sort_idx]
    flux = flux[sort_idx]

    # Bin edges
    edges = np.linspace(lo, hi, n_bins + 1)

    # Find bin index for each point (right edge exclusive, last bin inclusive)
    bin_idx = np.searchsorted(edges, phase, side="right") - 1
    bin_idx = np.clip(bin_idx, 0, n_bins - 1)

    # Count per bin
    counts = np.bincount(bin_idx, minlength=n_bins)

    # Sum per bin (for median we need sorted values per bin, so use a different approach)
    # Use pandas groupby for median - it's fast and handles empty bins
    import pandas as pd
    df = pd.DataFrame({"bin": bin_idx, "flux": flux})
    medians = df.groupby("bin")["flux"].median().reindex(range(n_bins)).values

    # Fill empty bins by linear interpolation
    empty = counts == 0
    if empty.any() and not empty.all():
        valid_idx = np.where(~empty)[0]
        valid_vals = medians[~empty]
        # Interpolate at empty bin centers
        bin_centers = (edges[:-1] + edges[1:]) / 2
        medians[empty] = np.interp(bin_centers[empty], bin_centers[~empty], valid_vals)

    # If all empty (shouldn't happen), return ones
    if empty.all():
        return np.ones(n_bins, dtype=np.float32)

    return medians.astype(np.float32)


def make_views(time: np.ndarray, flux: np.ndarray,
               period: float, t0: float, duration_hr: float) -> dict:
    """
    Build global and local views for a single TCE.

    Args:
        time: 1D array of times (BKJD days)
        flux: 1D array of normalized fluxes
        period: orbital period in days
        t0: transit center time in BKJD days
        duration_hr: transit duration in hours

    Returns:
        dict with keys: global_view, local_view, depth
    """
    duration = duration_hr / 24.0  # convert to days

    # 1. Transit mask: width = 2x duration centered on t0
    phase = ((time - t0 + 0.5 * period) % period) - 0.5 * period
    transit_mask = np.abs(phase) < duration  # 2x duration window

    # 2. Flatten using lightkurve's flatten with the mask
    lc = lk.LightCurve(time=time, flux=flux)
    # lightkurve.flatten expects mask where True = in-transit (to be ignored)
    flat_lc = lc.flatten(window_length=FLATTEN_WINDOW, mask=transit_mask, return_trend=False)
    flat_flux = flat_lc.flux.value

    # 3. Recompute phase on flattened light curve (same time array)
    phase = ((time - t0 + 0.5 * period) % period) - 0.5 * period

    # 4. Global view: 2001 bins over one full period [-0.5*period, +0.5*period]
    # This is centered on the transit (phase 0 = transit center)
    global_view = binned_median(phase, flat_flux,
                                 lo=-0.5 * period, hi=0.5 * period,
                                 n_bins=GLOBAL_BINS)

    # 5. Local view: 201 bins over +/- 4 durations
    local_half_width = LOCAL_WIDTH_DURATIONS * duration
    local_view = binned_median(phase, flat_flux,
                                lo=-local_half_width, hi=local_half_width,
                                n_bins=LOCAL_BINS)

    # 6. Normalize each view: median=0, minimum=-1
    def normalize(view: np.ndarray) -> np.ndarray:
        med = np.median(view)
        view = view - med  # center at 0
        mn = np.min(view)
        if mn < 0:
            view = view / abs(mn)  # scale so minimum = -1
        return view

    global_view = normalize(global_view)
    local_view = normalize(local_view)

    # 7. Depth = 1 - median flux within +/- duration/2 of phase 0
    depth_mask = np.abs(phase) < (duration / 2)
    if depth_mask.any():
        depth = float(1.0 - np.median(flat_flux[depth_mask]))
    else:
        depth = 0.0

    return {
        "global_view": global_view,
        "local_view": local_view,
        "depth": depth,
    }