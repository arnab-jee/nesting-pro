from __future__ import annotations
from io import BytesIO
from typing import Optional

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen.canvas import Canvas

from ..model import OptResult


def render_layout_pdf(result: OptResult, output_path: str | None = None) -> bytes:
    buffer = BytesIO()
    canvas = Canvas(buffer, pagesize=A4)
    width, height = A4
    margin = 20 * mm
    for sheet in result.sheets:
        canvas.setFont("Helvetica", 10)
        canvas.drawString(margin, height - margin, f"Sheet {sheet.index} — material={sheet.material} thickness={sheet.thickness}mm")
        page_width = width - 2 * margin
        page_height = height - 2 * margin - 40
        scale = min(page_width / sheet.boardW, page_height / sheet.boardL, 1.0)
        origin_x = margin
        origin_y = margin
        canvas.setStrokeColorRGB(0, 0, 0)
        canvas.rect(origin_x, origin_y, sheet.boardW * scale, sheet.boardL * scale)
        for placed in sheet.placed:
            x = origin_x + placed.x * scale
            y = origin_y + placed.y * scale
            w = placed.w * scale
            h = placed.h * scale
            canvas.setStrokeColorRGB(0.2, 0.2, 0.7)
            canvas.setFillColorRGB(0.85, 0.9, 1.0)
            canvas.rect(x, y, w, h, fill=1)
            canvas.setFillColorRGB(0, 0, 0)
            canvas.drawString(x + 2, y + h - 10, placed.partId)
        canvas.drawString(margin, origin_y + 10, f"Utilization: {sheet.utilizationPct:.1f}%")
        canvas.showPage()
    canvas.save()
    content = buffer.getvalue()
    if output_path:
        with open(output_path, "wb") as f:
            f.write(content)
    return content
