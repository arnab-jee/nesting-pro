import type { Margin, OptResult, Part, StockBoard } from "../types";

interface Props {
  result: OptResult;
  stock: StockBoard[];
  margin: Margin;
  allowRotation: boolean;
}

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
function unplacedReason(part: Part, stock: StockBoard[], margin: Margin, allowRotation: boolean): string {
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
      {result.unplaced.length > 0 && (
        <table className="unplaced-table">
          <thead>
            <tr>
              <th>Barcode</th>
              <th>Material</th>
              <th>Cut size</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {result.unplaced.map((p) => (
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
      )}
    </div>
  );
}
