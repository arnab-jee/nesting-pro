from __future__ import annotations

import pytest

from optimizer.import_xml import InvalidFccXmlError, parse_fcc_xml

from .conftest import XML_GOLDEN_DIR
from .test_xml_roundtrip import EMPTY_GOLDEN_FILE, NON_EMPTY_GOLDEN_FILES


@pytest.fixture(params=NON_EMPTY_GOLDEN_FILES)
def golden_xml_text(request) -> str:
    return (XML_GOLDEN_DIR / request.param).read_text(encoding="utf-8")


def test_parse_real_golden_file_produces_sheets_and_placed_parts(golden_xml_text):
    job = parse_fcc_xml(golden_xml_text)
    assert len(job.result.sheets) > 0
    assert job.result.unplaced == []
    assert job.result.cuts == []
    for sheet in job.result.sheets:
        assert len(sheet.placed) > 0
        assert 0 < sheet.utilizationPct <= 100


def test_parse_real_golden_file_recovers_margin_and_spacing(golden_xml_text):
    job = parse_fcc_xml(golden_xml_text)
    # every real sample uses a real, non-degenerate margin/spacing — a zeroed-out result here
    # would mean the Pattern attributes weren't actually being read
    assert job.margin.right > 0 or job.margin.left > 0
    assert job.tool_diameter > 0
    assert job.part_spacing > 0


def test_parse_real_golden_file_parts_by_id_matches_placed_parts(golden_xml_text):
    job = parse_fcc_xml(golden_xml_text)
    placed_ids = {p.partId for sheet in job.result.sheets for p in sheet.placed}
    assert placed_ids == set(job.parts_by_id.keys())


def test_parse_empty_golden_file_yields_zero_sheets_not_an_error():
    text = EMPTY_GOLDEN_FILE.read_text(encoding="utf-8")
    job = parse_fcc_xml(text)
    assert job.result.sheets == []
    assert job.margin.top == 0.0 and job.margin.left == 0.0


def test_parse_rejects_non_xml_content():
    with pytest.raises(InvalidFccXmlError):
        parse_fcc_xml("this is not xml at all")


def test_parse_rejects_xml_with_wrong_root_element():
    with pytest.raises(InvalidFccXmlError):
        parse_fcc_xml("<NotFccRoot></NotFccRoot>")


def test_parse_rejects_malformed_pattern_missing_required_attributes():
    # A <Pattern> missing its Margin attribute (real files always have one) should surface as a
    # clean InvalidFccXmlError, not an unhandled AttributeError from `.split(",")` on None.
    malformed = """<FccRoot><Patterns Name="MAT" Length="2440" Width="1220" Thickness="18">
        <Pattern ToolDiameter="6" WorkpieceSpace="6.1"><Workpieces></Workpieces></Pattern>
        </Patterns></FccRoot>"""
    with pytest.raises(InvalidFccXmlError):
        parse_fcc_xml(malformed)


def test_parse_accepts_bytes_as_well_as_str(golden_xml_text):
    job_from_str = parse_fcc_xml(golden_xml_text)
    job_from_bytes = parse_fcc_xml(golden_xml_text.encode("utf-8"))
    assert len(job_from_str.result.sheets) == len(job_from_bytes.result.sheets)
