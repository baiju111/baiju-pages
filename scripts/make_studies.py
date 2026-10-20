"""Generate six labelled concept-study covers in the site's block grammar.

These are original placeholder works, not reproductions of file B and not
claims about real clients. They share only the palette, the square cell and the
transparent-gap discipline of the hero artwork.
"""
from pathlib import Path
import math

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "works"
OUT.mkdir(parents=True, exist_ok=True)

PAPER = "#F7F5EF"
INK = "#191919"
ORANGE = "#F26A35"


def svg(width, height, body):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'width="{width}" height="{height}" shape-rendering="crispEdges">'
        f'<rect width="{width}" height="{height}" fill="{body[0]}"/>{body[1]}</svg>'
    )


def rects(items):
    return "".join(
        f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" fill="{c}"/>'
        for x, y, w, h, c in items
    )


def grid_rects(cols, rows, x0, y0, cell, gap, color_for, skip=lambda c, r: False):
    pitch = cell + gap
    items = []
    for r in range(rows):
        for c in range(cols):
            if skip(c, r):
                continue
            color = color_for(c, r)
            if color is None:
                continue
            items.append((x0 + c * pitch, y0 + r * pitch, cell, cell, color))
    return items


# 01 — a field of warm blocks interrupted by a vertical fault and one signal.
w, h = 640, 800
items = grid_rects(
    12, 22, 119.5, 30, 27, 7, lambda c, r: PAPER,
    skip=lambda c, r: (c == 6 and r < 10) or (c in (9, 10) and r in (18, 19, 20)),
)
items.append((119.5 + 6 * 34, 30 + 11 * 34, 27, 27, ORANGE))
items.append((119.5 + 6 * 34, 30 + 12 * 34, 27, 27, PAPER))
(OUT / "study-01.svg").write_text(svg(w, h, (INK, rects(items))), encoding="utf-8")

# 02 — checker field, one vacancy.
w = h = 560
items = []
cell, gap = 42, 8
pitch = cell + gap
origin = (w - (9 * pitch - gap)) / 2
for r in range(9):
    for c in range(9):
        if (c, r) == (4, 4):
            continue
        color = INK if (c + r) % 2 == 0 else PAPER
        items.append((origin + c * pitch, origin + r * pitch, cell, cell, color))
(OUT / "study-02.svg").write_text(svg(w, h, (ORANGE, rects(items))), encoding="utf-8")

# 03 — a blocky orbit, with one orange coordinate.
w, h = 960, 600
items = []
cell, gap = 20, 5
pitch = cell + gap
cols, rows = 32, 20
x0 = (w - (cols * pitch - gap)) / 2
y0 = (h - (rows * pitch - gap)) / 2
for r in range(rows):
    for c in range(cols):
        dx = c - (cols - 1) / 2
        dy = r - (rows - 1) / 2
        d = math.hypot(dx, dy)
        if 5.7 <= d <= 8.4 and not (-0.45 < math.atan2(dy, dx) < 0.25):
            items.append((x0 + c * pitch, y0 + r * pitch, cell, cell, INK))
items.append((x0 + 15 * pitch, y0 + 1 * pitch, cell, cell, ORANGE))
items.append((x0 + 16 * pitch, y0 + 1 * pitch, cell, cell, ORANGE))
(OUT / "study-03.svg").write_text(svg(w, h, (PAPER, rects(items))), encoding="utf-8")

# 04 — a glyph built from the same unit.
w, h = 600, 760
pattern = [
    "111111110",
    "110000011",
    "110000011",
    "110000011",
    "111111110",
    "110000000",
    "110000000",
    "110000000",
    "110000000",
    "110000000",
    "110000000",
    "110000000",
]
cell, gap = 46, 8
pitch = cell + gap
x0 = (w - (9 * pitch - gap)) / 2
y0 = (h - (len(pattern) * pitch - gap)) / 2
items = []
for r, line in enumerate(pattern):
    for c, bit in enumerate(line):
        if bit == "1":
            items.append((x0 + c * pitch, y0 + r * pitch, cell, cell, INK))
items.append((x0 + 3 * pitch, y0 + 2 * pitch, cell, cell, ORANGE))
(OUT / "study-04.svg").write_text(svg(w, h, (ORANGE, rects(items))), encoding="utf-8")

# 05 — three nested square rings and a signal at the centre.
w = h = 680
cell, gap = 28, 6
pitch = cell + gap
cols = rows = 17
x0 = (w - (cols * pitch - gap)) / 2
y0 = (h - (rows * pitch - gap)) / 2
items = []
for r in range(rows):
    for c in range(cols):
        ring = max(abs(c - 8), abs(r - 8))
        if ring in (7, 4, 1):
            items.append((x0 + c * pitch, y0 + r * pitch, cell, cell, PAPER))
items.append((x0 + 8 * pitch, y0 + 8 * pitch, cell, cell, ORANGE))
(OUT / "study-05.svg").write_text(svg(w, h, (INK, rects(items))), encoding="utf-8")

# 06 — a discrete signal field.
w, h = 920, 620
lengths = [4, 6, 8, 13, 21, 17, 11, 8, 12, 19, 25, 22, 17, 13, 9, 6, 4, 3]
cell, gap = 18, 7
pitch = cell + gap
cols = 30
rows = len(lengths)
x0 = (w - (cols * pitch - gap)) / 2
y0 = (h - (rows * pitch - gap)) / 2
items = []
for r, length in enumerate(lengths):
    for c in range(length):
        color = ORANGE if c == length - 1 and r > 9 else INK
        items.append((x0 + c * pitch, y0 + r * pitch, cell, cell, color))
(OUT / "study-06.svg").write_text(svg(w, h, (PAPER, rects(items))), encoding="utf-8")

print("wrote", sorted(p.name for p in OUT.glob("*.svg")))
