import { useCallback } from "react";
import { SortableTh } from "./SortableTh";
import { CURRENCY, hasCostData, totalMaterialCost, totalWasteCost } from "../costUtils";
import { useTableControls } from "../hooks/useTableControls";
import type { Margin, OptResult, Part, StockBoardWithCost } from "../types";

interface Props {
  result: OptResult;
  stock: StockBoardWithCost[];
  margin: Margin;
  allowRotation: boolean;
}

const UNPLACED_SORTERS: Record<string, (a: Part, b: Part) => number> = {
  id: (a, b) => a.id.localeCompare(b.id),
  material: (a, b) => a.material.localeCompare(b.material),
  cutLength: (a, b) => a.cutLength - b.cutLength,
};

// The backend's OptResult carries the unplaced Part but no reason string (see the M7 plan) —
// approximate one client-side by comparing against the matching stock board. This mirrors
// optimizer/saw_packing.py's and optimizer/nanxing_packing.py's _footprint() (fixed in M10,
// see CLAUDE.md / Issues/issues_001.md): a part's *natural* (non-rotated) pose depends on
// grain, not just on which of cutLength/cutWidth is larger — grain="length" parts place with
// cutLength along the board's length-derived axis by default (not the width axis), the
// opposite of grain="none"/"width" parts. The previous version of this function compared
// cutLength/cutWidth against the wrong axis pair for every grain and never considered margins
// or the allowRotation toggle, so it could report "did not fit alongside the rest of the job"
// for a part that was actually geometrically too large, or vice versa.
function unplacedReason(part: Part, stock: StockBoardWithCost[], margin: Margin, allowRotation: boolean): string {
  const board = stock.find((b) => b.material === part.material && b.thickness === part.thickness);
  if (!board) return "no matching stock board configured for this material/thickness";

  const usableWidth = board.width - margin.left - margin.right;
  const usableLength = board.length - margin.top - margin.bottom;

  const naturalSwap = part.grain === "length";
  const naturalPw = naturalSwap ? part.cutWidth : part.cutLength;
  const naturalPh = naturalSwap ? part.cutLength : part.cutWidth;
  const fitsNatural = naturalPw <= usableWidth && naturalPh <= usableLength;

  const canRotate = part.grain === "none" && allowRotation;
  const fitsRotated = canRotate && naturalPh <= usableWidth && naturalPw <= usableLength;

  if (!fitsNatural && !fitsRotated) {
    return `larger than the board's usable ${usableWidth.toFixed(1)}×${usableLength.toFixed(1)}mm area after margins, in any orientation its grain allows`;
  }
  return "did not fit alongside the rest of the job";
}

export function Summary({ result, stock, margin, allowRotation }: Props) {
  const avgUtilization =
    result.sheets.length > 0
      ? result.sheets.reduce((sum, s) => sum + s.utilizationPct, 0) / result.sheets.length
      : 0;
  const panelsCut = result.sheets.reduce((sum, s) => sum + s.placed.length, 0);
  const showCost = hasCostData(stock);
  const materialCost = showCost ? totalMaterialCost(result.sheets, stock) : 0;
  const wasteCost = showCost ? totalWasteCost(result.sheets, stock) : 0;

  const searchUnplaced = useCallback((p: Part) => `${p.id} ${p.material}`, []);
  const unplacedTable = useTableControls(result.unplaced, { searchText: searchUnplaced, sorters: UNPLACED_SORTERS });

  return (
    <div className="card summary">
      <h2>Summary</h2>
      <div className="stat-row">
        <div className="stat-card">
          <span className="stat-card__value">{result.sheets.length}</span>
          <span className="stat-card__label">Sheets</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__value">{avgUtilization.toFixed(1)}%</span>
          <span className="stat-card__label">Avg. utilization</span>
        </div>
        <div className={`stat-card ${result.unplaced.length > 0 ? "stat-card--warn" : "stat-card--ok"}`}>
          <span className="stat-card__value">{result.unplaced.length}</span>
          <span className="stat-card__label">Unplaced parts</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__value">{panelsCut}</span>
          <span className="stat-card__label">Panels/Parts cut</span>
        </div>
      </div>
      {showCost && (
        <div className="stat-row stat-row--cost">
          <div className="stat-card">
            <span className="stat-card__value">{CURRENCY}{materialCost.toFixed(2)}</span>
            <span className="stat-card__label">Material cost</span>
          </div>
          <div className="stat-card stat-card--warn">
            <span className="stat-card__value">{CURRENCY}{wasteCost.toFixed(2)}</span>
            <span className="stat-card__label">Est. waste cost</span>
          </div>
        </div>
      )}
      {result.unplaced.length > 0 && (
        <>
          <label className="field table-search">
            <span className="field__label">Search unplaced parts</span>
            <input
              type="text"
              placeholder="Barcode or material…"
              value={unplacedTable.query}
              onChange={(e) => unplacedTable.setQuery(e.target.value)}
            />
          </label>
          <div className="table-scroll">
            <table className="unplaced-table">
              <thead>
                <tr>
                  <SortableTh label="Barcode" sortKey="id" activeKey={unplacedTable.sortKey} dir={unplacedTable.sortDir} onSort={unplacedTable.toggleSort} />
                  <SortableTh label="Material" sortKey="material" activeKey={unplacedTable.sortKey} dir={unplacedTable.sortDir} onSort={unplacedTable.toggleSort} />
                  <SortableTh label="Cut size" sortKey="cutLength" activeKey={unplacedTable.sortKey} dir={unplacedTable.sortDir} onSort={unplacedTable.toggleSort} />
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {unplacedTable.rows.map((p) => (
                  <tr key={p.id}>
                    <td>{p.id}</td>
                    <td>{p.material}</td>
                    <td>
                      {p.cutLength}×{p.cutWidth}
                    </td>
                    <td>{unplacedReason(p, stock, margin, allowRotation)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {unplacedTable.rows.length === 0 && <p className="muted">No unplaced parts match "{unplacedTable.query}".</p>}
          </div>
        </>
      )}
    </div>
  );
}
