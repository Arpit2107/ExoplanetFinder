"""Models: Two-view 1D CNN and Gradient Boosting baseline."""

import torch
import torch.nn as nn
import torch.nn.functional as F
import lightgbm as lgb
import numpy as np
from typing import Tuple, Optional

from .config import (
    GLOBAL_VIEW_POINTS, LOCAL_VIEW_POINTS,
    CNN_CHANNELS, CNN_KERNEL_SIZES, CNN_POOL_SIZES,
    FC_HIDDEN, DROPOUT,
)


# ──────────────────────────────────────────────────────────────
# Two-View 1D CNN
# ──────────────────────────────────────────────────────────────

class ConvBlock(nn.Module):
    """Conv1d + BatchNorm + ReLU + MaxPool + Dropout."""

    def __init__(self, in_ch: int, out_ch: int, kernel: int, pool: int, dropout: float):
        super().__init__()
        self.conv = nn.Conv1d(in_ch, out_ch, kernel, padding=kernel // 2)
        self.bn = nn.BatchNorm1d(out_ch)
        self.pool = nn.MaxPool1d(pool)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x):
        x = self.conv(x)
        x = self.bn(x)
        x = F.relu(x)
        x = self.pool(x)
        x = self.dropout(x)
        return x


class TwoViewCNN(nn.Module):
    """
    Two-view 1D CNN for exoplanet classification.
    Global view: 2048 points (wide context)
    Local view: 256 points (transit detail)
    """

    def __init__(
        self,
        global_points: int = GLOBAL_VIEW_POINTS,
        local_points: int = LOCAL_VIEW_POINTS,
        channels: list = None,
        kernels: list = None,
        pools: list = None,
        fc_hidden: int = FC_HIDDEN,
        dropout: float = DROPOUT,
    ):
        super().__init__()

        channels = channels or CNN_CHANNELS
        kernels = kernels or CNN_KERNEL_SIZES
        pools = pools or CNN_POOL_SIZES

        # Global view encoder
        self.global_encoder = self._make_encoder(1, channels, kernels, pools, dropout)

        # Local view encoder (shared architecture, separate weights)
        self.local_encoder = self._make_encoder(1, channels, kernels, pools, dropout)

        # Compute flattened size after conv layers
        # Each pool halves the size; 4 pools -> /16
        global_flat = channels[-1] * (global_points // (2 ** len(pools)))
        local_flat = channels[-1] * (local_points // (2 ** len(pools)))

        # Fusion + classification head
        self.fusion = nn.Sequential(
            nn.Linear(global_flat + local_flat, fc_hidden),
            nn.BatchNorm1d(fc_hidden),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(fc_hidden, fc_hidden // 2),
            nn.BatchNorm1d(fc_hidden // 2),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(fc_hidden // 2, 1),
        )

    def _make_encoder(self, in_ch, channels, kernels, pools, dropout):
        layers = []
        c_in = in_ch
        for c_out, k, p in zip(channels, kernels, pools):
            layers.append(ConvBlock(c_in, c_out, k, p, dropout))
            c_in = c_out
        return nn.Sequential(*layers)

    def forward(self, global_view: torch.Tensor, local_view: torch.Tensor) -> torch.Tensor:
        """
        Args:
            global_view: (B, 2048) or (B, 1, 2048)
            local_view:  (B, 256)  or (B, 1, 256)
        Returns:
            logits: (B, 1)
        """
        # Ensure channel dimension
        if global_view.dim() == 2:
            global_view = global_view.unsqueeze(1)  # (B, 1, 2048)
        if local_view.dim() == 2:
            local_view = local_view.unsqueeze(1)    # (B, 1, 256)

        # Encode both views
        g = self.global_encoder(global_view)  # (B, C, L)
        l = self.local_encoder(local_view)    # (B, C, L)

        # Flatten
        g = g.flatten(1)
        l = l.flatten(1)

        # Concatenate and classify
        x = torch.cat([g, l], dim=1)
        logits = self.fusion(x)
        return logits


# ──────────────────────────────────────────────────────────────
# Gradient Boosting Baseline
# ──────────────────────────────────────────────────────────────

class GradientBoostingBaseline:
    """
    LightGBM baseline using engineered features from TCE table + light curve stats.
    Features: TCE params + global/local view statistics.
    """

    def __init__(self, params: dict = None):
        from config import GB_PARAMS
        self.params = params or GB_PARAMS
        self.model = None

    def _extract_features(self, global_views: np.ndarray, local_views: np.ndarray,
                          tce_df: pd.DataFrame) -> np.ndarray:
        """Engineer features from views and TCE metadata."""
        feats = []

        # TCE table features
        tce_cols = ["tce_period", "tce_duration", "tce_depth", "tce_model_snr",
                    "tce_impact", "tce_prad", "tce_eqt", "tce_insol",
                    "tce_steff", "tce_slogg", "tce_sradius"]
        X_tce = tce_df[tce_cols].values
        feats.append(X_tce)

        # Global view statistics
        gv_stats = np.column_stack([
            global_views.mean(axis=1),
            global_views.std(axis=1),
            global_views.min(axis=1),
            global_views.max(axis=1),
            np.percentile(global_views, 5, axis=1),
            np.percentile(global_views, 95, axis=1),
            # Transit depth proxy: min flux in center region
            global_views[:, 900:1148].min(axis=1),  # center ~248 points
        ])
        feats.append(gv_stats)

        # Local view statistics
        lv_stats = np.column_stack([
            local_views.mean(axis=1),
            local_views.std(axis=1),
            local_views.min(axis=1),
            local_views.max(axis=1),
            np.percentile(local_views, 5, axis=1),
            np.percentile(local_views, 95, axis=1),
            # Transit shape: depth, width proxy
            local_views.min(axis=1),
            (local_views < -0.5).sum(axis=1),  # points below -0.5
        ])
        feats.append(lv_stats)

        return np.hstack(feats).astype(np.float32)

    def fit(self, global_views: np.ndarray, local_views: np.ndarray,
            tce_df: pd.DataFrame, labels: np.ndarray,
            val_views: Tuple = None) -> "GradientBoostingBaseline":
        X = self._extract_features(global_views, local_views, tce_df)

        if val_views is not None:
            val_gv, val_lv, val_df, val_labels = val_views
            X_val = self._extract_features(val_gv, val_lv, val_df)
            train_data = lgb.Dataset(X, label=labels)
            val_data = lgb.Dataset(X_val, label=val_labels, reference=train_data)
            self.model = lgb.train(
                self.params, train_data,
                valid_sets=[val_data],
                num_boost_round=2000,
                callbacks=[lgb.early_stopping(50), lgb.log_evaluation(50)],
            )
        else:
            train_data = lgb.Dataset(X, label=labels)
            self.model = lgb.train(self.params, train_data, num_boost_round=500)

        return self

    def predict_proba(self, global_views: np.ndarray, local_views: np.ndarray,
                      tce_df: pd.DataFrame) -> np.ndarray:
        X = self._extract_features(global_views, local_views, tce_df)
        return self.model.predict(X, num_iteration=self.model.best_iteration)

    def predict(self, global_views: np.ndarray, local_views: np.ndarray,
                tce_df: pd.DataFrame, threshold: float = 0.5) -> np.ndarray:
        return (self.predict_proba(global_views, local_views, tce_df) >= threshold).astype(int)


# ──────────────────────────────────────────────────────────────
# Model Factory
# ──────────────────────────────────────────────────────────────

def create_cnn(device: str = "cpu") -> TwoViewCNN:
    """Create CNN model and move to device."""
    model = TwoViewCNN()
    return model.to(device)


def count_parameters(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters() if p.requires_grad)