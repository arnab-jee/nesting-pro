import type { CostUnit, Margin, StockBoardWithCost, TargetMachine, WasteStrategy } from "../types";

interface Props {
  target: TargetMachine;
  margin: Margin;
  onMarginChange: (margin: Margin) => void;
  stock: StockBoardWithCost[];
  onStockChange: (stock: StockBoardWithCost[]) => void;
  kerf: number;
  onKerfChange: (kerf: number) => void;
  toolDiameter: number;
  onToolDiameterChange: (v: number) => void;
  partSpacing: number;
  onPartSpacingChange: (v: number) => void;
  allowRotation: boolean;
  onAllowRotationChange: (v: boolean) => void;
  wasteStrategy: WasteStrategy;
  onWasteStrategyChange: (v: WasteStrategy) => void;
  showCutLines: boolean;
  onShowCutLinesChange: (v: boolean) => void;
}

export function ParamsPanel({
  target,
  margin,
  onMarginChange,
  stock,
  onStockChange,
  kerf,
  onKerfChange,
  toolDiameter,
  onToolDiameterChange,
  partSpacing,
  onPartSpacingChange,
  allowRotation,
  onAllowRotationChange,
  wasteStrategy,
  onWasteStrategyChange,
  showCutLines,
  onShowCutLinesChange,
}: Props) {
  function updateStockField<K extends keyof StockBoardWithCost>(index: number, field: K, value: StockBoardWithCost[K]) {
    const next = stock.slice();
    next[index] = { ...next[index], [field]: value };
    onStockChange(next);
  }

  return (
    <div className="params-panel">
      <h2>Parameters</h2>

      <fieldset className="params-section">
        <legend className="params-section__title">Margin (mm)</legend>
        <div className="field-grid field-grid--4">
          {(["top", "right", "bottom", "left"] as const).map((side) => (
            <label className="field" key={side}>
              <span className="field__label">{side}</span>
              <input
                type="number"
                value={margin[side]}
                onChange={(e) => onMarginChange({ ...margin, [side]: Number(e.target.value) })}
              />
            </label>
          ))}
        </div>
      </fieldset>

      {target === "saw" ? (
        <fieldset className="params-section">
          <legend className="params-section__title">Saw</legend>
          <div className="field-grid field-grid--2">
            <label className="field">
              <span className="field__label">Kerf (mm)</span>
              <input type="number" value={kerf} onChange={(e) => onKerfChange(Number(e.target.value))} />
            </label>
            <label className="field field--checkbox">
              <input type="checkbox" checked={allowRotation} onChange={(e) => onAllowRotationChange(e.target.checked)} />
              <span className="field__label">Allow rotation (grain-free parts only)</span>
            </label>
            <label className="field field--checkbox">
              <input type="checkbox" checked={showCutLines} onChange={(e) => onShowCutLinesChange(e.target.checked)} />
              <span className="field__label">Show cut lines</span>
            </label>
          </div>
        </fieldset>
      ) : (
        <fieldset className="params-section">
          <legend className="params-section__title">Nanxing</legend>
          <div className="field-grid field-grid--2">
            <label className="field">
              <span className="field__label">Tool Ø (mm)</span>
              <input type="number" value={toolDiameter} onChange={(e) => onToolDiameterChange(Number(e.target.value))} />
            </label>
            <label className="field">
              <span className="field__label">Part spacing (mm)</span>
              <input type="number" value={partSpacing} onChange={(e) => onPartSpacingChange(Number(e.target.value))} />
            </label>
          </div>
        </fieldset>
      )}

      <fieldset className="params-section">
        <legend className="params-section__title">Wastage</legend>
        <div className="field-grid field-grid--2">
          <label className="field">
            <span className="field__label">Waste placement</span>
            <select value={wasteStrategy} onChange={(e) => onWasteStrategyChange(e.target.value as WasteStrategy)}>
              <option value="balanced">Balanced (tightest local fit)</option>
              <option value="edge">Push wastage to edges</option>
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset className="params-section">
        <legend className="params-section__title">Stock boards</legend>
        <table>
          <thead>
            <tr>
              <th>Material</th>
              <th>Thickness</th>
              <th>Length</th>
              <th>Width</th>
              <th>Cost (₹)</th>
              <th>Cost unit</th>
            </tr>
          </thead>
          <tbody>
            {stock.map((board, i) => (
              <tr key={`${board.material}-${board.thickness}`}>
                <td>{board.material}</td>
                <td>{board.thickness}</td>
                <td>
                  <input type="number" value={board.length} onChange={(e) => updateStockField(i, "length", Number(e.target.value))} />
                </td>
                <td>
                  <input type="number" value={board.width} onChange={(e) => updateStockField(i, "width", Number(e.target.value))} />
                </td>
                <td>
                  <input type="number" min="0" step="0.01" value={board.cost} onChange={(e) => updateStockField(i, "cost", Number(e.target.value))} />
                </td>
                <td>
                  <select value={board.costUnit} onChange={(e) => updateStockField(i, "costUnit", e.target.value as CostUnit)}>
                    <option value="board">₹ per board</option>
                    <option value="sqft">₹ per sqft</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </fieldset>
    </div>
  );
}
