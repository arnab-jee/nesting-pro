from __future__ import annotations

from fastapi.testclient import TestClient

import api

from .conftest import XML_GOLDEN_DIR
from .test_xml_roundtrip import NON_EMPTY_GOLDEN_FILES

client = TestClient(api.app)


def test_import_xml_real_golden_file_returns_sheets():
    xml_text = (XML_GOLDEN_DIR / NON_EMPTY_GOLDEN_FILES[0]).read_text(encoding="utf-8")
    resp = client.post("/import/xml", json={"xml_text": xml_text})
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["sheets"]) > 0
    assert body["unplaced"] == []
    assert body["cuts"] == []
    assert "margin" in body and set(body["margin"].keys()) == {"top", "right", "bottom", "left"}
    assert body["toolDiameter"] > 0
    assert body["partSpacing"] > 0
    assert len(body["stock"]) > 0
    first_stock = body["stock"][0]
    assert {"material", "length", "width", "thickness", "grain"} <= set(first_stock.keys())


def test_import_xml_derives_stock_matching_sheet_materials():
    xml_text = (XML_GOLDEN_DIR / NON_EMPTY_GOLDEN_FILES[0]).read_text(encoding="utf-8")
    body = client.post("/import/xml", json={"xml_text": xml_text}).json()
    sheet_keys = {(s["material"], s["thickness"]) for s in body["sheets"]}
    stock_keys = {(b["material"], b["thickness"]) for b in body["stock"]}
    assert sheet_keys == stock_keys


def test_import_xml_rejects_invalid_content():
    resp = client.post("/import/xml", json={"xml_text": "not xml at all"})
    assert resp.status_code == 400
    assert resp.json()["detail"]


def test_import_xml_rejects_wrong_root_element():
    resp = client.post("/import/xml", json={"xml_text": "<NotFccRoot></NotFccRoot>"})
    assert resp.status_code == 400
