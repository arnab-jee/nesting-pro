from __future__ import annotations

import pytest

from optimizer.nanxing import optimize as nanxing_optimize

from .helpers import default_stock_for, overlapping_pairs


@pytest.fixture(params=["saw_parts", "nesting_parts"])
def any_parts(request):
    return request.getfixturevalue(request.param)


@pytest.fixture
def nanxing_result(any_parts, default_margin):
    stock = default_stock_for(any_parts)
    return nanxing_optimize(any_parts, stock, default_margin, spacing=6.1)


def test_no_part_overlaps(nanxing_result):
    for sheet in nanxing_result.sheets:
        assert overlapping_pairs(sheet.placed) == 0, f"sheet {sheet.index} has overlapping parts"


def test_every_part_is_placed_or_explicitly_unplaced(any_parts, nanxing_result):
    placed_count = sum(len(sheet.placed) for sheet in nanxing_result.sheets)
    assert placed_count + len(nanxing_result.unplaced) == len(any_parts)


def test_all_real_sample_parts_get_placed(nanxing_result):
    assert nanxing_result.unplaced == []


def test_parts_stay_within_margin_inset_bounds(nanxing_result, default_margin):
    for sheet in nanxing_result.sheets:
        min_x, max_x = default_margin.left, sheet.boardW - default_margin.right
        min_y, max_y = default_margin.top, sheet.boardL - default_margin.bottom
        for p in sheet.placed:
            assert p.x >= min_x - 1e-6
            assert p.y >= min_y - 1e-6
            assert p.x + p.w <= max_x + 1e-6
            assert p.y + p.h <= max_y + 1e-6


def test_utilization_in_range(nanxing_result):
    for sheet in nanxing_result.sheets:
        assert 0 < sheet.utilizationPct <= 100
