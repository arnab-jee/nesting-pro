from __future__ import annotations

import pytest

import optimizer.guillotine as guillotine_module
import optimizer.nanxing as nanxing_module
from optimizer import nanxing_packing, saw_packing
from optimizer.guillotine import optimize as saw_optimize
from optimizer.model import Margin, Part, StockBoard
from optimizer.nanxing import optimize as nanxing_optimize

from .helpers import default_stock_for, is_guillotine_cuttable, overlapping_pairs

MODULES = [saw_packing, nanxing_packing]


def _part(cutLength: float, cutWidth: float, grain: str = "none", id: str = "P") -> Part:
    return Part(
        id=id, posId=id, name=id, cutLength=cutLength, cutWidth=cutWidth,
        finishedLength=cutLength, finishedWidth=cutWidth, thickness=18.0, qty=1,
        material="MAT", grain=grain, edges={"l1": "", "l2": "", "w1": "", "w2": ""},
    )


def test_packers_are_independent_modules():
    # Updates/update_003.md: "maintain separate packers" — guillotine.py and nanxing.py must
    # not import the same underlying module, so a future change to one can't silently affect
    # the other.
    assert saw_packing is not nanxing_packing
    assert saw_packing.__file__ != nanxing_packing.__file__
    assert guillotine_module.place_parts_on_board.__module__ == "optimizer.saw_packing"
    assert nanxing_module.place_parts_on_board.__module__ == "optimizer.nanxing_packing"


@pytest.mark.parametrize("mod", MODULES)
def test_merge_free_rects_combines_adjacent_rectangles(mod):
    # Two rects sharing a full vertical edge (same x/w, stacked in y) merge into one.
    a = mod.Rectangle(0, 0, 100, 50)
    b = mod.Rectangle(0, 50, 100, 30)
    merged = mod.merge_free_rects([a, b])
    assert len(merged) == 1
    assert merged[0] == mod.Rectangle(0, 0, 100, 80)


@pytest.mark.parametrize("mod", MODULES)
def test_merge_free_rects_leaves_non_adjacent_rects_alone(mod):
    a = mod.Rectangle(0, 0, 100, 50)
    b = mod.Rectangle(200, 200, 10, 10)
    merged = mod.merge_free_rects([a, b])
    assert len(merged) == 2


@pytest.mark.parametrize("mod", MODULES)
def test_edge_strategy_always_cuts_vertically(mod):
    # "edge" must ignore the shorter-leftover-axis rule and always keep the right-hand child
    # at the free rectangle's full height. Pick pw/ph so remain_w (10) < remain_h (50): under
    # "balanced" this is exactly the case that picks a horizontal cut (clipping the right
    # child's height to ph) — "edge" must still force a vertical cut here regardless.
    free = mod.Rectangle(0, 0, 200, 100)
    children_edge = mod.guillotine_split(free, pw=190, ph=50, waste_strategy="edge")
    right = next(c for c in children_edge if c.x == 190)
    assert right.h == 100  # full height retained, not clipped to ph=50

    children_balanced = mod.guillotine_split(free, pw=190, ph=50, waste_strategy="balanced")
    right_balanced = next(c for c in children_balanced if c.x == 190)
    assert right_balanced.h == 50  # balanced clips to the part's own height here


@pytest.mark.parametrize("mod", MODULES)
def test_waste_strategy_defaults_to_balanced(mod):
    free = mod.Rectangle(0, 0, 200, 100)
    default = mod.guillotine_split(free, pw=50, ph=90)
    balanced = mod.guillotine_split(free, pw=50, ph=90, waste_strategy="balanced")
    assert default == balanced


def test_edge_strategy_stays_guillotine_decomposable_and_drops_nothing(nesting_parts, default_margin):
    stock = default_stock_for(nesting_parts)
    result = nanxing_optimize(nesting_parts, stock, default_margin, spacing=6.0, waste_strategy="edge")
    assert result.unplaced == []
    for sheet in result.sheets:
        assert overlapping_pairs(sheet.placed) == 0
        assert is_guillotine_cuttable(sheet.placed)


def test_edge_strategy_stays_guillotine_decomposable_for_saw(saw_parts, default_margin):
    stock = default_stock_for(saw_parts)
    result = saw_optimize(saw_parts, stock, default_margin, kerf=4.0, allow_rotation=True, waste_strategy="edge")
    assert result.unplaced == []
    for sheet in result.sheets:
        assert overlapping_pairs(sheet.placed) == 0
        assert is_guillotine_cuttable(sheet.placed)


