from __future__ import annotations
from typing import Optional

from lxml import etree

from ..model import OptResult


def generate_fcc_xml(result: OptResult, tool_diameter: float, part_spacing: float) -> bytes:
    root = etree.Element("FCC")
    root.set("version", "1.0")
    for sheet in result.sheets:
        sheet_el = etree.SubElement(root, "Sheet")
        sheet_el.set("index", str(sheet.index))
        sheet_el.set("material", sheet.material)
        sheet_el.set("thickness", str(sheet.thickness))
        sheet_el.set("boardLength", str(sheet.boardL))
        sheet_el.set("boardWidth", str(sheet.boardW))
        sheet_el.set("toolDiameter", str(tool_diameter))
        sheet_el.set("partSpacing", str(part_spacing))
        parts_el = etree.SubElement(sheet_el, "Parts")
        for placed in sheet.placed:
            part_el = etree.SubElement(parts_el, "Part")
            part_el.set("id", placed.partId)
            part_el.set("name", placed.name or placed.partId)
            part_el.set("x", str(placed.x))
            part_el.set("y", str(placed.y))
            part_el.set("width", str(placed.w))
            part_el.set("height", str(placed.h))
            part_el.set("rotated", str(placed.rotated).lower())
        offcuts_el = etree.SubElement(sheet_el, "Offcuts")
        for offcut in sheet.offcuts:
            off_el = etree.SubElement(offcuts_el, "Offcut")
            off_el.set("x", str(offcut.x))
            off_el.set("y", str(offcut.y))
            off_el.set("width", str(offcut.w))
            off_el.set("height", str(offcut.h))
    return etree.tostring(root, pretty_print=True, xml_declaration=True, encoding="UTF-8")
