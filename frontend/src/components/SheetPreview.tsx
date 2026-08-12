import type { Sheet } from "../types";

interface Props {
  sheet: Sheet;
}

// Sheet.boardW spans the placement X axis, Sheet.boardL spans Y — matches how
// backend/optimizer/guillotine.py and nanxing.py build free rectangles (width = board.width
// minus left/right margin, height = board.length minus top/bottom margin).
const LABEL_MIN_SIZE = 80;
const FONT_SIZE = 24;

export function SheetPreview({ sheet }: Props) {
  return (
    <div className="sheet-preview">
      <h3>
        Sheet {sheet.index} — {sheet.material} ({sheet.thickness}mm) — {sheet.utilizationPct.toFixed(1)}% used
      </h3>
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
      </svg>
    </div>
  );
}