def test_edge_strategy_consolidates_wastage_vs_balanced(nesting_parts, default_margin):
    # The real-world motivation (Updates/update_003.md's screenshot): "balanced" fragments
    # leftover space into many small offcuts scattered across a sheet; "edge" should collapse
    # more of that leftover area into one dominant offcut per sheet rather than many
    # similarly-sized scattered ones. Raw offcut *count* turned out not to reliably separate
    # the two strategies on this real job (many sheets are simple/near-full either way and
    # tie exactly); the largest-offcut share of total offcut area does — verified on real
    # data before trusting this: balanced ~0.654, edge ~0.731 (higher = more consolidated).
    stock = default_stock_for(nesting_parts)
    balanced = nanxing_optimize(nesting_parts, stock, default_margin, spacing=6.0, waste_strategy="balanced")
    edge = nanxing_optimize(nesting_parts, stock, default_margin, spacing=6.0, waste_strategy="edge")

    def largest_offcut_fraction(result):
        total_area = sum(o.w * o.h for s in result.sheets for o in s.offcuts)
        if total_area <= 0:
            return 0.0
        largest_per_sheet = sum(max((o.w * o.h for o in s.offcuts), default=0.0) for s in result.sheets)
        return largest_per_sheet / total_area

    assert largest_offcut_fraction(edge) > largest_offcut_fraction(balanced)


# --- Issues/issues_001.md: grain="length" parts were placed with cutLength forced onto the
# board's *width*-derived axis regardless of grain, silently rejecting any such part whose
# cutLength exceeded the board's width even when it fit easily along the board's length axis.
# Confirmed backwards against real golden Nanxing machine data (WorkpieceId
# 26Y117T1F1B1_1001, Grain="L", CutLength=1323.4, placed with an X-span of ~1329mm on a
# 2440mm-length board, RotateAngle absent) before fixing _footprint() in both packer modules.

@pytest.mark.parametrize("mod", MODULES)
def test_footprint_length_grain_natural_pose_runs_cutlength_on_local_y(mod):
    # local x is the board.width-derived axis, local y is board.length-derived (see
    # place_parts_on_board: width=board.width-margins, height=board.length-margins).
    part = _part(cutLength=1323.4, cutWidth=556.4, grain="length")
    pw, ph = mod._footprint(part, rotated=False)
    assert (pw, ph) == (556.4, 1323.4)  # cutWidth on local x, cutLength on local y


@pytest.mark.parametrize("mod", MODULES)
def test_footprint_width_grain_natural_pose_unchanged(mod):
    part = _part(cutLength=1323.4, cutWidth=556.4, grain="width")
    pw, ph = mod._footprint(part, rotated=False)
    assert (pw, ph) == (1323.4, 556.4)  # cutLength on local x, cutWidth on local y — unchanged


@pytest.mark.parametrize("mod", MODULES)
def test_footprint_none_grain_unaffected_by_the_fix(mod):
    part = _part(cutLength=1323.4, cutWidth=556.4, grain="none")
    assert mod._footprint(part, rotated=False) == (1323.4, 556.4)
    assert mod._footprint(part, rotated=True) == (556.4, 1323.4)


def test_length_grain_part_too_wide_for_board_width_now_places_on_saw():
    # The exact real part from Issues/issues_001.md: cutLength=1323.4 exceeds a 2440x1220
    # board's usable width axis (1205mm after 5+10mm margins) but fits its usable length axis
    # (2430mm). Previously rejected outright since grain="length" disallows rotation and the
    # only orientation ever tried put cutLength on the width axis.
    part = _part(cutLength=1323.4, cutWidth=556.4, grain="length", id="X")
    stock = [StockBoard(material="MAT", length=2440, width=1220, thickness=18.0, grain="none")]
    margin = Margin(top=0, right=10, bottom=10, left=5)
    result = saw_optimize([part], stock, margin, kerf=4.0, allow_rotation=True)
    assert result.unplaced == []
    assert len(result.sheets) == 1
    placed = result.sheets[0].placed[0]
    assert placed.rotated is False  # natural pose, not an actual 90-degree turn
    assert (placed.w, placed.h) == (556.4, 1323.4)


def test_length_grain_part_too_wide_for_board_width_now_places_on_nanxing():
    part = _part(cutLength=1323.4, cutWidth=556.4, grain="length", id="X")
    stock = [StockBoard(material="MAT", length=2440, width=1220, thickness=18.0, grain="none")]
    margin = Margin(top=0, right=10, bottom=10, left=5)
    result = nanxing_optimize([part], stock, margin, spacing=6.0)
    assert result.unplaced == []
    assert len(result.sheets) == 1


def test_length_grain_part_still_rejected_if_it_exceeds_both_axes():
    # A part that's genuinely too big for the board in any orientation must still end up
    # unplaced — the fix only corrects which axis is tried, not whether the geometry check
    # itself is enforced.
    part = _part(cutLength=3000.0, cutWidth=556.4, grain="length", id="X")
    stock = [StockBoard(material="MAT", length=2440, width=1220, thickness=18.0, grain="none")]
    margin = Margin(top=0, right=10, bottom=10, left=5)
    result = saw_optimize([part], stock, margin, kerf=4.0, allow_rotation=True)
    assert len(result.unplaced) == 1
