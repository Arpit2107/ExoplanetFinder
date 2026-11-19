#!/usr/bin/env python3
"""
Train Two-View 1D CNN on Kepler DR24 views.

Architecture:
- Global branch: 1x2001 -> 3 conv blocks (16->32->64, kernel 5, max-pool 5x2)
- Local branch:  1x201  -> 2 conv blocks (16->32, kernel 5, max-pool 7x2)
- Flatten both, concatenate, FC: 128 -> 64 -> 1 (dropout 0.3)

Loss: BCEWithLogitsLoss with pos_weight from train class ratio
Optimizer: Adam lr=1e-3, batch_size=64, max_epochs=50
Early stopping on validation AUC (patience=8), saving best checkpoint
Auto-select GPU/MPS/CPU
Optional augmentation: random horizontal flip of phase axis
Log train/val loss and val AUC per epoch to CSV + training curve plot
"""

import argparse
import csv
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from tqdm import tqdm
import matplotlib.pyplot as plt

from .config import PROCESSED_DIR, RESULTS_DIR, PLOTS_DIR, SEED, set_seed
from .model import TwoViewCNN
from .utils import log_metrics, compute_metrics


# ──────────────────────────────────────────────────────────────
# Dataset
# ──────────────────────────────────────────────────────────────

class ViewsDataset(Dataset):
    """Dataset reading from views.npz with optional augmentation."""

    def __init__(self, split: str, augment: bool = False):
        views = np.load(PROCESSED_DIR / "views.npz", allow_pickle=True)

        # Load split info from TCE table
        tce_df = pd.read_parquet(PROCESSED_DIR / "tce_labeled.parquet")
        if "split" not in tce_df.columns:
            from sklearn.model_selection import GroupShuffleSplit
            gss1 = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=SEED)
            train_idx, temp_idx = next(gss1.split(tce_df, groups=tce_df["kepid"]))
            temp_df = tce_df.iloc[temp_idx]
            gss2 = GroupShuffleSplit(n_splits=1, test_size=0.5, random_state=SEED)
            val_idx, test_idx = next(gss2.split(temp_df, groups=temp_df["kepid"]))
            tce_df.loc[train_idx, "split"] = "train"
            tce_df.loc[temp_df.index[val_idx], "split"] = "val"
            tce_df.loc[temp_df.index[test_idx], "split"] = "test"

        split_df = tce_df[tce_df["split"] == split].reset_index(drop=True)

        # Align views with split
        view_tce_ids = views["tce_id"]
        idx_map = {tid: i for i, tid in enumerate(view_tce_ids)}
        indices = [idx_map[tid] for tid in split_df["tce_id"]]

        self.global_views = views["global"][indices].astype(np.float32)
        self.local_views = views["local"][indices].astype(np.float32)
        self.labels = views["label"][indices].astype(np.float32)
        self.augment = augment

    def __len__(self):
        return len(self.labels)

    def __getitem__(self, idx):
        gv = self.global_views[idx]
        lv = self.local_views[idx]
        label = self.labels[idx]

        # Optional augmentation: random horizontal flip of phase axis
        # Physically valid since transits are roughly symmetric in phase
        if self.augment and np.random.rand() < 0.5:
            gv = gv[::-1].copy()
            lv = lv[::-1].copy()

        return gv, lv, label


# ──────────────────────────────────────────────────────────────
# Training
# ──────────────────────────────────────────────────────────────

def train_epoch(model, loader, criterion, optimizer, device):
    model.train()
    total_loss = 0
    for gv, lv, labels in loader:
        gv = gv.to(device).unsqueeze(1)  # (B, 1, 2001)
        lv = lv.to(device).unsqueeze(1)  # (B, 1, 201)
        labels = labels.to(device).unsqueeze(1)

        optimizer.zero_grad()
        logits = model(gv, lv)
        loss = criterion(logits, labels)
        loss.backward()
        optimizer.step()

        total_loss += loss.item() * gv.size(0)
    return total_loss / len(loader.dataset)


@torch.no_grad()
def validate(model, loader, criterion, device):
    model.eval()
    total_loss = 0
    all_probs = []
    all_labels = []

    for gv, lv, labels in loader:
        gv = gv.to(device).unsqueeze(1)
        lv = lv.to(device).unsqueeze(1)
        labels = labels.to(device).unsqueeze(1)

        logits = model(gv, lv)
        loss = criterion(logits, labels)
        total_loss += loss.item() * gv.size(0)

        probs = torch.sigmoid(logits).cpu().numpy()
        all_probs.append(probs)
        all_labels.append(labels.cpu().numpy())

    all_probs = np.concatenate(all_probs).flatten()
    all_labels = np.concatenate(all_labels).flatten()
    avg_loss = total_loss / len(loader.dataset)

    # AUC
    from sklearn.metrics import roc_auc_score
    auc = roc_auc_score(all_labels, all_probs)

    return avg_loss, auc, all_probs, all_labels


