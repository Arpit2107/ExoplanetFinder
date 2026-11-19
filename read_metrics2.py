import numpy as np
data = np.load('dashboard/data/metrics.npz', allow_pickle=True)
for k in data.keys():
    v = data[k]
    print(f'{k}: {v}')