from __future__ import annotations

import pytest

from optimizer.guillotine import optimize as saw_optimize

from .helpers import default_stock_for, is_guillotine_cuttable, overlapping_pairs


@pytest.fixture(params=["saw_parts", "nesting_parts"])
def any_parts(request):
    return request.getfixturevalue(request.param)


@pytest.fixture
def saw_result(any_parts, default_margin):
    stock = default_stock_for(any_parts)
    return saw_optimize(any_parts, stock, default_margin, kerf=4.0, allow_rotation=True)


def test_no_part_overlaps(saw_result):
    for sheet in saw_result.sheets:
        assert overlapping_pairs(sheet.placed) == 0, f"sheet {sheet.index} has overlapping parts"


def test_every_part_is_placed_or_explicitly_unplaced(any_parts, saw_result):
    placed_count = sum(len(sheet.placed) for sheet in saw_result.sheets)
    assert placed_count + len(saw_result.unplaced) == len(any_parts)


def test_all_real_sample_parts_get_placed(any_parts, saw_result):
    # both sample files only contain parts smaller than a 2440x1220 board, so
    # nothing should be dropped to `unplaced` once multi-sheet packing works
    assert saw_result.unplaced == []


def test_parts_stay_within_margin_inset_bounds(saw_result, default_margin):
    for sheet in saw_result.sheets:
        min_x, max_x = default_margin.left, sheet.boardW - default_margin.right
        min_y, max_y = default_margin.top, sheet.boardL - default_margin.bottom
        for p in sheet.placed:
            assert p.x >= min_x - 1e-6
            assert p.y >= min_y - 1e-6
            assert p.x + p.w <= max_x + 1e-6
            assert p.y + p.h <= max_y + 1e-6


def test_placed_and_offcut_area_does_not_exceed_board(saw_result, default_margin):
    for sheet in saw_result.sheets:
        usable = (sheet.boardW - default_margin.left - default_margin.right) * (
            sheet.boardL - default_margin.top - default_margin.bottom
        )
        placed_area = sum(p.w * p.h for p in sheet.placed)
        offcut_area = sum(o.w * o.h for o in sheet.offcuts)
        assert placed_area + offcut_area <= usable + 1e-6


def test_utilization_in_range(saw_result):
    for sheet in saw_result.sheets:
        assert 0 < sheet.utilizationPct <= 100


def test_sheets_are_guillotine_decomposable(saw_result):
    for sheet in saw_result.sheets:
        assert is_guillotine_cuttable(sheet.placed), (
            f"sheet {sheet.index} ({sheet.material}) is not recursively guillotine-decomposable "
            "— this layout could not actually be cut on a panel saw"
        )
