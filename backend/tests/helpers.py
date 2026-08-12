from __future__ import annotations
from itertools import combinations

from shapely.geometry import box

from optimizer.model import StockBoard

EPS = 1e-6


def default_stock_for(parts) -> list[StockBoard]:
    materials = sorted({(p.material, p.thickness) for p in parts})
    return [
        StockBoard(material=m, length=2440, width=1220, thickness=t, grain="none")
        for m, t in materials
    ]


def overlapping_pairs(rects: list) -> int:
    """Count pairs of placed parts whose rectangles overlap by non-negligible area."""
    boxes = [box(r.x, r.y, r.x + r.w, r.y + r.h) for r in rects]
    count = 0
    for a, b in combinations(boxes, 2):
        if a.intersection(b).area > EPS:
            count += 1
    return count


def is_guillotine_cuttable(rects: list) -> bool:
    """True if `rects` (objects with .x/.y/.w/.h) can be recursively separated by
    straight cuts that each span the full extent of the current group — the same
    constraint a panel saw is physically limited to (spec §7.4).
    """
    if len(rects) <= 1:
        return True
    xs = sorted({r.x for r in rects} | {r.x + r.w for r in rects})
    ys = sorted({r.y for r in rects} | {r.y + r.h for r in rects})
    for x in xs[1:-1]:
        left = [r for r in rects if r.x + r.w <= x + EPS]
        right = [r for r in rects if r.x >= x - EPS]
        if left and right and len(left) + len(right) == len(rects):
            if is_guillotine_cuttable(left) and is_guillotine_cuttable(right):
                return True
    for y in ys[1:-1]:
        bottom = [r for r in rects if r.y + r.h <= y + EPS]
        top = [r for r in rects if r.y >= y - EPS]
        if bottom and top and len(bottom) + len(top) == len(rects):
            if is_guillotine_cuttable(bottom) and is_guillotine_cuttable(top):
                return True
    return False
