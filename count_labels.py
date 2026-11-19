import numpy as np
data = np.load('dashboard/data/tce_table.npz', allow_pickle=True)

label = data['label']
av_training_set = data['av_training_set']
split = data['split']

print("Total TCEs:", len(label))
print()

print("Label counts (0=FP, 1=PC):")
unique, counts = np.unique(label, return_counts=True)
for u, c in zip(unique, counts):
    print(f"  {u}: {c} ({c/len(label)*100:.1f}%)")

print()
print("av_training_set counts:")
unique, counts = np.unique(av_training_set, return_counts=True)
for u, c in zip(unique, counts):
    print(f"  {u}: {c} ({c/len(label)*100:.1f}%)")

print()
print("Split counts:")
unique, counts = np.unique(split, return_counts=True)
for u, c in zip(unique, counts):
    print(f"  {u}: {c} ({c/len(label)*100:.1f}%)")

print()
print("av_training_set by split:")
for s in ['train', 'val', 'test']:
    mask = split == s
    subset = av_training_set[mask]
    unique, counts = np.unique(subset, return_counts=True)
    print(f"  {s}:")
    for u, c in zip(unique, counts):
        print(f"    {u}: {c}")

print()
print("Unique kepids:", len(np.unique(data['kepid'])))