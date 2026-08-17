import { useState } from "react";
import { CutList } from "./CutList";
import type { CutInstruction, Margin, Sheet } from "../types";

interface Props {
  sheet: Sheet;
  cuts: CutInstruction[];
  margin: Margin;
  showCutLines: boolean;
}

// Sheet.boardW spans the placement X axis, Sheet.boardL spans Y — matches how
// backend/optimizer/guillotine.py and nanxing.py build free rectangles (width = board.width
// minus left/right margin, height = board.length minus top/bottom margin).
const LABEL_MIN_SIZE = 80;
const FONT_SIZE = 24;

// CutInstruction.offset already has margin.left/.top baked in (backend's build_cuts_for_sheet
// adds it when the instruction is built) — but .length is only a span, not an end coordinate,
// so the missing start point along the other axis has to come from margin here. Mirrors
// backend/optimizer/export/pdf.py's _cut_line_bounds exactly (same data, same gap to fill).
function cutLineBounds(cut: CutInstruction, margin: Margin): [number, number, number, number] {
  if (cut.orientation === "vertical") {
    return [cut.offset, margin.top, cut.offset, margin.top + cut.length];
  }
  return [margin.left, cut.offset, margin.left + cut.length, cut.offset];
}

export function SheetPreview({ sheet, cuts, margin, showCutLines }: Props) {
  // Local disclosure state (expand/collapse the cut list) is independent of the global "Show
  // cut lines" setting (Issues/issues_003.md — the drawn overlay confused operators on some
  // layouts, so it's toggleable, default on): the numbered list can still be opened either way,
  // but the drawn SVG lines only ever appear when both are true.
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="card sheet-preview">
      <div className="sheet-preview__header">
        <h3>
          Sheet {sheet.index} <span className="sheet-preview__material">— {sheet.material} ({sheet.thickness}mm)</span>
        </h3>
        <span className="badge">{sheet.utilizationPct.toFixed(1)}% used</span>
      </div>
      <svg viewBox={`0 0 ${sheet.boardW} ${sheet.boardL}`} className="sheet-svg">
        <rect x={0} y={0} width={sheet.boardW} height={sheet.boardL} className="board-outline" />
        {sheet.offcuts.map((o, i) => (
          <rect key={`offcut-${i}`} x={o.x} y={o.y} width={o.w} height={o.h} className="offcut" />
        ))}
        {sheet.placed.map((p) => (
          <g key={p.partId}>
            <rect x={p.x} y={p.y} width={p.w} height={p.h} className="placed-part" />
            {p.w >= LABEL_MIN_SIZE && p.h >= LABEL_MIN_SIZE && (
              <text x={p.x + p.w / 2} y={p.y + p.h / 2} className="part-label" fontSize={FONT_SIZE} textAnchor="middle">
                <tspan x={p.x + p.w / 2} dy="-0.6em">
                  {p.partId}
                </tspan>
                <tspan x={p.x + p.w / 2} dy="1.2em">
                  {Math.round(p.w)}×{Math.round(p.h)}
                </tspan>
              </text>
            )}
          </g>
        ))}
        {showCutLines &&
          expanded &&
          cuts.map((c, i) => {
            const [x1, y1, x2, y2] = cutLineBounds(c, margin);
            return <line key={`cut-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} className="cut-line" />;
          })}
      </svg>
      <CutList cuts={cuts} open={expanded} onToggle={setExpanded} />
    </div>
  );
}
