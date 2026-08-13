import type { Margin, StockBoard, TargetMachine } from "../types";

interface Props {
  target: TargetMachine;
  margin: Margin;
  onMarginChange: (margin: Margin) => void;
  stock: StockBoard[];
  onStockChange: (stock: StockBoard[]) => void;
  kerf: number;
  onKerfChange: (kerf: number) => void;
  toolDiameter: number;
  onToolDiameterChange: (v: number) => void;
  partSpacing: number;
  onPartSpacingChange: (v: number) => void;
  allowRotation: boolean;
  onAllowRotationChange: (v: boolean) => void;
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
}: Props) {
  function updateStockDim(index: number, field: "length" | "width", value: number) {
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
        <legend className="params-section__title">Stock boards</legend>
        <table>
          <thead>
            <tr>
              <th>Material</th>
              <th>Thickness</th>
              <th>Length</th>
              <th>Width</th>
            </tr>
          </thead>
          <tbody>
            {stock.map((board, i) => (
              <tr key={`${board.material}-${board.thickness}`}>
                <td>{board.material}</td>
                <td>{board.thickness}</td>
                <td>
                  <input type="number" value={board.length} onChange={(e) => updateStockDim(i, "length", Number(e.target.value))} />
                </td>
                <td>
                  <input type="number" value={board.width} onChange={(e) => updateStockDim(i, "width", Number(e.target.value))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </fieldset>
    </div>
  );
}
