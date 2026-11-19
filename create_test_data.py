#!/usr/bin/env python3
"""Create test data files in dashboard/data for the backend."""

import numpy as np
import os

# Create dashboard/data directory
data_dir = "dashboard/data"
os.makedirs(data_dir, exist_ok=True)

# Set random seed for reproducibility
np.random.seed(42)

# 1. Create metrics.npz - contains metrics for cnn and gb models on train/val/test splits
n_metrics = 20
metrics_data = {
    'run_name': np.array([f'run_{i}' for i in range(n_metrics)], dtype=object),
    'model_type': np.array(['cnn', 'gb'] * (n_metrics // 2), dtype=object),
    'split': np.array(['train', 'val', 'test'] * (n_metrics // 3) + ['train', 'test'], dtype=object)[:n_metrics],
    'auc': np.random.uniform(0.8, 0.99, n_metrics),
    'avg_precision': np.random.uniform(0.7, 0.95, n_metrics),
    'precision': np.random.uniform(0.7, 0.95, n_metrics),
    'recall': np.random.uniform(0.7, 0.95, n_metrics),
    'f1': np.random.uniform(0.7, 0.95, n_metrics),
    'n_samples': np.random.randint(1000, 5000, n_metrics),
    'n_positive': np.random.randint(100, 1000, n_metrics),
    'threshold': np.random.uniform(0.3, 0.7, n_metrics),
    'timestamp': np.array([f'2024-01-{i:02d}T12:00:00' for i in range(1, n_metrics+1)], dtype=object),
}
np.savez(os.path.join(data_dir, 'metrics.npz'), **metrics_data)
print("Created metrics.npz")

# 2. Create tce_table.npz - TCE summary table
n_tces = 5000
tce_ids = np.array([f'TCE_{i:06d}' for i in range(n_tces)], dtype=object)
kepids = np.random.randint(1000000, 9999999, n_tces)
# Assign splits: 60% train, 20% val, 20% test
splits = np.random.choice(['train', 'val', 'test'], n_tces, p=[0.6, 0.2, 0.2])
labels = np.random.choice([0, 1], n_tces, p=[0.7, 0.3])
av_training_sets = np.array(['AFP' if l == 0 and np.random.rand() < 0.5 else 'NTP' if l == 0 else 'PC' for l in labels], dtype=object)

tce_table_data = {
    'tce_id': tce_ids,
    'kepid': kepids,
    'ra': np.random.uniform(0, 360, n_tces),
    'dec': np.random.uniform(-90, 90, n_tces),
    'tce_period': np.random.uniform(0.5, 500, n_tces),
    'tce_duration': np.random.uniform(0.5, 20, n_tces),
    'tce_time0bk': np.random.uniform(0, 1500, n_tces),
    'depth': np.random.uniform(0.0001, 0.05, n_tces),
    'label': labels,
    'av_training_set': av_training_sets,
    'split': splits,
}
np.savez(os.path.join(data_dir, 'tce_table.npz'), **tce_table_data)
print("Created tce_table.npz")

# 3. Create views.npz - global and local view light curves
n_views = 2001
n_local = 201
views_data = {
    'tce_id': tce_ids,
    'global': np.random.randn(n_tces, n_views).astype(np.float32) * 0.001 + 1.0,
    'local': np.random.randn(n_tces, n_local).astype(np.float32) * 0.001 + 1.0,
    'label': labels,
}
np.savez(os.path.join(data_dir, 'views.npz'), **views_data)
print("Created views.npz")

# 4. Create prediction files for CNN and GB on each split
for model in ['cnn', 'gb']:
    for split in ['train', 'val', 'test']:
        split_mask = (splits == split)
        split_tce_ids = tce_ids[split_mask]
        split_labels = labels[split_mask]
        n_split = len(split_tce_ids)

        if model == 'cnn':
            probs = np.where(split_labels == 1,
                            np.random.beta(3, 1, n_split),
                            np.random.beta(1, 3, n_split))
        else:
            probs = np.where(split_labels == 1,
                            np.random.beta(2, 1, n_split),
                            np.random.beta(1, 2, n_split))

        preds = (probs > 0.5).astype(int)

        pred_data = {
            'tce_id': split_tce_ids,
            'y_prob': probs,
            'y_pred': preds,
        }
        np.savez(os.path.join(data_dir, f'{model}_{split}_preds.npz'), **pred_data)
        print(f"Created {model}_{split}_preds.npz")

# 5. Create error analysis files
cnn_test_data = np.load(os.path.join(data_dir, 'cnn_test_preds.npz'), allow_pickle=True)
cnn_test_probs = dict(zip(cnn_test_data['tce_id'], cnn_test_data['y_prob']))

test_mask = (splits == 'test') & (labels == 0)
test_tce_ids = tce_ids[test_mask]
test_kepids = kepids[test_mask]
test_probs = np.array([cnn_test_probs.get(tid, 0.5) for tid in test_tce_ids])

fp_indices = np.argsort(test_probs)[-50:]
fp_data = {
    'tce_id': test_tce_ids[fp_indices],
    'kepid': test_kepids[fp_indices],
    'label': np.zeros(50, dtype=int),
    'prob': test_probs[fp_indices],
}
np.savez(os.path.join(data_dir, 'test_false_positives.npz'), **fp_data)
print("Created test_false_positives.npz")

fn_mask = (splits == 'test') & (labels == 1)
fn_tce_ids = tce_ids[fn_mask]
fn_kepids = kepids[fn_mask]
fn_probs = np.array([cnn_test_probs.get(tid, 0.5) for tid in fn_tce_ids])

fn_indices = np.argsort(fn_probs)[:50]
fn_data = {
    'tce_id': fn_tce_ids[fn_indices],
    'kepid': fn_kepids[fn_indices],
    'label': np.ones(50, dtype=int),
    'prob': fn_probs[fn_indices],
}
np.savez(os.path.join(data_dir, 'test_false_negatives.npz'), **fn_data)
print("Created test_false_negatives.npz")

flagged_data = {
    'tce_id': np.concatenate([test_tce_ids[fp_indices[:10]], fn_tce_ids[fn_indices[:10]]]),
    'kepid': np.concatenate([test_kepids[fp_indices[:10]], fn_kepids[fn_indices[:10]]]),
    'label': np.concatenate([np.zeros(10, dtype=int), np.ones(10, dtype=int)]),
    'prob': np.concatenate([test_probs[fp_indices[:10]], fn_probs[fn_indices[:10]]]),
}
np.savez(os.path.join(data_dir, 'test_flagged_label_errors.npz'), **flagged_data)
print("Created test_flagged_label_errors.npz")

# 6. Create kepler90_demo.npz
kepler90_data = {
    'name': np.array([f'Kepler-90{chr(98+i)}' for i in range(8)], dtype=object),
    'period': np.array([7.008151, 8.719375, 59.73667, 91.93913, 124.9144, 210.60697, 331.60059, 14.44912]),
    't0_bkjd': np.array([132.7196, 135.8528, 153.7295, 155.8773, 154.8426, 186.2038, 207.5582, 139.7787]),
    'duration_hr': np.array([2.78, 3.02, 5.38, 6.54, 7.72, 9.88, 10.94, 3.45]),
    'depth': np.array([0.0001, 0.0002, 0.0003, 0.0004, 0.0005, 0.0006, 0.0007, 0.00015]),
    'probability': np.array([0.95, 0.93, 0.89, 0.85, 0.82, 0.78, 0.75, 0.91]),
}
np.savez(os.path.join(data_dir, 'kepler90_demo.npz'), **kepler90_data)
print("Created kepler90_demo.npz")

# 7. Create plots list
plots_dir = "dashboard/backend/plots"
os.makedirs(plots_dir, exist_ok=True)
for plot_name in ['pr_curve_cnn_test.png', 'roc_curve_cnn_test.png', 'pr_curve_gb_test.png', 'roc_curve_gb_test.png',
                   'confusion_matrix_cnn_test.png', 'confusion_matrix_gb_test.png', 'score_distribution_cnn_test.png',
                   'score_distribution_gb_test.png', 'kepler90_predictions.png']:
    open(os.path.join(plots_dir, plot_name), 'w').close()
print("Created plot files")

print("\nAll data files created successfully!")