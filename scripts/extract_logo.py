"""Extract the real square-cell structure from the approved artwork.

File B is a JPEG with a baked white background. Every visible square is found
as a 4-connected foreground component; its centre, size and colour come from
the pixels, not from a guessed ideal grid. The supplied artwork is very close
to a regular lattice, but its block centres drift by several pixels, so the
component geometry is preserved instead of snapping it to a synthetic grid.

Outputs:
  assets/logo-mark.png          transparent, cropped master derived from B
  assets/logo-data.json         verified target-cell data
  js/logo-data.js               same data for the static page
  tests/logo-reconstruction.png composite of the extracted cells on white
  tests/logo-grid-overlay.png   visual audit overlay
"""
from collections import deque
from pathlib import Path
import json
import math

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "source" / "logo-b.jpg"
MARK_PATH = ROOT / "assets" / "logo-mark.png"
DATA_PATH = ROOT / "assets" / "logo-data.json"
JS_PATH = ROOT / "js" / "logo-data.js"
TESTS = ROOT / "tests"
TESTS.mkdir(exist_ok=True)

# The image is a near-black mark on pure white. This threshold sits inside the
# stable plateau (378 components at luminance thresholds 80 through 210).
THRESHOLD = 190
MIN_AREA = 80


def extract_components(lum: np.ndarray):
    mask = lum < THRESHOLD
    height, width = mask.shape
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
                if 0 <= ny < height and 0 <= nx < width and mask[ny, nx] and not visited[ny, nx]:
                    visited[ny, nx] = True
                    stack.append((ny, nx))
        if len(xs) < MIN_AREA:
            continue
        components.append({
            "x0": int(min(xs)), "x1": int(max(xs)),
            "y0": int(min(ys)), "y1": int(max(ys)),
            "area": len(xs),
        })
    return components


def median_color(rgb: np.ndarray, lum: np.ndarray, box: dict):
    x0, y0, x1, y1 = box["x0"], box["y0"], box["x1"], box["y1"]
    patch = rgb[y0:y1 + 1, x0:x1 + 1]
    patch_lum = lum[y0:y1 + 1, x0:x1 + 1]
    core = patch[patch_lum < 60]
    if len(core) == 0:
        core = patch.reshape(-1, 3)
    return [int(round(v)) for v in np.median(core, axis=0)]


def estimate_lattice(centres, axis_name):
    values = np.sort(np.asarray(centres, dtype=float))
    diffs = []
    for i in range(len(values)):
        d = values[i + 1:] - values[i]
        diffs.extend(d[(d > 9) & (d < 31)].tolist())
    pitch = float(np.median(diffs))
    best = None
    for offset in np.arange(0, 20, 0.05):
        residual = np.abs(((values - offset + pitch / 2) % pitch) - pitch / 2)
        score = float(np.mean(residual ** 2))
        if best is None or score < best[0]:
            best = (score, float(offset))
    _, offset = best
    columns = np.round((values - offset) / pitch).astype(int)
    design = np.column_stack([columns, np.ones_like(columns, dtype=float)])
    pitch, offset = np.linalg.lstsq(design, values, rcond=None)[0]
    residual = values - (pitch * columns + offset)
    return {
        "axis": axis_name,
        "pitch": round(float(pitch), 4),
        "offset": round(float(offset), 4),
        "rms": round(float(np.sqrt(np.mean(residual ** 2))), 4),
        "maxDeviation": round(float(np.max(np.abs(residual))), 4),
    }


