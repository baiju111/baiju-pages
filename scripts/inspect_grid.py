from collections import deque
from pathlib import Path
import json
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "source" / "logo-b.jpg"

im = Image.open(SOURCE).convert("RGB")
rgb = np.asarray(im).astype(np.float32)
lum = 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]
mask = lum < 190
h, w = mask.shape
visited = np.zeros_like(mask, dtype=bool)
components = []

for sy, sx in zip(*np.where(mask)):
    if visited[sy, sx]:
        continue
    stack = [(sy, sx)]
    visited[sy, sx] = True
    xs, ys = [], []
    while stack:
        y, x = stack.pop()
        xs.append(x)
        ys.append(y)
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not visited[ny, nx]:
                visited[ny, nx] = True
                stack.append((ny, nx))
    if len(xs) >= 40:
        components.append({
            "x0": int(min(xs)), "x1": int(max(xs)),
            "y0": int(min(ys)), "y1": int(max(ys)),
            "area": len(xs),
            "cx": float(np.mean(xs)), "cy": float(np.mean(ys)),
        })

print("components", len(components))
ws = np.array([c["x1"] - c["x0"] + 1 for c in components])
hs = np.array([c["y1"] - c["y0"] + 1 for c in components])
areas = np.array([c["area"] for c in components])
for name, a in (("width", ws), ("height", hs), ("area", areas)):
    print(name, "min/median/mean/max", a.min(), np.median(a), round(float(a.mean()), 2), a.max())
print("size hist width", {int(k): int(v) for k, v in zip(*np.unique(ws, return_counts=True))})
print("size hist height", {int(k): int(v) for k, v in zip(*np.unique(hs, return_counts=True))})
print("first 8", components[:8])

# Estimate the lattice from centers using nearest-neighbor differences.
def estimate_axis(values):
    values = np.sort(np.asarray(values))
    diffs = []
    for i in range(len(values)):
        d = values[i + 1:] - values[i]
        diffs.extend(d[(d > 8) & (d < 32)].tolist())
    diffs = np.asarray(diffs)
    pitch = float(np.median(diffs))
    # Find the phase with the smallest total distance to lattice points.
    best = None
    for offset in np.arange(0, pitch, 0.02):
        residual = np.abs(((values - offset + pitch / 2) % pitch) - pitch / 2)
        score = float(np.mean(residual ** 2))
        if best is None or score < best[0]:
            best = (score, float(offset))
    score, offset = best
    cols = np.round((values - offset) / pitch).astype(int)
    # Refine pitch and offset by least squares.
    A = np.column_stack([cols, np.ones_like(cols, dtype=float)])
    pitch2, offset2 = np.linalg.lstsq(A, values, rcond=None)[0]
    residual = values - (pitch2 * cols + offset2)
    return {
        "pitch": float(pitch2),
        "offset": float(offset2),
        "rms": float(np.sqrt(np.mean(residual ** 2))),
        "max": float(np.max(np.abs(residual))),
        "neighbor_diff_median": pitch,
        "unique_columns": int(len(np.unique(cols))),
    }

print("x lattice", estimate_axis([c["cx"] for c in components]))
print("y lattice", estimate_axis([c["cy"] for c in components]))
