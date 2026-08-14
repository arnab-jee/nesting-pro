from __future__ import annotations
from pathlib import Path

from lxml import etree

from optimizer.model import Margin, Offcut, OptResult, Part, PlacedPart, Sheet

GRAIN_CODE_TO_PART_GRAIN = {"N": "none", "L": "length", "W": "width"}


def _bounds(points_el) -> tuple[float, float, float, float]:
    xs = [float(p.get("X")) for p in points_el.findall("Point")]
    ys = [float(p.get("Y")) for p in points_el.findall("Point")]
    return min(xs), min(ys), max(xs), max(ys)


def load_golden_fcc(path: Path):
    """Parse a real machine-cut FccRoot XML directly into exporter inputs (parts_by_id,
    OptResult, margin, tool_diameter, part_spacing), bypassing the optimizer entirely.
    This exists purely to drive the round-trip fidelity test (spec §7.1): the geometry
    and metadata come straight from the golden file, so feeding them back into
    generate_fcc_xml tests the *serializer*, not the nesting algorithm.
    """
    root = etree.parse(str(path)).getroot()

    parts: list[Part] = []
    sheets: list[Sheet] = []
    margin: Margin | None = None
    tool_diameter = 6.0
    part_spacing = 6.1
    sheet_index = 1

    for patterns_el in root.findall("Patterns"):
        material = patterns_el.get("Name")
        board_length = float(patterns_el.get("Length"))
        board_width = float(patterns_el.get("Width"))
        thickness = float(patterns_el.get("Thickness"))

        for pattern_el in patterns_el.findall("Pattern"):
            tool_diameter = float(pattern_el.get("ToolDiameter"))
            part_spacing = float(pattern_el.get("WorkpieceSpace"))
            top, right, bottom, left = (float(v) for v in pattern_el.get("Margin").split(","))
            margin = Margin(top=top, right=right, bottom=bottom, left=left)

            placed_parts: list[PlacedPart] = []
            for wp in pattern_el.findall("Workpieces/Workpiece"):
                edges = {
                    "l1": wp.get("EBL1", ""),
                    "l2": wp.get("EBL2", ""),
                    "w1": wp.get("EBW1", ""),
                    "w2": wp.get("EBW2", ""),
                }
                part = Part(
                    id=wp.get("WorkpieceId"),
                    posId=wp.get("ProdutionNo"),
                    name=wp.get("Name"),
                    cutLength=float(wp.get("CutLength")),
                    cutWidth=float(wp.get("CutWidth")),
                    finishedLength=float(wp.get("Length")),
                    finishedWidth=float(wp.get("Width")),
                    thickness=float(wp.get("Thickness")),
                    qty=1,
                    material=wp.get("Material"),
                    grain=GRAIN_CODE_TO_PART_GRAIN.get(wp.get("Grain"), "none"),
                    edges=edges,
                    customer=wp.get("Customer") or None,
                )
                parts.append(part)

                lineament_el = wp.find("Lineament")
                minx, miny, maxx, maxy = _bounds(lineament_el.find("Points"))
                # Lineament spans the tool-path envelope (cut rect inflated by ProOffset on
                # each side, see optimizer/export/xml.py) — deflate back to the true cut rect.
                # The XML's X/Y follow the machine's own convention (X=board length axis,
                # Y=board width axis); PlacedPart.x/y follow the packer's convention (x=width
                # axis, y=length axis) — the opposite — so this is transposed on the way in,
                # mirroring the transpose optimizer/export/xml.py applies on the way out.
                offset_x = float(lineament_el.get("ProOffsetX", 3.0))
                offset_y = float(lineament_el.get("ProOffsetY", 3.0))
                placed_parts.append(
                    PlacedPart(
                        partId=part.id,
                        x=miny + offset_y,
                        y=minx + offset_x,
                        rotated=wp.get("RotateAngle") == "90",
                        w=(maxy - miny) - 2 * offset_y,
                        h=(maxx - minx) - 2 * offset_x,
                        name=part.name,
                        material=part.material,
                        thickness=part.thickness,
                        grain=part.grain,
                    )
                )

            offcuts: list[Offcut] = []
            for odd in pattern_el.findall("OddmentsList/Oddments"):
                minx, miny, maxx, maxy = _bounds(odd.find("Lineament/Points"))
                offcuts.append(Offcut(x=miny, y=minx, w=maxy - miny, h=maxx - minx))

            sheets.append(
                Sheet(
                    index=sheet_index,
                    material=material,
                    boardL=board_length,
                    boardW=board_width,
                    thickness=thickness,
                    placed=placed_parts,
                    offcuts=offcuts,
                    utilizationPct=0.0,
                )
            )
            sheet_index += 1

    assert margin is not None, f"{path} had no Pattern elements to import"
    parts_by_id = {p.id: p for p in parts}
    result = OptResult(sheets=sheets, unplaced=[])
    return parts_by_id, result, margin, tool_diameter, part_spacing
