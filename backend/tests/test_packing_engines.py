from __future__ import annotations

import pytest

import optimizer.guillotine as guillotine_module
import optimizer.nanxing as nanxing_module
from optimizer import nanxing_packing, saw_packing
from optimizer.guillotine import optimize as saw_optimize
from optimizer.nanxing import optimize as nanxing_optimize

from .helpers import default_stock_for, is_guillotine_cuttable, overlapping_pairs

MODULES = [saw_packing, nanxing_packing]


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
