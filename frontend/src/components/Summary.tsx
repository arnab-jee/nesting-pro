import type { OptResult, Part, StockBoard } from "../types";

interface Props {
  result: OptResult;
  stock: StockBoard[];
}

// The backend's OptResult carries the unplaced Part but no reason string (see the M7 plan) —
// approximate one client-side by comparing against the matching stock board's raw dimensions.
// This ignores margin/kerf/spacing precision; it's a human-readable hint, not a recomputation.
function unplacedReason(part: Part, stock: StockBoard[]): string {
  const board = stock.find((b) => b.material === part.material && b.thickness === part.thickness);
  if (!board) return "no matching stock board configured for this material/thickness";
  const fitsUnrotated = part.cutLength <= board.length && part.cutWidth <= board.width;
  const fitsRotated = part.grain === "none" && part.cutWidth <= board.length && part.cutLength <= board.width;
  if (!fitsUnrotated && !fitsRotated) {
    return `larger than an empty ${board.length}×${board.width}mm board even before margins`;
  }
  return "did not fit alongside the rest of the job";
}

export function Summary({ result, stock }: Props) {
  const avgUtilization =
    result.sheets.length > 0
      ? result.sheets.reduce((sum, s) => sum + s.utilizationPct, 0) / result.sheets.length
      : 0;

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
                <td>{unplacedReason(p, stock)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
