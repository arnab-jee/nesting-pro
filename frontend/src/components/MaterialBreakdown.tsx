import type { Sheet } from "../types";

interface Props {
  sheets: Sheet[];
}

interface Row {
  material: string;
  sheetCount: number;
  avgUtilizationPct: number;
  avgWastePct: number;
}

function buildRows(sheets: Sheet[]): Row[] {
  const byMaterial = new Map<string, Sheet[]>();
  for (const sheet of sheets) {
    const group = byMaterial.get(sheet.material) ?? [];
    group.push(sheet);
    byMaterial.set(sheet.material, group);
  }
  const rows: Row[] = [];
  for (const [material, group] of byMaterial) {
    const avgUtilizationPct = group.reduce((sum, s) => sum + s.utilizationPct, 0) / group.length;
    rows.push({ material, sheetCount: group.length, avgUtilizationPct, avgWastePct: 100 - avgUtilizationPct });
  }
  // Worst-waste-first: the material most worth a shop owner's attention leads.
  return rows.sort((a, b) => b.avgWastePct - a.avgWastePct);
}

// Only meaningful once a job spans more than one material (the reported job had 5) — a
// single-material job would just repeat the "Avg. utilization" stat card, so it's skipped then.
export function MaterialBreakdown({ sheets }: Props) {
  const rows = buildRows(sheets);
  if (rows.length < 2) return null;

  return (
    <div className="card chart-card">
      <h3>Waste by material</h3>
      <div className="material-breakdown">
        {rows.map((row) => (
          <div className="material-row" key={row.material}>
            <span className="material-row__label" title={row.material}>
              {row.material}
            </span>
            <div className="material-row__bar-track">
              <div className="material-row__bar" style={{ width: `${Math.min(100, row.avgWastePct)}%` }} />
            </div>
            <span className="material-row__value">{row.avgWastePct.toFixed(1)}% waste</span>
            <span className="material-row__count">
              {row.sheetCount} sheet{row.sheetCount === 1 ? "" : "s"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
