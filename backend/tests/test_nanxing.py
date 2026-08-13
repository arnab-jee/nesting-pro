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


# Regression guard for the free-rectangle best-fit engine (backend/optimizer/packing.py):
# the previous single-row shelf packer's defining failure mode was "many parts crammed onto
# one sheet at low density" — e.g. on nesting_machine_data.csv it produced a 21-part sheet at
# only 21.4% utilization, because a shelf packer can never backfill a gap in an earlier row
# once it wraps. The best-fit engine reaches 73.8% on the equivalent (now 29-part) sheet.
# Note the *overall/average* utilization across a run is not a useful signal here — it's
# mathematically forced to match whenever two algorithms happen to use the same sheet count,
# which they often do (see update_001's investigation). The sheet holding the most parts is
# where a shelf packer's inability to backfill shows up most clearly, so that's what this
# checks, with a threshold comfortably between the old (~21-78%) and new (~74-87%) real-data
# results.
MIN_DOMINANT_SHEET_UTILIZATION = 55.0


def test_dominant_sheet_utilization_beats_naive_shelf_packing(nanxing_result):
    dominant = max(nanxing_result.sheets, key=lambda s: len(s.placed))
    assert dominant.utilizationPct >= MIN_DOMINANT_SHEET_UTILIZATION, (
        f"sheet with the most parts ({len(dominant.placed)}) is only {dominant.utilizationPct}% "
        "utilized — packer may have regressed to shelf-packing quality"
    )
