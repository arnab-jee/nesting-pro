from __future__ import annotations
from dataclasses import dataclass
from typing import Iterable

from .model import Grain, Margin, OptResult, Part, PlacedPart, Sheet, StockBoard, Offcut


@dataclass
class Rect:
    x: float
    y: float
    w: float
    h: float

    def area(self) -> float:
        return max(self.w, 0.0) * max(self.h, 0.0)

    def can_fit(self, width: float, height: float) -> bool:
        return width <= self.w + 1e-9 and height <= self.h + 1e-9


def place_free(parts: list[Part], board: StockBoard, margin: Margin, spacing: float, sheet_index: int) -> tuple[Sheet, list[Part]]:
    available_w = board.width - margin.left - margin.right
    available_h = board.length - margin.top - margin.bottom
    cur_x = 0.0
    cur_y = 0.0
    row_height = 0.0
    placed_parts: list[PlacedPart] = []
    unplaced: list[Part] = []
    for part in sorted(parts, key=lambda p: (-p.area(), -max(p.cutLength, p.cutWidth))):
        orientations = [False, True] if part.can_rotate() else [False]
        placed = False
        for rotated in orientations:
            pw = part.cutWidth if rotated else part.cutLength
            ph = part.cutLength if rotated else part.cutWidth
            if pw <= 0 or ph <= 0:
                continue
            if cur_x + pw <= available_w + 1e-9 and cur_y + ph <= available_h + 1e-9:
                placed_parts.append(
                    PlacedPart(
                        partId=part.id,
                        x=cur_x + margin.left,
                        y=cur_y + margin.top,
                        rotated=rotated,
                        w=pw,
                        h=ph,
                        name=part.name,
                        material=part.material,
                        thickness=part.thickness,
                        grain=part.grain,
                    )
                )
                row_height = max(row_height, ph + spacing)
                cur_x += pw + spacing
                placed = True
                break
        if not placed:
            if row_height > 0 and part.cutWidth <= available_w + 1e-9 and cur_y + row_height + part.cutLength <= available_h + 1e-9:
                cur_x = 0.0
                cur_y += row_height
                row_height = 0.0
                for rotated in orientations:
                    pw = part.cutWidth if rotated else part.cutLength
                    ph = part.cutLength if rotated else part.cutWidth
                    if cur_x + pw <= available_w + 1e-9 and cur_y + ph <= available_h + 1e-9:
                        placed_parts.append(
                            PlacedPart(
                                partId=part.id,
                                x=cur_x + margin.left,
                                y=cur_y + margin.top,
                                rotated=rotated,
                                w=pw,
                                h=ph,
                                name=part.name,
                                material=part.material,
                                thickness=part.thickness,
                                grain=part.grain,
                            )
                        )
                        row_height = max(row_height, ph + spacing)
                        cur_x += pw + spacing
                        placed = True
                        break
        if not placed:
            unplaced.append(part)
    used_area = sum(p.w * p.h for p in placed_parts)
    total_area = available_w * available_h
    utilization = round(used_area / total_area * 100.0, 2) if total_area > 0 else 0.0
    free_rects = []
    occupied = []
    for p in placed_parts:
        occupied.append(Rect(p.x - margin.left, p.y - margin.top, p.w + spacing, p.h + spacing))
    current = [Rect(0.0, 0.0, available_w, available_h)]
    for occ in occupied:
        new_current: list[Rect] = []
        for rect in current:
            if occ.x >= rect.x + rect.w or occ.x + occ.w <= rect.x or occ.y >= rect.y + rect.h or occ.y + occ.h <= rect.y:
                new_current.append(rect)
                continue
            if occ.x > rect.x:
                new_current.append(Rect(rect.x, rect.y, occ.x - rect.x, rect.h))
            if occ.x + occ.w < rect.x + rect.w:
                new_current.append(Rect(occ.x + occ.w, rect.y, rect.x + rect.w - (occ.x + occ.w), rect.h))
            if occ.y > rect.y:
                new_current.append(Rect(rect.x, rect.y, rect.w, occ.y - rect.y))
            if occ.y + occ.h < rect.y + rect.h:
                new_current.append(Rect(rect.x, occ.y + occ.h, rect.w, rect.y + rect.h - (occ.y + occ.h)))
        current = [r for r in new_current if r.area() > 1e-6]
    free_rects = [Offcut(x=r.x + margin.left, y=r.y + margin.top, w=r.w, h=r.h) for r in current]
    sheet = Sheet(index=sheet_index, material=board.material, boardL=board.length, boardW=board.width, thickness=board.thickness, placed=placed_parts, offcuts=free_rects, utilizationPct=utilization)
    return sheet, unplaced


def optimize(request_parts: list[Part], stock: list[StockBoard], margin: Margin, spacing: float) -> OptResult:
    sheets: list[Sheet] = []
    unplaced: list[Part] = []
    sheet_index = 1
    for board in stock:
        board_parts = [part for part in request_parts if part.material == board.material and part.thickness == board.thickness]
        if not board_parts:
            continue
        # independent nesting job per (material, thickness, grain) — grain-locked parts
        # never share a sheet with a different grain requirement, even on the same board type
        for grain in sorted({part.grain for part in board_parts}):
            remaining = [part for part in board_parts if part.grain == grain]
            while remaining:
                sheet, still_remaining = place_free(remaining, board, margin, spacing, sheet_index)
                if not sheet.placed:
                    unplaced.extend(still_remaining)
                    break
                sheets.append(sheet)
                sheet_index += 1
                remaining = still_remaining
    return OptResult(sheets=sheets, unplaced=unplaced)
