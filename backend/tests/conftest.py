from __future__ import annotations
from pathlib import Path

import pytest

from optimizer.model import Margin
from optimizer.parser import parse_csv_text

SAMPLE_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "sample_data"
CSV_SAMPLE_DIR = SAMPLE_DATA_DIR / "CSV Files from IMOS"
XML_GOLDEN_DIR = SAMPLE_DATA_DIR / "XML Data for Nanxing Nesting Machine"


def _read_sample(name: str) -> str:
    return (CSV_SAMPLE_DIR / name).read_text(encoding="utf-8-sig")


@pytest.fixture
def saw_csv_text() -> str:
    return _read_sample("panel_saw_machine_data.csv")


@pytest.fixture
def nesting_csv_text() -> str:
    return _read_sample("nesting_machine_data.csv")


@pytest.fixture
def default_margin() -> Margin:
    return Margin(top=0, right=10, bottom=10, left=5)


@pytest.fixture
def saw_parts(saw_csv_text):
    parts, errors = parse_csv_text(saw_csv_text)
    assert errors == []
    return parts


@pytest.fixture
def nesting_parts(nesting_csv_text):
    parts, errors = parse_csv_text(nesting_csv_text)
    assert errors == []
    return parts
