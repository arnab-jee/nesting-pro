import type { Sheet } from "../types";

interface Props {
  sheets: Sheet[];
}

const CHART_HEIGHT = 140;
const BAR_WIDTH = 22;
const BAR_GAP = 8;

function colorFor(pct: number): string {
  if (pct >= 70) return "var(--success)";
  if (pct >= 40) return "var(--accent)";
  return "var(--warning)";
}

// One bar per physical sheet, in job order — deliberately not deduplicated the way the PDF's
// "Occurrences" view is (ROADMAP.md Phase 2: "so one bad sheet doesn't hide among a wall of
// individual SVG previews"), since the point here is to spot which *specific* sheet is
// underutilized, and a collapsed duplicate would hide that.
export function UtilizationChart({ sheets }: Props) {
  if (sheets.length === 0) return null;
  const svgWidth = sheets.length * (BAR_WIDTH + BAR_GAP) + BAR_GAP;

  return (
    <div className="card chart-card">
      <h3>Utilization by sheet</h3>
      <div className="chart-scroll">
        <svg width={svgWidth} height={CHART_HEIGHT + 36} className="utilization-chart">
          {sheets.map((sheet, i) => {
            const x = BAR_GAP + i * (BAR_WIDTH + BAR_GAP);
            const barHeight = (Math.max(0, Math.min(100, sheet.utilizationPct)) / 100) * CHART_HEIGHT;
            const y = CHART_HEIGHT - barHeight;
            return (
              <g key={sheet.index}>
                <title>
                  Sheet {sheet.index} — {sheet.material} — {sheet.utilizationPct.toFixed(1)}% used
                </title>
                <rect x={x} y={y} width={BAR_WIDTH} height={barHeight} rx={2} fill={colorFor(sheet.utilizationPct)} />
                <text x={x + BAR_WIDTH / 2} y={CHART_HEIGHT + 14} textAnchor="middle" className="chart-axis-label">
                  {sheet.index}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
