from __future__ import annotations
from io import BytesIO

from pypdf import PdfReader

from optimizer.export.pdf import (
    _color_for_index,
    _cutting_list,
    _deduplicate_layouts,
    _grain_direction_is_vertical,
    _nominal_dims,
    _sheet_signature,
    _sidebar_bottom_boxes,
    render_layout_pdf,
)
from optimizer.guillotine import optimize as saw_optimize
from optimizer.model import Margin, OptResult, PlacedPart, Sheet

from .helpers import default_stock_for


def _saw_result(saw_parts, default_margin):
    stock = default_stock_for(saw_parts)
    return saw_optimize(saw_parts, stock, default_margin, kerf=4.0, allow_rotation=True)


def _sheet(index=1, placed=None, boardL=2440.0, boardW=1220.0, material="MAT", thickness=18.0) -> Sheet:
    return Sheet(
        index=index, material=material, boardL=boardL, boardW=boardW, thickness=thickness,
        placed=placed or [], offcuts=[], utilizationPct=50.0,
    )


def _part(name="P", x=0.0, y=0.0, w=100.0, h=200.0, rotated=False, grain="none") -> PlacedPart:
    return PlacedPart(partId=name, x=x, y=y, rotated=rotated, w=w, h=h, name=name, material="MAT", thickness=18.0, grain=grain)


def test_renders_one_page_per_unique_layout(saw_parts, default_margin):
    result = _saw_result(saw_parts, default_margin)
    pdf_bytes = render_layout_pdf(result)
    reader = PdfReader(BytesIO(pdf_bytes))
    layouts = _deduplicate_layouts(result.sheets)
    assert len(reader.pages) == len(layouts)


def test_page_text_includes_header_and_stats(saw_parts, default_margin):
    result = _saw_result(saw_parts, default_margin)
    pdf_bytes = render_layout_pdf(result)
    reader = PdfReader(BytesIO(pdf_bytes))
    first_sheet = result.sheets[0]
    text = reader.pages[0].extract_text()
    assert "Job Layout" in text
    assert "Cutting List" in text
    assert "Occurrences" in text
    assert "Grain Direction" in text
    assert first_sheet.material in text
    assert "Job Sheets :" in text
    assert "Sheet Cut Length :" in text


def test_empty_result_renders_zero_pages():
    pdf_bytes = render_layout_pdf(OptResult(sheets=[], unplaced=[]))
    reader = PdfReader(BytesIO(pdf_bytes))
    assert len(reader.pages) == 0
    assert pdf_bytes.startswith(b"%PDF")


def test_identical_sheets_deduplicate_with_occurrence_count():
    part_a = _part(name="A", x=0, y=0, w=100, h=200)
    sheet1 = _sheet(index=1, placed=[part_a])
    sheet2 = _sheet(index=2, placed=[_part(name="A", x=0, y=0, w=100, h=200)])
    sheet3 = _sheet(index=3, placed=[_part(name="B", x=0, y=0, w=50, h=50)])
    layouts = _deduplicate_layouts([sheet1, sheet2, sheet3])
    assert len(layouts) == 2
    (rep1, occ1), (rep2, occ2) = layouts
    assert rep1.index == 1 and occ1 == 2
    assert rep2.index == 3 and occ2 == 1


def test_sheet_signature_ignores_which_physical_sheet_it_is():
    sheet1 = _sheet(index=1, placed=[_part(name="A", x=1.0, y=2.0, w=100.0, h=200.0)])
    sheet2 = _sheet(index=99, placed=[_part(name="A", x=1.0, y=2.0, w=100.0, h=200.0)])
    assert _sheet_signature(sheet1) == _sheet_signature(sheet2)


def test_cutting_list_groups_by_name_and_nominal_dims_with_running_symbols():
    # Two instances of the same (name, dims) group share symbol 1; a same-named part with
    # different dimensions gets its own symbol, matching the reference's per-(name,dims) grouping.
    sheet = _sheet(placed=[
        _part(name="SHUTTER", x=0, y=0, w=100.0, h=200.0, rotated=False),
        _part(name="SHUTTER", x=100, y=0, w=100.0, h=200.0, rotated=False),
        _part(name="SHUTTER", x=200, y=0, w=50.0, h=80.0, rotated=False),
    ])
    rows, symbol_by_index = _cutting_list(sheet)
    assert symbol_by_index[0] == symbol_by_index[1]
    assert symbol_by_index[2] != symbol_by_index[0]
    assert {r["symbol"]: r["qty"] for r in rows} == {symbol_by_index[0]: 2, symbol_by_index[2]: 1}


def test_cutting_list_uses_nominal_dims_not_rotated_footprint():
    # A part placed rotated has w/h swapped from its nominal cutLength/cutWidth; the cutting
    # list must report the nominal (pre-rotation) Length/Width, matching the reference's
    # cutting-list values which stay constant regardless of how a part landed on the sheet.
    sheet = _sheet(placed=[_part(name="X", w=200.0, h=100.0, rotated=True)])
    rows, _ = _cutting_list(sheet)
    assert rows[0]["length"] == 100.0
    assert rows[0]["width"] == 200.0


def test_nominal_dims_recovers_length_grain_natural_pose():
    # Issues/issues_001.md fix: a grain="length" part's natural (rotated=False) pose has
    # cutWidth on local x (w) and cutLength on local y (h) — the opposite pairing from
    # grain="none"/"width" parts. _nominal_dims must be grain-aware to still recover the true
    # (cutLength, cutWidth) for the cutting list / edge-dimension labels.
    part = _part(name="X", w=556.4, h=1323.4, rotated=False, grain="length")
    length, width = _nominal_dims(part)
    assert (length, width) == (1323.4, 556.4)


def test_nominal_dims_unaffected_for_width_and_none_grain():
    for grain in ("width", "none"):
        part = _part(name="X", w=1323.4, h=556.4, rotated=False, grain=grain)
        assert _nominal_dims(part) == (1323.4, 556.4)


def test_grain_direction_mapping():
    # Confirmed with the project owner: length-grain -> vertical arrow (board.length draws
    # vertically in this layout), width-grain -> horizontal, none -> no arrow at all.
    assert _grain_direction_is_vertical("length") is True
    assert _grain_direction_is_vertical("width") is False
    assert _grain_direction_is_vertical("none") is None


def test_sidebar_bottom_boxes_stay_above_the_footer_strip():
    # Regression: the Grain Direction / Occurrences boxes originally extended down to the page
    # frame's bottom edge instead of stopping at the footer strip's top divider, so they visually
    # overlapped the footer text. Both boxes must sit entirely at or above footer_y1.
    footer_y1 = 62.35
    content_y1 = 813.54
    grain_top, occ_bottom, occ_top = _sidebar_bottom_boxes(footer_y1, content_y1)
    assert grain_top > footer_y1
    assert occ_bottom == grain_top
    assert occ_top > occ_bottom
    assert occ_top <= content_y1


def test_color_cycles_through_palette_by_placement_order():
    colors = [_color_for_index(i) for i in range(16)]
    assert len(set(colors)) == 16
    assert _color_for_index(0) == _color_for_index(16)
