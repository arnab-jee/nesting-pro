from __future__ import annotations
from dataclasses import asdict
from typing import Iterator

import sqlite3

from fastapi import Body, Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse, Response

import storage
from optimizer.export.pdf import render_layout_pdf
from optimizer.export.xml import generate_fcc_xml
from optimizer.guillotine import optimize as saw_optimize
from optimizer.model import Margin, OptRequest, OptResult, Part, StockBoard
from optimizer.nanxing import optimize as nanxing_optimize
from optimizer.parser import parse_csv_text

app = FastAPI(title="Nesting Pro Backend")


def get_db() -> Iterator[sqlite3.Connection]:
    conn = storage.get_connection()
    try:
        yield conn
    finally:
        conn.close()


@app.get("/stock-boards")
def list_stock_boards(db: sqlite3.Connection = Depends(get_db)) -> list[dict]:
    return [asdict(b) for b in storage.list_stock_boards(db)]


@app.post("/stock-boards")
def create_stock_board(payload: dict = Body(...), db: sqlite3.Connection = Depends(get_db)) -> dict:
    try:
        board = storage.create_stock_board(
            db,
            material=payload["material"],
            length=float(payload["length"]),
            width=float(payload["width"]),
            thickness=float(payload["thickness"]),
            grain=payload.get("grain", "none"),
        )
    except (KeyError, ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail=[str(exc)])
    return asdict(board)


@app.put("/stock-boards/{board_id}")
def update_stock_board(board_id: int, payload: dict = Body(...), db: sqlite3.Connection = Depends(get_db)) -> dict:
    try:
        board = storage.update_stock_board(
            db,
            board_id,
            material=payload["material"],
            length=float(payload["length"]),
            width=float(payload["width"]),
            thickness=float(payload["thickness"]),
            grain=payload.get("grain", "none"),
        )
    except (KeyError, ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail=[str(exc)])
    if board is None:
        raise HTTPException(status_code=404, detail=[f"stock board {board_id} not found"])
    return asdict(board)


@app.delete("/stock-boards/{board_id}")
def delete_stock_board(board_id: int, db: sqlite3.Connection = Depends(get_db)) -> dict:
    if not storage.delete_stock_board(db, board_id):
        raise HTTPException(status_code=404, detail=[f"stock board {board_id} not found"])
    return {"deleted": True}


@app.get("/settings")
def get_settings(db: sqlite3.Connection = Depends(get_db)) -> dict:
    return {"wasteStrategyDefault": storage.get_waste_strategy_default(db)}


@app.put("/settings")
def update_settings(payload: dict = Body(...), db: sqlite3.Connection = Depends(get_db)) -> dict:
    result = {}
    if "wasteStrategyDefault" in payload:
        try:
            result["wasteStrategyDefault"] = storage.set_waste_strategy_default(db, payload["wasteStrategyDefault"])
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=[str(exc)])
    return result

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
        waste_strategy = request.get("wasteStrategy", "balanced")
        if request.get("target") == "saw":
            result = saw_optimize(parts, stock, margin, kerf=request.get("kerf", 0.0), allow_rotation=request.get("allowRotation", True), waste_strategy=waste_strategy)
        else:
            result = nanxing_optimize(parts, stock, margin, spacing=request.get("partSpacing", request.get("toolDiameter", 6.0)), waste_strategy=waste_strategy)
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
        waste_strategy = request.get("wasteStrategy", "balanced")
        if request.get("target") == "saw":
            result = saw_optimize(parts, stock, margin, kerf=request.get("kerf", 0.0), allow_rotation=request.get("allowRotation", True), waste_strategy=waste_strategy)
        else:
            result = nanxing_optimize(parts, stock, margin, spacing=request.get("partSpacing", request.get("toolDiameter", 6.0)), waste_strategy=waste_strategy)
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
        result = nanxing_optimize(parts, stock, margin, spacing=request.get("partSpacing", request.get("toolDiameter", 6.0)), waste_strategy=request.get("wasteStrategy", "balanced"))
        parts_by_id = {part.id: part for part in parts}
        xml_data = generate_fcc_xml(
            result,
            parts_by_id,
            margin,
            tool_diameter=request.get("toolDiameter", 6.0),
            part_spacing=request.get("partSpacing", 6.0),
        )
        return Response(content=xml_data, media_type="application/xml")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=[str(exc)])
