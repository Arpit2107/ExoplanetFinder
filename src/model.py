#!/usr/bin/env python3
"""
Two-View 1D CNN for exoplanet classification.
Global branch: 1x2001 -> 3 conv blocks (16->32->64, kernel 5, max-pool 5x2)
Local branch:  1x201  -> 2 conv blocks (16->32, kernel 5, max-pool 7x2)
"""

import torch
import torch.nn as nn
import torch.nn.functional as F


class ConvBlock(nn.Module):
    """Conv1d -> BN -> ReLU -> MaxPool -> Dropout."""

    def __init__(self, in_ch: int, out_ch: int, kernel: int, pool_kernel: int, pool_stride: int, dropout: float):
        super().__init__()
        self.conv = nn.Conv1d(in_ch, out_ch, kernel, padding=kernel // 2)
        self.bn = nn.BatchNorm1d(out_ch)
        self.pool = nn.MaxPool1d(kernel_size=pool_kernel, stride=pool_stride)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x):
        x = self.conv(x)
        x = self.bn(x)
        x = F.relu(x)
        x = self.pool(x)
        x = self.dropout(x)
        return x


class GlobalBranch(nn.Module):
    """Global view branch: 1x2001 -> 3 conv blocks (16->32->64, kernel 5, pool 5x2)."""

    def __init__(self, dropout: float = 0.3):
        super().__init__()
        self.block1 = ConvBlock(1, 16, kernel=5, pool_kernel=5, pool_stride=2, dropout=dropout)  # 2001 -> 400
        self.block2 = ConvBlock(16, 32, kernel=5, pool_kernel=5, pool_stride=2, dropout=dropout)  # 400 -> 80
        self.block3 = ConvBlock(32, 64, kernel=5, pool_kernel=5, pool_stride=2, dropout=dropout)  # 80 -> 16

    def forward(self, x):
        x = self.block1(x)
        x = self.block2(x)
        x = self.block3(x)
        return x.flatten(1)  # (B, 64*16=1024)


class LocalBranch(nn.Module):
    """Local view branch: 1x201 -> 2 conv blocks (16->32, kernel 5, pool 7x2)."""

    def __init__(self, dropout: float = 0.3):
        super().__init__()
        self.block1 = ConvBlock(1, 16, kernel=5, pool_kernel=7, pool_stride=2, dropout=dropout)  # 201 -> 28
        self.block2 = ConvBlock(16, 32, kernel=5, pool_kernel=7, pool_stride=2, dropout=dropout)  # 28 -> 4

    def forward(self, x):
        x = self.block1(x)
        x = self.block2(x)
        return x.flatten(1)  # (B, 32*4=128)


class TwoViewCNN(nn.Module):
    """
    Two-view 1D CNN.
    Global: 1x2001, Local: 1x201
    """

    def __init__(self, dropout: float = 0.3):
        super().__init__()
        self.global_branch = GlobalBranch(dropout)
        self.local_branch = LocalBranch(dropout)

        # Fusion: 1024 + 128 = 1152 -> 128 -> 64 -> 1
        self.fusion = nn.Sequential(
            nn.Linear(1024 + 128, 128),
            nn.BatchNorm1d(128),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(128, 64),
            nn.BatchNorm1d(64),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(64, 1),
        )

    def forward(self, global_view: torch.Tensor, local_view: torch.Tensor) -> torch.Tensor:
        """
        Args:
            global_view: (B, 2001) or (B, 1, 2001)
            local_view:  (B, 201)  or (B, 1, 201)
        Returns:
            logits: (B, 1)
        """
        # Ensure channel dimension
        if global_view.dim() == 2:
            global_view = global_view.unsqueeze(1)  # (B, 1, 2001)
        if local_view.dim() == 2:
            local_view = local_view.unsqueeze(1)    # (B, 1, 201)

        g = self.global_branch(global_view)
        l = self.local_branch(local_view)

        x = torch.cat([g, l], dim=1)
        logits = self.fusion(x)
        return logits


def count_parameters(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters() if p.requires_grad)