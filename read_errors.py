import numpy as np

# False positives
fp = np.load('dashboard/data/test_false_positives.npz', allow_pickle=True)
print("=== False Positives ===")
print('Keys:', list(fp.keys()))
for k in fp.keys():
    v = fp[k]
    print(f'{k}: shape={v.shape if hasattr(v, "shape") else "scalar"}, dtype={v.dtype if hasattr(v, "dtype") else type(v)}')
    if hasattr(v, 'shape') and v.shape == ():
        print(f'  value: {v.item()}')
    elif hasattr(v, 'shape') and len(v.shape) == 1 and v.shape[0] < 30:
        print(f'  values: {v}')
    elif hasattr(v, 'shape') and len(v.shape) == 1:
        print(f'  first 10: {v[:10]}')
        print(f'  len: {len(v)}')

print()

# False negatives
fn = np.load('dashboard/data/test_false_negatives.npz', allow_pickle=True)
print("=== False Negatives ===")
print('Keys:', list(fn.keys()))
for k in fn.keys():
    v = fn[k]
    print(f'{k}: shape={v.shape if hasattr(v, "shape") else "scalar"}, dtype={v.dtype if hasattr(v, "dtype") else type(v)}')
    if hasattr(v, 'shape') and v.shape == ():
        print(f'  value: {v.item()}')
    elif hasattr(v, 'shape') and len(v.shape) == 1 and v.shape[0] < 30:
        print(f'  values: {v}')
    elif hasattr(v, 'shape') and len(v.shape) == 1:
        print(f'  first 10: {v[:10]}')
        print(f'  len: {len(v)}')

print()

# Flagged label errors
fle = np.load('dashboard/data/test_flagged_label_errors.npz', allow_pickle=True)
print("=== Flagged Label Errors ===")
print('Keys:', list(fle.keys()))
for k in fle.keys():
    v = fle[k]
    print(f'{k}: shape={v.shape if hasattr(v, "shape") else "scalar"}, dtype={v.dtype if hasattr(v, "dtype") else type(v)}')
    if hasattr(v, 'shape') and v.shape == ():
        print(f'  value: {v.item()}')
    elif hasattr(v, 'shape') and len(v.shape) == 1 and v.shape[0] < 30:
        print(f'  values: {v}')
    elif hasattr(v, 'shape') and len(v.shape) == 1:
        print(f'  first 10: {v[:10]}')
        print(f'  len: {len(v)}')

print()

# Kepler-90 demo
k90 = np.load('dashboard/data/kepler90_demo.npz', allow_pickle=True)
print("=== Kepler-90 Demo ===")
print('Keys:', list(k90.keys()))
for k in k90.keys():
    v = k90[k]
    print(f'{k}: shape={v.shape if hasattr(v, "shape") else "scalar"}, dtype={v.dtype if hasattr(v, "dtype") else type(v)}')
    if hasattr(v, 'shape') and v.shape == ():
        print(f'  value: {v.item()}')
    elif hasattr(v, 'shape') and len(v.shape) == 1 and v.shape[0] < 30:
        print(f'  values: {v}')
    elif hasattr(v, 'shape') and len(v.shape) == 1:
        print(f'  first 10: {v[:10]}')
        print(f'  len: {len(v)}')