def main():
    parser = argparse.ArgumentParser(description="Train Two-View CNN")
    parser.add_argument("--run-name", type=str, default="cnn_run", help="Run name for logging")
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--patience", type=int, default=8)
    parser.add_argument("--augment", action="store_true", help="Enable horizontal flip augmentation")
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()

    set_seed(SEED)

    # Device
    device = torch.device("cuda" if torch.cuda.is_available() else
                          "mps" if torch.backends.mps.is_available() else "cpu")
    print(f"Using device: {device}")

    # Datasets
    train_ds = ViewsDataset("train", augment=args.augment)
    val_ds = ViewsDataset("val", augment=False)

    # Class ratio for pos_weight
    n_pos = train_ds.labels.sum()
    n_neg = len(train_ds) - n_pos
    pos_weight = torch.tensor([n_neg / max(1, n_pos)], dtype=torch.float32).to(device)
    print(f"Train: {len(train_ds)} samples, pos={n_pos:.0f}, neg={n_neg:.0f}, pos_weight={pos_weight.item():.2f}")

    # DataLoaders with seeded generator
    g = torch.Generator()
    g.manual_seed(SEED)
    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True,
                              num_workers=args.workers, generator=g, pin_memory=True)
    val_loader = DataLoader(val_ds, batch_size=args.batch_size, shuffle=False,
                            num_workers=args.workers, pin_memory=True)

    # Model
    model = TwoViewCNN().to(device)
    print(f"Model parameters: {sum(p.numel() for p in model.parameters() if p.requires_grad):,}")

    # Loss and optimizer
    criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
    optimizer = optim.Adam(model.parameters(), lr=args.lr)

    # Logging
    log_path = RESULTS_DIR / f"{args.run_name}_training.csv"
    fieldnames = ["epoch", "train_loss", "val_loss", "val_auc"]
    with open(log_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

    # Training loop
    best_auc = 0
    best_epoch = 0
    patience_counter = 0
    checkpoint_path = RESULTS_DIR / f"{args.run_name}_best.pt"

    history = {"train_loss": [], "val_loss": [], "val_auc": []}

    for epoch in range(1, args.epochs + 1):
        train_loss = train_epoch(model, train_loader, criterion, optimizer, device)
        val_loss, val_auc, val_probs, val_labels = validate(model, val_loader, criterion, device)

        history["train_loss"].append(train_loss)
        history["val_loss"].append(val_loss)
        history["val_auc"].append(val_auc)

        # Log to CSV
        with open(log_path, "a", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writerow({
                "epoch": epoch,
                "train_loss": f"{train_loss:.6f}",
                "val_loss": f"{val_loss:.6f}",
                "val_auc": f"{val_auc:.6f}",
            })

        print(f"Epoch {epoch:3d}/{args.epochs} | "
              f"train_loss={train_loss:.4f} | "
              f"val_loss={val_loss:.4f} | "
              f"val_auc={val_auc:.4f}")

        # Checkpoint
        if val_auc > best_auc:
            best_auc = val_auc
            best_epoch = epoch
            patience_counter = 0
            torch.save(model.state_dict(), checkpoint_path)
            print(f"  -> New best AUC: {best_auc:.4f}, saved to {checkpoint_path}")
        else:
            patience_counter += 1
            if patience_counter >= args.patience:
                print(f"Early stopping at epoch {epoch} (best epoch {best_epoch}, AUC={best_auc:.4f})")
                break

    # Plot training curves
    fig, axes = plt.subplots(1, 2, figsize=(10, 4))
    epochs = range(1, len(history["train_loss"]) + 1)

    axes[0].plot(epochs, history["train_loss"], label="Train")
    axes[0].plot(epochs, history["val_loss"], label="Val")
    axes[0].axvline(best_epoch, color='r', linestyle='--', alpha=0.5, label=f"Best (epoch {best_epoch})")
    axes[0].set_xlabel("Epoch")
    axes[0].set_ylabel("BCE Loss")
    axes[0].set_title("Training Loss")
    axes[0].legend()
    axes[0].grid(True, alpha=0.3)

    axes[1].plot(epochs, history["val_auc"], label="Val AUC", color='g')
    axes[1].axvline(best_epoch, color='r', linestyle='--', alpha=0.5)
    axes[1].set_xlabel("Epoch")
    axes[1].set_ylabel("AUC")
    axes[1].set_title("Validation AUC")
    axes[1].legend()
    axes[1].grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig(PLOTS_DIR / f"{args.run_name}_training_curves.png", dpi=150)
    plt.close()

    # Final validation metrics at best threshold
    model.load_state_dict(torch.load(checkpoint_path, map_location=device))
    _, _, val_probs, val_labels = validate(model, val_loader, criterion, device)

    from utils import get_best_threshold
    best_thresh = get_best_threshold(val_labels, val_probs)
    val_metrics, _ = compute_metrics(val_labels, val_probs, threshold=best_thresh)

    print(f"\nBest validation AUC: {best_auc:.4f} at epoch {best_epoch}")
    print(f"Best threshold (val F1): {best_thresh:.3f}")
    for k, v in val_metrics.items():
        print(f"  {k}: {v:.4f}" if isinstance(v, float) else f"  {k}: {v}")

    # Log final validation metrics
    log_metrics(args.run_name, {
        "model_type": "cnn",
        "split": "val",
        "best_epoch": best_epoch,
        "best_val_auc": best_auc,
        "best_threshold": best_thresh,
        **val_metrics,
    })

    print(f"\nTraining log: {log_path}")
    print(f"Best checkpoint: {checkpoint_path}")
    print(f"Training curves: {PLOTS_DIR / f'{args.run_name}_training_curves.png'}")


if __name__ == "__main__":
    main()