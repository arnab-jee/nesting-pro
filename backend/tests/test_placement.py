from __future__ import annotations

import pytest

from optimizer.guillotine import optimize as saw_optimize
from optimizer.model import Margin, Offcut, PlacedPart, Sheet, StockBoard
from optimizer.nanxing import optimize as nanxing_optimize
from optimizer.placement import mirror_sheet

from .helpers import default_stock_for, is_guillotine_cuttable, overlapping_pairs

ALL_CORNERS = ["bottom-left", "bottom-right", "top-left", "top-right"]


def _part(name="P", x=0.0, y=0.0, w=100.0, h=200.0) -> PlacedPart:
    return PlacedPart(partId=name, x=x, y=y, rotated=False, w=w, h=h, name=name, material="MAT", thickness=18.0, grain="none")


def _sheet(placed=None, offcuts=None) -> Sheet:
    return Sheet(index=1, material="MAT", boardL=2440.0, boardW=1220.0, thickness=18.0, placed=placed or [], offcuts=offcuts or [], utilizationPct=50.0)


def test_bottom_left_is_a_no_op():
    board = StockBoard(material="MAT", length=2440.0, width=1220.0, thickness=18.0)
    margin = Margin(top=0.0, right=10.0, bottom=10.0, left=5.0)
    sheet = _sheet(placed=[_part(x=5.0, y=0.0, w=100.0, h=200.0)])
    mirrored = mirror_sheet(sheet, board, margin, "bottom-left")
    assert mirrored is sheet


def test_top_right_mirrors_both_axes():
    # Usable width = board.width - left - right = 1220-5-10 = 1205, spanning x in [5, 1210].
    # Usable length = board.length - top - bottom = 2440-0-10 = 2430, spanning y in [0, 2430].
    board = StockBoard(material="MAT", length=2440.0, width=1220.0, thickness=18.0)
    margin = Margin(top=0.0, right=10.0, bottom=10.0, left=5.0)
    part = _part(x=5.0, y=0.0, w=100.0, h=200.0)
    mirrored = mirror_sheet(_sheet(placed=[part]), board, margin, "top-right")
    m = mirrored.placed[0]
    # new_x = x_min + x_max - x - w = 5 + 1210 - 5 - 100 = 1110
    assert m.x == pytest.approx(1110.0)
    # new_y = y_min + y_max - y - h = 0 + 2430 - 0 - 200 = 2230
    assert m.y == pytest.approx(2230.0)
    assert m.w == 100.0 and m.h == 200.0


def test_bottom_right_mirrors_length_axis_only():
    board = StockBoard(material="MAT", length=2440.0, width=1220.0, thickness=18.0)
    margin = Margin(top=0.0, right=10.0, bottom=10.0, left=5.0)
    part = _part(x=5.0, y=0.0, w=100.0, h=200.0)
    mirrored = mirror_sheet(_sheet(placed=[part]), board, margin, "bottom-right")
    m = mirrored.placed[0]
    assert m.x == pytest.approx(5.0)  # width axis unchanged
    assert m.y == pytest.approx(2230.0)  # length axis mirrored


def test_top_left_mirrors_width_axis_only():
    board = StockBoard(material="MAT", length=2440.0, width=1220.0, thickness=18.0)
    margin = Margin(top=0.0, right=10.0, bottom=10.0, left=5.0)
    part = _part(x=5.0, y=0.0, w=100.0, h=200.0)
    mirrored = mirror_sheet(_sheet(placed=[part]), board, margin, "top-left")
    m = mirrored.placed[0]
    assert m.x == pytest.approx(1110.0)  # width axis mirrored
    assert m.y == pytest.approx(0.0)  # length axis unchanged


