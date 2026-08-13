from __future__ import annotations

from .model import Margin, OptResult, Part, Sheet, StockBoard
from .packing import place_parts_on_board


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
                # allow_rotation=True: Nanxing has no global rotation override, placement is
                # always gated purely by part.can_rotate() (grain), matching prior behavior
                sheet, still_remaining = place_parts_on_board(remaining, board, margin, spacing, True, sheet_index)
                if not sheet.placed:
                    unplaced.extend(still_remaining)
                    break
                sheets.append(sheet)
                sheet_index += 1
                remaining = still_remaining
    return OptResult(sheets=sheets, unplaced=unplaced)
