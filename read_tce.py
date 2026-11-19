import numpy as np
data = np.load('dashboard/data/tce_table.npz', allow_pickle=True)
print('Keys:', list(data.keys()))
for k in data.keys():
    v = data[k]
    print(f'{k}: shape={v.shape if hasattr(v, "shape") else "scalar"}, dtype={v.dtype if hasattr(v, "dtype") else type(v)}')
    if hasattr(v, 'shape') and v.shape == ():
        print(f'  value: {v.item()}')
    elif hasattr(v, 'shape') and len(v.shape) == 1 and v.shape[0] < 50:
        print(f'  values: {v}')
    elif hasattr(v, 'shape') and len(v.shape) == 1:
        print(f'  first 20: {v[:20]}')
        print(f'  unique: {np.unique(v)}')
    elif hasattr(v, 'shape') and len(v.shape) == 2:
        print(f'  shape: {v.shape}')
        print(f'  first row: {v[0]}')