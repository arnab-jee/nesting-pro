from __future__ import annotations

from .model import CutInstruction, Margin, OptResult, Part, Sheet, StockBoard, WasteStrategy
from .placement import DEFAULT_PLACEMENT_CORNER, PlacementCorner, mirror_sheet
from .saw_packing import place_parts_on_board


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
    request_parts: list[Part], stock: list[StockBoard], margin: Margin, kerf: float, allow_rotation: bool,
    waste_strategy: WasteStrategy = "balanced", placement_corner: PlacementCorner = DEFAULT_PLACEMENT_CORNER,
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
                sheet, still_remaining = place_parts_on_board(remaining, board, margin, kerf, allow_rotation, sheet_index, waste_strategy)
                if not sheet.placed:
                    # nothing fit on a fresh, empty board — these parts are genuinely unplaceable
                    unplaced.extend(still_remaining)
                    break
                # mirrored *after* placement decisions are final — build_cuts_for_sheet below
                # reads sheet.placed, so the cut list comes out consistent with wherever the
                # mirrored parts actually ended up.
                sheet = mirror_sheet(sheet, board, margin, placement_corner)
                sheets.append(sheet)
                cuts.extend(build_cuts_for_sheet(sheet, board, margin))
                sheet_index += 1
                remaining = still_remaining
    return OptResult(sheets=sheets, unplaced=unplaced, cuts=cuts)