def main():
    image = Image.open(SOURCE).convert("RGB")
    rgb = np.asarray(image).astype(np.float32)
    lum = 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]

    components = extract_components(lum)
    print(f"components: {len(components)}")

    widths = np.array([c["x1"] - c["x0"] + 1 for c in components], dtype=float)
    heights = np.array([c["y1"] - c["y0"] + 1 for c in components], dtype=float)
    cell_size = float(np.median((widths + heights) / 2.0))
    centres_x = [c["x0"] + (c["x1"] - c["x0"]) / 2 for c in components]
    centres_y = [c["y0"] + (c["y1"] - c["y0"]) / 2 for c in components]
    lattice_x = estimate_lattice(centres_x, "x")
    lattice_y = estimate_lattice(centres_y, "y")

    # Alpha is recovered from the white matte. The foreground is near neutral
    # black; solving the luminance equation recovers an anti-aliased edge with
    # no white halo when composited over the warm page.
    fg = np.median(rgb[lum < 40], axis=0)
    fg = np.clip(fg, 0, 255)
    fg_lum = float(0.2126 * fg[0] + 0.7152 * fg[1] + 0.0722 * fg[2])
    denom = max(1.0, 255.0 - fg_lum)
    alpha = np.clip((255.0 - lum) / denom * 255.0, 0, 255).astype(np.uint8)
    alpha[lum > 248] = 0
    # Very faint JPEG noise in the white field should not become a visible film.
    alpha[alpha < 3] = 0

    rgba = np.zeros((*alpha.shape, 4), dtype=np.uint8)
    rgba[:, :, 0] = int(round(fg[0]))
    rgba[:, :, 1] = int(round(fg[1]))
    rgba[:, :, 2] = int(round(fg[2]))
    rgba[:, :, 3] = alpha
    master = Image.fromarray(rgba, "RGBA")

    ys, xs = np.where(alpha > 6)
    visible = (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))
    padding = 16
    crop_x0 = max(0, visible[0] - padding)
    crop_y0 = max(0, visible[1] - padding)
    crop_x1 = min(image.width - 1, visible[2] + padding)
    crop_y1 = min(image.height - 1, visible[3] + padding)
    crop = (crop_x0, crop_y0, crop_x1 + 1, crop_y1 + 1)
    cropped = master.crop(crop)
    cropped.save(MARK_PATH, "PNG", optimize=True)

    # Cell targets are expressed relative to the cropped final asset. The
    # square's centre is preserved from B; the drawn side is the robust median.
    cells = []
    mark_x, mark_y = crop_x0, crop_y0
    for index, c in enumerate(components):
        cx = c["x0"] + (c["x1"] - c["x0"]) / 2
        cy = c["y0"] + (c["y1"] - c["y0"]) / 2
        col = round((cx - lattice_x["offset"]) / lattice_x["pitch"])
        row = round((cy - lattice_y["offset"]) / lattice_y["pitch"])
        color = median_color(rgb, lum, c)
        cells.append({
            "id": index,
            "row": int(row),
            "col": int(col),
            "cx": round(cx - mark_x, 3),
            "cy": round(cy - mark_y, 3),
            "size": round(cell_size, 3),
            "color": color,
            "alpha": 1,
            "sourceBox": [c["x0"] - mark_x, c["y0"] - mark_y, c["x1"] - c["x0"] + 1, c["y1"] - c["y0"] + 1],
        })

    # Outline cells are those that do not have neighbours in all eight
    # directions. This lets the animation establish the silhouette first.
    radius = 1.65 * max(lattice_x["pitch"], lattice_y["pitch"])
    for cell in cells:
        neighbours = 0
        for dx, dy in ((-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1)):
            target_x = cell["cx"] + dx * lattice_x["pitch"]
            target_y = cell["cy"] + dy * lattice_y["pitch"]
            if any(
                abs(other["cx"] - target_x) < radius * 0.6
                and abs(other["cy"] - target_y) < radius * 0.6
                for other in cells if other is not cell
            ):
                neighbours += 1
        cell["outline"] = neighbours < 6

    mark_width, mark_height = cropped.size
    data = {
        "artwork": "PIXEL STUDIO mark",
        "source": {
            "path": "assets/source/logo-b.jpg",
            "format": "JPEG",
            "width": image.width,
            "height": image.height,
            "hasOriginalAlpha": False,
            "alphaNote": "Transparency reconstructed from the white matte; the source has no alpha channel.",
        },
        "crop": {
            "x": crop_x0,
            "y": crop_y0,
            "width": mark_width,
            "height": mark_height,
            "padding": padding,
            "visibleBounds": list(visible),
        },
        "grid": {
            "isPerfectLattice": False,
            "detection": "4-connected foreground components at luminance < 190",
            "cellCount": len(cells),
            "medianBlockWidth": round(float(np.median(widths)), 3),
            "medianBlockHeight": round(float(np.median(heights)), 3),
            "targetSize": round(cell_size, 3),
            "pitchX": lattice_x["pitch"],
            "pitchY": lattice_y["pitch"],
            "pitchXDeviationRms": lattice_x["rms"],
            "pitchYDeviationRms": lattice_y["rms"],
            "gapX": round(lattice_x["pitch"] - cell_size, 3),
            "gapY": round(lattice_y["pitch"] - cell_size, 3),
            "note": "Blocks are preserved from their measured centres; B is close to, but not exactly, a perfect lattice.",
        },
        "render": {
            "image": "assets/logo-mark.png",
            "width": mark_width,
            "height": mark_height,
            "aspectRatio": round(mark_width / mark_height, 6),
        },
        "cells": cells,
    }
    DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    JS_PATH.write_text(
        "/* Generated from assets/source/logo-b.jpg by scripts/extract_logo.py. */\n"
        "window.PIXEL_LOGO_DATA = "
        + json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )

    # Reconstruction audit: square cells on white, compared with the cropped
    # source. Small anti-aliasing differences are expected; the geometry should
    # match almost exactly.
    recon = Image.new("RGBA", (mark_width, mark_height), (255, 255, 255, 255))
    draw = ImageDraw.Draw(recon)
    for cell in cells:
        half = cell["size"] / 2
        x0 = cell["cx"] - half
        y0 = cell["cy"] - half
        draw.rectangle([x0, y0, x0 + cell["size"] - 1, y0 + cell["size"] - 1], fill=tuple(cell["color"]) + (255,))
    recon.convert("RGB").save(TESTS / "logo-reconstruction.png")

    source_crop = image.crop(crop)
    # Composite the transparent master onto white for a like-for-like geometry
    # check against the source crop.
    white = Image.new("RGBA", cropped.size, (255, 255, 255, 255))
    master_on_white = Image.alpha_composite(white, cropped).convert("RGB")
    diff = np.abs(np.asarray(master_on_white, dtype=np.int16) - np.asarray(source_crop, dtype=np.int16))
    print(f"master crop: {cropped.size}; alpha bbox: {visible}")
    print(f"master-vs-source mean abs diff: {diff.mean():.4f}, max: {diff.max()}")

    overlay = source_crop.convert("RGB").copy()
    od = ImageDraw.Draw(overlay)
    for cell in cells:
        half = cell["size"] / 2
        x0 = cell["cx"] - half
        y0 = cell["cy"] - half
        od.rectangle([x0, y0, x0 + cell["size"] - 1, y0 + cell["size"] - 1], outline=(242, 106, 53), width=1)
    overlay.save(TESTS / "logo-grid-overlay.png")

    print(f"target size: {cell_size:.3f}; pitch x/y: {lattice_x['pitch']:.3f}/{lattice_y['pitch']:.3f}")
    print(f"outline cells: {sum(1 for c in cells if c['outline'])} / {len(cells)}")
    print(f"foreground sampled: {[round(float(v), 2) for v in fg]}")
    print(f"wrote {MARK_PATH.relative_to(ROOT)} ({MARK_PATH.stat().st_size} bytes)")
    print(f"wrote {DATA_PATH.relative_to(ROOT)} ({DATA_PATH.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
