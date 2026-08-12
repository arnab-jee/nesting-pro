from __future__ import annotations
from dataclasses import dataclass

from .model import CutInstruction, Margin, OptResult, Part, PlacedPart, Sheet, StockBoard, Offcut


@dataclass
class Rectangle:
    x: float
    y: float
    w: float
    h: float

    def area(self) -> float:
        return max(self.w, 0.0) * max(self.h, 0.0)

    def can_fit(self, width: float, height: float) -> bool:
        return width <= self.w + 1e-9 and height <= self.h + 1e-9


def guillotine_split(free: Rectangle, pw: float, ph: float) -> list[Rectangle]:
    """Split `free` into up to two children after placing a pw x ph part in its
    bottom-left corner, using a single straight cut across the whole free rect
    (the "shorter leftover axis" rule). This guarantees the result is always a
    valid guillotine partition: no two free rectangles in the tree ever overlap.
    """
    remain_w = free.w - pw
    remain_h = free.h - ph
    children: list[Rectangle] = []
    if remain_w <= remain_h:
        # horizontal cut across the full width, above the part
        right = Rectangle(free.x + pw, free.y, remain_w, ph)
        top = Rectangle(free.x, free.y + ph, free.w, remain_h)
    else:
        # vertical cut across the full height, right of the part
        right = Rectangle(free.x + pw, free.y, remain_w, free.h)
        top = Rectangle(free.x, free.y + ph, pw, remain_h)
    if right.area() > 1e-6:
        children.append(right)
    if top.area() > 1e-6:
        children.append(top)
    return children


def place_parts_on_board(
    parts: list[Part], board: StockBoard, margin: Margin, kerf: float, allow_rotation: bool, sheet_index: int
) -> tuple[Sheet, list[Part]]:
    width = board.width - margin.left - margin.right
    height = board.length - margin.top - margin.bottom
    free_rects = [Rectangle(0.0, 0.0, width, height)]
    placed_parts: list[PlacedPart] = []
    unplaced: list[Part] = []
    for part in sorted(parts, key=lambda item: (-item.area(), -max(item.cutLength, item.cutWidth))):
        best_choice = None
        orientations = [False, True] if allow_rotation and part.can_rotate() else [False]
        for rotated in orientations:
            pw = part.cutWidth if rotated else part.cutLength
            ph = part.cutLength if rotated else part.cutWidth
            footprint_w = pw + kerf
            footprint_h = ph + kerf
            for rect_idx, rect in enumerate(free_rects):
                if rect.can_fit(footprint_w, footprint_h):
                    short_side = min(rect.w - footprint_w, rect.h - footprint_h)
                    score = (short_side, rect.area())
                    if best_choice is None or score < best_choice[0]:
                        best_choice = (score, rect_idx, rotated, pw, ph)
        if best_choice is None:
            unplaced.append(part)
            continue
        _, rect_idx, rotated, pw, ph = best_choice
        target_rect = free_rects.pop(rect_idx)
        placed_parts.append(
            PlacedPart(
                partId=part.id,
                x=target_rect.x + margin.left,
                y=target_rect.y + margin.top,
                rotated=rotated,
                w=pw,
                h=ph,
                name=part.name,
                material=part.material,
                thickness=part.thickness,
                grain=part.grain,
            )
        )
        free_rects.extend(guillotine_split(target_rect, pw + kerf, ph + kerf))
    board_area = width * height
    placed_area = sum(p.w * p.h for p in placed_parts)
    utilization = 0.0 if board_area <= 0 else round(placed_area / board_area * 100.0, 2)
    offcuts = [
        Offcut(x=r.x + margin.left, y=r.y + margin.top, w=r.w, h=r.h) for r in free_rects if r.area() > 1e-6
    ]
    return (
        Sheet(
            index=sheet_index,
            material=board.material,
            boardL=board.length,
            boardW=board.width,
            thickness=board.thickness,
            placed=placed_parts,
            offcuts=offcuts,
            utilizationPct=utilization,
        ),
        unplaced,
    )


def build_cuts_for_sheet(sheet: Sheet, board: StockBoard, margin: Margin) -> list[CutInstruction]:
    width = board.width - margin.left - margin.right
    height = board.length - margin.top - margin.bottom
    x_positions = {0.0, width}
    y_positions = {0.0, height}
    for p in sheet.placed:
        x_positions.add(p.x - margin.left)
        x_positions.add(p.x - margin.left + p.w)
        y_positions.add(p.y - margin.top)
        y_positions.add(p.y - margin.top + p.h)
    cuts: list[CutInstruction] = []
    for x in sorted(x_positions):
        if x > 1e-6 and x < width - 1e-6:
            cuts.append(CutInstruction(orientation="vertical", offset=x + margin.left, length=height, sheetIndex=sheet.index))
    for y in sorted(y_positions):
        if y > 1e-6 and y < height - 1e-6:
            cuts.append(CutInstruction(orientation="horizontal", offset=y + margin.top, length=width, sheetIndex=sheet.index))
    return cuts


def optimize(
    request_parts: list[Part], stock: list[StockBoard], margin: Margin, kerf: float, allow_rotation: bool
) -> OptResult:
    sheets: list[Sheet] = []
    unplaced: list[Part] = []
    cuts: list[CutInstruction] = []
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
                sheet, still_remaining = place_parts_on_board(remaining, board, margin, kerf, allow_rotation, sheet_index)
                if not sheet.placed:
                    # nothing fit on a fresh, empty board — these parts are genuinely unplaceable
                    unplaced.extend(still_remaining)
                    break
                sheets.append(sheet)
                cuts.extend(build_cuts_for_sheet(sheet, board, margin))
                sheet_index += 1
                remaining = still_remaining
    return OptResult(sheets=sheets, unplaced=unplaced, cuts=cuts)