def test_offcuts_are_mirrored_too():
    board = StockBoard(material="MAT", length=2440.0, width=1220.0, thickness=18.0)
    margin = Margin(top=0.0, right=0.0, bottom=0.0, left=0.0)
    offcut = Offcut(x=0.0, y=0.0, w=200.0, h=300.0)
    mirrored = mirror_sheet(_sheet(offcuts=[offcut]), board, margin, "top-right")
    o = mirrored.offcuts[0]
    assert o.x == pytest.approx(1220.0 - 200.0)
    assert o.y == pytest.approx(2440.0 - 300.0)


@pytest.mark.parametrize("corner", ALL_CORNERS)
def test_mirroring_preserves_saw_invariants_on_real_data(saw_parts, default_margin, corner):
    stock = default_stock_for(saw_parts)
    result = saw_optimize(saw_parts, stock, default_margin, kerf=4.0, allow_rotation=True, placement_corner=corner)
    assert result.unplaced == []
    for sheet in result.sheets:
        assert overlapping_pairs(sheet.placed) == 0
        assert is_guillotine_cuttable(sheet.placed), f"sheet {sheet.index} not guillotine-cuttable at corner={corner}"
        min_x, max_x = default_margin.left, sheet.boardW - default_margin.right
        min_y, max_y = default_margin.top, sheet.boardL - default_margin.bottom
        for p in sheet.placed:
            assert p.x >= min_x - 1e-6 and p.y >= min_y - 1e-6
            assert p.x + p.w <= max_x + 1e-6 and p.y + p.h <= max_y + 1e-6


@pytest.mark.parametrize("corner", ALL_CORNERS)
def test_mirroring_preserves_nanxing_invariants_on_real_data(nesting_parts, default_margin, corner):
    stock = default_stock_for(nesting_parts)
    result = nanxing_optimize(nesting_parts, stock, default_margin, spacing=6.1, placement_corner=corner)
    for sheet in result.sheets:
        assert overlapping_pairs(sheet.placed) == 0
        min_x, max_x = default_margin.left, sheet.boardW - default_margin.right
        min_y, max_y = default_margin.top, sheet.boardL - default_margin.bottom
        for p in sheet.placed:
            assert p.x >= min_x - 1e-6 and p.y >= min_y - 1e-6
            assert p.x + p.w <= max_x + 1e-6 and p.y + p.h <= max_y + 1e-6


def test_non_default_corner_actually_changes_placement(saw_parts, default_margin):
    # A sanity check that the option has teeth end-to-end, not just that invariants hold —
    # invariants alone would also pass for a no-op that silently ignored the corner argument.
    stock = default_stock_for(saw_parts)
    default_result = saw_optimize(saw_parts, stock, default_margin, kerf=4.0, allow_rotation=True, placement_corner="bottom-left")
    mirrored_result = saw_optimize(saw_parts, stock, default_margin, kerf=4.0, allow_rotation=True, placement_corner="top-right")
    default_positions = [(p.x, p.y) for sheet in default_result.sheets for p in sheet.placed]
    mirrored_positions = [(p.x, p.y) for sheet in mirrored_result.sheets for p in sheet.placed]
    assert default_positions != mirrored_positions


def test_cut_lines_stay_consistent_with_mirrored_positions(saw_parts, default_margin):
    # build_cuts_for_sheet reads sheet.placed directly, so every cut offset must fall within
    # the board bounds regardless of which corner the layout was mirrored to.
    stock = default_stock_for(saw_parts)
    result = saw_optimize(saw_parts, stock, default_margin, kerf=4.0, allow_rotation=True, placement_corner="top-right")
    assert len(result.cuts) > 0
    for sheet in result.sheets:
        usable_w = sheet.boardW - default_margin.left - default_margin.right
        usable_h = sheet.boardL - default_margin.top - default_margin.bottom
        for cut in [c for c in result.cuts if c.sheetIndex == sheet.index]:
            if cut.orientation == "vertical":
                assert default_margin.left - 1e-6 <= cut.offset <= default_margin.left + usable_w + 1e-6
            else:
                assert default_margin.top - 1e-6 <= cut.offset <= default_margin.top + usable_h + 1e-6
