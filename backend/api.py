from __future__ import annotations
from fastapi import Body, FastAPI, HTTPException
from fastapi.responses import FileResponse, Response

from optimizer.export.pdf import render_layout_pdf
from optimizer.export.xml import generate_fcc_xml
from optimizer.guillotine import optimize as saw_optimize
from optimizer.model import Margin, OptRequest, OptResult, Part, StockBoard
from optimizer.nanxing import optimize as nanxing_optimize
from optimizer.parser import parse_csv_text

app = FastAPI(title="Nesting Pro Backend")

@app.post("/parse")
def parse_csv(csv_text: str = Body(..., embed=True)) -> dict:
    parts, errors = parse_csv_text(csv_text)
    if errors:
        raise HTTPException(status_code=400, detail=errors)
    return {"parts": [part.__dict__ for part in parts]}

@app.post("/optimize")
def optimize_route(request: dict = Body(...)) -> dict:
    try:
        margin = Margin(**request.get("margin", {}))
        stock = [StockBoard(**s) for s in request.get("stock", [])]
        parts = [Part(**part) for part in request.get("parts", [])]
        if request.get("target") == "saw":
            result = saw_optimize(parts, stock, margin, kerf=request.get("kerf", 0.0), allow_rotation=request.get("allowRotation", True))
        else:
            result = nanxing_optimize(parts, stock, margin, spacing=request.get("partSpacing", request.get("toolDiameter", 6.0)))
        return {
            "sheets": [
                {
                    "index": sheet.index,
                    "material": sheet.material,
                    "boardL": sheet.boardL,
                    "boardW": sheet.boardW,
                    "thickness": sheet.thickness,
                    "utilizationPct": sheet.utilizationPct,
                    "placed": [p.__dict__ for p in sheet.placed],
                    "offcuts": [o.__dict__ for o in sheet.offcuts],
                }
                for sheet in result.sheets
            ],
            "unplaced": [part.__dict__ for part in result.unplaced],
            "cuts": [cut.__dict__ for cut in result.cuts],
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=[str(exc)])

@app.post("/export/pdf")
def export_pdf(request: dict = Body(...)) -> Response:
    try:
        margin = Margin(**request.get("margin", {}))
        stock = [StockBoard(**s) for s in request.get("stock", [])]
        parts = [Part(**part) for part in request.get("parts", [])]
        if request.get("target") == "saw":
            result = saw_optimize(parts, stock, margin, kerf=request.get("kerf", 0.0), allow_rotation=request.get("allowRotation", True))
        else:
            result = nanxing_optimize(parts, stock, margin, spacing=request.get("partSpacing", request.get("toolDiameter", 6.0)))
        pdf_data = render_layout_pdf(result)
        return Response(content=pdf_data, media_type="application/pdf")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=[str(exc)])

@app.post("/export/xml")
def export_xml(request: dict = Body(...)) -> Response:
    try:
        margin = Margin(**request.get("margin", {}))
        stock = [StockBoard(**s) for s in request.get("stock", [])]
        parts = [Part(**part) for part in request.get("parts", [])]
        result = nanxing_optimize(parts, stock, margin, spacing=request.get("partSpacing", request.get("toolDiameter", 6.0)))
        xml_data = generate_fcc_xml(result, tool_diameter=request.get("toolDiameter", 6.0), part_spacing=request.get("partSpacing", 6.0))
        return Response(content=xml_data, media_type="application/xml")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=[str(exc)])
