"""Configuration and constants for Exoplanet Finder."""

from pathlib import Path

# Repository root
ROOT = Path(__file__).resolve().parents[1]

# Data paths (gitignored)
DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
LIGHTCURVES_DIR = DATA_DIR / "lightcurves"
PROCESSED_DIR = DATA_DIR / "processed"

# Output paths
NOTEBOOKS_DIR = ROOT / "notebooks"
SRC_DIR = ROOT / "src"
RESULTS_DIR = ROOT / "results"
PLOTS_DIR = RESULTS_DIR / "plots"

# Ensure directories exist
for d in (RAW_DIR, LIGHTCURVES_DIR, PROCESSED_DIR, RESULTS_DIR, PLOTS_DIR):
    d.mkdir(parents=True, exist_ok=True)

# Reproducibility
SEED = 42

# TCE Table columns
TCE_COLUMNS = [
    "kepid", "tce_plnt_num", "tce_period", "tce_time0bk", "tce_duration",
    "tce_depth", "tce_model_snr", "tce_impact", "tce_prad", "tce_eqt",
    "tce_insol", "tce_steff", "tce_slogg", "tce_sradius", "av_training_set",
    "av_reliability", "av_flag",
]

# Label mapping: PC=1 (planet), AFP=0, NTP=0
LABEL_MAP = {
    "PC": 1,    # Planet Candidate
    "AFP": 0,   # Astrophysical False Positive
    "NTP": 0,   # Non-Transiting Phenomenon
}

# Valid training sets from DR24
VALID_TRAINING_SETS = ["PC", "AFP", "NTP"]

# Light curve fetching
LC_CADENCE = "long"
LC_QUARTERS = list(range(1, 18))  # Q1-Q17

# View extraction parameters
GLOBAL_VIEW_POINTS = 2001
GLOBAL_VIEW_MULTIPLIER = 2.5  # periods on each side of transit
LOCAL_VIEW_POINTS = 201
LOCAL_VIEW_MULTIPLIER = 4.0   # durations on each side of transit
FLATTEN_WINDOW = 401

# Aliases for views.py compatibility
GLOBAL_BINS = GLOBAL_VIEW_POINTS
LOCAL_BINS = LOCAL_VIEW_POINTS
LOCAL_WIDTH_DURATIONS = LOCAL_VIEW_MULTIPLIER

# CNN architecture
CNN_CHANNELS = [16, 32, 64]
CNN_KERNEL_SIZES = [5, 5, 5]
CNN_POOL_SIZES = [5, 2, 2]
FC_HIDDEN = [128, 64]
DROPOUT = 0.3


def set_seed(seed: int = SEED) -> None:
    """Seed random, numpy, and torch for reproducibility."""
    import random
    import numpy as np
    import torch

    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)

    # Deterministic flags
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False

    # For CUDA >= 10.2
    import os
    os.environ["CUBLAS_WORKSPACE_CONFIG"] = ":4096:8"
    torch.use_deterministic_algorithms(True, warn_only=True)